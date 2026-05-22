'use client'
import { useEffect, useState, use, useCallback } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Check, Plus, Trash2, Pencil, MessageCircle, Info, X, ChevronDown, Sparkles, Users, Clipboard, HeartHandshake, School, Clock, Calendar, Ticket } from 'lucide-react'
import { supabase, Modality, AgeCategory, Level, Event, AGE_CATEGORY_ORDER, AGE_CATEGORY_LABELS, AGE_CATEGORY_HINTS, categoryFromBirthdate } from '@/lib/supabase'

type Props = { params: Promise<{ eventId: string }> }

type Coach = {
  name: string
  phone: string
  email: string
  extras: string[]
  assistants: string[]
}

type Dancer = {
  name: string
  birthdate: string
  categoryOverride: AgeCategory | null
}

type Act = {
  modality: Modality | null
  ageCategory: AgeCategory | null
  level: Level | null
  style: string | null
  dancerIndices: number[]
}

type State = {
  coach: Coach
  hasMultipleCoaches: boolean | null
  academy: string
  city: string
  teamName: string
  teamSize: number | null
  dancers: Dancer[]
  actCount: number | null
  acts: Act[]
  costPaquete: number | null
  costRepeticion: number | null
  confirmedRegistrationId: number | null
  ticketsCount: number
}

type Step =
  | { kind: 'welcome' }
  | { kind: 'setup' }
  | { kind: 'dancers' }
  | { kind: 'acts' }
  | { kind: 'summary' }
  | { kind: 'confirmed' }

const STYLES = ['Jazz', 'Poms', 'Acro Jazz', 'Hip Hop', 'Show', 'Ballet', 'Contempo']

const CATEGORY_COLORS: Record<AgeCategory, { bg: string; border: string; text: string }> = {
  tiny: { bg: 'bg-rose-100', border: 'border-rose-300 focus-within:border-rose-500', text: 'text-rose-700' },
  mini: { bg: 'bg-orange-100', border: 'border-orange-300 focus-within:border-orange-500', text: 'text-orange-700' },
  elementary: { bg: 'bg-amber-100', border: 'border-amber-300 focus-within:border-amber-500', text: 'text-amber-700' },
  junior: { bg: 'bg-emerald-100', border: 'border-emerald-300 focus-within:border-emerald-500', text: 'text-emerald-700' },
  senior: { bg: 'bg-teal-100', border: 'border-teal-300 focus-within:border-teal-500', text: 'text-teal-700' },
  college: { bg: 'bg-indigo-100', border: 'border-indigo-300 focus-within:border-indigo-500', text: 'text-indigo-700' },
  open: { bg: 'bg-purple-100', border: 'border-purple-300 focus-within:border-purple-500', text: 'text-purple-700' },
}

const DEFAULT_DANCER_COLOR = {
  bg: 'bg-[rgb(var(--c-primary)/0.02)]',
  border: 'border-[rgb(var(--c-primary)/0.15)] focus-within:border-[rgb(var(--c-primary))]',
  text: 'text-[rgb(var(--c-primary))]'
}

const MODALITY_OPTIONS: { value: Modality; label: string }[] = [
  { value: 'solista', label: 'SOLISTA' },
  { value: 'dueto', label: 'DUETO' },
  { value: 'trio', label: 'TRÍO' },
  { value: 'grupal', label: 'GRUPAL' },
]

function minDancers(m: Modality | null): number {
  if (m === 'solista') return 1
  if (m === 'dueto') return 2
  if (m === 'trio') return 3
  if (m === 'grupal') return 4
  return 0
}

function maxDancers(m: Modality | null): number {
  if (m === 'solista') return 1
  if (m === 'dueto') return 2
  if (m === 'trio') return 3
  if (m === 'grupal') return 100
  return 0
}

function modalityLabel(m: Modality): string {
  return MODALITY_OPTIONS.find(o => o.value === m)?.label ?? m
}

function effectiveCategory(dancer: Dancer): AgeCategory | null {
  if (dancer.categoryOverride) return dancer.categoryOverride
  return categoryFromBirthdate(dancer.birthdate)
}

function ageFromBirthdate(iso: string, ref = new Date()): number | null {
  if (!iso) return null
  const b = new Date(iso)
  if (isNaN(b.getTime())) return null
  let age = ref.getFullYear() - b.getFullYear()
  if (ref.getMonth() < b.getMonth() || (ref.getMonth() === b.getMonth() && ref.getDate() < b.getDate())) age--
  return age < 0 ? null : age
}

function initialState(): State {
  return {
    coach: { name: '', phone: '', email: '', extras: [], assistants: [] },
    hasMultipleCoaches: null,
    academy: '',
    city: '',
    teamName: '',
    teamSize: 0,
    dancers: [],
    actCount: 0,
    acts: [],
    costPaquete: PRECIO_PARTICIPACION,
    costRepeticion: PRECIO_REPETICION,
    confirmedRegistrationId: null,
    ticketsCount: 0,
  }
}

function participacionesPorAlumno(state: State): Map<number, number> {
  const counts = new Map<number, number>()
  state.acts.forEach(a => {
    if (!a.modality) return
    if (a.modality === 'grupal') {
      state.dancers.forEach((_, di) => {
        counts.set(di, (counts.get(di) ?? 0) + 1)
      })
    } else {
      a.dancerIndices.forEach(di => {
        counts.set(di, (counts.get(di) ?? 0) + 1)
      })
    }
  })
  return counts
}

const PRECIO_PARTICIPACION = 1700
const PRECIO_REPETICION = 300
const PRECIO_ASISTENTE = 1000
const PRECIO_ENTRADA = 400
const DANCERS_POR_ENTRADA_GRATIS = 8

function costoTotal(state: State): number {
  const counts = participacionesPorAlumno(state)
  let total = 0
  counts.forEach(n => {
    if (n >= 1) total += PRECIO_PARTICIPACION
    if (n > 1) total += (n - 1) * PRECIO_REPETICION
  })
  const filledDancers = state.dancers.filter(d => d.name.trim().length > 0)
  const freeEntries = Math.floor(filledDancers.length / DANCERS_POR_ENTRADA_GRATIS)
  const assistants = state.coach.assistants.filter(a => a.trim()).length
  const paidAssistants = Math.max(0, assistants - freeEntries)
  total += paidAssistants * PRECIO_ASISTENTE
  total += (state.ticketsCount ?? 0) * PRECIO_ENTRADA
  return total
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)
}

function formatEventDate(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return iso }
}

function getRegistrationDeadline(eventDateIso: string): string {
  try {
    const d = new Date(eventDateIso + 'T00:00:00')
    d.setDate(d.getDate() - 15)
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return '15 días antes del evento'
  }
}

function getChangesDeadline(eventDateIso: string): string {
  try {
    const d = new Date(eventDateIso + 'T00:00:00')
    d.setDate(d.getDate() - 7)
    return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return '7 días antes del evento'
  }
}

function formatBirthdate(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function getDancerDisplayName(dancer: Dancer, index: number, allDancers: Dancer[]): string {
  const name = dancer.name.trim()
  if (!name) return 'SIN NOMBRE'
  return name.toUpperCase()
}


function parseSmartList(text: string): Dancer[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const result: Dancer[] = []
  
  // Match DD/MM/YYYY or DD-MM-YYYY
  const regexDMY = /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/
  // Match YYYY/MM/DD or YYYY-MM-DD
  const regexYMD = /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/

  lines.forEach(line => {
    let birthdate = ''
    let name = line

    let match = line.match(regexDMY)
    if (match) {
      const d = match[1].padStart(2, '0')
      const m = match[2].padStart(2, '0')
      const y = match[3]
      birthdate = `${y}-${m}-${d}`
      name = line.replace(match[0], '')
    } else {
      match = line.match(regexYMD)
      if (match) {
        const y = match[1]
        const m = match[2].padStart(2, '0')
        const d = match[3].padStart(2, '0')
        birthdate = `${y}-${m}-${d}`
        name = line.replace(match[0], '')
      }
    }

    // Clean up name
    name = name.replace(/^[\s,.\-–—]+|[\s,.\-–—]+$/g, '').replace(/\s+/g, ' ').trim()
    
    // Capitalize words
    name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')

    if (name.length >= 2) {
      result.push({
        name,
        birthdate: birthdate || '',
        categoryOverride: null
      })
    }
  })

  return result
}

const LS_KEY = (eventId: string) => `d4e:register:${eventId}`

export default function RegisterPage({ params }: Props) {
  const { eventId } = use(params)
  const search = useSearchParams()
  const token = search.get('t') ?? ''

  const [event, setEvent] = useState<Event | null>(null)
  const [authState, setAuthState] = useState<'loading' | 'ok' | 'invalid'>('loading')
  const [state, setState] = useState<State>(initialState)
  const [step, setStep] = useState<Step>({ kind: 'welcome' })
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [isLargeScreen, setIsLargeScreen] = useState<boolean | null>(null)
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [showSuccessSplash, setShowSuccessSplash] = useState(false)


  // Acts confirmation flow
  const [activeActIndex, setActiveActIndex] = useState<number | null>(0)
  const [actsConfirmed, setActsConfirmed] = useState(false)

  // Smart Paste Modal State
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')

  useEffect(() => {
    try {
      const metaTheme = document.querySelector('meta[name="theme-color"]')
      if (showSuccessSplash) {
        if (metaTheme) metaTheme.setAttribute('content', '#16A34A')
        document.body.style.setProperty('background-color', '#16A34A', 'important')
        document.documentElement.style.setProperty('background-color', '#16A34A', 'important')
      } else {
        if (metaTheme) metaTheme.setAttribute('content', '#F6F4EF')
        document.body.style.setProperty('background-color', 'rgb(var(--c-surface))', 'important')
        document.documentElement.style.setProperty('background-color', 'rgb(var(--c-surface))', 'important')
      }
    } catch { /* ignore document reference errors on SSR */ }
  }, [showSuccessSplash])

  useEffect(() => {
    const check = () => {
      const okSize = window.innerWidth >= 1024 && window.innerHeight >= 700
      const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches
      setIsLargeScreen(okSize && !isCoarsePointer)
    }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('events').select('*').eq('id', eventId).single()
      if (cancelled) return
      if (!data) { setAuthState('invalid'); return }
      if (!data.registration_token || data.registration_token !== token) {
        setAuthState('invalid')
        return
      }
      setEvent(data as Event)
      setAuthState('ok')
      try {
        const raw = localStorage.getItem(LS_KEY(eventId))
        if (raw) {
          const saved = JSON.parse(raw) as State
          // Handle migration of old coach data structure
          if (saved.coach && !saved.coach.assistants) {
            saved.coach.assistants = []
          }
          if (saved.costPaquete === null) {
            saved.costPaquete = PRECIO_PARTICIPACION
          }
          if (saved.costRepeticion === null) {
            saved.costRepeticion = PRECIO_REPETICION
          }
          // Parse city from academy name if it contains "(city)" and city is not set
          if (saved.city === undefined || saved.city === null) {
            saved.city = ''
            const match = saved.academy.match(/^(.*?)\s*\(([^)]+)\)$/)
            if (match) {
              saved.academy = match[1]
              saved.city = match[2]
            }
          }
          if (saved.ticketsCount === undefined || saved.ticketsCount === null) {
            saved.ticketsCount = 0
          }
          setState(saved)
          if (saved.confirmedRegistrationId) setStep({ kind: 'confirmed' })
        }
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [eventId, token])

  useEffect(() => {
    if (authState !== 'ok') return
    try { localStorage.setItem(LS_KEY(eventId), JSON.stringify(state)) } catch { /* ignore */ }
  }, [state, eventId, authState])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    if (step.kind !== 'welcome') return

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault()
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault()
      }
    }

    let lastTouchEnd = 0
    const handleTouchEnd = (e: TouchEvent) => {
      const now = Date.now()
      if (now - lastTouchEnd <= 300) {
        e.preventDefault()
      }
      lastTouchEnd = now
    }

    const handleGestureStart = (e: any) => {
      e.preventDefault()
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: false })
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd, { passive: false })
    document.addEventListener('gesturestart', handleGestureStart, { passive: false })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
      document.removeEventListener('gesturestart', handleGestureStart)
    }
  }, [step.kind])

  useEffect(() => {
    try {
      let metaStatus = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
      if (!metaStatus) {
        metaStatus = document.createElement('meta')
        metaStatus.setAttribute('name', 'apple-mobile-web-app-status-bar-style')
        document.head.appendChild(metaStatus)
      }
      metaStatus.setAttribute('content', 'default')

      let metaTheme = document.querySelector('meta[name="theme-color"]')
      if (!metaTheme) {
        metaTheme = document.createElement('meta')
        metaTheme.setAttribute('name', 'theme-color')
        document.head.appendChild(metaTheme)
      }
      metaTheme.setAttribute('content', '#F6F4EF')

      let metaCapable = document.querySelector('meta[name="apple-mobile-web-app-capable"]')
      if (!metaCapable) {
        metaCapable = document.createElement('meta')
        metaCapable.setAttribute('name', 'apple-mobile-web-app-capable')
        document.head.appendChild(metaCapable)
      }
      metaCapable.setAttribute('content', 'yes')
    } catch { /* ignore document reference errors on SSR */ }

    let initialHeight = typeof window !== 'undefined' ? window.innerHeight : 800
    const vv = typeof window !== 'undefined' ? window.visualViewport : null

    const checkKeyboard = () => {
      if (typeof document === 'undefined') return false
      const activeEl = document.activeElement
      if (activeEl) {
        const tagName = activeEl.tagName.toLowerCase()
        const type = (activeEl as HTMLInputElement).type?.toLowerCase()
        const isTextInput =
          tagName === 'textarea' ||
          (tagName === 'input' &&
            [
              'text',
              'number',
              'email',
              'tel',
              'url',
              'search',
              'password',
              'date',
              'datetime-local',
              'month',
              'week',
              'time'
            ].includes(type))
        if (isTextInput) {
          return true
        }
      }
      if (typeof window !== 'undefined') {
        if (window.innerHeight > initialHeight) initialHeight = window.innerHeight
        if (vv) {
          return vv.height < window.screen.height * 0.75 || vv.height < initialHeight * 0.85
        }
      }
      return false
    }

    const updateHeight = () => {
      if (vv && typeof window !== 'undefined' && !checkKeyboard()) {
        document.documentElement.style.setProperty('--viewport-height', `${vv.height}px`)
      }
      const keyboardActive = checkKeyboard()
      setIsKeyboardOpen(keyboardActive)
    }

    const handleWindowScroll = () => {
      if (typeof window !== 'undefined' && window.scrollY !== 0 && document.activeElement?.closest('main') === null) {
        window.scrollTo(0, 0)
      }
    }

    const handleFocusIn = (e: any) => {
      updateHeight()
      const target = e.target as HTMLElement
      if (target) {
        setTimeout(() => {
          const scrollContainer = document.querySelector('main')
          if (scrollContainer && window.visualViewport) {
            const targetRect = target.getBoundingClientRect()
            const visibleHeight = window.visualViewport.height
            const margin = 16
            const offset = targetRect.bottom - visibleHeight + margin
            scrollContainer.scrollBy({ top: offset, behavior: 'smooth' })
          }
        }, 300)
      }
    }

    const handleFocusOut = () => {
      updateHeight()
    }

    if (vv) {
      vv.addEventListener('resize', updateHeight)
      vv.addEventListener('scroll', updateHeight)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', handleWindowScroll, { passive: false })
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('focusin', handleFocusIn)
      document.addEventListener('focusout', handleFocusOut)
    }

    updateHeight()

    return () => {
      if (vv) {
        vv.removeEventListener('resize', updateHeight)
        vv.removeEventListener('scroll', updateHeight)
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('scroll', handleWindowScroll)
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('focusin', handleFocusIn)
        document.removeEventListener('focusout', handleFocusOut)
      }
    }
  }, [])

  const goNext = useCallback(() => {
    setStep(s => {
      switch (s.kind) {
        case 'welcome': return { kind: 'setup' }
        case 'setup': return { kind: 'dancers' }
        case 'dancers': return { kind: 'acts' }
        case 'acts': return { kind: 'summary' }
        case 'summary': return { kind: 'confirmed' }
        default: return s
      }
    })
  }, [])

  const goBack = useCallback(() => {
    setStep(s => {
      switch (s.kind) {
        case 'setup': return { kind: 'welcome' }
        case 'dancers': return { kind: 'setup' }
        case 'acts': return { kind: 'dancers' }
        case 'summary': return { kind: 'acts' }
        default: return s
      }
    })
  }, [])

  function updateCoach(patch: Partial<Coach>) {
    setState(s => ({ ...s, coach: { ...s.coach, ...patch } }))
  }

  function updateDancer(i: number, patch: Partial<Dancer>) {
    setActsConfirmed(false)
    setState(s => {
      const dancers = [...s.dancers]
      dancers[i] = { ...dancers[i], ...patch }
      return { ...s, dancers, teamSize: dancers.length }
    })
  }

  function addDancer() {
    setActsConfirmed(false)
    setState(s => {
      const dancers = [{ name: '', birthdate: '', categoryOverride: null }, ...s.dancers]
      const acts = s.acts.map(a => ({
        ...a,
        dancerIndices: a.dancerIndices.map(idx => idx + 1)
      }))
      return { ...s, dancers, acts, teamSize: dancers.length }
    })
  }

  function removeDancer(i: number) {
    setActsConfirmed(false)
    setState(s => {
      const dancers = s.dancers.filter((_, idx) => idx !== i)
      // Update acts that referenced this dancer or shifts indices
      const acts = s.acts.map(a => ({
        ...a,
        dancerIndices: a.dancerIndices
          .filter(idx => idx !== i)
          .map(idx => idx > i ? idx - 1 : idx)
      }))
      return { ...s, dancers, acts, teamSize: dancers.length }
    })
  }

  function handleSmartPaste(text: string) {
    setActsConfirmed(false)
    const parsed = parseSmartList(text)
    if (parsed.length === 0) return
    setState(s => {
      const dancers = [...s.dancers, ...parsed]
      return { ...s, dancers, teamSize: dancers.length }
    })
    setIsPasteModalOpen(false)
    setPasteText('')
  }

  async function handleClipboardPaste() {
    try {
      const text = await navigator.clipboard.readText()
      if (text && text.trim()) {
        handleSmartPaste(text)
      } else {
        alert("El portapapeles está vacío o no contiene texto legible.")
      }
    } catch (err) {
      console.error("Error al leer el portapapeles:", err)
      alert("No se pudo acceder al portapapeles de forma automática. Por favor, concede los permisos correspondientes o copia y pega el contenido manualmente en el cuadro de texto.")
    }
  }

  function updateAct(i: number, patch: Partial<Act>) {
    setActsConfirmed(false)
    setState(s => {
      const acts = [...s.acts]
      acts[i] = { ...acts[i], ...patch }
      return { ...s, acts }
    })
  }

  function addAct() {
    setActsConfirmed(false)
    setState(s => {
      const acts = [...s.acts, { modality: null, ageCategory: null, level: null, style: null, dancerIndices: [] }]
      return { ...s, acts, actCount: acts.length }
    })
  }

  function removeAct(i: number) {
    setActsConfirmed(false)
    setState(s => {
      const acts = s.acts.filter((_, idx) => idx !== i)
      return { ...s, acts, actCount: acts.length }
    })
  }

  async function confirm() {
    if (!event) return
    setSaving(true)
    setSaveErr(null)
    try {
      const isUpdate = state.confirmedRegistrationId != null
      let registrationId: number

      // Merge assistants into extra_coaches with Asistente prefix
      const extrasMerged = [
        ...state.coach.extras.map(e => e.trim()).filter(Boolean),
        ...state.coach.assistants.map(a => `Asistente: ${a.trim()}`).filter(a => a !== 'Asistente:'),
        ...(state.ticketsCount ? [`Entradas: ${state.ticketsCount}`] : [])
      ]

      const regPayload = {
        event_id: event.id,
        coach_name: state.coach.name.trim(),
        coach_phone: state.coach.phone.trim(),
        coach_email: state.coach.email.trim() || null,
        extra_coaches: extrasMerged,
        academy: state.city.trim() ? `${state.academy.trim()} (${state.city.trim()})` : state.academy.trim(),
        team_name: state.teamName.trim() || state.academy.trim(),
        cost_paquete: state.costPaquete,
        cost_repeticion: state.costRepeticion,
        confirmed_at: new Date().toISOString(),
      }

      if (isUpdate) {
        registrationId = state.confirmedRegistrationId!
        const { error: updErr } = await supabase
          .from('coach_registrations')
          .update(regPayload)
          .eq('id', registrationId)
        if (updErr) throw updErr
        await supabase.from('registration_acts').delete().eq('registration_id', registrationId)
        await supabase.from('registration_dancers').delete().eq('registration_id', registrationId)
      } else {
        const { data: regData, error: regErr } = await supabase
          .from('coach_registrations')
          .insert(regPayload)
          .select()
          .single()
        if (regErr || !regData) throw regErr ?? new Error('No data')
        registrationId = regData.id as number
      }

      const dancerRows = state.dancers.map((d, i) => ({
        registration_id: registrationId,
        name: d.name.trim(),
        birthdate: d.birthdate,
        category: effectiveCategory(d),
        category_manual: d.categoryOverride !== null,
        order_idx: i,
      }))
      const { data: dData, error: dErr } = await supabase
        .from('registration_dancers')
        .insert(dancerRows)
        .select()
      if (dErr || !dData) throw dErr ?? new Error('No dancers data')

      const dancerIdByIndex = new Map<number, number>()
      dData.forEach((row: { id: number, order_idx: number }) => {
        dancerIdByIndex.set(row.order_idx, row.id)
      })

      const actRows = state.acts.map((a, i) => ({
        registration_id: registrationId,
        modality: a.modality,
        age_category: a.ageCategory,
        level: a.modality === 'grupal' ? a.level : 'avanzado',
        style: a.style,
        order_idx: i,
        dancer_ids: a.dancerIndices
          .map(idx => dancerIdByIndex.get(idx))
          .filter((x): x is number => typeof x === 'number'),
      }))
      const { error: aErr } = await supabase.from('registration_acts').insert(actRows)
      if (aErr) throw aErr

      setState(s => ({ ...s, confirmedRegistrationId: registrationId }))
      setEditMode(false)
      setShowSuccessSplash(true)
      setStep({ kind: 'confirmed' })
      setTimeout(() => {
        setShowSuccessSplash(false)
      }, 3500)
    } catch (e) {
      setSaveErr(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  function startEdit() {
    setEditMode(true)
    setStep({ kind: 'setup' })
  }

  if (authState === 'loading') {
    return (
      <Centered>
        <p className="font-display text-3xl tracking-widest text-[rgb(var(--c-primary))] animate-pulse">CARGANDO…</p>
      </Centered>
    )
  }
  if (authState === 'invalid') {
    return (
      <Centered>
        <p className="font-display text-4xl tracking-widest text-[rgb(var(--c-primary))]">LINK INVÁLIDO</p>
        <p className="text-[rgb(var(--c-text))] text-center text-lg mt-2">Verifica el enlace o ponte en contacto con los organizadores.</p>
      </Centered>
    )
  }

  const isFirstStep = step.kind === 'welcome'
  const isMobile = isLargeScreen === false

  return (
    <div
      className="bg-[rgb(var(--c-surface))] text-[rgb(var(--c-text-strong))] flex flex-col overflow-hidden font-sans select-none w-full"
      data-step={step.kind}
      style={{ height: 'var(--viewport-height, 100dvh)', transition: 'height 0.25s ease' }}
    >
      {showSuccessSplash && (
        <div className="fixed inset-0 z-[9999] bg-[rgb(var(--c-success))] text-white flex flex-col items-center justify-center p-6" style={{ animation: 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
          <div className="text-center space-y-6 max-w-md mx-auto">
            <div className="flex justify-center">
              <div className="bg-white/10 p-6 rounded-full ring-8 ring-white/5 animate-bounce">
                <Check className="w-20 h-20 text-[rgb(var(--c-surface))]" strokeWidth={3} />
              </div>
            </div>
            <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-wider leading-tight text-[rgb(var(--c-surface))]">
              ¡REGISTRO EXITOSO!
            </h1>
            <p className="text-lg lg:text-xl text-[rgb(var(--c-surface)/0.9)] leading-relaxed font-medium">
              Registraste con éxito tu academia/equipo.
            </p>
          </div>
        </div>
      )}

      {/* Inyección dinámica para pintar el fondo de Safari en iOS y bloquear por completo cualquier desplazamiento de la página principal */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        html, body {
          background-color: #000 !important;
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          overscroll-behavior: none;
        }
        /* Ocultar bottom nav al enfocar inputs, excepto en el paso de integrantes */
        body:has(input:focus, textarea:focus, select:focus) [data-step]:not([data-step="dancers"]) .mobile-bottom-nav {
          visibility: hidden;
        }
      ` }} />
      <meta name="theme-color" content="#F6F4EF" />

      <main
        className={`flex-1 min-h-0 flex flex-col overflow-y-auto lg:overflow-hidden ${step.kind === 'welcome' ? 'px-0' : 'px-0 sm:px-4 lg:px-8'}`}
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: '0px'
        }}
      >
        {/* DESKTOP HEADER */}
        {!isFirstStep && (
          <div className="shrink-0 hidden lg:flex items-center gap-6 pb-4 border-b border-[rgb(var(--c-border)/0.3)]">
            <div className="shrink-0 flex items-baseline gap-5">
              <p className="font-display text-3xl lg:text-4xl tracking-[0.3em] text-[rgb(var(--c-primary))] leading-none">REGISTRO PARA</p>
              <h1 className="font-display text-3xl lg:text-4xl uppercase text-[rgb(var(--c-text-strong))] truncate leading-none">{event?.name || 'EVENTO'}</h1>
              {event?.date && <p className="font-display text-3xl lg:text-4xl uppercase text-[rgb(var(--c-text))] leading-none">{formatEventDate(event.date)}</p>}
            </div>
            <div className="flex-1" />
            {editMode && (
              <div className="bg-[rgb(var(--c-primary)/0.1)] border border-[rgb(var(--c-primary)/0.3)] text-[rgb(var(--c-primary))] px-3 py-1.5 rounded-xl font-display text-xs tracking-widest self-center">
                MODO EDICIÓN
              </div>
            )}
            <Image src="/logo.png" alt="Dance4ever" width={100} height={75} priority className="shrink-0 mix-blend-multiply" />
          </div>
        )}

        {/* STEP STATUS INDICATOR (iOS Tab Style - Rediseñado Premium) */}
        {(!isKeyboardOpen || step.kind === 'dancers') && !isFirstStep && step.kind !== 'confirmed' && (
          <div className="step-status-indicator shrink-0 flex justify-center pt-0.5 pb-2 sm:py-3 px-4 sm:px-0 relative z-[99999]">
            <div className="bg-purple-50/70 p-1 rounded-2xl flex gap-1 w-full max-w-xl shadow-inner border border-purple-200/40">
              {[
                { label: 'COACH', kind: 'setup' },
                { label: 'INTEGRANTES', kind: 'dancers' },
                { label: 'ACTOS', kind: 'acts' },
                { label: 'CONFIRMAR', kind: 'summary' }
              ].map((tab, idx) => {
                const isCurrent = step.kind === tab.kind
                return (
                  <button
                    key={tab.kind}
                    disabled={true} // Read-only progress bar
                    className={`flex-1 py-2 text-center font-display tracking-widest text-xs sm:text-sm rounded-xl transition-all duration-300 font-bold ${
                      isCurrent
                        ? 'bg-gradient-to-r from-purple-600 via-[rgb(var(--c-primary))] to-pink-500 text-white shadow-md scale-105'
                        : 'text-purple-400/80 hover:text-purple-600'
                    }`}
                  >
                    {idx + 1}. {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0 flex justify-center">
          <div className={`w-full ${step.kind === 'welcome' ? '' : step.kind === 'summary' || step.kind === 'confirmed' || step.kind === 'dancers' ? 'max-w-6xl' : 'max-w-3xl'} min-h-full lg:h-full flex flex-col justify-start lg:justify-center ${step.kind === 'welcome' ? '' : isKeyboardOpen ? 'pt-[1vh] lg:pt-3' : 'pt-0 sm:pt-2 lg:pt-0'} min-h-0`}>
            <StepView
              step={step}
              state={state}
              event={event}
              isKeyboardOpen={isKeyboardOpen}
              editMode={editMode}
              isMobile={isMobile}
              onNext={goNext}
              onBack={goBack}
              goToStep={setStep}
              updateCoach={updateCoach}
              updateState={setState}
              updateDancer={updateDancer}
              addDancer={addDancer}
              removeDancer={removeDancer}
              onOpenSmartPaste={() => setIsPasteModalOpen(true)}
              updateAct={updateAct}
              addAct={addAct}
              removeAct={removeAct}
              confirm={confirm}
              saving={saving}
              saveErr={saveErr}
              startEdit={startEdit}
              actsConfirmed={actsConfirmed}
              setActsConfirmed={setActsConfirmed}
              activeActIndex={activeActIndex}
              setActiveActIndex={setActiveActIndex}
            />
          </div>
        </div>
      </main>

      {/* MOBILE BOTTOM NAV BAR (iOS native feel) */}
      {(!isKeyboardOpen || step.kind === 'dancers') && !isFirstStep && step.kind !== 'confirmed' && (
        <div
          className="mobile-bottom-nav shrink-0 lg:hidden bg-[rgb(var(--c-surface)/0.96)] backdrop-blur flex items-center justify-between px-5 py-3 z-40 border-t border-[rgb(var(--c-border)/0.4)]"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
        >
          <button
            onClick={goBack}
            className="flex items-center gap-1.5 text-[rgb(var(--c-primary))] font-display font-bold text-sm bg-[rgb(var(--c-surface-2))] border border-[rgb(var(--c-border)/0.4)] px-4 py-2.5 rounded-2xl active:scale-95 active:bg-[rgb(var(--c-surface-3))] transition-all duration-150"
          >
            <ArrowLeft className="w-4 h-4" />
            ATRÁS
          </button>

          {/* Dynamic indicators in the bar */}
          <div className="text-center">
            {step.kind === 'dancers' && (() => {
              const count = state.dancers.filter(d => d.name.trim().length >= 2 && d.birthdate.length === 10).length
              return (
                <span className="text-xs font-display text-[rgb(var(--c-success))] font-bold bg-[rgb(var(--c-success)/0.1)] border border-[rgb(var(--c-success)/0.2)] px-3 py-1 rounded-full">
                  {count} {count === 1 ? 'Integrante' : 'Integrantes'}
                </span>
              )
            })()}
            {step.kind === 'acts' && (
              <span className="text-xs font-display text-[rgb(var(--c-primary))] font-bold bg-[rgb(var(--c-primary)/0.1)] border border-[rgb(var(--c-primary)/0.2)] px-3 py-1 rounded-full">
                {state.acts.length} {state.acts.length === 1 ? 'Acto' : 'Actos'}
              </span>
            )}
            {step.kind === 'summary' && (
              <span className="text-xs font-display text-[rgb(var(--c-primary))] font-bold bg-[rgb(var(--c-primary)/0.1)] border border-[rgb(var(--c-primary)/0.2)] px-3 py-1 rounded-full">
                {state.dancers.length} Alum. / {state.acts.length} {state.acts.length === 1 ? 'Acto' : 'Actos'}
              </span>
            )}
          </div>

          {step.kind !== 'summary' ? (
            step.kind === 'acts' && !actsConfirmed ? (
              <button
                onClick={() => {
                  setActiveActIndex(null)
                  setActsConfirmed(true)
                }}
                disabled={
                  state.acts.length === 0 || state.acts.some(a => !a.modality || !a.style || a.dancerIndices.length === 0)
                }
                className="flex items-center gap-1 text-white bg-[rgb(var(--c-primary))] hover:bg-[rgb(var(--c-primary-strong))] font-display font-bold text-sm px-5 py-2.5 rounded-2xl disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all duration-150 shadow-md"
              >
                CONFIRMAR ACTOS
              </button>
            ) : (
              <button
                onClick={goNext}
                disabled={
                  step.kind === 'setup' && (state.coach.name.trim().length < 2 || state.coach.phone.trim().length < 8 || state.coach.email.trim().length < 5 || !state.coach.email.includes('@') || !state.coach.email.includes('.') || state.academy.trim().length < 2 || !state.city || state.city.trim().length < 2)
                  || step.kind === 'dancers' && (state.dancers.length === 0 || state.dancers.some(d => d.name.trim().length < 2 || d.birthdate.length !== 10))
                  || step.kind === 'acts' && (state.acts.length === 0 || state.acts.some(a => !a.modality || !a.style || a.dancerIndices.length === 0))
                }
                className="flex items-center gap-1 text-[rgb(var(--c-text-strong))] bg-gradient-to-r from-[#16A34A] via-[#82f606] to-[#fff200] hover:brightness-105 font-display font-bold text-sm px-4 py-2.5 rounded-2xl disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all duration-150 shadow-md"
              >
                {step.kind === 'acts' ? 'SIGUIENTE: RESUMEN' : 'SIGUIENTE'}
              </button>
            )
          ) : (
            <button
              onClick={confirm}
              disabled={saving}
              className="flex items-center gap-1 text-white bg-[rgb(var(--c-primary))] hover:bg-[rgb(var(--c-primary-strong))] font-display font-bold text-sm px-5 py-2.5 rounded-2xl disabled:opacity-50 active:scale-95 transition-all duration-150 shadow-md"
            >
              {saving ? 'GUARDANDO…' : 'CONFIRMAR'}
            </button>
          )}
        </div>
      )}

      {/* SMART PASTE MODAL */}
      {isPasteModalOpen && (
        <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" style={{ animation: 'fadeIn 0.2s ease-out forwards' }}>
          <div className="bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border))] rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[rgb(var(--c-primary))]" />
                <h3 className="font-display text-xl text-[rgb(var(--c-text-strong))] font-semibold">PEGADO INTELIGENTE</h3>
              </div>
              <button onClick={() => setIsPasteModalOpen(false)} className="text-[rgb(var(--c-text)/0.6)] active:scale-95 p-1 rounded-full hover:bg-[rgb(var(--c-surface-2))]">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <p className="text-xs text-[rgb(var(--c-text))] leading-relaxed">
              Copia y pega la lista de integrantes desde WhatsApp o Excel. Detectamos nombres y fechas de nacimiento automáticamente.
            </p>
            <div className="bg-[rgb(var(--c-surface-2)/0.4)] border border-[rgb(var(--c-border)/0.4)] rounded-xl p-3 text-[10px] text-[rgb(var(--c-text)/0.85)] font-mono space-y-1">
              <p className="font-bold text-[rgb(var(--c-primary))]">FORMATOS ADMITIDOS:</p>
              <p>• Juan Pérez, 15/04/2012</p>
              <p>• Sofía Gómez 22-10-2015</p>
              <p>• 2010/05/18 Alejandro Ruiz</p>
            </div>

            {/* DIRECT PASTE BUTTON FROM CLIPBOARD */}
            <button
              type="button"
              onClick={handleClipboardPaste}
              className="w-full inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-[#16A34A] via-[#82f606] to-[#fff200] text-[rgb(var(--c-text-strong))] py-3.5 px-4 rounded-2xl font-display text-base tracking-wider font-bold shadow-md hover:brightness-105 active:scale-95 transition-all duration-150 shrink-0"
            >
              <Clipboard className="w-5 h-5 text-[rgb(var(--c-text-strong))]" strokeWidth={2.5} /> PEGAR DESDE EL PORTAPAPELES
            </button>

            <div className="relative shrink-0 hidden md:flex items-center justify-center py-1">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[rgb(var(--c-border)/0.4)]" /></div>
              <span className="relative bg-[rgb(var(--c-surface))] px-3 text-[10px] text-[rgb(var(--c-text)/0.5)] font-semibold uppercase tracking-wider">o pega manualmente abajo</span>
            </div>

            <div className="flex-1 min-h-0 hidden md:flex flex-col">
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Pega la lista aquí..."
                className="w-full flex-1 min-h-[150px] bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border))] rounded-2xl p-4 text-sm font-sans outline-none focus:ring-1 focus:ring-[rgb(var(--c-primary))] focus:border-[rgb(var(--c-primary))] resize-none shadow-inner"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 shrink-0 pt-2">
              <button
                type="button"
                onClick={() => setIsPasteModalOpen(false)}
                className="py-3 bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border))] text-[rgb(var(--c-text-strong))] font-display text-base tracking-widest rounded-2xl active:scale-95 duration-150 transition-all font-semibold"
              >
                <span className="md:hidden">CERRAR</span>
                <span className="hidden md:inline">CANCELAR</span>
              </button>
              <button
                type="button"
                onClick={() => handleSmartPaste(pasteText)}
                disabled={pasteText.trim().length === 0}
                className="py-3 bg-gradient-to-r from-[#16A34A] via-[#82f606] to-[#fff200] text-[rgb(var(--c-text-strong))] font-display text-base tracking-widest rounded-2xl active:scale-95 duration-150 transition-all disabled:opacity-40 font-bold hidden md:block"
              >
                ANALIZAR Y CARGAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StepView(props: {
  step: Step
  state: State
  event: Event | null
  isKeyboardOpen: boolean
  editMode: boolean
  isMobile: boolean
  onNext: () => void
  onBack: () => void
  goToStep: (s: Step) => void
  updateCoach: (p: Partial<Coach>) => void
  updateState: React.Dispatch<React.SetStateAction<State>>
  updateDancer: (i: number, p: Partial<Dancer>) => void
  addDancer: () => void
  removeDancer: (i: number) => void
  onOpenSmartPaste: () => void
  updateAct: (i: number, p: Partial<Act>) => void
  addAct: () => void
  removeAct: (i: number) => void
  confirm: () => Promise<void>
  saving: boolean
  saveErr: string | null
  startEdit: () => void
  actsConfirmed: boolean
  setActsConfirmed: (b: boolean) => void
  activeActIndex: number | null
  setActiveActIndex: (i: number | null) => void
}) {
  const { step, state, event, editMode, onNext, goToStep, updateCoach, updateState, updateDancer, addDancer, removeDancer, onOpenSmartPaste, updateAct, addAct, removeAct, confirm, saving, saveErr, startEdit, actsConfirmed, setActsConfirmed, activeActIndex, setActiveActIndex } = props
  const [datePickerIndex, setDatePickerIndex] = useState<number | null>(null)
  const [datePickerVal, setDatePickerVal] = useState({ day: '', month: '', year: '' })
  const [datePickerClosing, setDatePickerClosing] = useState(false)
  const closeDatePicker = () => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#F6F4EF')
    setDatePickerClosing(true)
    setTimeout(() => { setDatePickerIndex(null); setDatePickerClosing(false) }, 180)
  }

  switch (step.kind) {
    case 'welcome': {
      return (
        <div className="relative flex flex-col items-center justify-center h-[100dvh] w-full overflow-hidden select-none px-4 py-6 md:p-12" style={{ background: 'radial-gradient(circle at 50% 35%, #180033 0%, #080014 70%, #020005 100%)', touchAction: 'none', animation: 'fadeIn 0.4s ease-out' }}>
          <style>{`
            @keyframes riseUp {
              0% { opacity: 0; transform: translateY(30px); }
              100% { opacity: 1; transform: translateY(0); }
            }
            @keyframes swayLeft {
              0%, 100% { transform: rotate(0deg) scale(1); }
              50% { transform: rotate(3deg) scale(1.02); }
            }
            @keyframes swayRight {
              0%, 100% { transform: rotate(0deg) scale(1); }
              50% { transform: rotate(-3deg) scale(1.02); }
            }
            @keyframes pulseGlow {
              0%, 100% { opacity: 0.45; filter: drop-shadow(0 0 20px rgba(0, 234, 255, 0.4)); }
              50% { opacity: 0.7; filter: drop-shadow(0 0 35px rgba(252, 3, 161, 0.6)); }
            }
            @keyframes sweep {
              0% { left: -100%; }
              50% { left: 160%; }
              100% { left: 160%; }
            }
          `}</style>

          {/* Lush, organic palm trees emerging directly from the very bottom edge with high-fidelity contained leaf vectors */}
          <div 
            className="absolute left-0 bottom-0 z-0 pointer-events-none select-none origin-bottom-left" 
            style={{ 
              animation: 'swayLeft 10s ease-in-out infinite', 
              width: 'min(50vw, 35vh, 280px)', 
              height: 'min(85vw, 60vh, 450px)',
              bottom: '-5px',
            }}
          >
            <svg viewBox="0 0 280 400" className="w-full h-full" fill="none">
              <defs>
                <linearGradient id="palm-left-trunk" x1="50%" y1="100%" x2="50%" y2="0%">
                  <stop offset="0%" stopColor="#080014" stopOpacity="1" />
                  <stop offset="40%" stopColor="#050824" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#00bbf9" stopOpacity="1" />
                </linearGradient>
                <linearGradient id="palm-left-leaves" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#00bbf9" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#00f5d4" stopOpacity="1" />
                </linearGradient>
              </defs>
              {/* Trunk */}
              <path d="M 0,400 Q 60,300 100,120 Q 112,120 70,400 Z" fill="url(#palm-left-trunk)" />
              {/* Contained Leaves */}
              <path d="M 100,120 C 60,80 10,100 0,130 C 20,110 70,110 100,120 Z" fill="url(#palm-left-leaves)" />
              <path d="M 100,120 C 50,110 0,160 -10,210 C 20,170 70,140 100,120 Z" fill="url(#palm-left-leaves)" />
              <path d="M 100,120 C 60,170 30,230 10,280 C 40,230 80,180 100,120 Z" fill="url(#palm-left-leaves)" />
              <path d="M 100,120 C 110,60 140,40 160,20 C 140,50 120,80 100,120 Z" fill="url(#palm-left-leaves)" />
              <path d="M 100,120 C 140,80 190,100 210,130 C 180,110 130,110 100,120 Z" fill="url(#palm-left-leaves)" />
              <path d="M 100,120 C 150,120 200,160 210,210 C 180,170 130,140 100,120 Z" fill="url(#palm-left-leaves)" />
              <path d="M 100,120 C 130,170 150,220 160,270 C 140,210 120,170 100,120 Z" fill="url(#palm-left-leaves)" />
            </svg>
          </div>

          <div 
            className="absolute right-0 bottom-0 z-0 pointer-events-none select-none origin-bottom-right" 
            style={{ 
              animation: 'swayRight 12s ease-in-out infinite', 
              width: 'min(50vw, 35vh, 280px)', 
              height: 'min(85vw, 60vh, 450px)',
              bottom: '-5px',
            }}
          >
            <svg viewBox="0 0 280 400" className="w-full h-full" fill="none">
              <defs>
                <linearGradient id="palm-right-trunk" x1="50%" y1="100%" x2="50%" y2="0%">
                  <stop offset="0%" stopColor="#080014" stopOpacity="1" />
                  <stop offset="40%" stopColor="#1a0024" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#ff007f" stopOpacity="1" />
                </linearGradient>
                <linearGradient id="palm-right-leaves" x1="100%" y1="100%" x2="0%" y2="0%">
                  <stop offset="0%" stopColor="#7000ff" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#ff007f" stopOpacity="1" />
                </linearGradient>
              </defs>
              {/* Trunk */}
              <path d="M 280,400 Q 220,300 180,120 Q 168,120 210,400 Z" fill="url(#palm-right-trunk)" />
              {/* Contained Leaves */}
              <path d="M 180,120 C 140,80 90,100 70,130 C 100,110 150,110 180,120 Z" fill="url(#palm-right-leaves)" />
              <path d="M 180,120 C 130,120 80,160 70,210 C 100,170 150,140 180,120 Z" fill="url(#palm-right-leaves)" />
              <path d="M 180,120 C 150,170 130,220 120,270 C 140,210 160,170 180,120 Z" fill="url(#palm-right-leaves)" />
              <path d="M 180,120 C 170,60 140,40 120,20 C 140,50 160,80 180,120 Z" fill="url(#palm-right-leaves)" />
              <path d="M 180,120 C 220,80 270,100 280,130 C 260,110 210,110 180,120 Z" fill="url(#palm-right-leaves)" />
              <path d="M 180,120 C 230,110 280,160 290,210 C 260,170 210,140 180,120 Z" fill="url(#palm-right-leaves)" />
              <path d="M 180,120 C 220,170 250,230 270,280 C 240,230 200,180 180,120 Z" fill="url(#palm-right-leaves)" />
            </svg>
          </div>

          {/* Diagonal laser glows */}
          <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] rounded-full bg-[radial-gradient(circle,rgba(0,234,255,0.1)_0%,transparent_70%)] blur-3xl animate-[pulseGlow_6s_infinite]" />
            <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full bg-[radial-gradient(circle,rgba(252,3,161,0.1)_0%,transparent_70%)] blur-3xl animate-[pulseGlow_7s_infinite_1s]" />
          </div>

          {/* RESPONSIVE LAYOUT CONTAINER */}
          <div className="relative z-10 w-full max-w-6xl flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-16 my-auto pt-6 lg:pt-0">
            
            {/* COLUMN 1: 3D Medallion (Flyer - IMG_9314.JPG) with curved CANCÚN text below it */}
            <div 
              className="relative shrink-0 flex flex-col items-center justify-center px-4 w-full sm:w-[420px] lg:w-[480px] pb-8 lg:pb-0 pt-4 lg:pt-8"
              style={{ animation: 'riseUp 0.7s ease-out both' }}
            >
              {/* 3D Tilting Poster wrapper */}
              <div
                onMouseMove={(e) => {
                  const card = e.currentTarget;
                  const rect = card.getBoundingClientRect();
                  const x = e.clientX - rect.left - rect.width / 2;
                  const y = e.clientY - rect.top - rect.height / 2;
                  card.style.transform = `perspective(1000px) rotateX(${-y / 15}deg) rotateY(${x / 15}deg) scale(1.04)`;
                  card.style.boxShadow = '0 30px 70px rgba(0, 0, 0, 0.85), 0 0 45px rgba(0, 234, 255, 0.4), 0 0 90px rgba(252, 3, 161, 0.2)';
                }}
                onMouseLeave={(e) => {
                  const card = e.currentTarget;
                  card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)';
                  card.style.boxShadow = '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(252, 3, 161, 0.3)';
                }}
                style={{
                  width: 'min(70vw, 34vh, 310px)',
                  height: 'min(70vw, 34vh, 310px)',
                  transition: 'transform 0.18s ease-out, box-shadow 0.25s ease',
                  boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(252, 3, 161, 0.3)',
                  cursor: 'pointer',
                  position: 'relative',
                  marginTop: '36px',
                }}
                className="group"
              >
                {/* Real flyer image */}
                <div className="absolute inset-0 rounded-full border-[6px] border-white/10 overflow-hidden select-none bg-[#110022]">
                  <img 
                    src="/grand_national_bg.jpg" 
                    alt="12th Grand National" 
                    className="w-full h-full object-cover select-none pointer-events-none scale-[1.01] group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-white/0 via-white/10 to-white/20 opacity-60 mix-blend-overlay" />
                </div>
                
                {/* Curved CANCÚN Text perfectly wrapped BELOW the poster circumference */}
                <svg 
                  viewBox="0 0 400 400" 
                  className="absolute -inset-[32px] w-[calc(100%+64px)] h-[calc(100%+64px)] pointer-events-none z-20 select-none overflow-visible"
                >
                  <defs>
                    <path 
                      id="curve" 
                      d="M 60,300 A 160,160 0 0,0 340,300" 
                      fill="none" 
                    />
                  </defs>
                  <text className="font-display font-black tracking-[0.22em]" style={{ fontSize: '38px' }}>
                    <textPath 
                      href="#curve" 
                      startOffset="50%" 
                      textAnchor="middle" 
                      fill="#00d2ff"
                      style={{ 
                        filter: 'drop-shadow(0 2px 10px rgba(0,210,255,0.95))',
                        textShadow: '0 0 25px rgba(0,210,255,0.7)',
                      }}
                    >
                      CANCÚN
                    </textPath>
                  </text>
                </svg>
              </div>
            </div>

            {/* COLUMN 2: Info & Action Buttons */}
            <div 
              className="flex-1 w-full flex flex-col items-center lg:items-start text-center lg:text-left space-y-6 sm:space-y-8 px-2 max-w-lg justify-center"
              style={{ animation: 'riseUp 0.7s 0.2s ease-out both' }}
            >
              <div className="space-y-4 w-full">
                {/* Clean Event Name (filters out "CANCÚN", "GRAN FINAL", "FINAL NACIONAL" to prevent duplication) */}
                {(() => {
                  let name = event?.name || '12th GRAND NATIONAL';
                  name = name
                    .replace(/gran final/gi, '')
                    .replace(/final nacional/gi, '')
                    .replace(/cancún/gi, '')
                    .replace(/cancun/gi, '')
                    .replace(/[\s-]+/g, ' ')
                    .trim();
                  const displayName = name || '12th GRAND NATIONAL';
                  return (
                    <h1 className="font-display font-bold uppercase leading-[1.1] tracking-wider text-2xl sm:text-4xl text-purple-100 drop-shadow-md">
                      {displayName}
                    </h1>
                  );
                })()}

                {/* DATES ONLY (Stylized premium gold glassmorphism badge with Lucide Calendar icon - No Emojis/Stars) */}
                <div className="pt-2 flex justify-center lg:justify-start w-full">
                  <div 
                    className="inline-flex items-center gap-3 px-5 py-2.5 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-yellow-500/30 rounded-2xl shadow-xl backdrop-blur-md relative overflow-hidden"
                    style={{
                      boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <Calendar className="w-5 h-5 text-yellow-400 filter drop-shadow-[0_0_8px_rgba(250,204,21,0.6)] shrink-0" />
                    <span className="font-display font-black text-base sm:text-lg bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-300 bg-clip-text text-transparent tracking-[0.12em] uppercase">
                      {event?.date ? formatEventDate(event.date) : '26 y 27 de Junio, 2026'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Call to Action Button (Sunset Neon Tropical Gradient with sleek white text and high-contrast glow) */}
              <div 
                className="w-full relative pt-2"
                style={{ animation: 'riseUp 0.7s 0.35s ease-out both' }}
              >
                <button
                  onClick={onNext}
                  className="w-full py-4.5 rounded-2xl font-display text-xl tracking-[0.16em] font-extrabold hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 relative overflow-hidden group shadow-2xl"
                  style={{
                    background: 'linear-gradient(135deg, #ff007f 0%, #ff5e62 50%, #ff9966 100%)',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.4)',
                    boxShadow: '0 0 35px rgba(255, 0, 127, 0.55), 0 0 70px rgba(255, 94, 98, 0.35), inset 0 1px 0 rgba(255,255,255,0.45)',
                  }}
                >
                  {/* Sparkling Light Sweep Overlay */}
                  <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div 
                      className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent -skew-x-25"
                      style={{ 
                        left: '-100%',
                        animation: 'sweep 3.5s infinite ease-in-out',
                      }} 
                    />
                  </div>

                  <span className="relative z-10 inline-block uppercase font-black">
                    COMENZAR REGISTRO
                  </span>
                </button>
              </div>

            </div>

          </div>
        </div>
      )
    }

    case 'setup': {
      const isEmailValid = state.coach.email.trim().length >= 5 && state.coach.email.includes('@') && state.coach.email.includes('.')
      const isCoachValid = state.coach.name.trim().length >= 2 && state.coach.phone.trim().length >= 8 && isEmailValid
      const isAcademyValid = state.academy.trim().length >= 2
      const isCityValid = state.city && state.city.trim().length >= 2
      const isValid = isCoachValid && isAcademyValid && isCityValid

      return (
        <div className="space-y-2.5 py-1 sm:space-y-3 overflow-visible max-h-none md:overflow-y-auto md:max-h-[80vh] px-0 sm:px-1" style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <div className="text-center lg:text-left space-y-0.5 px-4 sm:px-0">
            <h2 className="font-display text-3xl lg:text-4xl text-[rgb(var(--c-text-strong))]">Paso 1: Coach y Academia</h2>
            <p className="text-xs text-[rgb(var(--c-text))]">Completa tu información organizativa general</p>
          </div>

          <div className="bg-[rgb(var(--c-surface))] border-t sm:border-b sm:border border-[rgb(var(--c-border)/0.4)] rounded-none sm:rounded-3xl shadow-none sm:shadow-sm overflow-hidden divide-y divide-[rgb(var(--c-border)/0.25)]">
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[rgb(var(--c-border)/0.25)]">
              {/* COACH CARD */}
              <div className="p-3 sm:p-5 space-y-2.5">
                <h3 className="font-display text-xl text-[rgb(var(--c-primary))] flex items-center gap-2 border-b border-[rgb(var(--c-border)/0.2)] pb-1.5">
                  <Users className="w-5 h-5" /> COACH PRINCIPAL
                </h3>
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] mb-1">NOMBRE COMPLETO</label>
                    <input
                      type="text"
                      value={state.coach.name}
                      onChange={e => updateCoach({ name: e.target.value })}
                      placeholder="Nombre del coach principal"
                      className="w-full bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.6)] text-[rgb(var(--c-text-strong))] rounded-2xl px-4 py-3 outline-none focus:border-[rgb(var(--c-primary))] focus:ring-1 focus:ring-[rgb(var(--c-primary))] transition-all text-sm"
                      autoCapitalize="words"
                      autoComplete="name"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] mb-1">WHATSAPP (TELÉFONO)</label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={state.coach.phone}
                        onChange={e => updateCoach({ phone: e.target.value.replace(/\D/g, '') })}
                        placeholder="Números sin espacios ni guiones"
                        className="w-full bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.6)] text-[rgb(var(--c-text-strong))] rounded-2xl px-4 py-3 outline-none focus:border-[rgb(var(--c-primary))] focus:ring-1 focus:ring-[rgb(var(--c-primary))] transition-all text-sm"
                        autoComplete="one-time-code"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] mb-1">CORREO ELECTRÓNICO</label>
                      <input
                        type="email"
                        value={state.coach.email}
                        onChange={e => updateCoach({ email: e.target.value })}
                        placeholder="correo@ejemplo.com"
                        className="w-full bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.6)] text-[rgb(var(--c-text-strong))] rounded-2xl px-4 py-3 outline-none focus:border-[rgb(var(--c-primary))] focus:ring-1 focus:ring-[rgb(var(--c-primary))] transition-all text-sm"
                        autoCapitalize="off"
                        autoComplete="email"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ACADEMY CARD */}
              <div className="p-3 sm:p-5 space-y-2.5">
                <h3 className="font-display text-xl text-[rgb(var(--c-primary))] flex items-center gap-2 border-b border-[rgb(var(--c-border)/0.2)] pb-1.5">
                  <School className="w-5 h-5" /> ACADEMIA Y EQUIPO
                </h3>
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] mb-1">CIUDAD</label>
                      <input
                        type="text"
                        value={state.city}
                        onChange={e => updateState(s => ({ ...s, city: e.target.value }))}
                        placeholder="Ej. Monterrey"
                        className="w-full bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.6)] text-[rgb(var(--c-text-strong))] rounded-2xl px-4 py-3 outline-none focus:border-[rgb(var(--c-primary))] focus:ring-1 focus:ring-[rgb(var(--c-primary))] transition-all text-sm"
                        autoCapitalize="words"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] mb-1">COLEGIO / ACADEMIA</label>
                      <input
                        type="text"
                        value={state.academy}
                        onChange={e => updateState(s => ({ ...s, academy: e.target.value }))}
                        placeholder="Ej. Escuela de Danza Ritmo"
                        className="w-full bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.6)] text-[rgb(var(--c-text-strong))] rounded-2xl px-4 py-3 outline-none focus:border-[rgb(var(--c-primary))] focus:ring-1 focus:ring-[rgb(var(--c-primary))] transition-all text-sm"
                        autoCapitalize="sentences"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)]">NOMBRE DEL EQUIPO</label>
                      {state.academy.trim().length >= 2 && (
                        <button
                          type="button"
                          onClick={() => updateState(s => ({ ...s, teamName: s.academy }))}
                          className="text-[10px] text-[rgb(var(--c-primary))] hover:underline font-bold"
                        >
                          COPIAR ACADEMIA
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={state.teamName}
                      onChange={e => updateState(s => ({ ...s, teamName: e.target.value }))}
                      placeholder={state.academy || "Ej. Ritmo Senior Team"}
                      className="w-full bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.6)] text-[rgb(var(--c-text-strong))] rounded-2xl px-4 py-3 outline-none focus:border-[rgb(var(--c-primary))] focus:ring-1 focus:ring-[rgb(var(--c-primary))] transition-all text-sm"
                      autoCapitalize="sentences"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* DYNAMIC STAFF CARD (EXTRA COACHES & ASSISTANTS) */}
            <div className="p-3.5 sm:p-6 space-y-3.5 sm:space-y-5">
              <h3 className="font-display text-xl text-[rgb(var(--c-primary))] border-b border-[rgb(var(--c-border)/0.2)] pb-2 flex items-center gap-2">
                <Users className="w-5 h-5 text-[rgb(var(--c-primary))]" /> STAFF ADICIONAL (COACHES Y ASISTENTES)
              </h3>
              
              <div className="grid md:grid-cols-2 gap-6">
                {/* EXTRA COACHES */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-display tracking-wider text-[rgb(var(--c-text-strong))] font-bold">COACHES ADICIONALES</label>
                    <button
                      type="button"
                      onClick={() => updateCoach({ extras: [...state.coach.extras, ''] })}
                      className="inline-flex items-center gap-1 text-xs text-[rgb(var(--c-primary))] font-bold hover:opacity-85 active:scale-95 transition-all duration-150"
                    >
                      <Plus className="w-3.5 h-3.5" /> AGREGAR
                    </button>
                  </div>
                  
                  {state.coach.extras.length === 0 ? (
                    <p className="text-xs text-[rgb(var(--c-text)/0.5)] italic bg-[rgb(var(--c-surface))] p-3 rounded-2xl text-center">No hay coaches adicionales registrados</p>
                  ) : (
                    <div className="space-y-2 max-h-none overflow-visible md:max-h-[180px] md:overflow-y-auto pr-1">
                      {state.coach.extras.map((e, idx) => (
                        <div key={`extra-${idx}`} className="flex gap-2 animate-[fadeIn_0.2s_ease-out_forwards]">
                          <input
                            type="text"
                            value={e}
                            onChange={ev => updateCoach({ extras: state.coach.extras.map((x, j) => j === idx ? ev.target.value : x) })}
                            placeholder={`Nombre del coach ${idx + 2}`}
                            className="flex-1 bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.6)] text-[rgb(var(--c-text-strong))] rounded-xl px-3 py-2 outline-none focus:border-[rgb(var(--c-primary))] text-xs"
                            autoCapitalize="words"
                          />
                          <button
                            type="button"
                            onClick={() => updateCoach({ extras: state.coach.extras.filter((_, j) => j !== idx) })}
                            className="text-[rgb(var(--c-primary))] bg-[rgb(var(--c-primary)/0.1)] active:bg-[rgb(var(--c-primary)/0.2)] p-2 rounded-xl active:scale-95 transition-all duration-150"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ASSISTANTS */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-display tracking-wider text-[rgb(var(--c-text-strong))] font-bold">ASISTENTES (STAFF DE APOYO)</label>
                    <button
                      type="button"
                      onClick={() => updateCoach({ assistants: [...state.coach.assistants, ''] })}
                      className="inline-flex items-center gap-1 text-xs text-[rgb(var(--c-primary))] font-bold hover:opacity-85 active:scale-95 transition-all duration-150"
                    >
                      <Plus className="w-3.5 h-3.5" /> AGREGAR
                    </button>
                  </div>
                  
                  {state.coach.assistants.length === 0 ? (
                    <p className="text-xs text-[rgb(var(--c-text)/0.5)] italic bg-[rgb(var(--c-surface))] p-3 rounded-2xl text-center">No hay asistentes registrados</p>
                  ) : (
                    <div className="space-y-2 max-h-none overflow-visible md:max-h-[180px] md:overflow-y-auto pr-1">
                      {state.coach.assistants.map((ast, idx) => (
                        <div key={`assistant-${idx}`} className="flex gap-2 animate-[fadeIn_0.2s_ease-out_forwards]">
                          <input
                            type="text"
                            value={ast}
                            onChange={ev => updateCoach({ assistants: state.coach.assistants.map((x, j) => j === idx ? ev.target.value : x) })}
                            placeholder={`Nombre del asistente ${idx + 1}`}
                            className="flex-1 bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.6)] text-[rgb(var(--c-text-strong))] rounded-xl px-3 py-2 outline-none focus:border-[rgb(var(--c-primary))] text-xs"
                            autoCapitalize="words"
                          />
                          <button
                            type="button"
                            onClick={() => updateCoach({ assistants: state.coach.assistants.filter((_, j) => j !== idx) })}
                            className="text-[rgb(var(--c-primary))] bg-[rgb(var(--c-primary)/0.1)] active:bg-[rgb(var(--c-primary)/0.2)] p-2 rounded-xl active:scale-95 transition-all duration-150"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="hidden lg:block pt-3">
            <button
              onClick={onNext}
              disabled={!isValid}
              className="w-full bg-gradient-to-r from-[#16A34A] via-[#82f606] to-[#fff200] hover:brightness-105 active:brightness-95 text-[rgb(var(--c-text-strong))] font-display text-xl tracking-widest py-4 rounded-2xl transition-all shadow-md active:scale-[0.98] duration-150 font-bold disabled:opacity-40 disabled:pointer-events-none"
            >
              CONTINUAR AL PASO 2: INTEGRANTES
            </button>
          </div>
        </div>
      )
    }

    case 'dancers': {
      const isAllValid = state.dancers.length > 0 && state.dancers.every(d => d.name.trim().length >= 2 && d.birthdate.length === 10)

      return (
        <><div className="space-y-3 py-1 sm:space-y-4 overflow-visible max-h-none md:overflow-y-auto md:max-h-[82vh] px-0 sm:px-1 flex flex-col md:h-full md:min-h-0" style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <div className="shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 sm:px-0">
            <div className="text-center md:text-left space-y-0.5">
              <h2 className="font-display text-3xl text-[rgb(var(--c-text-strong))]">Paso 2: Registro de Integrantes</h2>
              <p className="text-xs text-[rgb(var(--c-text))]">Ingresa los integrantes. La edad y categoría se calculan automáticamente.</p>
            </div>
            
            <div className="flex gap-2 justify-center shrink-0">
              <button
                type="button"
                onClick={onOpenSmartPaste}
                className="inline-flex items-center gap-1.5 bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-primary)/0.4)] text-[rgb(var(--c-primary))] px-4 py-2.5 rounded-2xl font-display text-sm tracking-wider font-bold shadow-sm active:scale-95 active:bg-[rgb(var(--c-surface-2))] transition-all duration-150"
              >
                <Clipboard className="w-4 h-4 text-[rgb(var(--c-primary))]" /> PEGAR LISTA
              </button>
              <button
                type="button"
                onClick={addDancer}
                className="inline-flex items-center gap-1 bg-[rgb(var(--c-primary))] hover:bg-[rgb(var(--c-primary-strong))] text-white px-4 py-2.5 rounded-2xl font-display text-sm tracking-wider font-bold shadow-sm active:scale-95 transition-all duration-150"
              >
                <Plus className="w-4 h-4" /> AGREGAR INTEGRANTE
              </button>
            </div>
          </div>

          <div className="overflow-visible md:flex-1 md:min-h-0 md:overflow-y-auto bg-[rgb(var(--c-surface))] border-t sm:border-b sm:border border-[rgb(var(--c-border)/0.4)] rounded-none sm:rounded-3xl shadow-none sm:shadow-sm p-2 sm:p-4">
            {state.dancers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                <div className="p-4 bg-[rgb(var(--c-primary)/0.05)] rounded-full text-[rgb(var(--c-primary))]">
                  <Users className="w-12 h-12" />
                </div>
                <div>
                  <h4 className="font-display text-xl text-[rgb(var(--c-text-strong))]">Sin integrantes registrados</h4>
                  <p className="text-xs text-[rgb(var(--c-text)/0.7)] mt-1 max-w-xs mx-auto">
                    {'Usa el botón "Agregar Fila" para escribir un nombre, o "Pegar Lista" para cargar desde WhatsApp.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {state.dancers.map((d, i) => {
                  const compCat = categoryFromBirthdate(d.birthdate)
                  const age = ageFromBirthdate(d.birthdate)
                  const isDancerValid = d.name.trim().length >= 2 && d.birthdate.length === 10
                  const color = compCat ? CATEGORY_COLORS[compCat] : DEFAULT_DANCER_COLOR

                  return (
                    <div
                      key={`dancer-${i}`}
                      className={`border rounded-2xl overflow-hidden transition-all duration-200 animate-[fadeIn_0.2s_ease-out_forwards] ${
                        isDancerValid ? `${color.bg} ${color.border}` : 'bg-[rgb(var(--c-surface))] border-[rgb(var(--c-border)/0.4)]'
                      }`}
                    >
                      {/* Nombre */}
                      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[rgb(var(--c-border)/0.2)]">
                        <span className="font-display text-base text-[rgb(var(--c-primary))] shrink-0 w-5 text-center">{i + 1}</span>
                        <input
                          type="text"
                          value={d.name}
                          onChange={e => updateDancer(i, { name: e.target.value })}
                          placeholder="Nombre completo"
                          className="flex-1 min-w-0 bg-transparent text-[rgb(var(--c-text-strong))] text-sm font-semibold outline-none placeholder:text-[rgb(var(--c-text)/0.3)]"
                          autoCapitalize="words"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                        />
                        <button type="button" onClick={() => removeDancer(i)} className="shrink-0 text-[rgb(var(--c-text)/0.25)] active:text-red-500 p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Fecha de nacimiento */}
                      <div className="px-3 pt-2 pb-1">
                        <p className="text-[9px] font-bold tracking-widest text-[rgb(var(--c-text)/0.4)] mb-1.5">FECHA DE NACIMIENTO</p>
                        <button
                          type="button"
                          onClick={() => {
                            const [y, m, day] = d.birthdate ? d.birthdate.split('-') : ['', '', '']
                            setDatePickerVal({ day: day || '', month: m || '', year: y || '' })
                            setDatePickerIndex(i)
                            document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#000000')
                          }}
                          className="w-full bg-[rgb(var(--c-surface-2))] border border-[rgb(var(--c-border)/0.5)] rounded-xl px-3 py-2 text-sm font-semibold text-left flex items-center gap-2 active:border-[rgb(var(--c-primary))] transition-all"
                        >
                          <span className="text-[rgb(var(--c-primary)/0.7)]">📅</span>
                          <span className={d.birthdate && d.birthdate.length === 10 ? 'text-[rgb(var(--c-text-strong))]' : 'text-[rgb(var(--c-text)/0.35)]'}>
                            {d.birthdate && d.birthdate.length === 10
                              ? (() => { const [y,m,day] = d.birthdate.split('-'); return `${day}/${m}/${y}` })()
                              : 'DD / MM / AAAA'}
                          </span>
                        </button>
                      </div>

                      {/* Categoría y edad */}
                      <div className="px-3 pt-1 pb-2.5 flex items-end gap-2">
                        {compCat && (
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] font-bold tracking-widest text-[rgb(var(--c-text)/0.4)] mb-1.5">CATEGORÍA</p>
                            <div className="bg-[rgb(var(--c-surface-2))] border border-[rgb(var(--c-border)/0.5)] rounded-xl px-2 py-2 text-sm font-bold text-[rgb(var(--c-text-strong))]">
                              {AGE_CATEGORY_LABELS[compCat]}
                            </div>
                          </div>
                        )}
                        {age !== null && (
                          <div className="w-16 shrink-0 text-center">
                            <p className="text-[9px] font-bold tracking-widest text-[rgb(var(--c-text)/0.4)] mb-1.5">EDAD</p>
                            <span className="block bg-[rgb(var(--c-surface-2))] border border-[rgb(var(--c-border)/0.3)] rounded-xl py-2 text-sm font-mono font-bold text-[rgb(var(--c-text)/0.6)] whitespace-nowrap">{age} años</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                {state.dancers.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-[rgb(var(--c-border)/0.25)] flex justify-center">
                    <button
                      type="button"
                      onClick={addDancer}
                      className="w-full inline-flex items-center justify-center gap-1.5 bg-[rgb(var(--c-primary))] hover:bg-[rgb(var(--c-primary-strong))] text-white py-3 rounded-2xl font-display text-sm tracking-wider font-bold shadow-sm active:scale-95 transition-all duration-150"
                    >
                      <Plus className="w-4 h-4" /> AGREGAR INTEGRANTE
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="hidden lg:block shrink-0 pt-2">
            <button
              onClick={onNext}
              disabled={!isAllValid}
              className="w-full bg-gradient-to-r from-[#16A34A] via-[#82f606] to-[#fff200] hover:brightness-105 active:brightness-95 text-[rgb(var(--c-text-strong))] font-display text-xl tracking-widest py-4 rounded-2xl transition-all shadow-md active:scale-[0.98] duration-150 font-bold disabled:opacity-40 disabled:pointer-events-none"
            >
              CONTINUAR AL PASO 3: REGISTRO DE ACTOS ({state.dancers.length} Integrantes)
            </button>
          </div>
        </div>

        {/* DATE PICKER SHEET */}
        {datePickerIndex !== null && (
          <div className="fixed inset-x-0 bottom-0 top-24 z-[99998] flex flex-col justify-end" onClick={closeDatePicker} style={{ animation: datePickerClosing ? 'fadeOut 0.18s ease-in forwards' : 'fadeIn 0.2s ease-out' }}>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-black/50" />
            <div className="relative bg-[rgb(var(--c-surface))] rounded-t-3xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center">
                <button type="button" onClick={closeDatePicker} className="text-sm text-[rgb(var(--c-text)/0.5)] font-semibold px-2 py-1">Cancelar</button>
                <p className="font-display text-lg tracking-widest text-[rgb(var(--c-text-strong))]">FECHA DE NACIMIENTO</p>
                <button type="button" onClick={() => {
                  if (datePickerVal.day && datePickerVal.month && datePickerVal.year) {
                    updateDancer(datePickerIndex, { birthdate: `${datePickerVal.year}-${datePickerVal.month}-${datePickerVal.day}` })
                  }
                  closeDatePicker()
                }} className="text-sm text-[rgb(var(--c-primary))] font-bold px-2 py-1">Listo</button>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <p className="text-[9px] font-bold tracking-widest text-[rgb(var(--c-text)/0.4)] mb-1.5 text-center">DÍA</p>
                  <select value={datePickerVal.day} onChange={e => setDatePickerVal(v => ({ ...v, day: e.target.value }))}
                    className="w-full bg-[rgb(var(--c-surface-2))] border border-[rgb(var(--c-border)/0.5)] rounded-xl px-2 py-2.5 text-sm font-semibold text-center outline-none text-[rgb(var(--c-text-strong))]">
                    <option value="">Día</option>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={String(d).padStart(2, '0')}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-[2]">
                  <p className="text-[9px] font-bold tracking-widest text-[rgb(var(--c-text)/0.4)] mb-1.5 text-center">MES</p>
                  <select value={datePickerVal.month} onChange={e => setDatePickerVal(v => ({ ...v, month: e.target.value }))}
                    className="w-full bg-[rgb(var(--c-surface-2))] border border-[rgb(var(--c-border)/0.5)] rounded-xl px-2 py-2.5 text-sm font-semibold text-center outline-none text-[rgb(var(--c-text-strong))]">
                    <option value="">Mes</option>
                    {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m, idx) => (
                      <option key={m} value={String(idx + 1).padStart(2, '0')}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-[1.5]">
                  <p className="text-[9px] font-bold tracking-widest text-[rgb(var(--c-text)/0.4)] mb-1.5 text-center">AÑO</p>
                  <select value={datePickerVal.year} onChange={e => setDatePickerVal(v => ({ ...v, year: e.target.value }))}
                    className="w-full bg-[rgb(var(--c-surface-2))] border border-[rgb(var(--c-border)/0.5)] rounded-xl px-2 py-2.5 text-sm font-semibold text-center outline-none text-[rgb(var(--c-text-strong))]">
                    <option value="">Año</option>
                    {Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i).map(y => (
                      <option key={y} value={String(y)}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}
        </>
      )
    }

    case 'acts': {
      const isAllValid = state.acts.length > 0 && state.acts.every(a => a.modality && a.style && a.dancerIndices.length >= minDancers(a.modality))

      const handleCreateAct = () => {
        addAct()
        setActiveActIndex(state.acts.length)
      }

      return (
        <div className="space-y-3 py-1 overflow-visible max-h-none md:overflow-y-auto md:max-h-[82vh] px-0 sm:px-1 flex flex-col md:h-full md:min-h-0" style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <div className="shrink-0 flex items-center justify-between px-4 sm:px-0">
            <div className="text-center lg:text-left space-y-0.5">
              <h2 className="font-display text-3xl text-[rgb(var(--c-text-strong))]">Paso 3: Constructor de Actos</h2>
              <p className="text-xs text-[rgb(var(--c-text))]">Registra tus coreografías, modalidades y selecciona a sus integrantes.</p>
            </div>
            
            <button
              type="button"
              onClick={handleCreateAct}
              className="inline-flex items-center gap-1 bg-[rgb(var(--c-primary))] hover:bg-[rgb(var(--c-primary-strong))] text-white px-4 py-2.5 rounded-2xl font-display text-sm tracking-wider font-bold shadow-sm active:scale-95 transition-all duration-150 shrink-0"
            >
              <Plus className="w-4 h-4" /> CREAR ACTO
            </button>
          </div>

          <div className="overflow-visible md:flex-1 md:min-h-0 md:overflow-y-auto">
            {state.acts.length === 0 ? (
              <div className="bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.5)] rounded-3xl p-16 text-center space-y-4 shadow-sm mx-4 sm:mx-0">
                <div className="p-4 bg-[rgb(var(--c-primary)/0.05)] rounded-full text-[rgb(var(--c-primary))] inline-block">
                  <Sparkles className="w-12 h-12" />
                </div>
                <div>
                  <h4 className="font-display text-xl text-[rgb(var(--c-text-strong))]">Ningún acto creado todavía</h4>
                  <p className="text-xs text-[rgb(var(--c-text)/0.7)] mt-1 max-w-xs mx-auto">
                    {'Presiona "Crear Acto" para registrar tu primera coreografía/participación.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-[rgb(var(--c-surface))] border-t sm:border-b sm:border border-[rgb(var(--c-border)/0.4)] rounded-none sm:rounded-3xl shadow-none sm:shadow-sm divide-y divide-[rgb(var(--c-border)/0.25)] overflow-hidden">
                {state.acts.map((act, i) => {
                  const isOpen = activeActIndex === i
                  const labelModality = act.modality ? modalityLabel(act.modality) : 'Sin modalidad'
                  const styleName = act.style ? act.style.toUpperCase() : 'ESTILO PENDIENTE'
                  const actDancersCount = act.dancerIndices.length
                  const reqDancers = minDancers(act.modality)
                  const limitDancers = maxDancers(act.modality)
                  const isActValid = act.modality && act.style && actDancersCount >= reqDancers && actDancersCount <= limitDancers

                  // Dynamic numbering sequence
                  let stepNum = 1
                  const modalityNum = stepNum++
                  const levelNum = act.modality === 'grupal' ? stepNum++ : null
                  const styleNum = stepNum++
                  const dancersNum = act.modality ? stepNum++ : null

                  return (
                    <div
                      key={`act-${i}`}
                      className="overflow-hidden"
                    >
                      {/* Header Acordeón */}
                      <div
                        onClick={() => setActiveActIndex(isOpen ? null : i)}
                        className={`px-4 py-2.5 sm:py-3 flex items-center justify-between cursor-pointer active:bg-[rgb(var(--c-surface))] transition-all ${
                          isActValid ? 'border-l-4 border-l-[rgb(var(--c-success))]' : 'border-l-4 border-l-[rgb(var(--c-primary))]'
                        }`}
                      >
                        <div className="min-w-0 flex-1 flex items-center gap-3">
                          <span className="font-display text-2xl text-[rgb(var(--c-primary))]">#{i + 1}</span>
                          <div className="truncate">
                            <p className="font-display text-lg text-[rgb(var(--c-text-strong))] uppercase leading-tight">
                              {act.ageCategory ? AGE_CATEGORY_LABELS[act.ageCategory].toUpperCase() : 'Categoría Pendiente'}
                            </p>
                            <p className="text-xs text-[rgb(var(--c-text)/0.8)] mt-0.5 font-medium leading-none">
                              {labelModality} · {styleName} {act.level === 'basico' ? '· BÁSICO' : act.level === 'avanzado' ? '· AVANZADO' : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3.5 shrink-0">
                          {actDancersCount > 0 && (
                            <span className="text-[10px] font-bold text-[rgb(var(--c-success-strong))] bg-[rgb(var(--c-success)/0.08)] border border-[rgb(var(--c-success)/0.2)] px-2.5 py-1 rounded-xl">
                              {actDancersCount} Integrantes
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeAct(i) }}
                            className="text-[rgb(var(--c-text)/0.4)] hover:text-[rgb(var(--c-primary))] p-1 hover:bg-[rgb(var(--c-primary)/0.05)] rounded-lg active:scale-95 transition-all duration-150"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <ChevronDown className={`w-5 h-5 text-[rgb(var(--c-text)/0.6)] transition-transform duration-300 ${isOpen ? 'rotate-180 text-[rgb(var(--c-primary))]' : ''}`} />
                        </div>
                      </div>

                      {/* Body Acordeón */}
                      {isOpen && (
                        <div className="p-3.5 sm:p-4 border-t border-[rgb(var(--c-border)/0.25)] space-y-4 animate-[fadeIn_0.25s_ease-out_forwards]">
                          {/* 1. Modalidad */}
                          <div className="space-y-1.5">
                            <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] uppercase">{modalityNum}. Selecciona la Modalidad</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                              {MODALITY_OPTIONS.map(opt => {
                                const isSelected = act.modality === opt.value
                                const isDisabled = state.dancers.length < minDancers(opt.value)
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() => {
                                      if (isDisabled) return
                                      const cleanedDancers = act.dancerIndices.slice(0, maxDancers(opt.value))
                                      updateAct(i, {
                                        modality: opt.value,
                                        dancerIndices: cleanedDancers,
                                        level: opt.value === 'grupal' ? act.level : null
                                      })
                                    }}
                                    className={`py-2 px-3 rounded-xl font-display text-xs sm:text-sm tracking-wider font-bold transition-all border duration-150 ${
                                      isSelected
                                        ? 'bg-[rgb(var(--c-primary))] border-[rgb(var(--c-primary))] text-white shadow-sm'
                                        : isDisabled
                                          ? 'bg-[rgb(var(--c-surface-2))] border-[rgb(var(--c-border)/0.2)] text-[rgb(var(--c-text)/0.35)] cursor-not-allowed opacity-60'
                                          : 'bg-[rgb(var(--c-surface))] border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] hover:bg-[rgb(var(--c-surface-2))] active:scale-95'
                                    }`}
                                    title={isDisabled ? `Requiere al menos ${minDancers(opt.value)} integrantes registrados` : undefined}
                                  >
                                    {opt.label}
                                  </button>
                                )
                              })}
                            </div>
                            {state.dancers.length < 4 && (
                              <p className="text-[10px] text-[rgb(var(--c-primary))] font-semibold mt-1 animate-[fadeIn_0.2s_ease-out_forwards]">
                                * Registraste {state.dancers.length} {state.dancers.length === 1 ? 'integrante' : 'integrantes'}. 
                                Para habilitar {state.dancers.length < 2 ? 'Dueto, Trío o Grupal' : state.dancers.length < 3 ? 'Trío o Grupal' : 'Grupal'}, 
                                agrega más alumnos en el Paso 2.
                              </p>
                            )}
                            <div className="mt-2.5 bg-amber-50 border border-amber-200/60 rounded-xl p-3 flex items-start gap-2 shadow-xs animate-[fadeIn_0.2s_ease-out_forwards]">
                              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                              <p className="text-[11px] leading-snug text-amber-800 font-medium">
                                <strong>Nota importante:</strong> No existe nivel básico para solistas, dúos y tríos, todos son avanzados.
                              </p>
                            </div>
                          </div>

                          {/* 2. Nivel (Solo si es Grupal) */}
                          {act.modality === 'grupal' && (
                            <div className="space-y-1.5 animate-[fadeIn_0.2s_ease-out_forwards]">
                              <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] uppercase">{levelNum}. Nivel Escolar de la Categoría</label>
                              <div className="grid grid-cols-2 gap-2.5 max-w-sm">
                                {[
                                  { val: 'basico', label: 'BÁSICO' },
                                  { val: 'avanzado', label: 'AVANZADO' }
                                ].map(opt => {
                                  const isSelected = act.level === opt.val
                                  return (
                                    <button
                                      key={opt.val}
                                      type="button"
                                      onClick={() => updateAct(i, { level: opt.val as Level })}
                                      className={`py-2 px-3 rounded-xl font-display text-sm tracking-wider font-bold transition-all border active:scale-95 duration-150 ${
                                        isSelected
                                          ? 'bg-[rgb(var(--c-primary))] border-[rgb(var(--c-primary))] text-white shadow-sm'
                                          : 'bg-[rgb(var(--c-surface))] border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] hover:bg-[rgb(var(--c-surface-2))]'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* 3. Estilo */}
                          <div className="space-y-1.5">
                            <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] uppercase">{styleNum}. Estilo Coreográfico</label>
                            <div className="flex flex-wrap justify-center gap-2.5">
                              {STYLES.map(style => {
                                const isSelected = act.style === style
                                return (
                                  <button
                                    key={style}
                                    type="button"
                                    onClick={() => updateAct(i, { style })}
                                    className={`py-2 px-3.5 rounded-full font-display text-xs tracking-wider font-bold transition-all border active:scale-95 duration-150 ${
                                      isSelected
                                        ? 'bg-[rgb(var(--c-primary))] border-[rgb(var(--c-primary))] text-white shadow-sm'
                                        : 'bg-[rgb(var(--c-surface))] border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] hover:bg-[rgb(var(--c-surface-2))]'
                                    }`}
                                  >
                                    {style.toUpperCase()}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          {/* 4. Integrantes (Dancers Picker) */}
                          {act.modality ? (
                            <div className="space-y-2 animate-[fadeIn_0.2s_ease-out_forwards]">
                              <div className="flex justify-between items-center">
                                <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] uppercase">
                                  {dancersNum}. Selecciona Integrantes ({actDancersCount} de {limitDancers === 100 ? '4 o más' : limitDancers})
                                </label>
                                
                                {act.ageCategory && (
                                  <span className="text-[10px] font-bold font-display bg-[rgb(var(--c-primary))] text-white px-2.5 py-0.5 rounded-lg uppercase">
                                    Categoría Acto: {AGE_CATEGORY_LABELS[act.ageCategory]}
                                  </span>
                                )}
                              </div>

                              {state.dancers.length === 0 ? (
                                <p className="text-xs text-[rgb(var(--c-text)/0.6)] italic bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.3)] rounded-2xl p-4 text-center">
                                  Regresa al Paso anterior y registra integrantes primero
                                </p>
                              ) : (
                                <div className="bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.4)] rounded-2xl p-3 sm:p-4 max-h-none overflow-visible md:max-h-[300px] md:overflow-y-auto space-y-4">
                                  {/* Group Dancers by calculated ageCategory */}
                                  {AGE_CATEGORY_ORDER.map(cat => {
                                    const groupDancers = state.dancers
                                      .map((d, di) => ({ d, di }))
                                      .filter(({ d }) => effectiveCategory(d) === cat)
                                    
                                    if (groupDancers.length === 0) return null

                                    return (
                                      <div key={cat} className="space-y-2">
                                        <p className="text-sm sm:text-base font-extrabold text-[rgb(var(--c-primary))] border-b border-[rgb(var(--c-border)/0.25)] pb-1 uppercase mt-2.5 first:mt-0">
                                          {AGE_CATEGORY_LABELS[cat]} <span className="text-xs font-normal text-[rgb(var(--c-text)/0.6)] lowercase italic">({AGE_CATEGORY_HINTS[cat]})</span>
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                                          {groupDancers.map(({ d, di }) => {
                                            const isSel = act.dancerIndices.includes(di)
                                            
                                            const toggleDancer = () => {
                                              let nextIndices: number[]
                                              if (isSel) {
                                                nextIndices = act.dancerIndices.filter(idx => idx !== di)
                                              } else {
                                                if (act.modality === 'solista') {
                                                  nextIndices = [di]
                                                } else {
                                                  if (act.dancerIndices.length >= limitDancers) return
                                                  nextIndices = [...act.dancerIndices, di]
                                                }
                                              }
                                              
                                              // Compute high category
                                              const selectedCategories = nextIndices
                                                .map(idx => effectiveCategory(state.dancers[idx]))
                                                .filter(Boolean) as AgeCategory[]
                                              let highestCat: AgeCategory | null = null
                                              if (selectedCategories.length > 0) {
                                                const maxIndex = Math.max(...selectedCategories.map(c => AGE_CATEGORY_ORDER.indexOf(c)))
                                                highestCat = AGE_CATEGORY_ORDER[maxIndex]
                                              }

                                              updateAct(i, { dancerIndices: nextIndices, ageCategory: highestCat })
                                            }

                                            return (
                                              <button
                                                key={di}
                                                type="button"
                                                onClick={toggleDancer}
                                                className={`flex items-center justify-between p-2.5 rounded-xl font-display text-xs tracking-wider transition-all border active:scale-[0.98] duration-100 text-left ${
                                                  isSel
                                                    ? 'bg-purple-50/90 border-purple-300 text-purple-950 font-bold shadow-sm'
                                                    : 'bg-[rgb(var(--c-surface))] border-[rgb(var(--c-border)/0.4)] text-[rgb(var(--c-text-strong))] hover:bg-[rgb(var(--c-surface-2))]'
                                                }`}
                                              >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                                    isSel ? 'bg-purple-600 border-purple-600 text-white' : 'border-[rgb(var(--c-border)/0.7)] bg-[rgb(var(--c-surface))]'
                                                  }`}>
                                                    {isSel && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                                  </div>
                                                  <span className="break-words">{getDancerDisplayName(d, di, state.dancers)}</span>
                                                </div>
                                              </button>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}

                            </div>
                          ) : (
                            <p className="text-xs text-[rgb(var(--c-text)/0.5)] italic text-center py-3">Selecciona modalidad y estilo primero para habilitar los integrantes</p>
                          )}
                        </div>
                      )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

          <div className="hidden lg:block shrink-0 pt-2">
            {!actsConfirmed ? (
              <button
                type="button"
                onClick={() => {
                  setActiveActIndex(null)
                  setActsConfirmed(true)
                }}
                disabled={!isAllValid}
                className="w-full bg-[rgb(var(--c-primary))] hover:bg-[rgb(var(--c-primary-strong))] active:bg-[rgb(var(--c-primary-strong))] text-white font-display text-lg tracking-widest py-4 rounded-2xl transition-all shadow-md active:scale-[0.98] duration-150 font-bold disabled:opacity-40 disabled:pointer-events-none"
              >
                CONFIRMAR CONFIGURACIÓN DE ACTOS ({state.acts.length} {state.acts.length === 1 ? 'Acto' : 'Actos'})
              </button>
            ) : (
              <button
                type="button"
                onClick={onNext}
                disabled={!isAllValid}
                className="w-full bg-gradient-to-r from-[#16A34A] via-[#82f606] to-[#fff200] hover:brightness-105 active:brightness-95 text-[rgb(var(--c-text-strong))] font-display text-xl tracking-widest py-4 rounded-2xl transition-all shadow-md active:scale-[0.98] duration-150 font-bold disabled:opacity-40 disabled:pointer-events-none"
              >
                SIGUIENTE: IR A LA REVISIÓN ({state.acts.length} {state.acts.length === 1 ? 'Acto' : 'Actos'})
              </button>
            )}
          </div>
        </div>
      )
    }

    case 'summary':
      return (
        <FullSummary
          state={state}
          editMode={editMode}
          confirm={confirm}
          saving={saving}
          saveErr={saveErr}
          updateState={updateState}
          goToStep={goToStep}
          event={event}
        />
      )

    case 'confirmed':
      return (
        <FullSummary
          state={state}
          editMode={false}
          confirmed
          startEdit={startEdit}
          updateState={updateState}
          goToStep={goToStep}
          event={event}
        />
      )
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[rgb(var(--c-surface))] text-[rgb(var(--c-text-strong))] flex flex-col font-sans">
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
        {children}
      </div>
      <div className="px-6 py-3 shrink-0 flex justify-end">
        <a
          href="https://wa.me/525645415263"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 text-[rgb(var(--c-text))] hover:text-[rgb(var(--c-primary))] transition-all group active:scale-98"
        >
          <MessageCircle className="w-5 h-5 text-[rgb(var(--c-success))] shrink-0" />
          <span className="text-sm md:text-base">
            ¿Dudas o ayuda? Escríbenos por WhatsApp:{' '}
            <span className="font-display tracking-wider text-[rgb(var(--c-primary))]">564 541 5263</span>
          </span>
        </a>
      </div>
    </div>
  )
}

function MoneyInput({ value, onChange, onEnter }: {
  value: number | null
  onChange: (n: number | null) => void
  onEnter?: () => void
}) {
  return (
    <div className="relative max-w-sm mx-auto">
      <span className="absolute left-4 lg:left-5 top-1/2 -translate-y-1/2 text-[rgb(var(--c-primary))] font-display text-2xl lg:text-3xl pointer-events-none">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={value === null ? '' : String(value)}
        onChange={e => {
          const v = e.target.value.replace(/[^0-9.]/g, '')
          if (v === '') onChange(null)
          else {
            const n = Number(v)
            if (Number.isFinite(n)) onChange(n)
          }
        }}
        onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter() }}
        placeholder="0"
        className="w-full bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] text-2xl lg:text-3xl text-center rounded-2xl h-12 lg:h-16 outline-none focus:border-[rgb(var(--c-primary))] focus:ring-1 focus:ring-[rgb(var(--c-primary))] font-display pl-10 lg:pl-12 pr-10 lg:pr-12 placeholder:text-[rgb(var(--c-text)/0.6)] transition-all shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-bold"
      />
    </div>
  )
}

function FullSummary({ state, editMode, confirmed, confirm, saving, saveErr, startEdit, updateState, goToStep, event }: {
  state: State
  editMode: boolean
  confirmed?: boolean
  confirm?: () => Promise<void>
  saving?: boolean
  saveErr?: string | null
  startEdit?: () => void
  updateState: React.Dispatch<React.SetStateAction<State>>
  goToStep: (s: Step) => void
  event: Event | null
}) {
  const filledDancers = state.dancers.filter(d => d.name.trim().length > 0)
  const counts = participacionesPorAlumno(state)
  const total = costoTotal(state)
  const hasCosts = state.costPaquete !== null && state.costPaquete >= 0 && state.costRepeticion !== null && state.costRepeticion >= 0
  const chgDeadline = event?.date ? getChangesDeadline(event.date) : '7 días antes del evento'

  return (
    <div className="w-full flex flex-col min-h-0 md:h-full overflow-visible md:overflow-hidden" style={{ animation: 'fadeIn 0.3s ease-out' }}>
      {confirmed && (
        <div className="shrink-0 bg-[rgb(var(--c-success))] text-white text-center py-5 px-4 shadow-md z-10 rounded-none sm:rounded-2xl mb-4 space-y-3 flex flex-col items-center">
          <div>
            <p className="font-display text-xl md:text-2xl tracking-widest font-bold">¡REGISTRO CONFIRMADO EXITOSAMENTE!</p>
            <p className="text-sm opacity-90 mt-1">Tu información ha sido guardada en nuestro sistema.</p>
          </div>
          <div className="inline-flex items-center gap-2.5 bg-white/15 backdrop-blur-xs border border-white/20 rounded-xl px-4 py-2 text-xs md:text-sm font-medium max-w-xl mx-auto shadow-xs text-left">
            <Clock className="w-4 h-4 text-white shrink-0" />
            <span>
              Tienes hasta el <strong className="font-bold">{chgDeadline}</strong> para realizar cambios o editar tu registro.
            </span>
          </div>
        </div>
      )}
      
      <div className="flex-1 overflow-visible md:overflow-y-auto px-0 sm:px-4 lg:px-6 py-2 sm:py-4 pb-0 sm:pb-14 max-h-none md:max-h-[75vh]">
        
        <div className="bg-[rgb(var(--c-surface))] rounded-none sm:rounded-3xl border-t sm:border-b sm:border border-[rgb(var(--c-border)/0.4)] shadow-none sm:shadow-sm divide-y divide-[rgb(var(--c-border)/0.25)] overflow-hidden">
          {/* COACH, ACADEMY & STAFF */}
          <div className="p-3.5 sm:p-5 relative">
            <h3 className="font-display text-lg tracking-widest text-[rgb(var(--c-primary))] mb-4 border-b border-[rgb(var(--c-border)/0.25)] pb-2 flex justify-between items-center">
              <span>COACH Y ACADEMIA</span>
              {!confirmed && (
                <button onClick={() => goToStep({ kind: 'setup' })} className="text-xs text-[rgb(var(--c-primary))] hover:underline flex items-center gap-1">
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </button>
              )}
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-[10px] tracking-[0.2em] text-[rgb(var(--c-text)/0.6)] font-bold mb-1">COACH PRINCIPAL</p>
                <p className="font-display text-2xl text-[rgb(var(--c-text-strong))] uppercase leading-tight">{state.coach.name || 'Sin nombre'}</p>
                <p className="text-sm text-[rgb(var(--c-text))] mt-2 flex items-center gap-2"><span className="opacity-70">📱</span> {state.coach.phone || 'Sin WhatsApp'}</p>
                {state.coach.email && <p className="text-sm text-[rgb(var(--c-text))] mt-1 flex items-center gap-2"><span className="opacity-70">✉️</span> {state.coach.email}</p>}
                
                {state.coach.extras.filter(e => e.trim()).length > 0 && (
                  <div className="text-xs text-[rgb(var(--c-text))] mt-3 bg-[rgb(var(--c-surface))] p-2 rounded-xl border border-[rgb(var(--c-border)/0.25)]">
                    <span className="font-bold block text-[9px] uppercase tracking-wider text-[rgb(var(--c-text)/0.6)] mb-0.5">Otros Coaches:</span>
                    <span>{state.coach.extras.filter(e => e.trim()).join(', ')}</span>
                  </div>
                )}

                {state.coach.assistants && state.coach.assistants.filter(a => a.trim()).length > 0 && (
                  <div className="text-xs text-[rgb(var(--c-text))] mt-2 bg-[rgb(var(--c-surface))] p-2 rounded-xl border border-[rgb(var(--c-border)/0.25)]">
                    <span className="font-bold block text-[9px] uppercase tracking-wider text-[rgb(var(--c-text)/0.6)] mb-0.5">Asistentes:</span>
                    <span>{state.coach.assistants.filter(a => a.trim()).join(', ')}</span>
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] tracking-[0.2em] text-[rgb(var(--c-text)/0.6)] font-bold mb-1">COLEGIO / ACADEMIA</p>
                    <p className="font-display text-xl sm:text-2xl text-[rgb(var(--c-text-strong))] uppercase leading-tight">{state.academy || 'Sin academia'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] tracking-[0.2em] text-[rgb(var(--c-text)/0.6)] font-bold mb-1">CIUDAD</p>
                    <p className="font-display text-xl sm:text-2xl text-[rgb(var(--c-text-strong))] uppercase leading-tight">{state.city || 'Sin ciudad'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] tracking-[0.2em] text-[rgb(var(--c-text)/0.6)] font-bold mb-1">NOMBRE DEL EQUIPO</p>
                  <p className="font-display text-xl sm:text-2xl text-[rgb(var(--c-success-strong))] uppercase leading-tight">{state.teamName || state.academy || 'Sin equipo'}</p>
                </div>
              </div>
            </div>
          </div>

          {/* DANCERS SUMMARY */}
          <div className="p-3.5 sm:p-5">
            <h3 className="font-display text-lg tracking-widest text-[rgb(var(--c-primary))] mb-4 border-b border-[rgb(var(--c-border)/0.25)] pb-2 flex justify-between items-center">
              <span>INTEGRANTES REGISTRADOS</span>
              <div className="flex items-center gap-3">
                <span className="text-[rgb(var(--c-text))] opacity-60 text-xs font-semibold">{filledDancers.length} Integrantes</span>
                {!confirmed && (
                  <button onClick={() => goToStep({ kind: 'dancers' })} className="text-xs text-[rgb(var(--c-primary))] hover:underline flex items-center gap-1">
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </button>
                )}
              </div>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
              {filledDancers.length === 0 ? (
                <p className="text-[rgb(var(--c-text)/0.5)] italic text-sm col-span-full">Sin integrantes</p>
              ) : filledDancers.map((d, di) => {
                const n = counts.get(di) ?? 0
                return (
                  <div key={di} className="flex items-center gap-3 border-b border-[rgb(var(--c-border)/0.2)] pb-1 text-xs">
                    <span className="font-display text-sm text-[rgb(var(--c-text)/0.4)] w-5 text-right shrink-0">{di + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-sm uppercase text-[rgb(var(--c-text-strong))] truncate leading-tight font-bold">{d.name}</p>
                      <p className="text-[10px] text-[rgb(var(--c-text)/0.7)] mt-0.5 font-medium">{formatBirthdate(d.birthdate)} · {AGE_CATEGORY_LABELS[effectiveCategory(d) || 'tiny']}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {n > 0 ? (
                        <span className="block text-[10px] text-[rgb(var(--c-primary))] font-bold bg-[rgb(var(--c-primary)/0.03)] px-1.5 py-0.5 rounded-lg border border-[rgb(var(--c-primary)/0.15)] leading-none">{n} Acto{n === 1 ? '' : 's'}</span>
                      ) : (
                        <span className="block text-[9px] text-[rgb(var(--c-text)/0.4)] italic">Sin acto</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ACTS SUMMARY */}
          <div className="p-3.5 sm:p-5">
            <h3 className="font-display text-lg tracking-widest text-[rgb(var(--c-primary))] mb-4 border-b border-[rgb(var(--c-border)/0.25)] pb-2 flex justify-between items-center">
              <span>ACTOS REGISTRADOS</span>
              <div className="flex items-center gap-3">
                <span className="text-[rgb(var(--c-text))] opacity-60 text-xs font-semibold">{state.acts.length} {state.acts.length === 1 ? 'Coreografía' : 'Coreografías'}</span>
                {!confirmed && (
                  <button onClick={() => goToStep({ kind: 'acts' })} className="text-xs text-[rgb(var(--c-primary))] hover:underline flex items-center gap-1">
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </button>
                )}
              </div>
            </h3>
            <div className="border border-[rgb(var(--c-border)/0.35)] rounded-2xl bg-[rgb(var(--c-surface))] divide-y divide-[rgb(var(--c-border)/0.25)] overflow-hidden shadow-xs">
              {state.acts.length === 0 ? (
                <p className="text-[rgb(var(--c-text)/0.5)] italic text-sm p-4">Sin actos registrados</p>
              ) : state.acts.map((a, idx) => {
                const cat = a.ageCategory ? AGE_CATEGORY_LABELS[a.ageCategory] : '—'
                const mod = a.modality ? modalityLabel(a.modality) : '—'
                const lvl = a.modality === 'grupal' ? (a.level === 'basico' ? ' BÁSICO' : a.level === 'avanzado' ? ' AVANZADO' : '') : ''
                return (
                  <div key={idx} className="p-3.5 sm:p-4 bg-[rgb(var(--c-surface))] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-[fadeIn_0.2s_ease-out_forwards]">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="font-display text-2xl text-[rgb(var(--c-primary))] shrink-0 font-bold">#{idx + 1}</div>
                      <div className="min-w-0">
                        <p className="font-display text-lg text-[rgb(var(--c-text-strong))] leading-tight truncate uppercase font-bold">{cat}</p>
                        <p className="font-display text-xs text-[rgb(var(--c-text))] mt-0.5 leading-none">{mod}{lvl} · {a.style ?? '—'}</p>
                      </div>
                    </div>
                    {a.dancerIndices.length > 0 && (
                      <div className="bg-[rgb(var(--c-surface-2)/0.3)] border border-[rgb(var(--c-border)/0.25)] rounded-xl p-2.5 max-w-md shrink-0 w-full sm:w-auto">
                        <p className="text-[9px] font-bold tracking-widest text-[rgb(var(--c-text)/0.5)] mb-1 uppercase">INTEGRANTES ({a.dancerIndices.length})</p>
                        <div className="flex flex-wrap gap-1">
                          {a.dancerIndices.map(di => {
                            const d = state.dancers[di]
                            if (!d) return null
                            const compCat = effectiveCategory(d)
                            const color = compCat ? CATEGORY_COLORS[compCat] : DEFAULT_DANCER_COLOR
                            return (
                              <span key={di} className={`inline-block ${color.bg} ${color.text} text-[10px] px-2 py-0.5 rounded-md font-semibold border border-purple-200/40 shadow-xs`}>
                                {getDancerDisplayName(d, di, state.dancers)}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ENTRADAS PARA ACOMPAÑANTES */}
        <div className="mt-4 bg-[rgb(var(--c-surface))] rounded-none sm:rounded-3xl border-t sm:border border-[rgb(var(--c-border)/0.4)] shadow-none sm:shadow-sm overflow-hidden">
          <div className="p-3.5 sm:p-5">
            <h3 className="font-display text-lg tracking-widest text-[rgb(var(--c-primary))] mb-4 border-b border-[rgb(var(--c-border)/0.25)] pb-2 flex items-center gap-2">
              <Ticket className="w-5 h-5 text-[rgb(var(--c-primary))]" />
              <span>ENTRADAS PARA FAMILIARES / PAPÁS</span>
            </h3>
            <div className="bg-gradient-to-r from-purple-950/5 to-pink-950/5 border border-purple-500/10 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1 max-w-md">
                <p className="text-xs font-semibold text-[rgb(var(--c-text-strong))]">Recuerda que por este medio puedes registrar cuántas entradas van a comprar para familiares, papás y acompañantes.</p>
                <p className="text-[11px] text-[rgb(var(--c-text)/0.7)]">Costo por Entrada: <strong className="font-bold text-[rgb(var(--c-primary))]">{formatMoney(PRECIO_ENTRADA)} MXN</strong>.</p>
              </div>
              <div className="flex items-center gap-4 self-center md:self-auto bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.5)] rounded-2xl p-1.5 shadow-xs">
                {confirmed ? (
                  <div className="px-4 py-1.5 flex items-center gap-2">
                    <span className="text-sm font-semibold text-[rgb(var(--c-text))]">Compradas:</span>
                    <span className="font-display text-lg font-bold text-[rgb(var(--c-primary))]">{state.ticketsCount ?? 0}</span>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => updateState(prev => ({ ...prev, ticketsCount: Math.max(0, (prev.ticketsCount ?? 0) - 1) }))}
                      className="w-9 h-9 rounded-xl flex items-center justify-center bg-[rgb(var(--c-surface-2))] border border-[rgb(var(--c-border)/0.4)] hover:bg-[rgb(var(--c-border)/0.15)] active:scale-95 transition-all text-lg font-bold text-[rgb(var(--c-text))]"
                    >
                      -
                    </button>
                    <span className="font-display text-xl font-bold w-8 text-center text-[rgb(var(--c-text-strong))]">
                      {state.ticketsCount ?? 0}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateState(prev => ({ ...prev, ticketsCount: (prev.ticketsCount ?? 0) + 1 }))}
                      className="w-9 h-9 rounded-xl flex items-center justify-center bg-[rgb(var(--c-surface-2))] border border-[rgb(var(--c-border)/0.4)] hover:bg-[rgb(var(--c-border)/0.15)] active:scale-95 transition-all text-lg font-bold text-[rgb(var(--c-text))]"
                    >
                      +
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* DESGLOSE DE COSTOS */}
        {(() => {
          const counts = participacionesPorAlumno(state)
          const filledDancers = state.dancers.filter(d => d.name.trim().length > 0)
          const freeEntries = Math.floor(filledDancers.length / DANCERS_POR_ENTRADA_GRATIS)
          const assistants = state.coach.assistants.filter(a => a.trim())
          const paidAssistants = Math.max(0, assistants.length - freeEntries)
          let participaciones = 0, repeticiones = 0
          counts.forEach(n => { if (n >= 1) { participaciones++; repeticiones += n - 1 } })
          const totalDancers = participaciones * PRECIO_PARTICIPACION + repeticiones * PRECIO_REPETICION
          const totalAsistentes = paidAssistants * PRECIO_ASISTENTE
          const totalEntradas = (state.ticketsCount ?? 0) * PRECIO_ENTRADA
          const total = totalDancers + totalAsistentes + totalEntradas
          return (
            <div className="mt-3 sm:mt-4 px-0 sm:px-0">
              <div className="bg-[rgb(var(--c-surface))] rounded-none sm:rounded-3xl border-t sm:border border-[rgb(var(--c-border)/0.4)] shadow-none sm:shadow-sm overflow-hidden">
                <div className="p-3.5 sm:p-5">
                  <h3 className="font-display text-lg tracking-widest text-[rgb(var(--c-primary))] mb-4 border-b border-[rgb(var(--c-border)/0.25)] pb-2">
                    DESGLOSE DE COSTOS
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-[rgb(var(--c-text))]">Participaciones <span className="text-[rgb(var(--c-text)/0.5)] text-xs">({participaciones} × {formatMoney(PRECIO_PARTICIPACION)})</span></span>
                      <span className="font-bold text-[rgb(var(--c-text-strong))]">{formatMoney(participaciones * PRECIO_PARTICIPACION)}</span>
                    </div>
                    {repeticiones > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-[rgb(var(--c-text))]">Repeticiones <span className="text-[rgb(var(--c-text)/0.5)] text-xs">({repeticiones} × {formatMoney(PRECIO_REPETICION)})</span></span>
                        <span className="font-bold text-[rgb(var(--c-text-strong))]">{formatMoney(repeticiones * PRECIO_REPETICION)}</span>
                      </div>
                    )}
                    {assistants.length > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-[rgb(var(--c-text))]">
                          Asistentes <span className="text-[rgb(var(--c-text)/0.5)] text-xs">({paidAssistants} × {formatMoney(PRECIO_ASISTENTE)}{freeEntries > 0 ? `, ${freeEntries} gratis` : ''})</span>
                        </span>
                        <span className="font-bold text-[rgb(var(--c-text-strong))]">{formatMoney(totalAsistentes)}</span>
                      </div>
                    )}
                    {(state.ticketsCount ?? 0) > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-[rgb(var(--c-text))]">Entradas para Acompañantes <span className="text-[rgb(var(--c-text)/0.5)] text-xs">({state.ticketsCount} × {formatMoney(PRECIO_ENTRADA)})</span></span>
                        <span className="font-bold text-[rgb(var(--c-text-strong))]">{formatMoney(totalEntradas)}</span>
                      </div>
                    )}
                    {freeEntries > 0 && (
                      <p className="text-[10px] text-[rgb(var(--c-success-strong))] bg-[rgb(var(--c-success)/0.08)] border border-[rgb(var(--c-success)/0.2)] rounded-xl px-3 py-1.5 font-medium">
                        🎉 {freeEntries} entrada{freeEntries > 1 ? 's' : ''} de asistente gratis por tener {filledDancers.length} integrantes
                      </p>
                    )}
                    <div className="flex justify-between items-center border-t border-[rgb(var(--c-border)/0.4)] pt-3 mt-3">
                      <span className="font-display text-base tracking-widest text-[rgb(var(--c-text-strong))]">TOTAL ESTIMADO</span>
                      <span className="font-display text-2xl text-[rgb(var(--c-primary))] font-bold">{formatMoney(total)}</span>
                    </div>
                    <p className="text-[10px] text-[rgb(var(--c-text)/0.45)] text-center pt-1">Precio estimado · sujeto a confirmación por los organizadores</p>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

      </div>

      {/* FLOATING ACTION BAR FOR CONFIRM / SAVE */}
      <div 
        className={`shrink-0 bg-[rgb(var(--c-surface))] border-t border-[rgb(var(--c-border)/0.7)] shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-20 rounded-t-3xl mt-2 ${
          confirmed ? 'p-3 pb-1 md:p-5' : 'p-4 md:p-5 hidden lg:block'
        }`}
        style={{ 
          paddingBottom: confirmed 
            ? 'calc(env(safe-area-inset-bottom, 0px) + 2px)' 
            : 'calc(env(safe-area-inset-bottom, 0px) + 8px)' 
        }}
      >
        <div className="max-w-4xl mx-auto w-full">
          {saveErr && (
            <p className="text-[rgb(var(--c-primary))] text-xs bg-[rgb(var(--c-primary)/0.05)] border border-[rgb(var(--c-primary)/0.2)] rounded-xl px-4 py-2.5 mb-3 text-center font-bold">{saveErr}</p>
          )}
          {confirmed ? (
            <div className="space-y-3">
              <button
                onClick={startEdit}
                className="w-full h-12 md:h-14 flex items-center justify-center gap-3 bg-[rgb(var(--c-surface))] border-2 border-[rgb(var(--c-border))] hover:bg-[rgb(var(--c-surface-2))] text-[rgb(var(--c-text-strong))] font-display text-base tracking-widest rounded-2xl transition-all shadow-sm active:scale-[0.98] duration-150 font-bold"
              >
                <Pencil className="w-4 h-4 text-[rgb(var(--c-primary))]" /> MODIFICAR REGISTRO
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                onClick={() => goToStep({ kind: 'setup' })}
                className="w-full h-14 flex items-center justify-center gap-2 bg-[rgb(var(--c-surface))] border-2 border-[rgb(var(--c-border))] hover:bg-[rgb(var(--c-surface-2))] text-[rgb(var(--c-text-strong))] font-display text-sm tracking-widest rounded-2xl transition-all active:scale-[0.98] duration-150 md:col-span-1 font-semibold"
              >
                <Pencil className="w-4 h-4 text-[rgb(var(--c-primary))]" /> CORREGIR DATOS
              </button>
              <button
                onClick={confirm}
                disabled={saving}
                className="w-full h-14 md:h-16 bg-gradient-to-r from-[#16A34A] via-[#82f606] to-[#fff200] hover:brightness-105 active:brightness-95 text-[rgb(var(--c-text-strong))] font-display text-lg tracking-widest rounded-2xl disabled:opacity-50 disabled:pointer-events-none transition-all shadow-lg active:scale-[0.98] duration-150 md:col-span-2 font-bold"
              >
                {saving ? 'GUARDANDO…' : editMode ? 'GUARDAR CAMBIOS' : 'CONFIRMAR REGISTRO'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function extractErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object') {
    const obj = e as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
    if (typeof obj.details === 'string') return obj.details
    if (typeof obj.hint === 'string') return obj.hint
    try { return JSON.stringify(e) } catch { /* ignore */ }
  }
  return String(e ?? 'Error desconocido')
}
