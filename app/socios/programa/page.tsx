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
} from '@/lib/supabase'
import { useEventContext } from '@/app/socios/layout'
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
import { GripVertical, Send, Award, AlertTriangle } from 'lucide-react'
import { CATEGORY } from '../colors'

const MODALITY_LABELS: Record<Modality, string> = {
  solista: 'Solista', dueto: 'Dueto', trio: 'Trio', grupal: 'Grupal'
}

const CATEGORY_COLORS: Record<AgeCategory, { bg: string; border: string; text: string; badge: string; solidBg: string }> = {
  tiny:       { bg: 'bg-pink-500/10', border: 'border-pink-500/30', text: 'text-pink-400', badge: 'bg-pink-500/20 text-pink-300 border-pink-500/30', solidBg: 'bg-rose-100 border-rose-300 text-rose-700 font-bold' },
  mini:       { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30', solidBg: 'bg-orange-100 border-orange-300 text-orange-700 font-bold' },
  elementary: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30', solidBg: 'bg-amber-100 border-amber-300 text-amber-700 font-bold' },
  junior:     { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', solidBg: 'bg-emerald-100 border-emerald-300 text-emerald-700 font-bold' },
  senior:     { bg: 'bg-teal-500/10', border: 'border-teal-500/30', text: 'text-teal-400', badge: 'bg-teal-500/20 text-teal-300 border-teal-500/30', solidBg: 'bg-teal-100 border-teal-300 text-teal-700 font-bold' },
  college:    { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-400', badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30', solidBg: 'bg-indigo-100 border-indigo-300 text-indigo-700 font-bold' },
  open:       { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30', solidBg: 'bg-purple-100 border-purple-300 text-purple-700 font-bold' },
}

const MODALITY_ORDER: Modality[] = ['solista', 'dueto', 'trio', 'grupal']

type ProgramItem = {
  id: string
  act: RegistrationAct
  reg: { id: number; academy: string; team_name: string; dancers: RegistrationDancer[] }
}

const INTERMEDIO_ID = '___intermedio___'

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

export default function ProgramaPage() {
  const { event, lastSync } = useEventContext()

  const [registrations, setRegistrations] = useState<CoachRegistration[]>([])
  const [dancers, setDancers] = useState<RegistrationDancer[]>([])
  const [acts, setActs] = useState<RegistrationAct[]>([])
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [minGap, setMinGap] = useState(5)
  const [isEditing, setIsEditing] = useState(false)

  const allItems = useMemo(() => buildItems(registrations, dancers, acts), [registrations, dancers, acts])

  // Build sortable list with intermedio marker
  const [items, setItems] = useState<ProgramItem[]>([])
  const [intermedioIndex, setIntermedioIndex] = useState<number | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remoteChangeRef = useRef(false)

  const conflicts = useMemo(() => detectConflicts(items, minGap), [items, minGap])
  const conflictMap = useMemo(() => buildConflictMap(conflicts), [conflicts])

  // Load saved draft from Supabase on event change
  const loadDraft = useCallback(async () => {
    if (!event) return
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
  }, [event])

  const [draftData, setDraftData] = useState<{ act_order: number[]; intermedio_index: number | null; min_gap: number } | null>(null)

  useEffect(() => { loadDraft() }, [loadDraft, lastSync])

  // Apply draft order when both allItems and draft are ready
  useEffect(() => {
    if (allItems.length > 0 && draftLoaded && !initialized) {
      let ordered = allItems
      if (draftData?.act_order?.length) {
        const orderMap = new Map(draftData.act_order.map((id: number, i: number) => [id, i]))
        ordered = [...allItems].sort((a, b) => {
          const ia = orderMap.get(a.act.id) ?? 99999 + (orderMap.size > 0 ? 0 : 0)
          const ib = orderMap.get(b.act.id) ?? 99999 + (orderMap.size > 0 ? 0 : 0)
          return ia - ib
        })
        // Items not found in saved order keep their relative sort order
        const knownIds = new Set(draftData.act_order)
        const unknownA = allItems.filter(i => !knownIds.has(i.act.id))
        const seen = new Set<number>()
        ordered = ordered.filter(i => knownIds.has(i.act.id))
        for (const item of unknownA) {
          if (!seen.has(item.act.id)) {
            seen.add(item.act.id)
            ordered.push(item)
          }
        }
      }
      setItems(ordered)
      setIntermedioIndex(draftData?.intermedio_index ?? Math.ceil(allItems.length / 2))
      setInitialized(true)
    }
  }, [allItems, draftLoaded, draftData, initialized])

  // When data changes externally, update if we haven't reordered
  useEffect(() => {
    if (!initialized) return
    // Keep current order but add/remove items
    const currentIds = new Set(items.map(i => i.id))
    const newItems = allItems.filter(i => !currentIds.has(i.id))
    if (newItems.length > 0) {
      setItems(prev => [...prev, ...newItems])
    }
    // Remove deleted items
    const allIds = new Set(allItems.map(i => i.id))
    setItems(prev => prev.filter(i => allIds.has(i.id)))
  }, [allItems, initialized])

  // Auto-save draft to Supabase on any change (debounced 600ms)
  const saveDraft = useCallback(async () => {
    if (!event || items.length === 0 || remoteChangeRef.current) return
    try {
      await supabase.from('program_drafts').upsert({
        event_id: event.id,
        act_order: items.map(i => i.act.id),
        intermedio_index: intermedioIndex,
        min_gap: minGap,
        updated_at: new Date().toISOString(),
      })
    } catch {
      // Table might not exist yet; silently ignore
    }
  }, [event, items, intermedioIndex, minGap])

  useEffect(() => {
    if (!event || items.length === 0 || !initialized || remoteChangeRef.current) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveDraft(), 600)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [items, intermedioIndex, minGap, initialized, event, saveDraft])

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
      setInitialized(false)
    } finally { setLoading(false) }
  }, [event])

  useEffect(() => { loadAll() }, [loadAll, lastSync])

  useEffect(() => {
    if (!event) return
    const ch = supabase
      .channel(`socios-prog-${event.id}`)
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
  }, [event, loadAll, loadDraft])

  // Build sortable IDs list (items + intermedio marker)
  const sortableIds = useMemo(() => {
    const ids = items.map(i => i.id)
    if (intermedioIndex !== null) {
      const idx = Math.min(intermedioIndex, ids.length)
      return [...ids.slice(0, idx), INTERMEDIO_ID, ...ids.slice(idx)]
    }
    return ids
  }, [items, intermedioIndex])

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
      // Moving the intermedio marker changes its position
      let idx = newIndex
      if (oldIndex < newIndex) idx = newIndex // the marker takes the spot of the item it's dropped on
      else idx = newIndex
      // The intermedio moves; compute its new position relative to actual items
      const itemCount = items.length
      let realIdx = idx
      if (oldIndex < newIndex) realIdx = Math.min(idx, itemCount)
      else realIdx = Math.max(0, idx)
      setIntermedioIndex(realIdx)
      return
    }

    // Remove intermedio from the positions to get real item indices
    const interPos = sortableIds.indexOf(INTERMEDIO_ID)
    const realOldIdx = oldIndex - (interPos >= 0 && oldIndex > interPos ? 1 : 0)
    let realNewIdx = newIndex - (interPos >= 0 && newIndex > interPos ? 1 : 0)

    // Prevent dropping into intermedio position (intermedio gets rearranged)
    if (active.id !== INTERMEDIO_ID && over.id === INTERMEDIO_ID) {
      // Drop on intermedio means move to intermedio's position
      realNewIdx = intermedioIndex !== null ? intermedioIndex : items.length
      // Shift intermedio by 1
      if (realOldIdx < realNewIdx && intermedioIndex !== null) {
        setIntermedioIndex(Math.max(0, intermedioIndex - 1))
      } else if (intermedioIndex !== null) {
        setIntermedioIndex(Math.min(items.length, intermedioIndex + 1))
      }
    }

    setItems(arrayMove(items, realOldIdx, Math.max(0, Math.min(items.length - 1, realNewIdx))))
  }

  function handleAutoSchedule() {
    if (items.length === 0) return
    if (!confirm('Reordenar automáticamente las coreografías? Se intercalarán por academia para dar más tiempo entre coreos del mismo equipo.')) return
    setItems(autoSchedule(items))
  }

  async function handlePublish() {
    if (!event || items.length === 0) return

    const activeConflicts = conflicts
    let warn = `Publicar ${items.length} coreografías en el orden actual? Esto reemplazará el programa oficial.`
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
      // 1. Collect all unique coach names from all confirmed registrations
      const allCoaches = new Set<string>()
      registrations.forEach(r => {
        if (r.confirmed_at) {
          if (r.coach_name) allCoaches.add(r.coach_name.trim())
          r.extra_coaches?.forEach(x => x && allCoaches.add(x.trim()))
        }
      })

      // 2. Delete and recreate coaches for this event in Supabase
      await supabase.from('coaches').delete().eq('event_id', event.id)

      const coachRows = Array.from(allCoaches).map(name => ({ event_id: event.id, name }))
      const { data: insertedCoaches } = coachRows.length
        ? await supabase.from('coaches').insert(coachRows).select()
        : { data: [] }
      
      const coachMap = new Map((insertedCoaches || []).map(c => [c.name.toLowerCase().trim(), c.id]))

      // 3. Fetch existing participants to preserve their "present" status
      const { data: existingParts } = await supabase
        .from('participants')
        .select('name, style, category, present')
        .eq('event_id', event.id)

      const presentMap = new Map<string, boolean>()
      existingParts?.forEach(p => {
        // Normalize name, style, category as unique key
        const key = `${p.name ?? ''}|${p.style ?? ''}|${p.category ?? ''}`.toLowerCase().trim()
        const presentMapVal = !!p.present
        presentMap.set(key, presentMapVal)
      })

      // 4. Delete and recreate participants with correct coach_id
      await supabase.from('participants').delete().eq('event_id', event.id)

      const regMap = new Map(registrations.map(r => [r.id, r]))

      const rows = items.map((item, idx) => {
        const { act, reg } = item
        const dancersInAct = reg.dancers.filter(d => (act.dancer_ids || []).includes(d.id))
        const dancerNames = dancersInAct.map(d => d.name.split(' ').slice(0, 2).join(' ')).join(', ')
        const actName = reg.team_name
          ? `${reg.academy} (${reg.team_name})`
          : `${reg.academy} - ${dancerNames}`
        const ageCatCode = act.age_category ? AGE_CATEGORY_LABELS[act.age_category].toUpperCase() : 'OPEN'
        const categoryCode = `${ageCatCode} | ${act.level?.toUpperCase() || 'AVANZADO'}`

        const key = `${actName}|${act.style || ''}|${categoryCode}`.toLowerCase().trim()
        const isPresent = presentMap.get(key) ?? false

        // Look up coach_id by mapping registration back to coach
        const registration = regMap.get(reg.id)
        const mainCoachName = registration?.coach_name?.toLowerCase().trim()
        const coachId = mainCoachName ? (coachMap.get(mainCoachName) || null) : null

        return {
          event_id: event.id,
          position: idx + 1,
          type: act.modality,
          style: act.style,
          category: categoryCode,
          name: actName,
          academy: reg.academy,
          city: '',
          coach_id: coachId,
          present: isPresent,
        }
      })

      await supabase.from('participants').insert(rows)

      // Only reset event control fields if it has NOT been started yet
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

  // Group items by category for display headers
  const grouped = useMemo(() => {
    const groups: { category: string; items: ProgramItem[] }[] = []
    let currentCategory = ''
    for (const item of items) {
      const cat = item.act.age_category ? AGE_CATEGORY_LABELS[item.act.age_category] : 'Open'
      if (cat !== currentCategory) {
        groups.push({ category: cat, items: [] })
        currentCategory = cat
      }
      groups[groups.length - 1].items.push(item)
    }
    return groups
  }, [items])

  if (!event) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-neutral-500 text-lg font-display tracking-wider uppercase">Sin evento</p>
      </div>
    )
  }

  return (
    <div className="p-4 pb-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl tracking-wider uppercase">Programa Borrador</h1>
            <p className="text-xs text-neutral-500 mt-0.5">
              {items.length} coreografías{isEditing && ' · Arrastra para reordenar'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(!isEditing)}
              disabled={items.length === 0}
              style={isEditing ? { backgroundColor: '#db2777', color: '#ffffff' } : { backgroundColor: '#000000', color: '#ffffff' }}
              className="h-11 px-4 rounded-xl font-display text-xs tracking-wider active:scale-[0.98] disabled:opacity-50 transition-all font-bold flex items-center justify-center border border-neutral-800"
            >
              <span style={{ color: '#ffffff' }}>{isEditing ? 'LISTO' : 'EDITAR'}</span>
            </button>
            <button
              onClick={handleAutoSchedule}
              disabled={items.length === 0}
              style={{ backgroundColor: '#000000', color: '#ffffff' }}
              className="h-11 px-4 bg-black hover:bg-neutral-900 border border-neutral-800 rounded-xl font-display text-xs tracking-wider active:scale-[0.98] disabled:opacity-50 transition-all font-bold flex items-center justify-center"
              title="Reordenar automáticamente para evitar coreos pegadas"
            >
              <span style={{ color: '#ffffff' }}>ORDENAR</span>
            </button>
            <button
              onClick={handlePublish}
              disabled={publishing || items.length === 0}
              style={{ backgroundColor: '#000000', color: '#ffffff' }}
              className="h-11 px-4 bg-black hover:bg-neutral-900 border border-neutral-800 rounded-xl font-display text-xs tracking-wider active:scale-[0.98] disabled:opacity-50 transition-all font-bold flex items-center justify-center gap-1.5"
            >
              <Send className="w-4 h-4" style={{ color: '#ffffff' }} />
              <span style={{ color: '#ffffff' }}>{publishing ? 'PUBLICANDO...' : 'PUBLICAR'}</span>
            </button>
          </div>
        </div>

        {/* Settings + conflict summary row */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-400 font-bold tracking-wider uppercase">Alerta cada</label>
            <input
              type="number"
              min={1}
              max={20}
              value={minGap}
              onChange={e => setMinGap(Math.max(1, Number(e.target.value)))}
              className="w-12 bg-neutral-800 border-2 border-neutral-500 rounded-lg px-2 py-1 text-sm text-center text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-xs text-neutral-400">coreos</span>
          </div>

          {conflicts.length > 0 && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
              conflicts.some(c => c.gap <= 1)
                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}>
              <AlertTriangle className="w-3.5 h-3.5" />
              {conflicts.length} conflicto{conflicts.length !== 1 ? 's' : ''} detectado{conflicts.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center text-neutral-500 py-16 space-y-2">
          <p className="text-lg font-display tracking-wider">Sin coreografías confirmadas</p>
          <p className="text-sm">Espera a que los coaches confirmen sus registros para armar el programa.</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {(() => {
                let globalIdx = 0
                const rendered: React.ReactNode[] = []

                for (const group of grouped) {
                  const colors = (group.items[0]?.act.age_category && CATEGORY_COLORS[group.items[0].act.age_category]) ?? CATEGORY_COLORS.open
                  rendered.push(
                    <div key={`cat-${group.category}`} className={`${colors.solidBg} border rounded-xl px-4 py-3 flex items-center justify-center shadow-md`}>
                      <p className="font-display text-lg tracking-[0.2em] uppercase text-center font-bold text-black" style={{ color: '#000000' }}>
                        {group.category}
                      </p>
                    </div>
                  )

                  for (const item of group.items) {
                    const isIntermedioPos = intermedioIndex === globalIdx
                    if (isIntermedioPos) {
                      rendered.push(<IntermedioMarker key={INTERMEDIO_ID} isEditing={isEditing} />)
                    }

                    rendered.push(
                      <SortableActItem
                        key={item.id}
                        item={item}
                        index={globalIdx + 1}
                        conflicts={conflictMap.get(globalIdx) || []}
                        isEditing={isEditing}
                      />
                    )
                    globalIdx++
                  }
                }

                // If intermedio is at the end
                if (intermedioIndex !== null && intermedioIndex >= globalIdx) {
                  rendered.push(<IntermedioMarker key={INTERMEDIO_ID} isEditing={isEditing} />)
                }

                // Final ceremony
                rendered.push(
                  <div key="ceremony-final" className="bg-fuchsia-500/20 border border-fuchsia-500 rounded-xl px-4 py-3 flex items-center justify-center gap-2">
                    <Award className="w-5 h-5 text-fuchsia-400" />
                    <span className="font-display text-base tracking-[0.2em] text-fuchsia-400 uppercase">Premiacion Final</span>
                    <Award className="w-5 h-5 text-fuchsia-400" />
                  </div>
                )

                return rendered
              })()}
            </div>
          </SortableContext>

          {/* Drag overlay */}
          <DragOverlay>
            {activeId ? (
              activeId === INTERMEDIO_ID ? (
                <div className="bg-amber-500/80 backdrop-blur border-2 border-amber-400 rounded-xl px-4 py-3 opacity-90">
                  <Award className="w-5 h-5 text-white inline-block mr-2" />
                  <span className="font-display text-base tracking-wider text-white uppercase">Premiacion Intermedia</span>
                </div>
              ) : (
                (() => {
                  const it = items.find(i => i.id === activeId)
                  if (!it) return null
                  return <ActCard item={it} index={0} isDragOverlay isEditing={isEditing} />
                })()
              )
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}

function SortableActItem({ item, index, conflicts, isEditing }: { item: ProgramItem; index: number; conflicts?: Conflict[]; isEditing: boolean }) {
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
      <ActCard item={item} index={index} dragHandle={listeners} conflicts={conflicts} isEditing={isEditing} />
    </div>
  )
}

function ActCard({ item, index, dragHandle, isDragOverlay, conflicts, isEditing }: {
  item: ProgramItem
  index: number
  dragHandle?: ReturnType<typeof useSortable>['listeners']
  isDragOverlay?: boolean
  conflicts?: Conflict[]
  isEditing?: boolean
}) {
  const { act, reg } = item
  const catLabel = act.age_category ? AGE_CATEGORY_LABELS[act.age_category].toUpperCase() : 'OPEN'
  const colors = act.age_category ? CATEGORY_COLORS[act.age_category] : CATEGORY_COLORS.open
  const mod = MODALITY_LABELS[act.modality].toUpperCase()
  const dancersInAct = reg.dancers.filter(d => (act.dancer_ids || []).includes(d.id))
  const names = dancersInAct.map(d => d.name.split(' ').slice(0, 2).join(' ')).join(', ')
  const hasConflict = conflicts && conflicts.length > 0
  const conflictDancerNames = hasConflict
    ? [...new Set(conflicts!.map(c => c.dancerName))].join(', ')
    : ''

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
      isDragOverlay
        ? `${colors.bg} ${colors.border} shadow-2xl shadow-fuchsia-500/20`
        : `bg-neutral-800/30 border-neutral-700/40 hover:border-neutral-600/50`
    } ${hasConflict && !isDragOverlay ? '!border-red-500/30' : ''}`}>
      {isEditing && (
        <button
          {...dragHandle}
          className="shrink-0 text-neutral-600 hover:text-neutral-400 cursor-grab active:cursor-grabbing touch-none"
          aria-label="Arrastrar para reordenar"
        >
          <GripVertical className="w-5 h-5 animate-fade-in" />
        </button>
      )}

      <div className="shrink-0 flex items-center gap-1.5 min-w-[3.5rem] justify-end relative">
        {hasConflict && !isDragOverlay && (
          <span title={`${conflictDancerNames} participa en coreos pegadas`}>
            <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse shrink-0" />
          </span>
        )}
        <span className={`font-display text-lg font-bold tabular-nums ${hasConflict && !isDragOverlay ? 'text-red-400' : 'text-fuchsia-500'}`}>
          #{String(index).padStart(2, '0')}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span 
            style={{ backgroundColor: '#000000', color: '#ffffff' }}
            className="text-[10px] font-bold px-2 py-0.5 rounded uppercase"
          >
            {mod}
          </span>
          {(() => {
            const inline = (act.age_category && CATEGORY[act.age_category]) ?? CATEGORY.open
            return (
              <span 
                style={{ 
                  backgroundColor: inline.bg, 
                  color: inline.text, 
                  borderColor: inline.border,
                  borderWidth: '1px',
                  borderStyle: 'solid'
                }}
                className="text-[10px] font-black px-2 py-0.5 rounded-lg uppercase tracking-wider"
              >
                {catLabel}
              </span>
            )
          })()}
          {act.style && (
            <span className="text-[10px] text-neutral-400 font-bold uppercase">- {act.style}</span>
          )}
        </div>
        <p className="text-sm font-semibold truncate mt-1 text-neutral-200">
          {reg.academy}{reg.team_name ? ` - ${reg.team_name}` : ''}
        </p>
        {names && (
          <p className="text-[10px] text-neutral-500 truncate mt-0.5">
            {act.modality === 'grupal' ? `${dancersInAct.length} integrantes` : names}
          </p>
        )}
        {hasConflict && !isDragOverlay && (
          <p className="text-[10px] text-red-400/80 truncate mt-0.5 leading-tight">
            {conflictDancerNames}
          </p>
        )}
      </div>

      <div className="shrink-0 text-[9px] text-neutral-600 uppercase text-right leading-tight">
        {act.modality === 'grupal' && <div>{dancersInAct.length} int.</div>}
        <div>{act.level === 'basico' ? 'Basico' : 'Avanzado'}</div>
      </div>
    </div>
  )
}

function IntermedioMarker({ isEditing }: { isEditing: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: INTERMEDIO_ID,
    disabled: !isEditing,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border-2 border-dashed border-amber-500/40 hover:border-amber-500/60 transition-all">
        {isEditing && (
          <button
            {...listeners}
            className="shrink-0 text-amber-500/60 hover:text-amber-400 cursor-grab active:cursor-grabbing touch-none animate-fade-in"
            aria-label="Arrastrar para mover premiacion"
          >
            <GripVertical className="w-5 h-5" />
          </button>
        )}
        <Award className="w-5 h-5 text-amber-400 shrink-0" />
        <span className="font-display text-base tracking-[0.2em] text-amber-400 uppercase flex-1 text-center font-bold">Premiacion Intermedia</span>
        <Award className="w-5 h-5 text-amber-400 shrink-0" />
      </div>
    </div>
  )
}
