'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import Image from 'next/image'
import {
  supabase,
  Event,
  Coach,
  Participant,
  CoachRegistration,
  RegistrationDancer,
  RegistrationAct,
  AGE_CATEGORY_LABELS,
  AGE_CATEGORY_ORDER,
  AgeCategory,
  Modality,
} from '@/lib/supabase'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  DollarSign,
  Download,
  Edit3,
  Home,
  Lock,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Search,
  StickyNote,
  Trophy,
  TrendingUp,
  Users,
} from 'lucide-react'

// ============================================================================
// Helpers
// ============================================================================

const MODALITIES: Modality[] = ['solista', 'dueto', 'trio', 'grupal']
const MODALITY_LABELS: Record<Modality, string> = {
  solista: 'Solista',
  dueto: 'Dueto',
  trio: 'Trío',
  grupal: 'Grupal',
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return 'hace unos segundos'
  const m = Math.floor(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7) return `hace ${d} d`
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function costForRegistration(acts: RegistrationAct[], dancers: RegistrationDancer[], paq: number | null, rep: number | null): number {
  if (paq == null) return 0
  const counts = new Map<number, number>()
  acts.forEach(a => {
    if (a.modality === 'grupal') {
      dancers.forEach(d => counts.set(d.id, (counts.get(d.id) ?? 0) + 1))
    } else {
      a.dancer_ids.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1))
    }
  })
  let total = 0
  counts.forEach(n => {
    if (n >= 1) total += paq
    if (n > 1) total += (n - 1) * (rep ?? 0)
  })
  return total
}

type EnrichedRegistration = CoachRegistration & {
  dancers: RegistrationDancer[]
  acts: RegistrationAct[]
  total: number
}

function useLocalState<T>(key: string, initial: T): [T, (next: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(initial)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw != null) setV(JSON.parse(raw))
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const setAndPersist = useCallback((next: T | ((p: T) => T)) => {
    setV(prev => {
      const value = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
      return value
    })
  }, [key])
  return [v, setAndPersist]
}

// ============================================================================
// PAGE
// ============================================================================

type Tab = 'inicio' | 'datos' | 'academias' | 'finanzas' | 'mas'

export default function SociosPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [eventId, setEventId] = useState<string | null>(null)
  const [registrations, setRegistrations] = useState<CoachRegistration[]>([])
  const [dancers, setDancers] = useState<RegistrationDancer[]>([])
  const [acts, setActs] = useState<RegistrationAct[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState<string>(new Date().toISOString())
  const [tab, setTab] = useState<Tab>('inicio')

  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('events').select('*').order('created_at', { ascending: false })
      if (data) {
        setEvents(data)
        if (data.length > 0) setEventId(data[0].id)
      }
    })()
  }, [])

  const loadAll = useCallback(async (id: string) => {
    setLoading(true)
    const [{ data: regs }, { data: dans }, { data: acs }, { data: parts }, { data: cos }] = await Promise.all([
      supabase.from('coach_registrations').select('*').eq('event_id', id),
      supabase.from('registration_dancers').select('*'),
      supabase.from('registration_acts').select('*'),
      supabase.from('participants').select('*').eq('event_id', id).order('position'),
      supabase.from('coaches').select('*').eq('event_id', id),
    ])
    const regIds = new Set((regs ?? []).map(r => r.id))
    setRegistrations(regs ?? [])
    setDancers((dans ?? []).filter(d => regIds.has(d.registration_id)))
    setActs((acs ?? []).filter(a => regIds.has(a.registration_id)))
    setParticipants(parts ?? [])
    setCoaches(cos ?? [])
    setLastSync(new Date().toISOString())
    setLoading(false)
  }, [])

  useEffect(() => { if (eventId) loadAll(eventId) }, [eventId, loadAll])

  useEffect(() => {
    if (!eventId) return
    const ch = supabase
      .channel(`socios-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_registrations', filter: `event_id=eq.${eventId}` }, () => loadAll(eventId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_dancers' }, () => loadAll(eventId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_acts' }, () => loadAll(eventId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `event_id=eq.${eventId}` }, () => loadAll(eventId))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [eventId, loadAll])

  const event = useMemo(() => events.find(e => e.id === eventId) ?? null, [events, eventId])

  const enriched: EnrichedRegistration[] = useMemo(() => registrations.map(r => {
    const ds = dancers.filter(d => d.registration_id === r.id)
    const as = acts.filter(a => a.registration_id === r.id)
    return { ...r, dancers: ds, acts: as, total: costForRegistration(as, ds, r.cost_paquete, r.cost_repeticion) }
  }), [registrations, dancers, acts])

  const confirmed = useMemo(() => enriched.filter(r => r.confirmed_at), [enriched])

  const kpis = useMemo(() => {
    const academies = new Set(enriched.map(r => r.academy.trim().toLowerCase()).filter(Boolean))
    const totalDancers = enriched.reduce((s, r) => s + r.dancers.length, 0)
    const totalActs = enriched.reduce((s, r) => s + r.acts.length, 0)
    const projectedIncome = enriched.reduce((s, r) => s + r.total, 0)
    const confirmedIncome = confirmed.reduce((s, r) => s + r.total, 0)
    const allCoaches = new Set<string>()
    enriched.forEach(r => {
      if (r.coach_name) allCoaches.add(r.coach_name.trim().toLowerCase())
      r.extra_coaches?.forEach(x => x && allCoaches.add(x.trim().toLowerCase()))
    })
    return {
      academias: academies.size,
      coaches: allCoaches.size,
      alumnos: totalDancers,
      actos: totalActs,
      ingresoProyectado: projectedIncome,
      ingresoConfirmado: confirmedIncome,
      confirmadas: confirmed.length,
      enProgreso: enriched.length - confirmed.length,
    }
  }, [enriched, confirmed])

  const heatmap = useMemo(() => {
    const grid: Record<AgeCategory, Record<Modality, number>> = {} as Record<AgeCategory, Record<Modality, number>>
    AGE_CATEGORY_ORDER.forEach(c => { grid[c] = { solista: 0, dueto: 0, trio: 0, grupal: 0 } })
    acts.forEach(a => { if (a.age_category) grid[a.age_category][a.modality] = (grid[a.age_category][a.modality] ?? 0) + 1 })
    const max = Math.max(1, ...Object.values(grid).flatMap(r => Object.values(r)))
    return { grid, max }
  }, [acts])

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

  const topAcademies = useMemo(() => {
    const m = new Map<string, { name: string; acts: number; dancers: number; income: number; confirmed: number }>()
    enriched.forEach(r => {
      const key = r.academy.trim() || '(sin academia)'
      const cur = m.get(key) ?? { name: key, acts: 0, dancers: 0, income: 0, confirmed: 0 }
      cur.acts += r.acts.length
      cur.dancers += r.dancers.length
      cur.income += r.total
      if (r.confirmed_at) cur.confirmed += 1
      m.set(key, cur)
    })
    return [...m.values()].sort((a, b) => b.income - a.income).slice(0, 10)
  }, [enriched])

  const pendientes = useMemo(() => {
    const out: { id: number; coach: string; phone: string; issue: string; severity: 'high' | 'med' | 'low' }[] = []
    const sixHoursAgo = Date.now() - 6 * 3600 * 1000
    enriched.forEach(r => {
      if (r.confirmed_at) return
      const stale = new Date(r.submitted_at).getTime() < sixHoursAgo
      const missingName = !r.team_name?.trim()
      const missingBirthdate = r.dancers.some(d => !d.birthdate)
      const incompleteActs = r.acts.some(a => !a.level || !a.style || !a.age_category)
      if (stale) out.push({ id: r.id, coach: r.coach_name, phone: r.coach_phone, issue: 'Sin confirmar por más de 6 horas', severity: 'high' })
      if (missingBirthdate) out.push({ id: r.id, coach: r.coach_name, phone: r.coach_phone, issue: 'Alumno sin fecha de nacimiento', severity: 'med' })
      if (incompleteActs) out.push({ id: r.id, coach: r.coach_name, phone: r.coach_phone, issue: 'Acto sin nivel/estilo/categoría', severity: 'med' })
      if (missingName) out.push({ id: r.id, coach: r.coach_name, phone: r.coach_phone, issue: 'Equipo sin nombre', severity: 'low' })
    })
    return out
  }, [enriched])

  const activity = useMemo(() => enriched.map(r => ({
    id: r.id,
    coach: r.coach_name,
    academy: r.academy,
    action: r.confirmed_at ? 'Confirmó su registro' : 'Inició registro',
    at: r.confirmed_at ?? r.submitted_at,
  })).sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).slice(0, 15), [enriched])

  const [query, setQuery] = useState('')
  const filteredRegs = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return enriched
    return enriched.filter(r =>
      r.coach_name?.toLowerCase().includes(q) ||
      r.academy?.toLowerCase().includes(q) ||
      r.team_name?.toLowerCase().includes(q) ||
      r.dancers.some(d => d.name.toLowerCase().includes(q)) ||
      r.extra_coaches?.some(x => x.toLowerCase().includes(q))
    )
  }, [enriched, query])

  const [payments, setPayments] = useLocalState<Record<number, { paid: number; note?: string }>>('d4e:socios:payments', {})
  const cobrado = useMemo(() => Object.values(payments).reduce((s, p) => s + (p.paid ?? 0), 0), [payments])

  const [notes, setNotes] = useLocalState<Record<number, string>>('d4e:socios:notes', {})

  const [frozen, setFrozen] = useLocalState<boolean>(`d4e:socios:frozen:${eventId ?? ''}`, false)

  const [editingDeadlines, setEditingDeadlines] = useState(false)
  const [regDeadline, setRegDeadline] = useState('')
  const [chgDeadline, setChgDeadline] = useState('')

  const [exporting, setExporting] = useState<string | null>(null)
  async function runExport(kind: 'excel' | 'pdf' | 'regs') {
    if (!event) return
    setExporting(kind)
    try {
      const mod = await import('@/lib/export')
      if (kind === 'excel') await mod.exportExcel(event, participants, coaches)
      else if (kind === 'pdf') await mod.exportPdf(event, participants, coaches)
      else if (kind === 'regs') await mod.exportRegistrations(event)
    } catch (err) {
      console.error(err)
      alert('Error al exportar: ' + (err as Error).message)
    } finally {
      setExporting(null)
    }
  }

  const [snapshots, setSnapshots] = useLocalState<{ id: string; createdAt: string; label: string }[]>('d4e:socios:snapshots', [])
  function takeSnapshot() {
    const label = prompt('Etiqueta del snapshot:', `Snapshot ${new Date().toLocaleString('es-MX')}`)
    if (!label) return
    setSnapshots(prev => [{ id: crypto.randomUUID(), createdAt: new Date().toISOString(), label }, ...prev].slice(0, 10))
  }

  function broadcastTemplate(coach: string, academy: string) {
    return `Hola ${coach || ''} 👋\n\nTe contactamos del equipo Dance4ever sobre tu registro de ${academy || 'tu academia'}.\n\n`
  }

  if (loading && !event) {
    return (
      <div className="min-h-[100dvh] bg-[rgb(var(--c-surface))] flex items-center justify-center">
        <p className="font-display text-3xl tracking-widest text-[rgb(var(--c-primary))] animate-pulse">CARGANDO…</p>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-[rgb(var(--c-surface))] text-[rgb(var(--c-text-strong))] font-sans">
      {/* HEADER */}
      <header
        className="sticky top-0 z-30 bg-[rgb(var(--c-surface)/0.95)] backdrop-blur border-b border-[rgb(var(--c-border)/0.5)]"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-screen-sm mx-auto px-4 py-3 flex items-center gap-3">
          <Image src="/logo.png" alt="Dance4ever" width={48} height={36} priority className="mix-blend-multiply shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-display text-xs tracking-[0.3em] text-[rgb(var(--c-primary))] font-bold leading-none">SOCIOS</p>
            <select
              value={eventId ?? ''}
              onChange={e => setEventId(e.target.value)}
              className="font-display text-lg tracking-wider text-[rgb(var(--c-text-strong))] bg-transparent w-full focus:outline-none truncate"
            >
              {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div className="text-right text-xs text-[rgb(var(--c-text)/0.7)] leading-tight shrink-0">
            <p>Actualizado</p>
            <p className="font-medium">{formatRelative(lastSync)}</p>
          </div>
        </div>
      </header>

      <main className="max-w-screen-sm mx-auto px-3 py-4 space-y-4 pb-32">
        {tab === 'inicio' && (
          <>
            <Section icon={BarChart3} title="Resumen" subtitle={event ? new Date(event.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : ''}>
              <div className="grid grid-cols-2 gap-2.5">
                <KPI label="Academias" value={kpis.academias} icon={Building2} />
                <KPI label="Coaches" value={kpis.coaches} icon={Users} />
                <KPI label="Alumnos" value={kpis.alumnos} icon={Users} />
                <KPI label="Actos" value={kpis.actos} icon={Activity} />
                <KPI label="Confirmadas" value={kpis.confirmadas} sub={`${kpis.enProgreso} en progreso`} accent="success" />
                <KPI label="Ingreso proyectado" value={formatMoney(kpis.ingresoProyectado)} sub={`Confirm. ${formatMoney(kpis.ingresoConfirmado)}`} accent="primary" />
              </div>
            </Section>

            <Section icon={TrendingUp} title="Curva de registros">
              {curve && curve.length > 1 ? <RegistrationCurve points={curve} /> : <Empty>Aún no hay suficientes datos para graficar.</Empty>}
            </Section>

            <Section icon={AlertTriangle} title="Pendientes" subtitle={`${pendientes.length} ${pendientes.length === 1 ? 'alerta' : 'alertas'}`}>
              {pendientes.length === 0 ? <Empty>Todo al día 🎉</Empty> : (
                <ul className="space-y-2">
                  {pendientes.slice(0, 10).map((p, i) => (
                    <li key={i} className="flex items-start gap-2.5 p-3 rounded-xl border border-[rgb(var(--c-border)/0.5)] bg-white">
                      <span className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full shrink-0 ${p.severity === 'high' ? 'bg-[rgb(var(--c-primary))]' : p.severity === 'med' ? 'bg-[rgb(var(--c-accent))]' : 'bg-[rgb(var(--c-text)/0.4)]'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold truncate">{p.coach}</p>
                        <p className="text-sm text-[rgb(var(--c-text)/0.75)]">{p.issue}</p>
                      </div>
                      {p.phone && (
                        <a href={`https://wa.me/${p.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-[rgb(var(--c-success))] text-white active:scale-95">
                          <MessageCircle className="w-5 h-5" />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}

        {tab === 'datos' && (
          <>
            <Section icon={BarChart3} title="Heatmap categoría × modalidad">
              <div className="overflow-x-auto -mx-3 px-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left py-1.5 pr-2 font-display tracking-wider text-[rgb(var(--c-text)/0.7)]"> </th>
                      {MODALITIES.map(m => <th key={m} className="text-center py-1.5 px-1 font-display tracking-wider text-[rgb(var(--c-text)/0.7)]">{MODALITY_LABELS[m]}</th>)}
                      <th className="text-right py-1.5 pl-2 font-display tracking-wider text-[rgb(var(--c-text)/0.7)]">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {AGE_CATEGORY_ORDER.map(cat => {
                      const row = heatmap.grid[cat]
                      const sum = MODALITIES.reduce((s, m) => s + row[m], 0)
                      return (
                        <tr key={cat} className="border-t border-[rgb(var(--c-border)/0.4)]">
                          <td className="py-2 pr-2 font-display uppercase text-base text-[rgb(var(--c-text-strong))]">{AGE_CATEGORY_LABELS[cat]}</td>
                          {MODALITIES.map(m => {
                            const n = row[m]
                            const intensity = n === 0 ? 0 : 0.15 + (n / heatmap.max) * 0.7
                            return (
                              <td key={m} className="py-1.5 px-0.5 text-center">
                                <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg font-semibold text-base" style={{ background: `rgb(var(--c-primary)/${intensity})`, color: intensity > 0.4 ? '#fff' : 'rgb(var(--c-text))' }}>{n || ''}</span>
                              </td>
                            )
                          })}
                          <td className="py-2 pl-2 text-right font-semibold text-base">{sum}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section icon={Trophy} title="Top academias">
              {topAcademies.length === 0 ? <Empty>Sin registros aún.</Empty> : (
                <ul className="divide-y divide-[rgb(var(--c-border)/0.4)]">
                  {topAcademies.map((a, i) => (
                    <li key={a.name} className="py-3 flex items-center gap-3">
                      <span className="font-display text-2xl w-7 text-center text-[rgb(var(--c-primary))]">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-display text-base truncate">{a.name}</p>
                        <p className="text-sm text-[rgb(var(--c-text)/0.7)]">{a.acts} actos · {a.dancers} alumnos · {a.confirmed} confirmadas</p>
                      </div>
                      <span className="font-display text-base tabular-nums text-[rgb(var(--c-success))]">{formatMoney(a.income)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section icon={Activity} title="Actividad reciente">
              {activity.length === 0 ? <Empty>Sin actividad reciente.</Empty> : (
                <ul className="divide-y divide-[rgb(var(--c-border)/0.4)]">
                  {activity.map((a, i) => (
                    <li key={i} className="py-2.5 flex items-center gap-2.5">
                      <Edit3 className="w-4 h-4 text-[rgb(var(--c-accent))] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate"><strong>{a.coach}</strong> <span className="text-[rgb(var(--c-text)/0.7)]">de {a.academy}</span></p>
                        <p className="text-xs text-[rgb(var(--c-text)/0.6)]">{a.action} · {formatRelative(a.at)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-[rgb(var(--c-text)/0.5)] mt-2">Para historial completo de ediciones se necesita tabla <code>audit_log</code>.</p>
            </Section>
          </>
        )}

        {tab === 'academias' && (
          <>
            <Section icon={Search} title="Buscar y filtrar">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[rgb(var(--c-text)/0.5)]" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Coach, academia, equipo o alumno…"
                  className="w-full pl-11 pr-3 py-3 rounded-xl border border-[rgb(var(--c-border))] bg-white text-base focus:outline-none focus:border-[rgb(var(--c-primary))]"
                />
              </div>
            </Section>

            <Section icon={Building2} title="Academias" subtitle={`${filteredRegs.length} de ${enriched.length}`}>
              <ul className="space-y-2">
                {filteredRegs.length === 0 && <Empty>Sin resultados.</Empty>}
                {filteredRegs.map(r => <RegRow key={r.id} reg={r} payments={payments} setPayments={setPayments} notes={notes} setNotes={setNotes} />)}
              </ul>
            </Section>

            <Section icon={Megaphone} title="Broadcast a coaches">
              {enriched.length === 0 ? <Empty>Sin coaches aún.</Empty> : (
                <ul className="space-y-1 max-h-[60vh] overflow-y-auto -mx-3 px-3">
                  {enriched.map(r => (
                    <li key={r.id} className="flex items-center gap-2 py-2 border-b border-[rgb(var(--c-border)/0.3)]">
                      <div className="flex-1 min-w-0">
                        <p className="text-base truncate">{r.coach_name}</p>
                        <p className="text-xs text-[rgb(var(--c-text)/0.6)] truncate">{r.academy}</p>
                      </div>
                      {r.coach_phone && (
                        <a
                          href={`https://wa.me/${r.coach_phone.replace(/\D/g, '')}?text=${encodeURIComponent(broadcastTemplate(r.coach_name, r.academy))}`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 inline-flex items-center gap-1.5 bg-[rgb(var(--c-success))] text-white text-sm tracking-wider px-3 py-2 rounded-lg active:scale-95"
                        >
                          <MessageCircle className="w-4 h-4" />
                          WhatsApp
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}

        {tab === 'finanzas' && (
          <>
            <Section icon={DollarSign} title="Tablero financiero">
              <div className="grid grid-cols-3 gap-2">
                <KPI label="Facturado" value={formatMoney(kpis.ingresoProyectado)} accent="primary" />
                <KPI label="Cobrado" value={formatMoney(cobrado)} accent="success" />
                <KPI label="Pendiente" value={formatMoney(kpis.ingresoProyectado - cobrado)} accent="accent" />
              </div>
            </Section>

            <Section icon={Building2} title="Desglose por academia">
              {topAcademies.length === 0 ? <Empty>Sin datos.</Empty> : (
                <ul className="divide-y divide-[rgb(var(--c-border)/0.4)]">
                  {topAcademies.map(a => (
                    <li key={a.name} className="py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-base truncate">{a.name}</p>
                        <p className="text-xs text-[rgb(var(--c-text)/0.6)]">{a.acts} actos</p>
                      </div>
                      <span className="font-display text-base tabular-nums text-[rgb(var(--c-primary))]">{formatMoney(a.income)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-[rgb(var(--c-text)/0.5)] mt-2">Para pagos persistentes crea tabla <code>payments</code>. Por ahora se guardan en este dispositivo.</p>
            </Section>
          </>
        )}

        {tab === 'mas' && (
          <>
            <Section icon={ClipboardList} title="Programa publicado" subtitle={`${participants.length} actos`}>
              {participants.length === 0 ? <Empty>Aún no hay programa cargado.</Empty> : (
                <div className="max-h-[60vh] overflow-y-auto -mx-3 px-3 divide-y divide-[rgb(var(--c-border)/0.4)]">
                  {participants.map(p => (
                    <div key={p.id} className="py-2 flex items-center gap-2 text-sm">
                      <span className="font-display text-base w-9 text-right text-[rgb(var(--c-primary))]">#{p.position}</span>
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="text-xs text-[rgb(var(--c-text)/0.7)] uppercase">{p.category}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section icon={Calendar} title="Deadlines y control">
              {!editingDeadlines ? (
                <button onClick={() => setEditingDeadlines(true)} className="w-full text-left px-4 py-3 rounded-xl border border-[rgb(var(--c-border))] bg-white text-base flex items-center justify-between">
                  <span>Editar fechas límite</span>
                  <ChevronDown className="w-5 h-5" />
                </button>
              ) : (
                <div className="space-y-2 p-3 rounded-xl border border-[rgb(var(--c-border))] bg-white">
                  <label className="block text-sm">
                    Cierre de registros
                    <input type="datetime-local" value={regDeadline} onChange={e => setRegDeadline(e.target.value)} className="mt-1 w-full px-3 py-2 rounded border border-[rgb(var(--c-border))] text-base" />
                  </label>
                  <label className="block text-sm">
                    Cierre de cambios
                    <input type="datetime-local" value={chgDeadline} onChange={e => setChgDeadline(e.target.value)} className="mt-1 w-full px-3 py-2 rounded border border-[rgb(var(--c-border))] text-base" />
                  </label>
                  <p className="text-xs text-[rgb(var(--c-text)/0.5)]">Requiere columnas <code>registration_deadline</code> y <code>change_deadline</code>. Por ahora local.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setEditingDeadlines(false)} className="flex-1 px-3 py-2.5 rounded-lg bg-[rgb(var(--c-success))] text-white text-base font-display tracking-wider">GUARDAR</button>
                    <button onClick={() => setEditingDeadlines(false)} className="px-3 py-2.5 rounded-lg border border-[rgb(var(--c-border))] text-base">Cancelar</button>
                  </div>
                </div>
              )}
              <button
                onClick={() => setFrozen(v => !v)}
                className={`mt-2 w-full px-4 py-4 rounded-xl flex items-center justify-between transition-all ${frozen ? 'bg-[rgb(var(--c-primary))] text-white' : 'bg-white border border-[rgb(var(--c-border))]'}`}
              >
                <span className="flex items-center gap-2 text-base font-display tracking-wider">
                  <Lock className="w-5 h-5" />
                  {frozen ? 'REGISTRO CONGELADO' : 'CONGELAR REGISTRO'}
                </span>
                <span className={`w-12 h-6 rounded-full relative transition-colors ${frozen ? 'bg-white/30' : 'bg-[rgb(var(--c-text)/0.2)]'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${frozen ? 'left-6' : 'left-0.5'}`} />
                </span>
              </button>
            </Section>

            <Section icon={Download} title="Centro de exportes">
              <div className="grid grid-cols-3 gap-2">
                <ExportBtn label="Programa Excel" onClick={() => runExport('excel')} busy={exporting === 'excel'} />
                <ExportBtn label="Programa PDF" onClick={() => runExport('pdf')} busy={exporting === 'pdf'} />
                <ExportBtn label="Registros XLSX" onClick={() => runExport('regs')} busy={exporting === 'regs'} />
              </div>
            </Section>

            <Section icon={StickyNote} title="Notas internas" subtitle={`${Object.keys(notes).filter(k => notes[Number(k)]).length} con nota`}>
              <p className="text-sm text-[rgb(var(--c-text)/0.75)]">Las notas se editan dentro de cada academia (pestaña <strong>Academias</strong>).</p>
            </Section>

            <Section icon={CheckCircle2} title="Snapshots">
              <button onClick={takeSnapshot} className="w-full px-4 py-3 rounded-xl bg-[rgb(var(--c-success))] text-white font-display text-base tracking-wider">CREAR SNAPSHOT AHORA</button>
              {snapshots.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {snapshots.map(s => (
                    <li key={s.id} className="text-sm flex items-center justify-between border-b border-[rgb(var(--c-border)/0.3)] pb-1.5">
                      <span className="truncate">{s.label}</span>
                      <span className="text-xs text-[rgb(var(--c-text)/0.6)] shrink-0">{formatDate(s.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </>
        )}

        <footer className="text-center text-xs text-[rgb(var(--c-text)/0.5)] pt-4 pb-2">
          Dance4ever · Panel de socios v1
        </footer>
      </main>

      {/* BOTTOM TAB BAR */}
      <nav
        className="fixed bottom-0 inset-x-0 z-40 bg-[rgb(var(--c-surface)/0.97)] backdrop-blur border-t border-[rgb(var(--c-border)/0.6)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="max-w-screen-sm mx-auto grid grid-cols-5">
          <TabBtn current={tab} value="inicio" onClick={setTab} icon={Home} label="Inicio" />
          <TabBtn current={tab} value="datos" onClick={setTab} icon={BarChart3} label="Datos" />
          <TabBtn current={tab} value="academias" onClick={setTab} icon={Building2} label="Academias" />
          <TabBtn current={tab} value="finanzas" onClick={setTab} icon={DollarSign} label="Finanzas" />
          <TabBtn current={tab} value="mas" onClick={setTab} icon={MoreHorizontal} label="Más" />
        </div>
      </nav>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function TabBtn({ current, value, onClick, icon: Icon, label }: { current: Tab; value: Tab; onClick: (t: Tab) => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
  const active = current === value
  return (
    <button
      onClick={() => { onClick(value); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
      className={`flex flex-col items-center justify-center gap-1 py-2.5 active:bg-[rgb(var(--c-primary)/0.05)] transition-colors ${active ? 'text-[rgb(var(--c-primary))]' : 'text-[rgb(var(--c-text)/0.55)]'}`}
    >
      <Icon className="w-6 h-6" />
      <span className={`text-[11px] font-display tracking-wider ${active ? 'font-bold' : ''}`}>{label}</span>
    </button>
  )
}

function Section({ icon: Icon, title, subtitle, children }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-[rgb(var(--c-border)/0.6)] p-4">
      <header className="flex items-center gap-2.5 mb-3.5">
        <Icon className="w-5 h-5 text-[rgb(var(--c-primary))] shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-xl tracking-wider text-[rgb(var(--c-text-strong))] leading-none">{title}</h2>
          {subtitle && <p className="text-xs text-[rgb(var(--c-text)/0.6)] mt-1">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

function KPI({ label, value, sub, icon: Icon, accent }: { label: string; value: string | number; sub?: string; icon?: React.ComponentType<{ className?: string }>; accent?: 'primary' | 'success' | 'accent' }) {
  const color = accent === 'success' ? 'text-[rgb(var(--c-success))]' : accent === 'accent' ? 'text-[rgb(var(--c-accent))]' : accent === 'primary' ? 'text-[rgb(var(--c-primary))]' : 'text-[rgb(var(--c-text-strong))]'
  return (
    <div className="rounded-xl border border-[rgb(var(--c-border)/0.5)] bg-[rgb(var(--c-surface))] p-3">
      <div className="flex items-center gap-1.5 text-xs tracking-widest uppercase text-[rgb(var(--c-text)/0.7)] mb-1">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </div>
      <p className={`font-display text-3xl leading-tight ${color}`}>{value}</p>
      {sub && <p className="text-xs text-[rgb(var(--c-text)/0.6)] mt-0.5">{sub}</p>}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-base text-[rgb(var(--c-text)/0.6)] text-center py-6">{children}</p>
}

function ExportBtn({ label, onClick, busy }: { label: string; onClick: () => void; busy: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="px-2 py-3 rounded-xl bg-[rgb(var(--c-primary))] text-white font-display text-xs tracking-wider disabled:opacity-50 active:scale-95"
    >
      {busy ? '...' : label}
    </button>
  )
}

function RegRow({ reg, payments, setPayments, notes, setNotes }: {
  reg: EnrichedRegistration
  payments: Record<number, { paid: number; note?: string }>
  setPayments: (n: (p: Record<number, { paid: number; note?: string }>) => Record<number, { paid: number; note?: string }>) => void
  notes: Record<number, string>
  setNotes: (n: (p: Record<number, string>) => Record<number, string>) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const paid = payments[reg.id]?.paid ?? 0
  const note = notes[reg.id] ?? ''
  const confirmed = !!reg.confirmed_at
  return (
    <li className="rounded-xl border border-[rgb(var(--c-border)/0.5)] bg-white overflow-hidden">
      <button onClick={() => setExpanded(v => !v)} className="w-full px-3.5 py-3 flex items-center gap-2.5 text-left">
        <span className={`inline-block w-3 h-3 rounded-full shrink-0 ${confirmed ? 'bg-[rgb(var(--c-success))]' : 'bg-[rgb(var(--c-accent))]'}`} />
        <div className="flex-1 min-w-0">
          <p className="font-display text-base truncate">{reg.academy || '(sin academia)'}</p>
          <p className="text-sm text-[rgb(var(--c-text)/0.7)] truncate">{reg.coach_name} · {reg.dancers.length} alumnos · {reg.acts.length} actos</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-display text-base tabular-nums text-[rgb(var(--c-primary))]">{formatMoney(reg.total)}</p>
          <p className="text-[11px] text-[rgb(var(--c-text)/0.6)] uppercase tracking-wider">{confirmed ? 'Confirmada' : 'En progreso'}</p>
        </div>
      </button>
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-2 space-y-3 border-t border-[rgb(var(--c-border)/0.4)] text-sm">
          <Row label="Equipo">{reg.team_name || '—'}</Row>
          <Row label="Coach">
            <span>{reg.coach_name}</span>
            {reg.coach_phone && (
              <a href={`https://wa.me/${reg.coach_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1.5 text-[rgb(var(--c-success))]">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            )}
          </Row>
          <Row label="Enviado">{formatDate(reg.submitted_at)}</Row>
          {reg.confirmed_at && <Row label="Confirmado">{formatDate(reg.confirmed_at)}</Row>}
          <div>
            <p className="text-xs uppercase tracking-widest text-[rgb(var(--c-text)/0.6)] mb-1.5">Pago</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={paid || ''}
                onChange={e => {
                  const n = Number(e.target.value) || 0
                  setPayments(p => ({ ...p, [reg.id]: { ...p[reg.id], paid: n } }))
                }}
                placeholder="0"
                className="flex-1 px-3 py-2 rounded-lg border border-[rgb(var(--c-border))] text-base"
              />
              <span className="text-sm text-[rgb(var(--c-text)/0.6)]">de {formatMoney(reg.total)}</span>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-[rgb(var(--c-text)/0.6)] mb-1.5">Nota interna</p>
            <textarea
              value={note}
              onChange={e => setNotes(p => ({ ...p, [reg.id]: e.target.value }))}
              rows={2}
              placeholder="Recordatorios, acuerdos especiales…"
              className="w-full px-3 py-2 rounded-lg border border-[rgb(var(--c-border))] text-base resize-none"
            />
          </div>
        </div>
      )}
    </li>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[rgb(var(--c-text)/0.6)] w-20 shrink-0">{label}:</span>
      <span className="flex-1 font-medium flex items-center gap-2 min-w-0">{children}</span>
    </div>
  )
}

function RegistrationCurve({ points }: { points: { date: string; count: number }[] }) {
  const w = 320, h = 100, pad = 10
  const max = Math.max(...points.map(p => p.count), 1)
  const xs = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2)
  const ys = (n: number) => h - pad - (n / max) * (h - pad * 2)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(p.count).toFixed(1)}`).join(' ')
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28" preserveAspectRatio="none">
        <path d={path} fill="none" stroke="rgb(var(--c-primary))" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={p.date} cx={xs(i)} cy={ys(p.count)} r={3} fill="rgb(var(--c-primary))" />
        ))}
      </svg>
      <div className="flex justify-between text-xs text-[rgb(var(--c-text)/0.6)] mt-1">
        <span>{points[0].date}</span>
        <span>{points[points.length - 1].date}</span>
      </div>
      <p className="text-sm text-[rgb(var(--c-text)/0.7)] mt-1.5">Total acumulado: <strong>{points[points.length - 1].count}</strong> registros</p>
    </div>
  )
}
