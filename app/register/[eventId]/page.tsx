'use client'
import { useEffect, useState, use, useCallback } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Check, CheckCircle2, Plus, Trash2, Pencil, MessageCircle, Info, X, Monitor, ChevronDown } from 'lucide-react'
import { supabase, Modality, AgeCategory, Level, Event, AGE_CATEGORY_ORDER, AGE_CATEGORY_LABELS, AGE_CATEGORY_HINTS, categoryFromBirthdate } from '@/lib/supabase'

type Props = { params: Promise<{ eventId: string }> }

type Coach = {
  name: string
  phone: string
  email: string
  extras: string[]
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
  | { kind: 'instruction_1' }
  | { kind: 'instruction_2' }
  | { kind: 'coach_name' }
  | { kind: 'coach_phone' }
  | { kind: 'coach_email' }
  | { kind: 'coach_multi_q' }
  | { kind: 'coach_extras' }
  | { kind: 'academy' }
  | { kind: 'team_name' }
  | { kind: 'team_size' }
  | { kind: 'dancer'; i: number }
  | { kind: 'act_count' }
  | { kind: 'act_modality'; i: number }
  | { kind: 'act_grupal_category'; i: number }
  | { kind: 'act_level'; i: number }
  | { kind: 'act_style'; i: number }
  | { kind: 'act_dancers'; i: number }
  | { kind: 'costs' }
  | { kind: 'summary' }
  | { kind: 'confirmed' }

const STYLES = ['Jazz', 'Poms', 'Acro Jazz', 'Hip Hop', 'Show', 'Ballet', 'Contempo']

const MODALITY_OPTIONS: { value: Modality; label: string }[] = [
  { value: 'solista', label: 'SOLISTA' },
  { value: 'dueto', label: 'DUETO' },
  { value: 'trio', label: 'TRÍO' },
  { value: 'grupal', label: 'GRUPAL' },
]

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function requiredDancers(m: Modality | null): number | null {
  if (m === 'solista') return 1
  if (m === 'dueto') return 2
  if (m === 'trio') return 3
  return null
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

function teamAvgCategory(dancers: Dancer[]): AgeCategory | null {
  const ages = dancers.map(d => ageFromBirthdate(d.birthdate)).filter((a): a is number => a !== null && a >= 0)
  if (ages.length === 0) return null
  const avg = Math.round(ages.reduce((s, a) => s + a, 0) / ages.length)
  // Reuse the same age→category mapping via categoryFromBirthdate with a synthetic date
  const synth = new Date()
  synth.setFullYear(synth.getFullYear() - avg)
  return categoryFromBirthdate(synth.toISOString().slice(0, 10))
}

function neighborCategories(cat: AgeCategory): AgeCategory[] {
  const idx = AGE_CATEGORY_ORDER.indexOf(cat)
  const out: AgeCategory[] = []
  if (idx > 0) out.push(AGE_CATEGORY_ORDER[idx - 1])
  out.push(cat)
  if (idx < AGE_CATEGORY_ORDER.length - 1) out.push(AGE_CATEGORY_ORDER[idx + 1])
  return out
}

function lowestTeamCategory(dancers: Dancer[]): AgeCategory | null {
  const cats = dancers.map(d => effectiveCategory(d)).filter((c): c is AgeCategory => c !== null)
  if (cats.length === 0) return null
  return cats.reduce((lowest, c) => {
    return AGE_CATEGORY_ORDER.indexOf(c) < AGE_CATEGORY_ORDER.indexOf(lowest) ? c : lowest
  }, cats[0])
}

function initialState(): State {
  return {
    coach: { name: '', phone: '', email: '', extras: [] },
    hasMultipleCoaches: null,
    academy: '',
    teamName: '',
    teamSize: null,
    dancers: [],
    actCount: null,
    acts: [],
    costPaquete: null,
    costRepeticion: null,
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
  const paq = state.costPaquete ?? 0
  const rep = state.costRepeticion ?? 0
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

type EditScope =
  | { kind: 'coach' }
  | { kind: 'academy' }
  | { kind: 'dancer'; i: number }
  | { kind: 'act'; i: number }
  | { kind: 'costs' }

const COACH_STEP_KINDS = ['coach_name', 'coach_phone', 'coach_email', 'coach_multi_q', 'coach_extras']
const ACADEMY_STEP_KINDS = ['academy', 'team_name']
const ACT_STEP_KINDS = ['act_modality', 'act_grupal_category', 'act_level', 'act_style', 'act_dancers']

function isOutsideEdit(step: Step, scope: EditScope): boolean {
  switch (scope.kind) {
    case 'coach':
      return !COACH_STEP_KINDS.includes(step.kind)
    case 'academy':
      return !ACADEMY_STEP_KINDS.includes(step.kind)
    case 'dancer':
      if (step.kind !== 'dancer') return true
      return step.i !== scope.i
    case 'act':
      if (!ACT_STEP_KINDS.includes(step.kind)) return true
      if (step.kind === 'act_modality' || step.kind === 'act_grupal_category' || step.kind === 'act_level' || step.kind === 'act_style' || step.kind === 'act_dancers') {
        return step.i !== scope.i
      }
      return true
    case 'costs':
      return step.kind !== 'costs'
  }
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
  const [editScope, setEditScope] = useState<EditScope | null>(null)
  const [editMenu, setEditMenu] = useState<null | 'main' | 'pick_dancer' | 'pick_act'>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [isLargeScreen, setIsLargeScreen] = useState<boolean | null>(null)
  const [mobileSheet, setMobileSheet] = useState<null | 'dancers'>(null)
  const [mobileSummaryTab, setMobileSummaryTab] = useState<'coach' | 'academy' | 'dancers' | 'acts'>('coach')
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false)
  const [showSuccessSplash, setShowSuccessSplash] = useState(false)

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

    const vv = window.visualViewport
    if (!vv) return
    const updateHeight = () => {
      document.documentElement.style.setProperty('--viewport-height', `${vv.height}px`)
      const keyboardActive = vv.height < window.innerHeight * 0.85
      setIsKeyboardOpen(keyboardActive)
      if (keyboardActive && window.scrollY !== 0) {
        window.scrollTo(0, 0)
      }
    }
    const handleWindowScroll = () => {
      const keyboardActive = vv ? vv.height < window.innerHeight * 0.85 : false
      if (keyboardActive && window.scrollY !== 0) {
        window.scrollTo(0, 0)
      }
    }
    const handleFocusIn = () => {
      setTimeout(() => {
        if (window.scrollY !== 0) {
          window.scrollTo(0, 0)
        }
      }, 50)
    }
    vv.addEventListener('resize', updateHeight)
    vv.addEventListener('scroll', updateHeight)
    window.addEventListener('scroll', handleWindowScroll, { passive: true })
    document.addEventListener('focusin', handleFocusIn)
    updateHeight()
    return () => {
      vv.removeEventListener('resize', updateHeight)
      vv.removeEventListener('scroll', updateHeight)
      window.removeEventListener('scroll', handleWindowScroll)
      document.removeEventListener('focusin', handleFocusIn)
    }
  }, [])

  const goNext = useCallback(() => {
    setStep(s => {
      const next = nextStep(s, state)
      if (editScope && isOutsideEdit(next, editScope)) {
        setEditScope(null)
        return { kind: 'summary' }
      }
      return next
    })
  }, [state, editScope])
  const goBack = useCallback(() => {
    setStep(s => {
      const prev = prevStep(s, state) ?? s
      if (editScope && isOutsideEdit(prev, editScope)) {
        setEditScope(null)
        return { kind: 'summary' }
      }
      return prev
    })
  }, [state, editScope])

  function startEditScope(scope: EditScope) {
    setEditMenu(null)
    setEditScope(scope)
    switch (scope.kind) {
      case 'coach':
        setState(s => ({ ...s, coach: { name: '', phone: '', email: '', extras: [] }, hasMultipleCoaches: null }))
        setStep({ kind: 'coach_name' })
        break
      case 'academy':
        setState(s => ({ ...s, academy: '', teamName: '' }))
        setStep({ kind: 'academy' })
        break
      case 'dancer': {
        const i = scope.i
        setState(s => {
          const dancers = [...s.dancers]
          dancers[i] = { name: '', birthdate: '', categoryOverride: null }
          // Clear any act dancer references to this dancer
          const acts = s.acts.map(a => ({
            ...a,
            dancerIndices: a.dancerIndices.filter(idx => idx !== i),
          }))
          return { ...s, dancers, acts }
        })
        setStep({ kind: 'dancer', i })
        break
      }
      case 'act': {
        const i = scope.i
        setState(s => {
          const acts = [...s.acts]
          acts[i] = { modality: null, ageCategory: null, level: null, style: null, dancerIndices: [] }
          return { ...s, acts }
        })
        setStep({ kind: 'act_modality', i })
        break
      }
      case 'costs':
        setState(s => ({ ...s, costPaquete: null, costRepeticion: null }))
        setStep({ kind: 'costs' })
        break
    }
  }

  function updateCoach(patch: Partial<Coach>) {
    setState(s => ({ ...s, coach: { ...s.coach, ...patch } }))
  }
  function updateDancer(i: number, patch: Partial<Dancer>) {
    setState(s => {
      const dancers = [...s.dancers]
      dancers[i] = { ...dancers[i], ...patch }
      return { ...s, dancers }
    })
  }
  function updateAct(i: number, patch: Partial<Act>) {
    setState(s => {
      const acts = [...s.acts]
      acts[i] = { ...acts[i], ...patch }
      return { ...s, acts }
    })
  }
  function setTeamSize(n: number | null) {
    setState(s => ({ ...s, teamSize: n }))
  }
  function setActCount(n: number | null) {
    setState(s => ({ ...s, actCount: n }))
  }
  function syncDancersArray() {
    setState(s => {
      if (s.teamSize == null) return s
      const dancers = [...s.dancers]
      while (dancers.length < s.teamSize) dancers.push({ name: '', birthdate: '', categoryOverride: null })
      dancers.length = s.teamSize
      return { ...s, dancers }
    })
  }
  function syncActsArray() {
    setState(s => {
      if (s.actCount == null) return s
      const acts = [...s.acts]
      while (acts.length < s.actCount) acts.push({ modality: null, ageCategory: null, level: null, style: null, dancerIndices: [] })
      acts.length = s.actCount
      return { ...s, acts }
    })
  }

  async function confirm() {
    if (!event) return
    setSaving(true)
    setSaveErr(null)
    try {
      const isUpdate = state.confirmedRegistrationId != null
      let registrationId: number

      const regPayload = {
        event_id: event.id,
        coach_name: state.coach.name.trim(),
        coach_phone: state.coach.phone.trim(),
        coach_email: state.coach.email.trim() || null,
        extra_coaches: state.coach.extras.map(e => e.trim()).filter(Boolean),
        academy: state.academy.trim(),
        team_name: state.teamName.trim(),
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
    setStep({ kind: 'summary' })
  }

  if (authState === 'loading') {
    return (
      <Centered>
        <p className="font-display text-3xl tracking-widest text-[#1E414C] animate-pulse">CARGANDO…</p>
      </Centered>
    )
  }
  if (authState === 'invalid') {
    return (
      <Centered>
        <p className="font-display text-4xl tracking-widest text-[#9E4F36]">LINK INVÁLIDO</p>
        <p className="text-[#3D4143] text-center text-lg mt-2">Verifica el enlace o ponte en contacto con los organizadores.</p>
      </Centered>
    )
  }
  const isFirstStep = step.kind === 'welcome'
  const canBack = !isFirstStep && step.kind !== 'confirmed'
  const isMobile = isLargeScreen === false

  return (
    <div
      className="bg-[#F6F4EF] text-[#1A1D1E] flex flex-col overflow-hidden font-sans select-none w-full"
      style={{ height: 'var(--viewport-height, 100dvh)' }}
    >
      {showSuccessSplash && (
        <div className="fixed inset-0 z-[9999] bg-[#265C4B] text-white flex flex-col items-center justify-center p-6" style={{ animation: 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
          <div className="text-center space-y-6 max-w-md mx-auto">
            <div className="flex justify-center">
              <div className="bg-white/10 p-6 rounded-full ring-8 ring-white/5 animate-bounce">
                <Check className="w-20 h-20 text-[#F6F4EF]" strokeWidth={3} />
              </div>
            </div>
            <h1 className="font-display text-4xl lg:text-5xl font-bold tracking-wider leading-tight text-[#F6F4EF]">
              ¡REGISTRO EXITOSO!
            </h1>
            <p className="text-lg lg:text-xl text-[#F6F4EF]/90 leading-relaxed font-medium">
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
          background-color: #F6F4EF !important;
          overflow: hidden !important;
          position: fixed !important;
          width: 100% !important;
          height: 100% !important;
          left: 0 !important;
          top: 0 !important;
        }
      ` }} />
      <meta name="theme-color" content="#F6F4EF" />

      {/* MOBILE HEADER — sticky, minimal, con área segura arriba */}
      {!(step.kind === 'welcome' || step.kind === 'instruction_1' || step.kind === 'instruction_2') && (
        <div
          className="shrink-0 lg:hidden bg-[#F6F4EF]/90 backdrop-blur flex items-center gap-3 px-4 pb-3 border-b border-[#C2BCB0]/50"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        >
        {canBack && step.kind !== 'summary' ? (
          <button
            onClick={goBack}
            className="shrink-0 inline-flex items-center justify-center text-[#1E414C] active:opacity-60 h-10 w-10 -ml-2 rounded-full active:scale-95 transition-all duration-150"
            aria-label="Atrás"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
        ) : (
          <Image src="/logo.png" alt="Dance4ever" width={44} height={33} priority className="shrink-0 h-8 w-auto mix-blend-multiply" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display text-xs tracking-[0.3em] text-[#1E414C] leading-none">REGISTRO PARA</p>
          <p className="font-display text-sm uppercase text-[#1A1D1E] truncate leading-tight mt-1">
            {event?.name || 'EVENTO'}{event?.date ? ` · ${formatEventDate(event.date)}` : ''}
          </p>
        </div>
        <a
          href="https://wa.me/523337290374"
          target="_blank"
          rel="noreferrer"
          className="shrink-0 inline-flex items-center justify-center h-10 w-10 -mr-2 rounded-full active:scale-95 transition-all duration-150"
          aria-label="WhatsApp ayuda"
        >
          <MessageCircle className="w-6 h-6 text-[#265C4B]" />
        </a>
      </div>
      )}

      <main
        className="flex-1 min-h-0 px-4 lg:px-8 pt-3 lg:pt-5 flex flex-col overflow-y-auto lg:overflow-hidden"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
      >
        {/* DESKTOP HEADER */}
        <div className="shrink-0 hidden lg:flex items-center gap-6 pb-4">
          <div className="shrink-0 flex items-baseline gap-5">
            <p className="font-display text-3xl lg:text-4xl tracking-[0.3em] text-[#1E414C] leading-none">REGISTRO PARA</p>
            <h1 className="font-display text-3xl lg:text-4xl uppercase text-[#1A1D1E] truncate leading-none">{event?.name || 'EVENTO'}</h1>
            {event?.date && <p className="font-display text-3xl lg:text-4xl uppercase text-[#3D4143] leading-none">{formatEventDate(event.date)}</p>}
          </div>
          <div className="flex-1" />
          {(step.kind === 'summary' || step.kind === 'confirmed') && (
            <div className="text-right self-center shrink-0">
              <h2 className="font-display text-3xl lg:text-4xl uppercase text-[#1E414C] leading-tight">
                {step.kind === 'confirmed' ? 'REGISTRO CONFIRMADO' : 'REVISA TU REGISTRO'}
              </h2>
              <p className="font-display text-base lg:text-lg tracking-[0.4em] text-[#1E414C]/70 leading-none mt-2">
                {step.kind === 'confirmed' ? '¡GRACIAS!' : editMode ? 'EDITA Y VUELVE A CONFIRMAR' : 'SI TODO ES CORRECTO, CONFIRMA'}
              </p>
            </div>
          )}
          {editMode && (
            <div className="bg-[#9E4F36]/10 border border-[#9E4F36]/30 text-[#9E4F36] px-3 py-1.5 rounded-xl font-display text-xs tracking-widest self-center">
              MODO EDICIÓN
            </div>
          )}
          <Image src="/logo.png" alt="Dance4ever" width={120} height={90} priority className="shrink-0 mix-blend-multiply" />
        </div>

        <div className="flex-1 min-h-0 flex justify-center">
          <div className={`w-full ${step.kind === 'summary' || step.kind === 'confirmed' || step.kind === 'dancer' ? '' : 'max-w-5xl'} min-h-full lg:h-full flex flex-col ${isKeyboardOpen ? 'justify-start pt-2' : 'justify-center'} min-h-0`}>
            <StepView
              step={step}
              state={state}
              event={event}
              isKeyboardOpen={isKeyboardOpen}
              editMode={editMode}
              isMobile={isMobile}
              mobileSummaryTab={mobileSummaryTab}
              setMobileSummaryTab={setMobileSummaryTab}
              onOpenDancerSheet={() => setMobileSheet('dancers')}
              onNext={goNext}
              goToStep={setStep}
              startEdit={startEdit}
              openEditMenu={() => setEditMenu('main')}
              updateCoach={updateCoach}
              updateState={setState}
              updateDancer={updateDancer}
              updateAct={updateAct}
              setTeamSize={setTeamSize}
              setActCount={setActCount}
              syncDancersArray={syncDancersArray}
              syncActsArray={syncActsArray}
              confirm={confirm}
              saving={saving}
              saveErr={saveErr}
            />
          </div>
        </div>
      </main>
      {/* DESKTOP BOTTOM BAR */}
      <div className="hidden lg:block">
        {step.kind === 'summary' ? (
          <div className="px-6 pt-3 pb-4 shrink-0 flex items-center justify-center">
            <a
              href="https://wa.me/523337290374"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 text-[#3D4143] hover:text-[#1E414C] transition-all group active:scale-98"
            >
              <MessageCircle className="w-5 h-5 text-[#265C4B] group-hover:text-[#164235] shrink-0" />
              <span className="text-sm md:text-base">
                ¿Dudas o ayuda? Escríbenos por WhatsApp:{' '}
                <span className="font-display tracking-wider text-[#1E414C] group-hover:text-[#122C34]">333 729 0374</span>
              </span>
            </a>
          </div>
        ) : (
          <div className="px-6 pt-3 pb-6 shrink-0 flex items-center gap-4">
            <div className="min-w-0 flex-1 flex justify-start">
              {canBack && (
                <button
                  onClick={goBack}
                  className="inline-flex items-center gap-3 bg-[#E8E3D5] hover:bg-[#DDD8CA] active:bg-[#C2BCB0] text-[#1E414C] font-display text-base tracking-[0.2em] uppercase px-4 py-2 rounded-xl transition-all border border-[#C2BCB0]/50 active:scale-95"
                >
                  <ArrowLeft className="w-5 h-5" />
                  REGRESAR
                </button>
              )}
            </div>
            <a
              href="https://wa.me/523337290374"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 text-[#3D4143] hover:text-[#1E414C] transition-all group active:scale-98"
            >
              <MessageCircle className="w-5 h-5 text-[#265C4B] group-hover:text-[#164235] shrink-0" />
              <span className="text-sm md:text-base text-right">
                ¿Dudas o ayuda? Escríbenos por WhatsApp:{' '}
                <span className="font-display tracking-wider text-[#1E414C] group-hover:text-[#122C34]">333 729 0374</span>
              </span>
            </a>
          </div>
        )}
      </div>


      {/* MOBILE BOTTOM SHEET: Lista de integrantes */}
      {mobileSheet === 'dancers' && (
        <div className="lg:hidden fixed inset-0 z-50 flex items-end" onClick={() => setMobileSheet(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full bg-[#F6F4EF] border-t-2 border-[#1E414C] rounded-t-3xl max-h-[80vh] flex flex-col shadow-[0_-8px_30px_rgba(0,0,0,0.08)]" onClick={e => e.stopPropagation()}>
            <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-[#C2BCB0]/40">
              <p className="font-display text-base tracking-[0.3em] text-[#1E414C]">
                ALUMNOS/AS · {state.dancers.filter(d => d.name.trim().length >= 2 && d.birthdate.length === 10).length}/{state.dancers.length}
              </p>
              <button onClick={() => setMobileSheet(null)} className="text-[#3D4143] active:text-[#1A1D1E] active:scale-90 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
              {state.dancers.filter(d => d.name.trim().length > 0).length === 0 ? (
                <p className="text-[#3D4143] italic text-sm text-center py-10">Aún no has registrado alumnos/as</p>
              ) : (
                state.dancers.map((d, i) => {
                  if (!d.name.trim()) return null
                  const complete = d.name.trim().length >= 2 && d.birthdate.length === 10
                  const isCurrent = step.kind === 'dancer' && step.i === i
                  return (
                    <button
                      key={i}
                      onClick={() => { setStep({ kind: 'dancer', i }); setMobileSheet(null) }}
                      className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 active:scale-[0.98] transition-all duration-150 ${
                        isCurrent ? 'bg-[#1E414C] text-white shadow-md' : complete ? 'bg-[#265C4B]/10 text-[#265C4B] active:bg-[#265C4B]/20' : 'bg-[#9E4F36]/10 text-[#9E4F36] active:bg-[#9E4F36]/20'
                      }`}
                    >
                      <span className="font-display text-sm opacity-60 w-6 text-center shrink-0">{i + 1}</span>
                      <span className="font-display flex-1 truncate uppercase">{d.name}</span>
                      {complete && <Check className="w-5 h-5 shrink-0" />}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {editMenu && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-6" onClick={() => setEditMenu(null)}>
          <div className="bg-[#F6F4EF] border border-[#C2BCB0] rounded-3xl max-w-2xl w-full max-h-full overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="bg-[#E8E3D5] px-6 py-4 flex items-center justify-between shrink-0 border-b border-[#C2BCB0]">
              <h3 className="font-display text-2xl tracking-widest text-[#1E414C]">
                {editMenu === 'main' ? '¿QUÉ DESEAS EDITAR?' : editMenu === 'pick_dancer' ? 'ELIGE EL ALUMNO/A' : 'ELIGE EL ACTO'}
              </h3>
              <button onClick={() => setEditMenu(null)} className="text-[#3D4143] hover:text-[#1A1D1E] active:scale-90 transition-all"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
              {editMenu === 'main' && (
                <>
                  <p className="text-sm text-[#3D4143] text-center mb-2">Al editar, se borrará lo capturado en esa sección para llenarlo de nuevo.</p>
                  <EditMenuButton label="DATOS DEL COACH" sub={state.coach.name} onClick={() => startEditScope({ kind: 'coach' })} />
                  <EditMenuButton label="ACADEMIA · EQUIPO" sub={`${state.academy} — ${state.teamName}`} onClick={() => startEditScope({ kind: 'academy' })} />
                  <EditMenuButton label={`ALUMNO/A (${state.dancers.length})`} sub="Editar un integrante" onClick={() => setEditMenu('pick_dancer')} />
                  <EditMenuButton label={`ACTO (${state.acts.length})`} sub="Editar un acto" onClick={() => setEditMenu('pick_act')} />
                  <EditMenuButton
                    label="COSTOS"
                    sub={state.costPaquete !== null && state.costRepeticion !== null ? `Paquete ${formatMoney(state.costPaquete)} · Repetición ${formatMoney(state.costRepeticion)}` : 'Sin costos'}
                    onClick={() => startEditScope({ kind: 'costs' })}
                  />
                </>
              )}
              {editMenu === 'pick_dancer' && (
                <>
                  {state.dancers.map((d, i) => (
                    <EditMenuButton
                      key={i}
                      label={d.name || `Alumno/a ${i + 1}`}
                      sub={d.birthdate ? formatBirthdate(d.birthdate) : 'Sin fecha'}
                      onClick={() => startEditScope({ kind: 'dancer', i })}
                    />
                  ))}
                </>
              )}
              {editMenu === 'pick_act' && (
                <>
                  {state.acts.map((a, i) => {
                    const cat = a.ageCategory ? AGE_CATEGORY_LABELS[a.ageCategory] : '—'
                    const mod = a.modality ? modalityLabel(a.modality) : '—'
                    const lvl = a.modality === 'grupal' ? (a.level === 'basico' ? ' BÁSICO' : a.level === 'avanzado' ? ' AVANZADO' : '') : ''
                    return (
                      <EditMenuButton
                        key={i}
                        label={`Acto ${i + 1} · ${mod}${lvl}`}
                        sub={`${cat} · ${a.style ?? '—'}`}
                        onClick={() => startEditScope({ kind: 'act', i })}
                      />
                    )
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EditMenuButton({ label, sub, onClick }: { label: string, sub?: string, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white border border-[#C2BCB0] hover:bg-[#E8E3D5] active:bg-[#E8E3D5] px-5 py-4 rounded-2xl transition-all shadow-sm active:scale-[0.98] duration-150"
    >
      <div className="font-display text-xl uppercase text-[#1E414C]">{label}</div>
      {sub && <div className="text-sm text-[#3D4143] mt-1 truncate">{sub}</div>}
    </button>
  )
}

function nextStep(current: Step, state: State): Step {
  switch (current.kind) {
    case 'welcome': return { kind: 'instruction_1' }
    case 'instruction_1': return { kind: 'instruction_2' }
    case 'instruction_2': return { kind: 'coach_name' }
    case 'coach_name': return { kind: 'coach_phone' }
    case 'coach_phone': return { kind: 'coach_email' }
    case 'coach_email': return { kind: 'coach_multi_q' }
    case 'coach_multi_q': return state.hasMultipleCoaches ? { kind: 'coach_extras' } : { kind: 'academy' }
    case 'coach_extras': return { kind: 'academy' }
    case 'academy': return { kind: 'team_name' }
    case 'team_name': return { kind: 'team_size' }
    case 'team_size': return { kind: 'dancer', i: 0 }
    case 'dancer': {
      const ni = current.i + 1
      if (ni < (state.teamSize ?? 0)) return { kind: 'dancer', i: ni }
      return { kind: 'act_count' }
    }
    case 'act_count': return { kind: 'act_modality', i: 0 }
    case 'act_modality': {
      const act = state.acts[current.i]
      if (act.modality === 'grupal') return { kind: 'act_grupal_category', i: current.i }
      return { kind: 'act_style', i: current.i }
    }
    case 'act_grupal_category': return { kind: 'act_level', i: current.i }
    case 'act_level': return { kind: 'act_style', i: current.i }
    case 'act_style': {
      const act = state.acts[current.i]
      const needs = requiredDancers(act.modality)
      if (needs !== null) return { kind: 'act_dancers', i: current.i }
      const ni = current.i + 1
      if (ni < (state.actCount ?? 0)) return { kind: 'act_modality', i: ni }
      return { kind: 'costs' }
    }
    case 'act_dancers': {
      const ni = current.i + 1
      if (ni < (state.actCount ?? 0)) return { kind: 'act_modality', i: ni }
      return { kind: 'costs' }
    }
    case 'costs': return { kind: 'summary' }
    case 'summary': return { kind: 'confirmed' }
    case 'confirmed': return current
  }
}

function prevStep(current: Step, state: State): Step | null {
  switch (current.kind) {
    case 'welcome': return null
    case 'instruction_1': return { kind: 'welcome' }
    case 'instruction_2': return { kind: 'instruction_1' }
    case 'coach_name': return { kind: 'instruction_2' }
    case 'coach_phone': return { kind: 'coach_name' }
    case 'coach_email': return { kind: 'coach_phone' }
    case 'coach_multi_q': return { kind: 'coach_email' }
    case 'coach_extras': return { kind: 'coach_multi_q' }
    case 'academy': return state.hasMultipleCoaches ? { kind: 'coach_extras' } : { kind: 'coach_multi_q' }
    case 'team_name': return { kind: 'academy' }
    case 'team_size': return { kind: 'team_name' }
    case 'dancer':
      if (current.i === 0) return { kind: 'team_size' }
      return { kind: 'dancer', i: current.i - 1 }
    case 'act_count':
      return { kind: 'dancer', i: Math.max(0, (state.teamSize ?? 1) - 1) }
    case 'act_modality': {
      if (current.i === 0) return { kind: 'act_count' }
      const prev = current.i - 1
      const prevAct = state.acts[prev]
      const needs = requiredDancers(prevAct.modality)
      if (needs !== null) return { kind: 'act_dancers', i: prev }
      return { kind: 'act_style', i: prev }
    }
    case 'act_grupal_category': return { kind: 'act_modality', i: current.i }
    case 'act_level': return { kind: 'act_grupal_category', i: current.i }
    case 'act_style': {
      const act = state.acts[current.i]
      if (act.modality === 'grupal') return { kind: 'act_level', i: current.i }
      return { kind: 'act_modality', i: current.i }
    }
    case 'act_dancers': return { kind: 'act_style', i: current.i }
    case 'costs': {
      const last = (state.actCount ?? 1) - 1
      const lastAct = state.acts[last]
      const needs = requiredDancers(lastAct.modality)
      if (needs !== null) return { kind: 'act_dancers', i: last }
      return { kind: 'act_style', i: last }
    }
    case 'summary': return { kind: 'costs' }
    case 'confirmed': return null
  }
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

function StepView(props: {
  step: Step
  state: State
  event: Event | null
  isKeyboardOpen: boolean
  editMode: boolean
  isMobile: boolean
  mobileSummaryTab: 'coach' | 'academy' | 'dancers' | 'acts'
  setMobileSummaryTab: (t: 'coach' | 'academy' | 'dancers' | 'acts') => void
  onOpenDancerSheet: () => void
  onNext: () => void
  goToStep: (s: Step) => void
  startEdit: () => void
  openEditMenu: () => void
  updateCoach: (p: Partial<Coach>) => void
  updateState: React.Dispatch<React.SetStateAction<State>>
  updateDancer: (i: number, p: Partial<Dancer>) => void
  updateAct: (i: number, p: Partial<Act>) => void
  setTeamSize: (n: number | null) => void
  setActCount: (n: number | null) => void
  syncDancersArray: () => void
  syncActsArray: () => void
  confirm: () => Promise<void>
  saving: boolean
  saveErr: string | null
}) {
  const { step, state, event, isKeyboardOpen, editMode, isMobile, mobileSummaryTab, setMobileSummaryTab, onOpenDancerSheet, onNext, goToStep, startEdit, openEditMenu, updateCoach, updateState, updateDancer, updateAct, setTeamSize, setActCount, syncDancersArray, syncActsArray, confirm, saving, saveErr } = props
  const [showCategoriesInfo, setShowCategoriesInfo] = useState(false)

  switch (step.kind) {
    case 'welcome': {
      const eventCity = event?.name?.replace(/dance4ever/gi, '').replace(/\d{4}/g, '').trim() || 'Guadalajara'
      const regDeadline = event?.date ? getRegistrationDeadline(event.date) : '15 días antes'
      const chgDeadline = event?.date ? getChangesDeadline(event.date) : '7 días antes'
      return (
        <div className="flex flex-col items-center justify-center text-center space-y-6 max-w-xl mx-auto py-4">
          <Image src="/logo.png" alt="Dance4ever" width={160} height={120} priority className="mix-blend-multiply active:scale-95 transition-all duration-150" />
          <div className="space-y-2">
            <p className="font-display text-xs tracking-[0.4em] text-[#1E414C]">SISTEMA OFICIAL DE REGISTRO</p>
            <h2 className="font-display text-4xl lg:text-5xl uppercase text-[#1A1D1E] tracking-tight">{event?.name || 'EVENTO'}</h2>
            {event?.date && (
              <p className="font-display text-lg tracking-widest text-[#3D4143] uppercase">{eventCity} · {formatEventDate(event.date)}</p>
            )}
          </div>

          <div className="w-full bg-[#E8E3D5]/40 border border-[#C2BCB0]/50 rounded-2xl p-5 space-y-4 text-left shadow-sm">
            <div className="space-y-1">
              <p className="text-[10px] font-display tracking-wider text-[#3D4143]/70 uppercase">FECHA LÍMITE DE REGISTRO</p>
              <p className="text-base text-[#1E414C] font-semibold">{regDeadline}</p>
            </div>
            <div className="h-px bg-[#C2BCB0]/30" />
            <div className="space-y-1">
              <p className="text-[10px] font-display tracking-wider text-[#3D4143]/70 uppercase">FECHA LÍMITE PARA CAMBIOS</p>
              <p className="text-base text-[#9E4F36] font-semibold">{chgDeadline}</p>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-[#9E4F36]/10 border border-[#9E4F36]/30 text-[#9E4F36] px-5 py-4 rounded-2xl text-left">
            <Info className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-xs lg:text-sm leading-snug">
              <strong>Atención:</strong> Por favor, lee con mucho cuidado todas las instrucciones y pasos del proceso. Esto garantizará que las categorías de tus alumnos, el costo de tus paquetes y el registro de tus actos sean 100% correctos.
            </p>
          </div>

          <button
            onClick={onNext}
            className="w-full bg-[#1E414C] active:bg-[#122C34] hover:bg-[#122C34] text-white font-display text-xl tracking-widest py-4 rounded-2xl transition-all shadow-md active:scale-[0.98] duration-150"
          >
            ENTENDIDO, LEER INSTRUCCIONES
          </button>
        </div>
      )
    }

    case 'instruction_1': {
      return (
        <div className="flex flex-col justify-center w-full max-w-2xl mx-auto py-3 px-3 lg:px-0 space-y-4 lg:space-y-6">
          <div className="text-center space-y-1 lg:space-y-2">
            <p className="font-display text-xs lg:text-sm tracking-[0.4em] text-[#1E414C]">PASO 1 DE 2</p>
            <h2 className="font-display text-3xl lg:text-4xl text-[#1A1D1E]">REGLAS Y CATEGORÍAS</h2>
          </div>

          <div className="space-y-3 lg:space-y-4">
            <div className="bg-white border border-[#C2BCB0] rounded-2xl p-4 lg:p-5 shadow-sm flex items-start gap-3 lg:gap-4 active:scale-[0.99] transition-all duration-150">
              <span className="shrink-0 flex items-center justify-center w-7 h-7 lg:w-9 lg:h-9 rounded-full bg-[#1E414C] text-white font-display text-sm lg:text-base font-bold">1</span>
              <div className="space-y-1">
                <h4 className="font-display text-sm lg:text-lg text-[#1E414C] tracking-wider uppercase font-semibold">Categorías de Edad</h4>
                <p className="text-xs lg:text-sm text-[#3D4143] leading-relaxed">
                  Se calculan automáticamente según la fecha de nacimiento. Si la categoría automática no coincide, puedes cambiarla manualmente antes de finalizar.
                </p>
              </div>
            </div>

            <div className="bg-white border border-[#C2BCB0] rounded-2xl p-4 lg:p-5 shadow-sm flex items-start gap-3 lg:gap-4 active:scale-[0.99] transition-all duration-150">
              <span className="shrink-0 flex items-center justify-center w-7 h-7 lg:w-9 lg:h-9 rounded-full bg-[#1E414C] text-white font-display text-sm lg:text-base font-bold">2</span>
              <div className="space-y-1">
                <h4 className="font-display text-sm lg:text-lg text-[#1E414C] tracking-wider uppercase font-semibold">Integrantes del Equipo</h4>
                <p className="text-xs lg:text-sm text-[#3D4143] leading-relaxed">
                  Registra a todos tus alumnos/as primero. Cuenta a todos los que bailarán, incluyendo solistas, duetos, tríos y grupales.
                </p>
              </div>
            </div>

            <div className="bg-white border border-[#C2BCB0] rounded-2xl p-4 lg:p-5 shadow-sm flex items-start gap-3 lg:gap-4 active:scale-[0.99] transition-all duration-150">
              <span className="shrink-0 flex items-center justify-center w-7 h-7 lg:w-9 lg:h-9 rounded-full bg-[#1E414C] text-white font-display text-sm lg:text-base font-bold">3</span>
              <div className="space-y-1">
                <h4 className="font-display text-sm lg:text-lg text-[#1E414C] tracking-wider uppercase font-semibold">Nombre de Equipo</h4>
                <p className="text-xs lg:text-sm text-[#3D4143] leading-relaxed">
                  Si el nombre de tu equipo coincide con el de tu academia o escuela, puedes dejar el campo vacío y presionar "Siguiente".
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={onNext}
            className="w-full bg-[#1E414C] active:bg-[#122C34] hover:bg-[#122C34] text-white font-display text-lg lg:text-xl tracking-widest py-4 rounded-2xl transition-all shadow-md active:scale-[0.98] duration-150"
          >
            ENTENDIDO, SIGUIENTE PASO
          </button>
        </div>
      )
    }

    case 'instruction_2': {
      return (
        <div className="flex flex-col justify-center w-full max-w-2xl mx-auto py-3 px-3 lg:px-0 space-y-4 lg:space-y-6">
          <div className="text-center space-y-1 lg:space-y-2">
            <p className="font-display text-xs lg:text-sm tracking-[0.4em] text-[#1E414C]">PASO 2 DE 2</p>
            <h2 className="font-display text-3xl lg:text-4xl text-[#1A1D1E]">ACTOS Y COSTOS</h2>
          </div>

          <div className="space-y-3 lg:space-y-4">
            <div className="bg-white border border-[#C2BCB0] rounded-2xl p-4 lg:p-5 shadow-sm flex items-start gap-3 lg:gap-4 active:scale-[0.99] transition-all duration-150">
              <span className="shrink-0 flex items-center justify-center w-7 h-7 lg:w-9 lg:h-9 rounded-full bg-[#1E414C] text-white font-display text-sm lg:text-base font-bold">4</span>
              <div className="space-y-1">
                <h4 className="font-display text-sm lg:text-lg text-[#1E414C] tracking-wider uppercase font-semibold">Registro de Actos</h4>
                <p className="text-xs lg:text-sm text-[#3D4143] leading-relaxed">
                  Registra tus actos en orden, de la categoría de edad más joven a la más alta (por ejemplo: Tiny → Mini → Elementary → Junior → Senior → College → Open).
                </p>
              </div>
            </div>

            <div className="bg-white border border-[#C2BCB0] rounded-2xl p-4 lg:p-5 shadow-sm flex items-start gap-3 lg:gap-4 active:scale-[0.99] transition-all duration-150">
              <span className="shrink-0 flex items-center justify-center w-7 h-7 lg:w-9 lg:h-9 rounded-full bg-[#1E414C] text-white font-display text-sm lg:text-base font-bold">5</span>
              <div className="space-y-1">
                <h4 className="font-display text-sm lg:text-lg text-[#1E414C] tracking-wider uppercase font-semibold">Cálculo de Costos</h4>
                <p className="text-xs lg:text-sm text-[#3D4143] leading-relaxed">
                  El sistema calculará automáticamente el costo de la primera participación (paquete inicial) y el costo de las repeticiones o grupales correspondientes.
                </p>
              </div>
            </div>

            <div className="bg-white border border-[#C2BCB0] rounded-2xl p-4 lg:p-5 shadow-sm flex items-start gap-3 lg:gap-4 active:scale-[0.99] transition-all duration-150">
              <span className="shrink-0 flex items-center justify-center w-7 h-7 lg:w-9 lg:h-9 rounded-full bg-[#1E414C] text-white font-display text-sm lg:text-base font-bold">6</span>
              <div className="space-y-1">
                <h4 className="font-display text-sm lg:text-lg text-[#1E414C] tracking-wider uppercase font-semibold">Revisión Final</h4>
                <p className="text-xs lg:text-sm text-[#3D4143] leading-relaxed">
                  Al final del flujo tendrás una pantalla de resumen completa donde podrás editar cualquier dato antes de confirmar de forma definitiva tu registro.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={onNext}
            className="w-full bg-[#9E4F36] active:bg-[#7D3D2A] hover:bg-[#7D3D2A] text-white font-display text-lg lg:text-xl tracking-widest py-4 rounded-2xl transition-all shadow-md active:scale-[0.98] duration-150"
          >
            COMENZAR REGISTRO
          </button>
        </div>
      )
    }

    case 'coach_name':
      return (
        <FieldStep
          title="¿Cuál es tu nombre completo?"
          hint="Nombre del coach que hace el registro"
          value={state.coach.name}
          onChange={v => updateCoach({ name: v })}
          onNext={onNext}
          disabled={state.coach.name.trim().length < 2}
          autoCapitalize="words"
          isKeyboardOpen={isKeyboardOpen}
        />
      )

    case 'coach_phone':
      return (
        <FieldStep
          title="¿Cuál es tu WhatsApp?"
          notice="Escribe solo números, sin espacios, guiones ni paréntesis"
          value={state.coach.phone}
          onChange={v => updateCoach({ phone: v.replace(/\D/g, '') })}
          onNext={onNext}
          disabled={state.coach.phone.trim().length < 6}
          type="tel"
          autoCapitalize="off"
          isKeyboardOpen={isKeyboardOpen}
        />
      )

    case 'coach_email':
      return (
        <FieldStep
          title="¿Cuál es tu correo?"
          notice="Opcional, pero útil para confirmaciones"
          value={state.coach.email}
          onChange={v => updateCoach({ email: v })}
          onNext={onNext}
          disabled={false}
          type="email"
          autoCapitalize="off"
          isKeyboardOpen={isKeyboardOpen}
        />
      )

    case 'coach_multi_q':
      return (
        <YesNoStep
          title="¿Hay más de un coach en el equipo o academia?"
          value={state.hasMultipleCoaches}
          onYes={() => { updateState(s => ({ ...s, hasMultipleCoaches: true })); onNext() }}
          onNo={() => { updateState(s => ({ ...s, hasMultipleCoaches: false, coach: { ...s.coach, extras: [] } })); onNext() }}
        />
      )

    case 'coach_extras': {
      const extras = state.coach.extras
      const valid = extras.length > 0 && extras.every(e => e.trim().length >= 2)
      return (
        <Wrapper title="Nombres de los demás coaches" subtitle="Tu nombre ya está registrado" isKeyboardOpen={isKeyboardOpen}>
          <div className="space-y-3">
            {extras.map((e, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={e}
                  onChange={ev => updateCoach({ extras: extras.map((x, j) => j === i ? ev.target.value : x) })}
                  placeholder={`Coach ${i + 2}`}
                  className="flex-1 bg-white border border-[#C2BCB0] text-[#1A1D1E] text-2xl rounded-2xl px-5 py-4 outline-none focus:border-[#1E414C] focus:ring-1 focus:ring-[#1E414C] text-center transition-all shadow-sm"
                  autoCapitalize="words"
                />
                <button
                  onClick={() => updateCoach({ extras: extras.filter((_, j) => j !== i) })}
                  className="bg-[#9E4F36]/10 active:bg-[#9E4F36]/20 text-[#9E4F36] px-4 rounded-2xl shrink-0 transition-all active:scale-95 duration-150"
                  aria-label="Quitar"
                >
                  <Trash2 className="w-6 h-6" />
                </button>
              </div>
            ))}
            <button
              onClick={() => updateCoach({ extras: [...extras, ''] })}
              className="w-full flex items-center justify-center gap-2 bg-[#E8E3D5] active:bg-[#C2BCB0] text-[#1E414C] py-4 rounded-2xl font-display text-lg tracking-wider transition-all border border-[#C2BCB0]/40 active:scale-[0.98] duration-150"
            >
              <Plus className="w-6 h-6" /> AGREGAR OTRO COACH
            </button>
          </div>
          <NextButton onClick={onNext} disabled={!valid} />
        </Wrapper>
      )
    }

    case 'academy':
      return (
        <FieldStep
          title="¿Nombre de la academia o escuela?"
          value={state.academy}
          onChange={v => updateState(s => ({ ...s, academy: v }))}
          onNext={onNext}
          disabled={state.academy.trim().length < 2}
          autoCapitalize="sentences"
          isKeyboardOpen={isKeyboardOpen}
        />
      )

    case 'team_name': {
      const handleNext = () => {
        if (state.teamName.trim().length === 0) {
          updateState(s => ({ ...s, teamName: s.academy }))
        }
        onNext()
      }
      return (
        <Wrapper title="¿Nombre del equipo?" isKeyboardOpen={isKeyboardOpen}>
          <input
            type="text"
            value={state.teamName}
            onChange={e => updateState(s => ({ ...s, teamName: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') handleNext() }}
            autoCapitalize="sentences"
            autoCorrect="off"
            placeholder={state.academy}
            className="w-full bg-white border border-[#C2BCB0] text-[#1A1D1E] text-2xl lg:text-4xl rounded-2xl px-4 py-4 lg:px-6 lg:py-6 outline-none focus:border-[#1E414C] focus:ring-1 focus:ring-[#1E414C] text-center placeholder:text-[#3D4143]/60 transition-all shadow-sm"
          />
          <p className="text-[#9E4F36] text-base text-center italic font-medium">
            Si el equipo se llama igual que la escuela/academia, deja vacío y dale a Siguiente.
          </p>
          <NextButton onClick={handleNext} disabled={false} />
        </Wrapper>
      )
    }

    case 'team_size': {
      const v = state.teamSize
      return (
        <Wrapper title="¿Cuántos integrantes tiene el equipo?" isKeyboardOpen={isKeyboardOpen}>
          {editMode && <EditNotice text="No puedes cambiar la cantidad. Para agregar más integrantes, contacta a los organizadores." />}
          <NumberInput
            value={v}
            onChange={setTeamSize}
            min={1}
            max={100}
            disabled={editMode}
            onEnter={() => { if (v && v >= 1) { syncDancersArray(); onNext() } }}
          />
          <p className="text-[#9E4F36] text-base text-center italic font-medium">
            Cuenta a todos los alumnos/as del equipo, incluyendo solistas, duetos y tríos.
          </p>
          <NextButton onClick={() => { syncDancersArray(); onNext() }} disabled={!v || v < 1} />
        </Wrapper>
      )
    }

    case 'dancer': {
      const i = step.i
      const d = state.dancers[i] ?? { name: '', birthdate: '', categoryOverride: null }
      const valid = d.name.trim().length >= 2 && d.birthdate.length === 10
      const computedCat = categoryFromBirthdate(d.birthdate)
      const effectiveCat = d.categoryOverride ?? computedCat
      const completedDancers = state.dancers.filter(x => x.name.trim().length >= 2 && x.birthdate.length === 10).length
      return (
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 h-auto lg:h-full max-h-full min-h-0 overflow-x-hidden">
          {isMobile && (
            <button
              onClick={onOpenDancerSheet}
              className="shrink-0 self-end inline-flex items-center gap-2 bg-white text-[#1E414C] border border-[#C2BCB0] px-4 py-2 rounded-full font-display text-xs tracking-wider shadow-sm active:scale-95 transition-all duration-150"
            >
              <Check className="w-4 h-4 text-[#265C4B]" />
              <span>{completedDancers}/{state.teamSize ?? 0} REGISTRADOS</span>
            </button>
          )}
          <div className="w-full max-w-md mx-auto lg:w-[560px] shrink-0 flex flex-col justify-center min-h-0 px-2 lg:px-0">
            <Wrapper title={`Alumno/a ${i + 1} de ${state.teamSize}`} isKeyboardOpen={isKeyboardOpen}>
              <div className="space-y-5 w-full">
                <div className="max-w-xs md:max-w-sm mx-auto w-full">
                  <label className="block text-sm font-display tracking-widest text-[#3D4143] mb-3 text-center">NOMBRE COMPLETO</label>
                  <input
                    key={`name-${i}`}
                    value={d.name}
                    onChange={e => updateDancer(i, { name: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter' && valid) onNext() }}
                    placeholder="Nombre y apellidos"
                    className="w-full bg-white border border-[#C2BCB0] text-[#1A1D1E] text-xl rounded-2xl px-5 h-16 outline-none focus:border-[#1E414C] focus:ring-1 focus:ring-[#1E414C] text-center placeholder:text-[#3D4143]/60 transition-all shadow-sm animate-none"
                    autoCapitalize="words"
                  />
                </div>
                <div className="max-w-xs md:max-w-sm mx-auto w-full">
                  <label className="block text-sm font-display tracking-widest text-[#3D4143] mb-3 text-center">FECHA DE NACIMIENTO</label>
                  <DateInput
                    key={i}
                    value={d.birthdate}
                    onChange={v => updateDancer(i, { birthdate: v })}
                    onEnter={() => { if (d.name.trim().length >= 2) onNext() }}
                  />
                </div>
                {effectiveCat && (
                  <div className="max-w-xs md:max-w-sm mx-auto w-full">
                    <label className="block text-sm font-display tracking-widest text-[#3D4143] mb-3 text-center">
                      CATEGORÍA {d.categoryOverride && <span className="text-[#9E4F36]">· MODIFICADA</span>}
                    </label>
                    <select
                      value={d.categoryOverride ?? ''}
                      onChange={e => updateDancer(i, { categoryOverride: (e.target.value || null) as AgeCategory | null })}
                      className={`w-full h-14 text-[#1A1D1E] text-lg text-center rounded-2xl outline-none font-display appearance-none cursor-pointer px-3 transition-all border ${
                        d.categoryOverride
                          ? 'bg-[#9E4F36]/10 border-[#9E4F36]/50 ring-1 ring-[#9E4F36]/30'
                          : 'bg-white border-[#C2BCB0] focus:border-[#1E414C] focus:ring-1 focus:ring-[#1E414C]'
                      }`}
                    >
                      <option value="">Auto: {computedCat ? AGE_CATEGORY_LABELS[computedCat] : '—'}</option>
                      {AGE_CATEGORY_ORDER.map(cat => (
                        <option key={cat} value={cat}>{AGE_CATEGORY_LABELS[cat]} — {AGE_CATEGORY_HINTS[cat]}</option>
                      ))}
                    </select>
                    <p className="text-xs text-[#9E4F36] mt-3 text-center leading-snug font-medium">
                      Se asigna automáticamente por la fecha de nacimiento. Si crees que la categoría es incorrecta, da click arriba y elige la correcta.
                    </p>
                  </div>
                )}
              </div>
              <div className="max-w-xs md:max-w-sm mx-auto w-full shrink-0">
                <NextButton onClick={onNext} disabled={!valid} />
              </div>
            </Wrapper>
          </div>
          <div className="hidden lg:flex flex-1 min-w-0 min-h-0 flex-col justify-center py-4">
            <DancerList
              dancers={state.dancers}
              currentIndex={i}
              onSelect={idx => goToStep({ kind: 'dancer', i: idx })}
            />
          </div>
        </div>
      )
    }

    case 'act_count': {
      const v = state.actCount
      return (
        <Wrapper title="¿Cuántos actos van a participar?" isKeyboardOpen={isKeyboardOpen}>
          {editMode && <EditNotice text="No puedes cambiar la cantidad. Para agregar más actos, contacta a los organizadores." />}
          <NumberInput
            value={v}
            onChange={setActCount}
            min={1}
            max={50}
            disabled={editMode}
            onEnter={() => { if (v && v >= 1) { syncActsArray(); onNext() } }}
          />
          <p className="text-[#9E4F36] text-base text-center italic font-medium">
            Cada acto se anota individualmente en los siguientes pasos.
          </p>
          <NextButton onClick={() => { syncActsArray(); onNext() }} disabled={!v || v < 1} />
        </Wrapper>
      )
    }

    case 'act_modality': {
      const i = step.i
      const a = state.acts[i] ?? { modality: null, ageCategory: null, level: null, style: null, dancerIndices: [] }
      const firstAct = i === 0
      const teamHasGrupal = (state.teamSize ?? 0) >= 4
      const availableModalities = teamHasGrupal ? MODALITY_OPTIONS : MODALITY_OPTIONS.filter(m => m.value !== 'grupal')
      return (
        <Wrapper title={`Acto ${i + 1} de ${state.actCount}`} subtitle="MODALIDAD">
          <div className={`grid gap-4 ${availableModalities.length === 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'}`}>
            {availableModalities.map(opt => (
              <CategoryButton
                key={opt.value}
                label={opt.label}
                selected={a.modality === opt.value}
                onClick={() => {
                  const dancerIndices = requiredDancers(opt.value) !== null ? a.dancerIndices : []
                  const level = opt.value === 'grupal' ? a.level : null
                  const ageCategory = opt.value === 'grupal' ? a.ageCategory : null
                  updateAct(i, { modality: opt.value, dancerIndices, level, ageCategory })
                  onNext()
                }}
              />
            ))}
          </div>
          {firstAct && (
            <div className="flex items-start gap-3 bg-[#1E414C]/10 border border-[#1E414C]/30 text-[#1E414C] px-5 py-4 rounded-2xl">
              <Info className="w-6 h-6 shrink-0 mt-0.5" />
              <p className="text-base md:text-lg leading-snug">
                <strong>Importante:</strong> registra los actos en orden, de la categoría más joven a la más alta
                (Tiny → Mini → ... → Open).
              </p>
            </div>
          )}
          <p className="text-center text-xs text-[#3D4143] italic">
            En Solistas, Duetos y Tríos no existe la sub-categoría Básico — siempre son Avanzado.
          </p>
          <div className="w-full max-w-3xl mx-auto space-y-2">
            <button
              onClick={() => setShowCategoriesInfo(!showCategoriesInfo)}
              className="w-full flex items-center justify-between bg-white border border-[#C2BCB0] px-5 py-3.5 rounded-2xl font-display text-sm tracking-wider text-[#1E414C] transition-all hover:bg-[#E8E3D5]/20 active:scale-[0.99] shadow-sm duration-150"
            >
              <span>MOSTRAR TABLA DE CATEGORÍAS Y REGLAS</span>
              <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${showCategoriesInfo ? 'rotate-180 text-[#9E4F36]' : ''}`} />
            </button>
            {showCategoriesInfo && (
              <div className="bg-white border border-[#C2BCB0] rounded-2xl overflow-x-auto shadow-md w-full" style={{ animation: 'fadeIn 0.25s ease-out forwards' }}>
                <table className="w-full text-left min-w-[500px]">
                  <thead>
                    <tr className="bg-[#E8E3D5] text-[#1E414C] font-display text-xs tracking-widest border-b border-[#C2BCB0]">
                      <th className="px-4 py-3">CATEGORÍA</th>
                      <th className="px-4 py-3">NIVEL ESCOLAR</th>
                      <th className="px-4 py-3 text-center">SUB-CATEGORÍAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {AGE_CATEGORY_ORDER.map(cat => (
                      <tr key={cat} className="border-t border-[#C2BCB0]/40 last:border-0 hover:bg-[#F6F4EF]/30 transition-all duration-150">
                        <td className="px-4 py-3 font-display text-base text-[#1A1D1E] uppercase">{AGE_CATEGORY_LABELS[cat]}</td>
                        <td className="px-4 py-3 text-sm text-[#3D4143]">{AGE_CATEGORY_HINTS[cat]}</td>
                        <td className="px-4 py-3 text-sm text-[#3D4143] text-center">Básico · Avanzado</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Wrapper>
      )
    }

    case 'act_grupal_category': {
      const i = step.i
      const a = state.acts[i]
      const avgCat = teamAvgCategory(state.dancers)
      const options = avgCat ? neighborCategories(avgCat) : AGE_CATEGORY_ORDER
      return (
        <Wrapper title={`Acto ${i + 1} · ${a.modality ? modalityLabel(a.modality) : ''}`} subtitle="CATEGORÍA">
          {avgCat && (
            <p className="text-center text-[#3D4143] text-base">
              Categoría sugerida por edad promedio del equipo: <span className="text-[#1E414C] font-display">{AGE_CATEGORY_LABELS[avgCat].toUpperCase()}</span>
            </p>
          )}
          <div className={`grid gap-4 ${options.length === 2 ? 'grid-cols-2' : 'grid-cols-3'} max-w-3xl mx-auto`}>
            {options.map(cat => (
              <button
                key={cat}
                onClick={() => { updateAct(i, { ageCategory: cat }); onNext() }}
                className={`py-7 px-3 rounded-2xl font-display tracking-wider transition-all flex flex-col items-center justify-center gap-1 border active:scale-[0.98] duration-150 ${
                  a.ageCategory === cat
                    ? 'bg-[#1E414C] border-[#1E414C] text-white shadow-md'
                    : cat === avgCat
                      ? 'bg-white text-[#1A1D1E] border-2 border-[#1E414C] hover:bg-[#E8E3D5]'
                      : 'bg-white border-[#C2BCB0] text-[#1A1D1E] active:bg-[#E8E3D5] hover:bg-[#E8E3D5]'
                }`}
              >
                <span className="text-2xl">{AGE_CATEGORY_LABELS[cat].toUpperCase()}</span>
                <span className={`text-xs ${a.ageCategory === cat ? 'opacity-80' : 'opacity-65'}`}>{AGE_CATEGORY_HINTS[cat]}</span>
              </button>
            ))}
          </div>
        </Wrapper>
      )
    }

    case 'act_level': {
      const i = step.i
      const a = state.acts[i]
      return (
        <Wrapper title={`Acto ${i + 1} · ${a.modality ? modalityLabel(a.modality) : ''}`} subtitle="NIVEL">
          <div className="grid grid-cols-2 gap-4 max-w-2xl mx-auto">
            <CategoryButton
              label="BÁSICO"
              selected={a.level === 'basico'}
              onClick={() => { updateAct(i, { level: 'basico' }); onNext() }}
            />
            <CategoryButton
              label="AVANZADO"
              selected={a.level === 'avanzado'}
              onClick={() => { updateAct(i, { level: 'avanzado' }); onNext() }}
            />
          </div>
        </Wrapper>
      )
    }

    case 'act_style': {
      const i = step.i
      const a = state.acts[i]
      return (
        <Wrapper title={`Acto ${i + 1} · ${a.modality ? modalityLabel(a.modality) : ''}`} subtitle="ESTILO">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {STYLES.map((s, idx) => (
              <CategoryButton
                key={s}
                label={s.toUpperCase()}
                selected={a.style === s}
                onClick={() => { updateAct(i, { style: s }); onNext() }}
                className={idx === 6 ? 'col-span-2 md:col-span-1' : ''}
              />
            ))}
          </div>
        </Wrapper>
      )
    }

    case 'act_dancers': {
      const i = step.i
      const a = state.acts[i]
      const needs = requiredDancers(a.modality) ?? 0
      const selected = a.dancerIndices.length
      const valid = selected === needs

      // Group all team dancers by category, sort groups lowest first
      const grouped = new Map<AgeCategory, { d: Dancer, di: number }[]>()
      state.dancers.forEach((d, di) => {
        const cat = effectiveCategory(d)
        if (!cat) return
        if (!grouped.has(cat)) grouped.set(cat, [])
        grouped.get(cat)!.push({ d, di })
      })
      const sortedCats = AGE_CATEGORY_ORDER.filter(c => grouped.has(c))

      // Lock category: if any selected, use that one's category
      const firstSelected = a.dancerIndices[0]
      const lockedCategory: AgeCategory | null = firstSelected !== undefined
        ? effectiveCategory(state.dancers[firstSelected])
        : null

      function toggle(di: number) {
        const d = state.dancers[di]
        const dCat = effectiveCategory(d)
        const cur = a.dancerIndices
        if (cur.includes(di)) {
          const next = cur.filter(x => x !== di)
          // Update act ageCategory if list becomes empty
          updateAct(i, { dancerIndices: next, ageCategory: next.length > 0 ? a.ageCategory : null })
          return
        }
        // Adding: must match locked category
        if (lockedCategory && dCat !== lockedCategory) return
        if (cur.length >= needs) return
        const next = [...cur, di]
        updateAct(i, { dancerIndices: next, ageCategory: dCat })
      }

      return (
        <div className="flex flex-col h-auto lg:h-full max-h-full min-h-0">
          <div className="text-center space-y-3 shrink-0 mb-5">
            <p className="font-display text-xs md:text-sm tracking-[0.4em] text-[#1E414C]">
              {`SELECCIONA ${needs} ${needs === 1 ? 'ALUMNO/A' : 'ALUMNOS/AS'}`}
              {lockedCategory && ` · ${AGE_CATEGORY_LABELS[lockedCategory].toUpperCase()}`}
            </p>
            <h2 className="font-display text-3xl md:text-4xl leading-tight text-[#1A1D1E]">{`Acto ${i + 1} · ${a.modality ? modalityLabel(a.modality) : ''}`}</h2>
          </div>
          {sortedCats.length === 0 ? (
            <div className="flex-1 min-h-0 flex items-center justify-center">
              <p className="text-[#3D4143] text-center text-base italic">
                No hay integrantes con fecha de nacimiento válida en el equipo.<br />
                Regresa y verifica los datos de los alumnos/as.
              </p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-5">
              {sortedCats.map(cat => {
                const list = grouped.get(cat)!
                const disabled = lockedCategory !== null && cat !== lockedCategory
                return (
                  <div key={cat} className={disabled ? 'opacity-30' : ''}>
                    <p className="font-display text-xs tracking-[0.4em] text-[#1E414C] mb-2 sticky top-0 bg-[#F6F4EF] py-1.5 z-10">
                      {AGE_CATEGORY_LABELS[cat].toUpperCase()} · {AGE_CATEGORY_HINTS[cat]}
                    </p>
                    <div className={`grid ${list.length > 6 ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                      {list.map(({ d, di }) => {
                        const isSel = a.dancerIndices.includes(di)
                        return (
                          <button
                            key={di}
                            onClick={() => toggle(di)}
                            disabled={disabled}
                            className={`text-left px-4 py-3 rounded-2xl flex items-center gap-3 border transition-all active:scale-[0.98] duration-150 ${
                              isSel
                                ? 'bg-[#1E414C] border-[#1E414C] text-white shadow-sm'
                                : disabled
                                  ? 'bg-[#E8E3D5] text-[#3D4143]/40 border-[#C2BCB0]/50 cursor-not-allowed opacity-55'
                                  : 'bg-white border-[#C2BCB0] text-[#1A1D1E] active:bg-[#E8E3D5] hover:bg-[#E8E3D5]'
                            }`}
                          >
                            <span className="font-display text-base opacity-50 w-7 text-center shrink-0">{di + 1}</span>
                            <span className="font-display text-xl flex-1 uppercase truncate">{d.name || `Alumno/a ${di + 1}`}</span>
                            {isSel && <Check className="w-5 h-5 shrink-0" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="shrink-0 pt-5 space-y-4">
            <p className="text-center text-[#1A1D1E] font-display text-2xl tracking-wider">
              {selected} / {needs}
            </p>
            <NextButton onClick={onNext} disabled={!valid} />
          </div>
        </div>
      )
    }

    case 'costs': {
      const total = costoTotal(state)
      const valid = state.costPaquete !== null && state.costPaquete >= 0
        && state.costRepeticion !== null && state.costRepeticion >= 0
      return (
        <div className="flex flex-col h-auto lg:h-full min-h-0">
          {!isKeyboardOpen && (
            <div className="shrink-0 text-center space-y-2 lg:space-y-3 pt-2 lg:pt-0 pb-4 lg:pb-6">
              <p className="font-display text-xs lg:text-sm tracking-[0.4em] text-[#1E414C]">COSTOS</p>
              <h2 className="font-display text-2xl md:text-4xl lg:text-6xl leading-tight text-[#1A1D1E]">Costos acordados</h2>
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto pb-3 -mx-1 px-1">
            <div className={`space-y-3 lg:space-y-6 max-w-3xl mx-auto ${isKeyboardOpen ? 'pt-2' : ''}`}>
              {!isKeyboardOpen && (
                <p className="text-[#9E4F36] text-sm lg:text-base italic text-center leading-snug font-medium">
                  Indica los costos que tu academia acordó con los organizadores. Se cobra el de paquete por la primera participación de cada alumno/a, y el de repetición por cada participación adicional.
                </p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
                <div>
                  <label className="block text-xs font-display tracking-widest text-[#3D4143] mb-2 text-center font-bold">PRIMERA PARTICIPACIÓN</label>
                  <MoneyInput
                    value={state.costPaquete}
                    onChange={n => updateState(s => ({ ...s, costPaquete: n }))}
                    onEnter={() => { if (valid) onNext() }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-display tracking-widest text-[#3D4143] mb-2 text-center font-bold">REPETICIÓN</label>
                  <MoneyInput
                    value={state.costRepeticion}
                    onChange={n => updateState(s => ({ ...s, costRepeticion: n }))}
                    onEnter={() => { if (valid) onNext() }}
                  />
                </div>
              </div>
              {valid && (
                <div className={`text-center bg-[#9E4F36] text-white rounded-2xl shadow-sm transition-all duration-150 ${isKeyboardOpen ? 'p-2.5 mt-2.5' : 'p-4 mt-4'}`}>
                  <p className={`font-display tracking-widest opacity-90 leading-none ${isKeyboardOpen ? 'text-[10px] mb-1' : 'text-xs lg:text-sm mb-1.5'}`}>TOTAL A PAGAR</p>
                  <p className={`font-display leading-none ${isKeyboardOpen ? 'text-xl' : 'text-3xl lg:text-4xl'}`}>{formatMoney(total)}</p>
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 pt-2 lg:pt-3">
            <NextButton onClick={onNext} disabled={!valid} />
          </div>
        </div>
      )
    }

    case 'summary':
      return isMobile ? (
        <MobileSummary
          state={state}
          editMode={editMode}
          tab={mobileSummaryTab}
          setTab={setMobileSummaryTab}
          confirm={confirm}
          saving={saving}
          saveErr={saveErr}
          onEditRequest={openEditMenu}
        />
      ) : (
        <SummaryGrid
          state={state}
          editMode={editMode}
          confirm={confirm}
          saving={saving}
          saveErr={saveErr}
          onEditRequest={openEditMenu}
        />
      )

    case 'confirmed':
      return isMobile ? (
        <MobileSummary
          state={state}
          editMode={false}
          tab={mobileSummaryTab}
          setTab={setMobileSummaryTab}
          confirmed
          startEdit={startEdit}
        />
      ) : (
        <SummaryGrid
          state={state}
          editMode={false}
          confirmed
          startEdit={startEdit}
        />
      )
  }
}

function FieldStep({ title, hint, notice, value, onChange, onNext, disabled, type, autoCapitalize, isKeyboardOpen }: {
  title: string
  hint?: string
  notice?: string
  value: string
  onChange: (v: string) => void
  onNext: () => void
  disabled: boolean
  type?: string
  autoCapitalize?: string
  isKeyboardOpen?: boolean
}) {
  return (
    <Wrapper title={title} subtitle={hint} isKeyboardOpen={isKeyboardOpen}>
      <input
        type={type ?? 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !disabled) onNext() }}
        autoCapitalize={autoCapitalize ?? 'words'}
        autoCorrect="off"
        className="w-full bg-white border border-[#C2BCB0] text-[#1A1D1E] text-2xl lg:text-4xl rounded-2xl px-4 py-4 lg:px-6 lg:py-6 outline-none focus:border-[#1E414C] focus:ring-1 focus:ring-[#1E414C] text-center transition-all shadow-sm"
      />
      {notice && (
        <p className="text-[#9E4F36] text-sm lg:text-lg text-center italic font-medium">{notice}</p>
      )}
      <NextButton onClick={onNext} disabled={disabled} />
    </Wrapper>
  )
}

function YesNoStep({ title, value, onYes, onNo }: {
  title: string
  value: boolean | null
  onYes: () => void
  onNo: () => void
}) {
  return (
    <Wrapper title={title}>
      <div className="grid grid-cols-2 gap-3 lg:gap-4 max-w-xl mx-auto w-full aspect-[2/1] lg:aspect-auto">
        <button
          onClick={onNo}
          className={`rounded-2xl font-display text-3xl lg:text-4xl tracking-widest transition-all flex items-center justify-center lg:py-10 active:scale-95 duration-150 ${
            value === false
              ? 'bg-[#1E414C] text-white hover:bg-[#122C34] shadow-md'
              : 'bg-white border border-[#C2BCB0] text-[#1A1D1E] hover:bg-[#E8E3D5] active:bg-[#E8E3D5]'
          }`}
        >
          NO
        </button>
        <button
          onClick={onYes}
          className={`rounded-2xl font-display text-3xl lg:text-4xl tracking-widest transition-all flex items-center justify-center lg:py-10 active:scale-95 duration-150 ${
            value === true
              ? 'bg-[#1E414C] text-white hover:bg-[#122C34] shadow-md'
              : 'bg-white border border-[#C2BCB0] text-[#1A1D1E] hover:bg-[#E8E3D5] active:bg-[#E8E3D5]'
          }`}
        >
          SÍ
        </button>
      </div>
    </Wrapper>
  )
}

function MoneyInput({ value, onChange, onEnter }: {
  value: number | null
  onChange: (n: number | null) => void
  onEnter?: () => void
}) {
  return (
    <div className="relative max-w-sm mx-auto">
      <span className="absolute left-4 lg:left-5 top-1/2 -translate-y-1/2 text-[#1E414C] font-display text-2xl lg:text-3xl pointer-events-none">$</span>
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
        className="w-full bg-white border border-[#C2BCB0] text-[#1A1D1E] text-3xl lg:text-4xl text-center rounded-2xl h-14 lg:h-20 outline-none focus:border-[#1E414C] focus:ring-1 focus:ring-[#1E414C] font-display pl-10 lg:pl-12 pr-10 lg:pr-12 placeholder:text-[#3D4143]/60 transition-all shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  )
}

function NumberInput({ value, onChange, max, disabled, onEnter }: {
  value: number | null
  onChange: (n: number | null) => void
  min: number
  max: number
  disabled?: boolean
  onEnter?: () => void
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value === null ? '' : String(value)}
      onChange={e => {
        if (disabled) return
        const v = e.target.value.replace(/\D/g, '')
        if (v === '') onChange(null)
        else {
          const n = Math.min(max, Number(v))
          onChange(n)
        }
      }}
      onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter() }}
      disabled={disabled}
      className="w-full max-w-xs mx-auto block bg-white border border-[#C2BCB0] text-[#1A1D1E] text-5xl text-center rounded-2xl h-20 outline-none focus:border-[#1E414C] focus:ring-1 focus:ring-[#1E414C] font-display disabled:opacity-60 transition-all shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  )
}

function DateInput({ value, onChange, onEnter }: { value: string, onChange: (iso: string) => void, onEnter?: () => void }) {
  const today = new Date()
  const maxDate = today.toISOString().slice(0, 10)
  const minDate = '1990-01-01'

  return (
    <input
      type="date"
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' && value && onEnter) onEnter() }}
      min={minDate}
      max={maxDate}
      className={`w-full h-16 lg:h-20 rounded-2xl text-center outline-none font-display text-xl lg:text-3xl tracking-wider border transition-all cursor-pointer px-5 ${
        value
          ? 'bg-white border-[#1E414C] text-[#1E414C] focus:ring-1 focus:ring-[#1E414C] shadow-sm'
          : 'bg-white border-[#C2BCB0] text-[#3D4143]/60 focus:border-[#1E414C] focus:ring-1 focus:ring-[#1E414C]'
      }`}
      aria-label="Fecha de nacimiento"
    />
  )
}

function DancerList({ dancers, currentIndex, onSelect }: {
  dancers: Dancer[]
  currentIndex: number
  onSelect: (i: number) => void
}) {
  const completeCount = dancers.filter(d => d.name.trim().length >= 2 && d.birthdate.length === 10).length
  const filled = dancers
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.name.trim().length > 0)

  return (
    <div className="h-full w-full flex flex-col min-h-0">
      <p className="text-xs font-display tracking-[0.4em] text-[#1E414C] mb-4 shrink-0 text-center">
        ALUMNOS/AS · {completeCount}/{dancers.length}
      </p>
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
        <div className="h-full flex flex-col flex-wrap content-center gap-x-12 gap-y-2 px-2">
          {filled.length === 0 && (
            <p className="text-[#3D4143]/60 italic text-base self-center my-auto">Los nombres aparecerán aquí</p>
          )}
          {filled.map(({ d, i }) => {
            const isCurrent = i === currentIndex
            return (
              <button
                key={i}
                onClick={() => onSelect(i)}
                className={`text-center font-display text-2xl uppercase tracking-wide transition-all whitespace-nowrap hover:text-[#1E414C] active:scale-95 duration-150 ${
                  isCurrent ? 'text-[#1E414C] underline underline-offset-4 font-semibold' : 'text-[#265C4B]'
                }`}
              >
                {d.name}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function CategoryButton({ label, selected, onClick, className = '' }: { label: string, selected: boolean, onClick: () => void, className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`py-6 px-4 rounded-2xl font-display text-2xl md:text-3xl lg:text-4xl font-semibold tracking-wider transition-all border active:scale-95 duration-150 ${
        selected
          ? 'bg-[#1E414C] border-[#1E414C] text-white shadow-md'
          : 'bg-white border-[#C2BCB0] text-[#1A1D1E] active:bg-[#E8E3D5] hover:bg-[#E8E3D5]'
      } ${className}`}
    >
      {label}
    </button>
  )
}

function EditNotice({ text }: { text: string }) {
  return (
    <p className="bg-[#9E4F36]/10 border border-[#9E4F36]/30 text-[#9E4F36] text-center text-sm px-4 py-3 rounded-xl font-medium">
      {text}
    </p>
  )
}

function Wrapper({ title, subtitle, children, isKeyboardOpen }: { title: string, subtitle?: string, children: React.ReactNode, isKeyboardOpen?: boolean }) {
  return (
    <div className="flex flex-col h-auto lg:h-full min-h-0">
      <div className="shrink-0 text-center space-y-2 lg:space-y-3 pt-2 lg:pt-0 pb-5 lg:pb-8">
        {subtitle && <p className="font-display text-xs tracking-[0.4em] text-[#1E414C]">{subtitle}</p>}
        <h2 className="font-display text-2xl md:text-4xl lg:text-5xl leading-tight px-2 text-[#1A1D1E]">{title}</h2>
      </div>
      <div className={`flex-1 min-h-0 flex flex-col ${isKeyboardOpen ? 'justify-start pt-2' : 'justify-center'} gap-5 lg:gap-8`}>
        {children}
      </div>
    </div>
  )
}

function NextButton({ onClick, disabled, label }: { onClick: () => void, disabled: boolean, label?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full bg-[#1E414C] active:bg-[#122C34] hover:bg-[#122C34] text-white font-display text-xl lg:text-2xl tracking-widest py-4 lg:py-5 rounded-2xl disabled:opacity-40 transition-all shadow-md active:scale-[0.98] duration-150"
    >
      {label ?? 'SIGUIENTE'}
    </button>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#F6F4EF] text-[#1A1D1E] flex flex-col font-sans">
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
        {children}
      </div>
      <div className="px-6 py-3 shrink-0 flex justify-end">
        <a
          href="https://wa.me/523337290374"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 text-[#3D4143] hover:text-[#1E414C] transition-all group active:scale-98"
        >
          <MessageCircle className="w-5 h-5 text-[#265C4B] shrink-0" />
          <span className="text-sm md:text-base">
            ¿Dudas o ayuda? Escríbenos por WhatsApp:{' '}
            <span className="font-display tracking-wider text-[#1E414C]">333 729 0374</span>
          </span>
        </a>
      </div>
    </div>
  )
}

function MobileSummary({ state, editMode, tab, setTab, confirmed, confirm, saving, saveErr, startEdit, onEditRequest }: {
  state: State
  editMode: boolean
  tab: 'coach' | 'academy' | 'dancers' | 'acts'
  setTab: (t: 'coach' | 'academy' | 'dancers' | 'acts') => void
  confirmed?: boolean
  confirm?: () => Promise<void>
  saving?: boolean
  saveErr?: string | null
  startEdit?: () => void
  onEditRequest?: () => void
}) {
  const filledDancers = state.dancers.filter(d => d.name.trim().length > 0)
  const counts = participacionesPorAlumno(state)
  const total = costoTotal(state)
  const hasCosts = state.costPaquete !== null && state.costRepeticion !== null

  const tabs: { id: 'coach' | 'academy' | 'dancers' | 'acts', label: string, badge?: string }[] = [
    { id: 'coach', label: 'COACH' },
    { id: 'academy', label: 'EQUIPO' },
    { id: 'dancers', label: 'ALUMNOS/AS', badge: String(filledDancers.length) },
    { id: 'acts', label: 'ACTOS', badge: String(state.acts.length) },
  ]

  return (
    <div className="flex flex-col h-full max-h-full min-h-0 gap-3">
      {/* TOTAL A PAGAR siempre visible arriba */}
      {hasCosts && (
        <div className="shrink-0 bg-[#9E4F36] text-white rounded-2xl py-3 px-4 text-center shadow-sm">
          <p className="text-xs font-display tracking-widest opacity-90 leading-none">TOTAL A PAGAR</p>
          <p className="font-display text-3xl leading-none mt-1.5">{formatMoney(total)}</p>
        </div>
      )}

      {/* TABS - Estilo de cápsula iOS Segmented Control */}
      <div className="shrink-0 grid grid-cols-4 gap-1 bg-[#E8E3D5] border border-[#C2BCB0]/40 p-1 rounded-2xl">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`py-2.5 rounded-xl font-display text-xs tracking-widest flex flex-col items-center justify-center gap-0.5 transition-all active:scale-[0.96] duration-150 ${
              tab === t.id
                ? 'bg-white text-[#1E414C] border border-[#C2BCB0]/30 shadow-sm'
                : 'text-[#3D4143] hover:text-[#1E414C] active:bg-[#E8E3D5]/50'
            }`}
          >
            <span>{t.label}</span>
            {t.badge && <span className="text-base font-bold leading-none">{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-white border border-[#C2BCB0] rounded-2xl p-4 shadow-sm text-[#1A1D1E]">
        {tab === 'coach' && (
          <div className="space-y-4 text-center py-4 flex flex-col items-center justify-center animate-[fadeIn_0.2s_ease-out_forwards]">
            <div className="w-14 h-14 bg-[#1E414C]/10 rounded-full flex items-center justify-center text-[#1E414C] mb-1">
              <Pencil className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs tracking-widest text-[#1E414C]/70 uppercase font-bold mb-1">Nombre del Coach</p>
              <p className="font-display text-3xl uppercase text-[#1A1D1E] break-words max-w-xs">{state.coach.name}</p>
            </div>
            <div className="space-y-2 text-base text-[#3D4143]">
              <p className="flex items-center justify-center gap-2">
                <span>📱</span> <span className="font-semibold">{state.coach.phone}</span>
              </p>
              {state.coach.email && (
                <p className="flex items-center justify-center gap-2 text-sm text-[#3D4143]/90 break-all max-w-xs">
                  <span>✉️</span> <span>{state.coach.email}</span>
                </p>
              )}
            </div>
            {state.coach.extras.filter(e => e.trim()).length > 0 && (
              <div className="pt-2 border-t border-[#C2BCB0]/20 w-full max-w-xs">
                <p className="text-[10px] tracking-widest text-[#1E414C] mb-1 font-bold">OTROS COACHES</p>
                <p className="text-sm text-[#3D4143]">{state.coach.extras.filter(e => e.trim()).join(', ')}</p>
              </div>
            )}
          </div>
        )}
        {tab === 'academy' && (
          <div className="space-y-6 text-center py-4 flex flex-col items-center justify-center animate-[fadeIn_0.2s_ease-out_forwards]">
            <div className="w-14 h-14 bg-[#9E4F36]/10 rounded-full flex items-center justify-center text-[#9E4F36] mb-1">
              <Check className="w-6 h-6" />
            </div>
            <div className="w-full max-w-xs">
              <p className="text-xs tracking-widest text-[#1E414C]/70 uppercase font-bold mb-1.5">Colegio / Academia</p>
              <p className="font-display text-3xl uppercase text-[#1A1D1E] break-words leading-tight">{state.academy}</p>
            </div>
            <div className="w-full max-w-xs">
              <p className="text-xs tracking-widest text-[#9E4F36]/70 uppercase font-bold mb-1.5">Nombre del Equipo</p>
              <p className="font-display text-2xl uppercase text-[#265C4B] break-words leading-tight">{state.teamName || state.academy}</p>
            </div>
          </div>
        )}
        {tab === 'dancers' && (
          <div className="space-y-1.5">
            {filledDancers.length === 0 ? (
              <p className="text-[#3D4143]/50 italic text-sm text-center">Sin integrantes</p>
            ) : filledDancers.map(d => {
              const di = state.dancers.indexOf(d)
              const n = counts.get(di) ?? 0
              const cost = hasCosts && n > 0 ? (state.costPaquete ?? 0) + Math.max(0, n - 1) * (state.costRepeticion ?? 0) : null
              return (
                <div key={di} className="flex items-baseline gap-2 py-1.5 border-b border-[#C2BCB0]/30 last:border-0">
                  <span className="font-display text-xs text-[#3D4143]/50 w-6 text-center shrink-0">{di + 1}.</span>
                  <span className="font-display text-base uppercase text-[#265C4B] flex-1 truncate font-semibold">{d.name}</span>
                  {n > 0 && <span className="text-xs text-[#1E414C] font-bold shrink-0">{n}×</span>}
                  {cost !== null && <span className="text-xs text-[#9E4F36] font-bold shrink-0">{formatMoney(cost)}</span>}
                </div>
              )
            })}
          </div>
        )}
        {tab === 'acts' && (
          <div className="space-y-3">
            {state.acts.length === 0 ? (
              <p className="text-[#3D4143]/50 italic text-sm text-center">Sin actos</p>
            ) : state.acts.map((a, i) => {
              const cat = a.ageCategory ? AGE_CATEGORY_LABELS[a.ageCategory] : '—'
              const mod = a.modality ? modalityLabel(a.modality) : '—'
              const lvl = a.modality === 'grupal' ? (a.level === 'basico' ? ' BÁSICO' : a.level === 'avanzado' ? ' AVANZADO' : '') : ''
              return (
                <div key={i} className="border-b border-[#C2BCB0]/30 last:border-0 pb-2 last:pb-0">
                  <div className="font-display text-base text-[#1A1D1E] font-semibold">
                    <span className="text-[#1E414C]">#{i + 1}</span> {cat.toUpperCase()} · {mod}{lvl}
                  </div>
                  <div className="text-xs text-[#3D4143] mt-0.5">{a.style ?? '—'}</div>
                  {a.dancerIndices.length > 0 && (
                    <div className="text-[11px] text-[#3D4143]/80 mt-0.5 font-medium">
                      {a.dancerIndices.map(di => state.dancers[di]?.name).filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* BUTTONS */}
      {saveErr && (
        <p className="shrink-0 text-[#9E4F36] text-xs bg-[#9E4F36]/10 border border-[#9E4F36]/30 rounded-xl px-3 py-2.5 break-words font-medium">{saveErr}</p>
      )}
      {confirmed ? (
        <button
          onClick={startEdit}
          className="shrink-0 h-14 flex items-center justify-center gap-2 bg-white border border-[#C2BCB0] hover:bg-[#E8E3D5] text-[#1A1D1E] font-display text-lg tracking-widest rounded-2xl transition-all shadow-sm active:scale-[0.98] duration-150"
        >
          <Pencil className="w-5 h-5 text-[#1E414C]" /> EDITAR REGISTRO
        </button>
      ) : (
        <div className="shrink-0 grid grid-cols-2 gap-2">
          <button
            onClick={onEditRequest}
            className="h-14 flex items-center justify-center gap-2 bg-white border border-[#C2BCB0] hover:bg-[#E8E3D5] text-[#1A1D1E] font-display text-base tracking-widest rounded-2xl transition-all shadow-sm active:scale-[0.98] duration-150"
          >
            <Pencil className="w-5 h-5 text-[#1E414C]" /> EDITAR
          </button>
          <button
            onClick={() => {
              if (tab === 'coach') setTab('academy')
              else if (tab === 'academy') setTab('dancers')
              else if (tab === 'dancers') setTab('acts')
              else if (confirm) confirm()
            }}
            disabled={saving}
            className="h-14 bg-[#1E414C] hover:bg-[#122C34] active:bg-[#122C34] text-white font-display text-base tracking-widest rounded-2xl disabled:opacity-50 transition-all shadow-md active:scale-[0.98] duration-150"
          >
            {tab !== 'acts'
              ? 'SIGUIENTE'
              : saving
              ? 'GUARDANDO…'
              : editMode
              ? 'GUARDAR'
              : 'CONFIRMAR'}
          </button>
        </div>
      )}
    </div>
  )
}

function SummaryGrid({ state, editMode, confirmed, confirm, saving, saveErr, startEdit, onEditRequest }: {
  state: State
  editMode: boolean
  confirmed?: boolean
  confirm?: () => Promise<void>
  saving?: boolean
  saveErr?: string | null
  startEdit?: () => void
  onEditRequest?: () => void
}) {
  const filledDancers = state.dancers.filter(d => d.name.trim().length > 0)
  const counts = participacionesPorAlumno(state)
  const total = costoTotal(state)
  const hasCosts = state.costPaquete !== null && state.costRepeticion !== null
  return (
    <div className="lg:h-full lg:max-h-full lg:min-h-0 grid grid-cols-1 lg:grid-cols-6 lg:grid-rows-[auto_minmax(0,1fr)] gap-4 w-full">
      <div className="lg:col-span-2 lg:min-h-0">
        <Card title="COACH">
          <p className="text-xl md:text-2xl lg:text-3xl font-display uppercase truncate text-[#1A1D1E]">{state.coach.name}</p>
          <p className="text-sm md:text-base text-[#3D4143] mt-2 truncate">
            {state.coach.phone}{state.coach.email ? ` · ${state.coach.email}` : ''}
          </p>
          {state.coach.extras.filter(e => e.trim()).length > 0 && (
            <p className="text-sm text-[#3D4143] mt-1 truncate">Otros: {state.coach.extras.filter(e => e.trim()).join(', ')}</p>
          )}
        </Card>
      </div>

      <div className="lg:col-span-3 lg:min-h-0">
        <Card title="ACADEMIA · EQUIPO">
          <p className="text-xl md:text-2xl lg:text-3xl font-display uppercase truncate text-[#1A1D1E]">{state.academy}</p>
          <p className="text-sm md:text-base text-[#3D4143] mt-2 truncate">{state.teamName}</p>
        </Card>
      </div>

      <div className="lg:col-span-1 lg:min-h-0">
        {hasCosts ? (
          <div className="bg-[#9E4F36] text-white rounded-2xl h-full p-4 flex flex-col items-center justify-center shadow-sm">
            <p className="text-base md:text-lg font-display tracking-widest opacity-90 leading-none text-center">TOTAL A PAGAR</p>
            <p className="font-display text-3xl md:text-4xl leading-none mt-2">{formatMoney(total)}</p>
          </div>
        ) : (
          <div className="bg-white border border-[#C2BCB0] rounded-2xl h-full p-3 flex items-center justify-center shadow-sm">
            <p className="text-[#3D4143]/50 italic text-sm text-center">Sin costos</p>
          </div>
        )}
      </div>

      <div className="lg:col-span-4 lg:min-h-0">
        <Card title={`INTEGRANTES (${filledDancers.length})`} className="lg:h-full">
          <div className="max-h-[60vh] lg:max-h-none lg:flex-1 lg:min-h-0 overflow-y-auto lg:overflow-x-auto lg:overflow-y-hidden">
            <div className="lg:h-full flex flex-col lg:flex-wrap lg:content-start gap-x-12 gap-y-2 px-1">
              {filledDancers.length === 0 ? (
                <p className="text-[#3D4143]/50 italic text-base self-center my-auto">Sin integrantes</p>
              ) : filledDancers.map((d) => {
                const di = state.dancers.indexOf(d)
                const n = counts.get(di) ?? 0
                const cost = hasCosts && n > 0 ? (state.costPaquete ?? 0) + Math.max(0, n - 1) * (state.costRepeticion ?? 0) : null
                return (
                  <div key={di} className="font-display text-lg md:text-xl lg:text-2xl uppercase text-[#265C4B] whitespace-nowrap flex items-baseline gap-3">
                    <span className="opacity-40 text-sm text-[#3D4143]">{di + 1}.</span>
                    <span>{d.name}</span>
                    {n > 0 && <span className="text-sm text-[#1E414C] font-bold">{n} acto{n === 1 ? '' : 's'}</span>}
                    {cost !== null && <span className="text-sm text-[#9E4F36] font-bold">{formatMoney(cost)}</span>}
                  </div>
                )
              })}
            </div>
          </div>
        </Card>
      </div>

      <div className="lg:col-span-2 flex flex-col gap-3 lg:min-h-0">
        <Card title={`ACTOS (${state.acts.length})`} className="lg:flex-1 lg:min-h-0">
          <div className="max-h-[50vh] lg:max-h-none lg:flex-1 lg:min-h-0 overflow-y-auto pr-1 space-y-3">
            {state.acts.length === 0 ? (
              <p className="text-[#3D4143]/50 italic text-base">Sin actos</p>
            ) : state.acts.map((a, i) => {
              const cat = a.ageCategory ? AGE_CATEGORY_LABELS[a.ageCategory] : '—'
              const mod = a.modality ? modalityLabel(a.modality) : '—'
              const lvl = a.modality === 'grupal' ? (a.level === 'basico' ? ' BÁSICO' : a.level === 'avanzado' ? ' AVANZADO' : '') : ''
              return (
                <div key={i} className="border-b border-[#C2BCB0]/30 last:border-0 pb-3 last:pb-0">
                  <div className="font-display text-lg text-[#1A1D1E]">
                    <span className="text-[#1E414C]">#{i + 1}</span>{' '}
                    {cat.toUpperCase()} · {mod}{lvl}
                  </div>
                  <div className="text-base text-[#3D4143] mt-1">{a.style ?? '—'}</div>
                  {a.dancerIndices.length > 0 && (
                    <div className="text-xs text-[#3D4143]/70 mt-1">
                      {a.dancerIndices.map(di => state.dancers[di]?.name).filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
        {confirmed ? (
          <button
            onClick={startEdit}
            className="shrink-0 h-28 flex items-center justify-center gap-2 bg-white border border-[#C2BCB0] hover:bg-[#E8E3D5] text-[#1A1D1E] font-display text-2xl tracking-widest rounded-2xl transition-all shadow-sm active:scale-[0.98] duration-150"
          >
            <Pencil className="w-6 h-6 text-[#1E414C]" /> EDITAR REGISTRO
          </button>
        ) : (
          <>
            <button
              onClick={onEditRequest}
              className="shrink-0 h-14 flex items-center justify-center gap-2 bg-white border border-[#C2BCB0] hover:bg-[#E8E3D5] text-[#1A1D1E] font-display text-lg tracking-widest rounded-2xl transition-all shadow-sm active:scale-[0.98] duration-150"
            >
              <Pencil className="w-5 h-5 text-[#1E414C]" /> EDITAR
            </button>
            <button
              onClick={confirm}
              disabled={saving}
              className="shrink-0 h-28 bg-[#1E414C] hover:bg-[#122C34] active:bg-[#122C34] text-white font-display text-2xl tracking-widest rounded-2xl disabled:opacity-50 transition-all shadow-md active:scale-[0.98] duration-150"
            >
              {saving ? 'GUARDANDO…' : editMode ? 'GUARDAR CAMBIOS' : 'CONFIRMAR REGISTRO'}
            </button>
          </>
        )}
        {saveErr && (
          <p className="shrink-0 text-[#9E4F36] text-sm bg-[#9E4F36]/10 border border-[#9E4F36]/30 rounded-2xl px-3 py-2 break-words font-medium">{saveErr}</p>
        )}
      </div>
    </div>
  )
}

function Card({ title, children, className }: { title: string, children: React.ReactNode, className?: string }) {
  return (
    <div className={`bg-white border border-[#C2BCB0] rounded-2xl p-5 flex flex-col min-h-0 shadow-sm text-[#1A1D1E] ${className ?? ''}`}>
      <p className="text-xs font-display tracking-widest text-[#1E414C] mb-3 shrink-0">{title}</p>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  )
}

function Summary({ state, compact }: { state: State, compact?: boolean }) {
  return (
    <div className="space-y-3 text-left">
      <SummaryBlock label="COACH">
        <div className="text-2xl font-display text-[#1A1D1E]">{state.coach.name}</div>
        <div className="text-base text-[#3D4143] mt-1">{state.coach.phone}{state.coach.email ? ` · ${state.coach.email}` : ''}</div>
        {state.coach.extras.filter(e => e.trim()).length > 0 && (
          <div className="text-sm text-[#3D4143] mt-1">Otros coaches: {state.coach.extras.filter(e => e.trim()).join(', ')}</div>
        )}
      </SummaryBlock>

      <SummaryBlock label="ACADEMIA · EQUIPO">
        <div className="text-2xl font-display text-[#1A1D1E]">{state.academy}</div>
        <div className="text-base text-[#3D4143] mt-1">{state.teamName}</div>
      </SummaryBlock>

      <SummaryBlock label={`ALUMNOS/AS (${state.dancers.length})`}>
        <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2'} gap-x-6 gap-y-1`}>
          {state.dancers.map((d, i) => (
            <div key={i} className="flex justify-between text-base border-b border-[#C2BCB0]/30 last:border-0 py-1 text-[#1A1D1E]">
              <span className="truncate">{d.name}</span>
              <span className="text-[#3D4143] ml-2 shrink-0">{formatBirthdate(d.birthdate)}</span>
            </div>
          ))}
        </div>
      </SummaryBlock>

      <SummaryBlock label={`ACTOS (${state.acts.length})`}>
        <div className="space-y-2">
          {state.acts.map((a, i) => {
            const cat = a.ageCategory ? AGE_CATEGORY_LABELS[a.ageCategory] : '—'
            const mod = a.modality ? modalityLabel(a.modality) : '—'
            const lvl = a.modality === 'grupal' ? (a.level === 'basico' ? ' BÁSICO' : a.level === 'avanzado' ? ' AVANZADO' : '') : ''
            return (
            <div key={i} className="border-b border-[#C2BCB0]/30 last:border-0 py-2 text-[#1A1D1E]">
              <div className="font-display text-lg">
                <span className="text-[#1E414C]">#{i + 1}</span>{' '}
                {cat.toUpperCase()} · {mod}{lvl} · {a.style ?? '—'}
              </div>
              {a.dancerIndices.length > 0 && (
                <div className="text-sm text-[#3D4143] mt-1">
                  {a.dancerIndices.map(di => state.dancers[di]?.name).filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            )
          })}
        </div>
      </SummaryBlock>
    </div>
  )
}

function SummaryBlock({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#C2BCB0] rounded-2xl p-4 shadow-sm">
      <div className="text-xs font-display tracking-widest text-[#1E414C] mb-2">{label}</div>
      {children}
    </div>
  )
}
