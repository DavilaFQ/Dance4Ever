'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase, CoachRegistration, RegistrationDancer, RegistrationAct, AGE_CATEGORY_ORDER, AGE_CATEGORY_LABELS } from '@/lib/supabase'
import { useEventContext } from '@/app/socios/layout'
import { formatMoney, formatRelative, safeFormatDate, isEditedAfterConfirm } from '@/lib/format'
import { costoRegistro } from '@/lib/cost'
import { Building2, Users, Activity, AlertTriangle, TrendingUp, DollarSign, Copy, Check, MessageCircle } from 'lucide-react'
import { CHART } from '../colors'

export default function ResumenPage() {
  const { event, lastSync, qrUrl } = useEventContext()
  const [copied, setCopied] = useState(false)
  const [linkExpanded, setLinkExpanded] = useState(false)

  const [registrations, setRegistrations] = useState<CoachRegistration[]>([])
  const [dancers, setDancers] = useState<RegistrationDancer[]>([])
  const [acts, setActs] = useState<RegistrationAct[]>([])
  const [loading, setLoading] = useState(true)
  const [alertasExpanded, setAlertasExpanded] = useState(false)
  const [academiesExpanded, setAcademiesExpanded] = useState(false)
  const [actividadExpanded, setActividadExpanded] = useState(false)

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
    const academies = new Set(confirmed.map(r => r.academy.trim().toLowerCase()).filter(Boolean))
    const allCoaches = new Set<string>()
    confirmed.forEach(r => {
      if (r.coach_name) allCoaches.add(r.coach_name.trim().toLowerCase())
      r.extra_coaches?.forEach(x => x && allCoaches.add(x.trim().toLowerCase()))
    })
    return {
      academias: academies.size,
      coaches: allCoaches.size,
      alumnos: confirmed.reduce((s, r) => s + r.dancers.length, 0),
      actos: confirmed.reduce((s, r) => s + r.acts.length, 0),
      ingresoProyectado: confirmed.reduce((s, r) => s + r.total, 0),
      ingresoConfirmado: confirmed.reduce((s, r) => s + r.total, 0),
      confirmadas: confirmed.length,
      enProgreso: enriched.length - confirmed.length,
      editados: confirmed.filter(r => isEditedAfterConfirm(r)).length,
      cobrado: confirmed.reduce((s, r) => s + (r.paid ?? 0), 0),
    }
  }, [enriched, confirmed])

  const curve = useMemo(() => {
    if (confirmed.length === 0) return null
    const byDay = new Map<string, number>()
    confirmed.forEach(r => {
      const d = (r.confirmed_at ?? '').slice(0, 10)
      if (d) byDay.set(d, (byDay.get(d) ?? 0) + 1)
    })
    const days = [...byDay.keys()].sort()
    let cum = 0
    return days.map(d => ({ date: d, count: (cum += byDay.get(d)!) }))
  }, [confirmed])

  const pendientes = useMemo(() => {
    const out: { id: number; coach: string; academy: string; phone: string; issue: string; severity: 'high' | 'med' | 'low' }[] = []
    const sixHoursAgo = Date.now() - 6 * 3600 * 1000
    enriched.forEach(r => {
      // Excluir borradores temporales de las alertas
      if (!r.submitted_at || r.submitted_at.startsWith('1970-01-01')) return

      // Alertas de entradas adicionales (Aplica a registros confirmados y pendientes)
      if (r.tickets_count && r.tickets_count > 0) {
        out.push({
          id: r.id,
          coach: r.coach_name,
          academy: r.academy,
          phone: r.coach_phone,
          issue: `Solicitó ${r.tickets_count} entrada${r.tickets_count === 1 ? '' : 's'} adicional${r.tickets_count === 1 ? '' : 'es'}${r.confirmed_at ? ' (Confirmado)' : ''}`,
          severity: 'med',
        })
      }

      // El resto de alertas de datos incompletos solo aplican a registros NO confirmados
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
    confirmed.forEach(r => {
      const key = r.academy.trim() || '(sin academia)'
      const cur = m.get(key) ?? { name: key, acts: 0, dancers: 0, income: 0 }
      cur.acts += r.acts.length; cur.dancers += r.dancers.length; cur.income += r.total
      m.set(key, cur)
    })
    return [...m.values()].sort((a, b) => b.income - a.income).slice(0, 10)
  }, [confirmed])

  const activity = useMemo(() => enriched.map(r => ({
    id: r.id, academy: r.academy, coach: r.coach_name, action: r.confirmed_at ? 'Registro confirmado' : 'Registro en revisión', at: r.confirmed_at ?? r.submitted_at,
  })).sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).slice(0, 15), [enriched])

  const visibleAlertas = useMemo(() => {
    return alertasExpanded ? pendientes : pendientes.slice(0, 4)
  }, [pendientes, alertasExpanded])

  const visibleAcademies = useMemo(() => {
    return academiesExpanded ? topAcademies : topAcademies.slice(0, 4)
  }, [topAcademies, academiesExpanded])

  const visibleActivity = useMemo(() => {
    return actividadExpanded ? activity : activity.slice(0, 4)
  }, [activity, actividadExpanded])

  if (!event) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-neutral-500 text-lg font-display tracking-wider uppercase">Sin evento</p>
      </div>
    )
  }

  return (
    <div className="p-4 pb-6 space-y-5">
      <div className="bg-neutral-800/50 rounded-none border border-neutral-700/50 p-4 text-center">
        <h1 className="font-display text-3xl tracking-wider uppercase font-bold text-neutral-800">
          {event ? event.name : 'Sin evento'}
        </h1>
        {event && <p className="text-sm font-semibold tracking-widest text-neutral-500 uppercase mt-1.5">{safeFormatDate(event.date, { day: '2-digit', month: 'long', year: 'numeric' }).replace(/\s*de\s*/gi, '-').replace(/\s+/g, '-')}</p>}
      </div>

      {/* COLLAPSIBLE REGISTRATION LINK BAR */}
      <div className="w-full">
        {/* Collapsible Bar Header Button */}
        <button
          onClick={() => setLinkExpanded(!linkExpanded)}
          className="w-full py-3.5 px-4 bg-fuchsia-500/10 hover:bg-fuchsia-500/15 border border-fuchsia-500/20 active:scale-98 transition-all flex items-center justify-center font-display text-base tracking-widest font-bold text-fuchsia-600 rounded-none relative"
        >
          {/* Absolute Positioned Arrow on the left */}
          <span className="absolute left-4 text-xs transition-transform duration-300 transform select-none">
            {linkExpanded ? '▲' : '▼'}
          </span>
          {/* Pulsing/Blinking Text Centered */}
          <span className="animate-pulse">
            LINK DEL REGISTRO
          </span>
          {/* Absolute Positioned Arrow on the right */}
          <span className="absolute right-4 text-xs transition-transform duration-300 transform select-none">
            {linkExpanded ? '▲' : '▼'}
          </span>
        </button>

        {/* Collapsible Content */}
        {linkExpanded && (
          <div className="py-3 px-0 bg-transparent border-none space-y-2 flex flex-col items-center">
            
            {/* 1. QR Code */}
            {qrUrl ? (
              <div className="bg-white p-2.5 border border-neutral-200 shadow-sm flex items-center justify-center max-w-[160px] aspect-square rounded-none mb-1">
                <img src={qrUrl} alt="QR Registro" className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="text-xs text-neutral-500 font-bold uppercase tracking-wider animate-pulse mb-1">
                Generando QR...
              </div>
            )}

            {/* 2. Copy Link Button */}
            <button
              onClick={() => {
                if (!event?.registration_token) return
                const origin = typeof window !== 'undefined' ? window.location.origin : ''
                const url = `${origin}/register/${event.id}?t=${event.registration_token}`
                navigator.clipboard.writeText(url).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                })
              }}
              disabled={!event?.registration_token}
              className={`w-full py-4 px-4 font-bold rounded-none flex items-center justify-center gap-3 transition-all active:scale-95 text-lg uppercase tracking-wider font-display border shrink-0 ${
                copied
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700 text-white'
              }`}
            >
              {copied ? 'Copiado con exito' : 'Copiar Enlace'}
            </button>

            {/* 3. WhatsApp Button */}
            <button
              onClick={() => {
                if (!event?.registration_token) return
                const origin = typeof window !== 'undefined' ? window.location.origin : ''
                window.open(
                  `https://wa.me/?text=${encodeURIComponent(
                    `¡Hola! Te comparto el enlace de registro oficial de *Dance4Ever* para nuestro próximo evento *${event.name}*:\n\n🔗 ${origin}/register/${event.id}?t=${event.registration_token}\n\nPor favor, ingresa aquí para registrar a tus integrantes y coreografías. ¡Te esperamos!`
                  )}`,
                  '_blank'
                )
              }}
              disabled={!event?.registration_token}
              className="w-full py-4 px-4 bg-[#25D366] hover:bg-[#20BA5A] text-white font-bold rounded-none flex items-center justify-center gap-3 transition-all shadow-md active:scale-95 text-lg uppercase tracking-wider font-display shrink-0"
            >
              <MessageCircle className="w-6 h-6 text-white shrink-0" />
              Compartir por WhatsApp
            </button>
            
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <KpiCard label="Academias" value={kpis.academias} icon={Building2} accent="indigo" />
        <KpiCard label="Coaches" value={kpis.coaches} icon={Users} accent="teal" />
        <KpiCard label="Integrantes" value={kpis.alumnos} icon={Users} accent="sky" />
        <KpiCard label="Coreografías" value={kpis.actos} icon={Activity} accent="orange" />
        <KpiCard label="Confirmados" value={kpis.confirmadas} sub={`${kpis.enProgreso} pendientes`} accent="sky" />
        <KpiCard label="Pendientes" value={kpis.enProgreso} accent="orange" />
        <KpiCard label="Proyectado" value={formatMoney(kpis.ingresoProyectado)} accent="indigo" />
        <KpiCard label="Cobrado" value={formatMoney(kpis.cobrado)} sub={kpis.ingresoProyectado > 0 ? `Resta ${formatMoney(kpis.ingresoProyectado - kpis.cobrado)}` : undefined} accent="teal" />
      </div>

      {kpis.editados > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-none px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <p className="text-amber-300 text-sm font-bold">{kpis.editados} registro{kpis.editados !== 1 ? 's' : ''} editado{kpis.editados !== 1 ? 's' : ''} despues de confirmar</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        <div>
          <Section title="Alertas" icon={AlertTriangle} subtitle={`${pendientes.length} pendientes`}>
            {pendientes.length === 0 ? <p className="text-sm text-neutral-500 text-center py-6">Todo al dia.</p> : (
              <div>
                <div className="space-y-2">
                  {visibleAlertas.map((p, i) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 rounded-none bg-neutral-800/20 border border-neutral-700/20">
                      <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${p.severity === 'high' ? 'bg-amber-400' : p.severity === 'med' ? 'bg-fuchsia-400' : 'bg-neutral-500'}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{p.academy || '(sin academia)'}</p>
                        <p className="text-xs text-neutral-400">{p.coach}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">{p.issue}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {pendientes.length > 4 && (
                  <button
                    onClick={() => setAlertasExpanded(!alertasExpanded)}
                    className="w-full mt-2.5 py-2 border border-neutral-300 bg-white text-neutral-800 text-[10px] font-extrabold uppercase tracking-wider hover:bg-neutral-50 active:scale-95 transition-all rounded-none text-center"
                  >
                    {alertasExpanded ? 'MOSTRAR MENOS' : `VER TODO (${pendientes.length})`}
                  </button>
                )}
              </div>
            )}
          </Section>
        </div>
      </div>

      {topAcademies.length > 0 && (
        <Section title="Top Academias" icon={DollarSign}>
          <div>
            <div className="space-y-2">
              {visibleAcademies.map((a, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-none bg-neutral-800/20 border border-neutral-700/20">
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
            {topAcademies.length > 4 && (
              <button
                onClick={() => setAcademiesExpanded(!academiesExpanded)}
                className="w-full mt-2.5 py-2 border border-neutral-300 bg-white text-neutral-800 text-[10px] font-extrabold uppercase tracking-wider hover:bg-neutral-50 active:scale-95 transition-all rounded-none text-center"
              >
                {academiesExpanded ? 'MOSTRAR MENOS' : `VER TODO (${topAcademies.length})`}
              </button>
            )}
          </div>
        </Section>
      )}

      {activity.length > 0 && (
        <Section title="Actividad Reciente" icon={Activity}>
          <div>
            <div className="divide-y divide-neutral-700/30">
              {visibleActivity.map((a, i) => (
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
            {activity.length > 4 && (
              <button
                onClick={() => setActividadExpanded(!actividadExpanded)}
                className="w-full mt-2.5 py-2 border border-neutral-300 bg-white text-neutral-800 text-[10px] font-extrabold uppercase tracking-wider hover:bg-neutral-50 active:scale-95 transition-all rounded-none text-center"
              >
                {actividadExpanded ? 'MOSTRAR MENOS' : `VER TODO (${activity.length})`}
              </button>
            )}
          </div>
        </Section>
      )}
    </div>
  )
}

function KpiCard({ label, value, sub, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string; icon?: React.ComponentType<{ className?: string }>;   accent?: 'sky' | 'indigo' | 'teal' | 'orange' | 'rose' | 'purple' | 'success' | 'accent' | 'primary' | 'emerald'
}) {
  const color = accent ? (CHART as Record<string, string>)[accent] ?? '#ffffff' : '#ffffff'
  return (
    <div className="rounded-none border border-neutral-700/50 bg-neutral-800/40 p-3">
      <div className="flex items-center gap-1 text-[10px] tracking-widest uppercase text-neutral-500 mb-1 font-bold">
        {Icon && <span style={{ color }}><Icon className="w-3.5 h-3.5" /></span>}{label}
      </div>
      <p className="font-display text-xl leading-tight" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-neutral-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function Section({ title, subtitle, icon: Icon, children }: {
  title: string; subtitle?: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode
}) {
  return (
    <div className="bg-neutral-800/30 rounded-none border border-neutral-700/40 p-4">
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
