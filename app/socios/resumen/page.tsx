'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase, CoachRegistration, RegistrationDancer, RegistrationAct, AGE_CATEGORY_ORDER, AGE_CATEGORY_LABELS } from '@/lib/supabase'
import { useEventContext } from '@/app/socios/layout'
import { formatMoney, formatRelative, safeFormatDate, isEditedAfterConfirm } from '@/lib/format'
import { costoRegistro } from '@/lib/cost'
import { Building2, Users, Activity, AlertTriangle, TrendingUp, DollarSign } from 'lucide-react'

export default function ResumenPage() {
  const { event, lastSync } = useEventContext()

  const [registrations, setRegistrations] = useState<CoachRegistration[]>([])
  const [dancers, setDancers] = useState<RegistrationDancer[]>([])
  const [acts, setActs] = useState<RegistrationAct[]>([])
  const [loading, setLoading] = useState(true)

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
      .channel(`socios-resumen-${event.id}`)
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
        r.cost_paquete, r.cost_repeticion, r.tickets_count ?? 0, r.extra_coaches ?? [], event
      ),
    })),
    [registrations, dancers, acts, event]
  )

  const confirmed = useMemo(() => enriched.filter(r => r.confirmed_at), [enriched])

  const kpis = useMemo(() => {
    const academies = new Set(enriched.map(r => r.academy.trim().toLowerCase()).filter(Boolean))
    const allCoaches = new Set<string>()
    enriched.forEach(r => {
      if (r.coach_name) allCoaches.add(r.coach_name.trim().toLowerCase())
      r.extra_coaches?.forEach(x => x && allCoaches.add(x.trim().toLowerCase()))
    })
    return {
      academias: academies.size,
      coaches: allCoaches.size,
      alumnos: enriched.reduce((s, r) => s + r.dancers.length, 0),
      actos: enriched.reduce((s, r) => s + r.acts.length, 0),
      ingresoProyectado: enriched.reduce((s, r) => s + r.total, 0),
      ingresoConfirmado: confirmed.reduce((s, r) => s + r.total, 0),
      confirmadas: confirmed.length,
      enProgreso: enriched.length - confirmed.length,
      editados: confirmed.filter(r => isEditedAfterConfirm(r)).length,
      cobrado: enriched.reduce((s, r) => s + (r.paid ?? 0), 0),
    }
  }, [enriched, confirmed])

  const curve = useMemo(() => {
    if (enriched.length === 0) return null
    const byDay = new Map<string, number>()
    enriched.forEach(r => {
      const d = (r.submitted_at ?? '').slice(0, 10)
      if (d) byDay.set(d, (byDay.get(d) ?? 0) + 1)
    })
    const days = [...byDay.keys()].sort()
    let cum = 0
    return days.map(d => ({ date: d, count: (cum += byDay.get(d)!) }))
  }, [enriched])

  const pendientes = useMemo(() => {
    const out: { id: number; coach: string; academy: string; phone: string; issue: string; severity: 'high' | 'med' | 'low' }[] = []
    const sixHoursAgo = Date.now() - 6 * 3600 * 1000
    enriched.forEach(r => {
      if (r.confirmed_at) return
      const stale = new Date(r.submitted_at).getTime() < sixHoursAgo
      const missingBirthdate = r.dancers.some(d => !d.birthdate)
      const incompleteActs = r.acts.some(a => !a.level || !a.style || !a.age_category)
      const missingName = !r.team_name?.trim()
      if (stale) out.push({ id: r.id, coach: r.coach_name, academy: r.academy, phone: r.coach_phone, issue: 'Sin confirmar por mas de 6 horas', severity: 'high' })
      if (missingBirthdate) out.push({ id: r.id, coach: r.coach_name, academy: r.academy, phone: r.coach_phone, issue: 'Integrante sin fecha de nacimiento', severity: 'med' })
      if (incompleteActs) out.push({ id: r.id, coach: r.coach_name, academy: r.academy, phone: r.coach_phone, issue: 'Coreografía sin nivel/estilo/categoría', severity: 'med' })
      if (missingName) out.push({ id: r.id, coach: r.coach_name, academy: r.academy, phone: r.coach_phone, issue: 'Equipo sin nombre', severity: 'low' })
    })
    return out
  }, [enriched])

  const topAcademies = useMemo(() => {
    const m = new Map<string, { name: string; acts: number; dancers: number; income: number }>()
    enriched.forEach(r => {
      const key = r.academy.trim() || '(sin academia)'
      const cur = m.get(key) ?? { name: key, acts: 0, dancers: 0, income: 0 }
      cur.acts += r.acts.length; cur.dancers += r.dancers.length; cur.income += r.total
      m.set(key, cur)
    })
    return [...m.values()].sort((a, b) => b.income - a.income).slice(0, 10)
  }, [enriched])

  const activity = useMemo(() => enriched.map(r => ({
    id: r.id, academy: r.academy, coach: r.coach_name, action: r.confirmed_at ? 'Confirmo su registro' : 'Inicio registro', at: r.confirmed_at ?? r.submitted_at,
  })).sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).slice(0, 15), [enriched])

  if (loading && !event) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 rounded-full border-2 border-fuchsia-500/20 border-t-fuchsia-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 pb-6 space-y-5">
      <div className="bg-neutral-800/50 rounded-2xl border border-neutral-700/50 p-4">
        <h1 className="font-display text-xl tracking-wider uppercase">
          {event ? event.name : 'Sin evento'}
        </h1>
        {event && <p className="text-xs text-neutral-400 mt-0.5">{safeFormatDate(event.date, { day: '2-digit', month: 'long', year: 'numeric' })}</p>}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <KpiCard label="Academias" value={kpis.academias} icon={Building2} />
        <KpiCard label="Coaches" value={kpis.coaches} icon={Users} />
        <KpiCard label="Integrantes" value={kpis.alumnos} icon={Users} />
        <KpiCard label="Coreografías" value={kpis.actos} icon={Activity} />
        <KpiCard label="Confirmados" value={kpis.confirmadas} sub={`${kpis.enProgreso} borrador`} accent="success" />
        <KpiCard label="Borrador" value={kpis.enProgreso} accent="accent" />
        <KpiCard label="Proyectado" value={formatMoney(kpis.ingresoProyectado)} accent="primary" />
        <KpiCard label="Cobrado" value={formatMoney(kpis.cobrado)} sub={kpis.ingresoProyectado > 0 ? `Resta ${formatMoney(kpis.ingresoProyectado - kpis.cobrado)}` : undefined} accent="success" />
      </div>

      {kpis.editados > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <p className="text-amber-300 text-sm font-bold">{kpis.editados} registro{kpis.editados !== 1 ? 's' : ''} editado{kpis.editados !== 1 ? 's' : ''} despues de confirmar</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Section title="Curva de Registros" icon={TrendingUp}>
            {curve && curve.length > 1 ? <RegistrationCurve points={curve} /> : <p className="text-sm text-neutral-500 text-center py-6">Aun no hay suficientes datos.</p>}
          </Section>
        </div>
        <div>
          <Section title="Alertas" icon={AlertTriangle} subtitle={`${pendientes.length} pendientes`}>
            {pendientes.length === 0 ? <p className="text-sm text-neutral-500 text-center py-6">Todo al dia.</p> : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {pendientes.map((p, i) => (
                  <div key={i} className="flex items-start gap-2 p-2.5 rounded-xl bg-neutral-800/30 border border-neutral-700/30">
                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${p.severity === 'high' ? 'bg-amber-400' : p.severity === 'med' ? 'bg-fuchsia-400' : 'bg-neutral-500'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{p.academy || '(sin academia)'}</p>
                      <p className="text-xs text-neutral-400">{p.coach}</p>
                      <p className="text-xs text-neutral-500 mt-0.5">{p.issue}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      {topAcademies.length > 0 && (
        <Section title="Top Academias" icon={DollarSign}>
          <div className="space-y-2">
            {topAcademies.map((a, i) => (
              <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-800/20 border border-neutral-700/20">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-display text-lg text-fuchsia-500 w-6 text-right">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{a.name}</p>
                    <p className="text-xs text-neutral-400">{a.dancers} integrantes / {a.acts} coreografías</p>
                  </div>
                </div>
                <span className="font-display text-base text-green-400 shrink-0">{formatMoney(a.income)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {activity.length > 0 && (
        <Section title="Actividad Reciente" icon={Activity}>
          <div className="divide-y divide-neutral-700/30 max-h-72 overflow-y-auto">
            {activity.map((a, i) => (
              <div key={i} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${a.action.includes('Confirmo') ? 'bg-green-400' : 'bg-amber-400'}`} />
                  <p className="truncate">
                    <strong>{a.academy || '(sin academia)'}</strong>
                    <span className="text-neutral-500"> · {a.coach}</span>
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs bg-neutral-800 px-2 py-0.5 rounded-full">{a.action}</span>
                  <p className="text-[10px] text-neutral-500 mt-0.5">{formatRelative(a.at)}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function KpiCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string; icon?: React.ComponentType<{ className?: string }>; accent?: 'primary' | 'success' | 'accent'
}) {
  const color = accent === 'success' ? 'text-green-400' : accent === 'accent' ? 'text-amber-400' : accent === 'primary' ? 'text-fuchsia-500' : 'text-white'
  return (
    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-3">
      <div className="flex items-center gap-1 text-[10px] tracking-widest uppercase text-neutral-500 mb-1 font-bold">
        {Icon && <Icon className="w-3.5 h-3.5" />}{label}
      </div>
      <p className={`font-display text-xl leading-tight ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-neutral-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function Section({ title, subtitle, icon: Icon, children }: {
  title: string; subtitle?: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode
}) {
  return (
    <div className="bg-neutral-800/30 rounded-2xl border border-neutral-700/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-fuchsia-500 shrink-0" />
        <div>
          <h2 className="font-display text-base tracking-wider uppercase">{title}</h2>
          {subtitle && <p className="text-xs text-neutral-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  )
}

function RegistrationCurve({ points }: { points: { date: string; count: number }[] }) {
  const w = 500; const h = 120; const pad = 10
  const max = Math.max(...points.map(p => p.count), 1)
  const xs = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2)
  const ys = (n: number) => h - pad - (n / max) * (h - pad * 2)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(p.count).toFixed(1)}`).join(' ')
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28" preserveAspectRatio="none">
        <path d={`${path} L ${xs(points.length - 1).toFixed(1)} ${h - pad} L ${xs(0).toFixed(1)} ${h - pad} Z`} fill="rgba(217, 70, 239, 0.08)" />
        <path d={path} fill="none" stroke="rgb(217, 70, 239)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => <circle key={p.date} cx={xs(i)} cy={ys(p.count)} r={3} fill="rgb(217, 70, 239)" />)}
      </svg>
      <div className="flex justify-between text-[10px] text-neutral-500 font-bold mt-1.5 uppercase tracking-wider">
        <span>{points[0].date}</span><span>{points[points.length - 1].date}</span>
      </div>
      <p className="text-xs text-neutral-400 mt-1.5">Total: <strong className="text-fuchsia-500 text-sm">{points[points.length - 1].count}</strong> registros</p>
    </div>
  )
}
