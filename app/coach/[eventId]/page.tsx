'use client'
import { useEffect, useState, use, useCallback, useRef } from 'react'
import Image from 'next/image'
import { supabase, Participant, Event, Coach } from '@/lib/supabase'
import { useFitCount } from '@/lib/useFitCount'
import { ChevronLeft, X, ArrowUpRight } from 'lucide-react'
import { participantMatches } from '@/lib/search'
import SearchBar from '@/components/SearchBar'
import { getAvgPerTurnMs, etaLabel } from '@/lib/eta'
import { syncServerTime, serverNow } from '@/lib/serverTime'
import { subscribePortalConfig, PortalConfig } from '@/lib/portalConfig'
import PortalLockout from '@/components/PortalLockout'


const PILL_PX = 48
const PILL_GAP = 4

type Props = { params: Promise<{ eventId: string }> }

const STORAGE_KEY = (eventId: string) => `d4e:coach:${eventId}`

export default function CoachPage({ params }: Props) {
  const { eventId } = use(params)
  const [event, setEvent] = useState<Event | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [coachId, setCoachId] = useState<string | null>(null)
  const [modal, setModal] = useState<null | 'mine' | 'full'>(null)
  const [search, setSearch] = useState('')
  const [alertedAt, setAlertedAt] = useState<number | null>(null)
  const [, setTick] = useState(0)
  const [activeAnnouncement, setActiveAnnouncement] = useState('')
  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null)


  useEffect(() => {
    syncServerTime()
    const sync = setInterval(syncServerTime, 5 * 60 * 1000)
    const tick = setInterval(() => setTick(t => t + 1), 30000)
    return () => { clearInterval(sync); clearInterval(tick) }
  }, [])

  useEffect(() => { setSearch('') }, [modal])

  const hasScrolledRef = useRef(false)
  useEffect(() => {
    if (!modal) hasScrolledRef.current = false
  }, [modal])

  const activeItemRef = useCallback((node: HTMLDivElement | null) => {
    if (node && !hasScrolledRef.current) {
      hasScrolledRef.current = true
      setTimeout(() => {
        node.scrollIntoView({ behavior: 'auto', block: 'center' })
      }, 50)
    }
  }, [])

  const loadAll = useCallback(async () => {
    const [ev, ps, cs] = await Promise.all([
      supabase.from('events').select('*').eq('id', eventId).single(),
      supabase.from('participants').select('*').eq('event_id', eventId).order('position'),
      supabase.from('coaches').select('*').eq('event_id', eventId).order('name'),
    ])
    if (ev.data) setEvent(ev.data)
    if (ps.data) setParticipants(ps.data)
    if (cs.data) setCoaches(cs.data)
  }, [eventId])

  useEffect(() => {
    loadAll()
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY(eventId))
      if (saved) setCoachId(saved)
    }
  }, [eventId, loadAll])

  useEffect(() => {
    const channelId = `coach-${eventId}-${Math.random().toString(36).slice(2, 9)}`
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
        (payload) => setEvent(payload.new as Event))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `event_id=eq.${eventId}` },
        () => loadAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [eventId, loadAll])

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
        // Physical haptic haptics double-vibration
        try {
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate([200, 100, 200])
          }
        } catch (e) {
          console.warn('Vibration failed:', e)
        }
      }
    })
    
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [eventId])

  useEffect(() => {
    if (!eventId) return
    const unsubscribe = subscribePortalConfig(eventId, (config) => {
      setPortalConfig(config)
    })
    return () => unsubscribe()
  }, [eventId])


  const coach = coaches.find(c => c.id === coachId)
  const current = event ? participants.find(p => p.position === event.current_position) : null
  const upcomingAll = event ? participants.filter(p => p.position > event.current_position) : []

  const myUpcoming = event && coach
    ? participants.filter(p => p.coach_id === coach.id && p.position >= event.current_position)
    : []
  const nextMine = myUpcoming[0]
  const turns = nextMine && event ? nextMine.position - event.current_position : null
  const onStage = turns === 0
  const onDeck = turns !== null && event ? turns > 0 && turns <= event.on_deck_count : false

  useEffect(() => {
    if (!onDeck || !nextMine || alertedAt === nextMine.id) return
    try {
      if ('vibrate' in navigator) navigator.vibrate([300, 100, 300])
    } catch (e) {
      console.warn('Vibration failed:', e)
    }
    setAlertedAt(nextMine.id)
  }, [onDeck, nextMine, alertedAt])

  function selectCoach(c: Coach) {
    setCoachId(c.id)
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY(eventId), c.id)
  }
  function logout() {
    setCoachId(null)
    setModal(null)
    if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY(eventId))
  }

  const myList = coach ? participants.filter(p => p.coach_id === coach.id) : []
  const hasPerformed = event && coach
    ? myList.some(p => p.position > 0 && p.position < event.current_position)
    : false
  const showAwards = !!(event?.awards_mode && hasPerformed)
  const fullList = participants

  const { ref: listRef, count: listFit } = useFitCount(70, 0)
  const { ref: mineRef, count: mineFit } = useFitCount(70, 0)
  const upcoming = upcomingAll.slice(0, listFit)

  if (portalConfig && !portalConfig.enableOperations) {
    return <PortalLockout portalName="Operativo (Coach)" />
  }

  return (
      <div className="h-[100dvh] text-white flex flex-col overflow-hidden select-none relative" style={{
        background: '#000000',
      }}>
        {/* Apple Premium Dark Mode styles */}
        <style dangerouslySetInnerHTML={{__html: `
          .apple-glass-card {
            background: rgba(22, 22, 26, 0.75);
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
            border-radius: 20px;
            z-index: 10;
          }
          .apple-glass-header {
            background: rgba(9, 9, 11, 0.75);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            z-index: 20;
          }
          .apple-btn {
            border-radius: 16px;
            font-weight: 600;
            transition: all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
            display: flex;
            align-items: center;
            justify-content: center;
            letter-spacing: -0.01em;
          }
          .apple-btn:active {
            transform: scale(0.96);
            opacity: 0.85;
          }
          .apple-btn-primary {
            background: #ffffff;
            color: #000000;
            border: 1px solid #ffffff;
            box-shadow: 0 4px 12px rgba(255, 255, 255, 0.15);
          }
          .apple-btn-secondary {
            background: rgba(255, 255, 255, 0.06);
            color: #ffffff;
            border: 1px solid rgba(255, 255, 255, 0.08);
          }
          .apple-btn-danger {
            background: rgba(239, 68, 68, 0.12);
            color: #ef4444;
            border: 1px solid rgba(239, 68, 68, 0.25);
          }
          .apple-btn-success {
            background: rgba(34, 197, 94, 0.12);
            color: #22c55e;
            border: 1px solid rgba(34, 197, 94, 0.25);
          }
          .apple-btn-warning {
            background: rgba(249, 115, 22, 0.12);
            color: #f97316;
            border: 1px solid rgba(249, 115, 22, 0.25);
          }
          .boxless-item {
            background: transparent;
            border-bottom: 1px solid rgba(255, 255, 255, 0.25);
            transition: all 0.2s ease;
          }
          .boxless-item-onstage {
            background: linear-gradient(to right, rgba(234, 179, 8, 0.1) 0%, transparent 100%);
            border-bottom: 1px solid rgba(234, 179, 8, 0.5);
          }
          .boxless-item-mine {
            background: linear-gradient(to right, rgba(217, 70, 239, 0.08) 0%, transparent 100%);
            border-bottom: 1px solid rgba(217, 70, 239, 0.45);
          }
          .boxless-item-done {
            background: transparent;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            opacity: 0.25;
          }
          .gold-card {
            background: #eab308;
            color: #000000;
            border-bottom: 1px solid rgba(0, 0, 0, 0.15);
            border-top: 1px solid rgba(0, 0, 0, 0.15);
            border-radius: 0;
            box-shadow: none;
            z-index: 10;
          }
          .neutral-header-card {
            background: #121214;
            color: #ffffff;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 0;
            box-shadow: none;
            z-index: 10;
          }
          .next-turn-card-stage {
            background: #10b981;
            color: #000000;
            border-bottom: 1px solid rgba(0, 0, 0, 0.15);
            border-top: 1px solid rgba(0, 0, 0, 0.15);
            border-radius: 0;
            box-shadow: none;
            z-index: 10;
          }
          .next-turn-card-deck {
            background: #f59e0b;
            color: #000000;
            border-bottom: 1px solid rgba(0, 0, 0, 0.15);
            border-top: 1px solid rgba(0, 0, 0, 0.15);
            border-radius: 0;
            box-shadow: none;
            z-index: 10;
          }
          .next-turn-card-standard {
            background: #d946ef;
            color: #000000;
            border-bottom: 1px solid rgba(0, 0, 0, 0.15);
            border-top: 1px solid rgba(0, 0, 0, 0.15);
            border-radius: 0;
            box-shadow: none;
            z-index: 10;
          }
          @keyframes goldPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          .gold-pulse {
            animation: goldPulse 2.5s ease-in-out infinite;
          }
          .animate-fade-in {
            animation: fadeIn 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.97); }
            to { opacity: 1; transform: scale(1); }
          }
        `}} />

        {activeAnnouncement && (
          <div className="bg-neutral-900 border-b border-yellow-500/50 py-2 shrink-0 overflow-hidden relative flex items-center z-50">
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
            `}} />
            <div className="animate-marquee-custom font-display text-sm tracking-[0.2em] text-yellow-400 font-bold uppercase">
              <span>🚨 AVISO DE CONTROL: {activeAnnouncement} &nbsp;·&nbsp; 🚨 AVISO DE CONTROL: {activeAnnouncement} &nbsp;·&nbsp; 🚨 AVISO DE CONTROL: {activeAnnouncement} &nbsp;·&nbsp; </span>
            </div>
            <button 
              onClick={() => setActiveAnnouncement('')} 
              className="absolute right-2 bg-black/60 border border-neutral-700 hover:bg-black text-white p-1.5 rounded-full z-10 transition-all duration-200"
              aria-label="Cerrar aviso"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Header */}
        <header className="apple-glass-header px-4 py-3.5 flex items-center gap-3 shrink-0 relative z-20">
          {coach ? (
            <button onClick={logout} className="flex items-center gap-1.5 min-w-0 flex-1 shrink text-left">
              <ChevronLeft className="w-7 h-7 text-neutral-400 shrink-0" />
              <h1 className="font-display text-2xl tracking-[0.1em] text-white truncate uppercase leading-none font-bold">
                {myList.length > 0 && myList[0].academy ? myList[0].academy.split('(')[0].trim() : coach.name}
              </h1>
            </button>
          ) : (
            <h1 className="flex-1 min-w-0 font-display text-2xl tracking-[0.15em] text-white truncate uppercase leading-none font-bold">COACH</h1>
          )}
          <Image src="/logo.png" alt="Dance4ever" width={46} height={32} priority className="shrink-0 opacity-90" />
        </header>

        {!event ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500 z-10">Cargando…</div>
        ) : !coach ? (
          <div className="flex-1 min-h-0 flex flex-col relative z-10 p-4">
            <p className="text-center font-display text-xs tracking-[0.3em] text-zinc-400 py-3 shrink-0 font-bold">ELIGE TU ACADEMIA / EQUIPO</p>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3.5 pb-4">
              {(() => {
                const mapped = coaches.map(c => {
                  const firstPart = participants.find(p => p.coach_id === c.id)
                  const displayName = firstPart && firstPart.academy
                    ? firstPart.academy.split('(')[0].trim()
                    : c.name
                  return { coach: c, displayName }
                })
                // Sort alphabetically by academy/display name
                mapped.sort((a, b) => a.displayName.localeCompare(b.displayName))

                return mapped.map(({ coach: c, displayName }) => (
                  <button key={c.id} onClick={() => selectCoach(c)}
                    className="w-full text-left apple-btn apple-btn-secondary px-5 py-4 font-display text-lg tracking-wider uppercase">
                    {displayName}
                  </button>
                ))
              })()}
              {coaches.length === 0 && (
                <p className="text-center text-zinc-600 italic py-4">Aún no se ha cargado el programa</p>
              )}
            </div>
          </div>
        ) : (
          <>
            {showAwards ? (
              <div className="flex-1 min-h-0 flex flex-col px-4 text-center bg-zinc-950 text-white z-10 justify-center">
                <div className="animate-pulse">
                  <p className="font-display text-6.5xl leading-none uppercase tracking-wide font-black">Premiación</p>
                  <p className="font-display text-6.5xl leading-none uppercase tracking-wide mt-2 font-black text-neutral-400">De Bloque</p>
                </div>
                <div className="flex flex-col items-center justify-center animate-pulse mt-12">
                  <p className="font-display text-3.5xl leading-tight uppercase tracking-wide text-zinc-300">Dirígete al escenario</p>
                  <p className="font-display text-3.5xl leading-tight uppercase tracking-wide mt-2 text-zinc-500">y sube al podio</p>
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col z-10 p-4 pb-0">
                {/* EN ESCENARIO arriba */}
                 <div className={`${current ? 'gold-card text-black' : 'neutral-header-card text-white'} px-4 py-4 shrink-0 text-center relative overflow-hidden mb-4 -mx-4`}>
                  {current ? (
                    <>
                      <p className="font-display text-xs tracking-[0.3em] text-black/60 font-bold uppercase leading-none gold-pulse">EN ESCENARIO · #{String(event.current_position).padStart(2, '0')}</p>
                      <p className="font-display text-4xl uppercase leading-tight mt-2.5 text-black break-words font-extrabold">{extractDancerName(current)}</p>
                      <p className="font-display text-[13px] uppercase opacity-80 leading-tight mt-2.5 text-black/90">
                        {formatSubtitle(current)}
                      </p>
                    </>
                  ) : event.current_position === 0 ? (
                    <p className="font-display text-2xl py-2 text-zinc-400 uppercase tracking-widest font-bold">POR INICIAR</p>
                  ) : (
                    <p className="font-display text-xl py-2 text-zinc-600 uppercase tracking-widest font-bold">— PROGRAMA TERMINADO —</p>
                  )}
                </div>



                {/* Lista — todos GRIS, dinámico al tamaño */}
                <div ref={listRef} className="flex-1 min-h-0 overflow-hidden pt-1 pb-3 flex flex-col gap-0 -mx-4">
                  {upcoming.length === 0 ? (
                    <p className="text-center text-zinc-600 italic py-4">No quedan más turnos</p>
                  ) : (
                    upcoming.map(p => (
                      <Pill key={p.id} p={p} mine={p.coach_id === coach.id} grow />
                    ))
                  )}
                </div>

                {/* Tarjeta grande con próximo turno del coach */}
                {(() => {
                  if (!nextMine) {
                    return (
                      <div className="apple-glass-card px-4 py-5 shrink-0 text-center mb-2">
                        <p className="font-display text-xs tracking-widest text-zinc-500 leading-none font-bold">YA NO TIENES TURNOS PENDIENTES</p>
                      </div>
                    )
                  }
                  const avgMs = getAvgPerTurnMs(event, serverNow())
                  const turnsToStage = (turns ?? 0)
                  const turnsToWait = Math.max(0, turnsToStage - event.on_deck_count)
                  const etaStage = etaLabel(turnsToStage, avgMs)
                  const etaWait = etaLabel(turnsToWait, avgMs)

                  if (onStage) {
                    return (
                      <div className="next-turn-card-stage px-4 py-5 shrink-0 relative overflow-hidden mb-2 animate-pulse -mx-4 text-black">
                        <p className="font-display text-[10px] tracking-[0.25em] leading-none text-black/60 font-bold uppercase text-center">TU PRÓXIMO TURNO</p>
                        <div className="flex items-center gap-4 mt-3.5">
                          <div className="flex flex-col items-center justify-center shrink-0 w-14 h-14 rounded-xl bg-black text-white">
                            <span className="font-display text-[9px] tracking-widest leading-none opacity-75 font-bold uppercase mb-1">TURNO</span>
                            <span className="font-display text-2xl leading-none font-black tabular-nums">#{nextMine.position}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-display text-lg uppercase leading-none text-black font-black">¡ES TU TURNO!</p>
                            <p className="font-display text-xl uppercase break-words leading-tight text-black font-bold mt-2">{extractDancerName(nextMine)}</p>
                            <p className="font-display text-xs uppercase leading-tight opacity-85 mt-1.5 text-black/80">
                              {formatSubtitle(nextMine)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  }
                  if (onDeck) {
                    return (
                      <div className="next-turn-card-deck px-4 py-4 shrink-0 relative overflow-hidden mb-2 animate-pulse -mx-4 text-black">
                        <p className="font-display text-[10px] tracking-[0.25em] leading-none text-black/60 font-bold uppercase text-center">TU PRÓXIMO TURNO</p>
                        <div className="flex items-center gap-4 mt-3.5">
                          <div className="flex flex-col items-center justify-center shrink-0 w-14 h-14 rounded-xl bg-black text-white">
                            <span className="font-display text-[9px] tracking-widest leading-none opacity-75 font-bold uppercase mb-1">TURNO</span>
                            <span className="font-display text-2xl leading-none font-black tabular-nums">#{nextMine.position}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-display text-xl uppercase break-words leading-tight text-black font-bold">{extractDancerName(nextMine)}</p>
                            <p className="font-display text-xs uppercase leading-tight opacity-85 mt-1.5 text-black/80">
                              {formatSubtitle(nextMine)}
                            </p>
                            <p className="font-display text-md tracking-wider leading-none mt-3 text-black font-bold uppercase">
                              SUBES EN {etaStage ? etaStage : `${turnsToStage} TURNO${turnsToStage === 1 ? '' : 'S'}`}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div className="next-turn-card-standard px-4 py-4 shrink-0 relative overflow-hidden mb-2 -mx-4 text-black">
                      <p className="font-display text-[10px] tracking-[0.25em] leading-none text-black/60 font-bold uppercase text-center">TU PRÓXIMO TURNO</p>
                      <div className="flex items-center gap-4 mt-3.5">
                        <div className="flex flex-col items-center justify-center shrink-0 w-14 h-14 rounded-xl bg-black text-white">
                          <span className="font-display text-[9px] tracking-widest leading-none opacity-75 font-bold uppercase mb-1">TURNO</span>
                          <span className="font-display text-2xl leading-none font-black tabular-nums">#{nextMine.position}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-display text-xl uppercase break-words leading-tight text-black font-bold">{extractDancerName(nextMine)}</p>
                          <p className="font-display text-xs uppercase leading-tight opacity-85 mt-1.5 text-black/80">
                            {formatSubtitle(nextMine)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3.5 border-t border-black/20 pt-2.5 text-center">
                        <p className="font-display text-md tracking-wider leading-none text-black font-semibold">
                          VE A PREPARACIÓN EN {etaWait ? etaWait : `${turnsToWait} TURNO${turnsToWait === 1 ? '' : 'S'}`}
                        </p>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Buttons — mismos colores y tamaño que ATRÁS/SIGUIENTE */}
            <div className="flex gap-0 shrink-0 relative z-20 -mx-4 bg-black pb-[env(safe-area-inset-bottom,0px)]">
              <button 
                onClick={() => setModal('mine')} 
                className="flex-1 py-4 font-display text-xl uppercase tracking-wider text-fuchsia-400 bg-zinc-900 border-t border-r border-white/10 font-bold active:scale-95 transition-all text-center rounded-none outline-none"
              >
                MIS TURNOS
              </button>
              <button 
                onClick={() => setModal('full')} 
                className="flex-1 py-4 font-display text-xl uppercase tracking-wider text-black bg-white font-extrabold active:scale-95 transition-all text-center rounded-none outline-none border-t border-white/10"
              >
                PROGRAMA COMPLETO
              </button>
            </div>
          </>
        )}

        {/* Modal */}
        {modal && event && coach && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex flex-col p-4 animate-fade-in">
            <div className="flex-1 min-h-0 flex flex-col apple-glass-card overflow-hidden bg-zinc-950/80 border border-white/10">
              <div className="bg-black/30 px-4 py-3.5 flex items-center justify-between shrink-0 border-b border-white/5">
                <h3 className="font-display text-xl tracking-widest text-white font-bold">
                  {modal === 'mine' ? 'MIS TURNOS' : 'PROGRAMA OFICIAL'}
                </h3>
                <button onClick={() => setModal(null)} className="p-1 hover:text-zinc-400 transition-colors"><X className="w-6 h-6" /></button>
              </div>
              {modal === 'mine' ? (
                <div ref={mineRef} className="flex-1 min-h-0 overflow-hidden py-3 px-0 flex flex-col gap-0">
                  {myList.length === 0 ? (
                    <p className="text-center text-zinc-600 italic py-6">No tienes participaciones</p>
                  ) : (
                    myList.slice(0, mineFit).map(p => {
                      const isOnStage = event.current_position === p.position
                      const done = p.position < event.current_position
                      return (
                        <div key={p.id} ref={isOnStage ? activeItemRef : undefined} className="w-full">
                          <Pill p={p} onStage={isOnStage} done={done} grow />
                        </div>
                      )
                    })
                  )}
                </div>
              ) : (
                <>
                  <SearchBar value={search} onChange={setSearch} />
                  <div className="flex-1 min-h-0 overflow-y-auto py-3 px-0 space-y-0">
                    {(() => {
                      if (fullList.length === 0) return <p className="text-center text-zinc-600 italic py-6">Sin programa</p>
                      const filtered = fullList.filter(p => participantMatches(p, search))
                      if (filtered.length === 0) return <p className="text-center text-zinc-600 italic py-6">Sin resultados</p>
                      
                      const rendered: React.ReactNode[] = []
                      let lastCategory = ''
                      let lastSubgroup = ''
                      
                      filtered.forEach(p => {
                        const cat = p.category || 'Sin categoría'
                        const subgroup = [p.style, p.type].filter(Boolean).join(' · ')
                        const isOnStage = event.current_position === p.position
                        const done = p.position < event.current_position
                        const mine = p.coach_id === coach.id
                        
                        if (cat !== lastCategory) {
                          rendered.push(
                            <div key={`cat-${cat}-${p.position}`} className="flex items-center gap-2 pt-3 pb-1 px-4 first:pt-0">
                              <div className="h-px flex-1 bg-white/10" />
                              <span className="font-display text-[10px] tracking-[0.25em] text-zinc-400 uppercase font-bold px-1">{cat}</span>
                              <div className="h-px flex-1 bg-white/10" />
                            </div>
                          )
                          lastCategory = cat
                          lastSubgroup = ''
                        }
                        
                        if (subgroup && subgroup !== lastSubgroup) {
                          rendered.push(
                            <div key={`sub-${cat}-${subgroup}-${p.position}`} className="flex items-center gap-2 pb-0.5 px-4">
                              <div className="h-px flex-1 bg-white/5" />
                              <span className="font-display text-[8px] tracking-[0.2em] text-zinc-600 uppercase font-semibold">{subgroup}</span>
                              <div className="h-px flex-1 bg-white/5" />
                            </div>
                          )
                          lastSubgroup = subgroup
                        }
                        
                        rendered.push(
                          <div key={p.id} ref={isOnStage ? activeItemRef : undefined} className="w-full">
                            <Pill p={p} onStage={isOnStage} done={done} mine={mine} />
                          </div>
                        )
                      })
                      return rendered
                    })()}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
  )
}

/** Quita el prefijo de la academia del nombre del acto para mostrar solo el nombre del bailarín/equipo */
function extractDancerName(p: Participant): string {
  const type = (p.type || '').trim().toLowerCase()
  if (type === 'grupal') return p.academy || p.name
  if (!p.academy || !p.name) return p.name

  // Escape special regex characters in academy name
  const escaped = p.academy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Match: "Academy - something" OR "Academy (something)" — case insensitive
  const pattern = new RegExp('^' + escaped + '\\s*[-–(]\\s*', 'i')
  const result = p.name.replace(pattern, '').replace(/\)\s*$/, '').trim()
  if (result && result.toLowerCase() !== p.academy.toLowerCase()) return result

  // Fallback: grab content in parentheses if present
  const parenMatch = p.name.match(/\(([^)]+)\)/)
  if (parenMatch) return parenMatch[1].trim()

  return p.name
}

function estimateCoachPillHeight(p: Participant): number {
  const name = extractDancerName(p) || ''
  const isGrupal = (p.type || '').trim().toLowerCase() === 'grupal'
  const hasAcademyOnRight = !isGrupal && p.academy
  const maxChars = hasAcademyOnRight ? 24 : 34
  const lines = Math.max(1, Math.ceil(name.length / maxChars))
  return 60 + (lines - 1) * 28
}

function formatSubtitle(p: Participant, includeAcademy: boolean = true): string {
  const isGrupal = (p.type || '').trim().toLowerCase() === 'grupal'
  let academy = p.academy ? p.academy.trim() : ''
  let city = p.city ? p.city.trim() : ''
  if (academy) {
    const match = academy.match(/^(.*?)\s*\(([^)]+)\)$/)
    if (match) {
      academy = match[1].trim()
      if (!city) city = match[2].trim()
    }
  }
  const academyShort = academy.split('(')[0].trim()
  const categoryDisplay = !isGrupal && p.category ? p.category.split('|')[0].trim() : p.category
  return [
    includeAcademy && !isGrupal ? academyShort : '',
    city,
    categoryDisplay,
    p.style,
    (p.type || '').trim()
  ].filter(Boolean).join(' · ')
}

function pillDisplayName(p: Participant): string {
  return extractDancerName(p)
}

function Pill({ p, mine, onStage, done, grow }: { p: Participant, mine?: boolean, onStage?: boolean, done?: boolean, grow?: boolean }) {
  const bg =
    onStage ? 'boxless-item-onstage' :
    done ? 'boxless-item-done' :
    mine ? 'boxless-item-mine' :
    'boxless-item'
  const dancerName = pillDisplayName(p)
  const subtitle = formatSubtitle(p)
  const growClass = grow ? 'flex-1 min-h-0' : 'shrink-0 min-h-[48px]'

  const numberColor = 
    onStage ? 'text-yellow-400 font-extrabold' :
    done ? 'text-zinc-600' :
    mine ? 'text-fuchsia-400 font-bold' :
    'text-zinc-500 font-semibold'

  const titleColor =
    onStage ? 'text-yellow-400 font-bold' :
    done ? 'text-zinc-500' :
    mine ? 'text-fuchsia-200' :
    'text-white'

  const subtitleColor =
    onStage ? 'text-yellow-200/50' :
    done ? 'text-zinc-600' :
    mine ? 'text-fuchsia-300/40' :
    'text-zinc-400/80'

  const separatorColor =
    onStage ? 'border-yellow-500/50' :
    done ? 'border-white/5' :
    mine ? 'border-fuchsia-500/45' :
    'border-white/15'

  return (
    <div className={`w-full flex items-center ${bg} ${growClass} transition-all duration-200 z-10 overflow-hidden`}>
      <div className={`shrink-0 w-12 py-3 flex items-center justify-center border-r border-dotted ${separatorColor}`}>
        <span className={`font-display text-xl leading-none tabular-nums ${numberColor}`}>
          #{p.position}
        </span>
      </div>
      <div className="flex-1 min-w-0 pl-3.5 pr-4 py-3">
        <p className={`font-display text-xl uppercase break-words leading-tight ${titleColor}`}>{dancerName}</p>
        <p className={`font-display text-xs uppercase opacity-85 truncate mt-1 ${subtitleColor}`}>{subtitle}</p>
      </div>
    </div>
  )
}
