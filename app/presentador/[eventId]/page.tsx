'use client'
import { useEffect, useState, use, useCallback, useRef } from 'react'
import Image from 'next/image'
import { supabase, Participant, Event } from '@/lib/supabase'
import { X, ChevronLeft, ChevronRight, Star, MessageSquare, MicOff, HelpCircle, CheckCircle, Clock, HeartPulse, AlertTriangle } from 'lucide-react'
import { subscribePortalConfig, PortalConfig } from '@/lib/portalConfig'
import PortalLockout from '@/components/PortalLockout'

type Props = { params: Promise<{ eventId: string }> }

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

export default function PresentadorPage({ params }: Props) {
  const { eventId } = use(params)
  const [event, setEvent] = useState<Event | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [notFound, setNotFound] = useState(false)
  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null)

  const [activeAnnouncement, setActiveAnnouncement] = useState('')
  const [audioUnlocked, setAudioUnlocked] = useState(false)

  // Alerta de doble avance
  const [doubleAdvanceAlert, setDoubleAdvanceAlert] = useState(false)
  const [isAlertClosing, setIsAlertClosing] = useState(false)
  const lastNextPressRef = useRef<number | null>(null)
  const alertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismissAlert = useCallback(() => {
    setIsAlertClosing(true)
    if (alertTimeoutRef.current) {
      clearTimeout(alertTimeoutRef.current)
      alertTimeoutRef.current = null
    }
    setTimeout(() => {
      setDoubleAdvanceAlert(false)
      setIsAlertClosing(false)
    }, 250) // 250ms matches the animation duration
  }, [])

  const [isAdvancing, setIsAdvancing] = useState(false)
  const [isTogglingAwards, setIsTogglingAwards] = useState(false)
  const [confirmAwards, setConfirmAwards] = useState(false)

  // Cronómetro
  const [advancedAt, setAdvancedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)

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
    const msg: ChatMessage = {
      id: Math.random().toString(36).substring(2, 9) + '-' + Date.now(),
      sender: 'presenter',
      senderName: 'Presentador',
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

  function formatElapsed(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  function dedupInfo(p: Participant) {
    const isGrupal = (p.type || '').trim().toLowerCase() === 'grupal'
    let academy = p.academy || p.name || ''
    let city = p.city || ''
    
    if (academy) {
      const match = academy.match(/^(.*?)\s*\(([^)]+)\)$/)
      if (match) {
        academy = match[1].trim()
        if (!city) {
          city = match[2].trim()
        }
      }
    }

    let dancerName = p.name || ''
    
    if (city && dancerName.includes(`(${city})`)) {
      dancerName = dancerName.replace(`(${city})`, '').trim()
    }

    const cleanAcademy = academy.trim()
    if (dancerName && cleanAcademy && dancerName.startsWith(cleanAcademy)) {
      let suffix = dancerName.slice(cleanAcademy.length).trim()
      if (suffix.startsWith('-')) {
        suffix = suffix.slice(1).trim()
      }
      const match = suffix.match(/^\((.+)\)$/)
      if (match) {
        dancerName = match[1].trim()
      } else {
        dancerName = suffix
      }
    }

    academy = academy.trim()
    dancerName = dancerName.trim()
    const showName = !isGrupal && !!dancerName

    return {
      isGrupal,
      academy,
      city,
      dancerName,
      showCity: !!city,
      showName,
    }
  }

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

  // Live broadcast channel
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
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
          if (AudioContextClass) {
            const ctx = new AudioContextClass()
            const playBeep = (startTime: number) => {
              const osc = ctx.createOscillator()
              const gain = ctx.createGain()
              osc.connect(gain)
              gain.connect(ctx.destination)
              osc.type = 'sine'
              osc.frequency.setValueAtTime(880, startTime)
              osc.frequency.exponentialRampToValueAtTime(1046.5, startTime + 0.15)
              gain.gain.setValueAtTime(0, startTime)
              gain.gain.linearRampToValueAtTime(0.3, startTime + 0.02)
              gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25)
              osc.start(startTime)
              osc.stop(startTime + 0.25)
            }
            const now = ctx.currentTime
            playBeep(now)
            playBeep(now + 0.28)
          }
        } catch (e) {
          console.error('AudioContext error:', e)
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

  // Cronómetro — tick cada segundo
  useEffect(() => {
    if (!advancedAt) { setElapsed(0); return }
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - advancedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [advancedAt])

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

  useEffect(() => {
    loadAll()
    
    const handleFocus = () => loadAll()
    window.addEventListener('focus', handleFocus)
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadAll()
    }
    window.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loadAll])

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

  const current = participants.find(p => p.position === (event?.current_position ?? -1))
  const nextP = participants.find(p => p.position === ((event?.current_position ?? -1) + 1))

  async function advance(delta: number) {
    if (!event || isAdvancing) return

    if (delta === 1) {
      const now = Date.now()
      if (lastNextPressRef.current !== null && now - lastNextPressRef.current < 15000) {
        setDoubleAdvanceAlert(true)
        setIsAlertClosing(false)
        if (alertTimeoutRef.current) clearTimeout(alertTimeoutRef.current)
        alertTimeoutRef.current = setTimeout(() => dismissAlert(), 6000)
      }
      lastNextPressRef.current = now
    }

    setIsAdvancing(true)
    const total = participants.length || 999
    const next = Math.max(0, Math.min(total + 1, event.current_position + delta))
    const shouldSetStart = next > 0 && !event.started_at

    if (next > 0) setAdvancedAt(Date.now())
    else setAdvancedAt(null)

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
      <div className="h-[100dvh] bg-[#000000] flex items-center justify-center text-zinc-500 font-display text-3xl tracking-widest">
        EVENTO NO ENCONTRADO
      </div>
    )
  }

  if (portalConfig && !portalConfig.enableOperations) {
    return <PortalLockout portalName="Operativo (Presentador)" />
  }

  if (!event) {
    return (
      <div className="h-[100dvh] bg-[#000000] flex items-center justify-center text-zinc-500 font-display text-2xl tracking-widest animate-pulse">
        CARGANDO…
      </div>
    )
  }

  return (
      <div 
        className="h-[100dvh] max-h-[100dvh] text-white flex flex-col overflow-hidden select-none relative" 
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
          @keyframes bounceIn {
            0% { opacity: 0; transform: translateY(-20px) scale(0.95); }
            60% { transform: translateY(4px) scale(1.02); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
          .animate-bounce-in {
            animation: bounceIn 0.4s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
          }
          @keyframes slideDown {
            from { opacity: 0; transform: translateY(-16px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-slide-down {
            animation: slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
          @keyframes slideUpFadeOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(-16px); }
          }
          .animate-slide-up-fade-out {
            animation: slideUpFadeOut 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          }
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

        {doubleAdvanceAlert && (
          <div className="fixed top-24 inset-x-0 z-[100] flex justify-center px-4 pointer-events-none">
            <div className={`w-full max-w-md pointer-events-auto relative overflow-hidden rounded-2xl bg-zinc-950 border border-red-500/30 p-4 flex items-start gap-4 shadow-[0_20px_50px_rgba(0,0,0,0.7),0_0_30px_rgba(239,68,68,0.15)] ${
              isAlertClosing ? 'animate-slide-up-fade-out' : 'animate-slide-down'
            }`}>
              <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-xl shrink-0 text-red-400">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
              
              <div className="flex-1 min-w-0 pr-2">
                <h4 className="font-display text-xs font-black tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-rose-400 uppercase leading-none">
                  ¡Doble avance detectado!
                </h4>
                <p className="text-zinc-300 text-xs mt-2.5 leading-relaxed font-semibold">
                  Presionaste <span className="text-red-400 font-bold">"Siguiente"</span> dos veces en menos de 15 segundos. Por favor verifica si saltaste una coreografía accidentalmente.
                </p>
              </div>
              
              <button
                onClick={dismissAlert}
                className="shrink-0 p-1 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all duration-200 border border-white/5 hover:border-white/10 active:scale-95 cursor-pointer"
                aria-label="Cerrar alerta"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {activeAnnouncement && (
          <div className="bg-neutral-900 border-b border-yellow-500/50 py-2 shrink-0 overflow-hidden relative flex items-center z-50">
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
          className="apple-glass-header px-4 flex items-center justify-between shrink-0 relative z-20"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.875rem)',
            paddingBottom: '0.875rem'
          }}
        >
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <Image src="/logo.png" alt="Dance4ever" width={42} height={29} priority className="shrink-0 opacity-90" />
            <div className="flex items-center gap-2">
              <h1 className="font-display text-lg tracking-[0.15em] text-white leading-none font-bold uppercase">PRESENTADOR</h1>
              {!audioUnlocked && (
                <span className="text-[9px] font-bold bg-yellow-500 text-black px-1.5 py-0.5 rounded-full uppercase animate-pulse">
                  🔊 Toca
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {event.current_position > 0 && (
              <button
                onClick={() => { if (event.awards_mode) toggleAwards(); else setConfirmAwards(true) }}
                disabled={isTogglingAwards}
                className="text-zinc-400 hover:text-white transition-all p-2 rounded-full border border-zinc-800 bg-zinc-900/40 relative active:scale-95 disabled:opacity-50"
                title={event.awards_mode ? "Finalizar premiación" : "Iniciar premiación"}
              >
                <Star className={`w-5 h-5 ${event.awards_mode ? 'fill-white text-white' : 'text-zinc-400'}`} />
              </button>
            )}
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
        </header>

        {event.awards_mode ? (
          <div className="flex-1 min-h-0 flex flex-col px-4 text-center bg-zinc-950 text-white z-10 justify-center">
            <div className="animate-pulse">
              <p className="font-display text-5xl leading-none uppercase tracking-wide font-black">Premiación</p>
              <p className="font-display text-5xl leading-none uppercase tracking-wide mt-2 font-black text-zinc-500">De Bloque</p>
            </div>
            <div className="flex flex-col items-center justify-center animate-pulse mt-8">
              <p className="font-display text-2xl leading-tight uppercase tracking-wide text-zinc-300">Pantalla de Premiación</p>
              <p className="font-display text-2xl leading-tight uppercase tracking-wide mt-1 text-zinc-500">Activa en Portales</p>
            </div>
            {event.current_position > 0 && (
              <button
                onClick={() => setConfirmAwards(true)}
                className="mt-12 px-6 py-3.5 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 rounded-xl font-display text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white transition-colors"
              >
                Volver al Programa en Vivo
              </button>
            )}
          </div>
        ) : (
          <main className="flex-1 flex flex-col relative z-10 animate-fade-in" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4.5rem)' }}>
            
            {/* Background Ambient Mesh Glows */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
              <div className="absolute top-1/4 -left-20 w-80 h-80 bg-yellow-500/[0.06] rounded-full blur-[100px]" />
              <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-cyan-500/[0.04] rounded-full blur-[100px]" />
            </div>

            {/* EN ESCENARIO Panel (70% height) */}
            <div className="flex-[7] flex flex-row items-stretch pl-0 pr-0 gap-5 relative z-10 bg-gradient-to-br from-yellow-500/[0.02] via-transparent to-transparent">
              {/* Indented glowing indicator spine (runs full panel height) */}
              <div className="w-1.5 bg-yellow-500/20 shadow-[0_0_15px_rgba(234,179,8,0.3)] relative overflow-hidden shrink-0 my-0">
                <div className="absolute inset-0 bg-gradient-to-b from-yellow-400 via-amber-500 to-yellow-600 animate-pulse-slow" />
              </div>

              {/* Contenido */}
              <div className="flex-1 min-w-0 flex flex-col items-stretch py-6 pr-8">
                {current ? (() => {
                  const { academy, dancerName, showName } = dedupInfo(current)
                  const isGrupal = (current.type || '').trim().toLowerCase() === 'grupal'
                  const categoryDisplay = !isGrupal && current.category ? current.category.split('|')[0].trim() : current.category
                  const tags = [
                    current.city ? current.city.trim() : '',
                    categoryDisplay ? categoryDisplay.trim() : '',
                    current.style ? current.style.trim() : '',
                    (current.type || '').trim()
                  ].filter(Boolean)

                  return (
                    <div className="w-full flex-1 flex flex-col justify-between">
                      {/* Fixed Top Bar */}
                      <div className="flex items-center justify-between w-full border-b border-yellow-500/10 pb-3 shrink-0">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                          </span>
                          <span className="font-display text-sm font-bold uppercase text-yellow-500 tracking-[0.25em] leading-none">
                            EN ESCENARIO
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-display text-xs font-bold uppercase text-zinc-400 tracking-[0.1em] leading-none">
                            TURNO #{String(event.current_position).padStart(2, '0')}
                          </span>
                          <div className="h-4 w-px bg-white/10" />
                          <span className="font-display text-sm font-bold uppercase text-yellow-500 font-mono tracking-wider leading-none">
                            {formatElapsed(elapsed)}
                          </span>
                        </div>
                      </div>
                      
                      {/* Centered Content Area */}
                      <div className="flex-1 flex flex-col justify-center py-4 min-h-0">
                        <h2 className="font-display text-5xl md:text-7xl uppercase font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-amber-400 tracking-wide leading-[0.95] break-words max-w-full text-left drop-shadow-[0_0_30px_rgba(234,179,8,0.35)]">
                          {academy}
                        </h2>
                        {showName && (
                          <p className="font-display text-2xl md:text-3.5xl text-white font-bold uppercase mt-6 leading-tight text-left">
                            {dancerName}
                          </p>
                        )}
                        
                        <div className="flex flex-wrap gap-2 mt-10">
                          {tags.map((tag, idx) => (
                            <span 
                              key={idx} 
                              className="text-[10px] md:text-xs font-bold uppercase tracking-wider bg-white/[0.04] text-zinc-300 border border-white/5 px-2.5 py-1 rounded-md"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })() : event.current_position === 0 ? (
                  <div className="w-full flex-1 flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-4">
                      <Clock className="w-6 h-6 text-yellow-500 animate-pulse" />
                      <span className="font-display text-sm font-bold uppercase text-yellow-500 tracking-[0.25em] leading-none">
                        ESTADO
                      </span>
                    </div>
                    <h2 className="font-display text-5xl md:text-7xl uppercase font-black text-yellow-400 tracking-wide leading-none text-left drop-shadow-[0_0_20px_rgba(234,179,8,0.15)]">
                      POR INICIAR
                    </h2>
                    <p className="text-xs text-zinc-400 font-semibold uppercase tracking-[0.15em] mt-3 text-left">
                      PREPÁRATE PARA COMENZAR EL EVENTO
                    </p>
                  </div>
                ) : (
                  <div className="w-full flex-1 flex flex-col justify-center">
                    <h2 className="font-display text-5xl md:text-7xl uppercase font-black text-zinc-500 tracking-wide leading-none text-left">
                      PROGRAMA TERMINADO
                    </h2>
                    <p className="text-xs text-zinc-500 font-semibold uppercase tracking-[0.15em] mt-3 text-left">
                      TODOS LOS TURNOS HAN CONCLUIDO
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Horizontal elegant divider */}
            <div className="w-full shrink-0">
              <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </div>

            {/* SIGUIENTE Panel (30% height, bottom padded dynamically) */}
            <div className="flex-[3] flex flex-row items-stretch pl-0 pr-0 gap-5 pb-0 relative z-10 bg-gradient-to-br from-white/[0.01] via-transparent to-transparent">
              {/* Indented glowing indicator spine (runs full panel height) */}
              <div className="w-1.5 bg-zinc-800 shadow-[0_0_10px_rgba(255,255,255,0.05)] relative overflow-hidden shrink-0 mt-0 mb-0">
                <div className="absolute inset-0 bg-gradient-to-b from-zinc-500 via-zinc-700 to-zinc-850" />
              </div>

              {/* Contenido */}
              <div className="flex-1 min-w-0 flex flex-col items-stretch py-4 pr-8">
                {nextP ? (() => {
                  const { academy, dancerName, showName } = dedupInfo(nextP)
                  const isGrupal = (nextP.type || '').trim().toLowerCase() === 'grupal'
                  const categoryDisplay = !isGrupal && nextP.category ? nextP.category.split('|')[0].trim() : nextP.category
                  const tags = [
                    nextP.city ? nextP.city.trim() : '',
                    categoryDisplay ? categoryDisplay.trim() : '',
                    nextP.style ? nextP.style.trim() : '',
                    (nextP.type || '').trim()
                  ].filter(Boolean)

                  return (
                    <div className="w-full flex-1 flex flex-col justify-between">
                      {/* Fixed Top Bar */}
                      <div className="flex items-center justify-between w-full border-b border-white/5 pb-2.5 shrink-0">
                        <span className="font-display text-xs font-bold text-zinc-400 uppercase tracking-[0.25em] leading-none">
                          SIGUIENTE ACTO
                        </span>
                        <span className="font-display text-xs font-bold text-zinc-500 uppercase tracking-[0.1em] leading-none">
                          TURNO #{String(nextP.position).padStart(2, '0')}
                        </span>
                      </div>
                      
                      {/* Centered Content Area */}
                      <div className="flex-1 flex flex-col justify-center py-2 min-h-0">
                        <h3 className="font-display text-3xl md:text-5xl uppercase font-black text-white tracking-wide leading-[0.95] break-words max-w-full text-left drop-shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                          {academy}
                        </h3>
                        {showName && (
                          <p className="font-display text-lg md:text-2xl text-zinc-400 font-bold uppercase mt-4 leading-tight text-left">
                            {dancerName}
                          </p>
                        )}
                        
                        <div className="flex flex-wrap gap-2 mt-6">
                          {tags.map((tag, idx) => (
                            <span 
                              key={idx} 
                              className="text-[10px] md:text-xs font-bold uppercase tracking-wider bg-white/[0.04] text-zinc-455 border border-white/5 px-2.5 py-1 rounded-md"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })() : (
                  <div className="w-full flex-1 flex flex-col justify-center">
                    <h3 className="font-display text-2xl uppercase font-black text-zinc-650 tracking-wider leading-none text-left">
                      FIN DEL PROGRAMA
                    </h3>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.1em] mt-2 text-left">
                      ESTE ES EL ÚLTIMO ACTO EN VIVO
                    </p>
                  </div>
                )}
              </div>
            </div>
          </main>
        )}

        {/* Fixed Bottom Action Buttons (Absolute Positioning Context) */}
        {!event.awards_mode && (
          <div className="absolute bottom-0 inset-x-0 z-20 h-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] flex items-stretch overflow-hidden border-t border-white/5 bg-black">
            <button
              onClick={() => advance(-1)}
              disabled={isAdvancing || event.current_position === 0 || !!event.awards_mode}
              className="w-[42%] flex items-center justify-start pl-8 pr-12 text-zinc-400 hover:text-white disabled:opacity-20 active:bg-zinc-800 transition-all font-display font-bold text-base tracking-[0.2em] uppercase cursor-pointer select-none bg-zinc-900 pb-[env(safe-area-inset-bottom,0px)] disabled:cursor-not-allowed"
              style={{ clipPath: 'polygon(0 0, 100% 0, calc(100% - 30px) 100%, 0 100%)' }}
            >
              <ChevronLeft className="w-5 h-5 shrink-0 text-zinc-450 relative -top-[3px] mr-1.5" /> ATRÁS
            </button>
            
            <button
              onClick={() => advance(1)}
              disabled={isAdvancing || !!event.awards_mode}
              className="flex-1 flex items-center justify-end pr-14 pl-12 text-black disabled:opacity-40 transition-all font-display font-black text-2xl tracking-[0.25em] uppercase cursor-pointer select-none bg-gradient-to-r from-yellow-400 to-amber-500 active:opacity-90 -ml-[30px] pb-[env(safe-area-inset-bottom,0px)]"
              style={{ clipPath: 'polygon(30px 0, 100% 0, 100% 100%, 0 100%)' }}
            >
              {event.current_position === 0 ? 'COMENZAR' : 'SIGUIENTE'} <ChevronRight className="w-6 h-6 shrink-0 text-black relative -top-[3.5px] ml-1.5" />
            </button>
          </div>
        )}

        {/* Confirmación premiación */}
        {confirmAwards && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setConfirmAwards(false)}>
            <div className="apple-glass-card bg-zinc-950/90 border border-white/10 p-6 max-w-sm w-full space-y-4 text-white" onClick={e => e.stopPropagation()}>
              <div className="flex justify-end -mt-2 -mr-2">
                <button onClick={() => setConfirmAwards(false)} className="p-1.5 hover:text-zinc-400 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <h2 className="font-display text-lg tracking-widest text-white text-center font-bold">¿INICIAR PREMIACIÓN?</h2>
              <p className="text-xs text-zinc-400 text-center leading-relaxed">
                Esto detendrá la visualización normal y mostrará la pantalla de premiación para coaches y público.
              </p>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                  onClick={() => setConfirmAwards(false)}
                  className="apple-btn apple-btn-secondary py-2.5 font-bold text-xs"
                >
                  NO
                </button>
                <button
                  onClick={() => { toggleAwards(); setConfirmAwards(false) }}
                  className="apple-btn apple-btn-primary py-2.5 font-bold text-xs"
                >
                  SÍ
                </button>
              </div>
            </div>
          </div>
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
                const isMe = msg.sender === 'presenter'
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
            <span className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase block mb-2 px-1">Mensajes Rápidos</span>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { text: '¡Solicitar Paramédico!', isCritical: true, icon: HeartPulse },
                { text: 'Falla en Micrófono', isCritical: true, icon: MicOff },
                { text: '¿Quién Sigue?', isCritical: false, icon: HelpCircle },
                { text: 'Listo en Escenario', isCritical: false, icon: CheckCircle },
                { text: 'Alargando Tiempo', isCritical: false, icon: Clock },
              ].map((preset, idx) => {
                const Icon = preset.icon
                return (
                  <button
                    key={idx}
                    onClick={() => sendChatMessage(preset.text, preset.isCritical)}
                    className={`text-xs font-semibold py-2 px-2.5 rounded-xl border transition-all duration-200 active:scale-95 flex items-center justify-center gap-1.5 text-center ${
                      preset.isCritical
                        ? 'bg-red-950/40 hover:bg-red-900/40 text-red-300 border-red-500/30 hover:border-red-500'
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
