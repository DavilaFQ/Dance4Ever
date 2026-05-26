'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
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
import { GripVertical, Send, Award } from 'lucide-react'

const MODALITY_LABELS: Record<Modality, string> = {
  solista: 'Solista', dueto: 'Dueto', trio: 'Trio', grupal: 'Grupal'
}

const CATEGORY_COLORS: Record<AgeCategory, { bg: string; border: string; text: string; badge: string }> = {
  tiny:       { bg: 'bg-pink-500/10', border: 'border-pink-500/30', text: 'text-pink-400', badge: 'bg-pink-500/20 text-pink-300 border-pink-500/30' },
  mini:       { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  elementary: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  junior:     { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  senior:     { bg: 'bg-teal-500/10', border: 'border-teal-500/30', text: 'text-teal-400', badge: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  college:    { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-400', badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  open:       { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
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
  const { event } = useEventContext()

  const [registrations, setRegistrations] = useState<CoachRegistration[]>([])
  const [dancers, setDancers] = useState<RegistrationDancer[]>([])
  const [acts, setActs] = useState<RegistrationAct[]>([])
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  const allItems = useMemo(() => buildItems(registrations, dancers, acts), [registrations, dancers, acts])

  // Build sortable list with intermedio marker
  const [items, setItems] = useState<ProgramItem[]>([])
  const [intermedioIndex, setIntermedioIndex] = useState<number | null>(null)
  const [initialized, setInitialized] = useState(false)

  // Initialize items once
  useEffect(() => {
    if (allItems.length > 0 && !initialized) {
      const mid = Math.ceil(allItems.length / 2)
      setItems(allItems)
      setIntermedioIndex(mid)
      setInitialized(true)
    }
  }, [allItems, initialized])

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

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    if (!event) return
    const ch = supabase
      .channel(`socios-prog-${event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_registrations', filter: `event_id=eq.${event.id}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_dancers' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_acts' }, () => loadAll())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [event, loadAll])

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

  async function handlePublish() {
    if (!event || items.length === 0) return
    if (!confirm(`Publicar ${items.length} actos en el orden actual? Esto reemplazara el programa oficial.`)) return

    setPublishing(true)
    try {
      await supabase.from('participants').delete().eq('event_id', event.id)

      const rows = items.map((item, idx) => {
        const { act, reg } = item
        const dancersInAct = act.modality === 'grupal' ? reg.dancers : reg.dancers.filter(d => act.dancer_ids.includes(d.id))
        const dancerNames = dancersInAct.map(d => d.name.split(' ').slice(0, 2).join(' ')).join(', ')
        const actName = reg.team_name
          ? `${reg.academy} (${reg.team_name})`
          : `${reg.academy} - ${dancerNames}`
        const ageCatCode = act.age_category ? AGE_CATEGORY_LABELS[act.age_category].toUpperCase() : 'OPEN'

        return {
          event_id: event.id,
          position: idx + 1,
          type: act.modality,
          style: act.style,
          category: `${ageCatCode} | ${act.level?.toUpperCase() || 'AVANZADO'}`,
          name: actName,
          academy: reg.academy,
          city: '',
          coach_id: null,
          present: false,
        }
      })

      await supabase.from('participants').insert(rows)
      await supabase.from('events').update({
        current_position: 0, started_at: null, awards_mode: false,
      }).eq('id', event.id)

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

  if (loading && !event) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 rounded-full border-2 border-fuchsia-500/20 border-t-fuchsia-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 pb-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl tracking-wider uppercase">Programa Borrador</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            {items.length} actos · Arrastra para reordenar
          </p>
        </div>
        <button
          onClick={handlePublish}
          disabled={publishing || items.length === 0}
          className="flex items-center gap-1.5 bg-green-500 text-black px-4 py-2.5 rounded-xl font-display text-sm tracking-wider active:scale-95 disabled:opacity-50 transition-all font-bold"
        >
          <Send className="w-4 h-4" /> {publishing ? 'PUBLICANDO...' : 'PUBLICAR'}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-center text-neutral-500 py-16 space-y-2">
          <p className="text-lg font-display tracking-wider">Sin actos confirmados</p>
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
                    <div key={`cat-${group.category}`} className={`${colors.bg} ${colors.border} border rounded-xl px-4 py-2.5`}>
                      <p className={`font-display text-lg tracking-[0.2em] ${colors.text} uppercase`}>
                        {group.category}
                      </p>
                    </div>
                  )

                  for (const item of group.items) {
                    const isIntermedioPos = intermedioIndex === globalIdx
                    if (isIntermedioPos) {
                      rendered.push(<IntermedioMarker key={INTERMEDIO_ID} />)
                    }

                    rendered.push(
                      <SortableActItem
                        key={item.id}
                        item={item}
                        index={globalIdx + 1}
                      />
                    )
                    globalIdx++
                  }
                }

                // If intermedio is at the end
                if (intermedioIndex !== null && intermedioIndex >= globalIdx) {
                  rendered.push(<IntermedioMarker key={INTERMEDIO_ID} />)
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
                  return <ActCard item={it} index={0} isDragOverlay />
                })()
              )
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  )
}

function SortableActItem({ item, index }: { item: ProgramItem; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <ActCard item={item} index={index} dragHandle={listeners} />
    </div>
  )
}

function ActCard({ item, index, dragHandle, isDragOverlay }: {
  item: ProgramItem
  index: number
  dragHandle?: ReturnType<typeof useSortable>['listeners']
  isDragOverlay?: boolean
}) {
  const { act, reg } = item
  const catLabel = act.age_category ? AGE_CATEGORY_LABELS[act.age_category].toUpperCase() : 'OPEN'
  const colors = act.age_category ? CATEGORY_COLORS[act.age_category] : CATEGORY_COLORS.open
  const mod = MODALITY_LABELS[act.modality].toUpperCase()
  const dancersInAct = act.modality === 'grupal' ? reg.dancers : reg.dancers.filter(d => act.dancer_ids.includes(d.id))
  const names = dancersInAct.map(d => d.name.split(' ').slice(0, 2).join(' ')).join(', ')

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
      isDragOverlay
        ? `${colors.bg} ${colors.border} shadow-2xl shadow-fuchsia-500/20`
        : `bg-neutral-800/30 border-neutral-700/40 hover:border-neutral-600/50`
    }`}>
      <button
        {...dragHandle}
        className="shrink-0 text-neutral-600 hover:text-neutral-400 cursor-grab active:cursor-grabbing touch-none"
        aria-label="Arrastrar para reordenar"
      >
        <GripVertical className="w-5 h-5" />
      </button>

      <div className="shrink-0 w-8 text-right">
        <span className="font-display text-lg text-fuchsia-500 font-bold tabular-nums">
          #{String(index).padStart(2, '0')}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold bg-neutral-700 px-1.5 py-0.5 rounded uppercase text-neutral-200">{mod}</span>
          <span className={`text-[10px] font-bold ${colors.text}`}>{catLabel}</span>
          {act.style && (
            <span className="text-[10px] text-neutral-500">- {act.style}</span>
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
      </div>

      <div className="shrink-0 text-[9px] text-neutral-600 uppercase text-right leading-tight">
        {act.modality === 'grupal' && <div>{dancersInAct.length} int.</div>}
        <div>{act.level === 'basico' ? 'Basico' : 'Avanzado'}</div>
      </div>
    </div>
  )
}

function IntermedioMarker() {
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
      <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border-2 border-dashed border-amber-500/40 hover:border-amber-500/60 transition-all">
        <button
          {...listeners}
          className="shrink-0 text-amber-500/60 hover:text-amber-400 cursor-grab active:cursor-grabbing touch-none"
          aria-label="Arrastrar para mover premiacion"
        >
          <GripVertical className="w-5 h-5" />
        </button>
        <Award className="w-5 h-5 text-amber-400 shrink-0" />
        <span className="font-display text-base tracking-[0.2em] text-amber-400 uppercase flex-1">Premiacion Intermedia</span>
        <Award className="w-5 h-5 text-amber-400 shrink-0" />
      </div>
    </div>
  )
}
