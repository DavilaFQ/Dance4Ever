'use client'
import { useEffect, useState, use, useCallback, useRef } from 'react'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, Pencil, MessageCircle, Info, X, ChevronDown, Sparkles, Users, Clipboard, HeartHandshake, School, Clock, Calendar, Ticket, Download, Eye, DollarSign } from 'lucide-react'
import { supabase, type Modality, type AgeCategory, type Level, type Event, AGE_CATEGORY_ORDER, AGE_CATEGORY_LABELS, AGE_CATEGORY_HINTS, categoryFromBirthdate } from '@/lib/supabase'
import { type State, type Step, type Coach, type Dancer, type Act, STYLES, CATEGORY_COLORS, DEFAULT_DANCER_COLOR, MODALITY_OPTIONS } from '@/components/register/types'
import { minDancers, maxDancers, modalityLabel, effectiveCategory, ageFromBirthdate, initialState, participacionesPorAlumno, getRegistrationDeadline, getChangesDeadline, isBeforeTicketsDeadline, getPrecioEntradaRegistro, isBeforeCoreoDeadline, costBreakdown, costoTotal, formatMoney, formatEventDate, formatBirthdate, getDancerDisplayName, parseSmartList, LS_KEY, extractErrorMessage } from '@/components/register/utils'
import StepView from '@/components/register/StepView'
import Centered from '@/components/register/Centered'
import { subscribePortalConfig, PortalConfig } from '@/lib/portalConfig'
import PortalLockout from '@/components/PortalLockout'


type Props = { params: Promise<{ eventId: string }> }

export default function RegisterPage({ params }: Props) {
  const { eventId } = use(params)
  const search = useSearchParams()
  const token = search.get('t') ?? ''

  const [event, setEvent] = useState<Event | null>(null)
  const [authState, setAuthState] = useState<'loading' | 'ok' | 'invalid'>('loading')
  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null)
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
  const [signature, setSignature] = useState<string | null>(null)


  // Acts confirmation flow
  const [activeActIndex, setActiveActIndex] = useState<number | null>(0)
  const [actsConfirmed, setActsConfirmed] = useState(false)

  // Smart Paste Modal State
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')

  // Draft persistence in Supabase
  const [draftId] = useState(() => {
    const LS_DRAFT_KEY = `d4e:register-draft-id:${eventId}`
    const existing = typeof window !== 'undefined' ? localStorage.getItem(LS_DRAFT_KEY) : null
    if (existing) return existing
    const id = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
        })
    try { localStorage.setItem(LS_DRAFT_KEY, id) } catch { /* ignore */ }
    return id
  })
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)

  // Track the coach_registrations.id when a draft is saved (setup → dancers)
  const [draftRegistrationId, setDraftRegistrationId] = useState<number | null>(null)
  const draftRegIdRef = useRef<number | null>(null)
  draftRegIdRef.current = draftRegistrationId

  const saveDraftToSupabase = useCallback(async (s: State) => {
    if (savingRef.current) return
    if (s.confirmedRegistrationId) return // don't save drafts for confirmed registrations
    savingRef.current = true
    try {
      // 1. Save full state draft
      await supabase.from('registration_drafts').upsert({
        draft_id: draftId,
        event_id: eventId,
        state: s as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })

      // 2. Automatically upsert into coach_registrations as a draft in the dashboard
      const coachName = s.coach.name.trim()
      const academyName = s.academy.trim()
      if (coachName.length >= 2 && academyName.length >= 2) {
        const assistants = s.coach.assistants
          .map(a => `Asistente: ${a.trim()}`)
          .filter(a => a !== 'Asistente:')
        const academy = s.city.trim()
          ? `${academyName} (${s.city.trim()})`
          : academyName

        let regId = draftRegIdRef.current

        if (regId) {
          await supabase.from('coach_registrations').update({
            coach_name: coachName,
            coach_phone: s.coach.phone.trim(),
            coach_email: s.coach.email.trim() || null,
            extra_coaches: assistants,
            academy,
            team_name: academyName,
            tickets_count: s.ticketsCount ?? 0,
            notes: s.notes?.trim() || null,
          }).eq('id', regId)
        } else {
          // Check if a row with this draft_id already exists in coach_registrations to prevent double insert
          const { data: existingRegs } = await supabase
            .from('coach_registrations')
            .select('id')
            .eq('draft_id', draftId)
            .limit(1)

          if (existingRegs && existingRegs.length > 0) {
            regId = existingRegs[0].id
            setDraftRegistrationId(regId)
            await supabase.from('coach_registrations').update({
              coach_name: coachName,
              coach_phone: s.coach.phone.trim(),
              coach_email: s.coach.email.trim() || null,
              extra_coaches: assistants,
              academy,
              team_name: academyName,
              tickets_count: s.ticketsCount ?? 0,
              notes: s.notes?.trim() || null,
            }).eq('id', regId)
          } else {
            const { data } = await supabase.from('coach_registrations').insert({
              event_id: eventId,
              draft_id: draftId,
              coach_name: coachName,
              coach_phone: s.coach.phone.trim(),
              coach_email: s.coach.email.trim() || null,
              extra_coaches: assistants,
              academy,
              team_name: academyName,
              submitted_at: '1970-01-01T00:00:00Z',
              tickets_count: s.ticketsCount ?? 0,
              notes: s.notes?.trim() || null,
            }).select('id').single()
            if (data) {
              regId = data.id
              setDraftRegistrationId(regId)
            }
          }
        }

        // Sync dancers and acts in real-time as part of the draft!
        if (regId) {
          // A. Delete existing entries to replace them
          await supabase.from('registration_dancers').delete().eq('registration_id', regId)
          await supabase.from('registration_acts').delete().eq('registration_id', regId)

          // B. Insert dancers
          if (s.dancers.length > 0) {
            const dancerRows = s.dancers.map((d, i) => ({
              registration_id: regId!,
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
            
            if (!dErr && dData) {
              const dancerIdByIndex = new Map<number, number>()
              dData.forEach((row: { id: number, order_idx: number }) => {
                dancerIdByIndex.set(row.order_idx, row.id)
              })

              // C. Insert acts
              if (s.acts.length > 0) {
                const actRows = s.acts.map((a, i) => ({
                  registration_id: regId!,
                  modality: a.modality,
                  age_category: a.ageCategory,
                  level: a.modality === 'grupal' ? a.level : 'avanzado',
                  style: a.style,
                  order_idx: i,
                  dancer_ids: a.dancerIndices
                    .map(idx => dancerIdByIndex.get(idx))
                    .filter((x): x is number => typeof x === 'number'),
                }))
                await supabase.from('registration_acts').insert(actRows)
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Error saving draft state:', e)
    } finally {
      savingRef.current = false
    }
  }, [draftId, eventId])

  const deleteDraftFromSupabase = useCallback(async () => {
    try {
      await supabase.from('registration_drafts').delete().eq('draft_id', draftId)
    } catch { /* ignore */ }
  }, [draftId])

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

    // 2. El paso real se determina cuando el efecto de auth carga el estado desde Supabase
    // No forzamos welcome/confirmed desde localStorage — el auth effect lo resuelve

    return () => {
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [eventId])

  useEffect(() => {
    let cancelled = false
    
    // Safeguard timeout to prevent forever-loading freezes if WebKit suspends active fetch promises
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        console.warn('Mount state recovery timed out. Forcing authState = ok')
        setAuthState('ok')
      }
    }, 2500)

    ;(async () => {
      try {
        const { data } = await supabase.from('events').select('*').eq('id', eventId).single()
        if (cancelled) return
        if (!data) { setAuthState('invalid'); return }
        if (!data.registration_token || data.registration_token !== token) {
          setAuthState('invalid')
          return
        }
        setEvent(data as Event)
        
        try {
          const isReset = search.get('reset') === 'true' || search.get('new') === 'true'
          if (isReset) {
            localStorage.removeItem(LS_KEY(eventId))
            await deleteDraftFromSupabase()
          } else {
            function migrateSaved(s: State): State {
              const saved = { ...s }
              if (saved.coach && !saved.coach.assistants) saved.coach.assistants = []
              if (saved.costPaquete === null) saved.costPaquete = 2700
              if (saved.costRepeticion === null) saved.costRepeticion = 500
              if (saved.city === undefined || saved.city === null) {
                saved.city = ''
                const match = saved.academy.match(/^(.*?)\s*\(([^)]+)\)$/)
                if (match) { saved.academy = match[1]; saved.city = match[2] }
              }
              if (saved.ticketsCount === undefined || saved.ticketsCount === null) saved.ticketsCount = 0
              if ((saved as any).signature === undefined) saved.signature = null
              return saved
            }

            // Check if there is already a submitted/confirmed registration in DB first (source of truth)
            let dbReg: any = null
            try {
              const savedRegId = typeof window !== 'undefined'
                ? localStorage.getItem(`d4e:register-reg-id:${eventId}`)
                : null

              let query = supabase.from('coach_registrations')
                .select('id, coach_name, coach_phone, coach_email, academy, team_name, submitted_at, confirmed_at, tickets_count, notes, cost_paquete, cost_repeticion, signature, extra_coaches')
              if (savedRegId) {
                query = query.eq('id', Number(savedRegId))
              } else {
                query = query.eq('draft_id', draftId)
              }
              const { data: regRow } = await query
              if (regRow && regRow.length > 0 && regRow[0].submitted_at && !regRow[0].submitted_at.startsWith('1970-01-01')) {
                dbReg = regRow[0]
              }
            } catch (e) {
              console.error('Error checking existing registration on mount:', e)
            }

            if (dbReg) {
              // Recover state entirely from the database submission
              try {
                const r = dbReg
                const { data: dancers } = await supabase.from('registration_dancers').select('*').eq('registration_id', r.id)
                const { data: acts } = await supabase.from('registration_acts').select('*').eq('registration_id', r.id)
                
                // Parse academy and city
                let academy = r.academy || ''
                let city = ''
                const match = academy.match(/^(.*?)\s*\(([^)]+)\)$/)
                if (match) { academy = match[1]; city = match[2] }
                const assistants = (r.extra_coaches || [])
                  .map((a: string) => a.replace(/^Asistente:\s*/, ''))
                  .filter((a: string) => a.trim().length > 0)
                
                setState({
                  coach: { name: r.coach_name || '', phone: r.coach_phone || '', email: r.coach_email || '', assistants },
                  academy, city,
                  teamName: r.team_name || '',
                  teamSize: (dancers || []).length,
                  dancers: (dancers || []).map((d: any) => ({
                    name: d.name || '', birthdate: d.birthdate || '',
                    categoryOverride: d.category_manual ? (d.category as any) : null,
                  })),
                  actCount: (acts || []).length,
                  acts: (acts || []).map((a: any) => ({
                    modality: a.modality || 'grupal',
                    ageCategory: a.age_category || null,
                    level: a.level || 'avanzado',
                    style: a.style || '',
                    dancerIndices: (a.dancer_ids || []).map((did: number) => {
                      const idx = (dancers || []).findIndex((d: any) => d.id === did)
                      return idx >= 0 ? idx : 0
                    }),
                  })),
                  costPaquete: r.cost_paquete || null,
                  costRepeticion: r.cost_repeticion || null,
                  confirmedRegistrationId: r.id,
                  ticketsCount: r.tickets_count || 0,
                  notes: r.notes || '',
                  confirmedAt: r.confirmed_at || null,
                  signature: r.signature || null,
                })
                setDraftRegistrationId(r.id)
                if (r.confirmed_at) {
                  setStep({ kind: 'confirmed' })
                } else {
                  setStep({ kind: 'pending' })
                }
              } catch (e) {
                console.error('Error recovering registration from DB:', e)
              }
            } else {
              let rawState: State | null = null

              // Try Supabase draft first
              try {
                const { data: draftRows, error } = await supabase
                  .from('registration_drafts')
                  .select('state')
                  .eq('draft_id', draftId)
                if (!error && draftRows && draftRows.length > 0) {
                  rawState = migrateSaved(draftRows[0].state as State)
                }
              } catch { /* Supabase might not be ready */ }

              // Fall back to localStorage
              if (!rawState) {
                const raw = localStorage.getItem(LS_KEY(eventId))
                if (raw) {
                  try { rawState = migrateSaved(JSON.parse(raw) as State) } catch { /* ignore */ }
                }
              }

              if (rawState) {
                setState(rawState)
                // Check for existing draft in coach_registrations by draft_id
                if (!rawState.confirmedRegistrationId) {
                  try {
                    const { data: draftReg } = await supabase
                      .from('coach_registrations')
                      .select('id')
                      .eq('draft_id', draftId)
                    if (draftReg && draftReg.length > 0) {
                      setDraftRegistrationId(draftReg[0].id)
                    }
                  } catch { /* ignore */ }
                }
                if (rawState.confirmedRegistrationId) {
                  // Determine confirmed vs pending asynchronously
                  setStep({ kind: 'pending' })
                  try {
                    const { data: regData } = await supabase
                      .from('coach_registrations')
                      .select('confirmed_at, submitted_at')
                      .eq('id', rawState!.confirmedRegistrationId)
                      .single()
                    if (regData) {
                      setState(s => {
                        if (s.confirmedRegistrationId === rawState!.confirmedRegistrationId) {
                          return { 
                            ...s, 
                            confirmedAt: regData.confirmed_at,
                            submittedAt: regData.submitted_at 
                          }
                        }
                        return s
                      })
                      if (regData.confirmed_at) {
                        setStep({ kind: 'confirmed' })
                      }
                    }
                  } catch (e) {
                    console.error("Failed to fetch confirmation timestamp:", e)
                  }
                }
              } else {
                setStep({ kind: 'welcome' })
              }
            }
          }
        } catch (err) {
          console.error('Error during mount state recovery:', err)
        } finally {
          clearTimeout(timeoutId)
          if (!cancelled) {
            setAuthState('ok')
          }
        }
      } catch (err) {
        clearTimeout(timeoutId)
        if (!cancelled) {
          setAuthState('ok')
        }
      }
    })()
    return () => { 
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [eventId, token])

  useEffect(() => {
    if (!eventId) return
    const unsubscribe = subscribePortalConfig(eventId, (config) => {
      setPortalConfig(config)
    })
    return () => unsubscribe()
  }, [eventId])

  // Realtime: detect when admin confirms the registration
  useEffect(() => {
    if (!state.confirmedRegistrationId || !eventId) return
    const regId = state.confirmedRegistrationId
    const ch = supabase
      .channel(`reg-confirm-${regId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'coach_registrations',
        filter: `id=eq.${regId}`,
      }, (payload) => {
        const row = payload.new as { confirmed_at: string | null }
        if (row?.confirmed_at) {
          setState(s => ({ ...s, confirmedAt: row.confirmed_at }))
          setStep({ kind: 'confirmed' })
        } else {
          setState(s => ({ ...s, confirmedAt: null }))
          setStep({ kind: 'pending' })
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [state.confirmedRegistrationId, eventId])

  useEffect(() => {
    if (authState !== 'ok') return
    try { localStorage.setItem(LS_KEY(eventId), JSON.stringify(state)) } catch { /* ignore */ }
    // Debounced save to Supabase (800ms)
    if (state.confirmedRegistrationId) return // don't re-save drafts for confirmed
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => saveDraftToSupabase(state), 800)
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current) }
  }, [state, eventId, authState, saveDraftToSupabase])

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
      
      // No soft keyboard on desktop PCs
      const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches
      const isDesktopSize = window.innerWidth >= 1024 && window.innerHeight >= 700
      if (isDesktopSize && !isCoarsePointer) return false

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
        case 'summary': return state.confirmedRegistrationId ? { kind: 'pending' } : { kind: 'carta' }
        default: return s
      }
    })
  }, [state.confirmedRegistrationId])

  // Sync the draft immediately when step changes (e.g. clicking next/back) to avoid debounce lag
  useEffect(() => {
    if (step.kind === 'welcome' || step.kind === 'confirmed' || step.kind === 'pending') return
    saveDraftToSupabase(state)
  }, [step.kind, saveDraftToSupabase])

  // Scroll to top when entering a new step
  useEffect(() => {
    setTimeout(() => {
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' })
        document.querySelectorAll('.overflow-y-auto').forEach(el => {
          el.scrollTo({ top: 0, behavior: 'smooth' })
        })
      } catch (err) {
        console.error('Scroll error:', err)
      }
    }, 100)
  }, [step.kind])

  const goBack = useCallback(() => {
    setStep(s => {
      switch (s.kind) {
        case 'setup': return { kind: 'welcome' }
        case 'dancers': return { kind: 'setup' }
        case 'acts': return { kind: 'dancers' }
        case 'summary': return { kind: 'acts' }
        case 'carta': return { kind: 'summary' }
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
      let computedChanges: Record<string, { old: any; new: any }> = {}

      const costPaquete = state.costPaquete ?? event.default_cost_paquete ?? 2700
      const costRepeticion = state.costRepeticion ?? event.default_cost_repeticion ?? 500

      const assistants = state.coach.assistants
        .map(a => `Asistente: ${a.trim()}`)
        .filter(a => a !== 'Asistente:')

      const submittedAt = new Date().toISOString()

      if (isUpdate) {
        registrationId = state.confirmedRegistrationId!

        try {
          // Fetch existing data for comparison BEFORE deleting/updating
          const [
            { data: oldRegs },
            { data: oldDancers },
            { data: oldActs }
          ] = await Promise.all([
            supabase.from('coach_registrations').select('*').eq('id', registrationId).limit(1),
            supabase.from('registration_dancers').select('*').eq('registration_id', registrationId),
            supabase.from('registration_acts').select('*').eq('registration_id', registrationId)
          ])

          if (oldRegs && oldRegs.length > 0) {
            const oldReg = oldRegs[0]
            
            // Compare basic coach/academy fields
            if (oldReg.coach_name !== state.coach.name.trim()) {
              computedChanges.coach_name = { old: oldReg.coach_name, new: state.coach.name.trim() }
            }
            const newAcademy = state.city.trim() ? `${state.academy.trim()} (${state.city.trim()})` : state.academy.trim()
            if (oldReg.academy !== newAcademy) {
              computedChanges.academy = { old: oldReg.academy, new: newAcademy }
            }
            if ((oldReg.tickets_count ?? 0) !== (state.ticketsCount ?? 0)) {
              computedChanges.boletos_adicionales = { old: oldReg.tickets_count ?? 0, new: state.ticketsCount ?? 0 }
            }

            // Compare assistants
            const oldAssistants = oldReg.extra_coaches || []
            if (JSON.stringify([...oldAssistants].sort()) !== JSON.stringify([...assistants].sort())) {
              computedChanges.asistentes = { 
                old: oldAssistants.map((a: string) => a.replace(/^Asistente:\s*/, '')).join(', ') || 'Ninguno', 
                new: assistants.map((a: string) => a.replace(/^Asistente:\s*/, '')).join(', ') || 'Ninguno' 
              }
            }

            // Compare dancers
            const oldDancerNames = (oldDancers ?? []).map((d: any) => d.name.trim()).sort()
            const newDancerNames = state.dancers.map(d => d.name.trim()).sort()
            
            const addedDancers = newDancerNames.filter(x => !oldDancerNames.includes(x))
            const removedDancers = oldDancerNames.filter(x => !newDancerNames.includes(x))
            
            if (addedDancers.length > 0) {
              computedChanges.integrantes_agregados = { old: null, new: addedDancers.join(', ') }
            }
            if (removedDancers.length > 0) {
              computedChanges.integrantes_eliminados = { old: removedDancers.join(', '), new: null }
            }

            // Compare acts (choreographies)
            const oldActDescs = (oldActs ?? []).map((a: any) => `${(a.modality || '').toUpperCase()} (${a.style || ''})`).sort()
            const newActDescs = state.acts.map(a => `${(a.modality || '').toUpperCase()} (${a.style || ''})`).sort()

            const addedActs = newActDescs.filter(x => !oldActDescs.includes(x))
            const removedActs = oldActDescs.filter(x => !newActDescs.includes(x))

            if (addedActs.length > 0) {
              computedChanges.coreografias_agregadas = { old: null, new: addedActs.join(', ') }
            }
            if (removedActs.length > 0) {
              computedChanges.coreografias_eliminadas = { old: removedActs.join(', '), new: null }
            }
          }
        } catch (e) {
          console.error('Error fetching old registration for logs:', e)
        }

        const academy = state.city.trim()
          ? `${state.academy.trim()} (${state.city.trim()})`
          : state.academy.trim()

        const { error: updErr } = await supabase.from('coach_registrations').update({
          coach_name: state.coach.name.trim(),
          coach_phone: state.coach.phone.trim(),
          coach_email: state.coach.email.trim() || null,
          extra_coaches: assistants,
          academy,
          team_name: state.academy.trim(),
          cost_paquete: costPaquete,
          cost_repeticion: costRepeticion,
          submitted_at: submittedAt,
          tickets_count: state.ticketsCount ?? 0,
          notes: state.notes?.trim() || null,
          signature: signature || null,
          confirmed_at: null, // Reset to null so it goes back to review
        }).eq('id', registrationId)
        if (updErr) throw updErr

        // Delete existing dancers/acts for this registration to replace them
        await supabase.from('registration_dancers').delete().eq('registration_id', registrationId)
        await supabase.from('registration_acts').delete().eq('registration_id', registrationId)

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
      } else {
        const academy = state.city.trim()
          ? `${state.academy.trim()} (${state.city.trim()})`
          : state.academy.trim()

        if (draftRegistrationId) {
          // Update existing draft row → now submitted
          registrationId = draftRegistrationId
          const { error: updErr } = await supabase.from('coach_registrations').update({
            coach_name: state.coach.name.trim(),
            coach_phone: state.coach.phone.trim(),
            coach_email: state.coach.email.trim() || null,
            extra_coaches: assistants,
            academy,
            team_name: state.academy.trim(),
            cost_paquete: costPaquete,
            cost_repeticion: costRepeticion,
            submitted_at: submittedAt,
            tickets_count: state.ticketsCount ?? 0,
            notes: state.notes?.trim() || null,
            signature: signature || null,
          }).eq('id', draftRegistrationId)
          if (updErr) throw updErr
        } else {
          const { data: regData, error: regErr } = await supabase
            .from('coach_registrations')
            .insert({
              event_id: event.id,
              draft_id: draftId,
              coach_name: state.coach.name.trim(),
              coach_phone: state.coach.phone.trim(),
              coach_email: state.coach.email.trim() || null,
              extra_coaches: assistants,
              academy,
              team_name: state.academy.trim(),
              cost_paquete: costPaquete,
              cost_repeticion: costRepeticion,
              submitted_at: submittedAt,
              tickets_count: state.ticketsCount ?? 0,
              notes: state.notes?.trim() || null,
              signature: signature || null,
            })
            .select()
            .single()
          if (regErr || !regData) throw regErr ?? new Error('No data')
          registrationId = regData.id as number
        }

        // Delete existing dancers/acts for this registration (in case of re-submit from draft)
        if (draftRegistrationId) {
          await supabase.from('registration_dancers').delete().eq('registration_id', registrationId)
          await supabase.from('registration_acts').delete().eq('registration_id', registrationId)
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
      }

      // Write audit log for coach submission
      try {
        await supabase.from('registration_edit_log').insert({
          registration_id: registrationId,
          edited_by: 'coach',
          action: isUpdate ? 'update' : 'create',
          entity_type: 'registration',
          changes: isUpdate ? { resubmitted: { old: null, new: submittedAt }, ...computedChanges } : { submitted: { old: null, new: submittedAt } },
          created_at: new Date().toISOString(),
        })
      } catch {}

      // After submit, always go to pending — admin must confirm from dashboard
      setState(s => ({ 
        ...s, 
        confirmedRegistrationId: registrationId,
        confirmedAt: null, // Reset to pending review state locally
        submittedAt: submittedAt,
      }))
      // Persist registration ID so we can recover state on reload
      try { localStorage.setItem(`d4e:register-reg-id:${eventId}`, String(registrationId)) } catch { /* ignore */ }
      setEditMode(false)
      setShowSuccessSplash(true)
      setStep({ kind: 'pending' }) // Go back to pending screen
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

  if (portalConfig && !portalConfig.enableRegistration) {
    return <PortalLockout portalName="Registro" />
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
              {isEditSave ? 'Cambios al registro guardados con éxito.' : 'Tu registro fue enviado. Un organizador lo revisará y confirmará pronto.'}
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
        /* Ocultar bottom nav al enfocar inputs, excepto en el paso de integrantes, solo en móviles con pantalla táctil */
        @media (max-width: 1023px) and (pointer: coarse) {
          body:has(input:focus, textarea:focus, select:focus) [data-step]:not([data-step="dancers"]) .mobile-bottom-nav {
            visibility: hidden;
          }
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
      {(!isKeyboardOpen || step.kind === 'dancers' || step.kind === 'summary' || step.kind === 'carta') && !isFirstStep && step.kind !== 'confirmed' && step.kind !== 'pending' && (
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
              signature={signature}
              setSignature={setSignature}
              actsConfirmed={actsConfirmed}
              setActsConfirmed={setActsConfirmed}
              activeActIndex={activeActIndex}
              setActiveActIndex={setActiveActIndex}
            />
          </div>
        </div>
      </main>

      {/* MOBILE BOTTOM NAV BAR (iOS native feel) */}
      {(!isKeyboardOpen || step.kind === 'dancers') && !isFirstStep && step.kind !== 'confirmed' && step.kind !== 'pending' && (
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

          {step.kind !== 'summary' && step.kind !== 'carta' ? (
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
          ) : step.kind === 'carta' ? (
            <button
              onClick={confirm}
              disabled={saving || !signature}
              className="flex items-center gap-1.5 text-white bg-gradient-to-r from-purple-700 via-purple-600 to-pink-600 hover:from-purple-800 hover:to-pink-700 font-display font-bold text-sm px-5 py-2.5 rounded-2xl disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition-all duration-150 shadow-[0_4px_12px_rgba(168,85,247,0.3)]"
            >
              {saving ? 'GUARDANDO…' : 'CONFIRMAR REGISTRO'}
              <Check className="w-4 h-4 animate-pulse" />
            </button>
          ) : (
            <button
              onClick={() => goNext()}
              className="flex items-center gap-1.5 text-white bg-gradient-to-r from-purple-700 via-purple-600 to-pink-600 hover:from-purple-800 hover:to-pink-700 font-display font-bold text-sm px-5 py-2.5 rounded-2xl active:scale-95 transition-all duration-150 shadow-[0_4px_12px_rgba(168,85,247,0.3)]"
            >
              CONTINUAR
              <ArrowRight className="w-4 h-4 animate-pulse" />
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
