'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { ArrowLeft, ArrowRight, Pencil, MessageCircle, Info, X, ChevronDown, Check, Sparkles, Users, Clipboard, HeartHandshake, Ticket, Download, Eye, Calendar, DollarSign, Clock } from 'lucide-react'
import { supabase, type Event, type AgeCategory, AGE_CATEGORY_ORDER, AGE_CATEGORY_LABELS, AGE_CATEGORY_HINTS } from '@/lib/supabase'
import { type State, type Step, type Coach, STYLES, CATEGORY_COLORS, DEFAULT_DANCER_COLOR, MODALITY_OPTIONS } from '@/components/register/types'
import { minDancers, maxDancers, modalityLabel, effectiveCategory, ageFromBirthdate, participacionesPorAlumno, costBreakdown, costoTotal, formatMoney, formatEventDate, formatBirthdate, getDancerDisplayName, getRegistrationDeadline, getChangesDeadline, isBeforeTicketsDeadline, getPrecioEntradaRegistro, isBeforeJune15, LS_KEY, loadImage } from '@/components/register/utils'
import { generateReceiptPDF, generateExtraTicketsPDF } from '@/lib/pdf'


export default 
function FullSummary({ state, editMode, confirmed, isEditSave, confirm, saving, saveErr, startEdit, updateState, goToStep, event }: {
  state: State
  editMode: boolean
  confirmed?: boolean
  isEditSave?: boolean
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
  const total = costoTotal(state, event)
  const bd = costBreakdown(state, event)
  const precioEntrada = bd.precioEntrada
  const paq = bd.paq
  const rep = bd.rep
  const asistente = bd.asistenteCosto
  const dancersPorAsistente = bd.dancersPorAsistente
  const beforeDeadline = bd.beforeDeadline
  const chgDeadline = getChangesDeadline(event)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false)
  const [whatsappCountdown, setWhatsappCountdown] = useState(5)

  useEffect(() => {
    let interval: any = null
    if (showWhatsAppModal) {
      setWhatsappCountdown(5)
      interval = setInterval(() => {
        setWhatsappCountdown(prev => {
          if (prev <= 1) {
            if (interval) clearInterval(interval)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [showWhatsAppModal])

  const handleWhatsAppRedirect = () => {
    setShowWhatsAppModal(false)
    const messageText = encodeURIComponent(`Hola, acabo de confirmar mi registro en Dance4Ever para el evento ${event?.name || ''}.`)
    window.open(`https://wa.me/525645415263?text=${messageText}`, '_blank')
  }

  useEffect(() => {
    if (confirmed) {
      // Scroll window to top (important on mobile)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      // Scroll internal container to top
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }
  }, [confirmed])

  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [newExtraTickets, setNewExtraTickets] = useState(1)
  const [copiedField, setCopiedField] = useState<'clabe' | 'card' | 'account' | null>(null)
  const [generatingExtraPDF, setGeneratingExtraPDF] = useState(false)
  const [extraTicketsSuccess, setExtraTicketsSuccess] = useState(false)
  const [lastPurchasedCount, setLastPurchasedCount] = useState(1)

  const handleCopyText = (text: string, field: 'clabe' | 'card' | 'account') => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleViewExtraPDF = async (count: number) => {
    const pdfWindow = typeof window !== 'undefined' ? window.open('', '_blank') : null;
    if (pdfWindow) {
      pdfWindow.document.write('<p style="font-family:sans-serif;text-align:center;margin-top:20px;color:#333;">Generando tu comprobante...</p>');
    }
    await generateExtraTicketsPDF(state, event, count, 'view', pdfWindow)
  }

  const handleDownloadExtraPDF = async (count: number) => {
    await generateExtraTicketsPDF(state, event, count, 'download')
  }

  const handleBuyExtraTickets = async () => {
    try {
      setGeneratingExtraPDF(true)
      
      const nextTicketsCount = (state.ticketsCount ?? 0) + newExtraTickets

      if (state.confirmedRegistrationId) {
        const { error: updErr } = await supabase
          .from('coach_registrations')
          .update({
            tickets_count: nextTicketsCount
          })
          .eq('id', state.confirmedRegistrationId)
        if (updErr) throw updErr
      }

      updateState(prev => ({
        ...prev,
        ticketsCount: nextTicketsCount
      }))
      
      setLastPurchasedCount(newExtraTickets)
      setExtraTicketsSuccess(true)
      setNewExtraTickets(1)
    } catch (err) {
      console.error('Error purchasing extra tickets:', err)
      alert('Hubo un error al procesar tu solicitud de entradas adicionales. Por favor, vuelve a intentarlo.')
    } finally {
      setGeneratingExtraPDF(false)
    }
  }
  
  const handleDownloadPDF = async () => {
    try {
      setGeneratingPDF(true)
      await generateReceiptPDF(state, event)
    } catch (err) {
      console.error('Error generating PDF:', err)
      alert('Hubo un error al generar tu comprobante PDF. Por favor, vuelve a intentarlo.')
    } finally {
      setGeneratingPDF(false)
    }
  }

  return (
    <div className="w-full flex flex-col min-h-0 md:h-full overflow-visible md:overflow-hidden" style={{ animation: 'fadeIn 0.3s ease-out' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes arrowFlow {
          0% { opacity: 0.15; transform: translateY(-4px); }
          50% { opacity: 1; transform: translateY(0px); }
          100% { opacity: 0.15; transform: translateY(4px); }
        }
        .animate-arrow-1 { animation: arrowFlow 1.6s infinite ease-in-out; animation-delay: 0s; }
        .animate-arrow-2 { animation: arrowFlow 1.6s infinite ease-in-out; animation-delay: 0.3s; }
        .animate-arrow-3 { animation: arrowFlow 1.6s infinite ease-in-out; animation-delay: 0.6s; }
        .animate-arrow-4 { animation: arrowFlow 1.6s infinite ease-in-out; animation-delay: 0.9s; }
      `}} />
      
      <div ref={scrollContainerRef} className="flex-1 overflow-visible md:overflow-y-auto px-0 sm:px-4 lg:px-6 py-2 sm:py-4 pb-0 sm:pb-14 max-h-none md:max-h-[75vh]">
        
        {!confirmed ? (
          <>
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
                <p className="text-[10px] tracking-[0.2em] text-[rgb(var(--c-text)/0.6)] font-bold mb-1">COACH</p>
                <p className="font-display text-2xl text-[rgb(var(--c-text-strong))] uppercase leading-tight">{state.coach.name || 'Sin nombre'}</p>
                <p className="text-sm text-[rgb(var(--c-text))] mt-2">{state.coach.phone || 'Sin WhatsApp'}</p>
                {state.coach.email && <p className="text-sm text-[rgb(var(--c-text))] mt-1">{state.coach.email}</p>}

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
              ) : (() => {
                const sorted = filledDancers
                  .map((d, di) => ({ d, di }))
                  .sort((a, b) => {
                    const catA = effectiveCategory(a.d) ?? 'tiny'
                    const catB = effectiveCategory(b.d) ?? 'tiny'
                    return AGE_CATEGORY_ORDER.indexOf(catA) - AGE_CATEGORY_ORDER.indexOf(catB)
                  })
                return sorted.map(({ d, di }, rank) => {
                  const n = counts.get(di) ?? 0
                  return (
                    <div key={di} className="flex items-center gap-3 border-b border-[rgb(var(--c-border)/0.2)] pb-1 text-xs">
                      <span className="font-display text-sm text-[rgb(var(--c-text)/0.4)] w-5 text-right shrink-0">{rank + 1}.</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-display text-sm uppercase text-[rgb(var(--c-text-strong))] truncate leading-tight font-bold">{d.name}</p>
                        <p className="text-[10px] text-[rgb(var(--c-text)/0.7)] mt-0.5 font-medium">{formatBirthdate(d.birthdate)} · {AGE_CATEGORY_LABELS[effectiveCategory(d) || 'tiny']}</p>
                      </div>
                      <div className="text-right shrink-0">
                        {n > 0 ? (
                          <span className="block text-[10px] text-[rgb(var(--c-primary))] font-bold bg-[rgb(var(--c-primary)/0.03)] px-1.5 py-0.5 rounded-lg border border-[rgb(var(--c-primary)/0.15)] leading-none">{n} Coreografía{n === 1 ? '' : 's'}</span>
                        ) : (
                          <span className="block text-[9px] text-[rgb(var(--c-text)/0.4)] italic">Sin coreografía</span>
                        )}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
          </div>

          {/* ACTS SUMMARY */}
          <div className="p-3.5 sm:p-5">
            <h3 className="font-display text-lg tracking-widest text-[rgb(var(--c-primary))] mb-4 border-b border-[rgb(var(--c-border)/0.25)] pb-2 flex justify-between items-center">
              <span>COREOGRAFÍAS REGISTRADAS</span>
              <div className="flex items-center gap-3">
                <span className="text-[rgb(var(--c-text))] opacity-60 text-xs font-semibold">{state.acts.length} {state.acts.length === 1 ? 'Coreografía' : 'Coreografías'}</span>
                {!confirmed && (
                  <button onClick={() => goToStep({ kind: 'acts' })} className="text-xs text-[rgb(var(--c-primary))] hover:underline flex items-center gap-1">
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </button>
                )}
              </div>
            </h3>
            <div className="divide-y divide-[rgb(var(--c-border)/0.25)] bg-transparent">
              {state.acts.length === 0 ? (
                <p className="text-[rgb(var(--c-text)/0.5)] italic text-sm py-4">Sin coreografías registradas</p>
              ) : state.acts.map((a, idx) => {
                const cat = a.ageCategory ? AGE_CATEGORY_LABELS[a.ageCategory] : '—'
                const mod = a.modality ? modalityLabel(a.modality) : '—'
                const lvl = a.modality === 'grupal' ? (a.level === 'basico' ? ' BÁSICO' : a.level === 'avanzado' ? ' AVANZADO' : '') : ''
                return (
                  <div key={idx} className="py-3.5 bg-transparent flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-[fadeIn_0.2s_ease-out_forwards]">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="font-display text-2xl text-[rgb(var(--c-primary))] shrink-0 font-bold">#{idx + 1}</div>
                      <div className="min-w-0">
                        <p className="font-display text-lg text-[rgb(var(--c-text-strong))] leading-tight truncate uppercase font-bold">{cat}</p>
                        <p className="font-display text-xs text-[rgb(var(--c-text))] mt-0.5 leading-none">{mod}{lvl} · {a.style ?? '—'}</p>
                      </div>
                    </div>
                    {a.dancerIndices.length > 0 && (
                      <div className="border-l-2 border-[rgb(var(--c-primary)/0.3)] pl-3.5 max-w-md shrink-0 w-full sm:w-auto">
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

          {/* ENTRADAS PARA ACOMPAÑANTES */}
          <div className="p-3.5 sm:p-5">
            <div className="bg-[rgb(var(--c-surface-2)/0.35)] border border-[rgb(var(--c-border)/0.45)] rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
              {/* Header and selector in one compact row */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[rgb(var(--c-border)/0.2)] pb-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Ticket className="w-6 h-6 text-[rgb(var(--c-primary))]" />
                    <span className="font-display text-lg sm:text-xl tracking-wider font-bold text-[rgb(var(--c-primary))] uppercase">
                      Entradas para Papás / Familiares
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-[rgb(var(--c-text-strong))] leading-relaxed max-w-2xl">
                    Si ya tienes entradas confirmadas para papás, familiares y acompañantes, agrégalas aquí. Si aún no las tienes, no te preocupes: al finalizar tu registro o más adelante podrás solicitar entradas adicionales por este medio.
                  </p>
                </div>

                {/* Selector */}
                <div className="flex items-center gap-3 bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.5)] rounded-xl p-1.5 shadow-xs self-start sm:self-auto shrink-0 sm:mt-1">
                  {confirmed || editMode || !isBeforeTicketsDeadline(event) ? (
                    <div className="px-4 py-1.5 flex items-center gap-2">
                      <span className="text-xs font-semibold text-[rgb(var(--c-text)/0.7)]">Compradas:</span>
                      <span className="font-display text-base font-bold text-[rgb(var(--c-primary))]">{state.ticketsCount ?? 0}</span>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => updateState(prev => ({ ...prev, ticketsCount: Math.max(0, (prev.ticketsCount ?? 0) - 1) }))}
                        className="w-9 h-9 rounded-lg flex items-center justify-center bg-[rgb(var(--c-surface-2))] border border-[rgb(var(--c-border)/0.4)] hover:bg-[rgb(var(--c-border)/0.15)] active:scale-95 transition-all text-lg font-bold text-[rgb(var(--c-text))]"
                      >
                        -
                      </button>
                      <span className="font-display text-base font-bold w-6 text-center text-[rgb(var(--c-text-strong))]">
                        {state.ticketsCount ?? 0}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateState(prev => ({ ...prev, ticketsCount: (prev.ticketsCount ?? 0) + 1 }))}
                        className="w-9 h-9 rounded-lg flex items-center justify-center bg-[rgb(var(--c-surface-2))] border border-[rgb(var(--c-border)/0.4)] hover:bg-[rgb(var(--c-border)/0.15)] active:scale-95 transition-all text-lg font-bold text-[rgb(var(--c-text))]"
                      >
                        +
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Bottom information row: Grid layout on desktop, stacked on mobile */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm leading-relaxed pt-1">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-[rgb(var(--c-primary))]">
                    <Info className="w-3.5 h-3.5 shrink-0" />
                    <span>TARIFAS Y REGLAS DE ENTRADAS:</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 text-[rgb(var(--c-text)/0.85)] font-medium">
                    <li>Costo de <strong>preventa: {formatMoney(event?.cost_entrada_temprana ?? 500)} MXN</strong> por entrada (valido antes del <strong>{event?.deadline_precio_entrada ? new Date(event.deadline_precio_entrada + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) : 'miercoles 17 de Junio'}</strong>).</li>
                    <li>Costo <strong>regular: {formatMoney(event?.cost_entrada_tardia ?? 600)} MXN</strong> por entrada (a partir del {event?.deadline_precio_entrada ? new Date(new Date(event.deadline_precio_entrada + 'T00:00:00').getTime() + 86400000).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' }) : '18 de Junio'}).</li>
                  </ul>
                </div>

                <div className="flex flex-col justify-center space-y-1.5 md:items-end">
                  <div className="text-[rgb(var(--c-text)/0.75)] font-medium">
                    Costo por Entrada Actual: <strong className="font-bold text-base text-[rgb(var(--c-primary))]">{formatMoney(precioEntrada)} MXN</strong>
                  </div>
                  <span className="text-red-700 font-extrabold uppercase tracking-wide text-sm">
                    IMPORTANTE: No se venderán entradas el día del evento.
                  </span>
                </div>

                {/* Deadlines or status changes */}
                {!isBeforeTicketsDeadline(event) && (
                  <div className="col-span-full bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-sm text-amber-800 font-semibold flex items-start gap-2">
                    <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <span>La venta de entradas en línea ha concluido. Recuerda que no se venderán entradas el día del evento.</span>
                  </div>
                )}
                {editMode && isBeforeTicketsDeadline(event) && (
                  <div className="col-span-full">
                    <span className="text-sm text-amber-600 font-bold bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-xl inline-block">
                      Para adquirir entradas adicionales, utiliza la opción al confirmar tu registro.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* DESGLOSE DE COSTOS */}
        {(() => {
          const counts = participacionesPorAlumno(state)
          const filledDancers = state.dancers.filter(d => d.name.trim().length > 0)
          const freeEntries = Math.floor(filledDancers.length / dancersPorAsistente)
          const assistants = state.coach.assistants.filter(a => a.trim())
          const paidAssistants = Math.max(0, assistants.length - freeEntries)
          
          let totalInscripciones = 0
          let totalAdicionales = 0
          let totalAdicionalesCount = 0
          const beforeJune15 = isBeforeJune15(event)

          state.dancers.forEach((dancer, idx) => {
            if (dancer.name.trim().length === 0) return
            totalInscripciones += paq
            
            const n = counts.get(idx) ?? 0
            if (beforeJune15) {
              if (n > 1) {
                totalAdicionalesCount += (n - 1)
                totalAdicionales += (n - 1) * rep
              }
            } else {
              totalAdicionalesCount += n
              totalAdicionales += n * rep
            }
          })

          const totalDancers = totalInscripciones + totalAdicionales
          const totalCoach = 0
          const totalAsistentes = paidAssistants * asistente
          const totalEntradas = (state.ticketsCount ?? 0) * precioEntrada
          const total = totalDancers + totalAsistentes + totalEntradas
          return (
            <div className="mt-3 sm:mt-4 px-0 sm:px-0 space-y-3.5">
              {/* LÓGICA DE INSCRIPCIÓN Y COREOGRAFÍAS (Ahora arriba del desglose de costos) */}
              <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 text-xs leading-relaxed text-[rgb(var(--c-text)/0.8)] shadow-xs animate-[fadeIn_0.2s_ease-out_forwards] mx-0">
                <p className="font-bold text-purple-950 flex items-center gap-1.5 mb-1.5 text-[13px]">
                  <Info className="w-4 h-4 text-purple-600 shrink-0" />
                  INFORMACIÓN DE TARIFAS Y COREOGRAFÍAS:
                </p>
                La inscripcion por participante es de <strong>{formatMoney(paq)} MXN</strong> e incluye su <strong>primera coreografia o presentacion</strong> (valido para registros completados antes del <strong>{event?.fecha_cambio_tarifa_coreo ? new Date(event.fecha_cambio_tarifa_coreo + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' }) : '15 de Junio'}</strong>). Si un integrante participa en <strong>coreografias adicionales</strong>, se aplicara un costo de <strong>{formatMoney(rep)} MXN</strong> por cada presentacion extra.
              </div>

              <div className="bg-[rgb(var(--c-surface))] rounded-none sm:rounded-3xl border-t sm:border border-[rgb(var(--c-border)/0.4)] shadow-none sm:shadow-sm overflow-hidden">
                <div className="p-3.5 sm:p-5">
                  <h3 className="font-display text-lg tracking-widest text-[rgb(var(--c-primary))] mb-4 border-b border-[rgb(var(--c-border)/0.25)] pb-2">
                    DESGLOSE DE COSTOS
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-[rgb(var(--c-text))]">Coach <span className="text-[rgb(var(--c-text)/0.5)] text-xs">(entrada)</span></span>
                      <span className="font-bold text-[rgb(var(--c-success-strong))] bg-[rgb(var(--c-success)/0.08)] px-2.5 py-0.5 rounded-lg border border-[rgb(var(--c-success)/0.15)] text-xs uppercase">Gratis</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[rgb(var(--c-text))]">Inscripción Integrantes <span className="text-[rgb(var(--c-text)/0.5)] text-xs">({filledDancers.length} × {formatMoney(paq)})</span></span>
                      <span className="font-bold text-[rgb(var(--c-text-strong))]">{formatMoney(totalInscripciones)}</span>
                    </div>
                    {totalAdicionalesCount > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-[rgb(var(--c-text))]">Coreografías Adicionales <span className="text-[rgb(var(--c-text)/0.5)] text-xs">({totalAdicionalesCount} × {formatMoney(rep)})</span></span>
                        <span className="font-bold text-[rgb(var(--c-text-strong))]">{formatMoney(totalAdicionales)}</span>
                      </div>
                    )}
                    {assistants.length > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-[rgb(var(--c-text))]">
                          Asistentes <span className="text-[rgb(var(--c-text)/0.5)] text-xs">({paidAssistants} × {formatMoney(asistente)}{freeEntries > 0 ? `, ${freeEntries} gratis` : ''})</span>
                        </span>
                        <span className="font-bold text-[rgb(var(--c-text-strong))]">{formatMoney(totalAsistentes)}</span>
                      </div>
                    )}
                    {(state.ticketsCount ?? 0) > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-[rgb(var(--c-text))]">Entradas para Acompañantes <span className="text-[rgb(var(--c-text)/0.5)] text-xs">({state.ticketsCount} × {formatMoney(precioEntrada)})</span></span>
                        <span className="font-bold text-[rgb(var(--c-text-strong))]">{formatMoney(totalEntradas)}</span>
                      </div>
                    )}
                    {freeEntries > 0 && (
                      <p className="text-[10px] text-[rgb(var(--c-success-strong))] bg-[rgb(var(--c-success)/0.08)] border border-[rgb(var(--c-success)/0.2)] rounded-xl px-3 py-1.5 font-medium">
                        Info: 1 pase de asistente gratis por cada {dancersPorAsistente} integrantes inscritos.
                      </p>
                    )}

                    <div className="flex justify-between items-center border-t border-[rgb(var(--c-border)/0.4)] pt-3 mt-3">
                      <span className="font-display text-base tracking-widest text-[rgb(var(--c-text-strong))]">TOTAL ESTIMADO</span>
                      <span className="font-display text-xl text-[rgb(var(--c-primary))] font-bold">{formatMoney(total)} MXN</span>
                    </div>
                    <p className="text-xs text-[rgb(var(--c-text)/0.7)] text-center pt-1 font-medium">Precio estimado · sujeto a confirmación por los organizadores</p>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}
      </>
    ) : (
      <div className="max-w-3xl mx-auto w-full py-2 px-3.5 sm:px-0 space-y-3 divide-y divide-[rgb(var(--c-border)/0.12)] [&>*]:pt-3 [&>*:first-child]:pt-0">
        
        {/* COMBINED 1 & 2: CABECERA VERDE, FECHA LÍMITE Y ENTRADAS ADICIONALES (TODOS JUNTOS Y PEGADOS) */}
        <div className="space-y-2 animate-fadeIn">
          {/* 1. MENSAJE VERDE DE REGISTRO CONFIRMADO + FECHA LÍMITE (PEGADOS Y EN CABECERA) */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-center gap-3 sm:gap-6 py-0.5 select-none">
              {/* Left Arrow Path */}
              <div className="flex flex-col items-center gap-0.5 opacity-90 shrink-0 text-purple-600">
                <ChevronDown className="w-5 h-5 text-purple-500 animate-arrow-1 stroke-[2.5px]" />
                <ChevronDown className="w-5 h-5 text-purple-600 animate-arrow-2 stroke-[2.5px]" />
                <ChevronDown className="w-5 h-5 text-purple-700 animate-arrow-3 stroke-[2.5px]" />
                <ChevronDown className="w-5 h-5 text-purple-800 animate-arrow-4 stroke-[2.5px]" />
              </div>
              
              {/* Center Green Success Recuadro Grande */}
              <div className="flex-1 bg-[rgb(var(--c-success))] text-white rounded-2xl p-4 md:p-5 shadow-sm text-center space-y-1 border border-[rgb(var(--c-success-strong)/0.15)]">
                <div className="flex items-center justify-center gap-2">
                  <Check className="w-6 h-6 stroke-[3px] shrink-0" />
                  <h2 className="font-display text-lg md:text-xl tracking-widest font-bold uppercase">
                    {isEditSave ? 'CAMBIOS AL REGISTRO GUARDADOS' : 'REGISTRO ENVIADO'}
                  </h2>
                </div>
                <p className="text-[11px] sm:text-xs font-semibold opacity-95">
                  {isEditSave ? 'Cambios al registro guardados con exito en nuestro sistema.' : 'Tu registro ha sido enviado. Un organizador lo revisara y confirmara pronto.'}
                </p>
              </div>
              
              {/* Right Arrow Path */}
              <div className="flex flex-col items-center gap-0.5 opacity-90 shrink-0 text-purple-600">
                <ChevronDown className="w-5 h-5 text-purple-500 animate-arrow-1 stroke-[2.5px]" />
                <ChevronDown className="w-5 h-5 text-purple-600 animate-arrow-2 stroke-[2.5px]" />
                <ChevronDown className="w-5 h-5 text-purple-700 animate-arrow-3 stroke-[2.5px]" />
                <ChevronDown className="w-5 h-5 text-purple-800 animate-arrow-4 stroke-[2.5px]" />
              </div>
            </div>

            {/* DEADLINE MESSAGE (SUBTLE AND EXTREMELY CLOSE UNDERNEATH) */}
            <div className="text-center">
              <div className="inline-flex items-center gap-2 bg-orange-600 border border-orange-700/20 px-4 py-2.5 rounded-2xl shadow-sm">
                <p className="text-[10px] sm:text-[11px] text-white font-bold flex items-center gap-1.5 leading-none">
                  <Clock className="w-3.5 h-3.5 text-white shrink-0" />
                  Límite para cambios y edición: <span className="text-orange-100 font-black">{chgDeadline}</span>
                </p>
              </div>
            </div>
          </div>

          {/* 2. ENTRADAS ADICIONALES (COMPACTO Y PEGADO) */}
          <div className="text-left pt-0.5">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 mb-1">
              <div className="flex items-center gap-2">
                <Ticket className="w-5.5 h-5.5 text-purple-600 shrink-0" />
                <h4 className="font-display text-base sm:text-lg tracking-widest text-[rgb(var(--c-text-strong))] font-black uppercase">ENTRADAS ADICIONALES</h4>
              </div>
              <p className="text-xs sm:text-sm text-[rgb(var(--c-text)/0.6)] font-semibold">
                Costo actual: {formatMoney(precioEntrada)} MXN c/u.
              </p>
            </div>
            
            <div className="bg-purple-50/50 border border-purple-200/50 rounded-xl p-3 text-[11px] leading-relaxed text-purple-950 mb-3">
              • Costo de <strong>preventa: {formatMoney(event?.cost_entrada_temprana ?? 500)} MXN</strong> por entrada (valido antes del <strong>{event?.deadline_precio_entrada ? new Date(event.deadline_precio_entrada + 'T00:00:00').toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) : 'miercoles 17 de Junio'}</strong>).<br />
              • Costo <strong>regular: {formatMoney(event?.cost_entrada_tardia ?? 600)} MXN</strong> por entrada (a partir del {event?.deadline_precio_entrada ? new Date(new Date(event.deadline_precio_entrada + 'T00:00:00').getTime() + 86400000).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' }) : '18 de Junio'}).<br />
              <strong className="block text-red-700 font-extrabold uppercase mt-1">IMPORTANTE: No se venderán entradas el día del evento.</strong>
            </div>
            
            {isBeforeTicketsDeadline(event) ? (
              <>
                <div className="flex items-center justify-between gap-4 py-1 my-1">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-[rgb(var(--c-text-strong))]">CANTIDAD:</span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setNewExtraTickets(prev => Math.max(1, prev - 1))}
                        className="w-7 h-7 rounded-lg bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.5)] flex items-center justify-center text-xs font-bold hover:bg-[rgb(var(--c-surface-2))] transition-colors active:scale-95 cursor-pointer"
                      >
                        -
                      </button>
                      <span className="font-display text-sm font-bold text-[rgb(var(--c-text-strong))] w-5 text-center">{newExtraTickets}</span>
                      <button 
                        onClick={() => setNewExtraTickets(prev => prev + 1)}
                        className="w-7 h-7 rounded-lg bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.5)] flex items-center justify-center text-xs font-bold hover:bg-[rgb(var(--c-surface-2))] transition-colors active:scale-95 cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  
                  <div className="text-right flex items-center gap-2">
                    <span className="text-xs sm:text-sm text-[rgb(var(--c-text)/0.65)] font-semibold">Total lote:</span>
                    <span className="font-display text-base sm:text-lg font-black text-purple-600">${(newExtraTickets * precioEntrada).toLocaleString('es-MX')} MXN</span>
                  </div>
                </div>

                <button
                  onClick={handleBuyExtraTickets}
                  disabled={generatingExtraPDF}
                  className="w-full h-14 bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-600 hover:brightness-105 active:scale-[0.98] disabled:opacity-50 text-white font-display text-lg sm:text-xl tracking-widest rounded-2xl transition-all shadow-md duration-150 font-black flex items-center justify-center gap-2 cursor-pointer"
                >
                  {generatingExtraPDF ? 'PROCESANDO…' : 'SOLICITAR ENTRADAS ADICIONALES'}
                </button>
              </>
            ) : (
              <div className="bg-amber-50/70 border border-amber-200/50 rounded-2xl p-4 text-xs text-amber-950 font-semibold leading-relaxed space-y-1 my-2">
                <p className="flex items-center gap-1.5 font-bold text-amber-950">
                  <Info className="w-4 h-4 text-amber-600 shrink-0" />
                  VENTA DE BOLETOS CERRADA:
                </p>
                <p>
                  La venta de entradas adicionales en línea ha concluido. Recuerda que no se venderán entradas el día del evento.
                </p>
              </div>
            )}

            {extraTicketsSuccess && (
              <div className="mt-2 space-y-2 animate-fadeIn text-center pt-2">
                <div className="flex items-center justify-center gap-1.5 text-green-600 font-bold text-[11px]">
                  <Check className="w-4 h-4" /> ¡SOLICITUD CONFIRMADA CON ÉXITO!
                </div>
                <p className="text-[10px] text-[rgb(var(--c-text)/0.7)] leading-relaxed">
                  Se han solicitado <strong className="font-bold text-[rgb(var(--c-text-strong))]">{lastPurchasedCount}</strong> entradas adicionales. Selecciona una opción:
                </p>
                <div className="flex gap-2.5">
                  <button 
                    onClick={() => handleViewExtraPDF(lastPurchasedCount)}
                    className="flex-1 h-14 flex items-center justify-center gap-2 bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.5)] hover:bg-[rgb(var(--c-surface-2))] text-[rgb(var(--c-text-strong))] font-display text-xs sm:text-sm tracking-wider rounded-2xl transition-all font-black cursor-pointer"
                  >
                    <Eye className="w-4.5 h-4.5 text-[rgb(var(--c-primary))]" /> VER ONLINE
                  </button>
                  <button 
                    onClick={() => handleDownloadExtraPDF(lastPurchasedCount)}
                    className="flex-1 h-14 bg-gradient-to-r from-purple-600 via-indigo-600 to-violet-600 hover:brightness-105 active:scale-[0.98] disabled:opacity-50 text-white font-display text-xs sm:text-sm tracking-wider rounded-2xl transition-all font-black flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4.5 h-4.5 text-white" /> DESCARGAR PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. INFORMACIÓN BANCARIA (SIN CAJAS, EN EL FONDO) */}
        <div className="py-2 text-left animate-fadeIn">
          <div className="flex items-center gap-2 mb-2.5">
            <Clipboard className="w-5.5 h-5.5 text-fuchsia-500 shrink-0" />
            <div>
              <h4 className="font-display text-base sm:text-lg tracking-widest text-[rgb(var(--c-text-strong))] font-black uppercase">INFORMACIÓN PARA EL PAGO BANCARIO</h4>
              <p className="text-xs sm:text-sm text-[rgb(var(--c-text)/0.6)] font-semibold">Realiza tu depósito o transferencia</p>
            </div>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm py-2">
            <div className="flex justify-between items-center py-1.5 border-b border-[rgb(var(--c-border)/0.15)]">
              <span className="text-[rgb(var(--c-text)/0.6)]">Beneficiario:</span>
              <span className="font-bold text-[rgb(var(--c-text-strong))]">JOEL ARTURO GARCIA</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-[rgb(var(--c-border)/0.15)]">
              <span className="text-[rgb(var(--c-text)/0.6)]">Banco:</span>
              <span className="font-black text-[rgb(var(--c-text-strong))]">BBVA</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-[rgb(var(--c-border)/0.15)]">
              <span className="text-[rgb(var(--c-text)/0.6)]">Cuenta:</span>
              <div className="flex items-center gap-2">
                <span className="font-black text-base text-[rgb(var(--c-text-strong))] tracking-wide">010 440 2340</span>
                <button 
                  onClick={() => handleCopyText('010 440 2340', 'account')}
                  className="p-1 hover:bg-fuchsia-500/10 rounded-lg text-fuchsia-500 transition-colors active:scale-90 cursor-pointer"
                  title="Copiar Cuenta"
                >
                  {copiedField === 'account' ? <Check className="w-4 h-4 text-green-500" /> : <Clipboard className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-[rgb(var(--c-border)/0.15)] md:col-span-1 lg:col-span-2">
              <span className="text-[rgb(var(--c-text)/0.6)]">CLABE:</span>
              <div className="flex items-center gap-2">
                <span className="font-black text-base text-[rgb(var(--c-text-strong))] tracking-wide">012 180 001044023400</span>
                <button 
                  onClick={() => handleCopyText('012 180 001044023400', 'clabe')}
                  className="p-1 hover:bg-fuchsia-500/10 rounded-lg text-fuchsia-500 transition-colors active:scale-90 cursor-pointer"
                  title="Copiar CLABE"
                >
                  {copiedField === 'clabe' ? <Check className="w-4 h-4 text-green-500" /> : <Clipboard className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-[rgb(var(--c-border)/0.15)] md:col-span-1">
              <span className="text-[rgb(var(--c-text)/0.6)]">No. de Tarjeta:</span>
              <div className="flex items-center gap-2">
                <span className="font-black text-base text-[rgb(var(--c-text-strong))] tracking-wide">4152 3139 6949 9099</span>
                <button 
                  onClick={() => handleCopyText('4152313969499099', 'card')}
                  className="p-1 hover:bg-fuchsia-500/10 rounded-lg text-fuchsia-500 transition-colors active:scale-90 cursor-pointer"
                  title="Copiar Tarjeta"
                >
                  {copiedField === 'card' ? <Check className="w-4 h-4 text-green-500" /> : <Clipboard className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-2 text-xs text-[rgb(var(--c-text)/0.5)] flex items-start gap-2">
            <Info className="w-4 h-4 text-fuchsia-500 shrink-0 mt-0.5" />
            <span>Esta información bancaria también viene detallada en el comprobante PDF de tu registro completo.</span>
          </div>
        </div>

        {/* 4. TOTAL A PAGAR (DESGLOSE SIN CAJAS) */}
        {(() => {
          const counts = participacionesPorAlumno(state)
          const filledDancers = state.dancers.filter(d => d.name.trim().length > 0)
          const freeEntries = Math.floor(filledDancers.length / dancersPorAsistente)
          const assistants = state.coach.assistants.filter(a => a.trim())
          const paidAssistants = Math.max(0, assistants.length - freeEntries)
          
          let totalInscripciones = 0
          let totalAdicionales = 0
          let totalAdicionalesCount = 0
          const beforeJune15 = isBeforeJune15(event)

          state.dancers.forEach((dancer, idx) => {
            if (dancer.name.trim().length === 0) return
            totalInscripciones += paq
            
            const n = counts.get(idx) ?? 0
            if (beforeJune15) {
              if (n > 1) {
                totalAdicionalesCount += (n - 1)
                totalAdicionales += (n - 1) * rep
              }
            } else {
              totalAdicionalesCount += n
              totalAdicionales += n * rep
            }
          })

          const totalDancers = totalInscripciones + totalAdicionales
          const totalCoach = 0
          const totalAsistentes = paidAssistants * asistente
          const totalEntradas = (state.ticketsCount ?? 0) * precioEntrada
          const total = totalDancers + totalAsistentes + totalEntradas
          
          return (
            <div className="py-1 text-left animate-fadeIn">
              <div className="flex items-center gap-2 mb-2.5">
                <DollarSign className="w-5.5 h-5.5 text-[rgb(var(--c-primary))] shrink-0" />
                <h3 className="font-display text-base sm:text-lg tracking-widest text-[rgb(var(--c-text-strong))] font-black uppercase">
                  RESUMEN TOTAL DE TU REGISTRO
                </h3>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-0.5 border-b border-[rgb(var(--c-border)/0.15)]">
                  <span className="text-[rgb(var(--c-text)/0.7)]">Coach (entrada base):</span>
                  <span className="font-bold text-[rgb(var(--c-success-strong))]">Gratis ($0)</span>
                </div>
                <div className="flex justify-between items-center py-0.5 border-b border-[rgb(var(--c-border)/0.15)]">
                  <span className="text-[rgb(var(--c-text)/0.7)]">Inscripción Integrantes ({filledDancers.length} × {formatMoney(paq)}):</span>
                  <span className="font-bold text-[rgb(var(--c-text-strong))]">{formatMoney(totalInscripciones)}</span>
                </div>
                {totalAdicionalesCount > 0 && (
                  <div className="flex justify-between items-center py-0.5 border-b border-[rgb(var(--c-border)/0.15)]">
                    <span className="text-[rgb(var(--c-text)/0.7)]">Coreografías Adicionales ({totalAdicionalesCount} × {formatMoney(rep)}):</span>
                    <span className="font-bold text-[rgb(var(--c-text-strong))]">{formatMoney(totalAdicionales)}</span>
                  </div>
                )}
                {assistants.length > 0 && (
                  <div className="flex justify-between items-center py-0.5 border-b border-[rgb(var(--c-border)/0.15)]">
                    <span className="text-[rgb(var(--c-text)/0.7)]">
                      Asistentes ({paidAssistants} × {formatMoney(asistente)}{freeEntries > 0 ? `, ${freeEntries} gratis` : ''}):
                    </span>
                    <span className="font-bold text-[rgb(var(--c-text-strong))]">{formatMoney(totalAsistentes)}</span>
                  </div>
                )}
                {(state.ticketsCount ?? 0) > 0 && (
                  <div className="flex justify-between items-center py-0.5 border-b border-[rgb(var(--c-border)/0.15)]">
                    <span className="text-[rgb(var(--c-text)/0.7)]">Entradas Familia / Acompañantes ({state.ticketsCount} × {formatMoney(precioEntrada)}):</span>
                    <span className="font-bold text-[rgb(var(--c-text-strong))]">{formatMoney(totalEntradas)}</span>
                  </div>
                )}
                {freeEntries > 0 && (
                  <p className="text-xs text-[rgb(var(--c-success-strong))] bg-[rgb(var(--c-success)/0.06)] border border-[rgb(var(--c-success)/0.15)] rounded-xl px-3 py-1 font-medium">
                    Info: 1 pase de asistente gratis por cada {dancersPorAsistente} integrantes inscritos.
                  </p>
                )}
                
                <div className="flex justify-between items-center pt-2 mt-1.5">
                  <span className="font-display text-base sm:text-lg tracking-widest text-[rgb(var(--c-text-strong))] font-black">TOTAL ESTIMADO A PAGAR</span>
                  <span className="font-display text-2xl sm:text-3xl text-[rgb(var(--c-primary))] font-black">{formatMoney(total)} MXN</span>
                </div>
                <p className="text-xs text-[rgb(var(--c-text)/0.55)] text-center pt-0.5 italic font-medium">Precio estimado sujeto a validación final de coordinadores Dance4Ever.</p>
              </div>
            </div>
          )
        })()}

        {/* 5. ACCIONES AL FINAL (BOTONES A ANCHO COMPLETO, APILADOS Y PEGADOS) */}
        <div className="flex flex-col gap-2 pt-0.5">
          <button
            onClick={handleDownloadPDF}
            disabled={generatingPDF}
            className="w-full h-14 bg-gradient-to-r from-fuchsia-600 via-pink-600 to-rose-600 hover:brightness-105 active:scale-[0.98] disabled:opacity-50 text-white font-display text-lg sm:text-xl tracking-wider rounded-2xl transition-all shadow-lg hover:shadow-fuchsia-500/20 duration-150 font-black flex items-center justify-center gap-3 cursor-pointer"
          >
            {generatingPDF ? (
              <>
                <Clock className="w-6 h-6 animate-spin" /> GENERANDO COMPROBANTE…
              </>
            ) : (
              <>
                <Download className="w-6 h-6 text-white shrink-0" /> DESCARGAR COMPROBANTE PDF
              </>
            )}
          </button>
          
          <button
            onClick={startEdit}
            className="w-full h-14 bg-gradient-to-r from-purple-700 via-indigo-700 to-violet-700 hover:brightness-105 active:scale-[0.98] text-white font-display text-lg sm:text-xl tracking-wider rounded-2xl transition-all shadow-lg hover:shadow-indigo-500/10 duration-150 font-black flex items-center justify-center gap-3 cursor-pointer"
          >
            <Pencil className="w-5 h-5 text-white shrink-0" /> MODIFICAR REGISTRO
          </button>

          <button
            onClick={() => setShowWhatsAppModal(true)}
            className="w-full h-14 bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 hover:brightness-105 active:scale-[0.98] text-white font-display text-lg sm:text-xl tracking-wider rounded-2xl transition-all shadow-lg hover:shadow-green-500/15 duration-150 font-black flex items-center justify-center gap-3 cursor-pointer"
          >
            <MessageCircle className="w-6 h-6 text-white shrink-0" /> ENVIAR MENSAJE POR WHATSAPP
          </button>
        </div>

        {/* COLLAPSIBLE DETAILS ACORDION (COMPRESS SPACE) */}
        <details className="group mt-2.5 text-left overflow-hidden transition-all">
          <summary className="flex justify-between items-center py-6 border-y-2 border-[rgb(var(--c-border)/0.25)] font-display text-base sm:text-lg md:text-xl lg:text-2xl xl:text-3xl tracking-widest font-black text-[rgb(var(--c-text-strong))] cursor-pointer select-none">
            <span>MOSTRAR DETALLES DE INTEGRANTES Y COREOGRAFÍAS REGISTRADOS</span>
            <ChevronDown className="w-7 h-7 sm:w-8 sm:h-8 text-[rgb(var(--c-primary))] transition-transform group-open:rotate-180 stroke-[3px]" />
          </summary>
          <div className="divide-y divide-[rgb(var(--c-border)/0.15)] bg-transparent pt-4">
            {/* Academy & Coach */}
            <div className="py-4">
              <h4 className="font-display text-lg sm:text-xl tracking-widest text-[rgb(var(--c-primary))] mb-5 uppercase font-black">COACH Y ACADEMIA</h4>
              <div className="grid md:grid-cols-2 gap-4 text-sm sm:text-base">
                <div>
                  <p className="text-xs sm:text-sm tracking-[0.2em] text-[rgb(var(--c-text)/0.6)] font-bold mb-1.5">COACH</p>
                  <p className="font-black text-[rgb(var(--c-text-strong))] uppercase text-base sm:text-lg">{state.coach.name}</p>
                  <p className="text-sm sm:text-base text-[rgb(var(--c-text))] mt-1 font-semibold">{state.coach.phone}</p>
                  {state.coach.email && <p className="text-sm sm:text-base text-[rgb(var(--c-text))] mt-1 font-semibold">{state.coach.email}</p>}
                </div>
                <div>
                  <p className="text-xs sm:text-sm tracking-[0.2em] text-[rgb(var(--c-text)/0.6)] font-bold mb-1.5">ACADEMIA / COLEGIO</p>
                  <p className="font-black text-[rgb(var(--c-text-strong))] uppercase text-base sm:text-lg">{state.academy}</p>
                  {state.city && <p className="text-sm sm:text-base text-[rgb(var(--c-text))] mt-1 font-semibold">CIUDAD: {state.city.toUpperCase()}</p>}
                </div>
              </div>
            </div>
            
            {/* Dancers */}
            <div className="py-4">
              <h4 className="font-display text-lg sm:text-xl tracking-widest text-[rgb(var(--c-primary))] mb-5 uppercase font-black">INTEGRANTES REGISTRADOS ({filledDancers.length})</h4>
              <div className="divide-y divide-[rgb(var(--c-border)/0.1)]">
                {filledDancers.map((d, idx) => {
                  const compCat = effectiveCategory(d)
                  const label = compCat ? AGE_CATEGORY_LABELS[compCat] : '—'
                  return (
                    <div key={idx} className="py-3.5 flex justify-between items-center text-sm sm:text-base">
                      <span className="font-black text-[rgb(var(--c-text-strong))] uppercase">{d.name}</span>
                      <span className="text-xs sm:text-sm text-[rgb(var(--c-text)/0.6)] font-bold">{label} · {ageFromBirthdate(d.birthdate) ?? 0} años</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Acts */}
            <div className="py-4">
              <h4 className="font-display text-lg sm:text-xl tracking-widest text-[rgb(var(--c-primary))] mb-5 uppercase font-black">COREOGRAFÍAS REGISTRADAS ({state.acts.length})</h4>
              <div className="divide-y divide-[rgb(var(--c-border)/0.1)]">
                {state.acts.map((act, idx) => {
                  const cat = act.ageCategory ? AGE_CATEGORY_LABELS[act.ageCategory] : '—'
                  const mod = act.modality ? modalityLabel(act.modality) : '—'
                  const style = act.style ?? '—'
                  const dancers = act.dancerIndices.map(i => state.dancers[i]?.name).filter(Boolean).join(', ')
                  return (
                    <div key={idx} className="py-4.5 space-y-2 text-left text-sm sm:text-base">
                      <div className="flex justify-between items-center">
                        <span className="font-display text-lg sm:text-xl tracking-wider font-black text-[rgb(var(--c-text-strong))]">COREOGRAFÍA #{idx + 1} - {mod.toUpperCase()}</span>
                        <span className="text-xs sm:text-sm text-[rgb(var(--c-primary))] font-black">{cat.toUpperCase()}</span>
                      </div>
                      <p className="text-sm sm:text-base text-[rgb(var(--c-text)/0.8)]"><strong className="font-black text-[rgb(var(--c-text-strong))]">ESTILO:</strong> {style.toUpperCase()}</p>
                      <p className="text-xs sm:text-sm text-[rgb(var(--c-text)/0.6)] leading-relaxed"><strong className="font-bold text-[rgb(var(--c-text-strong))]">INTEGRANTES:</strong> {dancers.toUpperCase()}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </details>
      </div>
    )}
  </div>

      {/* FLOATING ACTION BAR FOR CONFIRM / SAVE */}
      {!confirmed && (
        <div 
          className="shrink-0 bg-[rgb(var(--c-surface))] border-t border-[rgb(var(--c-border)/0.7)] shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-20 rounded-t-3xl mt-2 p-4 md:p-5 hidden lg:block"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
        >
          <div className="max-w-4xl mx-auto w-full">
            {saveErr && (
              <p className="text-[rgb(var(--c-primary))] text-xs bg-[rgb(var(--c-primary)/0.05)] border border-[rgb(var(--c-primary)/0.2)] rounded-xl px-4 py-2.5 mb-3 text-center font-bold">{saveErr}</p>
            )}
            <div className="mb-4">
              <label className="block text-xs font-bold text-[rgb(var(--c-text)/0.7)] uppercase tracking-wider mb-1.5">
                Notas para los organizadores (opcional)
              </label>
              <textarea
                value={state.notes}
                onChange={e => updateState(s => ({ ...s, notes: e.target.value }))}
                placeholder="Ej. Me dijo X organizador que me darian otro costo, esta alumna debe ir en categoria Junior..."
                maxLength={500}
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[rgb(var(--c-border))] bg-white text-sm text-[rgb(var(--c-text-strong))] focus:outline-none focus:border-[rgb(var(--c-primary))] resize-none placeholder:text-[rgb(var(--c-text)/0.45)]"
              />
              <p className="text-[10px] text-[rgb(var(--c-text)/0.5)] mt-1 text-right">{state.notes.length}/500</p>
            </div>
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
                className="w-full h-14 md:h-16 bg-gradient-to-r from-purple-700 via-purple-600 to-pink-600 hover:from-purple-800 hover:to-pink-700 active:scale-[0.98] text-white font-display text-lg tracking-widest rounded-2xl disabled:opacity-50 disabled:pointer-events-none transition-all shadow-[0_4px_20px_rgba(168,85,247,0.3)] hover:shadow-[0_6px_25px_rgba(168,85,247,0.5)] md:col-span-2 font-black flex items-center justify-center gap-2"
              >
                {saving ? 'GUARDANDO...' : editMode ? 'GUARDAR CAMBIOS' : 'ENVIAR REGISTRO'}
                <Check className="w-5 h-5 animate-pulse" />
              </button>
            </div>
          </div>
        </div>
      )}

      {showWhatsAppModal && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out_forwards]">
          <div className="w-full max-w-lg bg-amber-50/98 border-4 border-amber-500 rounded-3xl p-6 sm:p-8 shadow-2xl relative text-center space-y-6">
            {/* Close button */}
            <button 
              onClick={() => setShowWhatsAppModal(false)}
              className="absolute top-4 right-4 text-amber-800 hover:text-amber-950 p-1.5 bg-amber-100/60 hover:bg-amber-200/60 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            
            {/* Warning Icon & Title */}
            <div className="flex flex-col items-center gap-3">
              <div className="bg-amber-100 p-4 rounded-full border border-amber-300 animate-pulse">
                <Info className="w-12 h-12 text-amber-600" />
              </div>
              <h3 className="font-display text-2xl font-black text-amber-950 tracking-wider">
                ¡ATENCIÓN: CANAL DE SOPORTE!
              </h3>
            </div>
            
            {/* Warning Message */}
            <div className="text-amber-900 text-sm sm:text-base leading-relaxed space-y-4 font-medium text-left">
              <p>
                Este canal de comunicación vía WhatsApp está habilitado <strong className="font-bold text-amber-950 underline">únicamente para enviar tu comprobante de pago</strong> o para resolver dudas urgentes y casos muy puntuales.
              </p>
              <div className="bg-amber-200/40 p-4 rounded-2xl border border-amber-200 text-xs sm:text-sm font-semibold text-amber-950 space-y-2">
                <p className="flex items-center gap-1.5 text-red-800 font-extrabold uppercase">
                  <span>⚠️ REGLA CRÍTICA DE MODIFICACIONES:</span>
                </p>
                <p>
                  Si necesitas agregar integrantes, corregir nombres, agregar coreografías o hacer cualquier cambio en tus datos, <strong className="text-red-700 font-extrabold uppercase underline">DEBES hacerlo tú mismo utilizando el botón de "MODIFICAR REGISTRO"</strong>. No se procesarán ni guardarán cambios o datos solicitados por mensaje de WhatsApp.
                </p>
              </div>
            </div>
            
            {/* Action Buttons with Countdown */}
            <div className="space-y-3 pt-2">
              <button
                onClick={handleWhatsAppRedirect}
                disabled={whatsappCountdown > 0}
                className={`w-full h-14 rounded-2xl font-display text-base tracking-widest font-black flex items-center justify-center gap-2 transition-all duration-300 shadow-md ${
                  whatsappCountdown > 0 
                    ? 'bg-amber-200 text-amber-400 border border-amber-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-emerald-600 to-green-600 hover:brightness-105 active:scale-[0.98] text-white cursor-pointer shadow-emerald-500/10'
                }`}
              >
                {whatsappCountdown > 0 ? (
                  <>
                    <Clock className="w-5 h-5 animate-spin text-amber-400" />
                    ENTENDIDO, IR A WHATSAPP ({whatsappCountdown}s)
                  </>
                ) : (
                  <>
                    <MessageCircle className="w-5 h-5 text-white" />
                    ENTENDIDO, IR A WHATSAPP
                  </>
                )}
              </button>
              
              <button
                onClick={() => setShowWhatsAppModal(false)}
                className="w-full py-1 text-xs font-bold text-amber-800 hover:text-amber-950 transition-colors uppercase cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
