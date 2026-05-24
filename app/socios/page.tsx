'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
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
  Level,
  categoryFromBirthdate,
} from '@/lib/supabase'
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Download,
  Edit3,
  Home,
  ListOrdered,
  Lock,
  Unlock,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Search,
  StickyNote,
  Trophy,
  TrendingUp,
  Users,
  Plus,
  Trash2,
  X,
  Play,
  Pause,
  Save,
  RefreshCw,
  Clock,
  ChevronUp,
  Copy,
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

function safeFormatDate(iso: any, options?: Intl.DateTimeFormatOptions): string {
  if (!iso) return 'Sin fecha'
  try {
    const str = String(iso).trim()
    if (!str || str === 'null' || str === 'undefined') return 'Sin fecha'
    const dateStr = str.includes('T') ? str : str + 'T00:00:00'
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return str
    return d.toLocaleDateString('es-MX', options || { dateStyle: 'long' })
  } catch {
    return typeof iso === 'string' ? iso : 'Sin fecha'
  }
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

function generateToken(len = 10): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let out = ''
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

type Tab = 'inicio' | 'eventos' | 'registros' | 'programa' | 'finanzas'

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

  // Payments and local sync
  const [payments, setPayments] = useLocalState<Record<number, { paid: number; note?: string }>>('d4e:socios:payments', {})
  const cobrado = useMemo(() => Object.values(payments).reduce((s, p) => s + (p.paid ?? 0), 0), [payments])
  const [notes, setNotes] = useLocalState<Record<number, string>>('d4e:socios:notes', {})

  // PWA & Broadcast States
  const [showPwaPrompt, setShowPwaPrompt] = useState(false)
  const [announcementText, setAnnouncementText] = useState('')
  const [activeAnnouncement, setActiveAnnouncement] = useState('')
  const broadcastChannelRef = useRef<any>(null)

  // Manual Registration States
  const [showCreateReg, setShowCreateReg] = useState(false)
  const [newRegAcademy, setNewRegAcademy] = useState('')
  const [newRegTeam, setNewRegTeam] = useState('')
  const [newRegCoachName, setNewRegCoachName] = useState('')
  const [newRegCoachPhone, setNewRegCoachPhone] = useState('')
  const [newRegCoachEmail, setNewRegCoachEmail] = useState('')
  const [newRegCostPaq, setNewRegCostPaq] = useState(1000)
  const [newRegCostRep, setNewRegCostRep] = useState(300)
  const [isSavingReg, setIsSavingReg] = useState(false)

  // Modals & Drawers States
  const [showCreateEvent, setShowCreateEvent] = useState(false)
  const [showEditEvent, setShowEditEvent] = useState(false)
  const [showRosterEditor, setShowRosterEditor] = useState(false)
  const [selectedReg, setSelectedReg] = useState<EnrichedRegistration | null>(null)

  // Event Forms States
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [onDeckInput, setOnDeckInput] = useState(5)
  const [isSavingEvent, setIsSavingEvent] = useState(false)

  const [copiedEventId, setCopiedEventId] = useState<string | null>(null)
  
  const handleCopyLink = useCallback((e: Event) => {
    if (!e.registration_token) return
    const url = `${window.location.origin}/register/${e.id}?t=${e.registration_token}`
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => {
          setCopiedEventId(e.id)
          setTimeout(() => setCopiedEventId(null), 2000)
        })
        .catch(() => {
          const el = document.createElement('textarea')
          el.value = url
          document.body.appendChild(el)
          el.select()
          document.execCommand('copy')
          document.body.removeChild(el)
          setCopiedEventId(e.id)
          setTimeout(() => setCopiedEventId(null), 2000)
        })
    } else {
      const el = document.createElement('textarea')
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopiedEventId(e.id)
      setTimeout(() => setCopiedEventId(null), 2000)
    }
  }, [])

  // Edit Event State
  const [editEventName, setEditEventName] = useState('')
  const [editEventDate, setEditEventDate] = useState('')
  const [editOnDeck, setEditOnDeck] = useState(5)
  const [editAwardsMode, setEditAwardsMode] = useState(false)

  // Roster Editor Tab state
  const [rosterTab, setRosterTab] = useState<'info' | 'dancers' | 'acts'>('info')
  const [editingDancer, setEditingDancer] = useState<RegistrationDancer | null>(null)
  const [dancerName, setDancerName] = useState('')
  const [dancerBirthdate, setDancerBirthdate] = useState('')

  const [editingAct, setEditingAct] = useState<RegistrationAct | null>(null)
  const [actModality, setActModality] = useState<Modality>('solista')
  const [actLevel, setActLevel] = useState<Level>('basico')
  const [actStyle, setActStyle] = useState('')
  const [actDancers, setActDancers] = useState<number[]>([])

  // Coach Info form
  const [regAcademy, setRegAcademy] = useState('')
  const [regTeam, setRegTeam] = useState('')
  const [regCoachName, setRegCoachName] = useState('')
  const [regCoachPhone, setRegCoachPhone] = useState('')
  const [regCoachEmail, setRegCoachEmail] = useState('')
  const [regCostPaq, setRegCostPaq] = useState(1000)
  const [regCostRep, setRegCostRep] = useState(300)

  // Fetch initial events
  const loadEvents = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('events').select('*').order('created_at', { ascending: false })
      if (error) {
        console.error('Error loading events:', error)
        setLoading(false)
        return
      }
      if (data) {
        setEvents(data)
        if (data.length > 0 && !eventId) {
          setEventId(data[0].id)
        } else if (data.length === 0) {
          setLoading(false)
        }
      } else {
        setLoading(false)
      }
    } catch (e) {
      console.error('Exception loading events:', e)
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  const loadAll = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const [{ data: regs, error: errRegs }, { data: dans, error: errDans }, { data: acs, error: errAcs }, { data: parts, error: errParts }, { data: cos, error: errCos }] = await Promise.all([
        supabase.from('coach_registrations').select('*').eq('event_id', id),
        supabase.from('registration_dancers').select('*'),
        supabase.from('registration_acts').select('*'),
        supabase.from('participants').select('*').eq('event_id', id).order('position'),
        supabase.from('coaches').select('*').eq('event_id', id),
      ])

      if (errRegs || errDans || errAcs || errParts || errCos) {
        console.error('Supabase fetch error in loadAll:', { errRegs, errDans, errAcs, errParts, errCos })
      }

      const regIds = new Set((regs ?? []).map(r => r.id))
      setRegistrations(regs ?? [])
      setDancers((dans ?? []).filter(d => regIds.has(d.registration_id)))
      setActs((acs ?? []).filter(a => regIds.has(a.registration_id)))
      setParticipants(parts ?? [])
      setCoaches(cos ?? [])
    } catch (err) {
      console.error('Exception in loadAll:', err)
    } finally {
      setLastSync(new Date().toISOString())
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (eventId) loadAll(eventId) }, [eventId, loadAll])

  // Subscriptions for instant real-time sync across all devices!
  useEffect(() => {
    if (!eventId) return
    const ch = supabase
      .channel(`socios-dashboard-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `id=eq.${eventId}` }, () => {
        loadEvents()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_registrations', filter: `event_id=eq.${eventId}` }, () => loadAll(eventId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_dancers' }, () => loadAll(eventId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_acts' }, () => loadAll(eventId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `event_id=eq.${eventId}` }, () => loadAll(eventId))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [eventId, loadAll, loadEvents])

  // PWA Home Screen Prompt Detector for iOS
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
      const isStandalone = (window.navigator as any).standalone
      if (isIos && !isStandalone) {
        setShowPwaPrompt(true)
      }
    }
  }, [])

  // Real-time Broadcast Channel for Live Announcements and Ledger Multi-Admin sync
  useEffect(() => {
    if (!eventId) return
    
    const ch = supabase.channel(`broadcast-${eventId}`, {
      config: { broadcast: { self: true } }
    })
    
    ch.on('broadcast', { event: 'announcement' }, (payload) => {
      setActiveAnnouncement(payload.payload.text || '')
    })
    
    ch.on('broadcast', { event: 'ledger_update' }, (payload) => {
      const { regId, paid, note } = payload.payload
      if (paid !== undefined) {
        setPayments(prev => ({ ...prev, [regId]: { ...prev[regId], paid } }))
      }
      if (note !== undefined) {
        setNotes(prev => ({ ...prev, [regId]: note }))
      }
    })
    
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        broadcastChannelRef.current = ch
      }
    })

    return () => {
      if (ch) supabase.removeChannel(ch)
      broadcastChannelRef.current = null
    }
  }, [eventId, setPayments, setNotes])

  const event = useMemo(() => events.find(e => e.id === eventId) ?? null, [events, eventId])

  const enriched: EnrichedRegistration[] = useMemo(() => registrations.map(r => {
    const ds = dancers.filter(d => d.registration_id === r.id)
    const as = acts.filter(a => a.registration_id === r.id)
    return { ...r, dancers: ds, acts: as, total: costForRegistration(as, ds, r.cost_paquete, r.cost_repeticion) }
  }), [registrations, dancers, acts])

  // Keep selected registration updated in real-time when underlying data syncs
  useEffect(() => {
    if (selectedReg) {
      const updated = enriched.find(r => r.id === selectedReg.id)
      if (updated) setSelectedReg(updated)
    }
  }, [enriched, selectedReg])

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

  const autoProgram = useMemo(() => {
    type Item = { act: RegistrationAct; reg: EnrichedRegistration }
    const items: Item[] = []
    enriched.forEach(r => r.acts.forEach(a => items.push({ act: a, reg: r })))
    const modOrder: Modality[] = ['solista', 'dueto', 'trio', 'grupal']
    items.sort((a, b) => {
      const ca = a.act.age_category ? AGE_CATEGORY_ORDER.indexOf(a.act.age_category) : 999
      const cb = b.act.age_category ? AGE_CATEGORY_ORDER.indexOf(b.act.age_category) : 999
      if (ca !== cb) return ca - cb
      const ma = modOrder.indexOf(a.act.modality)
      const mb = modOrder.indexOf(b.act.modality)
      if (ma !== mb) return ma - mb
      return (a.reg.submitted_at ?? '').localeCompare(b.reg.submitted_at ?? '')
    })
    const mid = Math.ceil(items.length / 2)
    return { block1: items.slice(0, mid), block2: items.slice(mid), total: items.length, mid, all: items }
  }, [enriched])

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



  // Deadlines and lock local backups
  const [frozen, setFrozen] = useLocalState<boolean>(`d4e:socios:frozen:${eventId ?? ''}`, false)
  const [regDeadline, setRegDeadline] = useLocalState<string>(`d4e:socios:regDeadline:${eventId ?? ''}`, '')
  const [chgDeadline, setChgDeadline] = useLocalState<string>(`d4e:socios:chgDeadline:${eventId ?? ''}`, '')

  const [exporting, setExporting] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)

  // Snapshots
  const [snapshots, setSnapshots] = useLocalState<{ id: string; createdAt: string; label: string }[]>('d4e:socios:snapshots', [])
  
  function takeSnapshot() {
    const label = prompt('Etiqueta del snapshot:', `Snapshot ${new Date().toLocaleString('es-MX')}`)
    if (!label) return
    setSnapshots(prev => [{ id: crypto.randomUUID(), createdAt: new Date().toISOString(), label }, ...prev].slice(0, 10))
  }

  function broadcastTemplate(coach: string, academy: string) {
    return `Hola ${coach || ''} 👋\n\nTe contactamos del equipo Dance4ever sobre tu registro de ${academy || 'tu academia'}.\n\n`
  }

  // ---------------------------------------------------------
  // Core Event CRUD actions
  // ---------------------------------------------------------
  async function handleCreateEvent() {
    if (!eventName || !eventDate) {
      alert('Favor de llenar todos los campos obligatorios.')
      return
    }
    setIsSavingEvent(true)
    const token = generateToken(10)
    const { data, error } = await supabase.from('events').insert({
      name: eventName,
      date: eventDate,
      current_position: 0,
      on_deck_count: onDeckInput,
      awards_mode: false,
      started_at: null,
      registration_token: token,
    }).select().single()

    if (error) {
      alert('Error al crear evento: ' + error.message)
    } else if (data) {
      setEvents(prev => [data, ...prev])
      setEventId(data.id)
      setShowCreateEvent(false)
      setEventName('')
      setEventDate('')
    }
    setIsSavingEvent(false)
  }

  async function handleCreateManualRegistration() {
    if (!eventId) {
      alert('Debe tener un evento activo seleccionado.')
      return
    }
    if (!newRegAcademy || !newRegCoachName || !newRegCoachPhone) {
      alert('Favor de llenar los campos obligatorios (*).')
      return
    }
    setIsSavingReg(true)
    try {
      const now = new Date().toISOString()
      const { data, error } = await supabase.from('coach_registrations').insert({
        event_id: eventId,
        academy: newRegAcademy,
        team_name: newRegTeam,
        coach_name: newRegCoachName,
        coach_phone: newRegCoachPhone,
        coach_email: newRegCoachEmail || null,
        cost_paquete: newRegCostPaq,
        cost_repeticion: newRegCostRep,
        submitted_at: now,
        confirmed_at: now,
        extra_coaches: []
      }).select().single()

      if (error) {
        throw new Error(error.message)
      }

      alert('¡Registro manual creado y confirmado exitosamente! 🎉')
      setShowCreateReg(false)
      // Reset inputs
      setNewRegAcademy('')
      setNewRegTeam('')
      setNewRegCoachName('')
      setNewRegCoachPhone('')
      setNewRegCoachEmail('')
      setNewRegCostPaq(1000)
      setNewRegCostRep(300)
      
      // Reload registrations
      loadAll(eventId)
    } catch (err) {
      console.error(err)
      alert('Error al crear registro: ' + (err as Error).message)
    } finally {
      setIsSavingReg(false)
    }
  }

  async function handleUpdateEvent() {
    if (!event) return
    setIsSavingEvent(true)
    const { data, error } = await supabase.from('events').update({
      name: editEventName,
      date: editEventDate,
      on_deck_count: editOnDeck,
      awards_mode: editAwardsMode,
    }).eq('id', event.id).select().single()

    if (error) {
      alert('Error al actualizar: ' + error.message)
    } else if (data) {
      setEvents(prev => prev.map(e => e.id === data.id ? data : e))
      setShowEditEvent(false)
    }
    setIsSavingEvent(false)
  }

  async function handleDeleteEvent(id: string, name: string) {
    if (!confirm(`¿ESTÁS SEGURO de eliminar el evento "${name}"? Se borrarán todos los participantes, coaches y configuraciones asociadas. Esta acción no se puede deshacer.`)) return
    
    // First confirm registration tokens and child tables
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) {
      alert('Error al eliminar evento: ' + error.message)
    } else {
      setEvents(prev => prev.filter(e => e.id !== id))
      if (eventId === id) {
        setEventId(events.find(e => e.id !== id)?.id || null)
      }
    }
  }

  async function handleRegenerateToken() {
    if (!event) return
    if (!confirm('Esto invalidará el enlace de registro anterior. ¿Continuar?')) return
    const token = generateToken()
    const { data, error } = await supabase.from('events').update({ registration_token: token }).eq('id', event.id).select().single()
    if (!error && data) {
      setEvents(prev => prev.map(e => e.id === data.id ? data : e))
    }
  }

  async function handleToggleFreeze() {
    if (!event) return
    // Lock means clearing the registration_token so coaches can't enter, unlock means generating a new one
    const isLocked = !event.registration_token
    const nextToken = isLocked ? generateToken() : null
    
    const { data, error } = await supabase.from('events').update({ registration_token: nextToken }).eq('id', event.id).select().single()
    if (!error && data) {
      setEvents(prev => prev.map(e => e.id === data.id ? data : e))
      setFrozen(!isLocked)
    }
  }

  async function handleUpdateLiveStage(delta: number) {
    if (!event) return
    const nextPos = Math.max(0, event.current_position + delta)
    const { data, error } = await supabase.from('events').update({ current_position: nextPos }).eq('id', event.id).select().single()
    if (!error && data) {
      setEvents(prev => prev.map(e => e.id === data.id ? data : e))
    }
  }

  async function handleToggleAwards() {
    if (!event) return
    const next = !event.awards_mode
    const { data, error } = await supabase.from('events').update({ awards_mode: next }).eq('id', event.id).select().single()
    if (!error && data) {
      setEvents(prev => prev.map(e => e.id === data.id ? data : e))
    }
  }

  // ---------------------------------------------------------
  // Direct CRUD overrides for Dancers & Acts
  // ---------------------------------------------------------
  
  // Registration main info save
  async function handleSaveCoachInfo() {
    if (!selectedReg) return
    const { error } = await supabase.from('coach_registrations').update({
      academy: regAcademy,
      team_name: regTeam,
      coach_name: regCoachName,
      coach_phone: regCoachPhone,
      coach_email: regCoachEmail || null,
      cost_paquete: regCostPaq,
      cost_repeticion: regCostRep,
    }).eq('id', selectedReg.id)

    if (error) {
      alert('Error al guardar datos del coach: ' + error.message)
    } else {
      alert('Datos del coach actualizados correctamente.')
    }
  }

  // Toggle registration confirmation state
  async function handleToggleConfirm(reg: EnrichedRegistration) {
    const nextConf = reg.confirmed_at ? null : new Date().toISOString()
    const { error } = await supabase.from('coach_registrations').update({
      confirmed_at: nextConf,
    }).eq('id', reg.id)

    if (error) {
      alert('Error al actualizar confirmación: ' + error.message)
    }
  }

  // Delete registration entirely
  async function handleDeleteRegistration(reg: EnrichedRegistration) {
    if (!confirm(`¿ESTÁS ABSOLUTAMENTE SEGURO de eliminar por completo el registro de la academia "${reg.academy}"? Se eliminarán permanentemente todos sus bailarines y actos.`)) return
    
    setLoading(true)
    const { error: errA } = await supabase.from('registration_acts').delete().eq('registration_id', reg.id)
    const { error: errD } = await supabase.from('registration_dancers').delete().eq('registration_id', reg.id)
    const { error: errR } = await supabase.from('coach_registrations').delete().eq('id', reg.id)
    
    if (errA || errD || errR) {
      alert('Hubo un error al eliminar el registro completo de la base de datos.')
    } else {
      setShowRosterEditor(false)
      setSelectedReg(null)
    }
    setLoading(false)
  }

  // Add/Edit Dancer
  async function handleSaveDancer() {
    if (!selectedReg || !dancerName || !dancerBirthdate) return
    
    const calculatedCategory = categoryFromBirthdate(dancerBirthdate)
    
    if (editingDancer) {
      // Edit mode
      const { error } = await supabase.from('registration_dancers').update({
        name: dancerName,
        birthdate: dancerBirthdate,
        category: calculatedCategory,
      }).eq('id', editingDancer.id)

      if (error) {
        alert('Error al editar bailarín: ' + error.message)
      } else {
        setEditingDancer(null)
        setDancerName('')
        setDancerBirthdate('')
      }
    } else {
      // Create mode
      const lastIdx = selectedReg.dancers.reduce((m, d) => Math.max(m, d.order_idx), -1)
      const { error } = await supabase.from('registration_dancers').insert({
        registration_id: selectedReg.id,
        name: dancerName,
        birthdate: dancerBirthdate,
        category: calculatedCategory,
        order_idx: lastIdx + 1,
      })

      if (error) {
        alert('Error al agregar bailarín: ' + error.message)
      } else {
        setDancerName('')
        setDancerBirthdate('')
      }
    }
  }

  async function handleDeleteDancer(dancerId: number) {
    if (!confirm('¿Estás seguro de eliminar este integrante? Se removerá automáticamente de todos los actos asociados.')) return
    
    // First update registration acts to remove dancerId from arrays
    const affectedActs = selectedReg?.acts.filter(a => a.dancer_ids.includes(dancerId)) || []
    for (const act of affectedActs) {
      const nextDancers = act.dancer_ids.filter(id => id !== dancerId)
      await supabase.from('registration_acts').update({ dancer_ids: nextDancers }).eq('id', act.id)
    }

    const { error } = await supabase.from('registration_dancers').delete().eq('id', dancerId)
    if (error) {
      alert('Error al eliminar bailarín: ' + error.message)
    }
  }

  // Add/Edit Act
  async function handleSaveAct() {
    if (!selectedReg || !actStyle) return
    
    // Validate that number of selected dancers corresponds to modality constraints
    if (actModality === 'solista' && actDancers.length !== 1) {
      alert('Un solista debe tener exactamente 1 integrante seleccionado.')
      return
    }
    if (actModality === 'dueto' && actDancers.length !== 2) {
      alert('Un dueto debe tener exactamente 2 integrantes seleccionados.')
      return
    }
    if (actModality === 'trio' && actDancers.length !== 3) {
      alert('Un trío debe tener exactamente 3 integrantes seleccionados.')
      return
    }
    if (actModality === 'grupal' && actDancers.length === 0) {
      alert('Un acto grupal debe tener al menos 1 integrante seleccionado.')
      return
    }

    // Determine age category of the act automatically based on oldest participating dancer
    const selectedDancerObjects = selectedReg.dancers.filter(d => actDancers.includes(d.id))
    let finalAgeCat: AgeCategory = 'open'
    if (selectedDancerObjects.length > 0) {
      const maxAgeIdx = selectedDancerObjects.reduce((max, d) => {
        const idx = d.category ? AGE_CATEGORY_ORDER.indexOf(d.category) : 0
        return idx > max ? idx : max
      }, 0)
      finalAgeCat = AGE_CATEGORY_ORDER[maxAgeIdx]
    }

    let finalLevel = actLevel
    if (actModality !== 'grupal' && actLevel === 'basico') {
      alert('No existe nivel básico para solistas, dúos y tríos, todos son avanzados. Se guardará como avanzado.')
      finalLevel = 'avanzado'
    }

    if (editingAct) {
      // Edit
      const { error } = await supabase.from('registration_acts').update({
        modality: actModality,
        level: finalLevel,
        style: actStyle,
        dancer_ids: actDancers,
        age_category: finalAgeCat,
      }).eq('id', editingAct.id)

      if (error) {
        alert('Error al editar acto: ' + error.message)
      } else {
        setEditingAct(null)
        setActStyle('')
        setActDancers([])
      }
    } else {
      // Create
      const lastIdx = selectedReg.acts.reduce((m, a) => Math.max(m, a.order_idx), -1)
      const { error } = await supabase.from('registration_acts').insert({
        registration_id: selectedReg.id,
        modality: actModality,
        level: finalLevel,
        style: actStyle,
        order_idx: lastIdx + 1,
        dancer_ids: actDancers,
        age_category: finalAgeCat,
      })

      if (error) {
        alert('Error al agregar acto: ' + error.message)
      } else {
        setActStyle('')
        setActDancers([])
      }
    }
  }

  async function handleDeleteAct(actId: number) {
    if (!confirm('¿Estás seguro de eliminar este acto?')) return
    const { error } = await supabase.from('registration_acts').delete().eq('id', actId)
    if (error) {
      alert('Error al eliminar acto: ' + error.message)
    }
  }

  // ---------------------------------------------------------
  // LIVE PUBLISHER ENGINE
  // ---------------------------------------------------------
  async function handlePublishProgram() {
    if (!event) return
    if (autoProgram.total === 0) {
      alert('No hay actos confirmados para publicar.')
      return
    }
    if (!confirm(`¿Deseas publicar el programa oficial en vivo ahora? Esto reemplazará el orden de programa anterior y cargará los ${autoProgram.total} actos en la vista de MC y del Staff.`)) return

    setPublishing(true)
    try {
      // 1. Clear existing participants for this event
      await supabase.from('participants').delete().eq('event_id', event.id)

      // 2. Prepare new rows using autoProgram order
      const participantRows = autoProgram.all.map((item, idx) => {
        const { act, reg } = item
        
        // Construct names
        const dancersInAct = act.modality === 'grupal' ? reg.dancers : reg.dancers.filter(d => act.dancer_ids.includes(d.id))
        const dancerNames = dancersInAct.map(d => d.name.split(' ').slice(0, 2).join(' ')).join(', ')
        
        const actName = reg.team_name
          ? `${reg.academy} (${reg.team_name})`
          : `${reg.academy} — ${dancerNames}`

        // Extract age category code or default label
        const ageCatCode = act.age_category ? AGE_CATEGORY_LABELS[act.age_category].toUpperCase() : 'OPEN'

        return {
          event_id: event.id,
          position: idx + 1,
          type: act.modality,
          style: act.style,
          category: `${ageCatCode} · ${act.level?.toUpperCase() || 'AVANZADO'}`,
          name: actName,
          academy: reg.academy,
          city: '', // defaults empty
          coach_id: null,
          present: false,
        }
      })

      // 3. Batch insert participants
      const { error } = await supabase.from('participants').insert(participantRows)

      if (error) {
        throw new Error(error.message)
      }

      // 4. Update event states
      await supabase.from('events').update({
        current_position: 0,
        started_at: null,
        awards_mode: false,
      }).eq('id', event.id)

      alert('¡Programa publicado en vivo exitosamente! 🎉 Ahora es visible en todas las demás aplicaciones en tiempo real.')
    } catch (err) {
      console.error(err)
      alert('Error al publicar programa: ' + (err as Error).message)
    } finally {
      setPublishing(false)
    }
  }

  // ---------------------------------------------------------
  // Exports
  // ---------------------------------------------------------
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

  // Loader state
  if (loading && !event) {
    return (
      <div className="min-h-[100dvh] bg-[rgb(var(--c-surface))] flex flex-col items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-[rgb(var(--c-primary)/0.2)] border-t-[rgb(var(--c-primary))] animate-spin mb-4" />
        <p className="font-display text-3xl tracking-widest text-[rgb(var(--c-primary))] animate-pulse">CARGANDO…</p>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-[rgb(var(--c-surface))] text-[rgb(var(--c-text-strong))] font-sans select-none flex flex-col md:flex-row pb-24 md:pb-0">
      
      {/* iOS PWA Safe-Area Status Bar Notch Safety Background Spacer */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-[env(safe-area-inset-top,0px)] bg-black z-50 pointer-events-none" />
      
      {/* ------------------------------------------------------ */}
      {/* DESKTOP SIDEBAR / PANEL DE CONTROL */}
      {/* ------------------------------------------------------ */}
      <aside className="hidden md:flex md:w-64 lg:w-72 bg-white/95 backdrop-blur border-r border-[rgb(var(--c-border)/0.5)] flex-col sticky top-0 h-screen z-40">
        <div className="p-5 flex items-center gap-3 border-b border-[rgb(var(--c-border)/0.4)]">
          <Image src="/logo.png" alt="Dance4ever" width={48} height={36} priority className="mix-blend-multiply shrink-0" />
          <div>
            <p className="font-display text-2xl tracking-wider text-[rgb(var(--c-text-strong))] leading-none">DANCE4EVER</p>
            <p className="font-sans text-[10px] tracking-[0.25em] text-[rgb(var(--c-primary))] font-bold mt-1">CONSOLA SOCIOS</p>
          </div>
        </div>
        
        {/* Event Select in Sidebar */}
        <div className="px-4 py-4 border-b border-[rgb(var(--c-border)/0.4)] bg-[rgb(var(--c-surface)/0.3)]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--c-text)/0.6)] mb-1">Evento Activo</p>
          <div className="relative">
            <select
              value={eventId ?? ''}
              onChange={e => setEventId(e.target.value)}
              className="font-display text-lg tracking-wider text-[rgb(var(--c-text-strong))] bg-white border border-[rgb(var(--c-border))] rounded-xl px-3.5 py-2.5 w-full focus:outline-none focus:border-[rgb(var(--c-primary))] appearance-none cursor-pointer truncate"
            >
              {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[rgb(var(--c-text)/0.5)] pointer-events-none" />
          </div>
        </div>

        {/* Sidebar Nav list */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
          <SidebarBtn active={tab === 'inicio'} onClick={() => setTab('inicio')} icon={Home} label="Inicio" />
          <SidebarBtn active={tab === 'eventos'} onClick={() => setTab('eventos')} icon={Calendar} label="Eventos" />
          <SidebarBtn active={tab === 'registros'} onClick={() => setTab('registros')} icon={Users} label="Registros" />
          <SidebarBtn active={tab === 'programa'} onClick={() => setTab('programa')} icon={ListOrdered} label="Programa" />
          <SidebarBtn active={tab === 'finanzas'} onClick={() => setTab('finanzas')} icon={DollarSign} label="Finanzas Ledger" />
        </nav>

        {/* Sync Status Info */}
        <div className="p-4 border-t border-[rgb(var(--c-border)/0.4)] text-xs text-[rgb(var(--c-text)/0.6)] space-y-1.5 bg-[rgb(var(--c-surface)/0.3)]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[rgb(var(--c-success))] animate-pulse" />
            <span className="font-semibold text-[rgb(var(--c-text-strong))]">Sincronización en vivo</span>
          </div>
          <p>Último sync: {formatRelative(lastSync)}</p>
        </div>
      </aside>

      {/* ------------------------------------------------------ */}
      {/* MOBILE APP HEADER */}
      {/* ------------------------------------------------------ */}
      <header
        className="md:hidden sticky z-30 bg-[rgb(var(--c-surface)/0.95)] backdrop-blur border-b border-[rgb(var(--c-border)/0.5)] shrink-0"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Image src="/logo.png" alt="Dance4ever" width={40} height={30} priority className="mix-blend-multiply shrink-0" />
            <div className="min-w-0">
              <p className="font-display text-[9px] tracking-[0.25em] text-[rgb(var(--c-primary))] font-bold leading-none">SOCIOS</p>
              <select
                value={eventId ?? ''}
                onChange={e => setEventId(e.target.value)}
                className="font-display text-lg tracking-wider text-[rgb(var(--c-text-strong))] bg-transparent w-full focus:outline-none truncate appearance-none pr-5 relative"
              >
                {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          </div>
          
          {/* Quick sync display */}
          <div className="text-right text-[10px] text-[rgb(var(--c-text)/0.6)] leading-tight shrink-0 flex flex-col items-end">
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[rgb(var(--c-success))]" />
              <span className="font-medium text-[rgb(var(--c-text-strong))]">En vivo</span>
            </div>
            <p className="mt-0.5">{formatRelative(lastSync)}</p>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------ */}
      {/* MAIN VIEWPORT CONTENT */}
      {/* ------------------------------------------------------ */}
      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:py-6 space-y-5 max-w-7xl mx-auto w-full">
        
        {/* ------------------------------------------------------ */}
        {/* TAB 1: INICIO (DASHBOARD) */}
        {/* ------------------------------------------------------ */}
        {tab === 'inicio' && (
          <div className="space-y-5 animate-[fadeIn_0.2s_ease-out]">
            
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl shadow-sm border border-[rgb(var(--c-border)/0.5)]">
              <div>
                <h1 className="font-display text-2xl tracking-wider text-[rgb(var(--c-text-strong))] uppercase">Panel de Control Ejecutivo</h1>
                <p className="text-xs text-[rgb(var(--c-text)/0.7)] mt-0.5">
                  {event ? `Evento activo: ${event.name} · ${safeFormatDate(event.date, { day: '2-digit', month: 'long', year: 'numeric' })}` : 'Seleccione un evento'}
                </p>
              </div>
              
              {/* Quick WhatsApp broadcast all triggers */}
              {event?.registration_token && (
                <div className="shrink-0">
                  <span className="inline-flex items-center gap-1.5 bg-[rgb(var(--c-success)/0.1)] text-[rgb(var(--c-success-strong))] text-xs font-semibold px-3 py-1.5 rounded-full">
                    Link de registro activo
                  </span>
                </div>
              )}
            </div>

            {/* KPIs Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KPI label="Academias" value={kpis.academias} icon={Building2} />
              <KPI label="Coaches" value={kpis.coaches} icon={Users} />
              <KPI label="Alumnos" value={kpis.alumnos} icon={Users} />
              <KPI label="Actuaciones" value={kpis.actos} icon={Activity} />
              
              <KPI label="Confirmados" value={`${kpis.confirmadas}`} sub={`${kpis.enProgreso} en borrador`} accent="success" />
              <KPI label="Borrador" value={`${kpis.enProgreso}`} sub="Pendientes de enviar" accent="accent" />
              <KPI label="Proyectado" value={formatMoney(kpis.ingresoProyectado)} sub="Total facturable" accent="primary" />
              <KPI label="Cobrado (Ledger)" value={formatMoney(cobrado)} sub={`Resta ${formatMoney(kpis.ingresoProyectado - cobrado)}`} accent="success" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              
              {/* Registration growth curve */}
              <div className="lg:col-span-2 space-y-4">
                <Section icon={TrendingUp} title="Curva de Registros Activos" subtitle="Progreso de acumulados de coaches en Supabase">
                  {curve && curve.length > 1 ? <RegistrationCurve points={curve} /> : <Empty>Aún no hay suficientes datos para graficar la curva.</Empty>}
                </Section>
              </div>

              {/* Actionable alerts (Pendientes) */}
              <div className="space-y-4">
                <Section icon={AlertTriangle} title="Alertas de Acción Rápida" subtitle={`${pendientes.length} asuntos requieren atención`}>
                  {pendientes.length === 0 ? <Empty>Todo al día, excelente trabajo 🎉</Empty> : (
                    <ul className="space-y-2.5 max-h-[26rem] overflow-y-auto pr-1">
                      {pendientes.map((p, i) => (
                        <li key={i} className="flex items-start gap-2.5 p-3 rounded-xl border border-[rgb(var(--c-border)/0.5)] bg-[rgb(var(--c-surface)/0.25)]">
                          <span className={`mt-1.5 inline-block w-2.5 h-2.5 rounded-full shrink-0 ${p.severity === 'high' ? 'bg-[rgb(var(--c-primary))]' : p.severity === 'med' ? 'bg-[rgb(var(--c-accent))]' : 'bg-[rgb(var(--c-text)/0.4)]'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate leading-tight">{p.coach}</p>
                            <p className="text-xs text-[rgb(var(--c-text)/0.75)] mt-0.5">{p.issue}</p>
                          </div>
                          {p.phone && (
                            <a
                              href={`https://wa.me/${p.phone.replace(/\D/g, '')}?text=${encodeURIComponent(broadcastTemplate(p.coach, '') + `Vemos que tienes una alerta en tu registro: ${p.issue}. ¿Te ayudamos a resolverlo?`)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-[rgb(var(--c-success))] text-white active:scale-90 hover:scale-105 transition-transform"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </div>

            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              
              {/* Voceo en Vivo Panel */}
              <div className="lg:col-span-1">
                <Section icon={Megaphone} title="Voceo en Vivo" subtitle="Emisión de avisos en tiempo real">
                  <div className="space-y-3">
                    <p className="text-xs text-[rgb(var(--c-text)/0.7)] leading-normal">
                      Escribe un anuncio y se proyectará al instante en los portales de MC, Staff y Coaches.
                    </p>
                    <textarea
                      value={announcementText}
                      onChange={e => setAnnouncementText(e.target.value)}
                      placeholder="Ej. LLAMADO URGENTE: Solistas de la categoría Mini presentarse en camerino B..."
                      maxLength={180}
                      rows={3}
                      className="w-full p-3 rounded-xl border border-[rgb(var(--c-border))] bg-[rgb(var(--c-surface)/0.2)] text-sm focus:outline-none focus:border-[rgb(var(--c-primary))] focus:bg-white transition-all resize-none text-[rgb(var(--c-text-strong))]"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          if (!announcementText.trim()) {
                            alert('Favor de escribir el texto del aviso.')
                            return
                          }
                          if (!broadcastChannelRef.current) {
                            alert('No estás conectado al canal en tiempo real. Inténtalo de nuevo.')
                            return
                          }
                          const cleanText = announcementText.trim()
                          const res = await broadcastChannelRef.current.send({
                            type: 'broadcast',
                            event: 'announcement',
                            payload: { text: cleanText }
                          })
                          if (res === 'ok' || res === 'sent' || !res) {
                            setActiveAnnouncement(cleanText)
                            alert('¡Aviso voceado exitosamente! 📣')
                          } else {
                            alert('Error al emitir aviso.')
                          }
                        }}
                        className="flex-1 py-2.5 bg-[rgb(var(--c-primary))] text-white font-display text-sm tracking-wider rounded-xl hover:scale-[1.02] active:scale-95 transition-all shadow-sm font-bold flex items-center justify-center gap-1.5"
                      >
                        <Megaphone className="w-4.5 h-4.5" />
                        VOCEAR
                      </button>
                      <button
                        onClick={async () => {
                          if (!broadcastChannelRef.current) return
                          await broadcastChannelRef.current.send({
                            type: 'broadcast',
                            event: 'announcement',
                            payload: { text: '' }
                          })
                          setAnnouncementText('')
                          setActiveAnnouncement('')
                          alert('¡Aviso borrado! 🧹')
                        }}
                        className="px-3.5 py-2.5 border border-[rgb(var(--c-border))] hover:bg-slate-50 rounded-xl text-xs font-semibold"
                      >
                        LIMPIAR
                      </button>
                    </div>

                    {activeAnnouncement && (
                      <div className="mt-2.5 p-3 rounded-xl border border-[rgb(var(--c-primary)/0.25)] bg-[rgb(var(--c-primary)/0.03)] space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-[rgb(var(--c-primary))] tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-[rgb(var(--c-primary))] animate-ping" />
                          Activo en vivo:
                        </div>
                        <p className="text-xs text-[rgb(var(--c-text-strong))] font-semibold italic">"{activeAnnouncement}"</p>
                      </div>
                    )}
                  </div>
                </Section>
              </div>

              {/* Recent Activity stream */}
              <div className="lg:col-span-2">
                <Section icon={Activity} title="Flujo de Actividad Reciente" subtitle="Acciones capturadas de Supabase">
                  {activity.length === 0 ? <Empty>Ningún registro en curso en este momento.</Empty> : (
                    <div className="divide-y divide-[rgb(var(--c-border)/0.4)] max-h-72 overflow-y-auto pr-1">
                      {activity.map((a, i) => (
                        <div key={i} className="py-3 flex items-center justify-between gap-3 text-sm">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${a.action.includes('Confirmó') ? 'bg-[rgb(var(--c-success))]' : 'bg-[rgb(var(--c-accent))]'}`} />
                            <p className="truncate">
                              <strong>{a.coach}</strong> <span className="text-[rgb(var(--c-text)/0.6)]">de {a.academy || '(sin academia)'}</span>
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="inline-block text-xs font-semibold bg-[rgb(var(--c-border)/0.3)] px-2 py-0.5 rounded-full">{a.action}</span>
                            <p className="text-[10px] text-[rgb(var(--c-text)/0.5)] mt-0.5">{formatRelative(a.at)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </div>

            </div>

          </div>
        )}

        {/* ------------------------------------------------------ */}
        {/* TAB 2: EVENTOS (CRUDS & DEADLINES) */}
        {/* ------------------------------------------------------ */}
        {tab === 'eventos' && (
          <div className="space-y-5 animate-[fadeIn_0.2s_ease-out]">
            
            {/* Header controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl shadow-sm border border-[rgb(var(--c-border)/0.5)]">
              <div>
                <h1 className="font-display text-2xl tracking-wider text-[rgb(var(--c-text-strong))] uppercase">Administrador de Eventos</h1>
                <p className="text-xs text-[rgb(var(--c-text)/0.7)] mt-0.5">Creación, control de deadlines, flujo en vivo y bloqueos de registro.</p>
              </div>
              <button
                onClick={() => setShowCreateEvent(true)}
                className="shrink-0 flex items-center justify-center gap-1.5 bg-[rgb(var(--c-primary))] text-white font-display text-base tracking-wider px-4 py-2.5 rounded-xl hover:scale-105 active:scale-95 transition-all shadow-sm"
              >
                <Plus className="w-5 h-5" /> CREAR EVENTO
              </button>
            </div>

            {/* Events Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {events.map(e => {
                const isSelected = e.id === eventId
                return (
                  <div
                    key={e.id}
                    className={`rounded-2xl border p-4 bg-white transition-all space-y-3 relative overflow-hidden ${isSelected ? 'border-[rgb(var(--c-primary))] ring-1 ring-[rgb(var(--c-primary))]' : 'border-[rgb(var(--c-border)/0.6)] shadow-sm'}`}
                  >
                    {isSelected && <span className="absolute top-0 right-0 bg-[rgb(var(--c-primary))] text-white font-display text-[9px] tracking-widest px-2.5 py-0.5 rounded-bl-lg">ACTIVO</span>}
                    
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-display text-xl tracking-wide uppercase text-[rgb(var(--c-text-strong))]">{e.name}</h3>
                        <p className="text-xs text-[rgb(var(--c-text)/0.7)] flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {safeFormatDate(e.date, { dateStyle: 'long' })}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditEventName(e.name)
                            setEditEventDate(e.date)
                            setEditOnDeck(e.on_deck_count)
                            setEditAwardsMode(e.awards_mode)
                            setEventId(e.id)
                            setShowEditEvent(true)
                          }}
                          className="w-8 h-8 rounded-lg bg-[rgb(var(--c-surface))] text-[rgb(var(--c-text))] flex items-center justify-center hover:bg-[rgb(var(--c-border)/0.4)] active:scale-90"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteEvent(e.id, e.name)}
                          className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 active:scale-90"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-[rgb(var(--c-surface)/0.4)] p-2.5 rounded-xl">
                      <div>
                        <span className="text-[rgb(var(--c-text)/0.55)] uppercase block text-[9px] tracking-wider">Acto en Escenario</span>
                        <span className="font-semibold font-display text-sm">#{e.current_position}</span>
                      </div>
                      <div>
                        <span className="text-[rgb(var(--c-text)/0.55)] uppercase block text-[9px] tracking-wider">Actos en Deck</span>
                        <span className="font-semibold font-display text-sm">{e.on_deck_count}</span>
                      </div>
                      <div className="col-span-2 border-t border-[rgb(var(--c-border)/0.25)] pt-1.5 mt-1 flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="text-[rgb(var(--c-text)/0.55)] uppercase block text-[9px] tracking-wider">Enlace de Registro</span>
                          <span className="font-mono text-[10px] break-all block text-[rgb(var(--c-primary))] font-semibold">
                            {e.registration_token ? `/register/${e.id}?t=${e.registration_token}` : 'BLOQUEADO/CERRADO'}
                          </span>
                        </div>
                        {e.registration_token && (
                          <button
                            onClick={() => handleCopyLink(e)}
                            className={`shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold tracking-wider rounded-lg transition-all active:scale-95 border ${copiedEventId === e.id ? 'bg-[rgb(var(--c-success)/0.15)] text-[rgb(var(--c-success-strong))] border-[rgb(var(--c-success)/0.3)]' : 'bg-[rgb(var(--c-primary)/0.05)] text-[rgb(var(--c-primary))] border-[rgb(var(--c-primary)/0.2)] hover:bg-[rgb(var(--c-primary)/0.15)]'}`}
                          >
                            {copiedEventId === e.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {copiedEventId === e.id ? 'COPIADO' : 'COPIAR'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => setEventId(e.id)}
                        className={`flex-1 py-2 text-xs font-display tracking-widest rounded-xl transition-all ${isSelected ? 'bg-[rgb(var(--c-primary)/0.15)] text-[rgb(var(--c-primary))] font-bold' : 'bg-[rgb(var(--c-surface))] text-[rgb(var(--c-text))]/80 hover:bg-[rgb(var(--c-border)/0.3)]'}`}
                      >
                        {isSelected ? 'ACTIVO ACTUALMENTE' : 'SELECCIONAR EVENTO'}
                      </button>
                    </div>

                  </div>
                )
              })}
            </div>

            {/* Active Event Real-time controls */}
            {event && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                
                {/* Live Controls */}
                <Section icon={Activity} title={`Control en Vivo: ${event.name}`} subtitle="Se refleja al instante en MC, Staff y Coaches">
                  <div className="space-y-4">
                    
                    {/* Live Position Controls */}
                    <div className="p-3 bg-[rgb(var(--c-surface))] rounded-xl flex items-center justify-between gap-4 border border-[rgb(var(--c-border)/0.3)]">
                      <div>
                        <h4 className="font-semibold text-base">Acto en Escenario</h4>
                        <p className="text-xs text-[rgb(var(--c-text)/0.65)] mt-0.5">Controla qué número de acto se proyecta en vivo.</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleUpdateLiveStage(-1)}
                          className="w-10 h-10 rounded-xl bg-white border border-[rgb(var(--c-border))] text-2xl font-bold flex items-center justify-center active:scale-90 hover:border-[rgb(var(--c-primary))] transition-all"
                        >
                          -
                        </button>
                        <span className="font-display text-3xl min-w-10 text-center">{event.current_position}</span>
                        <button
                          onClick={() => handleUpdateLiveStage(1)}
                          className="w-10 h-10 rounded-xl bg-white border border-[rgb(var(--c-border))] text-2xl font-bold flex items-center justify-center active:scale-90 hover:border-[rgb(var(--c-primary))] transition-all"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* On Deck Count */}
                    <div className="p-3 bg-[rgb(var(--c-surface))] rounded-xl flex items-center justify-between gap-4 border border-[rgb(var(--c-border)/0.3)]">
                      <div>
                        <h4 className="font-semibold text-base">Actos en Fila (On Deck)</h4>
                        <p className="text-xs text-[rgb(var(--c-text)/0.65)] mt-0.5">Cantidad de actos próximos a prepararse.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {[3, 4, 5, 6, 7].map(n => (
                          <button
                            key={n}
                            onClick={async () => {
                              const { data } = await supabase.from('events').update({ on_deck_count: n }).eq('id', event.id).select().single()
                              if (data) setEvents(prev => prev.map(ev => ev.id === data.id ? data : ev))
                            }}
                            className={`w-9 h-9 rounded-lg font-semibold text-sm transition-all ${event.on_deck_count === n ? 'bg-[rgb(var(--c-primary))] text-white scale-105' : 'bg-white border border-[rgb(var(--c-border)/0.6)] text-[rgb(var(--c-text))] active:scale-90'}`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Awards Mode toggle */}
                    <div className="p-3 bg-[rgb(var(--c-surface))] rounded-xl flex items-center justify-between gap-4 border border-[rgb(var(--c-border)/0.3)]">
                      <div>
                        <h4 className="font-semibold text-base">Pantalla de Premiación</h4>
                        <p className="text-xs text-[rgb(var(--c-text)/0.65)] mt-0.5">Fuerza a las pantallas a entrar en modo de premiación.</p>
                      </div>
                      <button
                        onClick={handleToggleAwards}
                        className={`px-4 py-2 rounded-xl font-display text-sm tracking-wider transition-all flex items-center gap-2 shadow-sm ${event.awards_mode ? 'bg-[rgb(var(--c-primary))] text-white scale-105' : 'bg-white border border-[rgb(var(--c-border))] text-[rgb(var(--c-text))]/80'}`}
                      >
                        {event.awards_mode ? <Award className="w-4 h-4 animate-bounce" /> : null}
                        {event.awards_mode ? 'MODO PREMIACIÓN ACTIVO' : 'ACTIVAR PREMIACIÓN'}
                      </button>
                    </div>

                  </div>
                </Section>

                {/* Deadlines & Lock settings */}
                <Section icon={Lock} title="Bloqueo y Fechas Límite" subtitle="Seguridad de envíos del evento activo">
                  <div className="space-y-4">
                    
                    {/* Freeze Register Switch */}
                    <div className="p-3.5 bg-white border border-[rgb(var(--c-border)/0.5)] rounded-xl flex items-center justify-between gap-4">
                      <div>
                        <h4 className="font-semibold text-base flex items-center gap-2">
                          {event.registration_token ? <Unlock className="w-4.5 h-4.5 text-[rgb(var(--c-success))]" /> : <Lock className="w-4.5 h-4.5 text-[rgb(var(--c-primary))]" />}
                          {event.registration_token ? 'REGISTRO ABIERTO' : 'REGISTRO CONGELADO'}
                        </h4>
                        <p className="text-xs text-[rgb(var(--c-text)/0.65)] mt-0.5">
                          {event.registration_token ? 'Los coaches pueden inscribirse y modificar actos.' : 'Los enlaces de inscripción quedan deshabilitados.'}
                        </p>
                      </div>
                      <button
                        onClick={handleToggleFreeze}
                        className={`w-14 h-7 rounded-full relative transition-colors ${event.registration_token ? 'bg-[rgb(var(--c-success)/0.2)] border border-[rgb(var(--c-success))]' : 'bg-[rgb(var(--c-primary)/0.2)] border border-[rgb(var(--c-primary))]'}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${event.registration_token ? 'left-8 bg-[rgb(var(--c-success-strong))]' : 'left-1.5 bg-[rgb(var(--c-primary-strong))]'}`} />
                      </button>
                    </div>

                    {/* Deadline date settings */}
                    <div className="space-y-3 p-3 bg-[rgb(var(--c-surface))] rounded-xl border border-[rgb(var(--c-border)/0.3)]">
                      <label className="block text-xs uppercase tracking-widest text-[rgb(var(--c-text)/0.75)] font-bold">
                        Cierre de Registros
                        <input
                          type="datetime-local"
                          value={regDeadline}
                          onChange={e => setRegDeadline(e.target.value)}
                          className="mt-1.5 w-full px-3 py-2.5 bg-white rounded-lg border border-[rgb(var(--c-border)/0.6)] text-sm focus:outline-none"
                        />
                      </label>
                      <label className="block text-xs uppercase tracking-widest text-[rgb(var(--c-text)/0.75)] font-bold">
                        Cierre de Cambios
                        <input
                          type="datetime-local"
                          value={chgDeadline}
                          onChange={e => setChgDeadline(e.target.value)}
                          className="mt-1.5 w-full px-3 py-2.5 bg-white rounded-lg border border-[rgb(var(--c-border)/0.6)] text-sm focus:outline-none"
                        />
                      </label>
                      <p className="text-[10px] text-[rgb(var(--c-text)/0.5)]">
                        * Respaldado en caché local para este dispositivo de control administrativo.
                      </p>
                    </div>

                    {/* Regenerate registration link token */}
                    {event.registration_token && (
                      <button
                        onClick={handleRegenerateToken}
                        className="w-full text-center text-xs text-[rgb(var(--c-primary))] font-semibold hover:underline bg-[rgb(var(--c-primary)/0.05)] py-2 rounded-lg"
                      >
                        Invalidar link actual y regenerar nuevo token de registro
                      </button>
                    )}

                  </div>
                </Section>

              </div>
            )}

          </div>
        )}

        {/* ------------------------------------------------------ */}
        {/* TAB 3: REGISTROS (COACHES, ROSTERS & CRUD OVERRIDES) */}
        {/* ------------------------------------------------------ */}
        {tab === 'registros' && (
          <div className="space-y-5 animate-[fadeIn_0.2s_ease-out]">
            
            {/* Search Header */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-[rgb(var(--c-border)/0.5)] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl tracking-wider text-[rgb(var(--c-text-strong))] uppercase">Base de Datos de Registros</h1>
                  <p className="text-xs text-[rgb(var(--c-text)/0.7)] mt-0.5">Filtra, busca, edita rosters, integrantes, y actos directamente en Supabase.</p>
                </div>
                <button
                  onClick={() => {
                    setNewRegAcademy('')
                    setNewRegTeam('')
                    setNewRegCoachName('')
                    setNewRegCoachPhone('')
                    setNewRegCoachEmail('')
                    setNewRegCostPaq(1000)
                    setNewRegCostRep(300)
                    setShowCreateReg(true)
                  }}
                  className="px-4 py-2.5 bg-[rgb(var(--c-primary))] text-white font-display text-sm tracking-wider rounded-xl hover:scale-[1.02] active:scale-95 transition-all shadow-sm shrink-0 flex items-center gap-1.5 font-bold"
                >
                  <Plus className="w-4 h-4" />
                  NUEVO REGISTRO
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[rgb(var(--c-text)/0.5)]" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar por coach, academia, equipo o integrante de acto…"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-[rgb(var(--c-border))] bg-[rgb(var(--c-surface)/0.2)] text-base focus:outline-none focus:border-[rgb(var(--c-primary))] focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Registrations List Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-[rgb(var(--c-text)/0.6)] px-2">
                <span>Mostrando {filteredRegs.length} de {enriched.length} registros</span>
                <span>Borrador ({kpis.enProgreso}) · Confirmados ({kpis.confirmadas})</span>
              </div>

              {filteredRegs.length === 0 ? <Empty>No se encontraron registros que coincidan con la búsqueda.</Empty> : (
                <div className="grid grid-cols-1 gap-3">
                  {filteredRegs.map(r => {
                    const isConfirmed = !!r.confirmed_at
                    return (
                      <div key={r.id} className="bg-white rounded-2xl border border-[rgb(var(--c-border)/0.5)] p-4 shadow-sm space-y-3 hover:border-[rgb(var(--c-primary)/0.6)] transition-all">
                        
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                          <div className="flex items-start gap-2.5">
                            <span className={`mt-1.5 inline-block w-3.5 h-3.5 rounded-full shrink-0 ${isConfirmed ? 'bg-[rgb(var(--c-success))]' : 'bg-[rgb(var(--c-accent))]'}`} />
                            <div>
                              <h3 className="font-display text-lg tracking-wide uppercase leading-tight text-[rgb(var(--c-text-strong))]">
                                {r.academy || '(sin academia)'}
                              </h3>
                              <p className="text-sm text-[rgb(var(--c-text)/0.8)] mt-0.5">
                                Coach: <span className="font-semibold">{r.coach_name}</span> · Tel: {r.coach_phone}
                              </p>
                              {r.team_name && <p className="text-xs text-[rgb(var(--c-text)/0.6)] mt-0.5">Equipo: <strong>{r.team_name}</strong></p>}
                            </div>
                          </div>

                          <div className="text-right shrink-0 flex sm:flex-col items-baseline sm:items-end justify-between sm:justify-start gap-2">
                            <p className="font-display text-xl text-[rgb(var(--c-primary))] tabular-nums">{formatMoney(r.total)}</p>
                            <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${isConfirmed ? 'bg-[rgb(var(--c-success)/0.15)] text-[rgb(var(--c-success-strong))]' : 'bg-[rgb(var(--c-accent)/0.15)] text-[rgb(var(--c-accent-strong))]'}`}>
                              {isConfirmed ? 'CONFIRMADA' : 'BORRADOR'}
                            </span>
                          </div>
                        </div>

                        {/* Stats mini grid */}
                        <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-xl bg-[rgb(var(--c-surface)/0.45)] text-xs">
                          <div>
                            <span className="text-[rgb(var(--c-text)/0.55)] block uppercase text-[9px] tracking-widest">Integrantes</span>
                            <span className="font-semibold font-display text-sm">{r.dancers.length} alumnos</span>
                          </div>
                          <div>
                            <span className="text-[rgb(var(--c-text)/0.55)] block uppercase text-[9px] tracking-widest">Actos</span>
                            <span className="font-semibold font-display text-sm">{r.acts.length} coreografías</span>
                          </div>
                          <div>
                            <span className="text-[rgb(var(--c-text)/0.55)] block uppercase text-[9px] tracking-widest">Abono Ledger</span>
                            <span className="font-semibold font-display text-sm text-[rgb(var(--c-success-strong))]">{formatMoney(payments[r.id]?.paid ?? 0)}</span>
                          </div>
                        </div>

                        {/* Quick action buttons */}
                        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1.5 border-t border-[rgb(var(--c-border)/0.25)]">
                          
                          {/* WhatsApp broadcast specific coach */}
                          {r.coach_phone && (
                            <a
                              href={`https://wa.me/${r.coach_phone.replace(/\D/g, '')}?text=${encodeURIComponent(broadcastTemplate(r.coach_name, r.academy))}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-[rgb(var(--c-success-strong))] font-semibold hover:underline"
                            >
                              <MessageCircle className="w-4.5 h-4.5" /> Enviar WhatsApp
                            </a>
                          )}

                          {/* Direct CRUD Roster controls */}
                          <div className="flex gap-2 ml-auto">
                            <button
                              onClick={() => handleToggleConfirm(r)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wider transition-all ${isConfirmed ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-[rgb(var(--c-success)/0.15)] text-[rgb(var(--c-success-strong))] hover:bg-[rgb(var(--c-success)/0.25)]'}`}
                            >
                              {isConfirmed ? 'DESCONFIRMAR' : 'CONFIRMAR INGRESO'}
                            </button>
                            
                            <button
                              onClick={() => {
                                setSelectedReg(r)
                                setRegAcademy(r.academy)
                                setRegTeam(r.team_name || '')
                                setRegCoachName(r.coach_name)
                                setRegCoachPhone(r.coach_phone)
                                setRegCoachEmail(r.coach_email || '')
                                setRegCostPaq(r.cost_paquete ?? 1000)
                                setRegCostRep(r.cost_repeticion ?? 300)
                                setRosterTab('info')
                                setShowRosterEditor(true)
                              }}
                              className="bg-[rgb(var(--c-primary))] text-white font-display text-sm tracking-wider px-3.5 py-1.5 rounded-lg hover:scale-105 active:scale-95 transition-all shadow-sm"
                            >
                              EDITAR ROSTER & ACTOS
                            </button>
                          </div>

                        </div>

                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ------------------------------------------------------ */}
        {/* TAB 4: PROGRAMA BORRADOR & PUBLICADOR */}
        {/* ------------------------------------------------------ */}
        {tab === 'programa' && (
          <div className="space-y-5 animate-[fadeIn_0.2s_ease-out]">
            
            {/* Program tools header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl shadow-sm border border-[rgb(var(--c-border)/0.5)]">
              <div>
                <h1 className="font-display text-2xl tracking-wider text-[rgb(var(--c-text-strong))] uppercase">Programa en Vivo y Borradores</h1>
                <p className="text-xs text-[rgb(var(--c-text)/0.7)] mt-0.5">Controla la agenda y publica el programa final oficial a la pantalla principal.</p>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={publishing || autoProgram.total === 0}
                  onClick={handlePublishProgram}
                  className="shrink-0 flex items-center justify-center gap-1.5 bg-[rgb(var(--c-primary))] text-white font-display text-base tracking-wider px-4 py-2.5 rounded-xl hover:scale-105 active:scale-95 disabled:opacity-50 transition-all shadow-sm"
                >
                  {publishing ? 'PUBLICANDO...' : 'PUBLICAR COREOGRAFÍAS'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              
              {/* Draft auto scheduler visual list */}
              <div className="lg:col-span-2 space-y-4">
                <Section icon={ListOrdered} title="Programa Borrador Inteligente" subtitle={`${autoProgram.total} actuaciones en orden automático`}>
                  {autoProgram.total === 0 ? <Empty>Aún no hay actuaciones registradas en este evento.</Empty> : (
                    <div className="space-y-3 max-h-[36rem] overflow-y-auto pr-1">
                      <BlockBanner number={1} count={autoProgram.block1.length} />
                      <ol className="divide-y divide-[rgb(var(--c-border)/0.3)] bg-[rgb(var(--c-surface)/0.2)] p-2 rounded-xl">
                        {autoProgram.block1.map((it, i) => <ProgItem key={it.act.id} idx={i + 1} item={it} />)}
                      </ol>
                      
                      <CeremonyBanner label="PRIMERA PREMIACIÓN INTERMEDIA" />
                      
                      <BlockBanner number={2} count={autoProgram.block2.length} />
                      <ol className="divide-y divide-[rgb(var(--c-border)/0.3)] bg-[rgb(var(--c-surface)/0.2)] p-2 rounded-xl">
                        {autoProgram.block2.map((it, i) => <ProgItem key={it.act.id} idx={autoProgram.mid + i + 1} item={it} />)}
                      </ol>
                      
                      <CeremonyBanner label="PREMIACIÓN FINAL GENERAL" final />
                    </div>
                  )}
                </Section>
              </div>

              {/* Heatmap & Published counts */}
              <div className="space-y-4">
                
                {/* Modality Category matrix */}
                <Section icon={BarChart3} title="Mapa de Calor (Actos)" subtitle="Densidad por modalidad y categoría">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="text-left py-1 pr-1 font-semibold text-[rgb(var(--c-text)/0.6)]">Categoría</th>
                          {MODALITIES.map(m => <th key={m} className="text-center py-1 px-0.5 font-semibold text-[rgb(var(--c-text)/0.6)]">{MODALITY_LABELS[m].slice(0, 3)}</th>)}
                          <th className="text-right py-1 pl-1 font-semibold text-[rgb(var(--c-text)/0.6)]">T</th>
                        </tr>
                      </thead>
                      <tbody>
                        {AGE_CATEGORY_ORDER.map(cat => {
                          const row = heatmap.grid[cat]
                          const sum = MODALITIES.reduce((s, m) => s + row[m], 0)
                          return (
                            <tr key={cat} className="border-t border-[rgb(var(--c-border)/0.3)]">
                              <td className="py-2 pr-1 font-display uppercase text-sm text-[rgb(var(--c-text-strong))] leading-tight">
                                {AGE_CATEGORY_LABELS[cat]}
                              </td>
                              {MODALITIES.map(m => {
                                const n = row[m]
                                const intensity = n === 0 ? 0 : 0.15 + (n / heatmap.max) * 0.7
                                return (
                                  <td key={m} className="py-1 px-0.5 text-center">
                                    <span
                                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg font-semibold text-sm"
                                      style={{
                                        background: `rgb(var(--c-primary)/${intensity})`,
                                        color: intensity > 0.4 ? '#fff' : 'rgb(var(--c-text-strong))'
                                      }}
                                    >
                                      {n || ''}
                                    </span>
                                  </td>
                                )
                              })}
                              <td className="py-2 pl-1 text-right font-semibold text-sm">{sum}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </Section>

                {/* Published programs summary count */}
                <Section icon={ClipboardList} title="Programa en Vivo Oficial" subtitle={`${participants.length} actos publicados`}>
                  {participants.length === 0 ? <Empty>Aún no has publicado el orden de programa oficial.</Empty> : (
                    <div className="space-y-2">
                      <p className="text-xs text-[rgb(var(--c-text)/0.7)] leading-relaxed">
                        Este es el orden publicado que el Staff, el MC y el público visualizan. Puedes re-publicar en cualquier momento.
                      </p>
                      <div className="max-h-60 overflow-y-auto divide-y divide-[rgb(var(--c-border)/0.3)] pr-1 text-xs">
                        {participants.map(p => (
                          <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                            <span className="font-display text-sm w-9 text-right text-[rgb(var(--c-primary))] shrink-0">#{p.position}</span>
                            <span className="flex-1 truncate font-medium">{p.name}</span>
                            <span className="text-[9px] bg-[rgb(var(--c-border)/0.3)] px-1.5 py-0.5 rounded uppercase font-semibold shrink-0">
                              {p.style}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Section>

                {/* Snapshots & Exports */}
                <Section icon={Download} title="Descargas y Snapshots" subtitle="Resguardos del estado de la competencia">
                  <div className="space-y-3">
                    
                    {/* Exports Grid */}
                    <div className="grid grid-cols-3 gap-2">
                      <ExportBtn label="Excel MC" onClick={() => runExport('excel')} busy={exporting === 'excel'} />
                      <ExportBtn label="PDF MC" onClick={() => runExport('pdf')} busy={exporting === 'pdf'} />
                      <ExportBtn label="Regs XLSX" onClick={() => runExport('regs')} busy={exporting === 'regs'} />
                    </div>

                    <div className="border-t border-[rgb(var(--c-border)/0.35)] pt-3 mt-1 space-y-2.5">
                      <button
                        onClick={takeSnapshot}
                        className="w-full py-2 bg-[rgb(var(--c-success))] text-white font-display text-xs tracking-wider rounded-xl active:scale-95 transition-all shadow-sm"
                      >
                        CREAR SNAPSHOT DE SEGURIDAD
                      </button>
                      
                      {snapshots.length > 0 && (
                        <ul className="space-y-1 max-h-32 overflow-y-auto text-xs pr-1">
                          {snapshots.map(s => (
                            <li key={s.id} className="flex items-center justify-between border-b border-[rgb(var(--c-border)/0.25)] pb-1">
                              <span className="truncate pr-2 font-medium">{s.label}</span>
                              <span className="text-[10px] text-[rgb(var(--c-text)/0.5)] shrink-0">{formatDate(s.createdAt)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                  </div>
                </Section>

              </div>
            </div>

          </div>
        )}

        {/* ------------------------------------------------------ */}
        {/* TAB 5: FINANZAS LEDGER */}
        {/* ------------------------------------------------------ */}
        {tab === 'finanzas' && (
          <div className="space-y-5 animate-[fadeIn_0.2s_ease-out]">
            
            {/* Header totals */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-[rgb(var(--c-border)/0.5)] space-y-3">
              <div>
                <h1 className="font-display text-2xl tracking-wider text-[rgb(var(--c-text-strong))] uppercase">Libro Ledger de Finanzas</h1>
                <p className="text-xs text-[rgb(var(--c-text)/0.7)] mt-0.5">Control de cobros manuales y saldos pendientes.</p>
              </div>
              
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-[rgb(var(--c-primary)/0.05)] border border-[rgb(var(--c-primary)/0.2)] p-2.5 rounded-xl">
                  <span className="text-[10px] uppercase tracking-widest text-[rgb(var(--c-text)/0.6)]">Billed (Facturado)</span>
                  <p className="font-display text-lg lg:text-2xl mt-0.5 text-[rgb(var(--c-primary))] font-bold">{formatMoney(kpis.ingresoProyectado)}</p>
                </div>
                <div className="bg-[rgb(var(--c-success)/0.05)] border border-[rgb(var(--c-success)/0.2)] p-2.5 rounded-xl">
                  <span className="text-[10px] uppercase tracking-widest text-[rgb(var(--c-text)/0.6)]">Paid (Cobrado)</span>
                  <p className="font-display text-lg lg:text-2xl mt-0.5 text-[rgb(var(--c-success-strong))] font-bold">{formatMoney(cobrado)}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl">
                  <span className="text-[10px] uppercase tracking-widest text-[rgb(var(--c-text)/0.6)]">Balance (Pendiente)</span>
                  <p className="font-display text-lg lg:text-2xl mt-0.5 text-amber-800 font-bold">{formatMoney(kpis.ingresoProyectado - cobrado)}</p>
                </div>
              </div>
            </div>

            {/* Academy Breakdown table */}
            <Section icon={Building2} title="Desglose Ledger por Academia" subtitle="Control y captura manual de abonos">
              {topAcademies.length === 0 ? <Empty>Aún no hay academias con actos registrados.</Empty> : (
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="w-full text-xs text-left min-w-[500px]">
                    <thead>
                      <tr className="border-b border-[rgb(var(--c-border)/0.5)] pb-2 text-[rgb(var(--c-text)/0.6)] uppercase tracking-wider">
                        <th className="py-2.5 font-semibold">Academia / Roster</th>
                        <th className="py-2.5 font-semibold text-center">Actos</th>
                        <th className="py-2.5 font-semibold text-right">Costo Total</th>
                        <th className="py-2.5 font-semibold text-center px-4">Abono Registrado</th>
                        <th className="py-2.5 font-semibold text-right">Saldo Restante</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgb(var(--c-border)/0.3)]">
                      {enriched.map(r => {
                        const paid = payments[r.id]?.paid ?? 0
                        const rest = r.total - paid
                        return (
                          <tr key={r.id} className="hover:bg-[rgb(var(--c-surface)/0.25)] border-b border-[rgb(var(--c-border)/0.2)]">
                            <td className="py-3">
                              <span className="font-semibold text-sm block text-[rgb(var(--c-text-strong))] leading-tight">
                                {r.academy || '(sin academia)'}
                              </span>
                              <span className="text-[10px] text-[rgb(var(--c-text)/0.65)] block">Coach: {r.coach_name}</span>
                              <input
                                type="text"
                                value={notes[r.id] ?? ''}
                                onChange={e => {
                                  const val = e.target.value
                                  setNotes(n => ({ ...n, [r.id]: val }))
                                  if (broadcastChannelRef.current) {
                                    broadcastChannelRef.current.send({
                                      type: 'broadcast',
                                      event: 'ledger_update',
                                      payload: { regId: r.id, paid: payments[r.id]?.paid ?? 0, note: val }
                                    })
                                  }
                                }}
                                placeholder="Agregar nota privada interna..."
                                className="mt-1.5 w-full max-w-[200px] px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] focus:outline-none focus:bg-white focus:border-[rgb(var(--c-primary))] font-medium text-[rgb(var(--c-text-strong))]"
                              />
                            </td>
                            
                            <td className="py-3 text-center font-display text-base">{r.acts.length}</td>
                            
                            <td className="py-3 text-right font-semibold text-sm tabular-nums">{formatMoney(r.total)}</td>
                            
                            <td className="py-3 text-center px-4">
                              <div className="inline-flex items-center gap-1.5">
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  value={paid || ''}
                                  onChange={e => {
                                    const val = Math.max(0, Number(e.target.value) || 0)
                                    setPayments(p => ({ ...p, [r.id]: { ...p[r.id], paid: val } }))
                                    if (broadcastChannelRef.current) {
                                      broadcastChannelRef.current.send({
                                        type: 'broadcast',
                                        event: 'ledger_update',
                                        payload: { regId: r.id, paid: val, note: notes[r.id] ?? '' }
                                      })
                                    }
                                  }}
                                  placeholder="0"
                                  className="w-20 px-2 py-1 border border-[rgb(var(--c-border))] bg-white rounded-lg text-center font-semibold text-xs focus:outline-none focus:border-[rgb(var(--c-primary))]"
                                />
                              </div>
                            </td>

                            <td className={`py-3 text-right font-display text-base tabular-nums ${rest > 0 ? 'text-amber-800 font-bold' : 'text-[rgb(var(--c-success-strong))]'}`}>
                              {formatMoney(rest)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

          </div>
        )}

      </main>

      {/* ------------------------------------------------------ */}
      {/* MOBILE BOTTOM NAVIGATION BAR */}
      {/* ------------------------------------------------------ */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-45 bg-[rgb(var(--c-surface)/0.96)] backdrop-blur border-t border-[rgb(var(--c-border)/0.5)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="grid grid-cols-5 h-16">
          <TabBtn current={tab} value="inicio" onClick={setTab} icon={Home} label="Inicio" />
          <TabBtn current={tab} value="eventos" onClick={setTab} icon={Calendar} label="Eventos" />
          <TabBtn current={tab} value="registros" onClick={setTab} icon={Users} label="Registros" />
          <TabBtn current={tab} value="programa" onClick={setTab} icon={ListOrdered} label="Programa" />
          <TabBtn current={tab} value="finanzas" onClick={setTab} icon={DollarSign} label="Cuentas" />
        </div>
      </nav>

      {/* ------------------------------------------------------ */}
      {/* MODAL: CREAR EVENTO */}
      {/* ------------------------------------------------------ */}
      {showCreateEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white rounded-2xl border border-[rgb(var(--c-border)/0.6)] w-full max-w-md p-5 space-y-4 shadow-xl select-none animate-[scaleUp_0.15s_ease-out]">
            <div className="flex items-center justify-between border-b border-[rgb(var(--c-border)/0.4)] pb-3">
              <h3 className="font-display text-2xl tracking-wide uppercase text-[rgb(var(--c-text-strong))]">Crear Nuevo Evento</h3>
              <button onClick={() => setShowCreateEvent(false)} className="w-8 h-8 rounded-full bg-[rgb(var(--c-surface))] text-[rgb(var(--c-text))] flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5">
              <label className="block text-sm font-semibold">
                Nombre del Evento *
                <input
                  type="text"
                  value={eventName}
                  onChange={e => setEventName(e.target.value)}
                  placeholder="Ej. Guadalajara 2026, Cancún Finals..."
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[rgb(var(--c-border))] bg-white text-base focus:outline-none focus:border-[rgb(var(--c-primary))]"
                />
              </label>

              <label className="block text-sm font-semibold">
                Fecha del Evento *
                <input
                  type="date"
                  value={eventDate}
                  onChange={e => setEventDate(e.target.value)}
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[rgb(var(--c-border))] bg-white text-base focus:outline-none focus:border-[rgb(var(--c-primary))]"
                />
              </label>

              <label className="block text-sm font-semibold">
                Actos próximos iniciales en deck
                <input
                  type="number"
                  value={onDeckInput}
                  onChange={e => setOnDeckInput(Number(e.target.value) || 5)}
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[rgb(var(--c-border))] bg-white text-base focus:outline-none focus:border-[rgb(var(--c-primary))]"
                />
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                disabled={isSavingEvent}
                onClick={handleCreateEvent}
                className="flex-1 py-3 bg-[rgb(var(--c-primary))] text-white font-display text-lg tracking-wider rounded-xl hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all shadow-sm"
              >
                {isSavingEvent ? 'GUARDANDO...' : 'GUARDAR EVENTO'}
              </button>
              <button
                onClick={() => setShowCreateEvent(false)}
                className="px-4 py-3 border border-[rgb(var(--c-border))] text-sm rounded-xl"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------ */}
      {/* MODAL: EDITAR EVENTO */}
      {/* ------------------------------------------------------ */}
      {showEditEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white rounded-2xl border border-[rgb(var(--c-border)/0.6)] w-full max-w-md p-5 space-y-4 shadow-xl select-none animate-[scaleUp_0.15s_ease-out]">
            <div className="flex items-center justify-between border-b border-[rgb(var(--c-border)/0.4)] pb-3">
              <h3 className="font-display text-2xl tracking-wide uppercase text-[rgb(var(--c-text-strong))]">Editar Evento</h3>
              <button onClick={() => setShowEditEvent(false)} className="w-8 h-8 rounded-full bg-[rgb(var(--c-surface))] text-[rgb(var(--c-text))] flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5">
              <label className="block text-sm font-semibold">
                Nombre del Evento *
                <input
                  type="text"
                  value={editEventName}
                  onChange={e => setEditEventName(e.target.value)}
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[rgb(var(--c-border))] bg-white text-base focus:outline-none focus:border-[rgb(var(--c-primary))]"
                />
              </label>

              <label className="block text-sm font-semibold">
                Fecha del Evento *
                <input
                  type="date"
                  value={editEventDate}
                  onChange={e => setEditEventDate(e.target.value)}
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[rgb(var(--c-border))] bg-white text-base focus:outline-none focus:border-[rgb(var(--c-primary))]"
                />
              </label>

              <label className="block text-sm font-semibold">
                Actos en Deck *
                <input
                  type="number"
                  value={editOnDeck}
                  onChange={e => setEditOnDeck(Number(e.target.value) || 5)}
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[rgb(var(--c-border))] bg-white text-base focus:outline-none focus:border-[rgb(var(--c-primary))]"
                />
              </label>

              <div className="flex items-center justify-between gap-3 p-2 bg-[rgb(var(--c-surface))] rounded-xl">
                <div>
                  <span className="text-sm font-semibold">Pre-activar modo premiación</span>
                  <span className="text-[10px] block text-[rgb(var(--c-text)/0.6)]">Fuerza la pantalla en vivo a los trofeos.</span>
                </div>
                <button
                  onClick={() => setEditAwardsMode(!editAwardsMode)}
                  className={`w-12 h-6 rounded-full relative transition-colors ${editAwardsMode ? 'bg-[rgb(var(--c-primary))]' : 'bg-slate-200'}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${editAwardsMode ? 'left-6.5' : 'left-0.5'}`} />
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                disabled={isSavingEvent}
                onClick={handleUpdateEvent}
                className="flex-1 py-3 bg-[rgb(var(--c-primary))] text-white font-display text-lg tracking-wider rounded-xl hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all shadow-sm"
              >
                {isSavingEvent ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}
              </button>
              <button
                onClick={() => setShowEditEvent(false)}
                className="px-4 py-3 border border-[rgb(var(--c-border))] text-sm rounded-xl"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------ */}
      {/* MODAL: REGISTRO MANUAL DE COACH / ACADEMIA */}
      {/* ------------------------------------------------------ */}
      {showCreateReg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]">
          <div className="bg-white rounded-2xl border border-[rgb(var(--c-border)/0.6)] w-full max-w-lg p-6 space-y-4 shadow-xl select-none animate-[scaleUp_0.15s_ease-out] max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[rgb(var(--c-border)/0.4)] pb-3">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-[rgb(var(--c-primary))] uppercase">Administración Dance4ever</span>
                <h3 className="font-display text-xl tracking-wide uppercase text-[rgb(var(--c-text-strong))] leading-tight">
                  + Nuevo Registro Manual
                </h3>
              </div>
              <button
                onClick={() => setShowCreateReg(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.65)]">
                Academia / Estudio *
                <input
                  type="text"
                  required
                  value={newRegAcademy}
                  onChange={e => setNewRegAcademy(e.target.value)}
                  placeholder="Ej. Royal Dance Academy"
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-[rgb(var(--c-border))] bg-white text-base focus:outline-none focus:border-[rgb(var(--c-primary))] text-[rgb(var(--c-text-strong))]"
                />
              </label>

              <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.65)]">
                Nombre de Equipo (Opcional)
                <input
                  type="text"
                  value={newRegTeam}
                  onChange={e => setNewRegTeam(e.target.value)}
                  placeholder="Ej. Team Junior"
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-[rgb(var(--c-border))] bg-white text-base focus:outline-none focus:border-[rgb(var(--c-primary))] text-[rgb(var(--c-text-strong))]"
                />
              </label>

              <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.65)]">
                Nombre del Coach *
                <input
                  type="text"
                  required
                  value={newRegCoachName}
                  onChange={e => setNewRegCoachName(e.target.value)}
                  placeholder="Ej. Alejandra Gómez"
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-[rgb(var(--c-border))] bg-white text-base focus:outline-none focus:border-[rgb(var(--c-primary))] text-[rgb(var(--c-text-strong))]"
                />
              </label>

              <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.65)]">
                Celular del Coach *
                <input
                  type="tel"
                  required
                  value={newRegCoachPhone}
                  onChange={e => setNewRegCoachPhone(e.target.value)}
                  placeholder="Ej. 5512345678"
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-[rgb(var(--c-border))] bg-white text-base focus:outline-none focus:border-[rgb(var(--c-primary))] text-[rgb(var(--c-text-strong))]"
                />
              </label>

              <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.65)] sm:col-span-2">
                Correo del Coach (Opcional)
                <input
                  type="email"
                  value={newRegCoachEmail}
                  onChange={e => setNewRegCoachEmail(e.target.value)}
                  placeholder="Ej. coach@dance4ever.com"
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-[rgb(var(--c-border))] bg-white text-base focus:outline-none focus:border-[rgb(var(--c-primary))] text-[rgb(var(--c-text-strong))]"
                />
              </label>

              <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.65)]">
                Costo Paquete Base *
                <input
                  type="number"
                  value={newRegCostPaq}
                  onChange={e => setNewRegCostPaq(Number(e.target.value) || 0)}
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-[rgb(var(--c-border))] bg-white text-base focus:outline-none focus:border-[rgb(var(--c-primary))] text-[rgb(var(--c-text-strong))]"
                />
              </label>

              <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.65)]">
                Costo Repetición Acto *
                <input
                  type="number"
                  value={newRegCostRep}
                  onChange={e => setNewRegCostRep(Number(e.target.value) || 0)}
                  className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-[rgb(var(--c-border))] bg-white text-base focus:outline-none focus:border-[rgb(var(--c-primary))] text-[rgb(var(--c-text-strong))]"
                />
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                disabled={isSavingReg}
                onClick={handleCreateManualRegistration}
                className="flex-1 py-3 bg-[rgb(var(--c-primary))] text-white font-display text-lg tracking-wider rounded-xl hover:scale-[1.02] active:scale-95 disabled:opacity-50 transition-all shadow-sm font-bold"
              >
                {isSavingReg ? 'CREANDO...' : 'CREAR Y CONFIRMAR'}
              </button>
              <button
                onClick={() => setShowCreateReg(false)}
                className="px-5 py-3 border border-[rgb(var(--c-border))] text-sm rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* iOS PWA Safari Prompter */}
      {showPwaPrompt && (
        <div className="fixed bottom-4 left-4 right-4 z-50 bg-black/95 backdrop-blur-md text-white border border-white/20 p-4 rounded-2xl shadow-2xl flex flex-col gap-3 animate-[slideUp_0.3s_ease-out] md:hidden select-none max-w-sm mx-auto">
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <div className="bg-[rgb(var(--c-primary))] p-2 rounded-xl">
                <div className="w-6 h-4.5 bg-white relative rounded flex items-center justify-center text-[8px] font-black text-black font-display tracking-tighter">D4E</div>
              </div>
              <div>
                <p className="font-display text-sm tracking-wider uppercase">Dance4ever Socios</p>
                <p className="text-[10px] text-white/60 font-medium">Instala en tu pantalla de inicio</p>
              </div>
            </div>
            <button
              onClick={() => setShowPwaPrompt(false)}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 active:scale-90 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-white/90 leading-normal">
            Para instalar esta aplicación en tu iPhone, toca el botón de compartir de Safari{' '}
            <span className="inline-flex items-center justify-center bg-white/25 p-1 rounded mx-1 align-middle">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </span>{' '}
            y selecciona <strong className="text-[rgb(var(--c-primary))]">"Añadir a pantalla de inicio"</strong>.
          </p>
        </div>
      )}

      {/* ------------------------------------------------------ */}
      {/* MODAL / DRAWER: EDITAR ROSTER COMPLETO & INTEGRANTES (CRUD OVERRIDES) */}
      {/* ------------------------------------------------------ */}
      {showRosterEditor && selectedReg && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-[fadeIn_0.12s_ease-out]">
          <div
            className="bg-white w-full md:max-w-xl lg:max-w-2xl h-full flex flex-col shadow-2xl relative select-none animate-[slideIn_0.15s_ease-out]"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            
            {/* Header */}
            <div className="px-5 py-4 border-b border-[rgb(var(--c-border)/0.5)] flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-widest text-[rgb(var(--c-primary))] uppercase">EDITOR ADMINISTRATIVO DE ROSTERS</p>
                <h3 className="font-display text-xl tracking-wide uppercase truncate text-[rgb(var(--c-text-strong))] leading-tight">
                  {selectedReg.academy || '(sin academia)'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowRosterEditor(false)
                  setSelectedReg(null)
                  setEditingDancer(null)
                  setEditingAct(null)
                }}
                className="w-9 h-9 rounded-full bg-[rgb(var(--c-surface))] text-[rgb(var(--c-text))] flex items-center justify-center hover:bg-[rgb(var(--c-border)/0.4)] transition-all shrink-0"
              >
                <X className="w-5.5 h-5.5" />
              </button>
            </div>

            {/* Top Editor tabs */}
            <div className="flex border-b border-[rgb(var(--c-border)/0.3)] text-center text-xs tracking-widest uppercase font-display select-none shrink-0 bg-[rgb(var(--c-surface)/0.2)]">
              <button onClick={() => setRosterTab('info')} className={`flex-1 py-3 border-b-2 font-bold ${rosterTab === 'info' ? 'border-[rgb(var(--c-primary))] text-[rgb(var(--c-primary))]' : 'border-transparent text-[rgb(var(--c-text)/0.6)]'}`}>COACH INFO</button>
              <button onClick={() => setRosterTab('dancers')} className={`flex-1 py-3 border-b-2 font-bold ${rosterTab === 'dancers' ? 'border-[rgb(var(--c-primary))] text-[rgb(var(--c-primary))]' : 'border-transparent text-[rgb(var(--c-text)/0.6)]'}`}>INTEGRANTES ({selectedReg.dancers.length})</button>
              <button onClick={() => setRosterTab('acts')} className={`flex-1 py-3 border-b-2 font-bold ${rosterTab === 'acts' ? 'border-[rgb(var(--c-primary))] text-[rgb(var(--c-primary))]' : 'border-transparent text-[rgb(var(--c-text)/0.6)]'}`}>COREOGRAFÍAS ({selectedReg.acts.length})</button>
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              
              {/* TAB ROSTER: COACH INFO */}
              {rosterTab === 'info' && (
                <div className="space-y-4 animate-[fadeIn_0.15s_ease-out]">
                  <h4 className="font-display text-lg tracking-wider text-[rgb(var(--c-primary))] uppercase border-b pb-1">Datos Operativos de la Academia</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.7)]">
                      Nombre de la Academia
                      <input type="text" value={regAcademy} onChange={e => setRegAcademy(e.target.value)} className="mt-1 w-full px-3 py-2 bg-white rounded-lg border border-[rgb(var(--c-border)/0.7)] text-sm focus:outline-none" />
                    </label>

                    <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.7)]">
                      Nombre del Equipo
                      <input type="text" value={regTeam} onChange={e => setRegTeam(e.target.value)} className="mt-1 w-full px-3 py-2 bg-white rounded-lg border border-[rgb(var(--c-border)/0.7)] text-sm focus:outline-none" />
                    </label>

                    <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.7)]">
                      Nombre del Coach
                      <input type="text" value={regCoachName} onChange={e => setRegCoachName(e.target.value)} className="mt-1 w-full px-3 py-2 bg-white rounded-lg border border-[rgb(var(--c-border)/0.7)] text-sm focus:outline-none" />
                    </label>

                    <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.7)]">
                      Teléfono del Coach
                      <input type="tel" value={regCoachPhone} onChange={e => setRegCoachPhone(e.target.value)} className="mt-1 w-full px-3 py-2 bg-white rounded-lg border border-[rgb(var(--c-border)/0.7)] text-sm focus:outline-none" />
                    </label>

                    <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.7)] sm:col-span-2">
                      Correo Electrónico
                      <input type="email" value={regCoachEmail} onChange={e => setRegCoachEmail(e.target.value)} className="mt-1 w-full px-3 py-2 bg-white rounded-lg border border-[rgb(var(--c-border)/0.7)] text-sm focus:outline-none" />
                    </label>

                    <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.7)]">
                      Costo primer participación
                      <input type="number" value={regCostPaq} onChange={e => setRegCostPaq(Number(e.target.value) || 0)} className="mt-1 w-full px-3 py-2 bg-white rounded-lg border border-[rgb(var(--c-border)/0.7)] text-sm focus:outline-none" />
                    </label>

                    <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.7)]">
                      Costo repetición coreografía
                      <input type="number" value={regCostRep} onChange={e => setRegCostRep(Number(e.target.value) || 0)} className="mt-1 w-full px-3 py-2 bg-white rounded-lg border border-[rgb(var(--c-border)/0.7)] text-sm focus:outline-none" />
                    </label>
                  </div>

                  <div className="pt-4 flex gap-3 border-t">
                    <button
                      onClick={handleSaveCoachInfo}
                      className="flex-1 py-3 bg-[rgb(var(--c-primary))] text-white font-display text-base tracking-wider rounded-xl active:scale-95 transition-all shadow-sm flex items-center justify-center gap-1.5"
                    >
                      <Save className="w-5 h-5" /> GUARDAR DATOS DEL COACH
                    </button>
                    
                    <button
                      onClick={() => handleDeleteRegistration(selectedReg)}
                      className="px-4 py-3 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl text-xs font-bold tracking-wider uppercase border border-red-200"
                    >
                      BORRAR REGISTRO COMPLETO
                    </button>
                  </div>
                </div>
              )}

              {/* TAB ROSTER: INTEGRANTES (DANCERS) */}
              {rosterTab === 'dancers' && (
                <div className="space-y-5 animate-[fadeIn_0.15s_ease-out]">
                  
                  {/* Dancer Form editor */}
                  <div className="p-4 bg-[rgb(var(--c-surface)/0.5)] rounded-2xl border border-[rgb(var(--c-border)/0.55)] space-y-3.5">
                    <h5 className="font-display text-sm tracking-widest text-[rgb(var(--c-primary))] uppercase font-bold">
                      {editingDancer ? 'EDITAR INTEGRANTE' : 'NUEVO INTEGRANTE'}
                    </h5>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.65)]">
                        Nombre Completo
                        <input
                          type="text"
                          value={dancerName}
                          onChange={e => setDancerName(e.target.value)}
                          placeholder="Ej. Sofia Martínez Gómez"
                          className="mt-1.5 w-full px-3 py-2 bg-white rounded-lg border border-[rgb(var(--c-border)/0.7)] text-sm focus:outline-none"
                        />
                      </label>

                      <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.65)]">
                        Fecha de Nacimiento
                        <input
                          type="date"
                          value={dancerBirthdate}
                          onChange={e => setDancerBirthdate(e.target.value)}
                          className="mt-1.5 w-full px-3 py-2 bg-white rounded-lg border border-[rgb(var(--c-border)/0.7)] text-sm focus:outline-none"
                        />
                      </label>
                    </div>

                    <div className="flex gap-2 justify-end pt-1">
                      <button
                        onClick={handleSaveDancer}
                        className="px-4 py-2 bg-[rgb(var(--c-primary))] text-white font-display text-xs tracking-wider rounded-lg active:scale-95 transition-all shadow-sm"
                      >
                        {editingDancer ? 'GUARDAR BAILARÍN' : 'AÑADIR A LISTA'}
                      </button>
                      {editingDancer && (
                        <button
                          onClick={() => {
                            setEditingDancer(null)
                            setDancerName('')
                            setDancerBirthdate('')
                          }}
                          className="px-3 py-2 border border-[rgb(var(--c-border))] text-xs rounded-lg"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Roster list */}
                  <div className="space-y-2">
                    <h4 className="font-display text-lg tracking-wider text-[rgb(var(--c-text-strong))] uppercase border-b pb-1">
                      Lista de Alumnos Inscritos
                    </h4>
                    
                    {selectedReg.dancers.length === 0 ? <Empty>Aún no hay integrantes registrados.</Empty> : (
                      <div className="divide-y divide-[rgb(var(--c-border)/0.35)]">
                        {selectedReg.dancers.map((d, idx) => (
                          <div key={d.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                            <div className="min-w-0">
                              <p className="font-semibold truncate">{idx + 1}. {d.name}</p>
                              <p className="text-xs text-[rgb(var(--c-text)/0.65)] mt-0.5">
                                F. Nacimiento: {d.birthdate} · Categoría: <strong className="uppercase">{d.category || 'Sin calcular'}</strong>
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => {
                                  setEditingDancer(d)
                                  setDancerName(d.name)
                                  setDancerBirthdate(d.birthdate)
                                }}
                                className="w-8 h-8 rounded-lg bg-[rgb(var(--c-surface))] text-[rgb(var(--c-text))] flex items-center justify-center hover:bg-[rgb(var(--c-border)/0.3)] active:scale-90"
                              >
                                <Edit3 className="w-4.5 h-4.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteDancer(d.id)}
                                className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 active:scale-90"
                              >
                                <Trash2 className="w-4.5 h-4.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* TAB ROSTER: COREOGRAFÍAS (ACTS) */}
              {rosterTab === 'acts' && (
                <div className="space-y-5 animate-[fadeIn_0.15s_ease-out]">
                  
                  {/* Act Form editor */}
                  <div className="p-4 bg-[rgb(var(--c-surface)/0.5)] rounded-2xl border border-[rgb(var(--c-border)/0.55)] space-y-3.5">
                    <h5 className="font-display text-sm tracking-widest text-[rgb(var(--c-primary))] uppercase font-bold">
                      {editingAct ? 'EDITAR COREOGRAFÍA' : 'NUEVA COREOGRAFÍA'}
                    </h5>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.65)]">
                        Modalidad
                        <select
                          value={actModality}
                          onChange={e => setActModality(e.target.value as Modality)}
                          className="mt-1.5 w-full px-3 py-2 bg-white rounded-lg border border-[rgb(var(--c-border)/0.7)] text-sm focus:outline-none"
                        >
                          {MODALITIES.map(m => <option key={m} value={m}>{MODALITY_LABELS[m]}</option>)}
                        </select>
                      </label>

                      <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.65)]">
                        Nivel
                        <select
                          value={actLevel || 'basico'}
                          onChange={e => setActLevel(e.target.value as Level)}
                          className="mt-1.5 w-full px-3 py-2 bg-white rounded-lg border border-[rgb(var(--c-border)/0.7)] text-sm focus:outline-none"
                        >
                          <option value="basico">Básico</option>
                          <option value="avanzado">Avanzado</option>
                        </select>
                      </label>

                      <label className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.65)]">
                        Estilo de Danza
                        <input
                          type="text"
                          value={actStyle}
                          onChange={e => setActStyle(e.target.value)}
                          placeholder="Ej. Jazz, Hip Hop, Lirical..."
                          className="mt-1.5 w-full px-3 py-2 bg-white rounded-lg border border-[rgb(var(--c-border)/0.7)] text-sm focus:outline-none"
                        />
                      </label>
                    </div>

                    {actModality !== 'grupal' && actLevel === 'basico' && (
                      <div className="p-3 bg-[rgb(var(--c-accent)/0.15)] border border-[rgb(var(--c-accent)/0.3)] text-[rgb(var(--c-accent-strong))] rounded-xl text-xs font-semibold animate-pulse">
                        ⚠️ No existe nivel básico para solistas, dúos y tríos. Todos son avanzados.
                      </div>
                    )}

                    {/* Checkbox multi selector for dancers */}
                    <div className="space-y-1.5">
                      <span className="block text-xs uppercase font-bold text-[rgb(var(--c-text)/0.65)]">
                        Integrantes Participantes ({actDancers.length})
                      </span>
                      
                      {selectedReg.dancers.length === 0 ? (
                        <p className="text-xs text-amber-700 font-semibold">
                          * Registra integrantes primero en la pestaña "Integrantes" para poder agregarlos a la coreografía.
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto border border-[rgb(var(--c-border)/0.5)] p-2 rounded-xl bg-white text-xs">
                          {selectedReg.dancers.map(d => {
                            const isChecked = actDancers.includes(d.id)
                            return (
                              <label key={d.id} className="flex items-center gap-2 cursor-pointer p-1 rounded hover:bg-[rgb(var(--c-surface)/0.4)]">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked) {
                                      setActDancers(prev => prev.filter(id => id !== d.id))
                                    } else {
                                      setActDancers(prev => [...prev, d.id])
                                    }
                                  }}
                                  className="w-4.5 h-4.5 rounded accent-[rgb(var(--c-primary))]"
                                />
                                <span className="truncate">{d.name} <span className="text-[10px] text-[rgb(var(--c-text)/0.65)]">({d.category?.toUpperCase()})</span></span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 justify-end pt-1">
                      <button
                        disabled={selectedReg.dancers.length === 0}
                        onClick={handleSaveAct}
                        className="px-4 py-2 bg-[rgb(var(--c-primary))] text-white font-display text-xs tracking-wider rounded-lg active:scale-95 disabled:opacity-50 transition-all shadow-sm"
                      >
                        {editingAct ? 'GUARDAR CAMBIOS' : 'AGREGAR COREOGRAFÍA'}
                      </button>
                      {editingAct && (
                        <button
                          onClick={() => {
                            setEditingAct(null)
                            setActStyle('')
                            setActDancers([])
                          }}
                          className="px-3 py-2 border border-[rgb(var(--c-border))] text-xs rounded-lg"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Coreographies list */}
                  <div className="space-y-2">
                    <h4 className="font-display text-lg tracking-wider text-[rgb(var(--c-text-strong))] uppercase border-b pb-1">
                      Lista de Coreografías Inscritas
                    </h4>

                    {selectedReg.acts.length === 0 ? <Empty>Aún no hay coreografías registradas.</Empty> : (
                      <div className="divide-y divide-[rgb(var(--c-border)/0.35)]">
                        {selectedReg.acts.map((a, idx) => {
                          const dancersInAct = a.modality === 'grupal' ? selectedReg.dancers : selectedReg.dancers.filter(d => a.dancer_ids.includes(d.id))
                          const dancerNames = dancersInAct.map(d => d.name).join(', ')
                          const actMeta = [a.level, a.style, a.age_category].filter(Boolean).join(' · ').toUpperCase()
                          return (
                            <div key={a.id} className="py-3 flex items-start justify-between gap-3 text-sm">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-display text-base tracking-wider text-[rgb(var(--c-primary))] leading-none">#{idx + 1}</span>
                                  <span className="font-bold uppercase tracking-wider text-xs bg-[rgb(var(--c-border)/0.3)] px-1.5 py-0.5 rounded">
                                    {MODALITY_LABELS[a.modality]}
                                  </span>
                                  <span className="text-[10px] text-[rgb(var(--c-text)/0.5)]">({dancersInAct.length} integr.)</span>
                                </div>
                                <p className="text-xs text-[rgb(var(--c-text)/0.55)] tracking-wider mt-1 font-semibold">{actMeta}</p>
                                {dancerNames && <p className="text-xs text-[rgb(var(--c-text)/0.75)] truncate mt-0.5">Participan: {dancerNames}</p>}
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => {
                                    setEditingAct(a)
                                    setActModality(a.modality)
                                    setActLevel(a.level || 'basico')
                                    setActStyle(a.style || '')
                                    setActDancers(a.dancer_ids || [])
                                  }}
                                  className="w-8 h-8 rounded-lg bg-[rgb(var(--c-surface))] text-[rgb(var(--c-text))] flex items-center justify-center hover:bg-[rgb(var(--c-border)/0.3)] active:scale-90"
                                >
                                  <Edit3 className="w-4.5 h-4.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteAct(a.id)}
                                  className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 active:scale-90"
                                >
                                  <Trash2 className="w-4.5 h-4.5" />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                </div>
              )}

            </div>

          </div>
        </div>
      )}

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
      className={`flex flex-col items-center justify-center gap-0.5 active:bg-[rgb(var(--c-primary)/0.05)] transition-colors select-none ${active ? 'text-[rgb(var(--c-primary))] font-semibold' : 'text-[rgb(var(--c-text)/0.55)]'}`}
    >
      <Icon className="w-6.5 h-6.5 transition-transform active:scale-90" />
      <span className={`text-[10px] font-display tracking-wider ${active ? 'font-bold' : ''}`}>{label}</span>
    </button>
  )
}

function SidebarBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <button
      onClick={() => { onClick(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-display text-base tracking-wider transition-all select-none ${active ? 'bg-[rgb(var(--c-primary))] text-white font-bold shadow-md shadow-[rgb(var(--c-primary)/0.25)] translate-x-1.5' : 'text-[rgb(var(--c-text))] hover:bg-[rgb(var(--c-surface))] active:bg-[rgb(var(--c-border)/0.25)]'}`}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <span>{label}</span>
    </button>
  )
}

function Section({ icon: Icon, title, subtitle, children }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow-sm border border-[rgb(var(--c-border)/0.5)] p-4.5">
      <header className="flex items-center gap-2.5 mb-4">
        <Icon className="w-5.5 h-5.5 text-[rgb(var(--c-primary))] shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-xl tracking-wider text-[rgb(var(--c-text-strong))] leading-none uppercase">{title}</h2>
          {subtitle && <p className="text-xs text-[rgb(var(--c-text)/0.6)] mt-1">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

function KPI({ label, value, sub, icon: Icon, accent }: { label: string; value: string | number; sub?: string; icon?: React.ComponentType<{ className?: string }>; accent?: 'primary' | 'success' | 'accent' }) {
  const color = accent === 'success' ? 'text-[rgb(var(--c-success))] font-bold' : accent === 'accent' ? 'text-[rgb(var(--c-accent))] font-bold' : accent === 'primary' ? 'text-[rgb(var(--c-primary))] font-bold' : 'text-[rgb(var(--c-text-strong))]'
  return (
    <div className="rounded-2xl border border-[rgb(var(--c-border)/0.5)] bg-white p-3.5 shadow-sm hover:shadow-md hover:border-[rgb(var(--c-primary)/0.4)] transition-all select-none">
      <div className="flex items-center gap-1.5 text-[10px] tracking-widest uppercase text-[rgb(var(--c-text)/0.65)] mb-1 font-semibold">
        {Icon && <Icon className="w-4 h-4 text-[rgb(var(--c-text)/0.5)]" />}
        {label}
      </div>
      <p className={`font-display text-2.5xl leading-tight ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-[rgb(var(--c-text)/0.55)] mt-0.5 font-medium leading-none">{sub}</p>}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-[rgb(var(--c-text)/0.55)] text-center py-8 font-medium">{children}</p>
}

function ExportBtn({ label, onClick, busy }: { label: string; onClick: () => void; busy: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="px-2 py-3 rounded-xl bg-[rgb(var(--c-primary))] text-white font-display text-[10px] tracking-wider disabled:opacity-50 active:scale-95 hover:scale-102 transition-transform shadow-sm flex items-center justify-center font-bold"
    >
      {busy ? '...' : label}
    </button>
  )
}

function BlockBanner({ number, count }: { number: 1 | 2; count: number }) {
  return (
    <div className="bg-[rgb(var(--c-text-strong))] text-white rounded-xl px-4 py-2.5 flex items-center justify-between shadow-sm">
      <span className="font-display text-xl tracking-widest font-bold">BLOQUE {number}</span>
      <span className="text-xs tracking-wider opacity-85">{count} {count === 1 ? 'coreografía' : 'coreografías'}</span>
    </div>
  )
}

function CeremonyBanner({ label, final }: { label: string; final?: boolean }) {
  return (
    <div className={`my-2.5 rounded-xl px-4 py-3 flex items-center justify-center gap-2 shadow-sm ${final ? 'bg-[rgb(var(--c-primary))] text-white' : 'bg-[rgb(var(--c-accent))] text-white'}`}>
      <Award className="w-5 h-5 shrink-0" />
      <span className="font-display text-base tracking-[0.2em] font-semibold">{label}</span>
      <Award className="w-5 h-5 shrink-0" />
    </div>
  )
}

function ProgItem({ idx, item }: { idx: number; item: { act: RegistrationAct; reg: EnrichedRegistration } }) {
  const { act, reg } = item
  const cat = act.age_category ? AGE_CATEGORY_LABELS[act.age_category].toUpperCase() : 'OPEN'
  const mod = MODALITY_LABELS[act.modality].toUpperCase()
  const dancers = act.modality === 'grupal' ? reg.dancers : reg.dancers.filter(d => act.dancer_ids.includes(d.id))
  const names = dancers.map(d => d.name.split(' ').slice(0, 2).join(' ')).join(', ')
  const meta = [act.level, act.style].filter(Boolean).join(' · ').toUpperCase()
  const isConfirmed = !!reg.confirmed_at
  return (
    <li className="py-3 px-2.5 flex items-start gap-3 hover:bg-white/40 transition-colors rounded-lg">
      <div className="shrink-0 text-right">
        <span className="font-display text-2.5xl text-[rgb(var(--c-primary))] font-bold tabular-nums leading-none">
          #{idx.toString().padStart(2, '0')}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-display text-xs tracking-wider text-[rgb(var(--c-text-strong))] font-bold">{mod}</span>
          <span className="text-[10px] text-[rgb(var(--c-text)/0.4)] font-bold">·</span>
          <span className="font-display text-xs tracking-wider text-[rgb(var(--c-accent))] font-bold">{cat}</span>
          {!isConfirmed && (
            <span className="text-[9px] uppercase tracking-widest bg-[rgb(var(--c-accent)/0.15)] text-[rgb(var(--c-accent-strong))] px-2 py-0.5 rounded font-bold">
              borrador
            </span>
          )}
        </div>
        <p className="text-base font-semibold truncate mt-1 text-[rgb(var(--c-text-strong))]">
          {reg.academy}{reg.team_name ? ` — ${reg.team_name}` : ''}
        </p>
        {names && <p className="text-xs text-[rgb(var(--c-text)/0.8)] truncate mt-0.5">Integrantes: {names}</p>}
        {meta && <p className="text-[10px] text-[rgb(var(--c-text)/0.55)] tracking-wider mt-1 font-semibold">{meta}</p>}
      </div>
    </li>
  )
}

function RegistrationCurve({ points }: { points: { date: string; count: number }[] }) {
  const w = 500, h = 150, pad = 12
  const max = Math.max(...points.map(p => p.count), 1)
  const xs = (i: number) => pad + (i / (points.length - 1)) * (w - pad * 2)
  const ys = (n: number) => h - pad - (n / max) * (h - pad * 2)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs(i).toFixed(1)} ${ys(p.count).toFixed(1)}`).join(' ')
  return (
    <div className="w-full select-none">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32 md:h-44" preserveAspectRatio="none">
        {/* Soft shadow area below path */}
        <path
          d={`${path} L ${xs(points.length - 1).toFixed(1)} ${h - pad} L ${xs(0).toFixed(1)} ${h - pad} Z`}
          fill="rgba(252, 3, 161, 0.05)"
        />
        <path d={path} fill="none" stroke="rgb(var(--c-primary))" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={p.date} cx={xs(i)} cy={ys(p.count)} r={4} fill="rgb(var(--c-primary))" className="cursor-pointer hover:r-6 transition-all" />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-[rgb(var(--c-text)/0.65)] font-bold mt-2 uppercase tracking-wider">
        <span>Inicios: {points[0].date}</span>
        <span>Cierre: {points[points.length - 1].date}</span>
      </div>
      <p className="text-xs text-[rgb(var(--c-text)/0.75)] mt-2 font-medium">
        Total acumulado: <strong className="text-[rgb(var(--c-primary))] text-sm font-bold">{points[points.length - 1].count}</strong> registros en este evento.
      </p>
    </div>
  )
}
