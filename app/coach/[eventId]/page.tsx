'use client'
import { useEffect, useState, use, useCallback, useRef } from 'react'
import Image from 'next/image'
import { supabase, Participant, Event, Coach } from '@/lib/supabase'
import { ChevronLeft, X, MessageSquare, ShieldAlert, Shirt, HelpCircle, UserCheck, Star, HeartPulse, Search } from 'lucide-react'
import { participantMatches } from '@/lib/search'
import { getAvgPerTurnMs, etaLabel } from '@/lib/eta'
import { syncServerTime, serverNow } from '@/lib/serverTime'
import { subscribePortalConfig, PortalConfig } from '@/lib/portalConfig'
import PortalLockout from '@/components/PortalLockout'

type Props = { params: Promise<{ eventId: string }> }

const STORAGE_KEY = (eventId: string) => `d4e:coach:${eventId}`

export default function CoachPage({ params }: Props) {
  const { eventId } = use(params)
  const [event, setEvent] = useState<Event | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [coachId, setCoachId] = useState<string | null>(null)
  const [showOnlyMine, setShowOnlyMine] = useState(false)
  const [search, setSearch] = useState('')
  const [alertedAt, setAlertedAt] = useState<number | null>(null)
  const [, setTick] = useState(0)
  const [activeAnnouncement, setActiveAnnouncement] = useState('')
  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null)

  // Chat / Alertas Rápidas
  interface ChatMessage {
    id: string
    sender: 'staff' | 'presenter' | 'coach'
    senderName: string
    text: string
    timestamp: number
    isCritical?: boolean
  }
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const [showChatDrawer, setShowChatDrawer] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [activeCriticalAlert, setActiveCriticalAlert] = useState<ChatMessage | null>(null)
  
  const broadcastRef = useRef<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (showChatDrawer) {
      setUnreadChatCount(0)
      scrollToBottom()
    }
  }, [showChatDrawer, chatMessages])

  // Repeating warning alarm for critical alert HUD
  useEffect(() => {
    if (!activeCriticalAlert) return
    const playWarning = () => {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        if (AudioContextClass) {
          const ctx = new AudioContextClass()
          const now = ctx.currentTime
          const osc1 = ctx.createOscillator()
          const osc2 = ctx.createOscillator()
          const gain = ctx.createGain()
          
          osc1.connect(gain)
          osc2.connect(gain)
          gain.connect(ctx.destination)
          
          osc1.type = 'sawtooth'
          osc1.frequency.setValueAtTime(600, now)
          osc1.frequency.linearRampToValueAtTime(800, now + 0.4)
          
          osc2.type = 'sine'
          osc2.frequency.setValueAtTime(1200, now)
          osc2.frequency.linearRampToValueAtTime(1000, now + 0.4)
          
          gain.gain.setValueAtTime(0, now)
          gain.gain.linearRampToValueAtTime(0.4, now + 0.05)
          gain.gain.linearRampToValueAtTime(0.01, now + 0.4)
          
          osc1.start(now)
          osc1.stop(now + 0.4)
          osc2.start(now)
          osc2.stop(now + 0.4)
        }
      } catch (e) {
        console.error(e)
      }
    }
    playWarning()
    const interval = setInterval(playWarning, 1200)
    return () => clearInterval(interval)
  }, [activeCriticalAlert])

  const sendChatMessage = (text: string, isCritical = false) => {
    if (!text.trim() || !broadcastRef.current) return
    const currentCoach = coaches.find(c => c.id === coachId)
    const msg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9) + '-' + Date.now(),
      sender: 'coach',
      senderName: currentCoach ? currentCoach.name : 'Coach',
      text: text.trim(),
      timestamp: Date.now(),
      isCritical
    }
    broadcastRef.current.send({
      type: 'broadcast',
      event: 'quick_message',
      payload: msg
    })
    setChatInput('')
  }

  useEffect(() => {
    syncServerTime()
    const sync = setInterval(syncServerTime, 5 * 60 * 1000)
    const tick = setInterval(() => setTick(t => t + 1), 30000)
    return () => { clearInterval(sync); clearInterval(tick) }
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
    broadcastRef.current = ch
    
    ch.on('broadcast', { event: 'announcement' }, (payload) => {
      const text = payload.payload.text || ''
      setActiveAnnouncement(text)
      if (text) {
        try {
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            navigator.vibrate([200, 100, 200])
          }
        } catch (e) {
          console.warn('Vibration failed:', e)
        }
      }
    })

    ch.on('broadcast', { event: 'quick_message' }, (payload) => {
      const msg = payload.payload as ChatMessage
      if (!msg) return
      
      setChatMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev
        return [...prev, msg]
      })

      setShowChatDrawer(isOpen => {
        if (!isOpen) {
          setUnreadChatCount(c => c + 1)
        }
        return isOpen
      })

      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          if (msg.isCritical) {
            navigator.vibrate([500, 250, 500, 250, 500])
          } else {
            navigator.vibrate([200])
          }
        }
      } catch (e) {
        console.warn('Vibration failed:', e)
      }

      if (msg.isCritical) {
        setActiveCriticalAlert(msg)
      }

      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        if (AudioContextClass) {
          const ctx = new AudioContextClass()
          const now = ctx.currentTime
          if (msg.isCritical) {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.type = 'sawtooth'
            osc.frequency.setValueAtTime(987.77, now) // B5
            gain.gain.setValueAtTime(0, now)
            gain.gain.linearRampToValueAtTime(0.4, now + 0.05)
            gain.gain.linearRampToValueAtTime(0.01, now + 0.6)
            osc.start(now)
            osc.stop(now + 0.6)
          } else {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.type = 'sine'
            osc.frequency.setValueAtTime(659.25, now) // E5
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.1) // A5
            gain.gain.setValueAtTime(0, now)
            gain.gain.linearRampToValueAtTime(0.25, now + 0.01)
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)
            osc.start(now)
            osc.stop(now + 0.15)
          }
        }
      } catch (e) {
        console.error('AudioContext message beep error:', e)
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
    setShowOnlyMine(false)
    if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY(eventId))
  }

  const myList = coach ? participants.filter(p => p.coach_id === coach.id) : []
  const hasPerformed = event && coach
    ? myList.some(p => p.position > 0 && p.position < event.current_position)
    : false
  const showAwards = !!(event?.awards_mode && hasPerformed)

  // Filter list of participants to display on main screen
  const displayParticipants = participants.filter(p => {
    if (showOnlyMine) {
      return p.coach_id === (coach?.id ?? '')
    }
    return p.position > (event?.current_position ?? 0)
  }).filter(p => participantMatches(p, search))

  if (portalConfig && !portalConfig.enableOperations) {
    return <PortalLockout portalName="Operativo (Coach)" />
  }

  return (
      <div 
        className={`text-white flex flex-col select-none relative ${
          showChatDrawer || showAwards 
            ? 'h-[100dvh] max-h-[100dvh] overflow-hidden' 
            : 'min-h-[100dvh]'
        }`} 
        style={{
          background: '#000000',
        }}
      >
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
            border-b: 1px solid rgba(255, 255, 255, 0.05);
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
          .boxless-item {
            background: transparent;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            transition: all 0.2s ease;
          }
          .boxless-item-onstage {
            background: linear-gradient(to right, rgba(234, 179, 8, 0.1) 0%, transparent 100%);
            border-bottom: 1px solid rgba(234, 179, 8, 0.5);
          }
          .boxless-item-mine {
            background: linear-gradient(to right, rgba(6, 182, 212, 0.1) 0%, transparent 100%);
            border-bottom: 1px solid rgba(6, 182, 212, 0.45);
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
            background: rgba(16, 185, 129, 0.08);
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            border: 1.5px solid rgba(16, 185, 129, 0.4);
            border-radius: 18px;
            box-shadow: 0 8px 32px 0 rgba(16, 185, 129, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1);
            color: #ffffff;
            z-index: 10;
          }
          .next-turn-card-deck {
            background: rgba(245, 158, 11, 0.08);
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            border: 1.5px solid rgba(245, 158, 11, 0.4);
            border-radius: 18px;
            box-shadow: 0 8px 32px 0 rgba(245, 158, 11, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1);
            color: #ffffff;
            z-index: 10;
          }
          .next-turn-card-standard {
            background: rgba(14, 165, 233, 0.08);
            backdrop-filter: blur(30px);
            -webkit-backdrop-filter: blur(30px);
            border: 1.5px solid rgba(14, 165, 233, 0.4);
            border-radius: 18px;
            box-shadow: 0 8px 32px 0 rgba(14, 165, 233, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1);
            color: #ffffff;
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
          @keyframes logo-3d-float {
            0%, 100% {
              transform: translateY(0px) rotateY(-10deg);
            }
            50% {
              transform: translateY(-4px) rotateY(10deg);
            }
          }
          .animate-logo-3d {
            transform-style: preserve-3d;
            perspective: 1000px;
            animation: logo-3d-float 6s ease-in-out infinite;
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
        <header 
          className="apple-glass-header px-4 flex items-center gap-3 shrink-0 relative z-20"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.875rem)',
            paddingBottom: '0.875rem'
          }}
        >
          {coach ? (
            <button onClick={logout} className="flex items-center gap-1.5 min-w-0 flex-1 shrink text-left active:opacity-75 transition-opacity">
              <ChevronLeft className="w-7 h-7 text-neutral-400 shrink-0" />
              <div className="flex flex-col min-w-0">
                <h1 className="font-display text-lg tracking-[0.1em] text-white truncate uppercase leading-none font-bold">
                  {myList.length > 0 && myList[0].academy ? myList[0].academy.split('(')[0].trim() : coach.name}
                </h1>
                <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5">Portal Coach</span>
              </div>
            </button>
          ) : (
            <h1 className="flex-1 min-w-0 font-display text-2xl tracking-[0.15em] text-white truncate uppercase leading-none font-bold">COACH</h1>
          )}
          {coach && (
            <div className="flex items-center gap-3.5 shrink-0">
              <button
                onClick={() => setShowOnlyMine(!showOnlyMine)}
                className={`transition-all p-2 rounded-full border ${
                  showOnlyMine 
                    ? 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10 shadow-[0_0_12px_rgba(6,182,212,0.25)]' 
                    : 'text-zinc-400 border-zinc-800 bg-zinc-900/40 hover:text-white'
                } active:scale-95`}
                title="Mis turnos"
              >
                <Star className={`w-5 h-5 ${showOnlyMine ? 'fill-current' : ''}`} />
              </button>
              <button
                onClick={() => setShowChatDrawer(true)}
                className="text-zinc-400 hover:text-white transition-all p-2 rounded-full border border-zinc-800 bg-zinc-900/40 relative active:scale-95"
                title="Chat / Alertas rápidas"
              >
                <MessageSquare className="w-5 h-5" />
                {unreadChatCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white font-bold text-[9px] w-4 h-4 rounded-full flex items-center justify-center animate-bounce">
                    {unreadChatCount}
                  </span>
                )}
              </button>
            </div>
          )}
          <div className="animate-logo-3d shrink-0 relative">
            <Image src="/logo.png" alt="Dance4ever" width={42} height={29} priority className="opacity-95" />
          </div>
        </header>

        {!event ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500 z-10">Cargando…</div>
        ) : !coach ? (
          <div className="flex-1 min-h-0 flex flex-col relative z-10 p-4">
            <p className="text-center font-display text-xs tracking-[0.3em] text-zinc-400 py-3 shrink-0 font-bold">ELIGE TU ACADEMIA / EQUIPO</p>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-4">
              {(() => {
                const mapped = coaches.map(c => {
                  const firstPart = participants.find(p => p.coach_id === c.id)
                  const displayName = firstPart && firstPart.academy
                    ? firstPart.academy.split('(')[0].trim()
                    : c.name
                  return { coach: c, displayName }
                })
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
          <main className="flex-1 flex flex-col relative z-10 px-0 pb-0">
            {showAwards ? (
              <div className="py-12 px-4 flex flex-col items-center justify-center text-center bg-zinc-950 text-white z-10">
                <div className="animate-pulse">
                  <p className="font-display text-5xl leading-none uppercase tracking-wide font-black">Premiación</p>
                  <p className="font-display text-5xl leading-none uppercase tracking-wide mt-2 font-black text-neutral-400">De Bloque</p>
                </div>
                <div className="flex flex-col items-center justify-center animate-pulse mt-8">
                  <p className="font-display text-2xl leading-tight uppercase tracking-wide text-zinc-300">Dirígete al escenario</p>
                  <p className="font-display text-2xl leading-tight uppercase tracking-wide mt-1 text-zinc-500">y sube al podio</p>
                </div>
              </div>
            ) : (
              <>
                {/* Active Stage display */}
                <div className={`${current ? 'gold-card text-black' : 'neutral-header-card text-white'} px-4 py-4 shrink-0 text-center relative overflow-hidden`}>
                  {current ? (() => {
                    const isGrupal = (current.type || '').trim().toLowerCase() === 'grupal';
                    const academyShort = current.academy ? current.academy.split('(')[0].trim() : '';
                    return (
                      <>
                        <p className="font-display text-xs tracking-[0.3em] text-black/60 font-bold uppercase leading-none gold-pulse">EN ESCENARIO · #{String(event.current_position).padStart(2, '0')}</p>
                        <p className="font-display text-xs tracking-wider text-black/70 font-bold uppercase mt-1.5 leading-none">
                          {formatSubtitle(current, false)}
                        </p>
                        <p className="font-display text-3xl uppercase leading-tight mt-2.5 text-black break-words font-extrabold">{extractDancerName(current)}</p>
                        {!isGrupal && academyShort && (
                          <p className="font-display text-[13px] uppercase opacity-80 leading-tight mt-1 text-black/90">
                            {academyShort}
                          </p>
                        )}
                      </>
                    );
                  })() : event.current_position === 0 ? (
                    <p className="font-display text-xl py-1 text-zinc-400 uppercase tracking-widest font-bold">POR INICIAR</p>
                  ) : (
                    <p className="font-display text-lg py-1 text-zinc-600 uppercase tracking-widest font-bold">— PROGRAMA TERMINADO —</p>
                  )}
                </div>


                {/* Main scrollable list of participants */}
                <div className="flex flex-col" style={{ paddingBottom: '160px' }}>
                  {displayParticipants.length > 0 ? (
                    <div className="flex flex-col">
                      {(() => {
                        const rendered: React.ReactNode[] = []
                        let lastCategory = ''
                        let lastSubgroup = ''

                        displayParticipants.forEach(p => {
                          const cat = p.category ? p.category.split('|')[0].trim().toUpperCase() : 'OPEN'
                          const mod = p.type ? p.type.toUpperCase() : ''
                          const styleLabel = p.style ? p.style.toUpperCase() : ''
                          const subgroup = [mod, styleLabel].filter(Boolean).join(' · ')

                          if (cat !== lastCategory) {
                            rendered.push(
                              <div key={`cat-div-${p.id}`} className="flex items-center gap-2 px-4 pt-5 pb-1 select-none opacity-60">
                                <div className="h-[1px] flex-1 bg-zinc-800/80" />
                                <span className="font-display text-[9px] tracking-[0.25em] text-zinc-400 uppercase font-black px-1">{cat}</span>
                                <div className="h-[1px] flex-1 bg-zinc-800/80" />
                              </div>
                            )
                            lastCategory = cat
                            lastSubgroup = ''
                          }

                          if (subgroup && subgroup !== lastSubgroup) {
                            rendered.push(
                              <div key={`sub-div-${p.id}`} className="flex items-center gap-2 px-4 pt-3.5 pb-0.5 select-none opacity-40">
                                <div className="h-[1px] w-3 bg-zinc-800/60" />
                                <span className="text-[8px] text-zinc-500 uppercase font-extrabold tracking-widest">{subgroup}</span>
                                <div className="h-[1px] flex-1 bg-zinc-800/40" />
                              </div>
                            )
                            lastSubgroup = subgroup
                          }

                          const isCurrent = p.position === event.current_position
                          const done = p.position < event.current_position
                          const isMine = p.coach_id === coach.id

                          rendered.push(
                            <Pill key={p.id} p={p} mine={isMine} onStage={isCurrent} done={done} />
                          )
                        })

                        return rendered
                      })()}
                    </div>
                  ) : (
                    <div className="text-center text-zinc-600 italic py-12">
                      {showOnlyMine ? 'No tienes turnos programados en este bloque' : 'No quedan más turnos'}
                    </div>
                  )}
                </div>

                {/* Sticky Bottom Turn Indicator */}
                <div 
                  className="fixed bottom-0 inset-x-0 z-20 px-4 pb-safe bg-gradient-to-t from-black via-black/95 to-transparent pt-6 pointer-events-none"
                >
                  <div className="max-w-md mx-auto w-full pointer-events-auto">
                    {(() => {
                      if (!nextMine) {
                        return (
                          <div className="apple-glass-card px-4 py-4 text-center mb-3">
                            <p className="font-display text-[10px] tracking-widest text-zinc-500 leading-none font-bold uppercase">YA NO TIENES TURNOS PENDIENTES</p>
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
                          <div className="next-turn-card-stage px-4 py-4 relative overflow-hidden mb-3 animate-pulse text-white">
                            <p className="font-display text-[9px] tracking-[0.25em] leading-none text-emerald-400/90 font-bold uppercase text-center">TU PRÓXIMO TURNO</p>
                            <div className="flex items-center gap-3.5 mt-2.5">
                              <div className="flex flex-col items-center justify-center shrink-0 w-12 h-12 rounded-xl bg-emerald-50/20 border border-emerald-500/30 text-white">
                                <span className="font-display text-[8px] tracking-wider leading-none opacity-75 font-bold uppercase mb-0.5">TURNO</span>
                                <span className="font-display text-xl leading-none font-black tabular-nums">#{nextMine.position}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-display text-sm uppercase leading-none text-emerald-400 font-black">¡ES TU TURNO!</p>
                                <p className="font-display text-base uppercase truncate leading-tight text-white font-bold mt-1.5">{extractDancerName(nextMine)}</p>
                                <p className="font-display text-[10px] uppercase leading-none opacity-85 mt-1 text-white/70">
                                  {formatSubtitle(nextMine, false)}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      }
                      if (onDeck) {
                        return (
                          <div className="next-turn-card-deck px-4 py-4 relative overflow-hidden mb-3 animate-pulse text-white">
                            <p className="font-display text-[9px] tracking-[0.25em] leading-none text-amber-400/95 font-bold uppercase text-center">TU PRÓXIMO TURNO</p>
                            <div className="flex items-center gap-3.5 mt-2.5">
                              <div className="flex flex-col items-center justify-center shrink-0 w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 text-white">
                                <span className="font-display text-[8px] tracking-wider leading-none opacity-75 font-bold uppercase mb-0.5">TURNO</span>
                                <span className="font-display text-xl leading-none font-black tabular-nums">#{nextMine.position}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-display text-base uppercase truncate leading-tight text-white font-bold">{extractDancerName(nextMine)}</p>
                                <p className="font-display text-[10px] uppercase leading-none opacity-85 mt-1 text-white/70">
                                  {formatSubtitle(nextMine, false)}
                                </p>
                                <p className="font-display text-xs tracking-wider leading-none mt-2 text-amber-400 font-bold uppercase">
                                  SUBES EN {etaStage ? etaStage : `${turnsToStage} TURNO${turnsToStage === 1 ? '' : 'S'}`}
                                </p>
                              </div>
                            </div>
                          </div>
                        )
                      }
                      return (
                        <div className="next-turn-card-standard px-4 py-4 relative overflow-hidden mb-3 text-white">
                          <p className="font-display text-[9px] tracking-[0.25em] leading-none text-sky-400/90 font-bold uppercase text-center">TU PRÓXIMO TURNO</p>
                          <div className="flex items-center gap-3.5 mt-2.5">
                            <div className="flex flex-col items-center justify-center shrink-0 w-12 h-12 rounded-xl bg-sky-500/20 border border-sky-500/30 text-white">
                              <span className="font-display text-[8px] tracking-wider leading-none opacity-75 font-bold uppercase mb-0.5">TURNO</span>
                              <span className="font-display text-xl leading-none font-black tabular-nums">#{nextMine.position}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-display text-base uppercase truncate leading-tight text-white font-bold">{extractDancerName(nextMine)}</p>
                              <p className="font-display text-[10px] uppercase leading-none opacity-85 mt-1 text-white/70">
                                {formatSubtitle(nextMine, false)}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2.5 border-t border-sky-500/20 pt-2 text-center">
                            <p className="font-display text-xs tracking-wider leading-none text-sky-300 font-bold uppercase">
                              VE A PREPARACIÓN EN {etaWait ? etaWait : `${turnsToWait} TURNO${turnsToWait === 1 ? '' : 'S'}`}
                            </p>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </>
            )}
          </main>
        )}

        {/* Chat Drawer Overlay */}
        {showChatDrawer && (
          <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-xs transition-opacity duration-300" onClick={() => setShowChatDrawer(false)} />
        )}
        <div className={`fixed right-0 top-0 bottom-0 z-50 w-80 md:w-96 bg-zinc-950/95 border-l border-white/10 flex flex-col backdrop-blur-md transition-transform duration-300 ease-out ${showChatDrawer ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="bg-black/30 px-4 py-3.5 flex items-center justify-between shrink-0 border-b border-white/5">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-yellow-400" />
              <h3 className="font-display text-base tracking-widest text-white font-bold uppercase">Chat & Alertas</h3>
            </div>
            <button onClick={() => setShowChatDrawer(false)} className="p-1 hover:text-zinc-400 transition-colors text-zinc-400" aria-label="Cerrar"><X className="w-6 h-6" /></button>
          </div>
          
          {/* Chat Messages */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600 italic text-sm">
                <span>Sin mensajes aún</span>
                <span className="text-xs mt-1">Usa los botones rápidos de abajo</span>
              </div>
            ) : (
              chatMessages.map((msg) => {
                const isMe = msg.sender === 'coach'
                const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                let senderColorClass = 'text-yellow-400'
                let bubbleClass = 'bg-white/5 border border-white/5'
                
                if (msg.sender === 'staff') {
                  senderColorClass = 'text-fuchsia-400'
                  bubbleClass = 'bg-fuchsia-950/20 border border-fuchsia-500/20'
                } else if (msg.sender === 'presenter') {
                  senderColorClass = 'text-cyan-400'
                  bubbleClass = 'bg-cyan-950/20 border border-cyan-500/20'
                } else if (msg.sender === 'coach') {
                  senderColorClass = 'text-emerald-400'
                  bubbleClass = 'bg-emerald-950/20 border border-emerald-500/20'
                }
                
                if (msg.isCritical) {
                  bubbleClass = 'bg-red-950/30 border-2 border-red-500 animate-pulse-slow'
                }
                
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <span className={`text-[10px] font-bold tracking-wider uppercase ${senderColorClass}`}>
                        {msg.senderName}
                      </span>
                      <span className="text-[9px] text-zinc-500">{timeStr}</span>
                    </div>
                    <div className={`rounded-2xl px-3.5 py-2 max-w-[85%] text-sm break-words ${bubbleClass}`}>
                      {msg.isCritical && <span className="font-bold text-red-500 mr-1">[CRÍTICO]</span>}
                      {msg.text}
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick-Action Presets */}
          <div className="p-3 bg-black/40 border-t border-white/5 shrink-0">
            <span className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase block mb-2 px-1">Mensajes Rápidos (Coach)</span>
            <div className="grid grid-cols-2 gap-1.5 flex-wrap">
              {[
                { text: '¡Solicitar Paramédico!', isCritical: true, icon: HeartPulse },
                { text: 'Emergencia Camerinos', isCritical: true, icon: ShieldAlert },
                { text: 'Falla con Vestuario', isCritical: false, icon: Shirt },
                { text: 'Duda de Orden', isCritical: false, icon: HelpCircle },
                { text: 'Danzante Listo', isCritical: false, icon: UserCheck },
              ].map((preset, idx) => {
                const Icon = preset.icon
                return (
                  <button
                    key={idx}
                    onClick={() => sendChatMessage(preset.text, preset.isCritical)}
                    className={`text-xs font-semibold py-2 px-2.5 rounded-xl border transition-all duration-200 active:scale-95 flex items-center justify-center gap-1.5 text-center ${
                      preset.isCritical
                        ? 'bg-red-950/40 hover:bg-red-900/40 text-red-300 border-red-500/30 hover:border-red-500 col-span-2'
                        : 'bg-white/5 hover:bg-white/10 text-zinc-300 border-white/5 hover:border-white/20'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{preset.text}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Custom Input */}
          <div className="p-3 bg-zinc-950 border-t border-white/10 shrink-0 pb-safe">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                sendChatMessage(chatInput)
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Escribe un message..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500/50 transition-colors placeholder:text-zinc-500"
              />
              <button
                type="submit"
                className="bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-xs px-4 rounded-xl transition-all duration-200 active:scale-95 uppercase tracking-wider shrink-0"
              >
                Enviar
              </button>
            </form>
          </div>
        </div>

        {/* Critical HUD Overlay */}
        {activeCriticalAlert && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-red-950/95 p-6 text-center select-none animate-pulse-slow">
            <div className="absolute inset-0 bg-red-900/20 animate-ping opacity-30 pointer-events-none" />
            <div className="relative max-w-lg w-full space-y-8 p-8 rounded-3xl border-3 border-red-500 bg-black/80 shadow-2xl backdrop-blur-xl">
              <div className="space-y-3">
                <span className="text-red-500 font-display font-black text-xl tracking-[0.3em] uppercase block">
                  ALERTA CRÍTICA
                </span>
                <span className="text-zinc-400 text-xs font-semibold tracking-wider uppercase block">
                  De: {activeCriticalAlert.senderName}
                </span>
              </div>
              <p className="text-white font-display font-bold text-3xl md:text-4.5xl leading-tight uppercase tracking-wide break-words">
                {activeCriticalAlert.text}
              </p>
              <div className="pt-4">
                <button
                  onClick={() => setActiveCriticalAlert(null)}
                  className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-display font-black tracking-widest text-lg rounded-2xl border-2 border-red-400 transition-all duration-200 active:scale-95 shadow-lg shadow-red-900/50 uppercase"
                >
                  ENTENDIDO / ACUSAR RECIBO
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
  )
}

function extractDancerName(p: Participant): string {
  const type = (p.type || '').trim().toLowerCase()
  if (type === 'grupal') return p.academy || p.name
  if (!p.academy || !p.name) return p.name

  const escaped = p.academy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp('^' + escaped + '\\s*[-–(]\\s*', 'i')
  const result = p.name.replace(pattern, '').replace(/\)\s*$/, '').trim()
  if (result && result.toLowerCase() !== p.academy.toLowerCase()) return result

  const parenMatch = p.name.match(/\(([^)]+)\)/)
  if (parenMatch) return parenMatch[1].trim()

  return p.name
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

function Pill({ p, mine, onStage, done }: { p: Participant, mine?: boolean, onStage?: boolean, done?: boolean }) {
  const bg =
    onStage ? 'boxless-item-onstage' :
    done ? 'boxless-item-done' :
    mine ? 'boxless-item-mine' :
    'boxless-item'
  const dancerName = extractDancerName(p)
  const subtitle = formatSubtitle(p)

  const numberColor = 
    onStage ? 'text-yellow-400 font-extrabold' :
    done ? 'text-zinc-650' :
    mine ? 'text-cyan-400 font-bold' :
    'text-zinc-500 font-semibold'

  const titleColor =
    onStage ? 'text-yellow-400 font-bold' :
    done ? 'text-zinc-550' :
    mine ? 'text-cyan-200' :
    'text-white'

  const subtitleColor =
    onStage ? 'text-yellow-200/50' :
    done ? 'text-zinc-700' :
    mine ? 'text-cyan-300/40' :
    'text-zinc-400/80'

  const separatorColor =
    onStage ? 'border-yellow-500/50' :
    done ? 'border-white/5' :
    mine ? 'border-cyan-500/45' :
    'border-white/15'

  return (
    <div className={`w-full flex items-center ${bg} shrink-0 min-h-[48px] transition-all duration-200 z-10 overflow-hidden`}>
      <div className={`shrink-0 w-12 py-3 flex items-center justify-center border-r border-dotted ${separatorColor}`}>
        <span className={`font-display text-xl leading-none tabular-nums ${numberColor}`}>
          #{p.position}
        </span>
      </div>
      <div className="flex-1 min-w-0 pl-3.5 pr-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className={`font-display text-xl uppercase break-words leading-tight flex-1 ${titleColor}`}>{dancerName}</p>
          {mine && (
            <span className="text-[8px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.5 rounded-full uppercase shrink-0 tracking-wider animate-pulse">
              Mi Equipo
            </span>
          )}
        </div>
        <p className={`font-display text-xs uppercase opacity-85 truncate mt-1 ${subtitleColor}`}>{subtitle}</p>
      </div>
    </div>
  )
}
