'use client'
import { useEffect, useState, use, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, Pencil, MessageCircle, Info, X, ChevronDown, Sparkles, Users, Clipboard, HeartHandshake, School, Clock, Calendar, Ticket, Download, Eye, DollarSign } from 'lucide-react'
import { supabase, type Modality, type AgeCategory, type Level, type Event, AGE_CATEGORY_ORDER, AGE_CATEGORY_LABELS, AGE_CATEGORY_HINTS, categoryFromBirthdate } from '@/lib/supabase'
import { type State, type Step, type Coach, type Dancer, type Act, STYLES, CATEGORY_COLORS, DEFAULT_DANCER_COLOR, MODALITY_OPTIONS } from '@/components/register/types'
import { minDancers, maxDancers, modalityLabel, effectiveCategory, ageFromBirthdate, initialState, participacionesPorAlumno, getRegistrationDeadline, getChangesDeadline, isBeforeTicketsDeadline, getPrecioEntradaRegistro, isBeforeJune15, costBreakdown, costoTotal, formatMoney, formatEventDate, formatBirthdate, getDancerDisplayName, parseSmartList, LS_KEY, extractErrorMessage } from '@/components/register/utils'
import StepView from '@/components/register/StepView'
import Centered from '@/components/register/Centered'

type Props = { params: Promise<{ eventId: string }> }

export default function RegisterPage({ params }: Props) {
  const { eventId } = use(params)
  const search = useSearchParams()
  const token = search.get('t') ?? ''

  const [event, setEvent] = useState<Event | null>(null)
  const [authState, setAuthState] = useState<'loading' | 'ok' | 'invalid'>('loading')
  const [state, setState] = useState<State>(initialState)
  const [step, setStep] = useState<Step>({ kind: 'welcome' })
  const stepKindRef = useRef(step.kind)
  useEffect(() => {
    stepKindRef.current = step.kind
  }, [step.kind])
  const [editMode, setEditMode] = useState(false)
  const [isEditSave, setIsEditSave] = useState(false)
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
      if (step.kind === 'welcome' || authState === 'loading') {
        if (metaTheme) metaTheme.setAttribute('content', '#000000')
        document.body.style.setProperty('background-color', '#000000', 'important')
        document.documentElement.style.setProperty('background-color', '#000000', 'important')
      } else if (showSuccessSplash) {
        if (metaTheme) metaTheme.setAttribute('content', '#16A34A')
        document.body.style.setProperty('background-color', '#16A34A', 'important')
        document.documentElement.style.setProperty('background-color', '#16A34A', 'important')
      } else {
        if (metaTheme) metaTheme.setAttribute('content', '#F6F4EF')
        document.body.style.setProperty('background-color', 'rgb(var(--c-surface))', 'important')
        document.documentElement.style.setProperty('background-color', 'rgb(var(--c-surface))', 'important')
      }
    } catch { /* ignore document reference errors on SSR */ }
  }, [step.kind, authState, showSuccessSplash])

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

  // Salvaguarda para evitar destellos del estado previo o del bfcache de WebKit en iOS Chrome/Safari
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    // 1. Escuchar el evento pageshow (bfcache de WebKit en iOS)
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload()
      }
    }
    window.addEventListener('pageshow', handlePageShow)

    // 2. Forzar que el estado en montaje sea estrictamente welcome (o confirmed si ya se completó)
    try {
      const raw = localStorage.getItem(LS_KEY(eventId))
      if (raw) {
        const saved = JSON.parse(raw) as State
        if (saved.confirmedRegistrationId) {
          setStep({ kind: 'confirmed' })
        } else {
          setStep({ kind: 'welcome' })
        }
      } else {
        setStep({ kind: 'welcome' })
      }
    } catch {
      setStep({ kind: 'welcome' })
    }

    return () => {
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [eventId])

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
        const isReset = search.get('reset') === 'true' || search.get('new') === 'true'
        if (isReset) {
          localStorage.removeItem(LS_KEY(eventId))
        } else {
          const raw = localStorage.getItem(LS_KEY(eventId))
          if (raw) {
          const saved = JSON.parse(raw) as State
          // Handle migration of old coach data structure
          if (saved.coach && !saved.coach.assistants) {
            saved.coach.assistants = []
          }
          if (saved.costPaquete === null) {
            saved.costPaquete = 2700
          }
          if (saved.costRepeticion === null) {
            saved.costRepeticion = 500
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
          if (saved.confirmedRegistrationId) {
            setStep({ kind: 'confirmed' })
            // Fetch precise confirmed_at from database to be absolutely sure we have the exact confirmation timestamp
            ;(async () => {
              try {
                const { data: regData } = await supabase
                  .from('coach_registrations')
                  .select('confirmed_at')
                  .eq('id', saved.confirmedRegistrationId)
                  .single()
                if (regData && regData.confirmed_at) {
                  setState(s => {
                    if (s.confirmedRegistrationId === saved.confirmedRegistrationId && s.confirmedAt !== regData.confirmed_at) {
                      return { ...s, confirmedAt: regData.confirmed_at }
                    }
                    return s
                  })
                }
              } catch (e) {
                console.error("Failed to fetch confirmation timestamp:", e)
              }
            })()
          }
        }
      }
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [eventId, token])

  useEffect(() => {
    if (authState !== 'ok') return
    try { localStorage.setItem(LS_KEY(eventId), JSON.stringify(state)) } catch { /* ignore */ }
  }, [state, eventId, authState])

  // Auto-initialize first empty act if acts step is reached with 0 acts
  useEffect(() => {
    if (step.kind === 'acts' && state.acts.length === 0) {
      setActsConfirmed(false)
      setState(s => {
        const acts = [...s.acts, { modality: null, ageCategory: null, level: null, style: null, dancerIndices: [] }]
        return { ...s, acts, actCount: acts.length }
      })
      setActiveActIndex(0) // Focus on this first act!
    }
  }, [step.kind, state.acts.length])

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
      if (typeof window === 'undefined') return false
      if (window.innerHeight > initialHeight) initialHeight = window.innerHeight
      // If viewport is back to (near) full size, keyboard is definitely closed
      if (vv && vv.height >= initialHeight * 0.85) return false
      // If viewport is shrunken, check activeElement to confirm keyboard is open
      if (vv && (vv.height < window.screen.height * 0.75 || vv.height < initialHeight * 0.85)) {
        const activeEl = document.activeElement
        if (activeEl) {
          const tagName = activeEl.tagName.toLowerCase()
          const type = (activeEl as HTMLInputElement).type?.toLowerCase()
          const isTextInput =
            tagName === 'textarea' ||
            (tagName === 'input' && ['text','number','email','tel','url','search','password','date','datetime-local','month','week','time'].includes(type))
          if (isTextInput) return true
        }
        return true
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
        if (stepKindRef.current !== 'welcome' && stepKindRef.current !== 'confirmed') {
          return
        }
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
      setTimeout(updateHeight, 150)
      setTimeout(updateHeight, 500)
      setTimeout(updateHeight, 1000)
    }

    const handleTouchStart = () => {
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
      document.addEventListener('touchstart', handleTouchStart, { passive: true })
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
        document.removeEventListener('touchstart', handleTouchStart)
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

      const costPaquete = state.costPaquete ?? event.default_cost_paquete ?? 2700
      const costRepeticion = state.costRepeticion ?? event.default_cost_repeticion ?? 500

      const extrasMerged = [
        ...state.coach.assistants.map(a => `Asistente: ${a.trim()}`).filter(a => a !== 'Asistente:'),
      ]

      const submittedAt = new Date().toISOString()

      if (isUpdate) {
        registrationId = state.confirmedRegistrationId!
        // On update, fetch current confirmed_at to preserve it
        const { data: existing } = await supabase
          .from('coach_registrations')
          .select('confirmed_at, extra_coaches')
          .eq('id', registrationId)
          .single()

        const existingExtras = (existing?.extra_coaches as string[] | null) ?? []
        const existingConfirmedAt = existing?.confirmed_at as string | null ?? null
        const mergedExtras = [...new Set([
          ...existingExtras.filter((s: string) => !s.startsWith('Asistente:')),
          ...extrasMerged,
        ])]

        const { error: updErr } = await supabase
          .from('coach_registrations')
          .update({
            coach_name: state.coach.name.trim(),
            coach_phone: state.coach.phone.trim(),
            coach_email: state.coach.email.trim() || null,
            extra_coaches: mergedExtras,
            academy: state.city.trim() ? `${state.academy.trim()} (${state.city.trim()})` : state.academy.trim(),
            team_name: state.academy.trim(),
            cost_paquete: costPaquete,
            cost_repeticion: costRepeticion,
            confirmed_at: existingConfirmedAt,
            submitted_at: submittedAt,
            tickets_count: state.ticketsCount ?? 0,
            notes: state.notes?.trim() || null,
          })
          .eq('id', registrationId)
        if (updErr) throw updErr

        const { error: delActErr } = await supabase
          .from('registration_acts')
          .delete()
          .eq('registration_id', registrationId)
        if (delActErr) throw delActErr

        const { error: delDancerErr } = await supabase
          .from('registration_dancers')
          .delete()
          .eq('registration_id', registrationId)
        if (delDancerErr) throw delDancerErr
      } else {
        const { data: regData, error: regErr } = await supabase
          .from('coach_registrations')
          .insert({
            event_id: event.id,
            coach_name: state.coach.name.trim(),
            coach_phone: state.coach.phone.trim(),
            coach_email: state.coach.email.trim() || null,
            extra_coaches: extrasMerged,
            academy: state.city.trim() ? `${state.academy.trim()} (${state.city.trim()})` : state.academy.trim(),
            team_name: state.academy.trim(),
            cost_paquete: costPaquete,
            cost_repeticion: costRepeticion,
            submitted_at: submittedAt,
            tickets_count: state.ticketsCount ?? 0,
            notes: state.notes?.trim() || null,
          })
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

      // Write audit log for coach submission
      try {
        await supabase.from('registration_edit_log').insert({
          registration_id: registrationId,
          edited_by: 'coach',
          action: isUpdate ? 'update' : 'create',
          entity_type: 'registration',
          changes: isUpdate ? { resubmitted: { old: null, new: submittedAt } } : { submitted: { old: null, new: submittedAt } },
          created_at: new Date().toISOString(),
        })
      } catch {}

      setState(s => ({ 
        ...s, 
        confirmedRegistrationId: registrationId,
        confirmedAt: s.confirmedAt ?? null,
      }))
      setEditMode(false)
      setShowSuccessSplash(true)
      setStep({ kind: 'confirmed' })
      setTimeout(() => {
        setShowSuccessSplash(false)
      }, 3500)

      setTimeout(() => {
        try {
          window.scrollTo({ top: 0, behavior: 'smooth' })
          document.querySelectorAll('.overflow-y-auto').forEach(el => {
            el.scrollTo({ top: 0, behavior: 'smooth' })
          })
        } catch (err) {
          console.error('Scroll error:', err)
        }
      }, 200)
    } catch (e) {
      setSaveErr(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }


  function startEdit() {
    setEditMode(true)
    setIsEditSave(true)
    setStep({ kind: 'setup' })
  }


  if (authState === 'loading') {
    return (
      <div 
        className="min-h-[100dvh] flex flex-col items-center justify-center p-6 select-none" 
        style={{ background: '#000000' }}
      >
        <div className="flex flex-col items-center gap-4">
          <Sparkles className="w-8 h-8 text-amber-400 animate-spin" style={{ animationDuration: '3s' }} />
          <p className="font-display text-xl tracking-[0.2em] font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-amber-200 to-amber-400 animate-pulse uppercase">
            CARGANDO...
          </p>
        </div>
      </div>
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
      className={`text-[rgb(var(--c-text-strong))] flex flex-col overflow-hidden font-sans select-none w-full transition-colors duration-300 ${
        step.kind === 'welcome' ? 'bg-black' : 'bg-[rgb(var(--c-surface))]'
      }`}
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
              {isEditSave ? 'CAMBIOS GUARDADOS' : 'REGISTRO ENVIADO'}
            </h1>
            <p className="text-lg lg:text-xl text-[rgb(var(--c-surface)/0.9)] leading-relaxed font-medium">
              {isEditSave ? 'Cambios al registro guardados con exito.' : 'Tu registro fue enviado. Un organizador lo revisara y confirmara pronto.'}
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
      <meta name="theme-color" content={step.kind === 'welcome' ? '#000000' : '#F6F4EF'} />

      <main
        className={`flex-1 min-h-0 flex flex-col overflow-y-auto lg:overflow-hidden transition-colors duration-300 ${step.kind === 'welcome' ? 'px-0 bg-black' : 'px-0 sm:px-4 lg:px-8'}`}
        style={{
          paddingTop: step.kind === 'welcome' ? '0px' : 'env(safe-area-inset-top, 0px)',
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
                { label: 'COREOGRAFÍAS', kind: 'acts' },
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

        <div className={`flex-1 min-h-0 flex justify-center transition-colors duration-300 ${step.kind === 'welcome' ? 'bg-black' : ''}`}>
          <div className={`w-full ${step.kind === 'welcome' ? 'bg-black' : step.kind === 'summary' || step.kind === 'confirmed' || step.kind === 'dancers' ? 'max-w-6xl' : 'max-w-3xl'} min-h-full lg:h-full flex flex-col justify-start lg:justify-center transition-colors duration-300 ${step.kind === 'welcome' ? 'bg-black' : isKeyboardOpen ? 'pt-[1vh] lg:pt-3' : 'pt-0 sm:pt-2 lg:pt-0'} min-h-0`}>
            <StepView
              step={step}
              state={state}
              event={event}
              isKeyboardOpen={isKeyboardOpen}
              editMode={editMode}
              isEditSave={isEditSave}
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
            className="flex items-center gap-1.5 text-purple-700 font-display font-bold text-sm bg-purple-50 border border-purple-200/60 px-4 py-2.5 rounded-2xl active:scale-95 hover:bg-purple-100/60 transition-all duration-150 shadow-sm"
          >
            <ArrowLeft className="w-4 h-4 text-purple-600" />
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
                {state.acts.length} {state.acts.length === 1 ? 'Coreografía' : 'Coreografías'}
              </span>
            )}
            {step.kind === 'summary' && (
              <span className="text-xs font-display text-[rgb(var(--c-primary))] font-bold bg-[rgb(var(--c-primary)/0.1)] border border-[rgb(var(--c-primary)/0.2)] px-3 py-1 rounded-full">
                {state.dancers.length} Alum. / {state.acts.length} {state.acts.length === 1 ? 'Coreografía' : 'Coreografías'}
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
                className="flex items-center gap-1 text-white bg-gradient-to-r from-purple-700 via-purple-600 to-pink-600 hover:from-purple-800 hover:to-pink-700 font-display font-bold text-sm px-5 py-2.5 rounded-2xl disabled:opacity-40 disabled:pointer-events-none active:scale-95 transition-all duration-150 shadow-[0_4px_12px_rgba(168,85,247,0.3)]"
              >
                CONFIRMAR COREOGRAFÍA
              </button>
            ) : (
              <button
                onClick={goNext}
                disabled={
                  step.kind === 'setup' && (state.coach.name.trim().length < 2 || state.coach.phone.trim().length < 8 || state.coach.email.trim().length < 5 || !state.coach.email.includes('@') || !state.coach.email.includes('.') || state.academy.trim().length < 2 || !state.city || state.city.trim().length < 2)
                  || step.kind === 'dancers' && (state.dancers.length === 0 || state.dancers.some(d => d.name.trim().length < 2 || d.birthdate.length !== 10))
                  || step.kind === 'acts' && (state.acts.length === 0 || state.acts.some(a => !a.modality || !a.style || a.dancerIndices.length === 0))
                }
                className="flex items-center gap-1.5 text-white bg-gradient-to-r from-purple-700 via-purple-600 to-pink-600 hover:from-purple-800 hover:to-pink-700 font-display font-bold text-sm px-5 py-2.5 rounded-2xl disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all duration-150 shadow-[0_4px_12px_rgba(168,85,247,0.3)]"
              >
                {step.kind === 'acts' ? 'SIGUIENTE: RESUMEN' : 'SIGUIENTE'}
                <ArrowRight className="w-4 h-4 animate-pulse" />
              </button>
            )
          ) : (
            <button
              onClick={confirm}
              disabled={saving}
              className="flex items-center gap-1.5 text-white bg-gradient-to-r from-purple-700 via-purple-600 to-pink-600 hover:from-purple-800 hover:to-pink-700 font-display font-bold text-sm px-5 py-2.5 rounded-2xl disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all duration-150 shadow-[0_4px_12px_rgba(168,85,247,0.3)]"
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
