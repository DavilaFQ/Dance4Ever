import { AgeCategory, Event, categoryFromBirthdate } from '@/lib/supabase'
import { State, Dancer, MODALITY_OPTIONS } from '@/components/register/types'
import { toDate, toEndOfDay } from '@/lib/date'

export function minDancers(m: string | null): number {
  if (m === 'solista') return 1
  if (m === 'dueto') return 2
  if (m === 'trio') return 3
  if (m === 'grupal') return 4
  return 0
}

export function maxDancers(m: string | null): number {
  if (m === 'solista') return 1
  if (m === 'dueto') return 2
  if (m === 'trio') return 3
  if (m === 'grupal') return 100
  return 0
}

export function modalityLabel(m: string): string {
  return MODALITY_OPTIONS.find(o => o.value === m)?.label ?? m
}

export function effectiveCategory(dancer: Dancer): AgeCategory | null {
  if (dancer.categoryOverride) return dancer.categoryOverride
  return categoryFromBirthdate(dancer.birthdate)
}

export function ageFromBirthdate(iso: string, ref = new Date()): number | null {
  if (!iso) return null
  const b = new Date(iso)
  if (isNaN(b.getTime())) return null
  let age = ref.getFullYear() - b.getFullYear()
  if (ref.getMonth() < b.getMonth() || (ref.getMonth() === b.getMonth() && ref.getDate() < b.getDate())) age--
  return age < 0 ? null : age
}

export function initialState(): State {
  return {
    coach: { name: '', phone: '', email: '', assistants: [] },
    academy: '',
    city: '',
    teamName: '',
    teamSize: 0,
    dancers: [],
    actCount: 0,
    acts: [],
    costPaquete: null,
    costRepeticion: null,
    confirmedRegistrationId: null,
    ticketsCount: 0,
    confirmedAt: null,
    notes: '',
    signature: null,
  }
}

export function participacionesPorAlumno(state: State): Map<number, number> {
  const counts = new Map<number, number>()
  state.acts.forEach(a => {
    if (!a.modality) return
    a.dancerIndices.forEach(di => {
      counts.set(di, (counts.get(di) ?? 0) + 1)
    })
  })
  return counts
}

export function getRegistrationDeadline(event: Event | null): string {
  if (event?.deadline_registro) {
    return toDate(event.deadline_registro)?.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) || 'No definido'
  }
  if (!event?.date) return 'No definido'
  try {
    const d = toDate(event.date)
    if (!d) return 'No definido'
    d.setDate(d.getDate() - 15)
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return 'No definido'
  }
}

export function getChangesDeadline(event: Event | null): string {
  if (event?.deadline_cambios) {
    return toDate(event.deadline_cambios)?.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) || 'No definido'
  }
  if (!event?.date) return 'No definido'
  try {
    const d = toDate(event.date)
    if (!d) return 'No definido'
    d.setDate(d.getDate() - 6)
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return 'No definido'
  }
}

export function isBeforeTicketsDeadline(event: Event | null): boolean {
  const dl = toEndOfDay(event?.deadline_precio_entrada)
  if (dl) return new Date() <= dl
  return true
}

export function getPrecioEntradaRegistro(event: Event | null): number {
  const dl = toEndOfDay(event?.deadline_precio_entrada)
  if (dl) return new Date() > dl
    ? (event!.cost_entrada_tardia ?? 600)
    : (event!.cost_entrada_temprana ?? 500)
  // No deadline configured → always early price
  return event?.cost_entrada_temprana ?? 500
}

export function isBeforeCoreoDeadline(event: Event | null): boolean {
  const dl = toEndOfDay(event?.fecha_cambio_tarifa_coreo)
  if (dl) return new Date() <= dl
  return true
}

export function costBreakdown(state: State, event: Event | null) {
  const paq = event?.default_cost_paquete ?? 2700
  const rep = event?.default_cost_repeticion ?? 500
  const asistenteCosto = event?.cost_asistente ?? 400
  const dancersPorAsistente = event?.dancers_por_asistente_gratis ?? 8
  const precioEntrada = (() => {
    const dl = toEndOfDay(event?.deadline_precio_entrada)
    if (dl) return new Date() > dl
      ? (event!.cost_entrada_tardia ?? 600)
      : (event!.cost_entrada_temprana ?? 500)
    return event?.cost_entrada_temprana ?? 500
  })()
  const beforeDeadline = isBeforeCoreoDeadline(event)

  return { paq, rep, asistenteCosto, dancersPorAsistente, precioEntrada, beforeDeadline }
}

export function costoTotal(state: State, event: Event | null): number {
  const bd = costBreakdown(state, event)
  const counts = participacionesPorAlumno(state)
  const filledDancers = state.dancers.filter(d => d.name.trim().length > 0)
  let total = 0

  state.dancers.forEach((dancer, idx) => {
    if (dancer.name.trim().length === 0) return
    total += bd.paq
    const n = counts.get(idx) ?? 0
    if (bd.beforeDeadline) {
      if (n > 1) total += (n - 1) * bd.rep
    } else {
      total += n * bd.rep
    }
  })

  const freeEntries = Math.floor(filledDancers.length / bd.dancersPorAsistente)
  const assistants = state.coach.assistants.filter(a => a.trim()).length
  total += Math.max(0, assistants - freeEntries) * bd.asistenteCosto
  total += (state.ticketsCount ?? 0) * bd.precioEntrada
  return total
}

export function formatMoney(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)
}

export function formatEventDate(iso: string): string {
  try {
    const d = toDate(iso)
    if (!d) return iso
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return iso }
}

export function formatBirthdate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export function isValidDate(y: number, m: number, d: number): boolean {
  if (isNaN(y) || isNaN(m) || isNaN(d)) return false
  if (m < 1 || m > 12) return false
  if (d < 1 || d > 31) return false
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

export function getDancerDisplayName(dancer: Dancer, _index?: number, _allDancers?: Dancer[]): string {
  const name = dancer.name.trim()
  if (!name) return 'SIN NOMBRE'
  return name.toUpperCase()
}

export function parseSmartList(text: string): Dancer[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const result: Dancer[] = []

  const regexDMY = /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/
  const regexYMD = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/

  lines.forEach(line => {
    let birthdate = ''
    let name = line

    let match = line.match(regexDMY)
    if (match) {
      const dNum = Number(match[1])
      const mNum = Number(match[2])
      const yNum = Number(match[3])
      if (isValidDate(yNum, mNum, dNum)) {
        const d = match[1].padStart(2, '0')
        const m = match[2].padStart(2, '0')
        const y = match[3]
        birthdate = `${y}-${m}-${d}`
        name = line.replace(match[0], '')
      }
    } else {
      match = line.match(regexYMD)
      if (match) {
        const yNum = Number(match[1])
        const mNum = Number(match[2])
        const dNum = Number(match[3])
        if (isValidDate(yNum, mNum, dNum)) {
          const y = match[1]
          const m = match[2].padStart(2, '0')
          const d = match[3].padStart(2, '0')
          birthdate = `${y}-${m}-${d}`
          name = line.replace(match[0], '')
        }
      }
    }

    name = name.replace(/^[\s,.\-–—]+|[\s,.\-–—]+$/g, '').replace(/\s+/g, ' ').trim()
    name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')

    if (name.length >= 2) {
      result.push({
        name,
        birthdate: birthdate || '',
        categoryOverride: null
      })
    }
  })

  return result
}

export const LS_KEY = (eventId: string) => `d4e:register:${eventId}`

export function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return 'Ocurrió un error inesperado'
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}
