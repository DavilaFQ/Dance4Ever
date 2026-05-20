'use client'
import { useEffect, useState } from 'react'
import { X, Play } from 'lucide-react'
import { supabase, Event, Participant } from '@/lib/supabase'
import { syncServerTime, serverNow } from '@/lib/serverTime'

export default function StatsPanel({ event, participants, onClose }: {
  event: Event
  participants: Participant[]
  onClose: () => void
}) {
  const [now, setNow] = useState(serverNow())
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    syncServerTime().then(() => setNow(serverNow()))
    const id = setInterval(() => setNow(serverNow()), 1000)
    return () => clearInterval(id)
  }, [])

  async function markStartNow() {
    setErr(null)
    const { error } = await supabase.rpc('set_started_at_now', { p_id: event.id })
    if (error) {
      setErr(error.message)
    }
  }

  const total = participants.length
  const currentPos = Math.min(event.current_position, total)
  const progress = total > 0 ? currentPos / total : 0
  const percent = Math.round(progress * 100)

  const startedAt = event.started_at ? new Date(event.started_at).getTime() : null
  const elapsedMs = startedAt ? Math.max(0, now - startedAt) : 0
  const turnsDone = currentPos
  const avgPerTurnMs = startedAt && turnsDone > 0 ? elapsedMs / turnsDone : 0
  const remaining = Math.max(0, total - currentPos)
  const etaTotalMs = avgPerTurnMs > 0 ? now + avgPerTurnMs * remaining : 0
  const remainingMs = etaTotalMs > 0 ? etaTotalMs - now : 0

  const academies = countUnique(participants.map(p => p.academy))
  const categories = countUnique(participants.map(p => p.category))
  const types = countUnique(participants.map(p => p.type))
  const coaches = countUnique(participants.map(p => p.coach_id))
  const cities = countUnique(participants.map(p => p.city))

  return (
    <div className="fixed inset-0 bg-neutral-900 z-50 flex flex-col">
      <div className="bg-black px-4 py-3 flex items-center justify-between shrink-0">
        <h3 className="font-display text-2xl tracking-widest text-yellow-500">ESTADÍSTICAS</h3>
        <button onClick={onClose} aria-label="Cerrar"><X className="w-6 h-6" /></button>
      </div>

      <div className="flex-1 min-h-0 p-3 flex flex-col gap-3 text-white">
        <StatCard label="AVANCE" value={`#${currentPos} / ${total}`} sub={`${percent}%`}>
          <div className="h-3 bg-neutral-800 rounded-full overflow-hidden mt-3">
            <div className="h-full bg-yellow-400 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </StatCard>

        <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
          <StatCard label="TRANSCURRIDO" value={startedAt ? formatDuration(elapsedMs) : '—'} />
          <StatCard label="PROMEDIO/TURNO" value={avgPerTurnMs > 0 ? formatDuration(avgPerTurnMs) : '—'} />
        </div>

        {!startedAt && (
          <button
            onClick={markStartNow}
            className="shrink-0 bg-yellow-400 active:bg-yellow-500 text-black font-display text-lg tracking-widest py-3 rounded-lg flex items-center justify-center gap-2"
          >
            <Play className="w-5 h-5" /> MARCAR INICIO AHORA
          </button>
        )}

        {err && (
          <p className="shrink-0 text-red-400 text-xs bg-red-950/40 border border-red-900 rounded-md px-3 py-2 break-words">{err}</p>
        )}

        <StatCard
          label="ETA FIN DEL PROGRAMA"
          value={etaTotalMs > 0 ? formatClock(etaTotalMs) : '—'}
          sub={etaTotalMs > 0 ? `Faltan ${formatDuration(remainingMs)} · ${remaining} turnos` : 'Esperando datos'}
        />

        <div className="flex-1 min-h-0 flex flex-col gap-2">
          <p className="text-xs font-display tracking-widest text-neutral-400 shrink-0">RESUMEN DEL PROGRAMA</p>
          <div className="grid grid-cols-3 gap-2 flex-1 min-h-0">
            <Mini label="TURNOS" value={total} />
            <Mini label="ACADEMIAS" value={academies} />
            <Mini label="CATEGORÍAS" value={categories} />
            <Mini label="MODALIDADES" value={types} />
            <Mini label="COACHES" value={coaches} />
            <Mini label="CIUDADES" value={cities} />
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, children }: {
  label: string
  value: string
  sub?: string
  children?: React.ReactNode
}) {
  return (
    <div className="bg-neutral-800 rounded-lg p-4 flex-1 min-h-0 flex flex-col justify-center">
      <p className="text-xs font-display tracking-widest text-neutral-400 leading-none">{label}</p>
      <p className="font-display text-5xl leading-none mt-3 text-yellow-400 truncate">{value}</p>
      {sub && <p className="text-sm text-neutral-300 mt-2">{sub}</p>}
      {children}
    </div>
  )
}

function Mini({ label, value }: { label: string, value: number }) {
  return (
    <div className="bg-neutral-800 rounded-lg p-3 flex flex-col items-start justify-center min-h-0">
      <p className="text-[10px] font-display tracking-widest text-neutral-400 leading-none">{label}</p>
      <p className="font-display text-3xl leading-none mt-2 text-white">{value}</p>
    </div>
  )
}

function countUnique(items: (string | null | undefined)[]): number {
  const set = new Set<string>()
  for (const it of items) {
    if (it) set.add(it)
  }
  return set.size
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${m}:${pad(s)}`
}

function formatClock(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
