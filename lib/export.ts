import { Event, Participant, Coach, Modality, AgeCategory, Level, AGE_CATEGORY_ORDER, AGE_CATEGORY_LABELS, supabase } from '@/lib/supabase'
import { toDate, toEndOfDay } from '@/lib/date'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import JSZip from 'jszip'
import { generateReceiptPDFDoc, generateCartaPDFDoc } from '@/lib/pdf'
import { State } from '@/components/register/types'

// ─── Precios (mirror exacto de page.tsx) ───────────────────────────────────
const PRECIO_INSCRIPCION = 2700
const PRECIO_ADICIONAL_COREOGRAFIA = 500
const PRECIO_ASISTENTE = 400
const PRECIO_ENTRADA_TEMPRANA = 500
const PRECIO_ENTRADA_TARDIA  = 600
const DANCERS_POR_ENTRADA_GRATIS = 8

// ─── Tipos de base de datos ─────────────────────────────────────────────────
type Status = 'PRESENTADO' | 'EN ESCENARIO' | 'PENDIENTE'

type DancerRow = {
  id: number
  registration_id: number
  name: string
  birthdate: string
  category: AgeCategory | null
  category_manual: boolean | null
  order_idx: number
}

type ActRow = {
  id: number
  registration_id: number
  modality: Modality
  age_category: AgeCategory | null
  level: Level | null
  style: string
  order_idx: number
  dancer_ids: number[]
}

type RegRow = {
  id: number
  coach_name: string
  coach_phone: string
  coach_email: string | null
  // extra_coaches contiene asistentes codificados como "Asistente: Nombre"
  extra_coaches: string[]
  // academy en BD = "NombreAcademia (Ciudad)"
  academy: string
  // team_name en BD = solo el nombre de la academia (sin ciudad)
  team_name: string
  cost_paquete: number | null
  cost_repeticion: number | null
  confirmed_at: string | null
  tickets_count: number | null
  notes?: string | null
  signature?: string | null
  dancers: DancerRow[]
  acts: ActRow[]
}

// ─── Helpers genéricos ───────────────────────────────────────────────────────
function safeFilename(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'evento'
}

function pad(n: number): string { return n.toString().padStart(2, '0') }

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

function ageAtDate(birthdate: string, refDate: Date): number {
  if (!birthdate) return 0
  const b = new Date(birthdate)
  if (isNaN(b.getTime())) return 0
  let age = refDate.getFullYear() - b.getFullYear()
  const mo = refDate.getMonth() - b.getMonth()
  if (mo < 0 || (mo === 0 && refDate.getDate() < b.getDate())) age--
  return Math.max(0, age)
}

function firstAndApellido(fullName: string): string {
  const tokens = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length <= 2) return tokens.join(' ')
  return tokens.slice(0, 2).join(' ')
}

function modalidadOf(m: Modality): string {
  if (m === 'solista') return 'Solista'
  if (m === 'dueto') return 'Dueto'
  if (m === 'trio') return 'Trío'
  return 'Grupal'
}

function nivelOf(m: Modality, level: Level | null): string {
  if (m === 'grupal') return level === 'basico' ? 'Básico' : 'Avanzado'
  return 'Avanzado'
}

function autoCategoryFromAge(age: number): AgeCategory {
  if (age <= 5) return 'tiny'
  if (age <= 8) return 'mini'
  if (age <= 11) return 'elementary'
  if (age <= 14) return 'junior'
  if (age <= 17) return 'senior'
  if (age <= 21) return 'college'
  return 'open'
}

function formatDateLong(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return iso
  }
}

function formatBirthdate(iso: string): string {
  if (!iso) return ''
  try {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  } catch {
    return iso
  }
}

function statusFor(p: Participant, currentPos: number): Status {
  if (p.position < currentPos) return 'PRESENTADO'
  if (p.position === currentPos) return 'EN ESCENARIO'
  return 'PENDIENTE'
}

// ─── Parsear academia y ciudad desde el string guardado en BD ───────────────
// BD guarda: "Academia (Ciudad)" en el campo academy
// team_name guarda: sólo el nombre de academia
function parseAcademyCity(academyField: string, teamName: string): { academy: string; city: string } {
  const match = academyField.match(/^(.*?)\s*\(([^)]+)\)$/)
  if (match) {
    return { academy: match[1].trim(), city: match[2].trim() }
  }
  // Fallback: si no hay ciudad entre paréntesis, usar team_name como academia
  return { academy: teamName || academyField, city: '' }
}

// ─── Parsear asistentes desde extra_coaches ──────────────────────────────────
// extra_coaches contiene strings como "Asistente: Nombre"
function parseAssistants(extraCoaches: string[]): string[] {
  return extraCoaches
    .filter(s => s.startsWith('Asistente:'))
    .map(s => s.replace(/^Asistente:\s*/, '').trim())
    .filter(Boolean)
}

// ─── Cálculo de costo total por registro (espejo de page.tsx) ────────────────
function regTotalCost(r: RegRow, refDate: Date, event: Event): number {
  const paq = r.cost_paquete ?? event.default_cost_paquete ?? PRECIO_INSCRIPCION
  const rep = r.cost_repeticion ?? event.default_cost_repeticion ?? PRECIO_ADICIONAL_COREOGRAFIA
  const ticketDeadline = toEndOfDay(event.deadline_precio_entrada)
  const precioEntrada = ticketDeadline
    ? (refDate <= ticketDeadline
      ? (event.cost_entrada_temprana ?? PRECIO_ENTRADA_TEMPRANA)
      : (event.cost_entrada_tardia ?? PRECIO_ENTRADA_TARDIA))
    : (event.cost_entrada_temprana ?? PRECIO_ENTRADA_TEMPRANA)

  // Participaciones por alumno
  const counts = new Map<number, number>()
  r.acts.forEach(a => {
    if (a.modality === 'grupal') {
      r.dancers.forEach(d => counts.set(d.id, (counts.get(d.id) ?? 0) + 1))
    } else {
      a.dancer_ids.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1))
    }
  })

  let total = 0
  // Costo por alumno
  r.dancers.forEach(d => {
    const n = counts.get(d.id) ?? 0
    total += paq
    if (true) {
      if (n > 1) total += (n - 1) * rep
    } else {
      total += n * rep
    }
  })

  // Asistentes
  const filledDancers = r.dancers.length
  const assistants = parseAssistants(r.extra_coaches)
  const freeEntries = Math.floor(filledDancers / (event.dancers_por_asistente_gratis ?? DANCERS_POR_ENTRADA_GRATIS))
  const paidAssistants = Math.max(0, assistants.length - freeEntries)
  total += paidAssistants * (event.cost_asistente ?? PRECIO_ASISTENTE)

  // Boletos de acompañantes
  const tickets = r.tickets_count ?? 0
  total += tickets * precioEntrada

  return total
}

// ─── Costo por alumno (espejo de page.tsx) ───────────────────────────────────
function dancerCost(dancerId: number, counts: Map<number, number>, paq: number, rep: number): number {
  const n = counts.get(dancerId) ?? 0
  return paq + (n > 1 ? (n - 1) * rep : 0)
}

const MODALITY_ORDER: Modality[] = ['solista', 'dueto', 'trio', 'grupal']
const LEVEL_ORDER: Level[] = ['basico', 'avanzado']

// ════════════════════════════════════════════════════════════════════════════
// exportRegistrations — Excel de registros (4 hojas)
// ════════════════════════════════════════════════════════════════════════════
export async function exportRegistrationsDoc(event: Event): Promise<ExcelJS.Workbook> {
  // ── 1. Cargar datos de BD ─────────────────────────────────────────────────
  const { data: regsRaw, error: regsErr } = await supabase
    .from('coach_registrations')
    .select('*')
    .eq('event_id', event.id)
  if (regsErr || !regsRaw) throw new Error(`No se pudieron cargar registros: ${regsErr?.message ?? 'desconocido'}`)

  const regs = (regsRaw as Array<{
    id: number
    coach_name: string
    coach_phone: string
    coach_email: string | null
    extra_coaches: string[] | null
    academy: string
    team_name: string
    cost_paquete: number | null
    cost_repeticion: number | null
    confirmed_at: string | null
    tickets_count: number | null
    notes?: string | null
    signature?: string | null
  }>).filter(r => r.confirmed_at)

  if (regs.length === 0) throw new Error('No hay registros confirmados todavía.')

  const regIds = regs.map(r => r.id)
  const [{ data: dancersData }, { data: actsData }] = await Promise.all([
    supabase.from('registration_dancers').select('*').in('registration_id', regIds),
    supabase.from('registration_acts').select('*').in('registration_id', regIds),
  ]) as unknown as [{ data: DancerRow[] | null }, { data: ActRow[] | null }]

  const dancersByReg = new Map<number, DancerRow[]>()
  ;(dancersData ?? []).forEach(d => {
    const arr = dancersByReg.get(d.registration_id) ?? []
    arr.push(d)
    dancersByReg.set(d.registration_id, arr)
  })
  const actsByReg = new Map<number, ActRow[]>()
  ;(actsData ?? []).forEach(a => {
    const arr = actsByReg.get(a.registration_id) ?? []
    arr.push(a)
    actsByReg.set(a.registration_id, arr)
  })

  const fullRegs: RegRow[] = regs.map(r => ({
    id: r.id,
    coach_name: r.coach_name,
    coach_phone: r.coach_phone,
    coach_email: r.coach_email,
    extra_coaches: r.extra_coaches ?? [],
    academy: r.academy,
    team_name: r.team_name,
    cost_paquete: r.cost_paquete,
    cost_repeticion: r.cost_repeticion,
    confirmed_at: r.confirmed_at,
    tickets_count: r.tickets_count,
    notes: r.notes,
    signature: r.signature,
    dancers: (dancersByReg.get(r.id) ?? []).sort((a, b) => a.order_idx - b.order_idx),
    acts: (actsByReg.get(r.id) ?? []).sort((a, b) => a.order_idx - b.order_idx),
  }))

  // ── 2. Construir lista plana de actos ─────────────────────────────────────
  const refDate = toDate(event.date) || new Date()

  type FlatAct = {
    modality: Modality
    ageCategory: AgeCategory | null
    level: Level | null
    style: string
    avgAge: number
    nameOrEquipo: string
    coach: string
    academy: string
    city: string
    dancerNames: string
    dancerCount: number
    teamName: string
  }

  const flat: FlatAct[] = []
  for (const reg of fullRegs) {
    const { academy, city } = parseAcademyCity(reg.academy, reg.team_name)
    const dancerById = new Map(reg.dancers.map(d => [d.id, d]))

    for (const act of reg.acts) {
      const isSDT = act.modality === 'solista' || act.modality === 'dueto' || act.modality === 'trio'
      let dancersInAct: DancerRow[]
      if (isSDT) {
        dancersInAct = act.dancer_ids
          .map(id => dancerById.get(id))
          .filter((d): d is DancerRow => d !== undefined)
      } else {
        dancersInAct = reg.dancers
      }

      const ages = dancersInAct.map(d => ageAtDate(d.birthdate, refDate)).filter(a => a > 0)
      const avgAge = ages.length > 0 ? ages.reduce((s, a) => s + a, 0) / ages.length : 0

      const nameOrEquipo = isSDT
        ? dancersInAct.map(d => firstAndApellido(d.name)).join(' & ')
        : reg.team_name || academy

      flat.push({
        modality: act.modality,
        ageCategory: act.age_category,
        level: act.level,
        style: act.style ?? '',
        avgAge,
        nameOrEquipo,
        coach: reg.coach_name,
        academy,
        city,
        dancerNames: dancersInAct.map(d => d.name).join(', '),
        dancerCount: dancersInAct.length,
        teamName: reg.team_name || academy,
      })
    }
  }

  // Ordenar: Categoría → Modalidad → Nivel → Edad promedio
  flat.sort((a, b) => {
    const ca = a.ageCategory ? AGE_CATEGORY_ORDER.indexOf(a.ageCategory) : 99
    const cb = b.ageCategory ? AGE_CATEGORY_ORDER.indexOf(b.ageCategory) : 99
    if (ca !== cb) return ca - cb
    const ma = MODALITY_ORDER.indexOf(a.modality)
    const mb = MODALITY_ORDER.indexOf(b.modality)
    if (ma !== mb) return ma - mb
    if (a.modality === 'grupal' && b.modality === 'grupal') {
      const la = a.level ? LEVEL_ORDER.indexOf(a.level) : 99
      const lb = b.level ? LEVEL_ORDER.indexOf(b.level) : 99
      if (la !== lb) return la - lb
    }
    return a.avgAge - b.avgAge
  })

  // ── 3. Hoja PROGRAMA (vista limpia para el MC / coordinador de escenario) ──
  const programa = flat.map((a, i) => ({
    '#': i + 1,
    'Modalidad': modalidadOf(a.modality),
    'Categoría': a.ageCategory ? AGE_CATEGORY_LABELS[a.ageCategory] : '',
    'Nivel': nivelOf(a.modality, a.level),
    'Estilo': a.style,
    'Nombre / Equipo': a.nameOrEquipo,
    'Academia': a.academy,
    'Ciudad': a.city,
    'Coach': a.coach,
  }))

  // ── 4. Hoja DETALLE (información completa de cada acto) ────────────────────
  const detalle = flat.map((a, i) => ({
    '#': i + 1,
    'Modalidad': modalidadOf(a.modality),
    'Categoría': a.ageCategory ? AGE_CATEGORY_LABELS[a.ageCategory] : '',
    'Nivel': nivelOf(a.modality, a.level),
    'Estilo': a.style,
    'Nombre / Equipo': a.nameOrEquipo,
    'Academia': a.academy,
    'Ciudad': a.city,
    'Coach': a.coach,
    'No. Integrantes': a.dancerCount,
    'Edad promedio': a.avgAge > 0 ? Math.round(a.avgAge * 10) / 10 : '',
    'Integrantes del acto': a.dancerNames,
  }))

  // ── 5. Hoja EQUIPOS (una fila por registro / academia) ────────────────────
  const ticketDeadline = toEndOfDay(event.deadline_precio_entrada)
  const precioEntrada = ticketDeadline
    ? (new Date() <= ticketDeadline
      ? (event.cost_entrada_temprana ?? PRECIO_ENTRADA_TEMPRANA)
      : (event.cost_entrada_tardia ?? PRECIO_ENTRADA_TARDIA))
    : (event.cost_entrada_temprana ?? PRECIO_ENTRADA_TEMPRANA)

  const equipos = fullRegs.map(r => {
    const { academy, city } = parseAcademyCity(r.academy, r.team_name)
    const assistants = parseAssistants(r.extra_coaches)
    const freeEntries = Math.floor(r.dancers.length / (event.dancers_por_asistente_gratis ?? DANCERS_POR_ENTRADA_GRATIS))
    const paidAssistants = Math.max(0, assistants.length - freeEntries)
    const tickets = r.tickets_count ?? 0
    const total = regTotalCost(r, refDate, event)
    const confirmedDate = r.confirmed_at
      ? new Date(r.confirmed_at).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : ''

    return {
      'Coach': r.coach_name,
      'WhatsApp': r.coach_phone,
      'Correo': r.coach_email ?? '',
      'Asistentes': assistants.join(', '),
      'Asistentes gratuitos': freeEntries,
      'Asistentes a pagar': paidAssistants,
      'Academia': academy,
      'Ciudad': city,
      'No. Alumnos': r.dancers.length,
      'No. Coreografías': r.acts.length,
      'Boletos acompañantes': tickets,
      'Precio inscripción': r.cost_paquete ?? event.default_cost_paquete ?? PRECIO_INSCRIPCION,
      'Precio coreog. extra': r.cost_repeticion ?? event.default_cost_repeticion ?? PRECIO_ADICIONAL_COREOGRAFIA,
      'Precio asistente': event.cost_asistente ?? PRECIO_ASISTENTE,
      'Precio boleto': precioEntrada,
      'Total a pagar': total,
      'Registrado el': confirmedDate,
    }
  })

  // ── 6. Hoja INTEGRANTES (una fila por alumno, con costo individual) ────────
  const integrantes = fullRegs.flatMap(r => {
    const { academy, city } = parseAcademyCity(r.academy, r.team_name)
    const paq = r.cost_paquete ?? event.default_cost_paquete ?? PRECIO_INSCRIPCION
    const rep = r.cost_repeticion ?? event.default_cost_repeticion ?? PRECIO_ADICIONAL_COREOGRAFIA

    // Participaciones por alumno (ID)
    const counts = new Map<number, number>()
    r.acts.forEach(a => {
      if (a.modality === 'grupal') {
        r.dancers.forEach(d => counts.set(d.id, (counts.get(d.id) ?? 0) + 1))
      } else {
        a.dancer_ids.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1))
      }
    })

    // Nombres de actos en los que participa cada alumno
    const actNamesByDancer = new Map<number, string[]>()
    r.acts.forEach(act => {
      const isSDT = act.modality !== 'grupal'
      const participantes = isSDT ? act.dancer_ids : r.dancers.map(d => d.id)
      participantes.forEach(id => {
        const list = actNamesByDancer.get(id) ?? []
        const label = `${modalidadOf(act.modality)}${act.age_category ? ` ${AGE_CATEGORY_LABELS[act.age_category]}` : ''}${act.style ? ` – ${act.style}` : ''}`
        list.push(label)
        actNamesByDancer.set(id, list)
      })
    })

    return r.dancers.map(d => {
      const age = ageAtDate(d.birthdate, refDate)
      const autoCat = age > 0 ? autoCategoryFromAge(age) : null
      const effectiveCat = d.category as AgeCategory | null
      const manual = d.category_manual === true
      const n = counts.get(d.id) ?? 0
      const cost = dancerCost(d.id, counts, paq, rep)
      const actNames = actNamesByDancer.get(d.id) ?? []

      return {
        'Coach': r.coach_name,
        'Academia': academy,
        'Ciudad': city,
        'Alumno': d.name,
        'Fecha de nacimiento': formatBirthdate(d.birthdate),
        'Edad': age > 0 ? age : '',
        'Categoría calculada': autoCat ? AGE_CATEGORY_LABELS[autoCat] : '—',
        'Categoría usada': effectiveCat ? AGE_CATEGORY_LABELS[effectiveCat] : '—',
        'Categoría modificada': manual ? 'SÍ' : 'No',
        'No. participaciones': n,
        'Actos en los que participa': actNames.join(' | '),
        'Costo a pagar': cost,
      }
    })
  })

  // ── 7. Construir workbook y devolver ───────────────────────────────────────
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Dance4ever'
  wb.created = new Date()

  const moneyCols: Record<string, string[]> = {
    'Programa':     [],
    'Detalle':      [],
    'Equipos':      ['Precio inscripción', 'Precio coreog. extra', 'Precio asistente', 'Precio boleto', 'Total a pagar'],
    'Integrantes':  ['Costo a pagar'],
  }

  addStyledSheet(wb, 'Programa',    event.name, 'Programa del evento',         programa,    moneyCols['Programa'])
  addStyledSheet(wb, 'Detalle',     event.name, 'Detalle completo de actos',   detalle,     moneyCols['Detalle'])
  addStyledSheet(wb, 'Equipos',     event.name, 'Equipos / academias',         equipos,     moneyCols['Equipos'])
  addStyledSheet(wb, 'Integrantes', event.name, 'Integrantes registrados',     integrantes, moneyCols['Integrantes'])

  return wb
}

export async function exportRegistrations(event: Event): Promise<void> {
  const wb = await exportRegistrationsDoc(event)
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Registro Dance4ever - ${safeFilename(event.name)}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ════════════════════════════════════════════════════════════════════════════
// addStyledSheet — helper de formato
// ════════════════════════════════════════════════════════════════════════════
function addStyledSheet(
  wb: ExcelJS.Workbook,
  name: string,
  eventName: string,
  subtitle: string,
  data: Record<string, unknown>[],
  moneyColumnLabels: string[],
): void {
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: 'FFFBBF24' } },
    views: [{ state: 'frozen', ySplit: 3 }],
  })

  const headers = data.length > 0 ? Object.keys(data[0]) : []
  const colCount = Math.max(1, headers.length)
  // ExcelJS usa letras para columnas; para >26 cols usamos índices
  const lastColLetter = colCount <= 26
    ? String.fromCharCode(64 + colCount)
    : `A${String.fromCharCode(64 + colCount - 26)}`

  // Fila 1 — título
  ws.mergeCells(`A1:${lastColLetter}1`)
  const titleCell = ws.getCell('A1')
  titleCell.value = `DANCE4EVER · ${eventName.toUpperCase()}`
  titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFBBF24' } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } }
  ws.getRow(1).height = 32

  // Fila 2 — subtítulo
  ws.mergeCells(`A2:${lastColLetter}2`)
  const subCell = ws.getCell('A2')
  subCell.value = subtitle.toUpperCase()
  subCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFCCCCCC' } }
  subCell.alignment = { horizontal: 'center', vertical: 'middle' }
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F1F1F' } }
  ws.getRow(2).height = 22

  if (headers.length === 0) {
    ws.getCell('A3').value = 'Sin datos'
    return
  }

  // Fila 3 — encabezados
  ws.addRow([]) // fila placeholder para que addRow siguiente sea fila 3
  const headerRow = ws.getRow(3)
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBBF24' } }
    cell.border = {
      top:    { style: 'thin',   color: { argb: 'FF000000' } },
      bottom: { style: 'medium', color: { argb: 'FF000000' } },
      left:   { style: 'thin',   color: { argb: 'FF999999' } },
      right:  { style: 'thin',   color: { argb: 'FF999999' } },
    }
  })
  headerRow.height = 28

  // Filas de datos
  const moneyColIndices = new Set(
    moneyColumnLabels.map(label => headers.indexOf(label)).filter(i => i >= 0)
  )

  data.forEach((row, ri) => {
    const r = ws.addRow(headers.map(h => row[h]))
    const isAlt = ri % 2 === 1
    r.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const colIdx = colNumber - 1
      const val = row[headers[colIdx]]
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1F1F1F' } }
      cell.alignment = {
        vertical: 'middle',
        wrapText: true,
        horizontal: typeof val === 'number' ? 'right' : 'left',
      }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isAlt ? 'FFF6F4EC' : 'FFFFFFFF' },
      }
      cell.border = {
        top:    { style: 'thin', color: { argb: 'FFE5E5E5' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E5E5' } },
        left:   { style: 'thin', color: { argb: 'FFE5E5E5' } },
        right:  { style: 'thin', color: { argb: 'FFE5E5E5' } },
      }
      if (moneyColIndices.has(colIdx) && typeof cell.value === 'number') {
        cell.numFmt = '"$"#,##0.00'
      }
    })
    r.height = 22
  })

  // Auto-ajuste de anchos
  headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1)
    let maxLen = h.length
    data.forEach(row => {
      const v = row[h]
      const s = v == null ? '' : String(v)
      if (s.length > maxLen) maxLen = s.length
    })
    col.width = Math.min(60, Math.max(12, maxLen + 3))
  })
}

// ════════════════════════════════════════════════════════════════════════════
// exportExcel — Excel simple del programa en vivo (para el MC)
// ════════════════════════════════════════════════════════════════════════════
export function getExportExcelBuffer(event: Event, participants: Participant[], coaches: Coach[]): ArrayBuffer {
  const coachMap = new Map(coaches.map(c => [c.id, c.name]))
  const currentPos = event.current_position

  const programaData = participants.map(p => ({
    'Posición': p.position,
    'Nombre / Equipo': p.name,
    'Academia': p.academy ?? '',
    'Categoría': p.category ?? '',
    'Modalidad': p.type ?? '',
    'Estilo': p.style ?? '',
    'Coach': p.coach_id ? coachMap.get(p.coach_id) ?? '' : '',
    'Ciudad': p.city ?? '',
    'Estado': statusFor(p, currentPos),
  }))

  const presented = participants.filter(p => p.position < currentPos).length
  const pending = participants.filter(p => p.position > currentPos).length
  const startedAt = event.started_at ? new Date(event.started_at) : null
  const elapsedMs = startedAt ? Date.now() - startedAt.getTime() : 0
  const avgMs = currentPos > 0 && startedAt ? elapsedMs / currentPos : 0

  const resumenData = [
    { Campo: 'Evento',              Valor: event.name },
    { Campo: 'Fecha',               Valor: event.date },
    { Campo: 'Hora de inicio',      Valor: startedAt ? startedAt.toLocaleString('es-MX') : '—' },
    { Campo: 'Hora de exportación', Valor: new Date().toLocaleString('es-MX') },
    { Campo: 'Total turnos',        Valor: participants.length },
    { Campo: 'Presentados',         Valor: presented },
    { Campo: 'Pendientes',          Valor: pending },
    { Campo: 'Tiempo transcurrido', Valor: startedAt ? formatDuration(elapsedMs) : '—' },
    { Campo: 'Promedio por turno',  Valor: avgMs > 0 ? formatDuration(avgMs) : '—' },
  ]

  const coachData = coaches.map(c => {
    const mine = participants.filter(p => p.coach_id === c.id)
    const myPresented = mine.filter(p => p.position < currentPos).length
    return {
      Coach: c.name,
      Total: mine.length,
      Presentados: myPresented,
      Pendientes: mine.length - myPresented,
    }
  }).sort((a, b) => b.Total - a.Total)

  const wb = XLSX.utils.book_new()
  const wsProg  = XLSX.utils.json_to_sheet(programaData)
  const wsRes   = XLSX.utils.json_to_sheet(resumenData)
  const wsCoach = XLSX.utils.json_to_sheet(coachData)
  XLSX.utils.book_append_sheet(wb, wsProg,  'Programa')
  XLSX.utils.book_append_sheet(wb, wsRes,   'Resumen')
  XLSX.utils.book_append_sheet(wb, wsCoach, 'Por Coach')

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return out
}

export function exportExcel(event: Event, participants: Participant[], coaches: Coach[]): void {
  const buf = getExportExcelBuffer(event, participants, coaches)
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const date = new Date().toISOString().slice(0, 10)
  a.download = `dance4ever-${safeFilename(event.name)}-${date}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ════════════════════════════════════════════════════════════════════════════
// loadImageAsDataURL — helper para PDF
// ════════════════════════════════════════════════════════════════════════════
async function loadImageAsDataURL(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    return await new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ════════════════════════════════════════════════════════════════════════════
// exportPdf — PDF del programa en vivo
// ════════════════════════════════════════════════════════════════════════════
export async function exportPdfDoc(event: Event, participants: Participant[], coaches: Coach[]): Promise<jsPDF> {
  const coachMap = new Map(coaches.map(c => [c.id, c.name]))
  const currentPos = event.current_position
  const presented = participants.filter(p => p.position < currentPos).length
  const pending = participants.filter(p => p.position > currentPos).length
  const startedAt = event.started_at ? new Date(event.started_at) : null
  const elapsedMs = startedAt ? Date.now() - startedAt.getTime() : 0
  const avgMs = currentPos > 0 && startedAt ? elapsedMs / currentPos : 0

  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  // Banda de encabezado
  doc.setFillColor(76, 29, 149)
  doc.rect(0, 0, pageWidth, 127, 'F')
  doc.setFillColor(217, 70, 239)
  doc.rect(0, 127, pageWidth, 3, 'F')

  const logo = await loadImageAsDataURL('/logo.png')
  if (logo) {
    try { doc.addImage(logo, 'PNG', 30, 30, 70, 70) } catch {}
  }

  doc.setTextColor(245, 200, 0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.text(event.name.toUpperCase(), 120, 65)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(220, 220, 220)
  doc.text(formatDateLong(event.date), 120, 88)
  doc.setFontSize(9)
  doc.setTextColor(170, 170, 170)
  doc.text('Dance4ever · Programa del evento', 120, 105)

  // Resumen
  let y = 160
  doc.setTextColor(20, 20, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text('RESUMEN', 30, y)
  y += 6
  doc.setDrawColor(245, 200, 0)
  doc.setLineWidth(2)
  doc.line(30, y, 110, y)
  y += 18

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(40, 40, 40)
  const rows: [string, string][] = [
    ['Total turnos:',        String(participants.length)],
    ['Presentados:',         String(presented)],
    ['Pendientes:',          String(pending)],
    ['Hora de inicio:',      startedAt ? startedAt.toLocaleString('es-MX') : '—'],
    ['Tiempo transcurrido:', startedAt ? formatDuration(elapsedMs) : '—'],
    ['Promedio por turno:',  avgMs > 0 ? formatDuration(avgMs) : '—'],
  ]
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'bold')
    doc.text(label, 30, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value, 180, y)
    y += 16
  }
  y += 14

  // Tabla del programa
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(20, 20, 20)
  doc.text('PROGRAMA', 30, y)
  doc.setDrawColor(245, 200, 0)
  doc.setLineWidth(2)
  doc.line(30, y + 6, 120, y + 6)
  y += 22

  autoTable(doc, {
    startY: y,
    head: [['#', 'Nombre / Equipo', 'Academia', 'Categoría', 'Modalidad', 'Coach', 'Estado']],
    body: participants.map(p => [
      String(p.position),
      p.name ?? '',
      p.academy ?? '',
      p.category ?? '',
      p.type ?? '',
      p.coach_id ? coachMap.get(p.coach_id) ?? '' : '',
      statusFor(p, currentPos),
    ]),
    theme: 'striped',
    headStyles:          { fillColor: [76, 29, 149], textColor: [245, 200, 0], fontStyle: 'bold', fontSize: 10 },
    bodyStyles:          { fontSize: 9, textColor: [30, 30, 30] },
    alternateRowStyles:  { fillColor: [248, 248, 245] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 32, fontStyle: 'bold' },
      1: { fontStyle: 'bold' },
      6: { halign: 'center' },
    },
    margin: { left: 30, right: 30 },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 6) {
        const v = String(data.cell.raw)
        if (v === 'PRESENTADO') data.cell.styles.textColor = [40, 130, 60]
        else if (v === 'EN ESCENARIO') {
          data.cell.styles.fillColor = [245, 200, 0]
          data.cell.styles.fontStyle = 'bold'
        } else if (v === 'PENDIENTE') data.cell.styles.textColor = [120, 120, 120]
      }
    },
  })

  // Pie de página
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text('Dance4ever', 30, pageHeight - 20)
    doc.text(new Date().toLocaleString('es-MX'), pageWidth / 2, pageHeight - 20, { align: 'center' })
    doc.text(`${i} / ${totalPages}`, pageWidth - 30, pageHeight - 20, { align: 'right' })
  }

  return doc
}

export async function exportPdf(event: Event, participants: Participant[], coaches: Coach[]): Promise<void> {
  const doc = await exportPdfDoc(event, participants, coaches)
  const date = new Date().toISOString().slice(0, 10)
  doc.save(`dance4ever-${safeFilename(event.name)}-${date}.pdf`)
}

// Helper para mapear RegRow a State para PDF
function mapRegRowToState(reg: RegRow): State {
  const academyField = reg.academy || ''
  const teamNameField = reg.team_name || ''
  
  let academy = teamNameField
  let city = ''
  
  const match = academyField.match(/^(.*?)\s*\(([^)]+)\)$/)
  if (match) {
    academy = match[1].trim()
    city = match[2].trim()
  } else if (academyField) {
    academy = academyField
  }

  const extraCoaches = reg.extra_coaches || []
  const assistants = extraCoaches
    .filter(s => s.startsWith('Asistente:'))
    .map(s => s.replace(/^Asistente:\s*/, '').trim())
    .filter(Boolean)

  const stateDancers = reg.dancers.map(d => ({
    name: d.name || '',
    birthdate: d.birthdate || '',
    categoryOverride: d.category_manual ? d.category : null,
  }))

  const dancerIdToIdx = new Map<number, number>()
  reg.dancers.forEach((d, idx) => {
    dancerIdToIdx.set(d.id, idx)
  })

  const stateActs = reg.acts.map(a => {
    const dancerIds = a.dancer_ids || []
    const dancerIndices = dancerIds
      .map(id => dancerIdToIdx.get(id))
      .filter((idx): idx is number => idx !== undefined)

    return {
      modality: a.modality,
      ageCategory: a.age_category,
      level: a.level,
      style: a.style || '',
      dancerIndices,
    }
  })

  return {
    coach: {
      name: reg.coach_name || '',
      phone: reg.coach_phone || '',
      email: reg.coach_email || '',
      assistants,
    },
    academy,
    city,
    teamName: teamNameField,
    teamSize: reg.dancers.length,
    dancers: stateDancers,
    actCount: reg.acts.length,
    acts: stateActs,
    costPaquete: reg.cost_paquete,
    costRepeticion: reg.cost_repeticion,
    confirmedRegistrationId: reg.id,
    ticketsCount: reg.tickets_count || 0,
    confirmedAt: reg.confirmed_at,
    notes: reg.notes || '',
    signature: reg.signature || null,
  }
}

// ════════════════════════════════════════════════════════════════════════════
// exportAllRegistrationsZip — Zip estructurado con reportes y PDFs/Excels por academia
// ════════════════════════════════════════════════════════════════════════════
export async function exportAllRegistrationsZip(event: Event): Promise<void> {
  const { data: regsRaw, error: regsErr } = await supabase
    .from('coach_registrations')
    .select('*')
    .eq('event_id', event.id)
  if (regsErr || !regsRaw) throw new Error(`No se pudieron cargar registros: ${regsErr?.message ?? 'desconocido'}`)

  const regs = regsRaw.filter((r: { confirmed_at: string | null }) => r.confirmed_at)
  if (regs.length === 0) throw new Error('No hay registros confirmados.')

  const regIds = regs.map((r: { id: number }) => r.id)
  
  // Cargar datos adicionales: dancers, acts, participants y coaches
  const [{ data: dancersData }, { data: actsData }, { data: participantsData }, { data: coachesData }] = await Promise.all([
    supabase.from('registration_dancers').select('*').in('registration_id', regIds),
    supabase.from('registration_acts').select('*').in('registration_id', regIds),
    supabase.from('participants').select('*').eq('event_id', event.id).order('position'),
    supabase.from('coaches').select('*').eq('event_id', event.id).order('name')
  ])

  const dancersByReg = new Map<number, DancerRow[]>()
  ;(dancersData ?? []).forEach((d: DancerRow) => {
    const arr = dancersByReg.get(d.registration_id) ?? []
    arr.push(d); dancersByReg.set(d.registration_id, arr)
  })
  const actsByReg = new Map<number, ActRow[]>()
  ;(actsData ?? []).forEach((a: ActRow) => {
    const arr = actsByReg.get(a.registration_id) ?? []
    arr.push(a); actsByReg.set(a.registration_id, arr)
  })

  const participants = (participantsData || []) as Participant[]
  const coaches = (coachesData || []) as Coach[]

  const zip = new JSZip()
  const refDate = toDate(event.date) || new Date()

  // 1. Agregar archivos master en la raíz
  // A. Master_Programa_Vivo_MC.xlsx
  const masterExcelBuf = getExportExcelBuffer(event, participants, coaches)
  zip.file('Master_Programa_Vivo_MC.xlsx', masterExcelBuf)

  // B. Master_Programa_Vivo_MC.pdf
  const masterPdfDoc = await exportPdfDoc(event, participants, coaches)
  const masterPdfBuf = masterPdfDoc.output('arraybuffer')
  zip.file('Master_Programa_Vivo_MC.pdf', masterPdfBuf)

  // C. Master_Finanzas_Completo.xlsx
  const masterFinWb = await exportRegistrationsDoc(event)
  const masterFinBuf = await masterFinWb.xlsx.writeBuffer()
  zip.file('Master_Finanzas_Completo.xlsx', masterFinBuf)

  // 2. Procesar cada academia confirmada en su respectiva carpeta
  for (const reg of regsRaw) {
    if (!reg.confirmed_at) continue
    const r = reg as unknown as RegRow
    r.dancers = (dancersByReg.get(r.id) ?? []).sort((a, b) => a.order_idx - b.order_idx)
    r.acts = (actsByReg.get(r.id) ?? []).sort((a, b) => a.order_idx - b.order_idx)
    if (r.dancers.length === 0 && r.acts.length === 0) continue

    const { academy, city } = parseAcademyCity(r.academy, r.team_name)
    const paq = r.cost_paquete ?? event.default_cost_paquete ?? PRECIO_INSCRIPCION
    const rep = r.cost_repeticion ?? event.default_cost_repeticion ?? PRECIO_ADICIONAL_COREOGRAFIA

    const safeAcademyName = academy.trim().replace(/[\/\\?%*:|"<>]/g, '_')
    const folderName = `Academias_Confirmadas/${safeAcademyName}`

    // A. Detalle_[Academia].xlsx
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Dance4ever'

    const counts = new Map<number, number>()
    r.acts.forEach(a => {
      if (a.modality === 'grupal') r.dancers.forEach(d => counts.set(d.id, (counts.get(d.id) ?? 0) + 1))
      else a.dancer_ids.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1))
    })

    const alumnosData = r.dancers.map(d => {
      const age = ageAtDate(d.birthdate, refDate)
      const n = counts.get(d.id) ?? 0
      const cost = dancerCost(d.id, counts, paq, rep)
      return {
        'Nombre': d.name,
        'Fecha Nacimiento': formatBirthdate(d.birthdate),
        'Edad': age > 0 ? age : '',
        'Categoria': d.category ? AGE_CATEGORY_LABELS[d.category as AgeCategory] : '',
        'Participaciones': n,
        'Costo': cost,
      }
    })
    addStyledSheet(wb, 'Alumnos', `${academy}`, 'Alumnos', alumnosData, ['Costo'])

    const actosData = r.acts.map(a => {
      const isSDT = a.modality !== 'grupal'
      const dancerById = new Map(r.dancers.map(d => [d.id, d]))
      const dancersInAct = isSDT ? a.dancer_ids.map(id => dancerById.get(id)).filter(Boolean) : r.dancers
      const nameOrEquipo = isSDT ? dancersInAct.map(d => d!.name.split(' ').slice(0, 2).join(' ')).join(' & ') : (r.team_name || academy)
      return {
        'Modalidad': modalidadOf(a.modality),
        'Categoria': a.age_category ? AGE_CATEGORY_LABELS[a.age_category] : '',
        'Nivel': nivelOf(a.modality, a.level),
        'Estilo': a.style,
        'Nombre / Equipo': nameOrEquipo,
        'Integrantes': dancersInAct.length,
        'Nombres': dancersInAct.map(d => d!.name).join(', '),
      }
    })
    addStyledSheet(wb, 'Actos', `${academy}`, 'Coreografias', actosData, [])

    const total = regTotalCost(r, refDate, event)
    const resumenData = [{
      'Academia': academy,
      'Ciudad': city,
      'Coach': r.coach_name,
      'Telefono': r.coach_phone,
      'Email': r.coach_email ?? '',
      'Equipo': r.team_name || academy,
      'Alumnos': r.dancers.length,
      'Actos': r.acts.length,
      'Boletos': r.tickets_count ?? 0,
      'Total': total,
    }]
    addStyledSheet(wb, 'Resumen', `${academy}`, 'Datos generales', resumenData, ['Total'])

    const detailExcelBuf = await wb.xlsx.writeBuffer()
    zip.file(`${folderName}/Detalle_${safeAcademyName}.xlsx`, detailExcelBuf)

    // B. Comprobante_Registro_[Academia].pdf
    const stateObj = mapRegRowToState(r)
    const receiptDoc = await generateReceiptPDFDoc(stateObj, event)
    const receiptPdfBuf = receiptDoc.output('arraybuffer')
    zip.file(`${folderName}/Comprobante_Registro_${safeAcademyName}.pdf`, receiptPdfBuf)

    // C. Carta_Responsiva_[Academia].pdf (solo si está firmada)
    if (r.signature) {
      const cartaDoc = await generateCartaPDFDoc(stateObj, event)
      const cartaPdfBuf = cartaDoc.output('arraybuffer')
      zip.file(`${folderName}/Carta_Responsiva_${safeAcademyName}.pdf`, cartaPdfBuf)
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Registros Dance4ever - ${safeFilename(event.name)}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
