import * as XLSX from 'xlsx'

export type ParsedRow = {
  position: number
  coach: string
  type: string
  style: string
  category: string
  name: string
  academy: string
  city: string
}

export type ParsedExcel = {
  rows: ParsedRow[]
  coaches: string[]
}

function normalizeHeader(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e').replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n').trim()
}

function isCsv(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 8))
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return false
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) return false
  return true
}

export function parseExcelProgram(buffer: ArrayBuffer): ParsedExcel {
  const workbook = isCsv(buffer)
    ? XLSX.read(new TextDecoder('utf-8').decode(buffer), { type: 'string' })
    : XLSX.read(buffer, { type: 'array', cellDates: false })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  if (raw.length === 0) return { rows: [], coaches: [] }

  const headerRow = raw[0].map(normalizeHeader)
  const hasHeader = headerRow.some(h => /numero|posicion|coach|modalidad|nombre|equipo|academia|tipo/.test(h))

  const colIdx = {
    position: headerRow.findIndex(h => /numero|posicion/.test(h) && !/integrantes/.test(h)),
    coach: headerRow.findIndex(h => /coach/.test(h)),
    type: headerRow.findIndex(h => /modalidad|tipo/.test(h)),
    style: headerRow.findIndex(h => /estilo/.test(h)),
    category: headerRow.findIndex(h => /categoria/.test(h)),
    name: headerRow.findIndex(h => /nombre|equipo|participante/.test(h)),
    academy: headerRow.findIndex(h => /academia/.test(h)),
    city: headerRow.findIndex(h => /ciudad/.test(h)),
  }

  const dataRows = hasHeader ? raw.slice(1) : raw
  const rows: ParsedRow[] = []
  const coachSet = new Set<string>()

  for (const row of dataRows) {
    if (!hasHeader) {
      const position = parseInt(String(row[0] ?? ''))
      if (isNaN(position)) continue
      const rawType = String(row[1] ?? '').trim()
      const name = String(row[2] ?? '').trim()
      const academy = String(row[3] ?? '').trim()
      const city = String(row[4] ?? '').trim()
      const parts = rawType.split(' ')
      const type = parts[0] || ''
      const style = parts[1] || ''
      const category = parts.slice(2).join(' ')
      rows.push({ position, coach: '', type, style, category, name, academy, city })
      continue
    }

    const position = parseInt(String(row[colIdx.position] ?? ''))
    if (isNaN(position)) continue

    const coach = colIdx.coach >= 0 ? String(row[colIdx.coach] ?? '').trim() : ''
    const type = colIdx.type >= 0 ? String(row[colIdx.type] ?? '').trim() : ''
    const style = colIdx.style >= 0 ? String(row[colIdx.style] ?? '').trim() : ''
    const category = colIdx.category >= 0 ? String(row[colIdx.category] ?? '').trim() : ''
    const name = colIdx.name >= 0 ? String(row[colIdx.name] ?? '').trim() : ''
    const academy = colIdx.academy >= 0 ? String(row[colIdx.academy] ?? '').trim() : ''
    const city = colIdx.city >= 0 ? String(row[colIdx.city] ?? '').trim() : ''
    if (coach) coachSet.add(coach)
    rows.push({ position, coach, type, style, category, name, academy, city })
  }

  return { rows, coaches: Array.from(coachSet).sort() }
}
