'use client'
import { useEffect, useState, use, useCallback } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Check, Plus, Trash2, Pencil, MessageCircle, Info, X, ChevronDown, Sparkles, Users, Clipboard, HeartHandshake, School } from 'lucide-react'
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
  teamName: string
  teamSize: number | null
  dancers: Dancer[]
  actCount: number | null
  acts: Act[]
  costPaquete: number | null
  costRepeticion: number | null
  confirmedRegistrationId: number | null
}

type Step =
  | { kind: 'welcome' }
  | { kind: 'setup' }
  | { kind: 'dancers' }
  | { kind: 'acts' }
  | { kind: 'summary' }
  | { kind: 'confirmed' }

const STYLES = ['Jazz', 'Poms', 'Acro Jazz', 'Hip Hop', 'Show', 'Ballet', 'Contempo']

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
    teamName: '',
    teamSize: 0,
    dancers: [],
    actCount: 0,
    acts: [],
    costPaquete: 1000,
    costRepeticion: 300,
    confirmedRegistrationId: null,
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

function costoTotal(state: State): number {
  const paq = state.costPaquete ?? 1000
  const rep = state.costRepeticion ?? 300
  const counts = participacionesPorAlumno(state)
  let total = 0
  counts.forEach(n => {
    if (n >= 1) total += paq
    if (n > 1) total += (n - 1) * rep
  })
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
  const parts = dancer.name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'SIN NOMBRE'
  const firstName = parts[0]
  const hasDuplicate = allDancers.some((other, idx) => {
    if (idx === index) return false
    const otherParts = other.name.trim().split(/\s+/).filter(Boolean)
    return otherParts.length > 0 && otherParts[0].toLowerCase() === firstName.toLowerCase()
  })
  if (hasDuplicate && parts.length > 1) {
    return `${firstName} ${parts[1]}`.toUpperCase()
  }
  return firstName.toUpperCase()
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

  // Smart Paste Modal State
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')

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
            saved.costPaquete = 1000
          }
          if (saved.costRepeticion === null) {
            saved.costRepeticion = 300
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
      if (vv && typeof window !== 'undefined') {
        document.documentElement.style.setProperty('--viewport-height', `${vv.height}px`)
      }
      const keyboardActive = checkKeyboard()
      setIsKeyboardOpen(keyboardActive)
      if (keyboardActive && typeof window !== 'undefined' && window.scrollY !== 0) {
        window.scrollTo(0, 0)
      }
    }

    const handleWindowScroll = () => {
      const keyboardActive = checkKeyboard()
      if (keyboardActive && typeof window !== 'undefined' && window.scrollY !== 0) {
        window.scrollTo(0, 0)
      }
    }

    const handleFocusIn = () => {
      updateHeight()
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.scrollY !== 0) {
          window.scrollTo(0, 0)
        }
      }, 50)
    }

    const handleFocusOut = () => {
      setTimeout(() => {
        updateHeight()
      }, 50)
    }

    if (vv) {
      vv.addEventListener('resize', updateHeight)
      vv.addEventListener('scroll', updateHeight)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('scroll', handleWindowScroll, { passive: true })
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
    setState(s => {
      const dancers = [...s.dancers]
      dancers[i] = { ...dancers[i], ...patch }
      return { ...s, dancers, teamSize: dancers.length }
    })
  }

  function addDancer() {
    setState(s => {
      const dancers = [...s.dancers, { name: '', birthdate: '', categoryOverride: null }]
      return { ...s, dancers, teamSize: dancers.length }
    })
  }

  function removeDancer(i: number) {
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
    setState(s => {
      const acts = [...s.acts]
      acts[i] = { ...acts[i], ...patch }
      return { ...s, acts }
    })
  }

  function addAct() {
    setState(s => {
      const acts = [...s.acts, { modality: null, ageCategory: null, level: null, style: null, dancerIndices: [] }]
      return { ...s, acts, actCount: acts.length }
    })
  }

  function removeAct(i: number) {
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
        ...state.coach.assistants.map(a => `Asistente: ${a.trim()}`).filter(a => a !== 'Asistente:')
      ]

      const regPayload = {
        event_id: event.id,
        coach_name: state.coach.name.trim(),
        coach_phone: state.coach.phone.trim(),
        coach_email: state.coach.email.trim() || null,
        extra_coaches: extrasMerged,
        academy: state.academy.trim(),
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
      style={{ height: 'var(--viewport-height, 100dvh)' }}
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
        html, body {
          background-color: rgb(var(--c-surface)) !important;
          overflow: hidden !important;
          position: fixed !important;
          width: 100% !important;
          height: 100% !important;
          left: 0 !important;
          top: 0 !important;
        }
      ` }} />
      <meta name="theme-color" content="#F6F4EF" />

      <main
        className="flex-1 min-h-0 px-0 sm:px-4 lg:px-8 flex flex-col overflow-y-auto lg:overflow-hidden"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)'
        }}
      >
        {/* DESKTOP HEADER */}
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

        {/* STEP STATUS INDICATOR (iOS Tab Style) */}
        {!isKeyboardOpen && !isFirstStep && step.kind !== 'confirmed' && (
          <div className="shrink-0 flex justify-center pt-0.5 pb-2 sm:py-3 px-4 sm:px-0">
            <div className="bg-[rgb(var(--c-surface-2))] p-1 rounded-2xl flex gap-1 w-full max-w-xl shadow-inner border border-[rgb(var(--c-border)/0.3)]">
              {[
                { label: 'COACH', kind: 'setup' },
                { label: 'ALUMNOS', kind: 'dancers' },
                { label: 'ACTOS', kind: 'acts' },
                { label: 'CONFIRMAR', kind: 'summary' }
              ].map((tab, idx) => {
                const isCurrent = step.kind === tab.kind
                return (
                  <button
                    key={tab.kind}
                    disabled={true} // Read-only progress bar
                    className={`flex-1 py-2 text-center font-display tracking-widest text-xs rounded-xl transition-all duration-300 font-bold ${
                      isCurrent
                        ? 'bg-[rgb(var(--c-primary))] text-white shadow-md scale-105'
                        : 'text-[rgb(var(--c-text)/0.5)]'
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
          <div className={`w-full ${step.kind === 'summary' || step.kind === 'confirmed' || step.kind === 'dancers' ? 'max-w-6xl' : 'max-w-3xl'} min-h-full lg:h-full flex flex-col justify-start lg:justify-center ${isKeyboardOpen ? 'pt-[1vh] lg:pt-3' : 'pt-0 sm:pt-2 lg:pt-0'} min-h-0`}>
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
            />
          </div>
        </div>
      </main>

      {/* MOBILE BOTTOM NAV BAR (iOS native feel) */}
      {!isKeyboardOpen && !isFirstStep && step.kind !== 'confirmed' && (
        <div
          className="shrink-0 lg:hidden bg-[rgb(var(--c-surface)/0.96)] backdrop-blur flex items-center justify-between px-5 py-3 border-t border-[rgb(var(--c-border)/0.5)] z-40"
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
                  {count} {count === 1 ? 'Alumno' : 'Alumnos'}
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
            <button
              onClick={goNext}
              disabled={
                step.kind === 'setup' && (state.coach.name.trim().length < 2 || state.coach.phone.trim().length < 8 || state.academy.trim().length < 2)
                || step.kind === 'dancers' && (state.dancers.length === 0 || state.dancers.some(d => d.name.trim().length < 2 || d.birthdate.length !== 10))
                || step.kind === 'acts' && (state.acts.length === 0 || state.acts.some(a => !a.modality || !a.style || a.dancerIndices.length === 0))
              }
              className="flex items-center gap-1 text-[rgb(var(--c-text-strong))] bg-gradient-to-r from-[#16A34A] via-[#82f606] to-[#fff200] hover:brightness-105 font-display font-bold text-sm px-4 py-2.5 rounded-2xl disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all duration-150 shadow-md"
            >
              SIGUIENTE
            </button>
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
                <h3 className="font-display text-xl text-[rgb(var(--c-text-strong))]">PEGADO INTELIGENTE</h3>
              </div>
              <button onClick={() => setIsPasteModalOpen(false)} className="text-[rgb(var(--c-text)/0.6)] active:scale-95 p-1 rounded-full hover:bg-[rgb(var(--c-surface-2))]">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <p className="text-xs text-[rgb(var(--c-text))] leading-relaxed">
              Copia y pega la lista de alumnos desde WhatsApp o Excel. Detectamos nombres y fechas de nacimiento automáticamente.
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
              className="w-full inline-flex items-center justify-center gap-2 bg-[rgb(var(--c-primary)/0.08)] hover:bg-[rgb(var(--c-primary)/0.12)] text-[rgb(var(--c-primary))] border border-[rgb(var(--c-primary)/0.25)] py-3 px-4 rounded-2xl font-display text-sm tracking-wider font-bold shadow-sm active:scale-95 transition-all duration-150 shrink-0"
            >
              <Clipboard className="w-4 h-4" /> PEGAR DESDE EL PORTAPAPELES
            </button>

            <div className="relative shrink-0 flex items-center justify-center py-1">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[rgb(var(--c-border)/0.4)]" /></div>
              <span className="relative bg-[rgb(var(--c-surface))] px-3 text-[10px] text-[rgb(var(--c-text)/0.5)] font-semibold uppercase tracking-wider">o pega manualmente abajo</span>
            </div>

            <div className="flex-1 min-h-0 flex flex-col">
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Pega la lista aquí..."
                className="w-full flex-1 min-h-[150px] bg-white border border-[rgb(var(--c-border))] rounded-2xl p-4 text-sm font-sans outline-none focus:ring-1 focus:ring-[rgb(var(--c-primary))] focus:border-[rgb(var(--c-primary))] resize-none shadow-inner"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 shrink-0 pt-2">
              <button
                onClick={() => setIsPasteModalOpen(false)}
                className="py-3 bg-white border border-[rgb(var(--c-border))] text-[rgb(var(--c-text-strong))] font-display text-base tracking-widest rounded-2xl active:scale-95 duration-150 transition-all font-semibold"
              >
                CANCELAR
              </button>
              <button
                onClick={() => handleSmartPaste(pasteText)}
                disabled={pasteText.trim().length === 0}
                className="py-3 bg-gradient-to-r from-[#16A34A] via-[#82f606] to-[#fff200] text-[rgb(var(--c-text-strong))] font-display text-base tracking-widest rounded-2xl active:scale-95 duration-150 transition-all disabled:opacity-40 font-bold"
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
}) {
  const { step, state, event, editMode, onNext, goToStep, updateCoach, updateState, updateDancer, addDancer, removeDancer, onOpenSmartPaste, updateAct, addAct, removeAct, confirm, saving, saveErr, startEdit } = props
  const [activeActIndex, setActiveActIndex] = useState<number | null>(0)

  switch (step.kind) {
    case 'welcome': {
      const eventCity = event?.name?.replace(/dance4ever/gi, '').replace(/\d{4}/g, '').trim() || 'Guadalajara'
      const regDeadline = event?.date ? getRegistrationDeadline(event.date) : '15 días antes'
      const chgDeadline = event?.date ? getChangesDeadline(event.date) : '7 días antes'
      return (
        <div className="flex flex-col items-center justify-center text-center space-y-6 max-w-xl mx-auto py-4 my-auto lg:my-0" style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <Image src="/logo.png" alt="Dance4ever" width={160} height={120} priority className="mix-blend-multiply active:scale-95 transition-all duration-150" />
          <div className="space-y-2">
            <p className="font-sans text-xs tracking-widest text-[rgb(var(--c-primary))] font-bold">SISTEMA DE REGISTRO REDISEÑADO</p>
            <h2 className="font-sans text-3xl lg:text-4xl text-[rgb(var(--c-text-strong))] font-semibold tracking-tight uppercase">{event?.name || 'EVENTO'}</h2>
            {event?.date && (
              <p className="font-sans text-lg lg:text-xl text-[rgb(var(--c-text-strong))] font-medium">{eventCity} · {formatEventDate(event.date)}</p>
            )}
          </div>

          <div className="w-full bg-white border border-[rgb(var(--c-border)/0.5)] rounded-3xl p-6 space-y-4 text-left shadow-sm">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[10px] font-sans text-[rgb(var(--c-text)/0.6)] font-bold uppercase tracking-wider">FECHA LÍMITE DE REGISTRO</p>
                <p className="text-base text-[rgb(var(--c-primary))] font-bold mt-0.5">{regDeadline}</p>
              </div>
              <div className="h-8 w-px bg-[rgb(var(--c-border)/0.3)]" />
              <div>
                <p className="text-[10px] font-sans text-[rgb(var(--c-text)/0.6)] font-bold uppercase tracking-wider">FECHA LÍMITE PARA CAMBIOS</p>
                <p className="text-base text-[rgb(var(--c-primary))] font-bold mt-0.5">{chgDeadline}</p>
              </div>
            </div>
            <div className="h-px bg-[rgb(var(--c-border)/0.3)]" />
            <div className="flex items-center gap-2.5 text-[rgb(var(--c-success-strong))] font-medium text-xs">
              <Sparkles className="w-4 h-4 text-[rgb(var(--c-primary))] shrink-0" />
              <span>Flujo de 3 pasos simplificado y optimizado para celular</span>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-[rgb(var(--c-primary)/0.05)] border border-[rgb(var(--c-primary)/0.2)] text-[rgb(var(--c-text-strong))] px-5 py-4 rounded-2xl text-left">
            <Info className="w-5 h-5 shrink-0 mt-0.5 text-[rgb(var(--c-primary))]" />
            <p className="text-xs lg:text-sm leading-snug">
              <strong>Atención:</strong> Por favor, ingresa los datos correspondientes. Al finalizar, podrás revisar los datos y confirmar el registro.
            </p>
          </div>

          <button
            onClick={onNext}
            className="w-full bg-[rgb(var(--c-primary))] active:bg-[rgb(var(--c-primary-strong))] hover:bg-[rgb(var(--c-primary-strong))] text-white font-display text-xl tracking-widest py-4 rounded-2xl transition-all shadow-md active:scale-[0.98] duration-150 font-bold"
          >
            COMENZAR REGISTRO
          </button>
        </div>
      )
    }

    case 'setup': {
      const isCoachValid = state.coach.name.trim().length >= 2 && state.coach.phone.trim().length >= 8
      const isAcademyValid = state.academy.trim().length >= 2
      const isValid = isCoachValid && isAcademyValid

      return (
        <div className="space-y-3.5 py-1 sm:space-y-5 sm:py-2 overflow-y-auto max-h-[80vh] px-0 sm:px-1" style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <div className="text-center lg:text-left space-y-1 px-4 sm:px-0">
            <h2 className="font-display text-3xl lg:text-4xl text-[rgb(var(--c-text-strong))]">Paso 1: Coach y Academia</h2>
            <p className="text-sm text-[rgb(var(--c-text))]">Completa tu información organizativa general</p>
          </div>

          <div className="grid lg:grid-cols-2 gap-3.5 sm:gap-5">
            {/* COACH CARD */}
            <div className="bg-white border-y sm:border border-[rgb(var(--c-border)/0.4)] rounded-none sm:rounded-3xl p-3.5 sm:p-6 shadow-none sm:shadow-sm space-y-3">
              <h3 className="font-display text-xl text-[rgb(var(--c-primary))] flex items-center gap-2 border-b border-[rgb(var(--c-border)/0.2)] pb-2">
                <Users className="w-5 h-5" /> COACH PRINCIPAL
              </h3>
              <div className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] mb-1">NOMBRE COMPLETO</label>
                  <input
                    type="text"
                    value={state.coach.name}
                    onChange={e => updateCoach({ name: e.target.value })}
                    placeholder="Nombre del coach principal"
                    className="w-full bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.6)] text-[rgb(var(--c-text-strong))] rounded-2xl px-4 py-3 outline-none focus:border-[rgb(var(--c-primary))] focus:ring-1 focus:ring-[rgb(var(--c-primary))] transition-all text-sm"
                    autoCapitalize="words"
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
                      placeholder="Números sin espacios"
                      className="w-full bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.6)] text-[rgb(var(--c-text-strong))] rounded-2xl px-4 py-3 outline-none focus:border-[rgb(var(--c-primary))] focus:ring-1 focus:ring-[rgb(var(--c-primary))] transition-all text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] mb-1">CORREO ELECTRÓNICO (OPCIONAL)</label>
                    <input
                      type="email"
                      value={state.coach.email}
                      onChange={e => updateCoach({ email: e.target.value })}
                      placeholder="correo@ejemplo.com"
                      className="w-full bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.6)] text-[rgb(var(--c-text-strong))] rounded-2xl px-4 py-3 outline-none focus:border-[rgb(var(--c-primary))] focus:ring-1 focus:ring-[rgb(var(--c-primary))] transition-all text-sm"
                      autoCapitalize="off"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ACADEMY CARD */}
            <div className="bg-white border-y sm:border border-[rgb(var(--c-border)/0.4)] rounded-none sm:rounded-3xl p-3.5 sm:p-6 shadow-none sm:shadow-sm space-y-3">
              <h3 className="font-display text-xl text-[rgb(var(--c-primary))] flex items-center gap-2 border-b border-[rgb(var(--c-border)/0.2)] pb-2">
                <School className="w-5 h-5" /> ACADEMIA Y EQUIPO
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] mb-1">NOMBRE DE LA ACADEMIA / COLEGIO</label>
                  <input
                    type="text"
                    value={state.academy}
                    onChange={e => updateState(s => ({ ...s, academy: e.target.value }))}
                    placeholder="Ej. Escuela de Danza Ritmo"
                    className="w-full bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.6)] text-[rgb(var(--c-text-strong))] rounded-2xl px-4 py-3 outline-none focus:border-[rgb(var(--c-primary))] focus:ring-1 focus:ring-[rgb(var(--c-primary))] transition-all text-sm"
                    autoCapitalize="sentences"
                  />
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
          <div className="bg-white border-y sm:border border-[rgb(var(--c-border)/0.4)] rounded-none sm:rounded-3xl p-3.5 sm:p-6 shadow-none sm:shadow-sm space-y-3.5 sm:space-y-5">
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
                  <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
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
                  <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
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

          <div className="hidden lg:block pt-3">
            <button
              onClick={onNext}
              disabled={!isValid}
              className="w-full bg-gradient-to-r from-[#16A34A] via-[#82f606] to-[#fff200] hover:brightness-105 active:brightness-95 text-[rgb(var(--c-text-strong))] font-display text-xl tracking-widest py-4 rounded-2xl transition-all shadow-md active:scale-[0.98] duration-150 font-bold disabled:opacity-40 disabled:pointer-events-none"
            >
              CONTINUAR AL PASO 2: ALUMNOS
            </button>
          </div>
        </div>
      )
    }

    case 'dancers': {
      const isAllValid = state.dancers.length > 0 && state.dancers.every(d => d.name.trim().length >= 2 && d.birthdate.length === 10)

      return (
        <div className="space-y-3 py-1 sm:space-y-4 overflow-y-auto max-h-[82vh] px-0 sm:px-1 flex flex-col h-full min-h-0" style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <div className="shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 sm:px-0">
            <div className="text-center md:text-left space-y-0.5">
              <h2 className="font-display text-3xl text-[rgb(var(--c-text-strong))]">Paso 2: Registro de Alumnos</h2>
              <p className="text-xs text-[rgb(var(--c-text))]">Ingresa los bailarines. La edad y categoría se calculan automáticamente.</p>
            </div>
            
            <div className="flex gap-2 justify-center shrink-0">
              <button
                type="button"
                onClick={onOpenSmartPaste}
                className="inline-flex items-center gap-1.5 bg-white border border-[rgb(var(--c-primary)/0.4)] text-[rgb(var(--c-primary))] px-4 py-2.5 rounded-2xl font-display text-sm tracking-wider font-bold shadow-sm active:scale-95 active:bg-[rgb(var(--c-surface-2))] transition-all duration-150"
              >
                <Clipboard className="w-4 h-4 text-[rgb(var(--c-primary))]" /> PEGAR LISTA
              </button>
              <button
                type="button"
                onClick={addDancer}
                className="inline-flex items-center gap-1 bg-[rgb(var(--c-primary))] hover:bg-[rgb(var(--c-primary-strong))] text-white px-4 py-2.5 rounded-2xl font-display text-sm tracking-wider font-bold shadow-sm active:scale-95 transition-all duration-150"
              >
                <Plus className="w-4 h-4" /> AGREGAR FILA
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto bg-white border-y sm:border border-[rgb(var(--c-border)/0.4)] rounded-none sm:rounded-3xl shadow-none sm:shadow-sm p-3 sm:p-6">
            {state.dancers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                <div className="p-4 bg-[rgb(var(--c-primary)/0.05)] rounded-full text-[rgb(var(--c-primary))]">
                  <Users className="w-12 h-12" />
                </div>
                <div>
                  <h4 className="font-display text-xl text-[rgb(var(--c-text-strong))]">Sin alumnos registrados</h4>
                  <p className="text-xs text-[rgb(var(--c-text)/0.7)] mt-1 max-w-xs mx-auto">
                    {'Usa el botón "Agregar Fila" para escribir un nombre, o "Pegar Lista" para cargar desde WhatsApp.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {state.dancers.map((d, i) => {
                  const compCat = categoryFromBirthdate(d.birthdate)
                  const age = ageFromBirthdate(d.birthdate)
                  const isDancerValid = d.name.trim().length >= 2 && d.birthdate.length === 10

                  return (
                    <div
                      key={`dancer-${i}`}
                      className={`border rounded-2xl p-2.5 md:py-3 md:px-5 flex flex-col md:flex-row items-stretch md:items-center gap-3 md:gap-4 transition-all duration-200 animate-[fadeIn_0.2s_ease-out_forwards] ${
                        isDancerValid ? 'bg-[rgb(var(--c-surface)/0.25)] border-[rgb(var(--c-border)/0.3)]' : 'bg-[rgb(var(--c-primary)/0.02)] border-[rgb(var(--c-primary)/0.15)]'
                      }`}
                    >
                      {/* Row number indicator */}
                      <div className="shrink-0 flex items-center justify-between md:justify-start">
                        <span className="font-display text-lg text-[rgb(var(--c-primary)/0.6)] w-6 text-center">{i + 1}.</span>
                        <button
                          type="button"
                          onClick={() => removeDancer(i)}
                          className="md:hidden text-[rgb(var(--c-primary))] hover:text-red-600 active:scale-95 transition-all p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Name input */}
                      <div className="flex-1">
                        <input
                          type="text"
                          value={d.name}
                          onChange={e => updateDancer(i, { name: e.target.value })}
                          placeholder="Nombre completo del bailarín"
                          className="w-full bg-white border border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] rounded-xl px-3 py-2.5 text-xs outline-none focus:border-[rgb(var(--c-primary))] transition-all font-semibold"
                          autoCapitalize="words"
                        />
                      </div>

                      {/* Date input */}
                      <div className="shrink-0 w-full min-w-0 md:w-[150px]">
                        <input
                          type={d.birthdate ? "date" : "text"}
                          value={d.birthdate}
                          onChange={e => updateDancer(i, { birthdate: e.target.value })}
                          placeholder="Fecha de nacimiento"
                          onFocus={e => (e.target.type = "date")}
                          onBlur={e => { if (!d.birthdate) e.target.type = "text" }}
                          className="w-full min-w-0 bg-white border border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] rounded-xl px-3 py-2.5 text-xs outline-none focus:border-[rgb(var(--c-primary))] transition-all font-semibold text-center [appearance:none] [-webkit-appearance:none]"
                        />
                      </div>

                      {/* Category in vivo feedback */}
                      <div className="shrink-0 w-full min-w-0 md:w-[180px] flex items-center justify-between md:justify-start gap-2">
                        <div className="flex-1 min-w-0">
                          <select
                            value={d.categoryOverride ?? ''}
                            onChange={e => updateDancer(i, { categoryOverride: (e.target.value || null) as AgeCategory | null })}
                            className={`w-full min-w-0 bg-white border border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] rounded-xl px-2 py-2.5 text-xs outline-none font-display font-bold text-center [appearance:none] [-webkit-appearance:none] ${
                              d.categoryOverride ? 'text-[rgb(var(--c-primary))] bg-[rgb(var(--c-primary)/0.03)] border-[rgb(var(--c-primary)/0.3)]' : ''
                            }`}
                          >
                            <option value="">Auto: {compCat ? AGE_CATEGORY_LABELS[compCat] : '—'}</option>
                            {AGE_CATEGORY_ORDER.map(cat => (
                              <option key={cat} value={cat}>{AGE_CATEGORY_LABELS[cat]}</option>
                            ))}
                          </select>
                        </div>

                        {age !== null && (
                          <span className="shrink-0 text-[10px] font-bold text-[rgb(var(--c-text)/0.75)] bg-[rgb(var(--c-surface-2))] border border-[rgb(var(--c-border)/0.3)] px-2.5 py-2 rounded-xl text-center min-w-[55px] font-mono leading-none">
                            {age} Años
                          </span>
                        )}
                      </div>

                      {/* Desktop Delete button */}
                      <button
                        type="button"
                        onClick={() => removeDancer(i)}
                        className="hidden md:block shrink-0 text-[rgb(var(--c-text)/0.4)] hover:text-[rgb(var(--c-primary))] hover:bg-[rgb(var(--c-primary)/0.05)] p-2 rounded-xl active:scale-95 transition-all duration-150"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="hidden lg:block shrink-0 pt-2">
            <button
              onClick={onNext}
              disabled={!isAllValid}
              className="w-full bg-gradient-to-r from-[#16A34A] via-[#82f606] to-[#fff200] hover:brightness-105 active:brightness-95 text-[rgb(var(--c-text-strong))] font-display text-xl tracking-widest py-4 rounded-2xl transition-all shadow-md active:scale-[0.98] duration-150 font-bold disabled:opacity-40 disabled:pointer-events-none"
            >
              CONTINUAR AL PASO 3: REGISTRO DE ACTOS ({state.dancers.length} Alumnos)
            </button>
          </div>
        </div>
      )
    }

    case 'acts': {
      const isAllValid = state.acts.length > 0 && state.acts.every(a => a.modality && a.style && a.dancerIndices.length >= minDancers(a.modality))

      const handleCreateAct = () => {
        addAct()
        setActiveActIndex(state.acts.length)
      }

      return (
        <div className="space-y-4 py-2 overflow-y-auto max-h-[82vh] px-0 sm:px-1 flex flex-col h-full min-h-0" style={{ animation: 'fadeIn 0.3s ease-out' }}>
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

          <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
            {state.acts.length === 0 ? (
              <div className="bg-white border border-[rgb(var(--c-border)/0.5)] rounded-3xl p-16 text-center space-y-4 shadow-sm mx-4 sm:mx-0">
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
              state.acts.map((act, i) => {
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
                    className={`bg-white border-y sm:border rounded-none sm:rounded-3xl shadow-none sm:shadow-sm overflow-hidden transition-all duration-200 ${
                      isOpen ? 'ring-1 ring-[rgb(var(--c-primary))] border-[rgb(var(--c-primary))]' : 'border-y border-[rgb(var(--c-border)/0.4)] sm:border-[rgb(var(--c-border)/0.5)] hover:border-[rgb(var(--c-border))]'
                    }`}
                  >
                    {/* Header Acordeón */}
                    <div
                      onClick={() => setActiveActIndex(isOpen ? null : i)}
                      className={`px-5 py-4 flex items-center justify-between cursor-pointer active:bg-[rgb(var(--c-surface))] transition-all ${
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
                      <div className="p-4 sm:p-5 border-t border-[rgb(var(--c-border)/0.25)] bg-[rgb(var(--c-surface)/0.15)] space-y-5 animate-[fadeIn_0.25s_ease-out_forwards]">
                        {/* 1. Modalidad */}
                        <div className="space-y-1.5">
                          <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] uppercase">{modalityNum}. Selecciona la Modalidad</label>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                            {MODALITY_OPTIONS.map(opt => {
                              const isSelected = act.modality === opt.value
                              return (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => {
                                    const cleanedDancers = act.dancerIndices.slice(0, maxDancers(opt.value))
                                    updateAct(i, {
                                      modality: opt.value,
                                      dancerIndices: cleanedDancers,
                                      level: opt.value === 'grupal' ? act.level : null
                                    })
                                  }}
                                  className={`py-2 px-3 rounded-xl font-display text-sm tracking-wider font-bold transition-all border active:scale-95 duration-150 ${
                                    isSelected
                                      ? 'bg-[rgb(var(--c-primary))] border-[rgb(var(--c-primary))] text-white shadow-sm'
                                      : 'bg-white border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] hover:bg-[rgb(var(--c-surface-2))]'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              )
                            })}
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
                                        : 'bg-white border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] hover:bg-[rgb(var(--c-surface-2))]'
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
                          <div className="flex flex-wrap gap-2">
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
                                      : 'bg-white border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] hover:bg-[rgb(var(--c-surface-2))]'
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
                              <p className="text-xs text-[rgb(var(--c-text)/0.6)] italic bg-white border border-[rgb(var(--c-border)/0.3)] rounded-2xl p-4 text-center">
                                Regresa al Paso anterior y registra alumnos primero
                              </p>
                            ) : (
                              <div className="bg-white border border-[rgb(var(--c-border)/0.4)] rounded-2xl p-3 sm:p-4 max-h-[220px] overflow-y-auto space-y-3.5">
                                {/* Group Dancers by calculated ageCategory */}
                                {AGE_CATEGORY_ORDER.map(cat => {
                                  const groupDancers = state.dancers
                                    .map((d, di) => ({ d, di }))
                                    .filter(({ d }) => effectiveCategory(d) === cat)
                                  
                                  if (groupDancers.length === 0) return null

                                  return (
                                    <div key={cat} className="space-y-1.5">
                                      <p className="text-[9px] font-display tracking-[0.2em] font-bold text-[rgb(var(--c-primary)/0.8)] border-b border-[rgb(var(--c-border)/0.15)] pb-0.5 uppercase">
                                        {AGE_CATEGORY_LABELS[cat]} · {AGE_CATEGORY_HINTS[cat]}
                                      </p>
                                      <div className="flex flex-wrap gap-2">
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
                                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-display text-xs tracking-wider transition-all border active:scale-95 duration-100 ${
                                                isSel
                                                  ? 'bg-[rgb(var(--c-primary))] border-[rgb(var(--c-primary))] text-white shadow-sm font-bold'
                                                  : 'bg-[rgb(var(--c-surface))] border-[rgb(var(--c-border)/0.4)] text-[rgb(var(--c-text-strong))] hover:bg-[rgb(var(--c-surface-2))]'
                                              }`}
                                            >
                                              {isSel && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                              <span className="opacity-60 font-sans font-bold text-[9px]">{di + 1}</span>
                                              <span>{getDancerDisplayName(d, di, state.dancers)}</span>
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
              })
            )}
          </div>

          <div className="hidden lg:block shrink-0 pt-2">
            <button
              onClick={onNext}
              disabled={!isAllValid}
              className="w-full bg-gradient-to-r from-[#16A34A] via-[#82f606] to-[#fff200] hover:brightness-105 active:brightness-95 text-[rgb(var(--c-text-strong))] font-display text-xl tracking-widest py-4 rounded-2xl transition-all shadow-md active:scale-[0.98] duration-150 font-bold disabled:opacity-40 disabled:pointer-events-none"
            >
              CONTINUAR A LA REVISIÓN FINAL ({state.acts.length} {state.acts.length === 1 ? 'Acto' : 'Actos'})
            </button>
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
        className="w-full bg-white border border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] text-2xl lg:text-3xl text-center rounded-2xl h-12 lg:h-16 outline-none focus:border-[rgb(var(--c-primary))] focus:ring-1 focus:ring-[rgb(var(--c-primary))] font-display pl-10 lg:pl-12 pr-10 lg:pr-12 placeholder:text-[rgb(var(--c-text)/0.6)] transition-all shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-bold"
      />
    </div>
  )
}

function FullSummary({ state, editMode, confirmed, confirm, saving, saveErr, startEdit, updateState, goToStep }: {
  state: State
  editMode: boolean
  confirmed?: boolean
  confirm?: () => Promise<void>
  saving?: boolean
  saveErr?: string | null
  startEdit?: () => void
  updateState: React.Dispatch<React.SetStateAction<State>>
  goToStep: (s: Step) => void
}) {
  const filledDancers = state.dancers.filter(d => d.name.trim().length > 0)
  const counts = participacionesPorAlumno(state)
  const total = costoTotal(state)
  const hasCosts = state.costPaquete !== null && state.costPaquete >= 0 && state.costRepeticion !== null && state.costRepeticion >= 0

  return (
    <div className="w-full flex flex-col h-full overflow-hidden" style={{ animation: 'fadeIn 0.3s ease-out' }}>
      {confirmed && (
        <div className="shrink-0 bg-[rgb(var(--c-success))] text-white text-center py-4 px-4 shadow-md z-10 rounded-none sm:rounded-2xl mb-4">
          <p className="font-display text-xl md:text-2xl tracking-widest font-bold">¡REGISTRO CONFIRMADO EXITOSAMENTE!</p>
          <p className="text-sm opacity-90 mt-1">Tu información ha sido guardada en nuestro sistema.</p>
        </div>
      )}
      
      <div className="flex-1 overflow-y-auto px-0 sm:px-4 lg:px-6 py-2 sm:py-4 pb-6 sm:pb-28 space-y-6 bg-transparent sm:bg-[rgb(var(--c-surface-2)/0.35)] rounded-none sm:rounded-3xl max-h-[75vh]">
        
        {/* COACH, ACADEMY & STAFF */}
        <div className="bg-white rounded-none sm:rounded-3xl border-y sm:border border-[rgb(var(--c-border)/0.4)] p-4 sm:p-6 shadow-none sm:shadow-sm relative">
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
            <div>
              <p className="text-[10px] tracking-[0.2em] text-[rgb(var(--c-text)/0.6)] font-bold mb-1">COLEGIO / ACADEMIA</p>
              <p className="font-display text-2xl text-[rgb(var(--c-text-strong))] uppercase leading-tight">{state.academy || 'Sin academia'}</p>
              <p className="text-[10px] tracking-[0.2em] text-[rgb(var(--c-text)/0.6)] font-bold mb-1 mt-4">NOMBRE DEL EQUIPO</p>
              <p className="font-display text-2xl text-[rgb(var(--c-success-strong))] uppercase leading-tight">{state.teamName || state.academy || 'Sin equipo'}</p>
            </div>
          </div>
        </div>

        {/* DANCERS SUMMARY */}
        <div className="bg-white rounded-none sm:rounded-3xl border-y sm:border border-[rgb(var(--c-border)/0.4)] p-4 sm:p-6 shadow-none sm:shadow-sm">
          <h3 className="font-display text-lg tracking-widest text-[rgb(var(--c-primary))] mb-4 border-b border-[rgb(var(--c-border)/0.25)] pb-2 flex justify-between items-center">
            <span>ALUMNOS/AS REGISTRADOS</span>
            <div className="flex items-center gap-3">
              <span className="text-[rgb(var(--c-text))] opacity-60 text-xs font-semibold">{filledDancers.length} Integrantes</span>
              {!confirmed && (
                <button onClick={() => goToStep({ kind: 'dancers' })} className="text-xs text-[rgb(var(--c-primary))] hover:underline flex items-center gap-1">
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </button>
              )}
            </div>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3.5">
            {filledDancers.length === 0 ? (
              <p className="text-[rgb(var(--c-text)/0.5)] italic text-sm col-span-full">Sin alumnos</p>
            ) : filledDancers.map((d, di) => {
              const n = counts.get(di) ?? 0
              return (
                <div key={di} className="flex items-center gap-3 border-b border-[rgb(var(--c-border)/0.2)] pb-2 text-xs">
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
        <div className="bg-white rounded-none sm:rounded-3xl border-y sm:border border-[rgb(var(--c-border)/0.4)] p-4 sm:p-6 shadow-none sm:shadow-sm">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {state.acts.length === 0 ? (
              <p className="text-[rgb(var(--c-text)/0.5)] italic text-sm col-span-full">Sin actos registrados</p>
            ) : state.acts.map((a, idx) => {
              const cat = a.ageCategory ? AGE_CATEGORY_LABELS[a.ageCategory] : '—'
              const mod = a.modality ? modalityLabel(a.modality) : '—'
              const lvl = a.modality === 'grupal' ? (a.level === 'basico' ? ' BÁSICO' : a.level === 'avanzado' ? ' AVANZADO' : '') : ''
              return (
                <div key={idx} className="border border-[rgb(var(--c-border)/0.4)] rounded-xl sm:rounded-2xl p-3 sm:p-4 bg-[rgb(var(--c-surface-2)/0.2)] flex flex-col justify-between space-y-3 animate-[fadeIn_0.2s_ease-out_forwards]">
                  <div className="flex items-start gap-3">
                    <div className="font-display text-2xl text-[rgb(var(--c-primary))] shrink-0 font-bold">#{idx + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-lg text-[rgb(var(--c-text-strong))] leading-tight truncate uppercase font-bold">{cat}</p>
                      <p className="font-display text-xs text-[rgb(var(--c-text))] mt-0.5 leading-none">{mod}{lvl} · {a.style ?? '—'}</p>
                    </div>
                  </div>
                  {a.dancerIndices.length > 0 && (
                    <div className="bg-white border border-[rgb(var(--c-border)/0.25)] rounded-xl p-2.5">
                      <p className="text-[9px] font-bold tracking-widest text-[rgb(var(--c-text)/0.5)] mb-1 uppercase">INTEGRANTES ({a.dancerIndices.length})</p>
                      <div className="flex flex-wrap gap-1">
                        {a.dancerIndices.map(di => {
                          const d = state.dancers[di]
                          if (!d) return null
                          return (
                            <span key={di} className="inline-block bg-[rgb(var(--c-surface-2))] text-[rgb(var(--c-text-strong))] text-[10px] px-2 py-0.5 rounded-md font-semibold border border-[rgb(var(--c-border)/0.3)]">
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

      {/* FLOATING ACTION BAR FOR CONFIRM / SAVE */}
      <div 
        className={`shrink-0 bg-white border-t border-[rgb(var(--c-border)/0.7)] shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-20 rounded-t-3xl mt-2 ${
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
            <button
              onClick={startEdit}
              className="w-full h-12 md:h-14 flex items-center justify-center gap-3 bg-white border-2 border-[rgb(var(--c-border))] hover:bg-[rgb(var(--c-surface-2))] text-[rgb(var(--c-text-strong))] font-display text-base tracking-widest rounded-2xl transition-all shadow-sm active:scale-[0.98] duration-150 font-bold"
            >
              <Pencil className="w-4 h-4 text-[rgb(var(--c-primary))]" /> MODIFICAR REGISTRO
            </button>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                onClick={() => goToStep({ kind: 'setup' })}
                className="w-full h-14 flex items-center justify-center gap-2 bg-white border-2 border-[rgb(var(--c-border))] hover:bg-[rgb(var(--c-surface-2))] text-[rgb(var(--c-text-strong))] font-display text-sm tracking-widest rounded-2xl transition-all active:scale-[0.98] duration-150 md:col-span-1 font-semibold"
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
