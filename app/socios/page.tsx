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
  Calendar,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  DollarSign,
  Download,
  Edit3,
  Lock,
  Megaphone,
  MessageCircle,
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

// Per-registration cost using the same rule as the register flow:
// each dancer's first participation costs `cost_paquete`, every additional one `cost_repeticion`.
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
  participationsByDancer: Map<number, number>
}

// ============================================================================
// LocalStorage hook for client-only persistence (notes, payments, freeze flag)
// ============================================================================
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

  // Initial event load
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.from('events').select('*').order('created_at', { ascending: false })
      if (data) {
        setEvents(data)
        if (data.length > 0) setEventId(data[0].id)
      }
    })()
  }, [])

  // Load all data for selected event
  const loadAll = useCallback(async (id: string) => {
    setLoading(true)
    const [{ data: regs }, { data: dans }, { data: acs }, { data: parts }, { data: cos }] = await Promise.all([
      supabase.from('coach_registrations').select('*').eq('event_id', id),
      supabase.from('registration_dancers').select('*'),
      supabase.from('registration_acts').select('*'),
      supabase.from('participants').select('*').eq('event_id', id).order('position'),
      supabase.from('coaches').select('*').eq('event_id', id),
    ])
    // Filter dancers/acts by registrations belonging to this event
    const regIds = new Set((regs ?? []).map(r => r.id))
    setRegistrations(regs ?? [])
    setDancers((dans ?? []).filter(d => regIds.has(d.registration_id)))
    setActs((acs ?? []).filter(a => regIds.has(a.registration_id)))
    setParticipants(parts ?? [])
    setCoaches(cos ?? [])
    setLastSync(new Date().toISOString())
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!eventId) return
    loadAll(eventId)
  }, [eventId, loadAll])

  // Realtime: refresh on any relevant change
  useEffect(() => {
    if (!eventId) return
    const ch = supabase
      .channel(`socios-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_registrations', filter: `event_id=eq.${eventId}` }, () => loadAll(eventId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_dancers' }, () => loadAll(eventId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_acts' }, () => loadAll(eventId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `event_id=eq.${eventId}` }, () => loadAll(eventId))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` }, async () => {
        const { data } = await supabase.from('events').select('*').eq('id', eventId).single()
        if (data) setEvents(prev => prev.map(e => e.id === data.id ? data : e))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [eventId, loadAll])

  const event = useMemo(() => events.find(e => e.id === eventId) ?? null, [events, eventId])

  // Enrich registrations
  const enriched: EnrichedRegistration[] = useMemo(() => {
    return registrations.map(r => {
      const ds = dancers.filter(d => d.registration_id === r.id)
      const as = acts.filter(a => a.registration_id === r.id)
      const counts = new Map<number, number>()
      as.forEach(a => {
        if (a.modality === 'grupal') ds.forEach(d => counts.set(d.id, (counts.get(d.id) ?? 0) + 1))
        else a.dancer_ids.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1))
      })
      return {
        ...r,
        dancers: ds,
        acts: as,
        total: costForRegistration(as, ds, r.cost_paquete, r.cost_repeticion),
        participationsByDancer: counts,
      }
    })
  }, [registrations, dancers, acts])

  const confirmed = useMemo(() => enriched.filter(r => r.confirmed_at), [enriched])

  // ---------- KPIs ----------
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

  // ---------- Heatmap: categoría × modalidad ----------
  const heatmap = useMemo(() => {
    const grid: Record<AgeCategory, Record<Modality, number>> = {} as Record<AgeCategory, Record<Modality, number>>
    AGE_CATEGORY_ORDER.forEach(c => { grid[c] = { solista: 0, dueto: 0, trio: 0, grupal: 0 } })
    acts.forEach(a => {
      if (!a.age_category) return
      grid[a.age_category][a.modality] = (grid[a.age_category][a.modality] ?? 0) + 1
    })
    const max = Math.max(1, ...Object.values(grid).flatMap(r => Object.values(r)))
    return { grid, max }
  }, [acts])

  // ---------- Curva de registros en el tiempo ----------
  const curve = useMemo(() => {
    if (enriched.length === 0) return null
    const byDay = new Map<string, number>()
    enriched.forEach(r => {
      const d = (r.submitted_at ?? '').slice(0, 10)
      if (d) byDay.set(d, (byDay.get(d) ?? 0) + 1)
    })
    const days = [...byDay.keys()].sort()
    let cum = 0
    const points = days.map(d => ({ date: d, count: (cum += byDay.get(d)!) }))
    return points
  }, [enriched])

  // ---------- Top academias ----------
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

  // ---------- Pendientes accionables ----------
  const pendientes = useMemo(() => {
    const out: { id: number; coach: string; phone: string; issue: string; severity: 'high' | 'med' | 'low' }[] = []
    const sixHoursAgo = Date.now() - 6 * 3600 * 1000
    enriched.forEach(r => {
      if (r.confirmed_at) return
      const submittedMs = new Date(r.submitted_at).getTime()
      const stale = submittedMs < sixHoursAgo
      const missingName = !r.team_name?.trim()
      const missingBirthdate = r.dancers.some(d => !d.birthdate)
      const incompleteActs = r.acts.some(a => !a.level || !a.style || !a.age_category)
      if (stale) out.push({ id: r.id, coach: r.coach_name, phone: r.coach_phone, issue: 'Sin confirmar por >6h', severity: 'high' })
      if (missingBirthdate) out.push({ id: r.id, coach: r.coach_name, phone: r.coach_phone, issue: 'Alumno sin fecha de nacimiento', severity: 'med' })
      if (incompleteActs) out.push({ id: r.id, coach: r.coach_name, phone: r.coach_phone, issue: 'Acto sin nivel/estilo/categoría', severity: 'med' })
      if (missingName) out.push({ id: r.id, coach: r.coach_name, phone: r.coach_phone, issue: 'Equipo sin nombre', severity: 'low' })
    })
    return out
  }, [enriched])

  // ---------- Actividad reciente ----------
  const activity = useMemo(() => {
    const items = enriched.map(r => ({
      id: r.id,
      coach: r.coach_name,
      academy: r.academy,
      action: r.confirmed_at ? 'Confirmó su registro' : 'Inició registro',
      at: r.confirmed_at ?? r.submitted_at,
    }))
    return items.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).slice(0, 15)
  }, [enriched])

  // ---------- Search & filters ----------
  const [query, setQuery] = useState('')
  const filteredRegs = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return enriched
    return enriched.filter(r => {
      if (r.coach_name?.toLowerCase().includes(q)) return true
      if (r.academy?.toLowerCase().includes(q)) return true
      if (r.team_name?.toLowerCase().includes(q)) return true
      if (r.dancers.some(d => d.name.toLowerCase().includes(q))) return true
      if (r.extra_coaches?.some(x => x.toLowerCase().includes(q))) return true
      return false
    })
  }, [enriched, query])

  // ---------- Payments (local persistence) ----------
  const [payments, setPayments] = useLocalState<Record<number, { paid: number; note?: string }>>('d4e:socios:payments', {})
  const cobrado = useMemo(() => Object.values(payments).reduce((s, p) => s + (p.paid ?? 0), 0), [payments])

  // ---------- Notes (local persistence) ----------
  const [notes, setNotes] = useLocalState<Record<number, string>>('d4e:socios:notes', {})

  // ---------- Freeze flag (local persistence; sync to DB later) ----------
  const [frozen, setFrozen] = useLocalState<boolean>(`d4e:socios:frozen:${eventId ?? ''}`, false)

  // ---------- Deadlines ----------
  const [editingDeadlines, setEditingDeadlines] = useState(false)
  const [regDeadline, setRegDeadline] = useState('')
  const [chgDeadline, setChgDeadline] = useState('')

  // ---------- Exports ----------
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

  // ---------- Snapshot (local persistence) ----------
  const [snapshots, setSnapshots] = useLocalState<{ id: string; createdAt: string; label: string; data: unknown }[]>('d4e:socios:snapshots', [])
  function takeSnapshot() {
    if (!event) return
    const label = prompt('Etiqueta del snapshot:', `Snapshot ${new Date().toLocaleString('es-MX')}`)
    if (!label) return
    setSnapshots(prev => [
      { id: crypto.randomUUID(), createdAt: new Date().toISOString(), label, data: { event, registrations, dancers, acts } },
      ...prev,
    ].slice(0, 10))
  }

  // ---------- Broadcast ----------
  function broadcastTemplate(coach: string, academy: string) {
    return `Hola ${coach || ''} 👋\n\nTe contactamos del equipo Dance4ever sobre tu registro de ${academy || 'tu academia'}.\n\n`
  }

  // ============================================================================
  // RENDER
  // ============================================================================
  if (loading && !event) {
    return (
      <div className="min-h-[100dvh] bg-[rgb(var(--c-surface))] flex items-center justify-center">
        <p className="font-display text-2xl tracking-widest text-[rgb(var(--c-primary))] animate-pulse">CARGANDO…</p>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-[rgb(var(--c-surface))] text-[rgb(var(--c-text-strong))] font-sans pb-24">
      {/* HEADER */}
      <header
        className="sticky top-0 z-30 bg-[rgb(var(--c-surface)/0.92)] backdrop-blur border-b border-[rgb(var(--c-border)/0.5)]"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-screen-sm mx-auto px-4 py-3 flex items-center gap-3">
          <Image src="/logo.png" alt="Dance4ever" width={44} height={32} priority className="mix-blend-multiply shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-display text-[10px] tracking-[0.3em] text-[rgb(var(--c-primary))] font-bold leading-none">SOCIOS</p>
            <select
              value={eventId ?? ''}
              onChange={e => setEventId(e.target.value)}
              className="font-display text-base tracking-wider text-[rgb(var(--c-text-strong))] bg-transparent w-full focus:outline-none truncate"
            >
              {events.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div className="text-right text-[10px] text-[rgb(var(--c-text)/0.7)] leading-tight shrink-0">
            <p>Actualizado</p>
            <p className="font-medium">{formatRelative(lastSync)}</p>
          </div>
        </div>
      </header>

      <main className="max-w-screen-sm mx-auto px-3 py-4 space-y-4">
        {/* 1. KPIs */}
        <Section icon={BarChart3} title="Resumen" subtitle={event ? new Date(event.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) : ''}>
          <div className="grid grid-cols-2 gap-2">
            <KPI label="Academias" value={kpis.academias} icon={Trophy} />
            <KPI label="Coaches" value={kpis.coaches} icon={Users} />
            <KPI label="Alumnos" value={kpis.alumnos} icon={Users} />
            <KPI label="Actos" value={kpis.actos} icon={Activity} />
            <KPI label="Confirmadas" value={kpis.confirmadas} sub={`${kpis.enProgreso} en progreso`} accent="success" />
            <KPI label="Ingreso proy." value={formatMoney(kpis.ingresoProyectado)} sub={`Confirm. ${formatMoney(kpis.ingresoConfirmado)}`} accent="primary" />
          </div>
        </Section>

        {/* 2. Heatmap categoría × modalidad */}
        <Section icon={BarChart3} title="Heatmap categoría × modalidad">
          <div className="overflow-x-auto -mx-3 px-3">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left py-1 pr-2 font-display tracking-wider text-[rgb(var(--c-text)/0.7)]"> </th>
                  {MODALITIES.map(m => (
                    <th key={m} className="text-center py-1 px-1 font-display tracking-wider text-[rgb(var(--c-text)/0.7)]">{MODALITY_LABELS[m]}</th>
                  ))}
                  <th className="text-right py-1 pl-2 font-display tracking-wider text-[rgb(var(--c-text)/0.7)]">Total</th>
                </tr>
              </thead>
              <tbody>
                {AGE_CATEGORY_ORDER.map(cat => {
                  const row = heatmap.grid[cat]
                  const sum = MODALITIES.reduce((s, m) => s + row[m], 0)
                  return (
                    <tr key={cat} className="border-t border-[rgb(var(--c-border)/0.4)]">
                      <td className="py-1.5 pr-2 font-display uppercase text-[rgb(var(--c-text-strong))]">{AGE_CATEGORY_LABELS[cat]}</td>
                      {MODALITIES.map(m => {
                        const n = row[m]
                        const intensity = n === 0 ? 0 : 0.15 + (n / heatmap.max) * 0.7
                        return (
                          <td key={m} className="py-1 px-0.5 text-center">
                            <span
                              className="inline-flex items-center justify-center w-7 h-7 rounded-md font-semibold"
                              style={{ background: `rgb(var(--c-primary)/${intensity})`, color: intensity > 0.4 ? '#fff' : 'rgb(var(--c-text))' }}
                            >
                              {n || ''}
                            </span>
                          </td>
                        )
                      })}
                      <td className="py-1 pl-2 text-right font-semibold">{sum}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* 3. Curva de registros */}
        <Section icon={TrendingUp} title="Curva de registros">
          {curve && curve.length > 1 ? (
            <RegistrationCurve points={curve} />
          ) : (
            <p className="text-sm text-[rgb(var(--c-text)/0.7)]">Aún no hay suficientes datos para graficar.</p>
          )}
        </Section>

        {/* 4. Top academias */}
        <Section icon={Trophy} title="Top academias">
          {topAcademies.length === 0 ? (
            <Empty>Sin registros aún.</Empty>
          ) : (
            <ul className="divide-y divide-[rgb(var(--c-border)/0.4)]">
              {topAcademies.map((a, i) => (
                <li key={a.name} className="py-2 flex items-center gap-3">
                  <span className="font-display text-xl w-6 text-center text-[rgb(var(--c-primary))]">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-base truncate">{a.name}</p>
                    <p className="text-[11px] text-[rgb(var(--c-text)/0.7)]">{a.acts} actos · {a.dancers} alumnos · {a.confirmed} confirmadas</p>
                  </div>
                  <span className="font-display text-sm tabular-nums text-[rgb(var(--c-success))]">{formatMoney(a.income)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 5. Pendientes */}
        <Section icon={AlertTriangle} title="Pendientes" subtitle={`${pendientes.length} alertas`}>
          {pendientes.length === 0 ? (
            <Empty>Todo al día 🎉</Empty>
          ) : (
            <ul className="space-y-2">
              {pendientes.slice(0, 10).map((p, i) => (
                <li key={i} className="flex items-start gap-2 p-2 rounded-lg border border-[rgb(var(--c-border)/0.5)] bg-white">
                  <span className={`mt-0.5 inline-block w-2 h-2 rounded-full ${p.severity === 'high' ? 'bg-[rgb(var(--c-primary))]' : p.severity === 'med' ? 'bg-[rgb(var(--c-accent))]' : 'bg-[rgb(var(--c-text)/0.4)]'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.coach}</p>
                    <p className="text-xs text-[rgb(var(--c-text)/0.7)]">{p.issue}</p>
                  </div>
                  {p.phone && (
                    <a
                      href={`https://wa.me/${p.phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-[rgb(var(--c-success))] text-white active:scale-95"
                    >
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 6 + 7. Buscador + lista de academias */}
        <Section icon={Search} title="Academias">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgb(var(--c-text)/0.5)]" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar coach, academia, equipo o alumno…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-[rgb(var(--c-border))] bg-white text-sm focus:outline-none focus:border-[rgb(var(--c-primary))]"
            />
          </div>
          <ul className="space-y-2">
            {filteredRegs.length === 0 && <Empty>Sin resultados.</Empty>}
            {filteredRegs.map(r => <RegRow key={r.id} reg={r} payments={payments} setPayments={setPayments} notes={notes} setNotes={setNotes} />)}
          </ul>
        </Section>

        {/* 8. Feed de actividad */}
        <Section icon={Activity} title="Actividad reciente">
          {activity.length === 0 ? (
            <Empty>Sin actividad reciente.</Empty>
          ) : (
            <ul className="divide-y divide-[rgb(var(--c-border)/0.4)]">
              {activity.map((a, i) => (
                <li key={i} className="py-2 flex items-center gap-2">
                  <Edit3 className="w-3.5 h-3.5 text-[rgb(var(--c-accent))] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate">
                      <strong>{a.coach}</strong> <span className="text-[rgb(var(--c-text)/0.7)]">de {a.academy}</span>
                    </p>
                    <p className="text-[11px] text-[rgb(var(--c-text)/0.6)]">{a.action} · {formatRelative(a.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-[rgb(var(--c-text)/0.5)] mt-2">Para un historial completo de ediciones se necesita una tabla <code>audit_log</code> en Supabase.</p>
        </Section>

        {/* 9. Financiero */}
        <Section icon={DollarSign} title="Tablero financiero">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <KPI label="Facturado" value={formatMoney(kpis.ingresoProyectado)} accent="primary" small />
            <KPI label="Cobrado" value={formatMoney(cobrado)} accent="success" small />
            <KPI label="Pendiente" value={formatMoney(kpis.ingresoProyectado - cobrado)} accent="accent" small />
          </div>
          <p className="text-[10px] text-[rgb(var(--c-text)/0.5)]">Los pagos se registran localmente. Para persistirlos crea una tabla <code>payments</code>.</p>
        </Section>

        {/* 10. Programa borrador */}
        <Section icon={ClipboardList} title="Programa borrador" subtitle={`${participants.length} actos en el programa publicado`}>
          {participants.length === 0 ? (
            <Empty>Aún no hay programa cargado.</Empty>
          ) : (
            <div className="max-h-80 overflow-y-auto -mx-3 px-3 divide-y divide-[rgb(var(--c-border)/0.4)]">
              {participants.slice(0, 50).map(p => (
                <div key={p.id} className="py-1.5 flex items-center gap-2 text-xs">
                  <span className="font-display text-sm w-7 text-right text-[rgb(var(--c-primary))]">#{p.position}</span>
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-[10px] text-[rgb(var(--c-text)/0.7)] uppercase">{p.category}</span>
                </div>
              ))}
              {participants.length > 50 && <p className="py-2 text-[11px] text-[rgb(var(--c-text)/0.6)] text-center">+ {participants.length - 50} más…</p>}
            </div>
          )}
        </Section>

        {/* 11 + congelar. Deadlines + freeze */}
        <Section icon={Calendar} title="Deadlines y control">
          <div className="space-y-2">
            {!editingDeadlines ? (
              <button onClick={() => { setRegDeadline(''); setChgDeadline(''); setEditingDeadlines(true) }} className="w-full text-left px-3 py-2 rounded-lg border border-[rgb(var(--c-border))] bg-white text-sm flex items-center justify-between">
                <span>Editar fechas límite</span>
                <ChevronDown className="w-4 h-4" />
              </button>
            ) : (
              <div className="space-y-2 p-3 rounded-lg border border-[rgb(var(--c-border))] bg-white">
                <label className="block text-xs">
                  Cierre de registros
                  <input type="datetime-local" value={regDeadline} onChange={e => setRegDeadline(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded border border-[rgb(var(--c-border))] text-sm" />
                </label>
                <label className="block text-xs">
                  Cierre de cambios
                  <input type="datetime-local" value={chgDeadline} onChange={e => setChgDeadline(e.target.value)} className="mt-1 w-full px-2 py-1.5 rounded border border-[rgb(var(--c-border))] text-sm" />
                </label>
                <p className="text-[10px] text-[rgb(var(--c-text)/0.5)]">Requiere columnas <code>registration_deadline</code> y <code>change_deadline</code> en <code>events</code>. Por ahora se guarda localmente.</p>
                <div className="flex gap-2">
                  <button onClick={() => setEditingDeadlines(false)} className="flex-1 px-3 py-2 rounded-lg bg-[rgb(var(--c-success))] text-white text-sm font-display tracking-wider">GUARDAR</button>
                  <button onClick={() => setEditingDeadlines(false)} className="px-3 py-2 rounded-lg border border-[rgb(var(--c-border))] text-sm">Cancelar</button>
                </div>
              </div>
            )}
            <button
              onClick={() => setFrozen(v => !v)}
              className={`w-full px-3 py-3 rounded-lg flex items-center justify-between transition-all ${frozen ? 'bg-[rgb(var(--c-primary))] text-white' : 'bg-white border border-[rgb(var(--c-border))]'}`}
            >
              <span className="flex items-center gap-2 text-sm font-display tracking-wider">
                <Lock className="w-4 h-4" />
                {frozen ? 'REGISTRO CONGELADO' : 'CONGELAR REGISTRO'}
              </span>
              <span className={`w-10 h-5 rounded-full relative transition-colors ${frozen ? 'bg-white/30' : 'bg-[rgb(var(--c-text)/0.2)]'}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${frozen ? 'left-5' : 'left-0.5'}`} />
              </span>
            </button>
          </div>
        </Section>

        {/* 12. Broadcast */}
        <Section icon={Megaphone} title="Broadcast a coaches" subtitle="Genera links a WhatsApp">
          {enriched.length === 0 ? <Empty>Sin coaches aún.</Empty> : (
            <ul className="space-y-1 max-h-80 overflow-y-auto -mx-3 px-3">
              {enriched.map(r => (
                <li key={r.id} className="flex items-center gap-2 py-1 border-b border-[rgb(var(--c-border)/0.3)]">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{r.coach_name}</p>
                    <p className="text-[10px] text-[rgb(var(--c-text)/0.6)] truncate">{r.academy}</p>
                  </div>
                  {r.coach_phone && (
                    <a
                      href={`https://wa.me/${r.coach_phone.replace(/\D/g, '')}?text=${encodeURIComponent(broadcastTemplate(r.coach_name, r.academy))}`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 inline-flex items-center gap-1 bg-[rgb(var(--c-success))] text-white text-[10px] tracking-wider px-2 py-1.5 rounded-md"
                    >
                      <MessageCircle className="w-3 h-3" />
                      WhatsApp
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 13. Notas internas */}
        <Section icon={StickyNote} title="Notas internas" subtitle={`${Object.keys(notes).filter(k => notes[Number(k)]).length} academias con nota`}>
          <p className="text-xs text-[rgb(var(--c-text)/0.7)]">Toca cualquier academia en la lista de arriba para agregar una nota. Se guardan en este dispositivo.</p>
        </Section>

        {/* 14. Exportes */}
        <Section icon={Download} title="Centro de exportes">
          <div className="grid grid-cols-3 gap-2">
            <ExportBtn label="Programa Excel" onClick={() => runExport('excel')} busy={exporting === 'excel'} />
            <ExportBtn label="Programa PDF" onClick={() => runExport('pdf')} busy={exporting === 'pdf'} />
            <ExportBtn label="Registros XLSX" onClick={() => runExport('regs')} busy={exporting === 'regs'} />
          </div>
        </Section>

        {/* 15. Snapshots */}
        <Section icon={CheckCircle2} title="Snapshots del evento">
          <button onClick={takeSnapshot} className="w-full px-3 py-2 rounded-lg bg-[rgb(var(--c-success))] text-white font-display text-sm tracking-wider">CREAR SNAPSHOT AHORA</button>
          {snapshots.length > 0 && (
            <ul className="mt-3 space-y-1">
              {snapshots.map(s => (
                <li key={s.id} className="text-xs flex items-center justify-between border-b border-[rgb(var(--c-border)/0.3)] pb-1">
                  <span className="truncate">{s.label}</span>
                  <span className="text-[10px] text-[rgb(var(--c-text)/0.6)] shrink-0">{formatDate(s.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-[rgb(var(--c-text)/0.5)] mt-2">Guardados localmente; máximo 10.</p>
        </Section>

        <footer className="text-center text-[10px] text-[rgb(var(--c-text)/0.5)] pt-4 pb-2">
          Dance4ever · Panel de socios v1
        </footer>
      </main>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function Section({ icon: Icon, title, subtitle, children }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-[rgb(var(--c-border)/0.6)] p-3.5">
      <header className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-[rgb(var(--c-primary))] shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-base tracking-wider text-[rgb(var(--c-text-strong))] leading-none">{title}</h2>
          {subtitle && <p className="text-[10px] text-[rgb(var(--c-text)/0.6)] mt-0.5">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

function KPI({ label, value, sub, icon: Icon, accent, small }: { label: string; value: string | number; sub?: string; icon?: React.ComponentType<{ className?: string }>; accent?: 'primary' | 'success' | 'accent'; small?: boolean }) {
  const color = accent === 'success' ? 'text-[rgb(var(--c-success))]' : accent === 'accent' ? 'text-[rgb(var(--c-accent))]' : accent === 'primary' ? 'text-[rgb(var(--c-primary))]' : 'text-[rgb(var(--c-text-strong))]'
  return (
    <div className="rounded-xl border border-[rgb(var(--c-border)/0.5)] bg-[rgb(var(--c-surface))] p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] tracking-widest uppercase text-[rgb(var(--c-text)/0.7)]">
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </div>
      <p className={`font-display ${small ? 'text-lg' : 'text-2xl'} leading-tight ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-[rgb(var(--c-text)/0.6)]">{sub}</p>}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[rgb(var(--c-text)/0.6)] text-center py-4">{children}</p>
}

function ExportBtn({ label, onClick, busy }: { label: string; onClick: () => void; busy: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="px-2 py-2.5 rounded-lg bg-[rgb(var(--c-primary))] text-white font-display text-[11px] tracking-wider disabled:opacity-50 active:scale-95"
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
  const status: 'confirmed' | 'pending' = reg.confirmed_at ? 'confirmed' : 'pending'
  return (
    <li className="rounded-lg border border-[rgb(var(--c-border)/0.5)] bg-white overflow-hidden">
      <button onClick={() => setExpanded(v => !v)} className="w-full px-3 py-2.5 flex items-center gap-2 text-left">
        <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${status === 'confirmed' ? 'bg-[rgb(var(--c-success))]' : 'bg-[rgb(var(--c-accent))]'}`} />
        <div className="flex-1 min-w-0">
          <p className="font-display text-sm truncate">{reg.academy || '(sin academia)'}</p>
          <p className="text-[10px] text-[rgb(var(--c-text)/0.65)] truncate">{reg.coach_name} · {reg.dancers.length} alumnos · {reg.acts.length} actos</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-display text-sm tabular-nums text-[rgb(var(--c-primary))]">{formatMoney(reg.total)}</p>
          <p className="text-[9px] text-[rgb(var(--c-text)/0.6)] uppercase tracking-wider">{status === 'confirmed' ? 'Confirmada' : 'En progreso'}</p>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-[rgb(var(--c-border)/0.4)]">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[rgb(var(--c-text)/0.6)]">Equipo:</span>
            <span className="font-medium">{reg.team_name || '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[rgb(var(--c-text)/0.6)]">Coach:</span>
            <span className="font-medium">{reg.coach_name}</span>
            {reg.coach_phone && (
              <a href={`https://wa.me/${reg.coach_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[rgb(var(--c-success))] text-xs">
                <MessageCircle className="w-3 h-3" /> WhatsApp
              </a>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[rgb(var(--c-text)/0.6)]">Submitted:</span>
            <span>{formatDate(reg.submitted_at)}</span>
          </div>
          {reg.confirmed_at && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[rgb(var(--c-text)/0.6)]">Confirmado:</span>
              <span>{formatDate(reg.confirmed_at)}</span>
            </div>
          )}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[rgb(var(--c-text)/0.6)] mb-1">Pago</p>
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
                className="flex-1 px-2 py-1.5 rounded border border-[rgb(var(--c-border))] text-sm"
              />
              <span className="text-xs text-[rgb(var(--c-text)/0.6)]">de {formatMoney(reg.total)}</span>
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-[rgb(var(--c-text)/0.6)] mb-1">Nota interna</p>
            <textarea
              value={note}
              onChange={e => setNotes(p => ({ ...p, [reg.id]: e.target.value }))}
              rows={2}
              placeholder="Recordatorios, acuerdos especiales…"
              className="w-full px-2 py-1.5 rounded border border-[rgb(var(--c-border))] text-sm resize-none"
            />
          </div>
        </div>
      )}
    </li>
  )
}

function RegistrationCurve({ points }: { points: { date: string; count: number }[] }) {
  const w = 320, h = 80, pad = 8
  const max = Math.max(...points.map(p => p.count), 1)
  const xs = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2)
  const ys = (n: number) => h - pad - (n / max) * (h - pad * 2)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(p.count).toFixed(1)}`).join(' ')
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20" preserveAspectRatio="none">
        <path d={path} fill="none" stroke="rgb(var(--c-primary))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={p.date} cx={xs(i)} cy={ys(p.count)} r={2} fill="rgb(var(--c-primary))" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-[rgb(var(--c-text)/0.6)] mt-1">
        <span>{points[0].date}</span>
        <span>{points[points.length - 1].date}</span>
      </div>
      <p className="text-[10px] text-[rgb(var(--c-text)/0.6)] mt-1">Total acumulado: <strong>{points[points.length - 1].count}</strong> registros</p>
    </div>
  )
}
