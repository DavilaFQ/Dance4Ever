'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { supabase, Participant, Event } from '@/lib/supabase'
import { QrCode, X, Monitor, Settings, MessageSquare, AlertTriangle, Music, Volume2, Megaphone, Pause, Award, HeartPulse, Search, Trophy } from 'lucide-react'
import QRCode from 'qrcode'
import { participantMatches } from '@/lib/search'
import { subscribePortalConfig, PortalConfig, savePortalConfig } from '@/lib/portalConfig'
import PortalLockout from '@/components/PortalLockout'

export default function StaffPage() {
  const [event, setEvent] = useState<Event | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [isDancerOfYearActive, setIsDancerOfYearActive] = useState(false)
  const [intermedioIndex, setIntermedioIndex] = useState<number | null>(null)
  const [qrUrl, setQrUrl] = useState('')
  const [presentadorQrUrl, setPresentadorQrUrl] = useState('')
  const [programaQrUrl, setProgramaQrUrl] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [activeAnnouncement, setActiveAnnouncement] = useState('')
  const [search, setSearch] = useState('')
  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null)
  const [scheduledStartTime, setScheduledStartTime] = useState('')
  const [mode, setMode] = useState<'simple' | 'manager'>('simple')
  const [managerPasswordInput, setManagerPasswordInput] = useState('')
  const [showManagerPasswordModal, setShowManagerPasswordModal] = useState(false)
  const [managerPasswordError, setManagerPasswordError] = useState(false)
  const [onDeckInput, setOnDeckInput] = useState(3)
  const [errorState, setErrorState] = useState<string | null>(null)
  const pendingUpdatesRef = useRef<Map<number, { present: boolean | null, time: number }>>(new Map())
  const blockUpcomingClicksRef = useRef(0)

  useEffect(() => {
    if (portalConfig) {
      setScheduledStartTime(portalConfig.scheduledStartTime || '')
    }
  }, [portalConfig])

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
      sender: 'staff',
      senderName: 'Control',
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
    if (!event?.id) return
    const unsubscribe = subscribePortalConfig(event.id, (config) => {
      setPortalConfig(config)
    })
    return () => unsubscribe()
  }, [event?.id])

  useEffect(() => { loadLatestEvent() }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem('d4e:staff-mode')
    if (saved === 'manager' || saved === 'simple') setMode(saved)
  }, [])

  function changeMode(next: 'simple' | 'manager') {
    if (next === 'manager') {
      setManagerPasswordInput('')
      setManagerPasswordError(false)
      setShowManagerPasswordModal(true)
      return
    }
    setMode(next)
    if (typeof window !== 'undefined') localStorage.setItem('d4e:staff-mode', next)
  }

  function confirmManagerPassword() {
    if (managerPasswordInput === 'd4e2026') {
      setMode('manager')
      if (typeof window !== 'undefined') localStorage.setItem('d4e:staff-mode', 'manager')
      setShowManagerPasswordModal(false)
      setManagerPasswordError(false)
    } else {
      setManagerPasswordError(true)
    }
  }

  const handleSaveSetup = async () => {
    if (event && portalConfig) {
      try {
        await savePortalConfig(event.id, {
          ...portalConfig,
          scheduledStartTime: scheduledStartTime || null
        })
      } catch (err) {
        console.error('Error saving portal config:', err)
      }
    }
    setShowSetup(false)
  }

  const loadParticipants = useCallback(async (eventId: string) => {
    try {
      const { data, error } = await supabase.from('participants').select('*').eq('event_id', eventId).order('position')
      if (error) {
        setErrorState(prev => prev ? `${prev} | ${error.message}` : error.message)
      } else if (data) {
        setParticipants(data)
      }
    } catch (err) {
      setErrorState(prev => prev ? `${prev} | ${(err as Error).message}` : (err as Error).message)
    }
  }, [])

  useEffect(() => {
      if (!event) return
      const channel = supabase
        .channel('staff-' + event.id)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${event.id}` },
          (payload) => setEvent(payload.new as Event))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'program_drafts', filter: `event_id=eq.${event.id}` },
          async (payload) => {
            if (payload.new && 'intermedio_index' in payload.new) {
              setIntermedioIndex(payload.new.intermedio_index ?? null)
            }
          })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'event_checklist', filter: `event_id=eq.${event.id}` },
          (payload) => {
            const record = (payload.eventType === 'DELETE' ? payload.old : payload.new) as any
            if (record && record.category === 'banner_dancer_ano') {
              setIsDancerOfYearActive(payload.eventType !== 'DELETE' && !!record.completed)
            }
          })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `event_id=eq.${event.id}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Participant
            const pending = pendingUpdatesRef.current.get(updated.id)
            
            if (pending && Date.now() - pending.time < 2500) {
              if (updated.present !== pending.present) {
                return
              } else {
                pendingUpdatesRef.current.delete(updated.id)
              }
            }
            
            setParticipants(prev => prev.map(x => x.id === updated.id ? { ...x, present: updated.present } : x))
          } else {
            loadParticipants(event.id)
          }
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [event?.id, loadParticipants])

  // Subscribing to live broadcast channel for voiceovers and announcements
  useEffect(() => {
    if (!event?.id) return
    const ch = supabase.channel(`broadcast-${event.id}`, {
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
  }, [event?.id])

  async function loadLatestEvent() {
    try {
      const { data, error } = await supabase.from('events').select('*').order('created_at', { ascending: false }).limit(1).single()
      if (error) {
        setErrorState(error.message)
      } else if (data) {
        setEvent(data)
        setOnDeckInput(data.on_deck_count)
        loadParticipants(data.id)
        generateQr(data.id)
        
        const { data: chk } = await supabase
          .from('event_checklist')
          .select('completed')
          .eq('event_id', data.id)
          .eq('category', 'banner_dancer_ano')
          .maybeSingle()
        setIsDancerOfYearActive(chk?.completed ?? false)
        
        const { data: draftData } = await supabase
          .from('program_drafts')
          .select('intermedio_index')
          .eq('event_id', data.id)
          .maybeSingle()
        setIntermedioIndex(draftData?.intermedio_index ?? null)
      } else {
        setErrorState('No events returned from database.')
      }
    } catch (err) {
      setErrorState((err as Error).message)
    }
  }

  async function generateQr(eventId: string) {
    const coachUrl = `${window.location.origin}/coach/${eventId}`
    const presentadorUrl = `${window.location.origin}/presentador/${eventId}`
    const programaUrl = `${window.location.origin}/programa/${eventId}`
    const [coachQr, presentadorQr, programaQr] = await Promise.all([
      QRCode.toDataURL(coachUrl, { width: 400, margin: 2 }),
      QRCode.toDataURL(presentadorUrl, { width: 400, margin: 2 }),
      QRCode.toDataURL(programaUrl, { width: 400, margin: 2 }),
    ])
    setQrUrl(coachQr)
    setPresentadorQrUrl(presentadorQr)
    setProgramaQrUrl(programaQr)
  }

  async function updateOnDeck(val: number) {
    if (!event) return
    await supabase.from('events').update({ on_deck_count: val }).eq('id', event.id)
    setEvent({ ...event, on_deck_count: val })
  }

  async function togglePresentCycle(p: Participant) {
    if (Date.now() < blockUpcomingClicksRef.current) return
    
    let next: boolean | null = null
    if (mode === 'manager') {
      if (p.present === null || p.present === undefined) {
        next = false
      } else if (p.present === false) {
        next = true
      } else {
        next = null
      }
    } else {
      if (p.present === false) {
        next = true
      } else if (p.present === true) {
        next = false
      } else {
        return
      }
    }
    
    setParticipants(prev => prev.map(x => x.id === p.id ? { ...x, present: next as any } : x))
    pendingUpdatesRef.current.set(p.id, { present: next, time: Date.now() })
    await supabase.from('participants').update({ present: next }).eq('id', p.id)

    if (next === null && event) {
      let maxActivePos = 0
      participants.forEach(x => {
        if (x.id === p.id) return
        if (x.position > event.current_position && x.present !== null && x.present !== undefined) {
          if (x.position > maxActivePos) {
            maxActivePos = x.position
          }
        }
      })
      const newOnDeck = Math.max(3, maxActivePos - event.current_position)
      if (newOnDeck < event.on_deck_count) {
        await updateOnDeck(newOnDeck)
      }
    }
  }

  const current = participants.find(p => p.position === event?.current_position)

  // Filter participants for main page list.
  // Show only upcoming by default, or all matching search.
  const displayParticipants = (
    search 
      ? participants 
      : (event ? participants.filter(p => p.position > event.current_position) : [])
  ).filter(p => participantMatches(p, search))

  if (portalConfig && !portalConfig.enableOperations) {
    return <PortalLockout portalName="Operativo (Staff)" />
  }

  return (
      <div 
        className={`text-white flex flex-col select-none relative ${
          showChatDrawer || showQr || showSetup || event?.awards_mode
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
          .boxless-item-green {
            background: linear-gradient(to right, rgba(16, 185, 129, 0.1) 0%, transparent 100%);
            border-bottom: 1px solid rgba(16, 185, 129, 0.5);
          }
          .boxless-item-red {
            background: linear-gradient(to right, rgba(239, 68, 68, 0.1) 0%, transparent 100%);
            border-bottom: 1px solid rgba(239, 68, 68, 0.5);
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
            border-bottom: 1px solid rgba(255, 255, 255, 0.15);
            border-top: 1px solid rgba(255, 255, 255, 0.15);
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
            <div className="flex flex-col">
              <h1 className="font-display text-lg tracking-[0.15em] text-white leading-none font-bold uppercase">STAFF</h1>
              <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5">Control de Bloque</span>
            </div>
          </div>
          {event ? (
            <div className="flex items-center gap-3.5 shrink-0">
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
              <button 
                onClick={() => setShowQr(true)} 
                className="text-zinc-400 hover:text-white transition-all p-2 rounded-full border border-zinc-800 bg-zinc-900/40 active:scale-95" 
                title="Compartir códigos QR"
              >
                <QrCode className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setShowSetup(true)} 
                className="text-zinc-400 hover:text-white transition-all p-2 rounded-full border border-zinc-800 bg-zinc-900/40 active:scale-95" 
                title="Ajustes de operación"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          ) : <div className="w-px" />}
        </header>
        {isDancerOfYearActive && (
          <div className="bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600 text-black py-2.5 px-4 font-display text-xs font-black tracking-[0.2em] uppercase text-center flex items-center justify-center gap-2 shadow-lg shadow-yellow-500/10 border-b border-yellow-400/30 shrink-0 relative z-50 animate-pulse">
            <Trophy className="w-4 h-4 fill-black text-black animate-bounce" />
            <span>Dancer del año</span>
            <Trophy className="w-4 h-4 fill-black text-black animate-bounce" />
          </div>
        )}

        {errorState && (
          <div className="bg-red-950/90 backdrop-blur-md border-b border-red-500 py-3 px-4 text-center text-red-200 text-sm font-semibold z-50">
            ⚠️ Error de Conexión: {errorState}
          </div>
        )}

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

        {event ? (
          <main className="flex-1 flex flex-col relative z-10 px-0 pb-0">
            {event.awards_mode ? (
              <div className="py-12 px-4 text-center bg-zinc-950 text-white z-10 justify-center">
                <div className="animate-pulse">
                  <p className="font-display text-5xl leading-none uppercase tracking-wide font-black">Premiación</p>
                  <p className="font-display text-5xl leading-none uppercase tracking-wide mt-2 font-black text-zinc-500">De Bloque</p>
                </div>
                <div className="flex flex-col items-center justify-center animate-pulse mt-8">
                  <p className="font-display text-2xl leading-tight uppercase tracking-wide text-zinc-300">Pantalla de Premiación</p>
                  <p className="font-display text-2xl leading-tight uppercase tracking-wide mt-1 text-zinc-500">Activa en Portales</p>
                </div>
              </div>
            ) : (
              <>
                {/* EN ESCENARIO panel */}
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


                {/* Main list of acts (Upcoming by default, all on search) */}
                <div className="flex flex-col pb-8">
                  {displayParticipants.length > 0 ? (
                    (() => {
                      const rendered: React.ReactNode[] = []
                      let lastCategory = ''
                      let lastSubgroup = ''

                      displayParticipants.forEach(p => {
                        const isIntermedioPos = intermedioIndex !== null && p.position === intermedioIndex + 1
                        if (isIntermedioPos) {
                          rendered.push(
                            <div key={`intermedio-${p.position}`} className="flex items-center justify-center gap-2 py-3 px-4 my-3 rounded-xl bg-amber-500/10 border border-dashed border-amber-500/30 select-none">
                              <Award className="w-4 h-4 text-amber-400 animate-pulse" />
                              <span className="font-display text-xs tracking-[0.2em] text-amber-400 uppercase font-bold">Bloque 1</span>
                            </div>
                          )
                        }
                        const cat = p.category ? p.category.split('|')[0].trim().toUpperCase() : 'OPEN'
                        const mod = p.type ? p.type.toUpperCase() : ''
                        const styleLabel = p.style ? p.style.toUpperCase() : ''
                        const subgroup = [mod, styleLabel].filter(Boolean).join(' · ')

                        if (cat !== lastCategory) {
                          rendered.push(
                            <div key={`cat-div-${p.id}`} className="flex items-center gap-2 px-4 pt-5 pb-1 select-none opacity-95">
                              <div className="h-[1px] flex-1 bg-rose-500/20" />
                              <span className="font-display text-xl tracking-[0.25em] text-rose-400/80 uppercase font-black px-1">{cat}</span>
                              <div className="h-[1px] flex-1 bg-rose-500/20" />
                            </div>
                          )
                          lastCategory = cat
                          lastSubgroup = ''
                        }

                        if (subgroup && subgroup !== lastSubgroup) {
                          rendered.push(
                            <div key={`sub-div-${p.id}`} className="flex items-center gap-2 px-4 pt-3.5 pb-0.5 select-none opacity-90">
                              <div className="h-[1px] w-3 bg-emerald-500/20" />
                              <span className="text-xs tracking-wider text-emerald-400/70 uppercase font-extrabold px-1">{subgroup}</span>
                              <div className="h-[1px] flex-1 bg-emerald-500/10" />
                            </div>
                          )
                          lastSubgroup = subgroup
                        }

                        const isClickable = mode === 'manager' || p.present === true || p.present === false
                        const clickHandler = isClickable ? async () => {
                          if (Date.now() < blockUpcomingClicksRef.current) return
                          const isBeyondOnDeck = p.position > event.current_position + event.on_deck_count
                          if (isBeyondOnDeck) {
                            if (mode !== 'manager') return
                            const newCount = p.position - event.current_position
                            await updateOnDeck(newCount)
                          }
                          await togglePresentCycle(p)
                        } : undefined

                        rendered.push(
                          <Pill 
                            key={p.id} 
                            p={p} 
                            variant={p.present === true ? 'green' : p.present === false ? 'red' : 'gray'} 
                            onClick={clickHandler}
                          />
                        )
                      })

                      return rendered
                    })()
                  ) : (
                    <p className="text-sm text-zinc-600 italic text-center py-12">No hay más turnos programados</p>
                  )}
                </div>
              </>
            )}
          </main>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-6 gap-4 z-10">
            <Image src="/logo.png" alt="Dance4ever" width={140} height={100} priority className="opacity-80" />
            <p className="text-center font-display text-base tracking-wider font-semibold">No hay evento activo</p>
          </div>
        )}

        {/* QR Modal */}
        {showQr && qrUrl && presentadorQrUrl && programaQrUrl && event && (
          <Modal onClose={() => setShowQr(false)}>
            <a
              href={`/coach/${event.id}`}
              target="_blank"
              rel="noreferrer"
              className="block w-full apple-btn apple-btn-secondary p-4 space-y-2.5 text-white"
            >
              <h3 className="font-display text-base tracking-widest text-center font-bold">PORTAL COACHES</h3>
              <div className="bg-white p-2.5 rounded-lg flex items-center justify-center">
                <img src={qrUrl} alt="QR Coaches" className="w-full aspect-square rounded-md" />
              </div>
              <p className="text-[9px] text-zinc-400 text-center break-all opacity-80">{typeof window !== 'undefined' ? window.location.origin : ''}/coach/{event.id}</p>
            </a>

            <a
              href={`/presentador/${event.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 w-full apple-btn apple-btn-secondary p-3 text-white"
            >
              <div className="w-1/4 bg-white p-1 rounded-md flex items-center justify-center aspect-square">
                <img src={presentadorQrUrl} alt="QR Presentador" className="w-full rounded-sm" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <h3 className="font-display text-sm tracking-widest flex items-center gap-1 font-bold">
                  <Monitor className="w-4 h-4 text-zinc-400" /> PORTAL PRESENTADOR
                </h3>
                <p className="text-[9px] text-zinc-500 break-all mt-1 opacity-70">{typeof window !== 'undefined' ? window.location.origin : ''}/presentador/{event.id}</p>
              </div>
            </a>

            <a
              href={`/programa/${event.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 w-full apple-btn apple-btn-secondary p-3 text-white"
            >
              <div className="w-1/4 bg-white p-1 rounded-md flex items-center justify-center aspect-square">
                <img src={programaQrUrl} alt="QR Programa" className="w-full rounded-sm" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <h3 className="font-display text-sm tracking-widest flex items-center gap-1 font-bold">
                  <QrCode className="w-4 h-4 text-zinc-400" /> PROGRAMA EN VIVO
                </h3>
                <p className="text-[9px] text-zinc-500 break-all mt-1 opacity-70">{typeof window !== 'undefined' ? window.location.origin : ''}/programa/{event.id}</p>
              </div>
            </a>
          </Modal>
        )}

        {/* Simplified Settings Modal */}
        {showSetup && event && (
          <Modal onClose={() => setShowSetup(false)}>
            <h2 className="font-display text-base tracking-widest text-white uppercase font-bold text-center border-b border-white/5 pb-2">
              Ajustes de Staff
            </h2>
            
            <div className="space-y-4 pt-2 text-white">
              {/* Mode selection */}
              <div className="space-y-2 text-left">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Modo de Operación
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => changeMode('simple')}
                    className={`py-2 px-3 rounded-xl font-bold text-xs border transition-all ${
                      mode === 'simple'
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    Buscador
                  </button>
                  <button
                    onClick={() => changeMode('manager')}
                    className={`py-2 px-3 rounded-xl font-bold text-xs border transition-all ${
                      mode === 'manager'
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    Manager
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500 leading-snug">
                  El modo <b>Manager</b> permite activar coreografías por venir y gestionar la zona de espera en tiempo real.
                </p>
              </div>

              {/* Scheduled Start Time */}
              {mode === 'manager' && (
                <div className="space-y-2 text-center flex flex-col items-center animate-fade-in">
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block text-center">
                    Hora de Inicio Programada
                  </label>
                  <input
                    type="time"
                    value={scheduledStartTime}
                    onChange={(e) => setScheduledStartTime(e.target.value)}
                    className="block w-32 bg-zinc-900 border border-white/10 rounded-xl px-2 py-2 text-sm text-white focus:outline-none focus:border-white/30 transition-all font-mono text-center"
                  />
                  <p className="text-[10px] text-zinc-500 leading-snug text-center max-w-[280px]">
                    Se mostrará en la pantalla del portal público de las familias si el programa aún no comienza.
                  </p>
                </div>
              )}
            </div>
            
            <button
              onClick={handleSaveSetup}
              className="w-full mt-4 apple-btn apple-btn-primary py-3 text-xs uppercase tracking-widest"
            >
              Aceptar
            </button>
          </Modal>
        )}

        {/* Manager Password Modal */}
        {showManagerPasswordModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[60] flex items-center justify-center p-4 animate-fade-in">
            <div className="apple-glass-card bg-zinc-950/90 border border-white/10 p-6 max-w-xs w-full space-y-4 text-white">
              <div className="flex justify-end -mt-2 -mr-2">
                <button onClick={() => setShowManagerPasswordModal(false)} className="p-1.5 hover:text-zinc-400 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <h2 className="font-display text-base tracking-widest text-white text-center font-bold uppercase">Modo Manager</h2>
              <p className="text-xs text-zinc-400 text-center">Ingresa la contraseña para habilitar el control del programa en vivo.</p>
              <input
                type="password"
                value={managerPasswordInput}
                onChange={e => { setManagerPasswordInput(e.target.value); setManagerPasswordError(false) }}
                onKeyDown={e => e.key === 'Enter' && confirmManagerPassword()}
                placeholder="Contraseña"
                autoFocus
                className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-white text-center font-mono text-lg focus:outline-none focus:border-white/30 transition-all"
              />
              {managerPasswordError && (
                <p className="text-red-400 text-xs text-center font-bold animate-pulse">⚠️ Contraseña incorrecta</p>
              )}
              <button
                onClick={confirmManagerPassword}
                className="w-full apple-btn apple-btn-primary py-3 text-xs uppercase tracking-widest"
              >
                Ingresar
              </button>
            </div>
          </div>
        )}

        {/* Chat Drawer Overlay */}
        {showChatDrawer && (
          <div className="fixed inset-0 bg-black/60 z-45 backdrop-blur-xs transition-opacity duration-300" onClick={() => setShowChatDrawer(false)} />
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
                const isMe = msg.sender === 'staff'
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
            <span className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase block mb-2 px-1">Mensajes Rápidos (Staff)</span>
            <div className="grid grid-cols-2 gap-1.5 flex-wrap">
              {[
                { text: '¡Alto de Emergencia!', isCritical: true, icon: AlertTriangle },
                { text: '¡Iniciar Premiación!', isCritical: true, icon: Award },
                { text: '¡Solicitar Paramédico!', isCritical: true, icon: HeartPulse },
                { text: 'Falta de Pista', isCritical: true, icon: Music },
                { text: 'Pista Lista', isCritical: false, icon: Volume2 },
                { text: 'Llamar a Academias', isCritical: false, icon: Megaphone },
                { text: 'Pausar Cronómetro', isCritical: false, icon: Pause },
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

function Pill({ p, variant, onClick }: { p: Participant, variant: 'green' | 'red' | 'gray' | 'done', onClick?: () => void }) {
  const bg =
    variant === 'green' ? 'boxless-item-green' :
    variant === 'red' ? 'boxless-item-red' :
    variant === 'done' ? 'boxless-item-done' :
    'boxless-item'
  const dancerName = extractDancerName(p)
  const subtitle = formatSubtitle(p)

  const numberColor = 
    variant === 'green' ? 'text-emerald-400 font-extrabold' :
    variant === 'red' ? 'text-red-400 font-bold' :
    variant === 'done' ? 'text-zinc-650' :
    'text-zinc-500 font-semibold'

  const titleColor =
    variant === 'green' ? 'text-emerald-400 font-bold' :
    variant === 'red' ? 'text-red-400 font-bold' :
    variant === 'done' ? 'text-zinc-550' :
    'text-white'

  const subtitleColor =
    variant === 'green' ? 'text-emerald-200/50' :
    variant === 'red' ? 'text-red-200/50' :
    variant === 'done' ? 'text-zinc-700' :
    'text-zinc-400/80'

  const separatorColor =
    variant === 'green' ? 'border-emerald-500/45' :
    variant === 'red' ? 'border-red-500/45' :
    variant === 'done' ? 'border-white/5' :
    'border-white/15'

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      } : undefined}
      className={`w-full flex items-center ${bg} ${onClick ? 'text-left cursor-pointer select-none outline-none' : ''} transition-all duration-200 z-10 overflow-hidden shrink-0 min-h-[48px]`}
    >
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

function Modal({ children, onClose }: { children: React.ReactNode, onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="apple-glass-card bg-zinc-950/85 border border-white/10 p-6 pt-5 max-w-sm w-full space-y-4 text-white relative" onClick={e => e.stopPropagation()}>
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 p-1 hover:text-zinc-400 transition-colors text-zinc-400 z-10"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>
        {children}
      </div>
    </div>
  )
}
