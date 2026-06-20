import { Event } from './supabase'

export function getAvgPerTurnMs(event: Event, now: number = Date.now()): number | null {
  if (!event.started_at) return null
  const elapsed = now - new Date(event.started_at).getTime()
  if (event.current_position <= 0 || elapsed <= 0) return null
  return elapsed / event.current_position
}

export function etaMinutes(turns: number, avgMs: number | null): number | null {
  if (avgMs === null || turns <= 0) return null
  // Si el promedio es irreal (más de 10 minutos por turno), usamos un estándar de 3 minutos
  const safeAvgMs = avgMs > 600000 ? 180000 : avgMs
  return Math.max(1, Math.round((turns * safeAvgMs) / 60000))
}

export function etaLabel(turns: number, avgMs: number | null): string | null {
  const m = etaMinutes(turns, avgMs)
  return m === null ? null : `${m} MIN (Aproximadamente)`
}
