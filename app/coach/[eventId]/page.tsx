'use client'
import { useEffect, useState, use, useCallback } from 'react'
import Image from 'next/image'
import { supabase, Participant, Event, Coach } from '@/lib/supabase'
import { useFitCount } from '@/lib/useFitCount'
import { ChevronLeft, X, ArrowUpRight } from 'lucide-react'
import { participantMatches } from '@/lib/search'
import SearchBar from '@/components/SearchBar'
import { getAvgPerTurnMs, etaLabel } from '@/lib/eta'
import { syncServerTime, serverNow } from '@/lib/serverTime'

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

  useEffect(() => {
    syncServerTime()
    const sync = setInterval(syncServerTime, 5 * 60 * 1000)
    const tick = setInterval(() => setTick(t => t + 1), 30000)
    return () => { clearInterval(sync); clearInterval(tick) }
  }, [])

  useEffect(() => { setSearch('') }, [modal])

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
    const channel = supabase
      .channel('coach-' + eventId)
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
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate([200, 100, 200])
        }
      }
    })
    
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
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
    if ('vibrate' in navigator) navigator.vibrate([300, 100, 300])
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

  const { ref: listRef, count: listFit } = useFitCount(PILL_PX, PILL_GAP)
  const { ref: mineRef, count: mineFit } = useFitCount(PILL_PX, PILL_GAP)

  return (
    <div className="h-[100dvh] bg-neutral-900 text-white flex flex-col overflow-hidden select-none">
      {activeAnnouncement && (
        <div className="bg-fuchsia-950 border-b border-yellow-400 py-1.5 shrink-0 overflow-hidden relative flex items-center z-50">
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
          <div className="animate-marquee-custom font-display text-sm tracking-[0.2em] text-yellow-300 font-bold uppercase">
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

      {/* Header */}
      <header className="bg-black px-3 py-2 flex items-center gap-3 shrink-0">
        {coach ? (
          <button onClick={logout} className="flex items-center gap-2 min-w-0 flex-1 shrink">
            <ChevronLeft className="w-8 h-8 text-fuchsia-500 shrink-0" />
            <h1 className="font-display text-3xl tracking-[0.2em] text-fuchsia-500 truncate uppercase leading-none">
              {coach.name}
            </h1>
          </button>
        ) : (
          <h1 className="flex-1 min-w-0 font-display text-3xl tracking-[0.2em] text-fuchsia-500 truncate uppercase leading-none">COACH</h1>
        )}
        <Image src="/logo.png" alt="Dance4ever" width={56} height={40} priority className="shrink-0" />
      </header>

      {!event ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">Cargando…</div>
      ) : !coach ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <p className="text-center font-display text-base tracking-[0.4em] text-gray-300 py-2 shrink-0">ELIGE TU NOMBRE</p>
          <div className="flex-1 min-h-0 overflow-y-auto px-3 space-y-1.5 pb-3">
            {coaches.map(c => (
              <button key={c.id} onClick={() => selectCoach(c)}
                className="w-full text-left bg-neutral-700 active:bg-neutral-600 rounded-md px-4 py-3 font-display text-lg tracking-wider uppercase">
                {c.name}
              </button>
            ))}
            {coaches.length === 0 && (
              <p className="text-center text-gray-500 italic py-4">Aún no se ha cargado el programa</p>
            )}
          </div>
        </div>
      ) : (
        <>
          {showAwards ? (
            <div className="flex-1 min-h-0 flex flex-col px-4 text-center bg-gradient-to-b from-fuchsia-500 via-fuchsia-500 to-fuchsia-500 text-white">
              <div className="pt-14 animate-pulse">
                <p className="font-display text-7xl leading-none uppercase tracking-wide">Premiación</p>
                <p className="font-display text-7xl leading-none uppercase tracking-wide mt-2">De Bloque</p>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center animate-pulse">
                <p className="font-display text-6xl leading-tight uppercase tracking-wide">Dirígete al escenario</p>
                <p className="font-display text-6xl leading-tight uppercase tracking-wide mt-4">y sube</p>
              </div>
            </div>
          ) : (
            <>
              {/* EN ESCENARIO arriba */}
              <div className="bg-fuchsia-500 text-white px-3 py-3 shrink-0 text-center">
                {current ? (
                  <>
                    <p className="font-display text-xs tracking-[0.4em] opacity-80 leading-none">EN ESCENARIO · #{String(event.current_position).padStart(2, '0')}</p>
                    <p className="font-display text-3xl uppercase leading-tight mt-2 break-words">{current.name}</p>
                    <p className="font-display text-xs uppercase opacity-70 leading-tight mt-2">
                      {[current.academy, current.category, current.type].filter(Boolean).join(' · ')}
                    </p>
                  </>
                ) : event.current_position === 0 ? (
                  <p className="font-display text-3xl py-2">POR INICIAR</p>
                ) : (
                  <p className="font-display text-2xl py-2">— PROGRAMA TERMINADO —</p>
                )}
              </div>

              {/* SIGUIENTE label */}
              <div className="bg-neutral-900 border-b border-neutral-700/60 text-center py-1.5 shrink-0">
                <span className="font-display text-xl tracking-[0.4em]">SIGUIENTE</span>
              </div>

              {/* Lista — todos GRIS, dinámico al tamaño */}
              <div ref={listRef} className="flex-1 min-h-0 overflow-hidden px-2 pt-1 pb-1 flex flex-col gap-1">
                {upcomingAll.length === 0 ? (
                  <p className="text-center text-gray-500 italic py-4">No quedan más turnos</p>
                ) : (
                  upcomingAll.slice(0, listFit).map(p => (
                    <Pill key={p.id} p={p} mine={p.coach_id === coach.id} grow />
                  ))
                )}
              </div>

              {/* Tarjeta grande con próximo turno del coach */}
              {(() => {
                if (!nextMine) {
                  return (
                    <div className="bg-neutral-950 border-t-2 border-neutral-800 px-4 py-5 shrink-0 text-center">
                      <p className="font-display text-base tracking-widest text-gray-500 leading-none">YA NO TIENES TURNOS PENDIENTES</p>
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
                    <div className="bg-green-500 text-black px-4 py-5 shrink-0 text-center animate-pulse">
                      <p className="font-display text-base tracking-widest leading-none opacity-80">TU PRÓXIMO TURNO</p>
                      <p className="font-display text-5xl uppercase leading-none mt-3">¡ES TU TURNO!</p>
                      <p className="font-display text-3xl uppercase leading-none mt-2">#{nextMine.position} · {nextMine.name}</p>
                    </div>
                  )
                }
                if (onDeck) {
                  return (
                    <div className="bg-orange-500 text-white px-4 py-4 shrink-0 animate-pulse">
                      <p className="font-display text-sm tracking-widest leading-none opacity-90 text-center">TU PRÓXIMO TURNO</p>
                      <div className="flex items-center gap-3 mt-3">
                        <ArrowUpRight className="w-20 h-20 text-[#DFFF00] shrink-0 drop-shadow-[0_0_10px_#DFFF00]" strokeWidth={3} />
                        <div className="flex-1 min-w-0">
                          <p className="font-display text-3xl leading-none">
                            <span className="opacity-80">#{nextMine.position}</span> {nextMine.name}
                          </p>
                          <p className="font-display text-sm uppercase opacity-80 leading-tight mt-1 truncate">
                            {[nextMine.category, nextMine.academy].filter(Boolean).join(' · ')}
                          </p>
                          <p className="font-display text-xl tracking-wider leading-none mt-2">
                            SUBES EN {etaStage ? etaStage : `${turnsToStage} TURNO${turnsToStage === 1 ? '' : 'S'}`}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                }
                return (
                  <div className="bg-fuchsia-500 text-white px-4 py-4 shrink-0">
                    <p className="font-display text-sm tracking-widest leading-none opacity-80 text-center">TU PRÓXIMO TURNO</p>
                    <div className="flex items-baseline gap-3 mt-2">
                      <p className="font-display text-5xl leading-none shrink-0">#{nextMine.position}</p>
                      <div className="flex-1 min-w-0">
                        <p className="font-display text-2xl uppercase leading-none truncate">{nextMine.name}</p>
                        <p className="font-display text-base uppercase leading-tight opacity-70 truncate">
                          {[nextMine.category, nextMine.academy].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 border-t border-black/20 pt-2 text-center">
                      <p className="font-display text-xl tracking-wider leading-none">
                        VE A WAIT ZONE EN {etaWait ? etaWait : `${turnsToWait} TURNO${turnsToWait === 1 ? '' : 'S'}`}
                      </p>
                    </div>
                  </div>
                )
              })()}
            </>
          )}

          {/* Buttons — mismos colores y tamaño que ATRÁS/SIGUIENTE */}
          <div className="flex shrink-0">
            <button onClick={() => setModal('mine')} className="flex-1 bg-red-500 active:bg-red-600 text-white py-3 font-display text-2xl">
              MIS TURNOS
            </button>
            <button onClick={() => setModal('full')} className="flex-1 bg-green-500 active:bg-green-600 text-black py-3 font-display text-2xl">
              PROGRAMA COMPLETO
            </button>
          </div>
        </>
      )}

      {/* Modal */}
      {modal && event && coach && (
        <div className="fixed inset-0 bg-neutral-900 z-50 flex flex-col">
          <div className="bg-black px-4 py-3 flex items-center justify-between shrink-0">
            <h3 className="font-display text-2xl tracking-widest text-fuchsia-500">
              {modal === 'mine' ? 'MIS TURNOS' : 'PROGRAMA'}
            </h3>
            <button onClick={() => setModal(null)}><X className="w-6 h-6" /></button>
          </div>
          {modal === 'mine' ? (
            <div ref={mineRef} className="flex-1 min-h-0 overflow-hidden p-2 flex flex-col gap-1">
              {myList.length === 0 ? (
                <p className="text-center text-gray-500 italic py-6">No tienes participaciones</p>
              ) : (
                myList.slice(0, mineFit).map(p => {
                  const isOnStage = event.current_position === p.position
                  const done = p.position < event.current_position
                  return <Pill key={p.id} p={p} onStage={isOnStage} done={done} grow />
                })
              )}
            </div>
          ) : (
            <>
              <SearchBar value={search} onChange={setSearch} />
              <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                {(() => {
                  if (fullList.length === 0) return <p className="text-center text-gray-500 italic py-6">Sin programa</p>
                  const filtered = fullList.filter(p => participantMatches(p, search))
                  if (filtered.length === 0) return <p className="text-center text-gray-500 italic py-6">Sin resultados</p>
                  return filtered.map(p => {
                    const isOnStage = event.current_position === p.position
                    const done = p.position < event.current_position
                    const mine = p.coach_id === coach.id
                    return <Pill key={p.id} p={p} onStage={isOnStage} done={done} mine={mine} />
                  })
                })()}
              </div>
            </>
          )}
        </div>
      )}

    </div>
  )
}

function Pill({ p, mine, onStage, done, grow }: { p: Participant, mine?: boolean, onStage?: boolean, done?: boolean, grow?: boolean }) {
  const bg =
    onStage ? 'bg-fuchsia-500 text-white' :
    done ? 'bg-neutral-800/60 opacity-40' :
    mine ? 'bg-purple-800' :
    'bg-neutral-700'
  return (
    <div className={`w-full rounded-md px-3 py-1.5 flex items-center gap-2 ${bg} ${grow ? 'flex-1 min-h-0' : ''}`}>
      <span className="font-display text-base shrink-0 w-10 text-center leading-none opacity-75">#{p.position}</span>
      <p className="flex-1 min-w-0 font-display text-2xl uppercase truncate leading-none text-center">{p.name}</p>
      <div className="shrink-0 leading-none text-right max-w-[30%]">
        {p.academy && <p className="font-display text-sm uppercase truncate">{p.academy}</p>}
        {p.category && <p className="font-display text-[10px] uppercase opacity-70 truncate mt-1">{p.category}</p>}
      </div>
    </div>
  )
}
