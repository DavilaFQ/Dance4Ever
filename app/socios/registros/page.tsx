'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, CoachRegistration, RegistrationDancer, RegistrationAct } from '@/lib/supabase'
import { useEventContext } from '@/app/socios/layout'
import { formatMoney, isEditedAfterConfirm } from '@/lib/format'
import { costoRegistro } from '@/lib/cost'
import { Search } from 'lucide-react'

type FilterMode = 'all' | 'confirmed' | 'draft' | 'edited'

export default function RegistrosPage() {
  const router = useRouter()
  const { event } = useEventContext()

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

  useEffect(() => { loadAll() }, [loadAll])

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

  const enriched = useMemo(() =>
    registrations.map(r => ({
      ...r,
      dancers: dancers.filter(d => d.registration_id === r.id),
      acts: acts.filter(a => a.registration_id === r.id),
      total: costoRegistro(
        acts.filter(a => a.registration_id === r.id),
        dancers.filter(d => d.registration_id === r.id),
        r.cost_paquete, r.cost_repeticion,
        r.tickets_count ?? 0, r.extra_coaches ?? [], event
      ),
    })),
    [registrations, dancers, acts, event]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let base = enriched
    if (filter === 'confirmed') base = base.filter(r => !!r.confirmed_at)
    else if (filter === 'draft') base = base.filter(r => !r.confirmed_at)
    else if (filter === 'edited') base = base.filter(r => isEditedAfterConfirm(r))
    if (!q) return base
    return base.filter(r =>
      r.coach_name?.toLowerCase().includes(q) ||
      r.academy?.toLowerCase().includes(q) ||
      r.team_name?.toLowerCase().includes(q)
    )
  }, [enriched, query, filter])

  if (loading && !event) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 rounded-full border-2 border-fuchsia-500/20 border-t-fuchsia-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 pb-6 space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar academia, coach, equipo..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-800/60 border border-neutral-700/50 text-sm focus:outline-none focus:border-fuchsia-500/50 focus:bg-neutral-800 text-white placeholder-neutral-500"
        />
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {([
          { key: 'all', label: 'Todos' },
          { key: 'confirmed', label: 'Confirmados' },
          { key: 'draft', label: 'Borrador' },
          { key: 'edited', label: 'Editados' },
        ] as const).map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold tracking-wider border transition-all shrink-0 ${
              filter === f.key
                ? 'bg-fuchsia-500 text-white border-fuchsia-500'
                : 'bg-neutral-800/50 text-neutral-400 border-neutral-700/50 hover:border-neutral-600'
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
            const isConfirmed = !!r.confirmed_at
            const wasEdited = isEditedAfterConfirm(r)
            return (
              <button
                key={r.id}
                onClick={() => router.push(`/socios/registros/${r.id}`)}
                className={`w-full text-left bg-neutral-800/40 rounded-2xl border p-4 hover:border-fuchsia-500/40 transition-all ${
                  wasEdited ? 'border-amber-500/40' : 'border-neutral-700/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-lg tracking-wide uppercase text-white truncate">
                        {r.academy || '(sin academia)'}
                      </h3>
                      {wasEdited && (
                        <span className="text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
                          EDITADO
                        </span>
                      )}
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
                    <p className="font-display text-xl text-green-400">{formatMoney(r.total)}</p>
                    <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mt-1 ${
                      isConfirmed ? 'bg-green-500/15 text-green-400' :
                      'bg-amber-500/15 text-amber-400'
                    }`}>
                      {isConfirmed ? 'CONFIRMADA' : 'BORRADOR'}
                    </span>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 mt-3 p-2.5 rounded-xl bg-neutral-900/40 text-xs">
                  <div>
                    <span className="text-neutral-500 uppercase text-[9px] tracking-wider">Alumnos</span>
                    <p className="font-display text-sm text-white mt-0.5">{r.dancers.length}</p>
                  </div>
                  <div>
                    <span className="text-neutral-500 uppercase text-[9px] tracking-wider">Actos</span>
                    <p className="font-display text-sm text-white mt-0.5">{r.acts.length}</p>
                  </div>
                  <div>
                    <span className="text-neutral-500 uppercase text-[9px] tracking-wider">Boletos</span>
                    <p className="font-display text-sm text-fuchsia-400 mt-0.5">{r.tickets_count ?? 0}</p>
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
