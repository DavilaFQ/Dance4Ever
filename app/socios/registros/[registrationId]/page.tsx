'use client'

import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  supabase,
  CoachRegistration,
  RegistrationDancer,
  RegistrationAct,
  EditLog,
  Modality,
  Level,
  AGE_CATEGORY_ORDER,
  AGE_CATEGORY_LABELS,
  categoryFromBirthdate,
  Event,
  AgeCategory,
} from '@/lib/supabase'
import { useEventContext } from '@/app/socios/layout'
import {
  formatMoney, formatDate, formatRelative, formatBirthdate,
  ageFromBirthdate, isEditedAfterConfirm,
} from '@/lib/format'
import { costoRegistro, costBreakdown, dancerCost, MODALITY_MIN_DANCERS } from '@/lib/cost'
import {
  ArrowLeft, Edit3, Trash2, Plus, X, MessageCircle,
  CheckCircle2, Clock, ChevronDown, ChevronUp, AlertTriangle,
  Check, FileText,
} from 'lucide-react'
import { generateReceiptPDF, generateCartaPDF } from '@/lib/pdf'
import { type State } from '@/components/register/types'
import { STATUS } from '../../colors'

const MODALITY_LABELS: Record<Modality, string> = {
  solista: 'Solista', dueto: 'Dueto', trio: 'Trio', grupal: 'Grupal',
}

async function logEdit(regId: number, data: {
  edited_by?: string
  action?: string
  entity_type?: string
  entity_id?: number
  changes?: Record<string, { old: unknown; new: unknown }>
  snapshot?: Record<string, unknown>
}) {
  try {
    await supabase.from('registration_edit_log').insert({
      registration_id: regId,
      edited_by: data.edited_by ?? 'admin',
      action: data.action ?? 'update',
      entity_type: data.entity_type ?? null,
      entity_id: data.entity_id ?? null,
      changes: data.changes ?? {},
      created_at: new Date().toISOString(),
    })
  } catch {}
}

function actIsViable(modality: string, dancerCount: number): boolean {
  const min = MODALITY_MIN_DANCERS[modality] ?? 0
  if (modality === 'solista') return dancerCount === 1
  if (modality === 'dueto') return dancerCount === 2
  if (modality === 'trio') return dancerCount === 3
  if (modality === 'grupal') return dancerCount >= 4
  return dancerCount >= min
}

function mapDbToState(
  reg: CoachRegistration,
  dancers: RegistrationDancer[],
  acts: RegistrationAct[]
): State {
  const academyField = reg.academy || ''
  const teamNameField = reg.team_name || ''
  
  let academy = teamNameField
  let city = ''
  
  const match = academyField.match(/^(.*?)\s*\(([^)]+)\)$/)
  if (match) {
    academy = match[1].trim()
    city = match[2].trim()
  } else if (academyField) {
    academy = academyField
  }

  const extraCoaches = reg.extra_coaches || []
  const assistants = extraCoaches
    .filter(s => s.startsWith('Asistente:'))
    .map(s => s.replace(/^Asistente:\s*/, '').trim())
    .filter(Boolean)

  const stateDancers = dancers.map(d => ({
    name: d.name || '',
    birthdate: d.birthdate || '',
    categoryOverride: d.category_manual ? d.category : null,
  }))

  const dancerIdToIdx = new Map<number, number>()
  dancers.forEach((d, idx) => {
    dancerIdToIdx.set(d.id, idx)
  })

  const stateActs = acts.map(a => {
    const dancerIds = a.dancer_ids || []
    const dancerIndices = dancerIds
      .map(id => dancerIdToIdx.get(id))
      .filter((idx): idx is number => idx !== undefined)

    return {
      modality: a.modality,
      ageCategory: a.age_category,
      level: a.level,
      style: a.style || '',
      dancerIndices,
    }
  })

  return {
    coach: {
      name: reg.coach_name || '',
      phone: reg.coach_phone || '',
      email: reg.coach_email || '',
      assistants,
    },
    academy,
    city,
    teamName: teamNameField,
    teamSize: dancers.length,
    dancers: stateDancers,
    actCount: acts.length,
    acts: stateActs,
    costPaquete: reg.cost_paquete,
    costRepeticion: reg.cost_repeticion,
    confirmedRegistrationId: reg.id,
    ticketsCount: reg.tickets_count || 0,
    confirmedAt: reg.confirmed_at,
    notes: reg.notes || '',
    signature: null,
  }
}

export default function RegistrationDetailPage({ registrationIdProp, onBack }: { registrationIdProp?: string; onBack?: () => void }) {
  const router = useRouter()
  const params = useParams<{ registrationId: string }>()
  const registrationId = registrationIdProp ?? params?.registrationId
  const { event, lastSync } = useEventContext()

  const [reg, setReg] = useState<CoachRegistration | null>(null)
  const [dancers, setDancers] = useState<RegistrationDancer[]>([])
  const [acts, setActs] = useState<RegistrationAct[]>([])
  const [editLogs, setEditLogs] = useState<EditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [showDanger, setShowDanger] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const [paid, setPaid] = useState(0)
  const [paymentInput, setPaymentInput] = useState('')
  const [note, setNote] = useState('')
  const [broadcastChannel, setBroadcastChannel] = useState<any>(null)

  const [editingCoach, setEditingCoach] = useState(false)
  const [editAcademy, setEditAcademy] = useState('')
  const [editTeam, setEditTeam] = useState('')
  const [editCoachName, setEditCoachName] = useState('')
  const [editCoachPhone, setEditCoachPhone] = useState('')
  const [editCoachEmail, setEditCoachEmail] = useState('')
  const [editCostPaq, setEditCostPaq] = useState(0)
  const [editCostRep, setEditCostRep] = useState(0)
  const [editTickets, setEditTickets] = useState(0)
  const [isSaving, setIsSaving] = useState(false)

  const [editingDancer, setEditingDancer] = useState<RegistrationDancer | null>(null)
  const [dancerName, setDancerName] = useState('')
  const [dancerBirthdate, setDancerBirthdate] = useState('')
  const [dancerCategoryManual, setDancerCategoryManual] = useState(false)
  const [dancerCategoryOverride, setDancerCategoryOverride] = useState<AgeCategory>('open')

  const [editingAct, setEditingAct] = useState<RegistrationAct | null>(null)
  const [actModality, setActModality] = useState<Modality>('solista')
  const [actLevel, setActLevel] = useState<Level>('avanzado')
  const [actStyle, setActStyle] = useState('')
  const [actDancerIds, setActDancerIds] = useState<number[]>([])

  // Gestos de iOS: Deslizar desde el borde izquierdo para regresar
  useEffect(() => {
    if (!onBack) return

    let startX = 0
    let startY = 0
    let isSwiping = false

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (touch.clientX < 40) {
        startX = touch.clientX
        startY = touch.clientY
        isSwiping = true
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isSwiping) return
      const touch = e.touches[0]
      const deltaX = touch.clientX - startX
      const deltaY = Math.abs(touch.clientY - startY)

      if (deltaY > deltaX || deltaX < 0) {
        isSwiping = false
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isSwiping) return
      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - startX
      const deltaY = Math.abs(touch.clientY - startY)

      if (deltaX > 90 && deltaX > deltaY) {
        onBack()
      }
      isSwiping = false
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [onBack])

  const hasLoadedOnceRef = useRef(false)

  const loadData = useCallback(async () => {
    if (!registrationId) return
    if (!hasLoadedOnceRef.current) {
      setLoading(true)
    }
    try {
      const id = Number(registrationId)
      const [[rr], dr, ar, { data: logs }] = await Promise.all([
        supabase.from('coach_registrations').select('*').eq('id', id).limit(1).then(r => r.data ?? []),
        supabase.from('registration_dancers').select('*').eq('registration_id', id).order('order_idx'),
        supabase.from('registration_acts').select('*').eq('registration_id', id).order('order_idx'),
        supabase.from('registration_edit_log').select('*').eq('registration_id', id).order('created_at', { ascending: false }),
      ])

      if (rr) {
        const r = rr as unknown as CoachRegistration
        setReg(r)
        setDancers(dr.data ?? [])
        setActs(ar.data ?? [])
        setEditLogs((logs ?? []) as unknown as EditLog[])

        setPaid(r.paid ?? 0)
        setNote(r.payment_notes ?? '')
        hasLoadedOnceRef.current = true
      } else {
        setReg(null)
      }
    } finally { setLoading(false) }
  }, [registrationId])

  const handleDownloadPDF = async () => {
    if (!reg) return
    try {
      setGeneratingPDF(true)
      const mapped = mapDbToState(reg, dancers, acts)
      await generateReceiptPDF(mapped, event)
    } catch (err) {
      console.error('Error generating PDF:', err)
      alert('Hubo un error al generar tu comprobante PDF. Por favor, vuelve a intentarlo.')
    } finally {
      setGeneratingPDF(false)
    }
  }

  useEffect(() => { loadData() }, [loadData, lastSync])

  useEffect(() => {
    if (!registrationId || !reg) return
    const id = Number(registrationId)
    const ch = supabase
      .channel(`socios-reg-detail-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'coach_registrations', filter: `id=eq.${id}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_dancers', filter: `registration_id=eq.${id}` }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registration_acts', filter: `registration_id=eq.${id}` }, () => loadData())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [registrationId, reg, loadData])

  useEffect(() => {
    if (!event?.id) return
    const bc = supabase.channel(`broadcast-${event.id}`, { config: { broadcast: { self: true } } })
    bc.subscribe((status) => {
      if (status === 'SUBSCRIBED') setBroadcastChannel(bc)
    })
    return () => { supabase.removeChannel(bc) }
  }, [event?.id])

  const total = useMemo(() => reg ? costoRegistro(acts, dancers, reg.cost_paquete, reg.cost_repeticion, reg.tickets_count ?? 0, reg.extra_coaches ?? [], event) : 0, [acts, dancers, reg, event])
  const breakdown = useMemo(() => reg ? costBreakdown(acts, dancers, reg.cost_paquete, reg.cost_repeticion, reg.tickets_count ?? 0, reg.extra_coaches ?? [], event) : null, [acts, dancers, reg, event])

  const counts = useMemo(() => {
    const c = new Map<number, number>()
    acts.forEach(a => {
      const ids = a.dancer_ids || []
      ids.forEach(id => c.set(id, (c.get(id) ?? 0) + 1))
    })
    return c
  }, [acts])

  const handleConfirmPayment = async () => {
    if (!reg) return
    const abonoVal = Math.max(0, Number(paymentInput) || 0)
    if (abonoVal <= 0) return

    // Cap at total registration cost
    const newPaidVal = Math.min(total, (reg.paid ?? 0) + abonoVal)
    
    // Save to DB
    const { error } = await supabase
      .from('coach_registrations')
      .update({ paid: newPaidVal })
      .eq('id', reg.id)

    if (!error) {
      // Log edit
      await logEdit(reg.id, { 
        action: 'update', 
        changes: { 
          paid: { old: reg.paid ?? 0, new: newPaidVal } 
        } 
      })
      
      // Update local state smoothly
      setReg(prev => prev ? { ...prev, paid: newPaidVal } : null)
      setPaid(newPaidVal)
      
      // Reset input to empty/0
      setPaymentInput('')

      // Broadcast update to real-time subscribers
      if (broadcastChannel) {
        broadcastChannel.send({ 
          type: 'broadcast', 
          event: 'ledger_update', 
          payload: { regId: reg.id, paid: newPaidVal } 
        }).catch(() => {})
      }
    }
  }

  const handleNoteBlur = async () => {
    if (!reg) return
    const { error } = await supabase.from('coach_registrations').update({ payment_notes: note.trim() || null }).eq('id', reg.id)
    if (!error) {
      await logEdit(reg.id, { action: 'update', changes: { payment_notes: { old: reg.payment_notes, new: note.trim() || null } } })
      if (broadcastChannel) {
        broadcastChannel.send({ type: 'broadcast', event: 'ledger_update', payload: { regId: reg.id, note: note.trim() || null } }).catch(() => {})
      }
    }
  }

  const handleSaveDancerEdit = async () => {
    if (!editingDancer || !reg) return
    const calculatedCat = categoryFromBirthdate(dancerBirthdate)
    const finalCat = dancerCategoryManual ? dancerCategoryOverride : calculatedCat
    
    // 1. Update dancer in DB
    const { error } = await supabase
      .from('registration_dancers')
      .update({
        name: dancerName.trim(),
        birthdate: dancerBirthdate,
        category: finalCat,
        category_manual: dancerCategoryManual
      })
      .eq('id', editingDancer.id)
      
    if (error) {
      alert('Error al guardar integrante: ' + error.message)
      return
    }

    // 2. Recalculate act categories for all acts containing this dancer
    const affectedActs = acts.filter(a => a.dancer_ids.includes(editingDancer.id))
    const { data: updatedDancers } = await supabase
      .from('registration_dancers')
      .select('*')
      .eq('registration_id', reg.id)
      
    if (updatedDancers) {
      const dancerMap = new Map(updatedDancers.map(d => [d.id, d]))
      for (const act of affectedActs) {
        const actDancers = act.dancer_ids.map(id => dancerMap.get(id)).filter(Boolean) as RegistrationDancer[]
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

    // 3. Log edit
    await logEdit(reg.id, {
      entity_type: 'dancer',
      entity_id: editingDancer.id,
      action: 'update',
      changes: {
        name: { old: editingDancer.name, new: dancerName.trim() },
        birthdate: { old: editingDancer.birthdate, new: dancerBirthdate },
        category: { old: editingDancer.category, new: finalCat },
        category_manual: { old: editingDancer.category_manual, new: dancerCategoryManual }
      }
    })

    setEditingDancer(null)
    loadData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-10 h-10 rounded-full border-2 border-fuchsia-500/20 border-t-fuchsia-500 animate-spin" />
      </div>
    )
  }

  if (!reg) {
    return (
      <div className="p-6 text-center">
        <p className="text-neutral-400">Registro no encontrado.</p>
        <button onClick={() => onBack ? onBack() : router.back()} className="mt-3 text-fuchsia-500 font-bold text-sm">Volver</button>
      </div>
    )
  }

  const isDraft = !reg.submitted_at || reg.submitted_at.startsWith('1970-01-01')
  const isConfirmed = !isDraft && !!reg.confirmed_at
  const wasEdited = !isDraft && isEditedAfterConfirm(reg)
  const regAssistants = (reg.extra_coaches || [])
    .filter((s: string) => s.startsWith('Asistente:'))
    .map((s: string) => s.replace(/^Asistente:\s*/, '').trim())
    .filter(Boolean)

  return (
    <div className="p-4 pb-8 space-y-4">
      <button onClick={() => onBack ? onBack() : router.back()} className="flex items-center gap-1.5 text-neutral-400 hover:text-white transition-colors text-sm">
        <ArrowLeft className="w-4 h-4" /> Regresar
      </button>

      {/* Header */}
      <div className={`rounded-2xl border p-4 ${wasEdited ? 'bg-amber-500/5 border-amber-500/30' : 'bg-neutral-800/40 border-neutral-700/50'}`}>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl tracking-wide uppercase text-white leading-tight">
              {reg.academy || '(sin academia)'}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span 
                style={{ 
                  backgroundColor: isDraft ? STATUS.info : wasEdited ? STATUS.info : isConfirmed ? STATUS.success : STATUS.warning, 
                  color: '#000000' 
                }}
                className="inline-block text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-lg shadow-sm"
              >
                {isDraft ? 'BORRADOR' : wasEdited ? 'EDITADO' : isConfirmed ? 'CONFIRMADO' : 'PENDIENTE'}
              </span>
              {reg.team_name && (
                <span className="text-sm text-neutral-400 font-medium">Equipo: <strong className="text-neutral-200 font-bold">{reg.team_name}</strong></span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-neutral-700/50 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm">
          <p className="text-neutral-400 font-medium">Coach: <span className="text-neutral-200 font-bold">{reg.coach_name}</span></p>
          {reg.coach_phone && <p className="text-neutral-400 font-medium">Teléfono: <span className="text-neutral-200">{reg.coach_phone}</span></p>}
          {reg.coach_email && <p className="text-neutral-400 font-medium sm:col-span-2">Email: <span className="text-neutral-200">{reg.coach_email}</span></p>}
          {regAssistants.length > 0 && (
            <p className="text-neutral-400 font-medium sm:col-span-2">
              Asistentes: <span className="text-neutral-200 font-bold">{regAssistants.join(', ')}</span>
            </p>
          )}
        </div>

        {reg.notes && (
          <div className="mt-3 pt-3 border-t border-amber-500/20 bg-amber-500/5 rounded-xl px-3 py-2">
            <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wider mb-0.5">Notas del coach</p>
            <p className="text-xs text-amber-300/80 whitespace-pre-wrap">{reg.notes}</p>
          </div>
        )}

        {wasEdited && (
          <p className="text-[10px] text-amber-400/80 mt-2 pt-2 border-t border-amber-500/20 italic">
            Original: {formatDate(reg.confirmed_at)} · Última edición: {formatDate(reg.submitted_at)}
          </p>
        )}

        {/* Dynamic Action 2x2/4 Flat Symmetrical Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4 pt-4 border-t border-neutral-700/50">
          {/* WhatsApp */}
          <a 
            href={reg.coach_phone ? `https://wa.me/${reg.coach_phone.replace(/\D/g, '')}` : '#'} 
            target={reg.coach_phone ? "_blank" : undefined} 
            rel="noreferrer"
            style={{ backgroundColor: '#000000', color: '#ffffff' }}
            className={`w-full h-11 bg-black hover:bg-neutral-900 border border-neutral-800 font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
              !reg.coach_phone ? 'opacity-40 cursor-not-allowed pointer-events-none' : ''
            }`}
          >
            <MessageCircle className="w-4 h-4 shrink-0" style={{ color: '#ffffff' }} />
            <span style={{ color: '#ffffff' }}>WhatsApp</span>
          </a>
          
          {/* Editar Datos */}
          <button
            onClick={() => {
              setEditAcademy(reg.academy); setEditTeam(reg.team_name || ''); setEditCoachName(reg.coach_name)
              setEditCoachPhone(reg.coach_phone); setEditCoachEmail(reg.coach_email || '')
              setEditCostPaq(reg.cost_paquete ?? 0); setEditCostRep(reg.cost_repeticion ?? 0)
              setEditTickets(reg.tickets_count ?? 0); setEditingCoach(true)
            }}
            style={{ backgroundColor: '#000000', color: '#ffffff' }}
            className="w-full h-11 bg-black hover:bg-neutral-900 border border-neutral-800 font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <Edit3 className="w-4 h-4 shrink-0" style={{ color: '#ffffff' }} />
            <span style={{ color: '#ffffff' }}>Editar Datos</span>
          </button>

          {/* Descargar PDF */}
          <button
            onClick={handleDownloadPDF}
            disabled={generatingPDF}
            style={{ backgroundColor: '#000000', color: '#ffffff' }}
            className="w-full h-11 bg-black hover:bg-neutral-900 border border-neutral-800 font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <FileText className="w-4 h-4 shrink-0" style={{ color: '#ffffff' }} />
            <span style={{ color: '#ffffff' }}>{generatingPDF ? 'Generando...' : 'Descargar PDF'}</span>
          </button>

          {/* Acción Dinámica (Confirmar / Aprobar / Carta Responsiva) */}
          {isConfirmed && wasEdited ? (
            <button
              onClick={async () => {
                const now = new Date().toISOString()
                await supabase.from('coach_registrations').update({ confirmed_at: now }).eq('id', reg.id)
                await logEdit(reg.id, { action: 'update', entity_type: 'registration', changes: { confirmed_at: { old: reg.confirmed_at, new: now } } })
                loadData()
              }}
              style={{ backgroundColor: '#000000', color: '#ffffff' }}
              className="w-full h-11 bg-black hover:bg-neutral-900 border border-neutral-800 font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <Check className="w-4 h-4 shrink-0" style={{ color: '#ffffff' }} />
              <span style={{ color: '#ffffff' }}>Aprobar Cambios</span>
            </button>
          ) : !isConfirmed ? (
            <button
              disabled={isDraft}
              onClick={async () => {
                if (isDraft) return
                await supabase.from('coach_registrations').update({ confirmed_at: new Date().toISOString() }).eq('id', reg.id)
                await logEdit(reg.id, { action: 'confirm', entity_type: 'registration', changes: { status: { old: 'pending', new: 'confirmed' } } })
                loadData()
              }}
              style={{
                backgroundColor: isDraft ? '#262626' : '#000000',
                color: isDraft ? '#737373' : '#ffffff',
                borderColor: isDraft ? '#404040' : '#262626',
                cursor: isDraft ? 'not-allowed' : 'pointer'
              }}
              className="w-full h-11 border font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <Check className="w-4 h-4 shrink-0" style={{ color: isDraft ? '#737373' : '#ffffff' }} />
              <span>{isDraft ? 'Borrador (Incompleto)' : 'Confirmar Reg'}</span>
            </button>
          ) : reg.signature ? (
            <button
              onClick={async () => {
                if (!reg) return
                try {
                  const cartaState = mapDbToState(reg, dancers, acts)
                  cartaState.signature = reg.signature || null
                  await generateCartaPDF(cartaState, event)
                } catch (e) {
                  alert('Error: ' + (e as Error).message)
                }
              }}
              style={{ backgroundColor: '#000000', color: '#ffffff' }}
              className="w-full h-11 bg-black hover:bg-neutral-900 border border-neutral-800 font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <FileText className="w-4 h-4 shrink-0" style={{ color: '#ffffff' }} />
              <span style={{ color: '#ffffff' }}>CARTA RESPONSIVA</span>
            </button>
          ) : (
            <div className="w-full h-11 bg-neutral-800/40 border border-neutral-700/30 text-neutral-500 font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 cursor-not-allowed select-none">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Registrado</span>
            </div>
          )}
        </div>
      </div>

      {/* Gigantic Premium KPIs Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <MetricItem label="Integrantes" value={dancers.length} />
        <MetricItem label="Coreografías" value={acts.length} />
        <MetricItem label="Boletos" value={reg.tickets_count ?? 0} accent />
        <MetricItem 
          label="Saldo Pendiente" 
          value={isDraft ? "—" : formatMoney(total - paid)} 
          accent={isDraft ? undefined : total - paid > 0 ? 'warning' : 'success'} 
        />
      </div>

      {/* Pagos Section (Rendered with Transparent Background Container) */}
      <section className="space-y-2.5">
        <h2 className="font-display text-lg tracking-wider text-fuchsia-500 uppercase">Pagos y Notas</h2>
        <div className="bg-transparent border-none p-0 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div className="space-y-1 w-full text-xs">
              <span className="text-neutral-500 font-bold uppercase block">Historial de Pagos</span>
              <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl px-4 py-2.5 flex justify-between items-center text-sm font-semibold h-[46px]">
                <span className="text-neutral-400">Total Recibido:</span>
                <span className="text-neutral-200 font-bold font-mono">
                  {formatMoney(paid)} <span className="text-neutral-500 text-xs">/ {formatMoney(total)}</span>
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs h-[46px] select-none bg-transparent border border-neutral-800 rounded-xl px-4 py-2.5">
              <span className="text-neutral-500 font-bold uppercase">Estado:</span>
              <span 
                style={isDraft ? { color: STATUS.muted } : total - paid > 0 ? { color: STATUS.warning } : { color: STATUS.success }}
                className={`font-black text-sm uppercase ${!isDraft && total - paid > 0 ? 'animate-pulse' : 'font-extrabold'}`}
              >
                {isDraft ? 'Borrador (Incompleto)' : total - paid > 0 ? `${formatMoney(total - paid)} Pendiente` : 'Saldado'}
              </span>
            </div>

            <div className="space-y-1 w-full text-xs sm:col-span-2">
              <span className="text-neutral-500 font-bold uppercase block">Registrar Nuevo Abono / Pago (MXN)</span>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 font-bold font-mono text-sm">$</span>
                  <input 
                    type="number" 
                    value={paymentInput}
                    onChange={e => setPaymentInput(e.target.value)}
                    placeholder="Monto a abonar..." 
                    style={{ border: '2px solid #525252', backgroundColor: '#171717', color: '#ffffff', padding: '10px 14px 10px 24px' }}
                    className="w-full h-11 rounded-xl text-sm focus:outline-none focus:border-fuchsia-500 font-mono" 
                  />
                </div>
                <button
                  type="button"
                  onClick={handleConfirmPayment}
                  style={{ backgroundColor: STATUS.primaryStrong, color: '#ffffff' }}
                  className="px-5 h-11 hover:bg-fuchsia-600 active:scale-95 text-xs font-bold uppercase tracking-wider rounded-xl transition-all duration-150 flex items-center justify-center shrink-0 cursor-pointer"
                >
                  Confirmar Pago
                </button>
              </div>
            </div>
          </div>
          <label className="text-xs text-neutral-500 font-bold uppercase block">
            Nota interna (Privada)
            <input value={note}
              onChange={e => setNote(e.target.value)}
              onBlur={handleNoteBlur}
              placeholder="Agregar nota interna..." 
              style={{ border: '2px solid #525252', backgroundColor: '#171717', color: '#ffffff', padding: '10px 14px' }}
              className="mt-1 w-full rounded-xl text-sm focus:outline-none focus:border-fuchsia-500 placeholder-neutral-500" />
          </label>
        </div>
      </section>

      {/* Desglose de Costos */}
      {breakdown && (
        <Section title="Desglose de Costos">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-neutral-400 font-medium">Inscripciones base</span><span className="text-neutral-200 font-semibold">{formatMoney(breakdown.inscrTotal)}</span></div>
            <div className="flex justify-between"><span className="text-neutral-400 font-medium">Coreografías extra</span><span className="text-neutral-200 font-semibold">{formatMoney(breakdown.repTotal)}</span></div>
            {breakdown.asistTotal > 0 && <div className="flex justify-between"><span className="text-neutral-400 font-medium">Asistentes ({breakdown.paidAssistants})</span><span className="text-neutral-200 font-semibold">{formatMoney(breakdown.asistTotal)}</span></div>}
            {breakdown.ticketsTotal > 0 && <div className="flex justify-between"><span className="text-neutral-400 font-medium">Boletos ({reg.tickets_count})</span><span className="text-neutral-200 font-semibold">{formatMoney(breakdown.ticketsTotal)}</span></div>}
            <div className="flex justify-between pt-2 border-t border-neutral-700/50 font-black text-base"><span className="text-white">TOTAL REGISTRO</span><span className="text-green-400">{formatMoney(total)}</span></div>
          </div>
        </Section>
      )}

      {/* Integrantes */}
      <Section title={`Integrantes (${dancers.length})`}>
        <button onClick={() => { setEditingDancer(null); setDancerName(''); setDancerBirthdate('') }}
          className="flex items-center gap-1.5 text-xs text-fuchsia-400 font-bold mb-3 hover:text-fuchsia-300">
          <Plus className="w-3.5 h-3.5" /> Agregar integrante
        </button>

        {(dancerName || dancerBirthdate) && !editingDancer && (
          <div className="mb-3 p-3 rounded-xl bg-neutral-800/60 border border-neutral-700/50 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input value={dancerName} onChange={e => setDancerName(e.target.value)} placeholder="Nombre completo" className="w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500 placeholder-neutral-500" />
              <input type="date" value={dancerBirthdate} onChange={e => setDancerBirthdate(e.target.value)} className="w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
            </div>
            <button onClick={async () => {
              if (!dancerName || !dancerBirthdate) return
              const cat = categoryFromBirthdate(dancerBirthdate)
              const lastIdx = dancers.reduce((m, d) => Math.max(m, d.order_idx), -1)
              const { error } = await supabase.from('registration_dancers').insert({
                registration_id: reg.id, name: dancerName, birthdate: dancerBirthdate,
                category: cat, category_manual: false, order_idx: lastIdx + 1,
              })
              if (error) alert('Error: ' + error.message)
              else { await logEdit(reg.id, { entity_type: 'dancer', action: 'create', changes: { name: { old: null, new: dancerName }, birthdate: { old: null, new: dancerBirthdate } } }); setDancerName(''); setDancerBirthdate(''); loadData() }
            }} className="px-3 py-1.5 bg-fuchsia-500 text-white font-bold text-xs rounded-lg active:scale-95">AGREGAR</button>
          </div>
        )}

        {dancers.length === 0 ? (
          <p className="text-sm text-neutral-500 text-center py-4">Sin integrantes registrados.</p>
        ) : (
          <div className="space-y-2">
            {dancers.map((d, idx) => {
              const age = ageFromBirthdate(d.birthdate)
              const n = counts.get(d.id) ?? 0
              const cost = dancerCost(d.id, counts, breakdown?.inscrBase ?? 0, breakdown?.repBase ?? 0)
              const actNames = acts.filter(a => a.modality === 'grupal' || a.dancer_ids.includes(d.id)).map(a => a.style || MODALITY_LABELS[a.modality])

              if (editingDancer?.id === d.id) {
                return (
                  <div key={d.id} className="bg-neutral-800/40 rounded-xl p-3 border border-fuchsia-500/30 space-y-3">
                    <p className="text-xs font-bold text-fuchsia-400 uppercase tracking-wider">Editar Integrante #{idx + 1}</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block mb-1">Nombre</label>
                        <input value={dancerName} onChange={e => setDancerName(e.target.value)} placeholder="Nombre completo" className="w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                      </div>
                      <div>
                        <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block mb-1">Fecha de Nacimiento</label>
                        <input type="date" value={dancerBirthdate} onChange={e => setDancerBirthdate(e.target.value)} className="w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                      </div>
                      <div>
                        <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block mb-1">Categoría</label>
                        <select
                          value={dancerCategoryManual ? dancerCategoryOverride : 'auto'}
                          onChange={e => {
                            if (e.target.value === 'auto') {
                              setDancerCategoryManual(false)
                            } else {
                              setDancerCategoryManual(true)
                              setDancerCategoryOverride(e.target.value as AgeCategory)
                            }
                          }}
                          className="w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500 font-medium"
                        >
                          <option value="auto">Automática (según edad)</option>
                          {AGE_CATEGORY_ORDER.map(cat => (
                            <option key={cat} value={cat}>{AGE_CATEGORY_LABELS[cat]}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleSaveDancerEdit} className="px-3 py-1.5 bg-fuchsia-500 hover:bg-fuchsia-600 text-white font-bold text-xs rounded-lg active:scale-95 font-sans">GUARDAR</button>
                      <button onClick={() => setEditingDancer(null)} className="px-3 py-1.5 bg-black hover:bg-neutral-900 border border-neutral-800 text-white text-xs rounded-lg font-sans">Cancelar</button>
                    </div>
                  </div>
                )
              }

              return (
                <div key={d.id} className="group bg-neutral-800/20 rounded-xl p-3 border border-neutral-700/30 hover:border-neutral-600/50 transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{idx + 1}. {d.name}</p>
                      <p className="text-xs text-neutral-400 mt-0.5 font-medium">
                        {formatBirthdate(d.birthdate)}{age !== null && <> · {age} años</>} ·{' '}
                        <span className="font-semibold uppercase">{d.category ? AGE_CATEGORY_LABELS[d.category] : 'Sin cat.'}</span>
                        {d.category_manual && <span className="text-fuchsia-400 ml-1 text-[10px]">(manual)</span>}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5">{n} participacion{n !== 1 ? 'es' : ''}{actNames.length > 0 && <> · {actNames.join(', ')}</>}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-30 group-hover:opacity-100 transition-opacity">
                      <span className="text-xs font-bold text-green-400">{formatMoney(cost)}</span>
                      <button onClick={() => {
                        setEditingDancer(d)
                        setDancerName(d.name)
                        setDancerBirthdate(d.birthdate)
                        setDancerCategoryManual(!!d.category_manual)
                        setDancerCategoryOverride(d.category || 'open')
                      }}
                        className="w-7 h-7 rounded-lg bg-neutral-700/50 text-neutral-400 flex items-center justify-center hover:text-white"><Edit3 className="w-3.5 h-3.5" /></button>
                      <button onClick={async () => {
                        const affectedActs = acts.filter(a => a.dancer_ids.includes(d.id))
                        const inviableActs: { name: string; reason: string }[] = []

                        for (const a of affectedActs) {
                          const updatedIds = a.dancer_ids.filter(id => id !== d.id)
                          if (!actIsViable(a.modality, updatedIds.length)) {
                            inviableActs.push({ name: a.style || MODALITY_LABELS[a.modality], reason: `${MODALITY_LABELS[a.modality]} quedaria con ${updatedIds.length} integrantes (minimo ${MODALITY_MIN_DANCERS[a.modality] ?? '?'})` })
                          }
                        }

                        let confirmMsg = `Eliminar a "${d.name}"?`
                        if (inviableActs.length > 0) {
                          confirmMsg += `\n\nLas siguientes coreografías dejarán de ser válidas y serán eliminadas:\n${inviableActs.map(a => `- ${a.name}: ${a.reason}`).join('\n')}`
                        }
                        if (!confirm(confirmMsg)) return

                        for (const a of affectedActs) {
                          const updatedIds = a.dancer_ids.filter(id => id !== d.id)
                          if (!actIsViable(a.modality, updatedIds.length)) {
                            await supabase.from('registration_acts').delete().eq('id', a.id)
                            await logEdit(reg.id, { entity_type: 'act', entity_id: a.id, action: 'delete', changes: { reason: { old: null, new: `coreografía inviable: ${a.modality} con ${updatedIds.length} integrantes` } } })
                          } else {
                            await supabase.from('registration_acts').update({ dancer_ids: updatedIds }).eq('id', a.id)
                            await logEdit(reg.id, { entity_type: 'act', entity_id: a.id, action: 'update', changes: { dancer_ids: { old: a.dancer_ids.length + ' integrantes', new: updatedIds.length + ' integrantes' } } })
                          }
                        }
                        await supabase.from('registration_dancers').delete().eq('id', d.id)
                        await logEdit(reg.id, { entity_type: 'dancer', entity_id: d.id, action: 'delete', changes: { name: { old: d.name, new: null } } })
                        loadData()
                      }} className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Section>

      {/* Coreografías */}
      <Section title={`Coreografías (${acts.length})`}>
        <button onClick={() => { setEditingAct(null); setActModality('solista'); setActLevel('avanzado'); setActStyle(''); setActDancerIds([]) }}
          className="flex items-center gap-1.5 text-xs text-fuchsia-400 font-bold mb-3 hover:text-fuchsia-300">
          <Plus className="w-3.5 h-3.5" /> Agregar coreografía
        </button>

        {acts.length === 0 ? (
          <p className="text-sm text-neutral-500 text-center py-4">Sin coreografías registradas.</p>
        ) : (
          <div className="space-y-2">
            {acts.map((a) => {
              const dancersInAct = dancers.filter(d => (a.dancer_ids || []).includes(d.id))
              const viable = actIsViable(a.modality, dancersInAct.length)
              return (
                <div key={a.id} className={`group rounded-xl p-3 border transition-all ${viable ? 'bg-neutral-800/20 border-neutral-700/30 hover:border-neutral-600/50' : 'bg-red-500/5 border-red-500/30'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* High contrast legible modality badges */}
                        <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-lg uppercase tracking-wider ${viable ? 'bg-purple-600 text-white' : 'bg-red-500 text-white animate-pulse'}`}>{MODALITY_LABELS[a.modality]}</span>
                        {a.age_category && <span className="text-[10px] font-bold bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded uppercase tracking-wider">{AGE_CATEGORY_LABELS[a.age_category]}</span>}
                        {a.style && <span className="text-xs text-neutral-400 font-bold uppercase">{a.style}</span>}
                        {a.level && a.modality === 'grupal' && <span className="text-[10px] text-neutral-500 capitalize">({a.level})</span>}
                        {!viable && <span className="text-[10px] text-red-400 font-bold uppercase">INVALIDO: {dancersInAct.length} de {MODALITY_MIN_DANCERS[a.modality]} min</span>}
                      </div>
                      <p className="text-xs text-neutral-500 mt-1.5 truncate">{dancersInAct.length} integrante{dancersInAct.length !== 1 ? 's' : ''}: {dancersInAct.map(d => d.name).join(', ')}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-30 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingAct(a); setActModality(a.modality); setActLevel(a.level || 'avanzado'); setActStyle(a.style || ''); setActDancerIds(a.dancer_ids) }}
                        className="w-7 h-7 rounded-lg bg-neutral-700/50 text-neutral-400 flex items-center justify-center hover:text-white"><Edit3 className="w-3.5 h-3.5" /></button>
                      <button onClick={async () => {
                        if (!confirm('Eliminar esta coreografía?')) return
                        await supabase.from('registration_acts').delete().eq('id', a.id)
                        await logEdit(reg.id, { entity_type: 'act', entity_id: a.id, action: 'delete', changes: { style: { old: a.style, new: null } } })
                        loadData()
                      }} className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {(editingAct !== undefined && (editingAct || (!editingAct && actStyle !== ''))) ? (
          <div className="mt-3 p-3 rounded-xl bg-neutral-800/60 border border-fuchsia-500/30 space-y-3">
            <p className="text-xs font-bold text-fuchsia-400 uppercase tracking-wider">{editingAct ? 'Editar Coreografía' : 'Nueva Coreografía'}</p>
            <div className="grid grid-cols-2 gap-2">
              <select value={actModality} onChange={e => setActModality(e.target.value as Modality)} className="px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500">
                {(['solista', 'dueto', 'trio', 'grupal'] as Modality[]).map(m => <option key={m} value={m}>{MODALITY_LABELS[m]}</option>)}
              </select>
              <select value={actLevel} onChange={e => setActLevel(e.target.value as Level)} className="px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500">
                <option value="avanzado">Avanzado</option>
                <option value="basico">Basico</option>
              </select>
            </div>
            <input value={actStyle} onChange={e => setActStyle(e.target.value)} placeholder="Estilo (Jazz, Hip Hop...)" className="w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500 placeholder-neutral-500" />
            {dancers.length > 0 && (
              <div className="max-h-32 overflow-y-auto space-y-1 bg-neutral-900/40 rounded-lg p-2 border border-neutral-700/30">
                {dancers.map(d => {
                  const checked = actDancerIds.includes(d.id)
                  return (
                    <label key={d.id} className="flex items-center gap-2 cursor-pointer text-sm text-neutral-300 hover:text-white">
                      <input type="checkbox" checked={checked} onChange={() => setActDancerIds(prev => checked ? prev.filter(id => id !== d.id) : [...prev, d.id])} className="accent-fuchsia-500" />{d.name}
                    </label>
                  )
                })}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={async () => {
                if (!actStyle) return
                const min = MODALITY_MIN_DANCERS[actModality] ?? 0
                if (actModality === 'solista' && actDancerIds.length !== 1) { alert('Solista requiere exactamente 1 integrante'); return }
                if (actModality === 'dueto' && actDancerIds.length !== 2) { alert('Dueto requiere exactamente 2 integrantes'); return }
                if (actModality === 'trio' && actDancerIds.length !== 3) { alert('Trio requiere exactamente 3 integrantes'); return }
                if (actModality === 'grupal' && actDancerIds.length < 4) { alert('Grupal requiere al menos 4 integrantes'); return }

                const selectedDancers = dancers.filter(d => actDancerIds.includes(d.id))
                const maxAgeIdx = selectedDancers.reduce((max, d) => {
                  const idx = d.category ? AGE_CATEGORY_ORDER.indexOf(d.category) : 0; return idx > max ? idx : max
                }, 0)
                const ageCat = AGE_CATEGORY_ORDER[maxAgeIdx]
                const finalLevel = actModality !== 'grupal' ? 'avanzado' : actLevel

                const payload = { registration_id: reg.id, modality: actModality, level: finalLevel, style: actStyle, dancer_ids: actDancerIds, age_category: ageCat }

                if (editingAct) {
                  const { error } = await supabase.from('registration_acts').update(payload).eq('id', editingAct.id)
                  if (error) alert('Error: ' + error.message)
                  else await logEdit(reg.id, { entity_type: 'act', entity_id: editingAct.id, changes: { style: { old: editingAct.style, new: actStyle }, modality: { old: editingAct.modality, new: actModality }, dancer_ids: { old: editingAct.dancer_ids.length + ' dancers', new: actDancerIds.length + ' dancers' } } })
                } else {
                  const lastIdx = acts.reduce((m, a) => Math.max(m, a.order_idx), -1)
                  const { error } = await supabase.from('registration_acts').insert({ ...payload, order_idx: lastIdx + 1 })
                  if (error) alert('Error: ' + error.message)
                  else await logEdit(reg.id, { entity_type: 'act', action: 'create', changes: { style: { old: null, new: actStyle }, modality: { old: null, new: actModality } } })
                }
                setEditingAct(null); setActStyle(''); setActDancerIds([]); loadData()
              }} className="px-3 py-1.5 bg-fuchsia-500 text-white font-bold text-xs rounded-lg active:scale-95">
                {editingAct ? 'GUARDAR' : 'AGREGAR'}
              </button>
              <button onClick={() => { setEditingAct(null); setActStyle('') }} className="px-3 py-1.5 bg-black hover:bg-neutral-900 border border-neutral-800 text-white text-xs rounded-lg">Cancelar</button>
            </div>
          </div>
        ) : null}
      </Section>

      {/* Historial de Cambios (Collapsible) */}
      <section className="bg-neutral-800/20 rounded-2xl border border-neutral-700/40 p-4">
        <button 
          onClick={() => setShowHistory(v => !v)}
          className="w-full flex items-center justify-between text-left focus:outline-none"
        >
          <h2 className="font-display text-lg tracking-wider text-fuchsia-500 uppercase">Historial de Cambios ({editLogs.length})</h2>
          {showHistory ? <ChevronUp className="w-5 h-5 text-fuchsia-500" /> : <ChevronDown className="w-5 h-5 text-fuchsia-500" />}
        </button>
        
        {showHistory && (
          <div className="space-y-3 mt-4 pt-3 border-t border-neutral-700/50">
            {editLogs.length === 0 ? (
              <p className="text-sm text-neutral-500 text-center py-4">Sin historial de cambios registrado.</p>
            ) : (
              <div className="space-y-3">
                {editLogs.map((log) => {
                  const changes = log.changes ?? {}
                  const fieldEntries = Object.entries(changes)
                  return (
                    <div key={log.id} className="relative pl-6 pb-3 border-l-2 border-neutral-700 last:border-transparent">
                      <div className="absolute left-0 top-1 -translate-x-1/2 w-3 h-3 rounded-full bg-neutral-600 border-2 border-neutral-800" />
                      <p className="text-xs font-bold text-neutral-300">
                        {log.action === 'confirm' ? 'Registro confirmado' : log.action === 'create' ? 'Creado' : log.action === 'delete' ? 'Eliminado' : 'Modificacion'}
                        <span className="text-neutral-500 ml-2 font-normal">{formatRelative(log.created_at)}</span>
                      </p>
                      <p className="text-[10px] text-neutral-500 mt-0.5">Por: {log.edited_by === 'coach' ? reg?.coach_name : 'Administrador'}{log.entity_type && <> · {log.entity_type}</>}</p>
                      {fieldEntries.length > 0 && (
                        <div className="mt-1.5 space-y-1">
                          {fieldEntries.map(([field, diff]) => {
                            const d = diff as { old: unknown; new: unknown }
                            return (
                              <div key={field} className="text-[10px] bg-neutral-800/40 rounded-lg px-2 py-1">
                                <span className="text-neutral-500">{field}:</span>{' '}
                                <span className="text-red-400 line-through">{String(d.old ?? '-')}</span>
                                {' -> '}
                                <span className="text-green-400">{String(d.new ?? '-')}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Danger Zone (Collapsible) */}
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 overflow-hidden">
        <button onClick={() => setShowDanger(v => !v)} className="w-full flex items-center justify-between p-4 text-sm font-bold text-red-400">
          Zona de Peligro
          {showDanger ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showDanger && (
          <div className="px-4 pb-4 space-y-2 border-t border-red-500/20 pt-3">
            {isConfirmed ? (
              <button onClick={async () => {
                await supabase.from('coach_registrations').update({ confirmed_at: null }).eq('id', reg.id)
                await logEdit(reg.id, { action: 'update', changes: { status: { old: 'confirmed', new: 'pending' } } })
                loadData()
              }} className="w-full py-2.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 active:scale-95 transition-all">
                Desconfirmar registro
              </button>
            ) : null}
            <button
              onClick={async () => {
                if (!confirm('ELIMINAR COMPLETAMENTE este registro? Esto borrara todos los integrantes, coreografías e historial de forma permanente.')) return
                await supabase.from('coach_registrations').delete().eq('id', reg.id)
                if (onBack) onBack(); else router.push('/socios/registros')
              }} className="w-full py-2.5 rounded-xl text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/30 active:scale-95 transition-all">
              Eliminar registro completo
            </button>
          </div>
        )}
      </div>

      {/* Coach Info Editor Modal Overlay */}
      {editingCoach && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 sm:p-8">
          <div 
            style={{ backgroundColor: '#171717', border: '2px solid #3f3f3f', borderRadius: '16px', padding: '32px' }}
            className="w-full max-w-lg space-y-6 shadow-2xl relative"
          >
            <button 
              onClick={() => setEditingCoach(false)} 
              className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors"
              aria-label="Cerrar modal"
            >
              <X className="w-5 h-5" style={{ color: '#ffffff' }} />
            </button>
            
            <div className="flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-fuchsia-500" />
              <h3 className="font-display text-lg tracking-wider uppercase font-black" style={{ color: '#ffffff' }}>Editar Datos del Coach</h3>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[55vh] overflow-y-auto pr-1">
              <LabelInput label="Academia / Colegio" value={editAcademy} onChange={setEditAcademy} />
              <LabelInput label="Equipo / Team Name" value={editTeam} onChange={setEditTeam} />
              <LabelInput label="Nombre del Coach" value={editCoachName} onChange={setEditCoachName} />
              <LabelInput label="WhatsApp / Teléfono" value={editCoachPhone} onChange={setEditCoachPhone} />
              <LabelInput label="Email / Correo" value={editCoachEmail} onChange={setEditCoachEmail} />
              <LabelInputNumber label="Inscripción Base (MXN)" value={editCostPaq} onChange={setEditCostPaq} />
              <LabelInputNumber label="Coreografía Extra (MXN)" value={editCostRep} onChange={setEditCostRep} />
              <LabelInputNumber label="Boletos Acompañante" value={editTickets} onChange={setEditTickets} accent />
            </div>
            
            <div className="flex justify-end gap-2.5 pt-2">
              <button 
                onClick={() => setEditingCoach(false)} 
                className="px-4 py-2.5 font-bold text-xs rounded-xl transition-all"
                style={{ color: '#ffffff', backgroundColor: '#404040' }}
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  if (isSaving) return
                  setIsSaving(true)
                  try {
                    const old = {
                      academy: reg.academy, team_name: reg.team_name, coach_name: reg.coach_name,
                      coach_phone: reg.coach_phone, coach_email: reg.coach_email,
                      cost_paquete: reg.cost_paquete, cost_repeticion: reg.cost_repeticion, tickets_count: reg.tickets_count,
                    }
                    const { error } = await supabase.from('coach_registrations').update({
                      academy: editAcademy, team_name: editTeam, coach_name: editCoachName,
                      coach_phone: editCoachPhone, coach_email: editCoachEmail || null,
                      cost_paquete: editCostPaq, cost_repeticion: editCostRep, tickets_count: editTickets,
                    }).eq('id', reg.id)
                    if (error) alert('Error: ' + error.message)
                    else {
                      await logEdit(reg.id, {
                        entity_type: 'registration',
                        changes: Object.fromEntries(Object.entries({
                          academy: { old: old.academy, new: editAcademy },
                          team_name: { old: old.team_name, new: editTeam },
                          coach_name: { old: old.coach_name, new: editCoachName },
                          coach_phone: { old: old.coach_phone, new: editCoachPhone },
                          coach_email: { old: old.coach_email, new: editCoachEmail },
                          cost_paquete: { old: old.cost_paquete, new: editCostPaq },
                          cost_repeticion: { old: old.cost_repeticion, new: editCostRep },
                          tickets_count: { old: old.tickets_count, new: editTickets },
                        }).filter(([, v]) => (v as { old: unknown; new: unknown }).old !== (v as { old: unknown; new: unknown }).new)),
                      })
                      setEditingCoach(false); loadData()
                    }
                  } finally {
                    setIsSaving(false)
                  }
                }} 
                disabled={isSaving}
                className="px-4 py-2.5 font-bold text-xs rounded-xl active:scale-95 transition-all disabled:opacity-50"
                style={{ color: '#ffffff', backgroundColor: isSaving ? '#555555' : STATUS.primary }}
              >
                {isSaving ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-lg tracking-wider text-fuchsia-500 uppercase mb-2.5">{title}</h2>
      <div className="bg-neutral-800/20 rounded-2xl border border-neutral-700/40 p-4">{children}</div>
    </section>
  )
}

function MetricItem({ label, value, accent }: { label: string; value: string | number; accent?: boolean | string }) {
  const colorStyle = 
    accent === 'success' ? { color: STATUS.success } : 
    accent === 'warning' ? { color: STATUS.warning } : 
    accent ? { color: STATUS.primary } : {}
  return (
    <div className="bg-neutral-900/60 border border-neutral-800/60 rounded-xl p-3 shadow-inner flex flex-col justify-center text-center">
      <p className="text-[9px] text-neutral-500 uppercase tracking-wider font-bold">{label}</p>
      <p className="text-2xl sm:text-3xl font-black mt-1 leading-none" style={colorStyle}>{value}</p>
    </div>
  )
}

function LabelInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-xs font-bold uppercase block" style={{ color: '#a3a3a3' }}>
      {label}
      <input 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        style={{ border: '2px solid #525252', backgroundColor: '#171717', color: '#ffffff', padding: '10px 14px', borderRadius: '12px' }}
        className="mt-1 w-full text-sm focus:outline-none focus:border-fuchsia-500" 
      />
    </label>
  )
}

function LabelInputNumber({ label, value, onChange, accent }: { label: string; value: number; onChange: (v: number) => void; accent?: boolean }) {
  return (
    <label className="text-xs font-bold uppercase block" style={{ color: accent ? STATUS.primary : '#a3a3a3' }}>
      {label}
      <input 
        type="number" 
        value={value} 
        onChange={e => onChange(Number(e.target.value) || 0)} 
        style={{ border: accent ? `2px solid ${STATUS.primary}` : '2px solid #525252', backgroundColor: '#171717', color: '#ffffff', padding: '10px 14px', borderRadius: '12px' }}
        className="mt-1 w-full text-sm focus:outline-none focus:border-fuchsia-500" 
      />
    </label>
  )
}
