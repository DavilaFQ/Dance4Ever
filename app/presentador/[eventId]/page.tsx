'use client'
import { useEffect, useState, use, useCallback, useRef } from 'react'
import Image from 'next/image'
import { supabase, Participant, Event } from '@/lib/supabase'
import { participantMatches } from '@/lib/search'
import SearchBar from '@/components/SearchBar'
import { X, ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { subscribePortalConfig, PortalConfig } from '@/lib/portalConfig'
import PortalLockout from '@/components/PortalLockout'
import PullToRefresh from '@/components/PullToRefresh'


type Props = { params: Promise<{ eventId: string }> }

/** Determina el nombre de display en tarjeta según modalidad */
function displayName(p: Participant): string {
  const type = (p.type || '').toLowerCase()
  if (type === 'grupal') return p.academy || p.name
  return p.name
}

/** Línea de subtítulo con categoría · estilo · tipo */
function subtitleLine(p: Participant): string {
  return [p.category, p.style, p.type].filter(Boolean).join(' · ')
}

export default function PresentadorPage({ params }: Props) {
  const { eventId } = use(params)
  const [event, setEvent] = useState<Event | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [notFound, setNotFound] = useState(false)
  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null)

  const [showProgram, setShowProgram] = useState(false)
  const [search, setSearch] = useState('')
  const [activeAnnouncement, setActiveAnnouncement] = useState('')
  const [audioUnlocked, setAudioUnlocked] = useState(false)

  // Alerta de doble avance
  const [doubleAdvanceAlert, setDoubleAdvanceAlert] = useState(false)
  const lastNextPressRef = useRef<number | null>(null)
  const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isAdvancing, setIsAdvancing] = useState(false)
  const [isTogglingAwards, setIsTogglingAwards] = useState(false)
  const [confirmAwards, setConfirmAwards] = useState(false)

  useEffect(() => {
    const unlock = () => {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        if (AudioContextClass) {
          const tempCtx = new AudioContextClass()
          if (tempCtx.state === 'suspended') {
            tempCtx.resume()
          }
          const osc = tempCtx.createOscillator()
          const gain = tempCtx.createGain()
          gain.gain.setValueAtTime(0, tempCtx.currentTime)
          osc.connect(gain)
          gain.connect(tempCtx.destination)
          osc.start()
          osc.stop(tempCtx.currentTime + 0.01)
        }
        setAudioUnlocked(true)
        window.removeEventListener('click', unlock)
        window.removeEventListener('touchstart', unlock)
      } catch (e) {
        console.warn('Failed to unlock audio context:', e)
      }
    }

    window.addEventListener('click', unlock)
    window.addEventListener('touchstart', unlock)
    return () => {
      window.removeEventListener('click', unlock)
      window.removeEventListener('touchstart', unlock)
    }
  }, [])

  // Subscribing to live broadcast channel for voiceovers and announcements
  useEffect(() => {
    if (!eventId) return
    const ch = supabase.channel(`broadcast-${eventId}`, {
      config: { broadcast: { self: true } }
    })
    
    ch.on('broadcast', { event: 'announcement' }, (payload) => {
      const text = payload.payload.text || ''
      setActiveAnnouncement(text)
      if (text) {
        // play the synthesized chime
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
          if (AudioContextClass) {
            const ctx = new AudioContextClass()
            const playBeep = (startTime: number) => {
              const osc = ctx.createOscillator()
              const gain = ctx.createGain()
              osc.connect(gain)
              gain.connect(ctx.destination)
              osc.type = 'sine'
              osc.frequency.setValueAtTime(880, startTime) // A5
              osc.frequency.exponentialRampToValueAtTime(1046.5, startTime + 0.15) // C6
              gain.gain.setValueAtTime(0, startTime)
              gain.gain.linearRampToValueAtTime(0.3, startTime + 0.02)
              gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25)
              osc.start(startTime)
              osc.stop(startTime + 0.25)
            }
            const now = ctx.currentTime
            playBeep(now)
            playBeep(now + 0.28) // double beep glide
          }
        } catch (e) {
          console.error('AudioContext error:', e)
        }
      }
    })
    
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [eventId])

  useEffect(() => { if (!showProgram) setSearch('') }, [showProgram])

  useEffect(() => {
    if (!eventId) return
    const unsubscribe = subscribePortalConfig(eventId, (config) => {
      setPortalConfig(config)
    })
    return () => unsubscribe()
  }, [eventId])


  const loadAll = useCallback(async () => {
    const [ev, ps] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase.from('participants').select('*').eq('event_id', eventId).order('position'),
    ])
    if (ev.error || !ev.data) {
      setNotFound(true)
      return
    }
    setEvent(ev.data)
    if (ps.data) setParticipants(ps.data)
  }, [eventId])

  useEffect(() => { loadAll() }, [loadAll])

  useEffect(() => {
    const channelId = `presentador-${eventId}-${Math.random().toString(36).slice(2, 9)}`
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
        (payload) => setEvent(payload.new as Event))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `event_id=eq.${eventId}` },
        () => loadAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [eventId, loadAll])

  async function advance(delta: number) {
    if (!event || isAdvancing) return

    if (delta === 1) {
      const now = Date.now()
      if (lastNextPressRef.current !== null && now - lastNextPressRef.current < 15000) {
        // Segunda vez en menos de 15 segundos — mostrar alerta
        setDoubleAdvanceAlert(true)
        if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current)
        alertTimeoutRef.current = setTimeout(() => setDoubleAdvanceAlert(false), 6000)
      }
      lastNextPressRef.current = now
    }

    setIsAdvancing(true)
    const total = participants.length || 999
    const next = Math.max(0, Math.min(total + 1, event.current_position + delta))
    const shouldSetStart = next > 0 && !event.started_at

    setEvent(prev => prev ? { ...prev, current_position: next } : null)

    await supabase.from('events').update({
      current_position: next,
    }).eq('id', event.id)

    if (shouldSetStart) {
      await supabase.rpc('set_started_at_now', { p_id: event.id })
    }

    setTimeout(() => {
      setIsAdvancing(false)
    }, 600)
  }

  async function toggleAwards() {
    if (!event || isTogglingAwards) return
    setIsTogglingAwards(true)
    const next = !event.awards_mode
    setEvent(prev => prev ? { ...prev, awards_mode: next } : null)
    await supabase.from('events').update({ awards_mode: next }).eq('id', event.id)
    setTimeout(() => { setIsTogglingAwards(false) }, 1000)
  }

  if (notFound) {
    return (
      <div className="h-[100dvh] bg-black flex items-center justify-center text-fuchsia-500 font-display text-3xl tracking-widest">
        EVENTO NO ENCONTRADO
      </div>
    )
  }

  if (portalConfig && !portalConfig.enableOperations) {
    return <PortalLockout portalName="Operativo (Presentador)" />
  }

  if (!event) {
    return (
      <div className="h-[100dvh] bg-black flex items-center justify-center text-fuchsia-500 font-display text-2xl tracking-widest animate-pulse">
        CARGANDO…
      </div>
    )
  }

  const current = participants.find(p => p.position === event.current_position)
  const next = participants.find(p => p.position === event.current_position + 1)

  return (
    <PullToRefresh onRefresh={async () => { window.location.reload() }}>
      <div className="h-[100dvh] bg-neutral-900 text-white flex flex-col overflow-hidden select-none">

      {/* Alerta de doble avance */}
      {doubleAdvanceAlert && (
        <div className="fixed inset-x-0 top-0 z-[100] px-4 pt-4 animate-bounce-in">
          <div className="bg-amber-500 border-2 border-amber-300 rounded-2xl px-4 py-3 flex items-start gap-3 shadow-2xl">
            <span className="text-2xl shrink-0">⚠️</span>
            <div className="flex-1 min-w-0">
              <p className="font-display text-black font-black text-base leading-tight uppercase tracking-wide">
                ¡Doble avance detectado!
              </p>
              <p className="text-black/70 text-xs mt-0.5 leading-snug">
                Presionaste "Siguiente" dos veces en menos de 15 segundos. Verifica si ya avanzaste o si saltaste una coreografía.
              </p>
            </div>
            <button
              onClick={() => setDoubleAdvanceAlert(false)}
              className="shrink-0 text-black/50 hover:text-black p-0.5"
              aria-label="Cerrar alerta"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {activeAnnouncement && (
        <div className="bg-fuchsia-950 border-b border-yellow-400 py-2 shrink-0 overflow-hidden relative flex items-center z-50">
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes marquee {
              0% { transform: translateX(0%); }
              100% { transform: translateX(-33.33%); }
            }
            .animate-marquee-custom {
              display: inline-block;
              white-space: nowrap;
              animation: marquee 25s linear infinite;
            }
            @keyframes bounceIn {
              0% { opacity: 0; transform: translateY(-20px) scale(0.95); }
              60% { transform: translateY(4px) scale(1.02); }
              100% { opacity: 1; transform: translateY(0) scale(1); }
            }
            .animate-bounce-in {
              animation: bounceIn 0.4s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
            }
          `}} />
          <div className="animate-marquee-custom font-display text-lg tracking-[0.2em] text-yellow-300 font-bold uppercase">
            <span>🚨 AVISO DE CONTROL: {activeAnnouncement} &nbsp;·&nbsp; 🚨 AVISO DE CONTROL: {activeAnnouncement} &nbsp;·&nbsp; 🚨 AVISO DE CONTROL: {activeAnnouncement} &nbsp;·&nbsp; </span>
          </div>
          <button 
            onClick={() => setActiveAnnouncement('')} 
            className="absolute right-2 bg-black/60 border border-fuchsia-500/50 hover:bg-black text-white hover:text-fuchsia-400 p-1 rounded-full z-10 transition-all duration-200"
            aria-label="Cerrar aviso"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <header className="bg-black px-3 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl tracking-[0.2em] text-fuchsia-500 leading-none">PRESENTADOR</h1>
          {!audioUnlocked && (
            <span className="text-[10px] font-bold bg-yellow-500 text-black px-2 py-0.5 rounded-full uppercase animate-pulse">
              🔊 Toca para sonido
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Botón de premiación — solo para el Presentador */}
          {event.current_position > 0 && (
            <button
              onClick={() => { if (event.awards_mode) toggleAwards(); else setConfirmAwards(true) }}
              disabled={isTogglingAwards}
              className="active:opacity-70 disabled:opacity-50 text-white transition-opacity"
              aria-label="Premiación"
              title={event.awards_mode ? "Finalizar premiación" : "Iniciar premiación"}
            >
              <Star className={`w-6 h-6 ${event.awards_mode ? 'fill-white text-white' : 'text-zinc-400'}`} />
            </button>
          )}
          <Image src="/logo.png" alt="Dance4ever" width={56} height={40} priority className="shrink-0" />
        </div>
      </header>

      {event.awards_mode ? (
        <div className="flex-1 min-h-0 flex flex-col bg-black text-fuchsia-500 px-4">
          <div className="flex-1 flex items-center justify-center text-center animate-pulse">
            <p className="font-display text-6xl leading-none uppercase tracking-wider">Premiación</p>
          </div>
        </div>
      ) : (
        <>
          {/* EN ESCENARIO */}
          <div className="flex-[3] min-h-0 bg-fuchsia-500 text-white flex flex-col items-center justify-center px-4 py-3 text-center overflow-hidden">
            {current ? (
              <>
                <p className="font-display text-xl tracking-[0.4em] leading-none mb-2">EN ESCENARIO</p>
                <p className="font-display text-7xl leading-none">#{String(current.position).padStart(2, '0')}</p>
                <p className="font-display text-5xl uppercase leading-tight mt-4 break-words max-w-full">{displayName(current)}</p>
                <div className="mt-4 space-y-1">
                  {/* Mostrar academia si es solista/dúo/trío */}
                  {current.academy && (current.type || '').toLowerCase() !== 'grupal' && (
                    <p className="font-display text-2xl uppercase opacity-80 leading-tight">{current.academy}</p>
                  )}
                  <p className="font-display text-xl uppercase opacity-70 leading-tight">
                    {subtitleLine(current)}
                  </p>
                </div>
              </>
            ) : event.current_position === 0 ? (
              <p className="font-display text-5xl leading-none">POR INICIAR</p>
            ) : (
              <p className="font-display text-3xl leading-none">— PROGRAMA TERMINADO —</p>
            )}
          </div>

          {/* SIGUIENTE */}
          <div className="flex-1 min-h-0 bg-neutral-900 border-t-2 border-fuchsia-500/40 flex flex-col items-center justify-center px-4 py-2 text-center overflow-hidden">
            {next ? (
              <>
                <p className="font-display text-sm tracking-[0.4em] text-fuchsia-500 leading-none mb-1">SIGUIENTE</p>
                <div className="flex items-baseline gap-2 max-w-full">
                  <span className="font-display text-3xl text-fuchsia-500 leading-none shrink-0">#{next.position}</span>
                  <p className="font-display text-2xl uppercase leading-tight truncate min-w-0">{displayName(next)}</p>
                </div>
                <p className="font-display text-sm uppercase opacity-70 leading-tight mt-1 truncate max-w-full">
                  {subtitleLine(next)}
                </p>
              </>
            ) : (
              <p className="text-gray-500 italic font-display text-lg tracking-wider">— FIN DEL PROGRAMA —</p>
            )}
          </div>
        </>
      )}

      {/* Botones Siguiente / Atrás */}
      <div className="flex gap-2.5 p-3 shrink-0">
        <button
          onClick={() => advance(-1)}
          disabled={isAdvancing || event.current_position === 0 || !!event.awards_mode}
          className="flex-1 bg-neutral-700 active:bg-neutral-600 disabled:opacity-30 text-white py-4 font-display text-xl tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-all"
        >
          <ChevronLeft className="w-6 h-6" /> ATRÁS
        </button>
        <button
          onClick={() => advance(1)}
          disabled={isAdvancing || !!event.awards_mode}
          className="flex-[2] bg-green-500 active:bg-green-600 disabled:opacity-30 text-black py-4 font-display text-xl tracking-widest rounded-2xl flex items-center justify-center gap-2 transition-all"
        >
          {event.current_position === 0 ? 'COMENZAR' : 'SIGUIENTE'}
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      <button
        onClick={() => setShowProgram(true)}
        className="shrink-0 bg-neutral-800 active:bg-neutral-700 text-white py-3 font-display text-lg tracking-widest border-t border-neutral-700"
      >
        PROGRAMA COMPLETO
      </button>

      {/* Confirmación premiación */}
      {confirmAwards && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-sm w-full space-y-4 text-white">
            <div className="flex justify-end -mt-2 -mr-2">
              <button onClick={() => setConfirmAwards(false)} className="p-1.5 hover:text-zinc-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <h2 className="font-display text-xl tracking-widest text-white text-center font-bold">¿INICIAR PREMIACIÓN?</h2>
            <p className="text-sm text-zinc-400 text-center leading-relaxed">
              Esto detendrá la visualización normal y mostrará la pantalla de premiación para coaches y público.
            </p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button
                onClick={() => setConfirmAwards(false)}
                className="bg-white/5 border border-white/10 hover:bg-white/10 text-white px-4 py-2.5 rounded-xl font-bold text-sm transition-all"
              >
                NO
              </button>
              <button
                onClick={() => { toggleAwards(); setConfirmAwards(false) }}
                className="bg-white text-black px-4 py-2.5 rounded-xl font-bold text-sm"
              >
                SÍ
              </button>
            </div>
          </div>
        </div>
      )}

      {showProgram && (
        <div className="fixed inset-0 bg-neutral-900 z-50 flex flex-col">
          <div className="bg-black px-4 py-3 flex items-center justify-between shrink-0">
            <h3 className="font-display text-2xl tracking-widest text-fuchsia-500">PROGRAMA</h3>
            <button onClick={() => setShowProgram(false)} aria-label="Cerrar"><X className="w-6 h-6" /></button>
          </div>
          <SearchBar value={search} onChange={setSearch} />
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
              {(() => {
              if (participants.length === 0) return <p className="text-center text-gray-500 italic py-6">Sin programa</p>
              const filtered = participants.filter(p => participantMatches(p, search))
              if (filtered.length === 0) return <p className="text-center text-gray-500 italic py-6">Sin resultados</p>
              
              const rendered: React.ReactNode[] = []
              let lastCategory = ''
              let lastSubgroup = ''
              
              filtered.forEach(p => {
                const cat = p.category || 'Sin categoría'
                const subgroup = [p.style, p.type].filter(Boolean).join(' · ')
                const isOnStage = event.current_position === p.position
                const done = p.position < event.current_position
                const bg = isOnStage ? 'bg-fuchsia-500 text-white' : done ? 'bg-neutral-800/60 opacity-40' : 'bg-neutral-700'
                
                if (cat !== lastCategory) {
                  rendered.push(
                    <div key={`cat-${cat}-${p.position}`} className="flex items-center gap-2 pt-3 pb-1 first:pt-0">
                      <div className="h-px flex-1 bg-white/15" />
                      <span className="font-display text-[10px] tracking-[0.25em] text-gray-400 uppercase font-bold px-1">{cat}</span>
                      <div className="h-px flex-1 bg-white/15" />
                    </div>
                  )
                  lastCategory = cat
                  lastSubgroup = ''
                }
                
                if (subgroup && subgroup !== lastSubgroup) {
                  rendered.push(
                    <div key={`sub-${cat}-${subgroup}-${p.position}`} className="flex items-center gap-2 pb-0.5">
                      <div className="h-px flex-1 bg-white/5" />
                      <span className="font-display text-[8px] tracking-[0.2em] text-gray-600 uppercase font-semibold">{subgroup}</span>
                      <div className="h-px flex-1 bg-white/5" />
                    </div>
                  )
                  lastSubgroup = subgroup
                }
                
                rendered.push(
                  <div key={p.id} className={`w-full rounded-md px-3 py-2 flex items-center gap-3 ${bg}`}>
                    <span className="font-display text-2xl shrink-0 leading-none">#{p.position}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-xl uppercase truncate leading-none">{displayName(p)}</p>
                      <p className="font-display text-xs uppercase opacity-60 truncate leading-tight mt-0.5">{subtitleLine(p)}</p>
                    </div>
                    <div className="text-right shrink-0 leading-tight max-w-[38%]">
                      {p.academy && (p.type || '').toLowerCase() !== 'grupal' && (
                        <p className="font-display text-sm uppercase truncate">{p.academy}</p>
                      )}
                    </div>
                  </div>
                )
              })
              return rendered
            })()}
          </div>
        </div>
      )}
    </div>
    </PullToRefresh>
  )
}
