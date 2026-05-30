import { RegistrationAct, RegistrationDancer, Event } from '@/lib/supabase'
import { toEndOfDay } from '@/lib/date'

export const DEFAULT_COST_PAQUETE = 2700
export const DEFAULT_COST_REPETICION = 500
export const DEFAULT_COST_ASISTENTE = 400
export const DEFAULT_COST_ENTRADA_TEMPRANA = 500
export const DEFAULT_COST_ENTRADA_TARDIA = 600
const DEFAULT_DANCERS_POR_ASISTENTE_GRATIS = 8

export const MODALITY_MIN_DANCERS: Record<string, number> = {
  solista: 1,
  dueto: 2,
  trio: 3,
  grupal: 4,
}

// Primera coreo siempre incluida en la inscripción base
function isBeforeCoreoDeadline(_event: Event | null): boolean {
  return true
}

function getPrecioEntrada(event: Event | null): number {
  const dl = toEndOfDay(event?.deadline_precio_entrada)
  if (dl) return new Date() > dl
    ? (event!.cost_entrada_tardia ?? DEFAULT_COST_ENTRADA_TARDIA)
    : (event!.cost_entrada_temprana ?? DEFAULT_COST_ENTRADA_TEMPRANA)
  // No deadline configured → always early price
  return event?.cost_entrada_temprana ?? DEFAULT_COST_ENTRADA_TEMPRANA
}

function buildActCounts(acts: RegistrationAct[], _dancers: RegistrationDancer[]): Map<number, number> {
  const counts = new Map<number, number>()
  acts.forEach(a => {
    const participantIds = a.dancer_ids || []
    participantIds.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1))
  })
  return counts
}

export function costoRegistro(
  acts: RegistrationAct[],
  dancers: RegistrationDancer[],
  costPaquete: number | null,
  costRep: number | null,
  ticketsCount: number,
  extraCoaches: string[],
  event: Event | null
): number {
  const paq = costPaquete ?? event?.default_cost_paquete ?? DEFAULT_COST_PAQUETE
  const rep = costRep ?? event?.default_cost_repeticion ?? DEFAULT_COST_REPETICION
  const precioEntrada = getPrecioEntrada(event)
  const costoAsistente = event?.cost_asistente ?? DEFAULT_COST_ASISTENTE
  const dancersPorAsistente = event?.dancers_por_asistente_gratis ?? DEFAULT_DANCERS_POR_ASISTENTE_GRATIS

  const counts = buildActCounts(acts, dancers)
  const beforeDeadline = isBeforeCoreoDeadline(event)

  let total = 0
  dancers.forEach(d => {
    total += paq
    const n = counts.get(d.id) ?? 0
    if (beforeDeadline) {
      if (n > 1) total += (n - 1) * rep
    } else {
      total += n * rep
    }
  })

  const assistants = extraCoaches.filter(s => s.startsWith('Asistente:')).length
  const freeEntries = Math.floor(dancers.length / dancersPorAsistente)
  total += Math.max(0, assistants - freeEntries) * costoAsistente
  total += ticketsCount * precioEntrada
  return total
}

export function costBreakdown(
  acts: RegistrationAct[],
  dancers: RegistrationDancer[],
  costPaquete: number | null,
  costRep: number | null,
  ticketsCount: number,
  extraCoaches: string[],
  event: Event | null
) {
  const paq = costPaquete ?? event?.default_cost_paquete ?? DEFAULT_COST_PAQUETE
  const rep = costRep ?? event?.default_cost_repeticion ?? DEFAULT_COST_REPETICION
  const precioEntrada = getPrecioEntrada(event)
  const costoAsistente = event?.cost_asistente ?? DEFAULT_COST_ASISTENTE
  const dancersPorAsistente = event?.dancers_por_asistente_gratis ?? DEFAULT_DANCERS_POR_ASISTENTE_GRATIS

  const counts = buildActCounts(acts, dancers)
  const beforeDeadline = isBeforeCoreoDeadline(event)

  let inscrTotal = 0
  let repTotal = 0
  dancers.forEach(d => {
    inscrTotal += paq
    const n = counts.get(d.id) ?? 0
    if (beforeDeadline) {
      if (n > 1) repTotal += (n - 1) * rep
    } else {
      repTotal += n * rep
    }
  })

  const assistants = extraCoaches.filter(s => s.startsWith('Asistente:')).length
  const freeEntries = Math.floor(dancers.length / dancersPorAsistente)
  const paidAssistants = Math.max(0, assistants - freeEntries)
  const asistTotal = paidAssistants * costoAsistente
  const ticketsTotal = ticketsCount * precioEntrada

  return {
    inscrBase: paq,
    repBase: rep,
    costoAsistente,
    precioEntrada,
    counts,
    inscrTotal,
    repTotal,
    asistTotal,
    ticketsTotal,
    total: inscrTotal + repTotal + asistTotal + ticketsTotal,
    paidAssistants,
    freeEntries,
    assistants,
  }
}

export function dancerCost(
  dancerId: number,
  counts: Map<number, number>,
  inscrBase: number,
  repBase: number,
  event?: Event | null
): number {
  const n = counts.get(dancerId) ?? 0
  const beforeDeadline = isBeforeCoreoDeadline(event ?? null)
  if (beforeDeadline) {
    return inscrBase + (n > 1 ? (n - 1) * repBase : 0)
  }
  return inscrBase + n * repBase
}

export function actIsViable(modality: string, dancerCount: number): boolean {
  const min = MODALITY_MIN_DANCERS[modality] ?? 0
  if (modality === 'solista') return dancerCount === 1
  if (modality === 'dueto') return dancerCount === 2
  if (modality === 'trio') return dancerCount === 3
  if (modality === 'grupal') return dancerCount >= 4
  return dancerCount >= min
}
