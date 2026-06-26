'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  supabase,
  CoachRegistration,
  RegistrationDancer,
  RegistrationAct,
  AGE_CATEGORY_ORDER,
  AGE_CATEGORY_LABELS,
  Modality,
  AgeCategory,
  Event,
  categoryFromBirthdate,
} from '@/lib/supabase'
import { hashPassword } from '@/lib/crypto'
import { detectConflicts, autoSchedule, buildConflictMap, type Conflict } from '@/lib/schedule'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Send, Award, AlertTriangle, Search, ArrowRight, X, ArrowLeft, RefreshCw, Edit3 } from 'lucide-react'
import { CATEGORY } from '@/app/socios/colors'

const MODALITY_LABELS: Record<Modality, string> = {
  solista: 'Solista', dueto: 'Dueto', trio: 'Trio', grupal: 'Grupal'
}

const CATEGORY_COLORS: Record<AgeCategory, { bg: string; border: string; text: string; badge: string; solidBg: string }> = {
  tiny:       { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', badge: 'bg-rose-100 text-rose-800 border-rose-200', solidBg: 'bg-rose-100 border-rose-300 text-rose-800 font-bold' },
  mini:       { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', badge: 'bg-orange-100 text-orange-800 border-orange-200', solidBg: 'bg-orange-100 border-orange-300 text-orange-800 font-bold' },
  elementary: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800 border-amber-200', solidBg: 'bg-amber-100 border-amber-300 text-amber-800 font-bold' },
  junior:     { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', solidBg: 'bg-emerald-100 border-emerald-300 text-emerald-800 font-bold' },
  senior:     { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', badge: 'bg-teal-100 text-teal-800 border-teal-200', solidBg: 'bg-teal-100 border-teal-300 text-teal-800 font-bold' },
  college:    { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800 border-blue-200', solidBg: 'bg-blue-100 border-blue-300 text-blue-800 font-bold' },
  open:       { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-800 border-purple-200', solidBg: 'bg-purple-100 border-purple-300 text-purple-800 font-bold' },
  allstar:    { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-800 border-violet-200', solidBg: 'bg-violet-100 border-violet-300 text-violet-800 font-bold' },
}

const MODALITY_ORDER: Modality[] = ['solista', 'dueto', 'trio', 'grupal']

function shouldShowTeam(academy: string, teamName: string | null | undefined): boolean {
  if (!teamName) return false
  const cleanAcademy = academy.replace(/\s*\([^)]+\)$/, '').trim().toLowerCase()
  const cleanTeam = teamName.trim().toLowerCase()
  return cleanAcademy !== cleanTeam
}

type ProgramItem = {
  id: string
  act: RegistrationAct
  reg: { id: number; academy: string; team_name: string; dancers: RegistrationDancer[] }
}

const INTERMEDIO_ID = '___intermedio___'

const COMPATIBILITY_STYLES = {
  red: {
    border: 'border-red-200 hover:border-red-400',
    bg: 'bg-red-50/40 hover:bg-red-50',
    dot: 'bg-red-600',
    text: 'text-red-700',
    label: 'CRÍTICO'
  },
  orange: {
    border: 'border-amber-200 hover:border-amber-400',
    bg: 'bg-amber-50/40 hover:bg-amber-50',
    dot: 'bg-orange-600',
    text: 'text-orange-700',
    label: 'POCO TIEMPO'
  },
  green: {
    border: 'border-neutral-200 hover:border-neutral-400',
    bg: 'bg-white hover:bg-neutral-50',
    dot: 'bg-emerald-600',
    text: 'text-emerald-700',
    label: 'SEGURO'
  }
}

function buildItems(
  registrations: CoachRegistration[],
  dancers: RegistrationDancer[],
  acts: RegistrationAct[]
): ProgramItem[] {
  const dancerByReg = new Map<number, RegistrationDancer[]>()
  dancers.forEach(d => {
    const arr = dancerByReg.get(d.registration_id) ?? []
    arr.push(d); dancerByReg.set(d.registration_id, arr)
  })

  const items: ProgramItem[] = []
  for (const reg of registrations) {
    if (!reg.confirmed_at) continue
    const regDancers = dancerByReg.get(reg.id) ?? []
    const regActs = acts.filter(a => a.registration_id === reg.id).sort((a, b) => {
      const ca = a.age_category ? AGE_CATEGORY_ORDER.indexOf(a.age_category) : 99
      const cb = b.age_category ? AGE_CATEGORY_ORDER.indexOf(b.age_category) : 99
      if (ca !== cb) return ca - cb
      const ma = MODALITY_ORDER.indexOf(a.modality)
      const mb = MODALITY_ORDER.indexOf(b.modality)
      return ma - mb
    })
    for (const act of regActs) {
      items.push({
        id: `act-${act.id}`,
        act,
        reg: { id: reg.id, academy: reg.academy, team_name: reg.team_name, dancers: regDancers }
      })
    }
  }

  items.sort((a, b) => {
    const ca = a.act.age_category ? AGE_CATEGORY_ORDER.indexOf(a.act.age_category) : 99
    const cb = b.act.age_category ? AGE_CATEGORY_ORDER.indexOf(b.act.age_category) : 99
    if (ca !== cb) return ca - cb
    const ma = MODALITY_ORDER.indexOf(a.act.modality)
    const mb = MODALITY_ORDER.indexOf(b.act.modality)
    return ma - mb
  })
  return items
}

function findBestIntermedioIndex(items: ProgramItem[]): number {
  if (items.length === 0) return 0
  const target = items.length / 2

  const boundaries: number[] = []
  for (let i = 1; i < items.length; i++) {
    const prevCat = items[i - 1].act.age_category || 'open'
    const currCat = items[i].act.age_category || 'open'
    if (prevCat !== currCat) {
      boundaries.push(i)
    }
  }

  if (boundaries.length === 0) {
    return Math.ceil(target)
  }

  let bestIdx = boundaries[0]
  let minDiff = Math.abs(bestIdx - target)
  for (const b of boundaries) {
    const diff = Math.abs(b - target)
    if (diff < minDiff) {
      minDiff = diff
      bestIdx = b
    }
  }
  return bestIdx
}

export default function StandaloneBuilderPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)

  const [events, setEvents] = useState<Event[]>([])
  const [event, setEvent] = useState<Event | null>(null)
  
  const [registrations, setRegistrations] = useState<CoachRegistration[]>([])
  const [dancers, setDancers] = useState<RegistrationDancer[]>([])
  const [acts, setActs] = useState<RegistrationAct[]>([])
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [minGap, setMinGap] = useState<number | ''>(5)
  const [editingActItem, setEditingActItem] = useState<ProgramItem | null>(null)
  const [editingDancers, setEditingDancers] = useState<RegistrationDancer[]>([])
  const effectiveMinGap = minGap === '' ? 1 : minGap
  const [isEditing, setIsEditing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const originalSize = document.documentElement.style.fontSize
    document.documentElement.style.fontSize = '110%'
    return () => {
      document.documentElement.style.fontSize = originalSize
    }
  }, [])

  const allItems = useMemo(() => buildItems(registrations, dancers, acts), [registrations, dancers, acts])

  // Dual column states
  const [rightItems, setRightItems] = useState<ProgramItem[]>([]) // placed timeline
  const [leftItems, setLeftItems] = useState<ProgramItem[]>([])   // unplaced pool
  const [intermedioIndex, setIntermedioIndex] = useState<number | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remoteChangeRef = useRef(false)

  const conflicts = useMemo(() => detectConflicts(rightItems, effectiveMinGap), [rightItems, effectiveMinGap])
  const conflictMap = useMemo(() => buildConflictMap(conflicts), [conflicts])

  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [verifyingPassword, setVerifyingPassword] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!authPassword.trim()) return
    setVerifyingPassword(true)
    setAuthError(null)

    const envPassword = process.env.NEXT_PUBLIC_DASHBOARD_PASSWORD || 'd4e2026'
    if (authPassword.trim() === envPassword) {
      localStorage.setItem('d4e_builder_password', authPassword.trim())
      localStorage.setItem('d4e_dashboard_gate', 'unlocked')
      setIsAuthenticated(true)
    } else {
      setAuthError('Contraseña incorrecta')
    }
    setVerifyingPassword(false)
  }

  // Security gate check
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    // Auto-unlock gate since they are accessing the standalone builder directly
    localStorage.setItem('d4e_dashboard_gate', 'unlocked')

    const savedPassword = localStorage.getItem('d4e_builder_password')
    const envPassword = process.env.NEXT_PUBLIC_DASHBOARD_PASSWORD || 'd4e2026'

    if (savedPassword && envPassword) {
      if (savedPassword === envPassword) {
        setIsAuthenticated(true)
      } else {
        localStorage.removeItem('d4e_builder_password')
        setIsAuthenticated(false)
      }
    } else {
      setIsAuthenticated(false)
    }
    setCheckingAuth(false)
  }, [])

  // Fetch events
  const loadEvents = useCallback(async () => {
    if (!isAuthenticated) return
    const { data } = await supabase.from('events').select('*').order('created_at', { ascending: false })
    if (data && data.length > 0) {
      setEvents(data)
      setEvent(prev => prev ? (data.find(e => e.id === prev.id) || data[0]) : data[0])
    }
  }, [isAuthenticated])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  // Load saved draft from Supabase on event change
  const loadDraft = useCallback(async () => {
    if (!event || !isAuthenticated) return
    setDraftLoaded(false)
    const { data, error } = await supabase
      .from('program_drafts')
      .select('*')
      .eq('event_id', event.id)
    if (!error && data && data.length > 0) {
      const d = data[0]
      setDraftData({ act_order: d.act_order ?? [], intermedio_index: d.intermedio_index ?? null, min_gap: d.min_gap ?? 5 })
      setMinGap(d.min_gap ?? 5)
    } else {
      setDraftData(null)
    }
    setDraftLoaded(true)
  }, [event, isAuthenticated])

  const [draftData, setDraftData] = useState<{ act_order: number[]; intermedio_index: number | null; min_gap: number } | null>(null)

  useEffect(() => { loadDraft() }, [loadDraft])

  // Initialize right/left lists once draft and allItems are ready
  useEffect(() => {
    if (allItems.length > 0 && draftLoaded && !initialized && isAuthenticated) {
      let rightList: ProgramItem[] = []
      let leftList: ProgramItem[] = []

      if (draftData?.act_order?.length) {
        const orderMap = new Map(draftData.act_order.map((id: number, i: number) => [id, i]))
        const rightItemsMap = new Map(allItems.map(item => [item.act.id, item]))
        
        allItems.forEach(item => {
          if (orderMap.has(item.act.id)) {
            // It goes to right
          } else {
            leftList.push(item)
          }
        })

        rightList = draftData.act_order
          .map((id: number) => rightItemsMap.get(id))
          .filter(Boolean) as ProgramItem[]
      } else {
        leftList = [...allItems]
      }

      // Sort left items by default category/modality order
      leftList.sort((a, b) => {
        const ca = a.act.age_category ? AGE_CATEGORY_ORDER.indexOf(a.act.age_category) : 99
        const cb = b.act.age_category ? AGE_CATEGORY_ORDER.indexOf(b.act.age_category) : 99
        if (ca !== cb) return ca - cb
        const ma = MODALITY_ORDER.indexOf(a.act.modality)
        const mb = MODALITY_ORDER.indexOf(b.act.modality)
        return ma - mb
      })

      setRightItems(rightList)
      setLeftItems(leftList)
      setIntermedioIndex(draftData?.intermedio_index ?? findBestIntermedioIndex(rightList))
      setInitialized(true)
    }
  }, [allItems, draftLoaded, draftData, initialized, isAuthenticated])

  // Sync external additions/deletions into current state
  useEffect(() => {
    if (!initialized || !isAuthenticated) return
    const allIds = new Set(allItems.map(i => i.id))
    
    setRightItems(prev => prev.filter(i => allIds.has(i.id)))
    setLeftItems(prev => prev.filter(i => allIds.has(i.id)))

    const currentIds = new Set([...rightItems.map(i => i.id), ...leftItems.map(i => i.id)])
    const newItems = allItems.filter(i => !currentIds.has(i.id))
    if (newItems.length > 0) {
      setLeftItems(prev => {
        const updated = [...prev, ...newItems]
        return updated.sort((a, b) => {
          const ca = a.act.age_category ? AGE_CATEGORY_ORDER.indexOf(a.act.age_category) : 99
          const cb = b.act.age_category ? AGE_CATEGORY_ORDER.indexOf(b.act.age_category) : 99
          if (ca !== cb) return ca - cb
          const ma = MODALITY_ORDER.indexOf(a.act.modality)
          const mb = MODALITY_ORDER.indexOf(b.act.modality)
          return ma - mb
        })
      })
    }
  }, [allItems, initialized, isAuthenticated])

  // Auto-save draft to Supabase (debounced 600ms)
  const saveDraft = useCallback(async () => {
    if (!event || remoteChangeRef.current || !isAuthenticated) return
    try {
      await supabase.from('program_drafts').upsert({
        event_id: event.id,
        act_order: rightItems.map(i => i.act.id),
        intermedio_index: intermedioIndex,
        min_gap: effectiveMinGap,
        updated_at: new Date().toISOString(),
      })
    } catch {
      // Ignore
    }
  }, [event, rightItems, intermedioIndex, effectiveMinGap, isAuthenticated])

  useEffect(() => {
    if (!event || !initialized || remoteChangeRef.current || !isAuthenticated) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveDraft(), 600)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [rightItems, intermedioIndex, minGap, initialized, event, saveDraft, isAuthenticated])

  const openEditDancers = (item: ProgramItem) => {
    setEditingActItem(item)
    setEditingDancers(item.reg.dancers.map(d => ({ ...d })))
  }

  const handleSaveDancers = async () => {
    if (!editingActItem) return
    setPublishing(true)
    try {
      for (const d of editingDancers) {
        const calculatedCat = categoryFromBirthdate(d.birthdate)
        const finalCat = d.category_manual ? d.category : calculatedCat

        await supabase
          .from('registration_dancers')
          .update({
            name: d.name.trim(),
            birthdate: d.birthdate,
            category: finalCat,
            category_manual: d.category_manual
          })
          .eq('id', d.id)
      }

      // Recalculate acts
      const { data: regActs } = await supabase
        .from('registration_acts')
        .select('*')
        .eq('registration_id', editingActItem.reg.id)

      if (regActs) {
        const dancerMap = new Map(editingDancers.map(d => {
          const calculatedCat = categoryFromBirthdate(d.birthdate)
          const finalCat = d.category_manual ? d.category : calculatedCat
          return [d.id, { ...d, category: finalCat }]
        }))

        for (const act of regActs) {
          const actDancers = (act.dancer_ids || []).map((id: number) => dancerMap.get(id)).filter(Boolean) as RegistrationDancer[]
          const maxAgeIdx = actDancers.reduce((max, d) => {
            const idx = d.category ? AGE_CATEGORY_ORDER.indexOf(d.category) : 0
            return idx > max ? idx : max
          }, 0)
          const ageCat = AGE_CATEGORY_ORDER[maxAgeIdx]

          await supabase
            .from('registration_acts')
            .update({ age_category: ageCat })
            .eq('id', act.id)
        }
      }

      await loadAll()
      await loadDraft()
      setEditingActItem(null)
    } catch (err: any) {
      alert('Error al guardar integrantes: ' + err.message)
    } finally {
      setPublishing(false)
    }
  }

  const loadAll = useCallback(async () => {
    if (!event || !isAuthenticated) return
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
      setInitialized(false)
    } finally { setLoading(false) }
  }, [event, isAuthenticated])

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    if (!event || !isAuthenticated) return
    const ch = supabase
      .channel(`standalone-prog-${event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_registrations', filter: `event_id=eq.${event.id}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_dancers' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_acts' }, () => loadAll())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'program_drafts', filter: `event_id=eq.${event.id}` }, () => {
        if (remoteChangeRef.current) return
        remoteChangeRef.current = true
        setDraftLoaded(false)
        setInitialized(false)
        loadDraft()
        setTimeout(() => { remoteChangeRef.current = false }, 3000)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'program_drafts', filter: `event_id=eq.${event.id}` }, () => {
        if (remoteChangeRef.current) return
        remoteChangeRef.current = true
        setDraftLoaded(false)
        setInitialized(false)
        loadDraft()
        setTimeout(() => { remoteChangeRef.current = false }, 3000)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [event, loadAll, loadDraft, isAuthenticated])

  // Move items left/right
  const moveToRight = useCallback((item: ProgramItem) => {
    setLeftItems(prev => prev.filter(i => i.id !== item.id))
    setRightItems(prev => [...prev, item])
  }, [])

  const moveToLeft = useCallback((item: ProgramItem) => {
    setRightItems(prev => prev.filter(i => i.id !== item.id))
    setLeftItems(prev => {
      const updated = [...prev, item]
      return updated.sort((a, b) => {
        const ca = a.act.age_category ? AGE_CATEGORY_ORDER.indexOf(a.act.age_category) : 99
        const cb = b.act.age_category ? AGE_CATEGORY_ORDER.indexOf(b.act.age_category) : 99
        if (ca !== cb) return ca - cb
        const ma = MODALITY_ORDER.indexOf(a.act.modality)
        const mb = MODALITY_ORDER.indexOf(b.act.modality)
        return ma - mb
      })
    })
  }, [])

  const handleFillAutoSchedule = () => {
    const combined = [...rightItems, ...leftItems]
    if (combined.length === 0) return
    if (!confirm('Reordenar automáticamente todas las coreografías y colocarlas en la línea de tiempo? Se intercalarán por academia.')) return
    const scheduled = autoSchedule(combined)
    setRightItems(scheduled)
    setLeftItems([])
    setIntermedioIndex(findBestIntermedioIndex(scheduled))
  }

  const handleReset = () => {
    const combined = [...rightItems, ...leftItems]
    if (combined.length === 0) return
    if (!confirm('Vaciar toda la línea de tiempo del programa y devolver las coreografías al pool de origen?')) return
    
    combined.sort((a, b) => {
      const ca = a.act.age_category ? AGE_CATEGORY_ORDER.indexOf(a.act.age_category) : 99
      const cb = b.act.age_category ? AGE_CATEGORY_ORDER.indexOf(b.act.age_category) : 99
      if (ca !== cb) return ca - cb
      const ma = MODALITY_ORDER.indexOf(a.act.modality)
      const mb = MODALITY_ORDER.indexOf(b.act.modality)
      return ma - mb
    })

    setRightItems([])
    setLeftItems(combined)
    setIntermedioIndex(null)
  }

  // Calculate compatibility
  const getCompatibility = useCallback((item: ProgramItem) => {
    if (rightItems.length === 0) return 'green'
    
    const candidateDancers = new Set(item.act.dancer_ids || [])
    if (candidateDancers.size === 0) return 'green'

    let worstGap = 9999
    const startIdx = Math.max(0, rightItems.length - effectiveMinGap)

    for (let i = rightItems.length - 1; i >= startIdx; i--) {
      const placedItem = rightItems[i]
      const placedDancers = placedItem.act.dancer_ids || []
      const hasOverlap = placedDancers.some(id => candidateDancers.has(id))
      if (hasOverlap) {
        const gap = rightItems.length - 1 - i
        if (gap < worstGap) worstGap = gap
      }
    }

    if (worstGap <= 1) return 'red'
    if (worstGap < effectiveMinGap) return 'orange'
    return 'green'
  }, [rightItems, effectiveMinGap])

  const sortableIds = useMemo(() => {
    const ids = rightItems.map(i => i.id)
    if (intermedioIndex !== null) {
      const idx = Math.min(intermedioIndex, ids.length)
      return [...ids.slice(0, idx), INTERMEDIO_ID, ...ids.slice(idx)]
    }
    return ids
  }, [rightItems, intermedioIndex])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)

    if (!over || active.id === over.id) return

    const oldIndex = sortableIds.indexOf(active.id as string)
    const newIndex = sortableIds.indexOf(over.id as string)

    if (oldIndex === -1 || newIndex === -1) return

    // Handle moving intermedio marker
    if (active.id === INTERMEDIO_ID) {
      let idx = newIndex
      const itemCount = rightItems.length
      let realIdx = idx
      if (oldIndex < newIndex) realIdx = Math.min(idx, itemCount)
      else realIdx = Math.max(0, idx)
      setIntermedioIndex(realIdx)
      return
    }

    const interPos = sortableIds.indexOf(INTERMEDIO_ID)
    const realOldIdx = oldIndex - (interPos >= 0 && oldIndex > interPos ? 1 : 0)
    let realNewIdx = newIndex - (interPos >= 0 && newIndex > interPos ? 1 : 0)

    if (active.id !== INTERMEDIO_ID && over.id === INTERMEDIO_ID) {
      realNewIdx = intermedioIndex !== null ? intermedioIndex : rightItems.length
      if (realOldIdx < realNewIdx && intermedioIndex !== null) {
        setIntermedioIndex(Math.max(0, intermedioIndex - 1))
      } else if (intermedioIndex !== null) {
        setIntermedioIndex(Math.min(rightItems.length, intermedioIndex + 1))
      }
    }

    setRightItems(arrayMove(rightItems, realOldIdx, Math.max(0, Math.min(rightItems.length - 1, realNewIdx))))
  }

  async function handlePublish() {
    if (publishing || !event || rightItems.length === 0) return

    const activeConflicts = conflicts
    let warn = `Publicar ${rightItems.length} coreografías en el orden actual? Esto reemplazará el programa oficial.`
    if (activeConflicts.length > 0) {
      const conflictLines = activeConflicts.slice(0, 5).map(c =>
        `  • ${c.dancerName} (#${c.positionA} y #${c.positionB} — solo ${c.gap} coreo${c.gap === 0 ? '' : c.gap === 1 ? ' entre ellas' : 's entre ellas'})`
      ).join('\n')
      const extra = activeConflicts.length > 5 ? `\n  ... y ${activeConflicts.length - 5} más` : ''
      warn += `\n\n⚠️ ATENCIÓN: ${activeConflicts.length} conflicto${activeConflicts.length !== 1 ? 's' : ''} detectado${activeConflicts.length !== 1 ? 's' : ''} (bailarines con coreos muy pegadas):\n${conflictLines}${extra}\n\n¿Publicar de todos modos?`
    }
    if (!confirm(warn)) return

    setPublishing(true)
    try {
      const allCoaches = new Set<string>()
      registrations.forEach(r => {
        if (r.confirmed_at && r.coach_name) {
          allCoaches.add(r.coach_name.trim())
        }
      })

      await supabase.from('coaches').delete().eq('event_id', event.id)

      const coachRows = Array.from(allCoaches).map(name => ({ event_id: event.id, name }))
      const { data: insertedCoaches } = coachRows.length
        ? await supabase.from('coaches').insert(coachRows).select()
        : { data: [] }
      
      const coachMap = new Map((insertedCoaches || []).map(c => [c.name.toLowerCase().trim(), c.id]))

      const { data: existingParts } = await supabase
        .from('participants')
        .select('name, style, category, present')
        .eq('event_id', event.id)

      const presentMap = new Map<string, boolean | null>()
      existingParts?.forEach(p => {
        const key = `${p.name ?? ''}|${p.style ?? ''}|${p.category ?? ''}`.toLowerCase().trim()
        presentMap.set(key, p.present)
      })

      await supabase.from('participants').delete().eq('event_id', event.id)

      const regMap = new Map(registrations.map(r => [r.id, r]))

      const rows = rightItems.map((item, idx) => {
        const { act, reg } = item
        const dancersInAct = reg.dancers.filter(d => (act.dancer_ids || []).includes(d.id))
        const dancerNames = dancersInAct.map(d => d.name.split(' ').slice(0, 2).join(' ')).join(', ')
        
        // Si es solista, dueto o trío, usamos los nombres de los integrantes.
        // Si es grupal, usamos el nombre del equipo.
        const isIndividualOrCouple = ['solista', 'dueto', 'duo', 'trio', 'trío'].includes((act.modality || '').toLowerCase())
        const actName = isIndividualOrCouple
          ? `${reg.academy} - ${dancerNames}`
          : (shouldShowTeam(reg.academy, reg.team_name) ? `${reg.academy} (${reg.team_name})` : reg.academy)
        const ageCatCode = act.age_category ? AGE_CATEGORY_LABELS[act.age_category].toUpperCase() : 'OPEN'
        const categoryCode = `${ageCatCode} | ${act.level?.toUpperCase() || 'AVANZADO'}`

        const key = `${actName}|${act.style || ''}|${categoryCode}`.toLowerCase().trim()
        const isPresent = presentMap.get(key) ?? null

        const registration = regMap.get(reg.id)
        const mainCoachName = registration?.coach_name?.toLowerCase().trim()
        const coachId = mainCoachName ? (coachMap.get(mainCoachName) || null) : null

        let city = ''
        const cityMatch = reg.academy.match(/\(([^)]+)\)$/)
        if (cityMatch) {
          city = cityMatch[1].trim()
        }

        return {
          event_id: event.id,
          position: idx + 1,
          type: act.modality,
          style: act.style,
          category: categoryCode,
          name: actName,
          academy: reg.academy,
          city: city,
          coach_id: coachId,
          present: isPresent,
        }
      })

      await supabase.from('participants').insert(rows)

      if (!event.started_at) {
        await supabase.from('events').update({
          current_position: 0, started_at: null, awards_mode: false,
        }).eq('id', event.id)
      }

      alert('Programa publicado exitosamente.')
    } catch (err) {
      alert('Error al publicar: ' + (err as Error).message)
    } finally {
      setPublishing(false)
    }
  }

  // Group left items for rendering
  const groupedLeft = useMemo(() => {
    const groups: { category: string; items: ProgramItem[] }[] = []
    let currentCategory = ''
    
    const filtered = leftItems.filter(item => {
      if (!searchQuery) return true
      const query = searchQuery.toLowerCase()
      const academy = item.reg.academy.toLowerCase()
      const team = (item.reg.team_name || '').toLowerCase()
      const style = (item.act.style || '').toLowerCase()
      const dancers = item.reg.dancers
        .filter(d => (item.act.dancer_ids || []).includes(d.id))
        .map(d => d.name.toLowerCase())
      return academy.includes(query) || team.includes(query) || style.includes(query) || dancers.some(n => n.includes(query))
    })

    for (const item of filtered) {
      const cat = item.act.age_category ? AGE_CATEGORY_LABELS[item.act.age_category] : 'Open'
      if (cat !== currentCategory) {
        groups.push({ category: cat, items: [] })
        currentCategory = cat
      }
      groups[groups.length - 1].items.push(item)
    }
    return groups
  }, [leftItems, searchQuery])

  // Group right items for category display headers
  const groupedRight = useMemo(() => {
    const groups: { category: string; items: ProgramItem[] }[] = []
    let currentCategory = ''
    for (const item of rightItems) {
      const cat = item.act.age_category ? AGE_CATEGORY_LABELS[item.act.age_category] : 'Open'
      if (cat !== currentCategory) {
        groups.push({ category: cat, items: [] })
        currentCategory = cat
      }
      groups[groups.length - 1].items.push(item)
    }
    return groups
  }, [rightItems])

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 select-none">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-neutral-600 animate-spin" style={{ animationDuration: '2s' }} />
          <p className="font-display text-sm tracking-[0.2em] font-bold text-neutral-500 uppercase">
            Verificando credenciales...
          </p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#F6F6F6] text-black flex flex-col items-center justify-center p-6 select-none relative">
        {/* Sutil cuadrícula deportiva de fondo */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000005_1px,transparent_1px),linear-gradient(to_bottom,#00000005_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

        <div className="mb-8 opacity-100 flex flex-col items-center gap-2">
          <img src="/logo.png" alt="Dance4ever" className="w-[180px] h-auto" />
        </div>

        <div className="border-2 border-black bg-white p-8 w-full max-w-sm rounded-none text-center space-y-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] relative z-10">
          <div className="space-y-1.5">
            <h2 className="font-display text-2xl tracking-widest uppercase font-black text-black italic">
              CREADOR DE PROGRAMA
            </h2>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2 text-left">
              <label className="text-[10px] text-neutral-800 font-extrabold uppercase tracking-widest block font-sans">
                CONTRASEÑA DE ACCESO
              </label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="••••••••••••"
                disabled={verifyingPassword}
                className="w-full px-3.5 py-3 bg-neutral-50 rounded-none border-2 border-neutral-200 text-sm text-center text-black placeholder-neutral-300 focus:outline-none focus:border-black focus:bg-white transition-all font-mono font-bold"
              />
            </div>

            {authError && (
              <div className="bg-red-50 border-2 border-red-500/80 text-red-700 text-xs py-2.5 px-3 rounded-none text-center font-bold font-sans animate-pulse">
                ⚠️ {authError.toUpperCase()}
              </div>
            )}

            <button
              type="submit"
              disabled={verifyingPassword || !authPassword.trim()}
              className="w-full py-3.5 bg-black text-white hover:bg-neutral-800 transition-colors font-display text-sm tracking-widest font-black rounded-none disabled:opacity-50 uppercase flex items-center justify-center gap-2 border-2 border-black"
            >
              {verifyingPassword ? 'VERIFICANDO...' : 'INGRESAR'}
            </button>
          </form>
        </div>

        <div className="flex flex-col items-center gap-2 mt-12 relative z-10">
          <div className="w-16 h-[2px] bg-black" />
          <p className="text-black text-sm tracking-[0.4em] uppercase font-black font-display italic">
            DANCE4EVER
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen lg:h-screen bg-[#F6F6F6] text-black p-6 flex flex-col gap-6 lg:overflow-hidden">
      
      {/* Standalone Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b-2 border-black pb-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="font-display text-3xl tracking-tight uppercase font-black text-black italic">Creador de Programa</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Event Select Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-black font-extrabold uppercase tracking-widest">Evento:</span>
            <select
              value={event?.id || ''}
              onChange={e => setEvent(events.find(ev => ev.id === e.target.value) || null)}
              className="bg-white border-2 border-black rounded-none px-3 py-2 text-sm text-black focus:outline-none focus:border-black font-bold uppercase"
            >
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>{ev.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setIsEditing(!isEditing)}
            disabled={rightItems.length === 0}
            className="h-10 px-4 bg-white border-2 border-black text-black rounded-none font-display text-xs tracking-widest font-black hover:bg-neutral-100 active:scale-95 transition-all flex items-center justify-center uppercase"
          >
            <span>{isEditing ? 'LISTO' : 'REORDENAR'}</span>
          </button>

          <button
            onClick={handlePublish}
            disabled={publishing || rightItems.length === 0}
            className="h-10 px-4 bg-black text-white rounded-none border-2 border-black font-display text-xs tracking-widest font-black hover:bg-neutral-800 active:scale-95 transition-all flex items-center justify-center gap-1.5 uppercase"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{publishing ? 'PUBLICANDO...' : 'PUBLICAR'}</span>
          </button>
        </div>
      </header>

      {/* Global Alerts & Controls */}
      {event && (
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white border-2 border-black rounded-none p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,0.1)]">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-xs text-black font-extrabold tracking-widest uppercase">Separación recomendada:</label>
              <input
                type="number"
                min={1}
                max={20}
                value={minGap}
                onChange={e => {
                  const val = e.target.value
                  if (val === '') {
                    setMinGap('')
                  } else {
                    const num = Number(val)
                    if (!isNaN(num)) {
                      setMinGap(Math.max(1, num))
                    }
                  }
                }}
                className="w-16 bg-neutral-50 border-2 border-neutral-300 rounded-none px-2 py-1.5 text-sm text-center text-black font-bold focus:outline-none focus:border-black [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-xs text-neutral-500 font-bold uppercase">coreografías</span>
            </div>

            {conflicts.length > 0 && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-black uppercase tracking-wider border-2 ${
                conflicts.some(c => c.gap <= 1)
                  ? 'bg-red-50 text-red-700 border-red-500'
                  : 'bg-amber-50 text-amber-700 border-amber-500'
              }`}>
                <AlertTriangle className="w-3.5 h-3.5" />
                {conflicts.length} conflictos detectados en la línea de tiempo
              </div>
            )}
          </div>

          <div className="text-xs text-neutral-500 font-bold uppercase tracking-widest">
            {rightItems.length} colocadas · {leftItems.length} pendientes en bandeja
          </div>
        </div>
      )}

      {loading && !event ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 py-24">
          <RefreshCw className="w-8 h-8 text-neutral-600 animate-spin" />
          <p className="text-sm text-neutral-500 uppercase font-bold tracking-wider">Cargando evento y programa...</p>
        </div>
      ) : !event ? (
        <div className="flex-1 flex items-center justify-center text-neutral-500">
          No se encontraron eventos disponibles
        </div>
      ) : (
        /* Workspace */
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch min-h-0">
          
          {/* Left Column: Pool */}
          <div className="lg:col-span-5 bg-white border-2 border-black rounded-none p-5 space-y-4 flex flex-col h-[70vh] lg:h-full min-h-0 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.15)]">
            <div className="flex items-center justify-between border-b-2 border-neutral-100 pb-3 shrink-0">
              <h2 className="font-display text-sm tracking-wider uppercase text-neutral-950 font-black italic">Bandeja de Origen</h2>
              <span className="text-xs text-white font-extrabold bg-black px-2.5 py-0.5 rounded-none">{leftItems.length}</span>
            </div>

            <div className="relative shrink-0">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-3.5" />
              <input
                type="text"
                placeholder="Buscar por academia, estilo, bailarín..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-neutral-50 border-2 border-neutral-200 rounded-none pl-9 pr-3 py-2.5 text-sm text-black focus:outline-none focus:border-black focus:bg-white placeholder-neutral-400 font-bold"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-3 text-neutral-400 hover:text-black">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4">
              {leftItems.length === 0 ? (
                <div className="text-center text-neutral-500 py-16 text-sm font-bold uppercase tracking-wider">
                  Todas las coreografías han sido colocadas.
                </div>
              ) : groupedLeft.length === 0 ? (
                <div className="text-center text-neutral-500 py-16 text-sm font-bold uppercase tracking-wider">
                  Sin coincidencias.
                </div>
              ) : (
                groupedLeft.map(group => (
                  <div key={`left-group-${group.category}`} className="space-y-2">
                    <div className="flex items-center gap-3 pt-3 pb-0.5 first:pt-0">
                      <div className="h-0.5 flex-1 bg-red-500/70 rounded-full" />
                      <span className="font-display text-sm tracking-[0.35em] uppercase font-black px-1 text-red-600">{group.category}</span>
                      <div className="h-0.5 flex-1 bg-red-500/70 rounded-full" />
                    </div>
                    <div className="space-y-2">
                      {(() => {
                        const leftRendered: React.ReactNode[] = []
                        let lastLeftSubgroup = ''
                        group.items.forEach((item, idx) => {
                          const comp = getCompatibility(item)
                          const compStyle = COMPATIBILITY_STYLES[comp]
                          const mod = MODALITY_LABELS[item.act.modality].toUpperCase()
                          const styleLabel = item.act.style ? item.act.style.toUpperCase() : ''
                          const subgroup = [mod, styleLabel].filter(Boolean).join(' · ')

                          if (subgroup && subgroup !== lastLeftSubgroup) {
                            leftRendered.push(
                              <div key={`left-sub-${group.category}-${subgroup}-${idx}`} className="flex items-center gap-2 pt-1 pb-0.5">
                                <div className="h-0.5 flex-1 bg-emerald-600/40 rounded-full" />
                                <span className="font-display text-xs tracking-[0.2em] uppercase font-black text-emerald-700 px-1">{subgroup}</span>
                                <div className="h-0.5 flex-1 bg-emerald-600/40 rounded-full" />
                              </div>
                            )
                            lastLeftSubgroup = subgroup
                          }

                          leftRendered.push(
                            <div
                              key={item.id}
                              onClick={() => moveToRight(item)}
                              className={`flex items-center gap-3 p-3 rounded-none border-2 cursor-pointer transition-all ${compStyle.border} ${compStyle.bg} hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[9px] font-extrabold bg-black text-white px-1.5 py-0.5 rounded-none uppercase tracking-wider">
                                    {MODALITY_LABELS[item.act.modality].toUpperCase()}
                                  </span>
                                  {item.act.style && (
                                    <span className="text-[9px] text-neutral-600 font-bold uppercase">{item.act.style}</span>
                                  )}
                                </div>
                                <p className="text-xs font-black truncate mt-1 text-black">
                                  {item.reg.academy}{shouldShowTeam(item.reg.academy, item.reg.team_name) ? ` (${item.reg.team_name})` : ''}
                                </p>
                                {(() => {
                                  const dancersInAct = item.reg.dancers.filter(d => (item.act.dancer_ids || []).includes(d.id))
                                  return dancersInAct.length > 0 && (
                                    <div className="mt-1 flex flex-col gap-0.5">
                                      {dancersInAct.map(d => (
                                        <p key={d.id} className="text-xs text-neutral-600 font-bold leading-tight">
                                          {d.name}
                                        </p>
                                      ))}
                                    </div>
                                  )
                                })()}
                              </div>

                              <div className="shrink-0 flex items-center gap-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    openEditDancers(item)
                                  }}
                                  className="p-1.5 bg-white border-2 border-black text-neutral-400 hover:text-black rounded-none hover:bg-neutral-50 active:scale-95 transition-all"
                                  title="Editar Integrantes"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>

                                <div className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-none border border-black/10 bg-white">
                                  <span className={`w-1.5 h-1.5 rounded-full ${compStyle.dot}`} />
                                  <span className={`text-[8px] font-black tracking-wider ${compStyle.text}`}>{compStyle.label}</span>
                                </div>
                              </div>

                              <div className="shrink-0 text-neutral-400 hover:text-black transition-colors">
                                <ArrowRight className="w-4 h-4" />
                              </div>
                            </div>
                          )
                        })
                        return leftRendered
                      })()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column: Timeline */}
          <div className="lg:col-span-7 bg-white border-2 border-black rounded-none p-5 space-y-4 flex flex-col h-[70vh] lg:h-full min-h-0 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.15)]">
            <div className="flex items-center justify-between border-b-2 border-neutral-100 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-sm tracking-wider uppercase text-neutral-950 font-black italic">Programa final</h2>
                <span className="text-xs text-white font-extrabold bg-black px-2.5 py-0.5 rounded-none">{rightItems.length}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={handleFillAutoSchedule}
                  className="text-[10px] text-black bg-white border-2 border-black px-3 py-1.5 rounded-none font-black hover:bg-neutral-50 active:scale-95 transition-all uppercase tracking-wider"
                  title="Llenar automáticamente el programa"
                >
                  AUTO-COMPLETAR
                </button>
                <button
                  onClick={handleReset}
                  className="text-[10px] text-red-600 bg-white border-2 border-red-500 px-3 py-1.5 rounded-none font-black hover:bg-red-50 active:scale-95 transition-all uppercase tracking-wider"
                  title="Vaciar todo el programa"
                >
                  VACIAR TODO
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {rightItems.length === 0 ? (
                <div className="text-center text-neutral-500 py-24 text-sm font-bold uppercase tracking-wider leading-relaxed">
                  La línea de tiempo está vacía.<br/>
                  Selecciona coreografías de la bandeja de origen para agregarlas aquí.
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1 pr-1">
                      {(() => {
                        let globalIdx = 0
                        const rendered: React.ReactNode[] = []
                        let lastSubgroup = ''

                        for (let gIdx = 0; gIdx < groupedRight.length; gIdx++) {
                          const group = groupedRight[gIdx]
                          const colors = (group.items[0]?.act.age_category && CATEGORY_COLORS[group.items[0].act.age_category]) ?? CATEGORY_COLORS.open
                          
                          // Category header — red accent, bold, large
                          rendered.push(
                            <div key={`cat-right-${group.category}-${gIdx}`} className="flex items-center gap-3 pt-4 pb-1.5 first:pt-0">
                              <div className="h-0.5 flex-1 bg-red-500/70 rounded-full" />
                              <span className="font-display text-sm tracking-[0.35em] uppercase font-black px-1 text-red-600">{group.category}</span>
                              <div className="h-0.5 flex-1 bg-red-500/70 rounded-full" />
                            </div>
                          )
                          lastSubgroup = ''

                          for (const item of group.items) {
                            const isIntermedioPos = intermedioIndex === globalIdx
                            if (isIntermedioPos) {
                              rendered.push(<IntermedioMarker key={INTERMEDIO_ID} isEditing={isEditing} />)
                            }

                            // Sub-divider by modality + style
                            const mod = MODALITY_LABELS[item.act.modality].toUpperCase()
                            const styleLabel = item.act.style ? item.act.style.toUpperCase() : ''
                            const subgroup = [mod, styleLabel].filter(Boolean).join(' · ')
                            
                            if (subgroup && subgroup !== lastSubgroup) {
                              rendered.push(
                                <div key={`sub-right-${group.category}-${subgroup}-${globalIdx}`} className="flex items-center gap-2 pt-1 pb-0.5">
                                  <div className="h-0.5 flex-1 bg-emerald-600/40 rounded-full" />
                                  <span className="font-display text-xs tracking-[0.2em] uppercase font-black text-emerald-700 px-1">{subgroup}</span>
                                  <div className="h-0.5 flex-1 bg-emerald-600/40 rounded-full" />
                                </div>
                              )
                              lastSubgroup = subgroup
                            }

                            rendered.push(
                              <SortableActItem
                                key={item.id}
                                item={item}
                                index={globalIdx + 1}
                                conflicts={conflictMap.get(globalIdx) || []}
                                isEditing={isEditing}
                                onRemove={() => moveToLeft(item)}
                                onEdit={() => openEditDancers(item)}
                              />
                            )
                            globalIdx++
                          }
                        }

                        if (intermedioIndex !== null && intermedioIndex >= globalIdx) {
                          rendered.push(<IntermedioMarker key={INTERMEDIO_ID} isEditing={isEditing} />)
                        }

                        rendered.push(
                          <div key="ceremony-final" className="bg-black border-2 border-black rounded-none px-4 py-3 flex items-center justify-center gap-2 text-white">
                            <Award className="w-5 h-5 text-white" />
                            <span className="font-display text-base tracking-[0.2em] text-white uppercase font-black italic">Premiacion Final</span>
                            <Award className="w-5 h-5 text-white" />
                          </div>
                        )

                        return rendered
                      })()}
                    </div>
                  </SortableContext>

                  <DragOverlay>
                    {activeId ? (
                      activeId === INTERMEDIO_ID ? (
                        <div className="bg-amber-500 border-2 border-black rounded-none px-4 py-3 opacity-90 shadow-2xl">
                          <Award className="w-5 h-5 text-white inline-block mr-2" />
                          <span className="font-display text-base tracking-wider text-white uppercase font-bold">Bloque 1</span>
                        </div>
                      ) : (
                        (() => {
                          const it = rightItems.find(i => i.id === activeId)
                          if (!it) return null
                          return <ActCard item={it} index={0} isDragOverlay isEditing={isEditing} />
                        })()
                      )
                    ) : null}
                  </DragOverlay>
                </DndContext>
              )}
            </div>
          </div>

        </div>
      )}

      {editingActItem && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 select-none">
          <div className="bg-white border-4 border-black p-6 w-full max-w-2xl rounded-none shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] space-y-6 flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b-2 border-black pb-3 shrink-0">
              <h3 className="font-display text-lg uppercase font-black text-black italic">
                Editar Integrantes
              </h3>
              <p className="text-xs text-neutral-500 font-bold uppercase tracking-wider">
                {editingActItem.reg.academy}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {editingDancers.map((d, index) => (
                <div key={d.id} className="border-2 border-black p-4 bg-neutral-50 space-y-3">
                  <p className="text-xs font-black text-black uppercase tracking-wider">Integrante #{index + 1}</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] text-neutral-700 font-black uppercase tracking-widest block mb-1">Nombre</label>
                      <input
                        type="text"
                        value={d.name}
                        onChange={e => {
                          const val = e.target.value
                          setEditingDancers(prev => prev.map(item => item.id === d.id ? { ...item, name: val } : item))
                        }}
                        className="bg-white border-2 border-black rounded-none px-3 py-1.5 text-sm text-black font-bold focus:outline-none focus:border-black w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-700 font-black uppercase tracking-widest block mb-1">Fecha de Nacimiento</label>
                      <input
                        type="date"
                        value={d.birthdate}
                        onChange={e => {
                          const val = e.target.value
                          setEditingDancers(prev => prev.map(item => item.id === d.id ? { ...item, birthdate: val } : item))
                        }}
                        className="bg-white border-2 border-black rounded-none px-3 py-1.5 text-sm text-black font-bold focus:outline-none focus:border-black w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-neutral-700 font-black uppercase tracking-widest block mb-1">Categoría</label>
                      <select
                        value={d.category_manual ? (d.category || 'open') : 'auto'}
                        onChange={e => {
                          const val = e.target.value
                          setEditingDancers(prev => prev.map(item => {
                            if (item.id === d.id) {
                              if (val === 'auto') {
                                return { ...item, category_manual: false }
                              } else {
                                return { ...item, category_manual: true, category: val as AgeCategory }
                              }
                            }
                            return item
                          }))
                        }}
                        className="bg-white border-2 border-black rounded-none px-3 py-1.5 text-sm text-black font-bold focus:outline-none focus:border-black w-full"
                      >
                        <option value="auto">Automática (según edad)</option>
                        {AGE_CATEGORY_ORDER.map(cat => (
                          <option key={cat} value={cat}>{AGE_CATEGORY_LABELS[cat]}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t-2 border-black shrink-0">
              <button
                onClick={() => setEditingActItem(null)}
                className="px-4 py-2 bg-white border-2 border-black text-black rounded-none font-display text-xs tracking-widest font-black hover:bg-neutral-100 active:scale-95 transition-all uppercase"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveDancers}
                className="px-4 py-2 bg-black text-white border-2 border-black rounded-none font-display text-xs tracking-widest font-black hover:bg-neutral-800 active:scale-95 transition-all uppercase"
              >
                Guardar Cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SortableActItem({ item, index, conflicts, isEditing, onRemove, onEdit }: {
  item: ProgramItem
  index: number
  conflicts?: Conflict[]
  isEditing: boolean
  onRemove: () => void
  onEdit: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !isEditing,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <ActCard item={item} index={index} dragHandle={listeners} conflicts={conflicts} isEditing={isEditing} onRemove={onRemove} onEdit={onEdit} />
    </div>
  )
}

function ActCard({ item, index, dragHandle, isDragOverlay, conflicts, isEditing, onRemove, onEdit }: {
  item: ProgramItem
  index: number
  dragHandle?: ReturnType<typeof useSortable>['listeners']
  isDragOverlay?: boolean
  conflicts?: Conflict[]
  isEditing?: boolean
  onRemove?: () => void
  onEdit?: () => void
}) {
  const { act, reg } = item
  const catLabel = act.age_category ? AGE_CATEGORY_LABELS[act.age_category].toUpperCase() : 'OPEN'
  const colors = act.age_category ? CATEGORY_COLORS[act.age_category] : CATEGORY_COLORS.open
  const mod = MODALITY_LABELS[act.modality].toUpperCase()
  const dancersInAct = reg.dancers.filter(d => (act.dancer_ids || []).includes(d.id))
  const hasConflict = conflicts && conflicts.length > 0
  const conflictDancerNames = hasConflict
    ? [...new Set(conflicts!.map(c => c.dancerName))].join(', ')
    : ''

  return (
    <div className={`flex items-start gap-3 p-3 rounded-none border-2 transition-all ${
      isDragOverlay
        ? `${colors.bg} border-black shadow-2xl`
        : `bg-white border-neutral-200 hover:border-black hover:-translate-y-0.5 hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]`
    } ${hasConflict && !isDragOverlay ? '!border-red-500 bg-red-50' : ''}`}>
      {isEditing && (
        <button
          {...dragHandle}
          className="shrink-0 text-neutral-400 hover:text-black cursor-grab active:cursor-grabbing touch-none"
          aria-label="Arrastrar para reordenar"
        >
          <GripVertical className="w-5 h-5" />
        </button>
      )}

      <div className="shrink-0 flex items-center gap-1.5 min-w-[3.5rem] justify-end relative">
        {hasConflict && !isDragOverlay && (
          <span title={`${conflictDancerNames} participa en coreos pegadas`}>
            <AlertTriangle className="w-4 h-4 text-red-600 animate-pulse shrink-0" />
          </span>
        )}
        <span className={`font-display text-2xl font-black italic tabular-nums shrink-0 ${hasConflict && !isDragOverlay ? 'text-red-600' : 'text-black'}`}>
          #{String(index).padStart(2, '0')}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span 
            className="text-[10px] font-black bg-black text-white px-2 py-0.5 rounded-none uppercase tracking-widest"
          >
            {mod}
          </span>
          {(() => {
            return (
              <span 
                className={`text-[10px] font-black px-2 py-0.5 rounded-none uppercase border tracking-wider ${colors.badge}`}
              >
                {catLabel}
              </span>
            )
          })()}
          {act.style && (
            <span className="text-[10px] text-neutral-500 font-extrabold uppercase">- {act.style}</span>
          )}
        </div>
        <p className="text-sm font-black mt-1 text-black">
          {reg.academy}{shouldShowTeam(reg.academy, reg.team_name) ? ` - ${reg.team_name}` : ''}
        </p>
        {dancersInAct.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-0.5">
            {dancersInAct.map(d => (
              <p key={d.id} className="text-xs text-neutral-600 font-bold leading-tight">
                {d.name}
              </p>
            ))}
          </div>
        )}
        {hasConflict && !isDragOverlay && (
          <p className="text-xs text-red-600 font-black mt-1 leading-tight">
            {conflictDancerNames}
          </p>
        )}
      </div>

      <div className="shrink-0 flex flex-col items-end gap-2">
        <div className="text-[9px] text-neutral-500 font-bold uppercase text-right leading-tight">
          {act.modality === 'grupal' && <div>{dancersInAct.length} INT.</div>}
          {act.modality === 'grupal' && <div>{act.level === 'basico' ? 'Basico' : 'Avanzado'}</div>}
        </div>
        
        {onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            className="p-1 text-neutral-400 hover:text-black hover:bg-neutral-50 rounded-none transition-all border border-transparent hover:border-neutral-200"
            title="Editar Integrantes"
          >
            <Edit3 className="w-4 h-4" />
          </button>
        )}

        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="p-1 text-neutral-400 hover:text-red-600 hover:bg-neutral-50 rounded-none transition-all border border-transparent hover:border-neutral-200"
            title="Devolver al pool de origen"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )
}

function IntermedioMarker({ isEditing }: { isEditing: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: INTERMEDIO_ID,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="flex items-center gap-3 p-3 rounded-none bg-amber-50 border-2 border-dashed border-amber-500 hover:border-black transition-all">
        <button
          {...listeners}
          className="shrink-0 text-amber-500/60 hover:text-black cursor-grab active:cursor-grabbing touch-none"
          aria-label="Arrastrar para mover premiacion"
        >
          <GripVertical className="w-5 h-5" />
        </button>
        <Award className="w-5 h-5 text-amber-600 shrink-0" />
        <span className="font-display text-base tracking-[0.2em] text-amber-900 uppercase flex-1 text-center font-black italic">Bloque 1</span>
        <Award className="w-5 h-5 text-amber-600 shrink-0" />
      </div>
    </div>
  )
}
