'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { supabase, CoachRegistration, RegistrationDancer, RegistrationAct } from '@/lib/supabase'
import { useEventContext } from '@/app/socios/layout'
import { costoRegistro, costBreakdown, MODALITY_MIN_DANCERS } from '@/lib/cost'
import { formatMoney, isEditedAfterConfirm } from '@/lib/format'
import { STATUS } from '../colors'
import { Search, DollarSign, Download, FileSpreadsheet } from 'lucide-react'
import { exportRegistrations } from '@/lib/export'

export default function FinanzasPage() {
  const { event, lastSync, hideFinancials } = useEventContext()

  const [registrations, setRegistrations] = useState<CoachRegistration[]>([])
  const [dancers, setDancers] = useState<RegistrationDancer[]>([])
  const [acts, setActs] = useState<RegistrationAct[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [payments, setPayments] = useState<Record<number, { paid: number; note?: string }>>({})
  const [exportingRegs, setExportingRegs] = useState(false)
  const broadcastRef = useRef<any>(null)
  const debounceTimers = useRef<Record<number, NodeJS.Timeout>>({})

  useEffect(() => {
    return () => {
      // Limpiar todos los temporizadores al desmontar el componente
      Object.values(debounceTimers.current).forEach(clearTimeout)
    }
  }, [])

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

  const enriched = useMemo(() => {
    const list = registrations.filter(r => r.confirmed_at).map(r => ({
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
    // Ordenar alfabéticamente por academia de forma determinista para que nunca salten de lugar
    return list.sort((a, b) => (a.academy || '').localeCompare(b.academy || ''))
  }, [registrations, dancers, acts, event])

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

  const sortedFiltered = useMemo(() => {
    const list = [...filtered]
    return list.sort((a, b) => {
      const paidA = payments[a.id]?.paid ?? 0
      const restA = a.total - paidA
      const isPaidA = restA <= 0

      const paidB = payments[b.id]?.paid ?? 0
      const restB = b.total - paidB
      const isPaidB = restB <= 0

      if (isPaidA !== isPaidB) {
        return isPaidA ? 1 : -1
      }
      return (a.academy || '').localeCompare(b.academy || '')
    })
  }, [filtered, payments])

  const updatePayment = useCallback((regId: number, paid: number, maxAmount: number) => {
    const val = Math.min(maxAmount, Math.max(0, paid))
    
    // 1. Actualización instantánea en el estado local de UI (sin lag)
    setPayments(prev => ({
      ...prev,
      [regId]: { ...prev[regId], paid: val }
    }))

    // 2. Cancelar el temporizador anterior si el usuario sigue escribiendo rápido
    if (debounceTimers.current[regId]) {
      clearTimeout(debounceTimers.current[regId])
    }

    // 3. Crear un nuevo temporizador para guardar en BD después de 500ms de inactividad
    debounceTimers.current[regId] = setTimeout(async () => {
      try {
        await supabase.from('coach_registrations').update({ paid: val }).eq('id', regId)
        if (broadcastRef.current) {
          broadcastRef.current.send({ type: 'broadcast', event: 'ledger_update', payload: { regId, paid: val } }).catch(() => {})
        }
      } catch (err) {
        console.error('Error actualizando abono en BD:', err)
      }
    }, 500)
  }, [])

  const showAmount = useCallback((amount: number) => {
    return hideFinancials ? '••••' : formatMoney(amount)
  }, [hideFinancials])

  if (!event) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-neutral-500 text-lg font-display tracking-wider uppercase">Sin evento</p>
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
          <p className="font-display text-lg text-fuchsia-400 mt-0.5"   style={{ color: STATUS.primary }}>{showAmount(totals.facturado)}</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-3 text-center">
          <p className="text-[9px] text-neutral-500 uppercase tracking-wider">Cobrado</p>
          <p className="font-display text-lg text-green-400 mt-0.5"   style={{ color: STATUS.success }}>{showAmount(totals.cobrado)}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-center">
          <p className="text-[9px] text-neutral-500 uppercase tracking-wider">Pendiente</p>
          <p className="font-display text-lg text-amber-400 mt-0.5" style={{ color: STATUS.warning }}>{showAmount(totals.pendiente)}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar academia..."
          style={{ border: '2px solid #525252', backgroundColor: '#171717', color: '#ffffff' }}
          className="search-input w-full pl-12 pr-4 py-2 rounded-xl text-sm focus:outline-none focus:border-fuchsia-500/50 placeholder-neutral-500"
        />
      </div>

      {/* Ledger table */}
      {sortedFiltered.length === 0 ? (
        <p className="text-center text-neutral-500 py-10">Sin registros confirmados.</p>
      ) : (
        <div className="space-y-2">
          {sortedFiltered.map(r => {
            const paid = payments[r.id]?.paid ?? 0
            const rest = r.total - paid
            return (
              <div key={r.id} className="bg-neutral-800/30 rounded-xl border border-neutral-700/40 p-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate text-white flex items-center gap-2">
                      {r.academy || '(sin academia)'}
                    </p>
                    <p className="text-xs text-neutral-400">Coach: {r.coach_name}</p>
                    <p className="text-xs text-neutral-500">{r.dancers.length} integrantes / {r.acts.length} coreografías / {r.tickets_count ?? 0} boletos</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-medium" style={{ color: '#ffffff' }}>Total: {showAmount(r.total)}</p>
                    <p className="text-xs font-medium" style={{ color: STATUS.success }}>Cobrado: {showAmount(paid)}</p>
                    <p 
                      style={rest > 0 ? { color: STATUS.warning } : { color: STATUS.success }}
                      className="text-xs font-bold"
                    >
                      {rest > 0 ? `${showAmount(rest)} pendiente` : 'Saldado'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type={hideFinancials ? 'password' : 'number'}
                    inputMode="numeric"
                    autoComplete="off"
                    min={0}
                    max={r.total}
                    value={paid || ''}
                    onChange={e => {
                      const val = Math.min(r.total, Math.max(0, Number(e.target.value) || 0))
                      updatePayment(r.id, val, r.total)
                    }}
                    placeholder={hideFinancials ? '••••' : '0'}
                    style={{ border: '2px solid #525252', backgroundColor: '#171717', color: '#ffffff', padding: '6px 10px' }}
                    className="w-28 rounded-lg text-sm text-center focus:outline-none focus:border-fuchsia-500 font-mono"
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
