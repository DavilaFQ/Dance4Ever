import { Event, Participant, Coach, Modality, AgeCategory, Level, AGE_CATEGORY_ORDER, AGE_CATEGORY_LABELS, supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type Status = 'PRESENTADO' | 'EN ESCENARIO' | 'PENDIENTE'

function statusFor(p: Participant, currentPos: number): Status {
  if (p.position < currentPos) return 'PRESENTADO'
  if (p.position === currentPos) return 'EN ESCENARIO'
  return 'PENDIENTE'
}

function safeFilename(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
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
  const m = refDate.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && refDate.getDate() < b.getDate())) age--
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

const MODALITY_ORDER: Modality[] = ['solista', 'dueto', 'trio', 'grupal']
const LEVEL_ORDER: Level[] = ['basico', 'avanzado']

type DancerRow = { id: number, registration_id: number, name: string, birthdate: string, category: AgeCategory | null, category_manual: boolean | null, order_idx: number }
type ActRow = { id: number, registration_id: number, modality: Modality, age_category: AgeCategory | null, level: Level | null, style: string, order_idx: number, dancer_ids: number[] }
type RegRow = {
  id: number
  coach_name: string
  coach_phone: string
  coach_email: string | null
  extra_coaches: string[]
  academy: string
  team_name: string
  cost_paquete: number | null
  cost_repeticion: number | null
  confirmed_at: string | null
  dancers: DancerRow[]
  acts: ActRow[]
}

export async function exportRegistrations(event: Event): Promise<void> {
  const { data: regsRaw, error: regsErr } = await supabase
    .from('coach_registrations')
    .select('*')
    .eq('event_id', event.id)
  if (regsErr || !regsRaw) throw new Error(`No se pudieron cargar registros: ${regsErr?.message ?? 'desconocido'}`)

  const regs = (regsRaw as Array<{ id: number, coach_name: string, coach_phone: string, coach_email: string | null, extra_coaches: string[] | null, academy: string, team_name: string, cost_paquete: number | null, cost_repeticion: number | null, confirmed_at: string | null }>).filter(r => r.confirmed_at)
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
    dancers: (dancersByReg.get(r.id) ?? []).sort((a, b) => a.order_idx - b.order_idx),
    acts: (actsByReg.get(r.id) ?? []).sort((a, b) => a.order_idx - b.order_idx),
  }))

  type FlatAct = {
    modality: Modality
    ageCategory: AgeCategory | null
    level: Level | null
    style: string
    avgAge: number
    nameOrEquipo: string
    coach: string
    academy: string
    dancerNames: string
    teamName: string
  }
  const refDate = event.date ? new Date(event.date) : new Date()

  const flat: FlatAct[] = []
  for (const reg of fullRegs) {
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
        : reg.team_name

      flat.push({
        modality: act.modality,
        ageCategory: act.age_category,
        level: act.level,
        style: act.style,
        avgAge,
        nameOrEquipo,
        coach: reg.coach_name,
        academy: reg.academy,
        dancerNames: dancersInAct.map(d => d.name).join(', '),
        teamName: reg.team_name,
      })
    }
  }

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

  const programa = flat.map((a, i) => ({
    Numero: i + 1,
    Coach: a.coach,
    Modalidad: modalidadOf(a.modality),
    Estilo: a.style,
    Categoría: a.ageCategory ? AGE_CATEGORY_LABELS[a.ageCategory] : '',
    Nivel: nivelOf(a.modality, a.level),
    'Nombre/Equipo': a.nameOrEquipo,
    Academia: a.academy,
    Ciudad: '',
  }))

  const detalle = flat.map((a, i) => ({
    Numero: i + 1,
    Coach: a.coach,
    Modalidad: modalidadOf(a.modality),
    Estilo: a.style,
    Categoría: a.ageCategory ? AGE_CATEGORY_LABELS[a.ageCategory] : '',
    Nivel: nivelOf(a.modality, a.level),
    'Nombre/Equipo': a.nameOrEquipo,
    Academia: a.academy,
    Equipo: a.teamName,
    'Edad promedio': Math.round(a.avgAge * 10) / 10,
    'Integrantes del acto': a.dancerNames,
  }))

  // Compute total cost per registration
  function regTotalCost(r: RegRow): number {
    const paq = r.cost_paquete ?? 0
    const rep = r.cost_repeticion ?? 0
    const counts = new Map<number, number>()
    r.acts.forEach(a => {
      if (a.modality === 'grupal') {
        r.dancers.forEach(d => counts.set(d.id, (counts.get(d.id) ?? 0) + 1))
      } else {
        a.dancer_ids.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1))
      }
    })
    let total = 0
    counts.forEach(n => {
      if (n >= 1) total += paq
      if (n > 1) total += (n - 1) * rep
    })
    return total
  }

  const equipos = fullRegs.map(r => ({
    Coach: r.coach_name,
    'WhatsApp': r.coach_phone,
    'Correo': r.coach_email ?? '',
    'Otros coaches': r.extra_coaches.join(', '),
    Academia: r.academy,
    Equipo: r.team_name,
    'Integrantes': r.dancers.length,
    'Actos registrados': r.acts.length,
    'Costo paquete': r.cost_paquete ?? '',
    'Costo repetición': r.cost_repeticion ?? '',
    'Total a pagar': regTotalCost(r),
  }))

  // Integrantes con override de categoría y costo por alumno
  const integrantes = fullRegs.flatMap(r => {
    const paq = r.cost_paquete ?? 0
    const rep = r.cost_repeticion ?? 0
    // Per-dancer participation count
    const counts = new Map<number, number>()
    r.acts.forEach(a => {
      if (a.modality === 'grupal') {
        r.dancers.forEach(d => counts.set(d.id, (counts.get(d.id) ?? 0) + 1))
      } else {
        a.dancer_ids.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1))
      }
    })
    return r.dancers.map(d => {
      const age = ageAtDate(d.birthdate, refDate)
      const autoCat = age > 0 ? autoCategoryFromAge(age) : null
      const effective = d.category as AgeCategory | null
      const manual = d.category_manual === true
      const n = counts.get(d.id) ?? 0
      const cost = n >= 1 ? paq + Math.max(0, n - 1) * rep : 0
      return {
        Coach: r.coach_name,
        Academia: r.academy,
        Equipo: r.team_name,
        Alumno: d.name,
        'Fecha de nacimiento': d.birthdate,
        Edad: age,
        'Categoría calculada': autoCat ? AGE_CATEGORY_LABELS[autoCat] : '—',
        'Categoría usada': effective ? AGE_CATEGORY_LABELS[effective] : '—',
        'Modificada manualmente': manual ? 'SÍ' : 'No',
        'Participaciones': n,
        'Costo a pagar': cost,
      }
    })
  })

  // Build styled workbook
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Dance4ever'
  wb.created = new Date()

  const moneyCols = new Map<string, string[]>([
    ['Programa', []],
    ['Detalle', []],
    ['Integrantes', ['Costo a pagar']],
    ['Equipos', ['Costo paquete', 'Costo repetición', 'Total a pagar']],
  ])

  addStyledSheet(wb, 'Programa', event.name, 'Programa del evento', programa, moneyCols.get('Programa')!)
  addStyledSheet(wb, 'Detalle', event.name, 'Detalle de actos', detalle, moneyCols.get('Detalle')!)
  addStyledSheet(wb, 'Integrantes', event.name, 'Integrantes registrados', integrantes, moneyCols.get('Integrantes')!)
  addStyledSheet(wb, 'Equipos', event.name, 'Equipos / academias', equipos, moneyCols.get('Equipos')!)

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Registro del Nacional - ${safeFilename(event.name)}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function addStyledSheet(wb: ExcelJS.Workbook, name: string, eventName: string, subtitle: string, data: Record<string, unknown>[], moneyColumnLabels: string[]): void {
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: 'FFFBBF24' } },
    views: [{ state: 'frozen', ySplit: 3 }],
  })

  const headers = data.length > 0 ? Object.keys(data[0]) : []
  const colCount = Math.max(1, headers.length)
  const lastCol = String.fromCharCode(64 + colCount)

  // Title row
  ws.mergeCells(`A1:${lastCol}1`)
  const title = ws.getCell('A1')
  title.value = `DANCE4EVER · ${eventName.toUpperCase()}`
  title.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFBBF24' } }
  title.alignment = { horizontal: 'center', vertical: 'middle' }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } }
  ws.getRow(1).height = 32

  // Subtitle row
  ws.mergeCells(`A2:${lastCol}2`)
  const sub = ws.getCell('A2')
  sub.value = subtitle.toUpperCase()
  sub.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFCCCCCC' } }
  sub.alignment = { horizontal: 'center', vertical: 'middle' }
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F1F1F' } }
  ws.getRow(2).height = 22

  if (headers.length === 0) {
    ws.getCell('A3').value = 'Sin datos'
    return
  }

  // Header row (row 3)
  ws.addRow([]) // skip — addRow appends so we need to ensure row 3 is the header
  const headerRow = ws.getRow(3)
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBBF24' } }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'medium', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF999999' } },
      right: { style: 'thin', color: { argb: 'FF999999' } },
    }
  })
  headerRow.height = 28

  // Data rows
  const moneyColIndices = new Set(
    moneyColumnLabels.map(label => headers.indexOf(label)).filter(i => i >= 0)
  )

  data.forEach((row, ri) => {
    const r = ws.addRow(headers.map(h => row[h]))
    const isAlt = ri % 2 === 1
    r.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF1F1F1F' } }
      cell.alignment = { vertical: 'middle', wrapText: true, horizontal: typeof row[headers[colNumber - 1]] === 'number' ? 'right' : 'left' }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isAlt ? 'FFF6F4EC' : 'FFFFFFFF' },
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E5E5' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E5E5' } },
        left: { style: 'thin', color: { argb: 'FFE5E5E5' } },
        right: { style: 'thin', color: { argb: 'FFE5E5E5' } },
      }
      if (moneyColIndices.has(colNumber - 1) && typeof cell.value === 'number') {
        cell.numFmt = '"$"#,##0.00'
      }
    })
    r.height = 22
  })

  // Auto-fit column widths
  headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1)
    let maxLen = h.length
    data.forEach(row => {
      const v = row[h]
      const s = v == null ? '' : String(v)
      if (s.length > maxLen) maxLen = s.length
    })
    col.width = Math.min(50, Math.max(10, maxLen + 3))
  })
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

export function exportExcel(event: Event, participants: Participant[], coaches: Coach[]): void {
  const coachMap = new Map(coaches.map(c => [c.id, c.name]))
  const currentPos = event.current_position

  const programaData = participants.map(p => ({
    Posición: p.position,
    'Nombre/Equipo': p.name,
    Academia: p.academy ?? '',
    Categoría: p.category ?? '',
    Modalidad: p.type ?? '',
    Estilo: p.style ?? '',
    Coach: p.coach_id ? coachMap.get(p.coach_id) ?? '' : '',
    Ciudad: p.city ?? '',
    Estado: statusFor(p, currentPos),
  }))

  const presented = participants.filter(p => p.position < currentPos).length
  const pending = participants.filter(p => p.position > currentPos).length
  const startedAt = event.started_at ? new Date(event.started_at) : null
  const elapsedMs = startedAt ? Date.now() - startedAt.getTime() : 0
  const avgMs = currentPos > 0 && startedAt ? elapsedMs / currentPos : 0

  const resumenData = [
    { Campo: 'Evento', Valor: event.name },
    { Campo: 'Fecha', Valor: event.date },
    { Campo: 'Hora de inicio', Valor: startedAt ? startedAt.toLocaleString('es-MX') : '—' },
    { Campo: 'Hora de exportación', Valor: new Date().toLocaleString('es-MX') },
    { Campo: 'Total turnos', Valor: participants.length },
    { Campo: 'Presentados', Valor: presented },
    { Campo: 'Pendientes', Valor: pending },
    { Campo: 'Tiempo transcurrido', Valor: startedAt ? formatDuration(elapsedMs) : '—' },
    { Campo: 'Promedio por turno', Valor: avgMs > 0 ? formatDuration(avgMs) : '—' },
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
  const wsProg = XLSX.utils.json_to_sheet(programaData)
  const wsRes = XLSX.utils.json_to_sheet(resumenData)
  const wsCoach = XLSX.utils.json_to_sheet(coachData)
  XLSX.utils.book_append_sheet(wb, wsProg, 'Programa')
  XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen')
  XLSX.utils.book_append_sheet(wb, wsCoach, 'Por Coach')

  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `dance4ever-${safeFilename(event.name)}-${date}.xlsx`)
}

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

export async function exportPdf(event: Event, participants: Participant[], coaches: Coach[]): Promise<void> {
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

  // Header band — Royal deep purple gala color with fuchsia accent line
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

  // Summary box
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
    ['Total turnos:', String(participants.length)],
    ['Presentados:', String(presented)],
    ['Pendientes:', String(pending)],
    ['Hora de inicio:', startedAt ? startedAt.toLocaleString('es-MX') : '—'],
    ['Tiempo transcurrido:', startedAt ? formatDuration(elapsedMs) : '—'],
    ['Promedio por turno:', avgMs > 0 ? formatDuration(avgMs) : '—'],
  ]
  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'bold')
    doc.text(label, 30, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value, 180, y)
    y += 16
  }
  y += 14

  // Programa table
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
    head: [['#', 'Nombre/Equipo', 'Academia', 'Categoría', 'Modalidad', 'Coach', 'Estado']],
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
    headStyles: { fillColor: [76, 29, 149], textColor: [245, 200, 0], fontStyle: 'bold', fontSize: 10 },
    bodyStyles: { fontSize: 9, textColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: [248, 248, 245] },
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
        }
        else if (v === 'PENDIENTE') data.cell.styles.textColor = [120, 120, 120]
      }
    },
  })

  // Footer on each page
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text('Dance4ever', 30, pageHeight - 20)
    doc.text(new Date().toLocaleString('es-MX'), pageWidth / 2, pageHeight - 20, { align: 'center' })
    doc.text(`${i} / ${totalPages}`, pageWidth - 30, pageHeight - 20, { align: 'right' })
  }

  const date = new Date().toISOString().slice(0, 10)
  doc.save(`dance4ever-${safeFilename(event.name)}-${date}.pdf`)
}
