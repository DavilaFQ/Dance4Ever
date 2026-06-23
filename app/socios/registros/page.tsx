'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, CoachRegistration, RegistrationDancer, RegistrationAct } from '@/lib/supabase'
import { useEventContext } from '@/app/socios/layout'
import { formatMoney, isEditedAfterConfirm } from '@/lib/format'
import { costoRegistro } from '@/lib/cost'
import { Search } from 'lucide-react'

type FilterMode = 'all' | 'pending' | 'confirmed' | 'draft' | 'edited'

export default function RegistrosPage({ onSelectRegistration }: { onSelectRegistration?: (id: string) => void }) {
  const router = useRouter()
  const { event, lastSync } = useEventContext()

  const [registrations, setRegistrations] = useState<CoachRegistration[]>([])
  const [dancers, setDancers] = useState<RegistrationDancer[]>([])
  const [acts, setActs] = useState<RegistrationAct[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterMode>('all')

  const loadAll = useCallback(async () => {
    if (!event) return
    setLoading(true)
    try {
      const [rr, dr, ar] = await Promise.all([
        supabase.from('coach_registrations').select('*').eq('event_id', event.id),
        supabase.from('registration_dancers').select('*'),
        supabase.from('registration_acts').select('*'),
      ])
      const regs = rr.data ?? []
      const regIds = new Set(regs.map(r => r.id))
      setRegistrations(regs)
      setDancers((dr.data ?? []).filter(d => regIds.has(d.registration_id)))
      setActs((ar.data ?? []).filter(a => regIds.has(a.registration_id)))
    } finally { setLoading(false) }
  }, [event])

  useEffect(() => { loadAll() }, [loadAll, lastSync])

  useEffect(() => {
    if (!event) return
    const ch = supabase
      .channel(`socios-regs-${event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_registrations', filter: `event_id=eq.${event.id}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_dancers' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_acts' }, () => loadAll())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [event, loadAll])

  const enriched = useMemo(() => {
    const list = registrations.map(r => ({
      ...r,
      dancers: dancers.filter(d => d.registration_id === r.id),
      acts: acts.filter(a => a.registration_id === r.id),
      total: costoRegistro(
        acts.filter(a => a.registration_id === r.id),
        dancers.filter(d => d.registration_id === r.id),
        r.cost_paquete, r.cost_repeticion,
        r.tickets_count ?? 0, r.extra_coaches ?? [], event
      ),
    }))
    // Ordenar alfabéticamente por academia de forma determinista
    return list.sort((a, b) => (a.academy || '').localeCompare(b.academy || ''))
  }, [registrations, dancers, acts, event])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let base = enriched
    if (filter === 'pending') base = base.filter(r => r.submitted_at && !r.submitted_at.startsWith('1970-01-01') && !r.confirmed_at)
    else if (filter === 'confirmed') base = base.filter(r => !!r.confirmed_at)
    else if (filter === 'draft') base = base.filter(r => !r.submitted_at || r.submitted_at.startsWith('1970-01-01'))
    else if (filter === 'edited') base = base.filter(r => isEditedAfterConfirm(r))
    if (!q) return base
    return base.filter(r =>
      r.coach_name?.toLowerCase().includes(q) ||
      r.academy?.toLowerCase().includes(q) ||
      r.team_name?.toLowerCase().includes(q)
    )
  }, [enriched, query, filter])

  if (!event) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-neutral-500 text-lg font-display tracking-wider uppercase">Sin evento</p>
      </div>
    )
  }

  return (
    <div className="p-4 pb-6 space-y-4">
      {/* Search Input on its own full-width line */}
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar..."
          className="search-input w-full pl-12 pr-3 py-2 bg-neutral-800/60 border border-neutral-600 text-xs focus:outline-none focus:border-fuchsia-500/50 focus:bg-neutral-800 text-white placeholder-neutral-500 rounded-xl"
        />
      </div>

      {/* Filters in their own full-width horizontal row */}
      <div className="grid grid-cols-5 gap-1 w-full registros-filters">
        {([
          { key: 'all', label: 'Todos' },
          { key: 'pending', label: 'Pendientes' },
          { key: 'confirmed', label: 'Confirmados' },
          { key: 'draft', label: 'Borrador' },
          { key: 'edited', label: 'Editados' },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`py-2 rounded-none text-[11px] font-bold border transition-all text-center truncate ${
              filter === f.key
                ? 'bg-neutral-900 text-white border-neutral-900'
                : 'bg-white text-neutral-600 border-neutral-300 hover:border-neutral-400'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Counter */}
      <div className="flex items-center justify-between text-xs text-neutral-500 px-1">
        <span>{filtered.length} de {enriched.length} registros</span>
      </div>

      {/* Academy Cards */}
      {filtered.length === 0 ? (
        <p className="text-center text-neutral-500 py-10">Sin resultados.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const isDraft = !r.submitted_at || r.submitted_at.startsWith('1970-01-01')
            const isConfirmed = !isDraft && !!r.confirmed_at
            const wasEdited = !isDraft && isEditedAfterConfirm(r)
            const isPending = !isDraft && !isConfirmed && !wasEdited

            // Calcular conteo de pulseras
            const asistentesCount = (r.extra_coaches || [])
              .filter((s: string) => s.startsWith('Asistente:') && s.replace(/^Asistente:\s*/, '').trim() !== '')
              .length
            const coachCount = 1
            const totalPulseras = r.dancers.length + asistentesCount + coachCount

            return (
              <button
                key={r.id}
                onClick={() => onSelectRegistration ? onSelectRegistration(String(r.id)) : router.push(`/socios/registros/${r.id}`)}
                className={`w-full text-left bg-neutral-800/40 rounded-2xl border p-4 hover:border-fuchsia-500/40 transition-all ${
                  isDraft ? 'border-neutral-700/30 opacity-75' :
                  wasEdited ? 'border-amber-500/40' : 
                  isPending ? 'border-orange-500/40' : 
                  'border-neutral-700/50'
                }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-lg tracking-wide uppercase text-white truncate">
                        {r.academy || '(sin academia)'}
                      </h3>
                    </div>
                    <p className="text-sm text-neutral-400 mt-0.5">
                      Coach: <span className="text-neutral-300">{r.coach_name}</span>
                    </p>
                    {r.team_name && (
                      <p className="text-xs text-neutral-500 mt-0.5">
                        Equipo: {r.team_name}
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <span className={`inline-block text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-lg shadow-sm ${
                      isConfirmed ? 'bg-green-500 text-black' :
                      wasEdited ? 'bg-amber-400 text-black' :
                      isPending ? 'bg-orange-500 text-black' :
                      'bg-amber-500 text-black'
                    }`}>
                      {isConfirmed ? 'CONFIRMADA' : wasEdited ? 'EDITADO' : isPending ? 'PENDIENTE' : 'BORRADOR'}
                    </span>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mt-3 p-3 rounded-xl bg-neutral-900/60 text-xs">
                  <div>
                    <span className="text-neutral-500 uppercase text-[9px] tracking-wider font-bold">Integrantes</span>
                    <p className="text-xl sm:text-2xl font-black text-white mt-0.5">{r.dancers.length}</p>
                  </div>
                  <div>
                    <span className="text-neutral-500 uppercase text-[9px] tracking-wider font-bold">Coreografías</span>
                    <p className="text-xl sm:text-2xl font-black text-white mt-0.5">{r.acts.length}</p>
                  </div>
                  <div>
                    <span className="text-neutral-500 uppercase text-[9px] tracking-wider font-bold">Boletos</span>
                    <p className="text-xl sm:text-2xl font-black text-fuchsia-400 mt-0.5">{r.tickets_count ?? 0}</p>
                  </div>
                </div>

                {/* Pulseras Requeridas */}
                <div className="mt-3 p-3.5 rounded-xl bg-neutral-950/40 border border-neutral-800/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-300 text-xs uppercase tracking-wider font-extrabold">
                      Pulseras a Entregar
                    </span>
                    <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                      Total: {totalPulseras}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-neutral-300">
                    <div className="flex justify-between border-r border-neutral-800 pr-3">
                      <span>Integrantes:</span>
                      <strong className="text-white font-bold">{r.dancers.length}</strong>
                    </div>
                    <div className="flex justify-between border-r border-neutral-800 px-3">
                      <span>Asistentes:</span>
                      <strong className="text-white font-bold">{asistentesCount}</strong>
                    </div>
                    <div className="flex justify-between pl-3">
                      <span>Coach:</span>
                      <strong className="text-white font-bold">{coachCount}</strong>
                    </div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
