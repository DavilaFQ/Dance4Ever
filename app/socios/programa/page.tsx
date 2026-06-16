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
import { Award, RefreshCw } from 'lucide-react'

const MODALITY_LABELS: Record<Modality, string> = {
  solista: 'Solista', dueto: 'Dueto', trio: 'Trio', grupal: 'Grupal'
}

const MODALITY_ORDER: Modality[] = ['solista', 'dueto', 'trio', 'grupal']

type ProgramItem = {
  id: string
  act: RegistrationAct
  reg: { id: number; academy: string; team_name: string; dancers: RegistrationDancer[] }
}

const INTERMEDIO_ID = '___intermedio___'

function shouldShowTeam(academy: string, teamName: string | null | undefined): boolean {
  if (!teamName) return false
  const cleanAcademy = academy.replace(/\s*\([^)]+\)$/, '').trim().toLowerCase()
  const cleanTeam = teamName.trim().toLowerCase()
  return cleanAcademy !== cleanTeam
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

export default function ProgramaTab() {
  const { event, lastSync } = useEventContext()

  const [registrations, setRegistrations] = useState<CoachRegistration[]>([])
  const [dancers, setDancers] = useState<RegistrationDancer[]>([])
  const [acts, setActs] = useState<RegistrationAct[]>([])
  const [loading, setLoading] = useState(true)
  const [draftOrder, setDraftOrder] = useState<number[]>([])
  const [intermedioIndex, setIntermedioIndex] = useState<number | null>(null)
  const [draftExists, setDraftExists] = useState(false)

  const allItems = useMemo(() => buildItems(registrations, dancers, acts), [registrations, dancers, acts])

  // Load saved draft order
  const loadDraft = useCallback(async () => {
    if (!event) return
    const { data } = await supabase
      .from('program_drafts')
      .select('*')
      .eq('event_id', event.id)
    if (data && data.length > 0) {
      const d = data[0]
      setDraftOrder(d.act_order ?? [])
      setIntermedioIndex(d.intermedio_index ?? null)
      setDraftExists(true)
    } else {
      setDraftOrder([])
      setIntermedioIndex(null)
      setDraftExists(false)
    }
  }, [event])

  const loadAll = useCallback(async () => {
    if (!event) return
    setLoading(true)
    try {
      const [rr, dr, ar] = await Promise.all([
        supabase.from('coach_registrations').select('*').eq('event_id', event.id),
        supabase.from('registration_dancers').select('*'),
        supabase.from('registration_acts').select('*'),
        loadDraft(),
      ])
      const regs = rr.data ?? []
      const regIds = new Set(regs.map(r => r.id))
      setRegistrations(regs)
      setDancers((dr.data ?? []).filter(d => regIds.has(d.registration_id)))
      setActs((ar.data ?? []).filter(a => regIds.has(a.registration_id)))
    } finally { setLoading(false) }
  }, [event, loadDraft])

  useEffect(() => { loadAll() }, [loadAll, lastSync])

  // Ordered list
  const orderedItems = useMemo(() => {
    if (allItems.length === 0) return []
    if (!draftExists) return []

    const rightItemsMap = new Map(allItems.map(item => [item.act.id, item]))
    
    const placed = draftOrder
      .map(id => rightItemsMap.get(id))
      .filter(Boolean) as ProgramItem[]
    
    return placed
  }, [allItems, draftOrder, draftExists])

  // Group items for display
  const grouped = useMemo(() => {
    const groups: { category: string; items: ProgramItem[] }[] = []
    let currentCategory = ''
    for (const item of orderedItems) {
      const cat = item.act.age_category ? AGE_CATEGORY_LABELS[item.act.age_category] : 'Open'
      if (cat !== currentCategory) {
        groups.push({ category: cat, items: [] })
        currentCategory = cat
      }
      groups[groups.length - 1].items.push(item)
    }
    return groups
  }, [orderedItems])

  if (!event) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500 py-12">
        Sin evento activo
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-neutral-500">
        <RefreshCw className="w-6 h-6 animate-spin text-neutral-600" />
        <span className="text-xs uppercase font-bold tracking-wider">Cargando vista previa...</span>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4 socios-tab-programa">
      
      {/* Preview Timeline */}
      <div className="space-y-3">
        <div className="flex items-center justify-between pl-1">
          <h3 className="font-display text-xs tracking-wider uppercase text-neutral-400 font-bold">Vista Previa del Borrador</h3>
          <span className="text-[10px] text-neutral-500 bg-neutral-800 px-2.5 py-1 rounded-lg font-bold">{orderedItems.length} coreografías</span>
        </div>

        {orderedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center text-neutral-500 text-sm font-bold uppercase tracking-wider p-6">
            {!draftExists 
              ? 'El borrador del programa aún no ha sido iniciado.' 
              : 'No hay coreografías programadas en el borrador.'}
          </div>
        ) : (
          <div className="space-y-1.5">
            {(() => {
              let globalIdx = 0
              const rendered: React.ReactNode[] = []
              let lastCat = ''
              let lastSubgroup = ''

              for (let gIdx = 0; gIdx < grouped.length; gIdx++) {
                const group = grouped[gIdx]
                
                // Lightweight category header
                rendered.push(
                  <div key={`cat-preview-${group.category}-${gIdx}`} className="flex items-center gap-2 pt-4 pb-1 first:pt-0 select-none">
                    <div className="h-px flex-1 bg-red-500/50" />
                    <span className="font-display text-[10px] tracking-[0.3em] text-red-500 uppercase font-bold px-2">{group.category}</span>
                    <div className="h-px flex-1 bg-red-500/50" />
                  </div>
                )
                lastCat = group.category
                lastSubgroup = ''

                for (const item of group.items) {
                  const isIntermedioPos = intermedioIndex === globalIdx
                  if (isIntermedioPos) {
                    rendered.push(
                      <div key={`intermedio-${globalIdx}`} className="flex items-center justify-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-dashed border-amber-500/30 select-none">
                        <Award className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-display text-[10px] tracking-wider text-amber-400 uppercase font-bold">Premiacion Intermedia</span>
                      </div>
                    )
                  }

                  const { act, reg } = item
                  const mod = MODALITY_LABELS[act.modality].toUpperCase()
                  const styleLabel = act.style ? act.style.toUpperCase() : ''
                  const subgroup = [mod, styleLabel].filter(Boolean).join(' · ')
                  const dancersInAct = reg.dancers.filter(d => (act.dancer_ids || []).includes(d.id))
                  const names = dancersInAct.map(d => d.name.split(' ').slice(0, 2).join(' ')).join(', ')

                  // Sub-divider by modality + style
                  if (subgroup && subgroup !== lastSubgroup) {
                    rendered.push(
                      <div key={`sub-${group.category}-${subgroup}-${globalIdx}`} className="flex items-center gap-2 pb-0.5 pt-1 select-none">
                        <div className="h-px flex-1 bg-emerald-600/40" />
                        <span className="text-[8px] text-emerald-400 uppercase font-bold tracking-wider">{subgroup}</span>
                        <div className="h-px flex-1 bg-emerald-600/40" />
                      </div>
                    )
                    lastSubgroup = subgroup
                  }

                  rendered.push(
                    <div key={`act-prev-${item.id}`} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-neutral-800/60 bg-neutral-950/10">
                      <span className="font-display text-xs font-bold text-neutral-500 w-7 text-right shrink-0 select-none">
                        #{String(globalIdx + 1).padStart(2, '0')}
                      </span>
                      <div className="flex-1 min-w-0 select-none">
                        <p className="text-xs font-semibold truncate text-neutral-200">
                          {reg.academy}{shouldShowTeam(reg.academy, reg.team_name) ? ` (${reg.team_name})` : ''}
                        </p>
                        {names && act.modality !== 'grupal' && (
                          <p className="text-[9px] text-neutral-500 truncate mt-0.5">{names}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-[8px] text-neutral-600 uppercase text-right select-none">
                        <div>{act.level === 'basico' ? 'Básico' : 'Avanzado'}</div>
                      </div>
                    </div>
                  )
                  globalIdx++
                }
              }

              // Final ceremony
              rendered.push(
                <div key="ceremony-final-prev" className="flex items-center justify-center gap-2 mt-2 p-2.5 rounded-lg bg-fuchsia-950/20 border border-fuchsia-900/30 select-none">
                  <Award className="w-3.5 h-3.5 text-fuchsia-400" />
                  <span className="font-display text-[10px] tracking-wider text-fuchsia-400 uppercase font-bold">Premiacion Final</span>
                </div>
              )

              return rendered
            })()}
          </div>
        )}
      </div>

    </div>
  )
}
