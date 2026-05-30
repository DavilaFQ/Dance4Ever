#!/usr/bin/env node
/**
 * Dance4ever — Exportador Automático Diario
 * ==========================================
 * Descarga todos los registros del evento más reciente (o el especificado
 * con EVENT_ID=...) y los guarda como Excel + JSON en la carpeta de salida.
 *
 * Uso:
 *   node scripts/export-daily.mjs
 *
 * Con variables de entorno opcionales:
 *   OUTPUT_DIR=/ruta/de/salida            (default: ./exports)
 *   EVENT_ID=uuid-del-evento              (default: evento más reciente)
 *   SUPABASE_URL=https://...              (default: el del proyecto)
 *   SUPABASE_SERVICE_KEY=eyJ...           (requerida)
 *
 * Para automatizar diariamente (cron):
 *   Agrega esta línea en `crontab -e`:
 *   0 8 * * * SUPABASE_SERVICE_KEY=eyJ... node /ruta/dance4ever/scripts/export-daily.mjs
 */

import { createClient }  from '@supabase/supabase-js'
import { createRequire } from 'module'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, resolve }  from 'path'

const require = createRequire(import.meta.url)

// ─── Configuración ────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wlxugmitajxsjilffecu.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const OUTPUT_DIR   = resolve(process.env.OUTPUT_DIR || './exports')
const TARGET_EVENT = process.env.EVENT_ID || null

if (!SUPABASE_KEY) {
  console.error('❌ Falta SUPABASE_SERVICE_KEY')
  console.error('   Uso: SUPABASE_SERVICE_KEY=eyJ... node scripts/export-daily.mjs')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0') }

function todayStamp() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}

function fmtMXN(n) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN',
    minimumFractionDigits: 0,
  }).format(n ?? 0)
}

const MODALITY_LABELS = {
  solista: 'Solista', dueto: 'Dueto', trio: 'Trío', grupal: 'Grupal',
}

const CATEGORY_LABELS = {
  tiny: 'Tiny', mini: 'Mini', elementary: 'Elementary',
  junior: 'Junior', senior: 'Senior', college: 'College', open: 'Open',
}

const DEFAULT_PAQUETE    = 2700
const DEFAULT_REP        = 500
const DEFAULT_ASISTENTE  = 400
const DEFAULT_ENTRADA_T  = 500
const DEFAULT_ENTRADA_L  = 600
const DANCERS_POR_GRATIS = 8

function calcCosto(reg, event) {
  const paq    = reg.cost_paquete  ?? event.default_cost_paquete  ?? DEFAULT_PAQUETE
  const rep    = reg.cost_repeticion ?? event.default_cost_repeticion ?? DEFAULT_REP
  const asisC  = event.cost_asistente ?? DEFAULT_ASISTENTE
  const entT   = event.cost_entrada_temprana ?? DEFAULT_ENTRADA_T
  const entL   = event.cost_entrada_tardia   ?? DEFAULT_ENTRADA_L
  const dpag   = event.dancers_por_asistente_gratis ?? DANCERS_POR_GRATIS

  // Precio de entrada según deadline
  let precioEntrada = entT
  if (event.deadline_precio_entrada) {
    const dl = new Date(event.deadline_precio_entrada.slice(0,10) + 'T23:59:59')
    if (new Date() > dl) precioEntrada = entL
  }

  // Contar participaciones por bailarín
  const counts = new Map()
  for (const act of reg.acts ?? []) {
    for (const did of act.dancer_ids ?? []) {
      counts.set(did, (counts.get(did) ?? 0) + 1)
    }
  }

  let total = 0
  for (const dancer of reg.dancers ?? []) {
    total += paq
    const n = counts.get(dancer.id) ?? 0
    if (n > 1) total += (n - 1) * rep
  }

  const asistentes  = (reg.extra_coaches ?? []).filter(s => s.startsWith('Asistente:')).length
  const freeEntries = Math.floor((reg.dancers?.length ?? 0) / dpag)
  total += Math.max(0, asistentes - freeEntries) * asisC
  total += (reg.tickets_count ?? 0) * precioEntrada

  return { total, precioEntrada, paq, rep }
}

// ─── Fetch de datos ──────────────────────────────────────────────────────────

async function fetchEvent() {
  if (TARGET_EVENT) {
    const { data, error } = await supabase
      .from('events').select('*').eq('id', TARGET_EVENT).single()
    if (error) throw new Error(`Evento no encontrado: ${error.message}`)
    return data
  }
  const { data, error } = await supabase
    .from('events').select('*').order('created_at', { ascending: false }).limit(1).single()
  if (error) throw new Error(`Sin eventos: ${error.message}`)
  return data
}

async function fetchRegistrations(eventId) {
  const { data: regs, error: regErr } = await supabase
    .from('coach_registrations')
    .select('*')
    .eq('event_id', eventId)
    .order('submitted_at', { ascending: true })

  if (regErr) throw new Error(`Error cargando registros: ${regErr.message}`)

  const ids = regs.map(r => r.id)
  if (ids.length === 0) return []

  const { data: dancers, error: dErr } = await supabase
    .from('registration_dancers')
    .select('*')
    .in('registration_id', ids)
    .order('order_idx')

  const { data: acts, error: aErr } = await supabase
    .from('registration_acts')
    .select('*')
    .in('registration_id', ids)
    .order('order_idx')

  if (dErr) throw new Error(`Error cargando bailarines: ${dErr.message}`)
  if (aErr) throw new Error(`Error cargando coreografías: ${aErr.message}`)

  return regs.map(r => ({
    ...r,
    dancers: dancers.filter(d => d.registration_id === r.id),
    acts:    acts.filter(a => a.registration_id === r.id),
  }))
}

// ─── Generar Excel ───────────────────────────────────────────────────────────

async function buildExcel(event, regs) {
  // Cargamos ExcelJS dinámicamente (ya está en node_modules)
  const ExcelJS = require('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator  = 'Dance4ever'
  wb.created  = new Date()

  // ── Hoja 1: Resumen de registros ─────────────────────────────────────────
  const wsRes = wb.addWorksheet('Registros', { views: [{ state: 'frozen', ySplit: 1 }] })

  wsRes.columns = [
    { header: '#',             key: 'id',           width: 6  },
    { header: 'Estado',        key: 'estado',        width: 13 },
    { header: 'Academia',      key: 'academy',       width: 32 },
    { header: 'Coach',         key: 'coach',         width: 22 },
    { header: 'Teléfono',      key: 'phone',         width: 14 },
    { header: 'Email',         key: 'email',         width: 28 },
    { header: 'Asistentes',    key: 'asistentes',    width: 12 },
    { header: 'Bailarines',    key: 'dancers',       width: 12 },
    { header: 'Coreografías',  key: 'acts',          width: 14 },
    { header: 'Boletos',       key: 'tickets',       width: 10 },
    { header: 'Total Costo',   key: 'costo',         width: 14 },
    { header: 'Pagado',        key: 'pagado',        width: 12 },
    { header: 'Saldo',         key: 'saldo',         width: 12 },
    { header: 'Notas',         key: 'notes',         width: 30 },
    { header: 'Enviado',       key: 'submitted',     width: 18 },
    { header: 'Confirmado',    key: 'confirmed',     width: 18 },
  ]

  // Estilo encabezado
  wsRes.getRow(1).eachCell(cell => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1a1a' } }
    cell.font   = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFd946ef' } } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  let totalCosto = 0, totalPagado = 0, totalBailarines = 0, totalCoreos = 0, totalBoletos = 0

  for (const reg of regs) {
    const { total } = calcCosto(reg, event)
    const pagado    = reg.paid ?? 0
    const estado    = reg.confirmed_at ? 'CONFIRMADO' : 'PENDIENTE'
    const asistentes = (reg.extra_coaches ?? []).filter(s => s.startsWith('Asistente:')).length

    totalCosto      += total
    totalPagado     += pagado
    totalBailarines += reg.dancers.length
    totalCoreos     += reg.acts.length
    totalBoletos    += reg.tickets_count ?? 0

    const row = wsRes.addRow({
      id:         reg.id,
      estado,
      academy:    reg.academy,
      coach:      reg.coach_name,
      phone:      reg.coach_phone,
      email:      reg.coach_email ?? '',
      asistentes,
      dancers:    reg.dancers.length,
      acts:       reg.acts.length,
      tickets:    reg.tickets_count ?? 0,
      costo:      total,
      pagado,
      saldo:      total - pagado,
      notes:      reg.notes ?? '',
      submitted:  reg.submitted_at ? new Date(reg.submitted_at).toLocaleString('es-MX') : '',
      confirmed:  reg.confirmed_at ? new Date(reg.confirmed_at).toLocaleString('es-MX') : '—',
    })

    // Color por estado
    const bgColor = reg.confirmed_at ? 'FFf0fdf4' : 'FFfffbeb'
    row.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
      cell.font = { size: 9 }
      cell.alignment = { vertical: 'middle' }
    })

    // Montos en rojo si hay saldo
    if (total - pagado > 0) {
      row.getCell('saldo').font = { size: 9, color: { argb: 'FFdc2626' }, bold: true }
    }
  }

  // Fila de totales
  const totalRow = wsRes.addRow({
    id: '', estado: 'TOTALES', academy: `${regs.length} academias`,
    coach: '', phone: '', email: '',
    asistentes: '',
    dancers:    totalBailarines,
    acts:       totalCoreos,
    tickets:    totalBoletos,
    costo:      totalCosto,
    pagado:     totalPagado,
    saldo:      totalCosto - totalPagado,
    notes: '', submitted: '', confirmed: '',
  })
  totalRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1a1a' } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }
    cell.alignment = { vertical: 'middle' }
  })

  // ── Hoja 2: Bailarines por academia ─────────────────────────────────────
  const wsDancers = wb.addWorksheet('Bailarines', { views: [{ state: 'frozen', ySplit: 1 }] })
  wsDancers.columns = [
    { header: 'Reg #',       key: 'regId',     width: 8  },
    { header: 'Academia',    key: 'academy',   width: 30 },
    { header: 'Coach',       key: 'coach',     width: 20 },
    { header: 'Bailarín',    key: 'name',      width: 28 },
    { header: 'Nacimiento',  key: 'birthdate', width: 14 },
    { header: 'Categoría',   key: 'category',  width: 13 },
    { header: 'Coreografías', key: 'coreos',   width: 14 },
    { header: 'Modalidades', key: 'modalities',width: 35 },
  ]
  wsDancers.getRow(1).eachCell(cell => {
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1a1a' } }
    cell.font  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFd946ef' } } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  for (const reg of regs) {
    for (const dancer of reg.dancers) {
      const myActs = reg.acts.filter(a => (a.dancer_ids ?? []).includes(dancer.id))
      const modalities = myActs.map(a =>
        `${MODALITY_LABELS[a.modality] ?? a.modality} ${a.style ?? ''} (${CATEGORY_LABELS[a.age_category] ?? a.age_category ?? ''})`
      ).join(' | ')

      const row = wsDancers.addRow({
        regId:      reg.id,
        academy:    reg.academy,
        coach:      reg.coach_name,
        name:       dancer.name,
        birthdate:  dancer.birthdate ?? '',
        category:   CATEGORY_LABELS[dancer.category] ?? dancer.category ?? '',
        coreos:     myActs.length,
        modalities,
      })
      row.eachCell(cell => {
        cell.font = { size: 9 }
        cell.alignment = { vertical: 'middle' }
      })
    }
  }

  // ── Hoja 3: Coreografías ─────────────────────────────────────────────────
  const wsActs = wb.addWorksheet('Coreografías', { views: [{ state: 'frozen', ySplit: 1 }] })
  wsActs.columns = [
    { header: 'Reg #',      key: 'regId',     width: 8  },
    { header: 'Academia',   key: 'academy',   width: 30 },
    { header: 'Modalidad',  key: 'modality',  width: 12 },
    { header: 'Categoría',  key: 'category',  width: 13 },
    { header: 'Nivel',      key: 'level',     width: 10 },
    { header: 'Estilo',     key: 'style',     width: 14 },
    { header: 'Bailarines', key: 'dancers',   width: 12 },
  ]
  wsActs.getRow(1).eachCell(cell => {
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1a1a1a' } }
    cell.font  = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFd946ef' } } }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  for (const reg of regs) {
    for (const act of reg.acts) {
      const row = wsActs.addRow({
        regId:    reg.id,
        academy:  reg.academy,
        modality: MODALITY_LABELS[act.modality] ?? act.modality,
        category: CATEGORY_LABELS[act.age_category] ?? act.age_category ?? '',
        level:    act.level === 'avanzado' ? 'Avanzado' : (act.level === 'basico' ? 'Básico' : ''),
        style:    act.style ?? '',
        dancers:  (act.dancer_ids ?? []).length,
      })
      row.eachCell(cell => {
        cell.font = { size: 9 }
        cell.alignment = { vertical: 'middle' }
      })
    }
  }

  return wb
}

// ─── Guardar JSON ─────────────────────────────────────────────────────────────

function buildJSON(event, regs) {
  return {
    exportado_el:  new Date().toISOString(),
    evento: {
      id:     event.id,
      nombre: event.name,
      fecha:  event.date,
    },
    resumen: {
      total_registros:  regs.length,
      confirmados:      regs.filter(r => r.confirmed_at).length,
      pendientes:       regs.filter(r => !r.confirmed_at).length,
      total_bailarines: regs.reduce((s, r) => s + r.dancers.length, 0),
      total_coreos:     regs.reduce((s, r) => s + r.acts.length, 0),
      total_boletos:    regs.reduce((s, r) => s + (r.tickets_count ?? 0), 0),
    },
    registros: regs.map(r => {
      const { total } = calcCosto(r, event)
      return {
        id:             r.id,
        estado:         r.confirmed_at ? 'confirmado' : 'pendiente',
        academia:       r.academy,
        coach:          r.coach_name,
        telefono:       r.coach_phone,
        email:          r.coach_email,
        asistentes:     (r.extra_coaches ?? []).filter(s => s.startsWith('Asistente:')),
        num_bailarines: r.dancers.length,
        num_coreos:     r.acts.length,
        boletos:        r.tickets_count ?? 0,
        costo_total:    total,
        pagado:         r.paid ?? 0,
        saldo:          total - (r.paid ?? 0),
        notas:          r.notes,
        enviado_el:     r.submitted_at,
        confirmado_el:  r.confirmed_at,
        bailarines:     r.dancers.map(d => ({
          id:        d.id,
          nombre:    d.name,
          nacimiento:d.birthdate,
          categoria: CATEGORY_LABELS[d.category] ?? d.category,
        })),
        coreografias: r.acts.map(a => ({
          modalidad:  MODALITY_LABELS[a.modality] ?? a.modality,
          categoria:  CATEGORY_LABELS[a.age_category] ?? a.age_category,
          nivel:      a.level,
          estilo:     a.style,
          bailarines: a.dancer_ids?.length ?? 0,
        })),
      }
    }),
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const stamp = todayStamp()
  console.log(`📦 Dance4ever — Exportación Diaria [${stamp}]`)
  console.log(`📁 Carpeta de salida: ${OUTPUT_DIR}\n`)

  // Crear carpeta si no existe
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
    console.log(`   ✅ Carpeta creada: ${OUTPUT_DIR}`)
  }

  // Cargar evento
  console.log('🔍 Cargando evento...')
  const event = await fetchEvent()
  console.log(`   Evento: ${event.name} (${event.date})`)

  // Cargar registros completos
  console.log('📋 Cargando registros...')
  const regs = await fetchRegistrations(event.id)
  console.log(`   ${regs.length} registros | ${regs.filter(r=>r.confirmed_at).length} confirmados`)
  console.log(`   ${regs.reduce((s,r)=>s+r.dancers.length,0)} bailarines | ${regs.reduce((s,r)=>s+r.acts.length,0)} coreografías`)

  if (regs.length === 0) {
    console.log('\n⚠️  No hay registros todavía. Exportación omitida.')
    return
  }

  // ── Excel ────────────────────────────────────────────────────────────────
  console.log('\n📊 Generando Excel...')
  const wb = await buildExcel(event, regs)
  const safeEventName = event.name
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const xlsxName = `dance4ever-${safeEventName}-${stamp}.xlsx`
  const xlsxPath = join(OUTPUT_DIR, xlsxName)
  await wb.xlsx.writeFile(xlsxPath)
  console.log(`   ✅ Excel: ${xlsxPath}`)

  // ── JSON ────────────────────────────────────────────────────────────────
  console.log('📄 Generando JSON...')
  const jsonData = buildJSON(event, regs)
  const jsonName = `dance4ever-${safeEventName}-${stamp}.json`
  const jsonPath = join(OUTPUT_DIR, jsonName)
  writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf8')
  console.log(`   ✅ JSON: ${jsonPath}`)

  // ── Resumen final ────────────────────────────────────────────────────────
  const totalCosto   = regs.reduce((s,r) => s + calcCosto(r,event).total, 0)
  const totalPagado  = regs.reduce((s,r) => s + (r.paid ?? 0), 0)
  const totalSaldo   = totalCosto - totalPagado

  console.log('\n─────────────────────────────────────────')
  console.log(`✅ Exportación completada: ${stamp}`)
  console.log(`   Registros  : ${regs.length} (${regs.filter(r=>r.confirmed_at).length} confirmados)`)
  console.log(`   Bailarines : ${regs.reduce((s,r)=>s+r.dancers.length,0)}`)
  console.log(`   Coreografías: ${regs.reduce((s,r)=>s+r.acts.length,0)}`)
  console.log(`   Ingresos   : $${totalCosto.toLocaleString('es-MX')} MXN`)
  console.log(`   Cobrado    : $${totalPagado.toLocaleString('es-MX')} MXN`)
  console.log(`   Por cobrar : $${totalSaldo.toLocaleString('es-MX')} MXN`)
  console.log('─────────────────────────────────────────')
}

main().catch(err => {
  console.error('\n❌ Error fatal:', err.message)
  process.exit(1)
})
