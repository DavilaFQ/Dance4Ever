'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { supabase, CoachRegistration, RegistrationDancer, RegistrationAct } from '@/lib/supabase'
import { useEventContext } from '@/app/socios/layout'
import { costoRegistro, costBreakdown, MODALITY_MIN_DANCERS } from '@/lib/cost'
import { formatMoney, isEditedAfterConfirm } from '@/lib/format'
import { Search, DollarSign, Download, FileSpreadsheet } from 'lucide-react'
import { exportRegistrations } from '@/lib/export'

export default function FinanzasPage() {
  const { event, lastSync } = useEventContext()

  const [registrations, setRegistrations] = useState<CoachRegistration[]>([])
  const [dancers, setDancers] = useState<RegistrationDancer[]>([])
  const [acts, setActs] = useState<RegistrationAct[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [payments, setPayments] = useState<Record<number, { paid: number; note?: string }>>({})
  const [exportingRegs, setExportingRegs] = useState(false)
  const broadcastRef = useRef<any>(null)

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

      const dbPayments: Record<number, { paid: number; note?: string }> = {}
      regs.forEach((r: any) => {
        dbPayments[r.id] = { paid: r.paid ?? 0, note: r.payment_notes ?? '' }
      })
      setPayments(dbPayments)
    } finally { setLoading(false) }
  }, [event])

  useEffect(() => { loadAll() }, [loadAll, lastSync])

  useEffect(() => {
    if (!event) return
    const ch = supabase
      .channel(`socios-fin-${event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_registrations', filter: `event_id=eq.${event.id}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_dancers' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_acts' }, () => loadAll())
      .subscribe()

    const bc = supabase.channel(`broadcast-${event.id}`, { config: { broadcast: { self: true } } })
    bc.on('broadcast', { event: 'ledger_update' }, (payload) => {
      const { regId, paid } = payload.payload
      if (paid !== undefined) {
        setPayments(prev => {
          const next = { ...prev, [regId]: { ...prev[regId], paid } }
          try { localStorage.setItem('d4e:socios:payments', JSON.stringify(next)) } catch {}
          return next
        })
      }
    })
    bc.subscribe((status) => {
      if (status === 'SUBSCRIBED') broadcastRef.current = bc
    })

    return () => { supabase.removeChannel(ch); supabase.removeChannel(bc) }
  }, [event, loadAll])

  const enriched = useMemo(() =>
    registrations.filter(r => r.confirmed_at).map(r => ({
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
    if (!q) return enriched
    return enriched.filter(r =>
      r.academy?.toLowerCase().includes(q) ||
      r.coach_name?.toLowerCase().includes(q)
    )
  }, [enriched, query])

  const totals = useMemo(() => {
    const facturado = enriched.reduce((s, r) => s + r.total, 0)
    const cobrado = enriched.reduce((s, r) => s + (payments[r.id]?.paid ?? 0), 0)
    return { facturado, cobrado, pendiente: facturado - cobrado }
  }, [enriched, payments])

  async function updatePayment(regId: number, paid: number) {
    const val = Math.max(0, paid)
    setPayments(prev => ({
      ...prev,
      [regId]: { ...prev[regId], paid: val }
    }))
    await supabase.from('coach_registrations').update({ paid: val }).eq('id', regId)
    if (broadcastRef.current) {
      broadcastRef.current.send({ type: 'broadcast', event: 'ledger_update', payload: { regId, paid: val } }).catch(() => {})
    }
  }

  if (loading && !event) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 rounded-full border-2 border-fuchsia-500/20 border-t-fuchsia-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 pb-6 space-y-4">
      <h1 className="font-display text-xl tracking-wider uppercase">Finanzas</h1>

      {/* Top cards */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-fuchsia-500/10 border border-fuchsia-500/30 rounded-2xl p-3 text-center">
          <p className="text-[9px] text-neutral-500 uppercase tracking-wider">Facturado</p>
          <p className="font-display text-lg text-fuchsia-400 mt-0.5">{formatMoney(totals.facturado)}</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-3 text-center">
          <p className="text-[9px] text-neutral-500 uppercase tracking-wider">Cobrado</p>
          <p className="font-display text-lg text-green-400 mt-0.5">{formatMoney(totals.cobrado)}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-center">
          <p className="text-[9px] text-neutral-500 uppercase tracking-wider">Pendiente</p>
          <p className="font-display text-lg text-amber-400 mt-0.5">{formatMoney(totals.pendiente)}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar academia..."
          className="w-full pl-9 pr-4 py-2 rounded-xl bg-neutral-800/60 border border-neutral-700/50 text-sm focus:outline-none focus:border-fuchsia-500/50 text-white placeholder-neutral-500"
        />
      </div>

      {/* Export */}
      <button
        onClick={async () => {
          if (!event) return
          setExportingRegs(true)
          try { await exportRegistrations(event) } catch (e) {
            alert('Error: ' + (e as Error).message)
          } finally { setExportingRegs(false) }
        }}
        disabled={exportingRegs || enriched.length === 0}
        className="w-full py-2.5 bg-fuchsia-500 text-white font-display text-sm tracking-wider rounded-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <FileSpreadsheet className="w-4 h-4" />
        {exportingRegs ? 'GENERANDO...' : 'EXPORTAR FINANZAS XLSX'}
      </button>

      {/* Ledger table */}
      {filtered.length === 0 ? (
        <p className="text-center text-neutral-500 py-10">Sin registros confirmados.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => {
            const paid = payments[r.id]?.paid ?? 0
            const rest = r.total - paid
            return (
              <div key={r.id} className="bg-neutral-800/30 rounded-xl border border-neutral-700/40 p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate text-white">{r.academy || '(sin academia)'}</p>
                    <p className="text-xs text-neutral-400">Coach: {r.coach_name}</p>
                    <p className="text-xs text-neutral-500">{r.dancers.length} integrantes / {r.acts.length} coreografías / {r.tickets_count ?? 0} boletos</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-display text-base text-green-400">{formatMoney(r.total)}</p>
                    <p className={`text-xs font-bold ${rest > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                      {formatMoney(rest)} pendiente
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={paid || ''}
                    onChange={e => updatePayment(r.id, Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-28 px-2 py-1.5 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-center text-white focus:outline-none focus:border-fuchsia-500"
                  />
                  <span className="text-xs text-neutral-500">Abono registrado</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
