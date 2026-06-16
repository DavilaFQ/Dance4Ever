'use client'
import { useEffect, useState, use, useCallback, useRef } from 'react'
import Image from 'next/image'
import { supabase, Participant, Event } from '@/lib/supabase'
import { participantMatches } from '@/lib/search'
import SearchBar from '@/components/SearchBar'
import { X, ChevronLeft, ChevronRight, Star, ListOrdered, RefreshCw, MessageSquare } from 'lucide-react'
import { subscribePortalConfig, PortalConfig } from '@/lib/portalConfig'
import PortalLockout from '@/components/PortalLockout'


type Props = { params: Promise<{ eventId: string }> }

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

/** Determina el nombre de display según modalidad */
function displayName(p: Participant): string {
  return extractDancerName(p)
}

/** Línea de subtítulo — quita nivel para no-grupales */
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

  // Refs para FitText
  const academyRef = useRef<HTMLParagraphElement>(null)
  const nextAcademyRef = useRef<HTMLParagraphElement>(null)

  // Deduplicación: ocultar ciudad/name si ya están contenidos en otro campo
  function dedupInfo(p: Participant) {
    const isGrupal = (p.type || '').trim().toLowerCase() === 'grupal'
    let academy = p.academy || p.name || ''
    let city = p.city || ''
    
    // Limpiar la ciudad del nombre de la academia en paréntesis si está presente
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
    
    // Si la ciudad está en dancerName, la removemos temporalmente para limpiar la comparación
    if (city && dancerName.includes(`(${city})`)) {
      dancerName = dancerName.replace(`(${city})`, '').trim()
    }

    // Extraer el nombre de los bailarines/equipo si viene formateado con el prefijo de la academia
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

    // Limpiar espacios extras
    academy = academy.trim()
    dancerName = dancerName.trim()
    // Mostramos el nombre del bailarín/integrantes si no es grupal y no está vacío
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

      // Trigger physical haptic vibration if available
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

      // Play beep sound
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

  useEffect(() => { if (!showProgram) setSearch('') }, [showProgram])

  const hasScrolledRef = useRef(false)
  useEffect(() => {
    if (!showProgram) hasScrolledRef.current = false
  }, [showProgram])

  const activeItemRef = useCallback((node: HTMLDivElement | null) => {
    if (node && !hasScrolledRef.current) {
      hasScrolledRef.current = true
      setTimeout(() => {
        node.scrollIntoView({ behavior: 'auto', block: 'center' })
      }, 50)
    }
  }, [])

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
    
    const handleFocus = () => {
      loadAll()
    }
    window.addEventListener('focus', handleFocus)
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadAll()
      }
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

  // FitText — ajusta font-size para que el texto quepa en su contenedor
  useEffect(() => {
    ;[
      { ref: academyRef, max: 42 },
      { ref: nextAcademyRef, max: 28 },
    ].forEach(({ ref, max }) => {
      const el = ref.current
      if (!el) return
      let size = max
      el.style.fontSize = size + 'px'
      el.style.lineHeight = '1.05'
      while (el.scrollHeight > el.clientHeight && size > 8) {
        size -= 0.5
        el.style.fontSize = size + 'px'
      }
    })
  }, [current?.academy, current?.name, current?.city, nextP?.academy, nextP?.name, nextP?.city])

  async function advance(delta: number) {
    if (!event || isAdvancing) return

    if (delta === 1) {
      const now = Date.now()
      if (lastNextPressRef.current !== null && now - lastNextPressRef.current < 15000) {
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
          .gold-card {
            background: linear-gradient(180deg, rgba(234,179,8,0.06) 0%, rgba(9,9,11,0.95) 100%);
            border: 1px solid rgba(234,179,8,0.35);
            border-radius: 24px;
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

        {/* Spacer for iOS Notch */}
        <div className="shrink-0 bg-black" style={{ height: 'env(safe-area-inset-top, 0px)' }} />

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
        <header className="apple-glass-header px-4 py-3.5 flex items-center justify-between shrink-0 relative z-20">
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <Image src="/logo.png" alt="Dance4ever" width={46} height={32} priority className="shrink-0 opacity-90" />
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl tracking-[0.15em] text-white leading-none font-bold uppercase">PRESENTADOR</h1>
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
                className="text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                aria-label="Premiación"
                title={event.awards_mode ? "Finalizar premiación" : "Iniciar premiación"}
              >
                <Star className={`w-6 h-6 ${event.awards_mode ? 'fill-white text-white' : 'text-zinc-400'}`} />
              </button>
            )}
            <button
              onClick={() => setShowChatDrawer(true)}
              className="text-zinc-400 hover:text-white transition-colors p-1 relative"
              title="Chat / Alertas rápidas"
            >
              <MessageSquare className="w-6 h-6" />
              {unreadChatCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white font-bold text-[10px] w-4.5 h-4.5 rounded-full flex items-center justify-center animate-bounce">
                  {unreadChatCount}
                </span>
              )}
            </button>
            <button onClick={() => window.location.reload()} className="text-zinc-400 hover:text-white transition-colors p-1" title="Recargar página">
              <RefreshCw className="w-5.5 h-5.5" />
            </button>
            <button onClick={() => setShowProgram(true)} className="text-zinc-400 hover:text-white transition-colors p-1" title="Ver programa completo">
              <ListOrdered className="w-6.5 h-6.5" />
            </button>
          </div>
        </header>

        {event.awards_mode ? (
          <div className="flex-1 min-h-0 flex flex-col px-4 text-center bg-zinc-950 text-white z-10 justify-center">
            <div className="animate-pulse">
              <p className="font-display text-6.5xl leading-none uppercase tracking-wide font-black">Premiación</p>
              <p className="font-display text-6.5xl leading-none uppercase tracking-wide mt-2 font-black text-zinc-500">De Bloque</p>
            </div>
            <div className="flex flex-col items-center justify-center animate-pulse mt-12">
              <p className="font-display text-3.5xl leading-tight uppercase tracking-wide text-zinc-300">Pantalla de Premiación</p>
              <p className="font-display text-3.5xl leading-tight uppercase tracking-wide mt-2 text-zinc-500">Activa en Portales</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden px-4 gap-1.5" style={{ paddingTop: '6px', paddingBottom: '6px' }}>
            {/* EN ESCENARIO — 70% con estilo dorado */}
            <div className="flex-[7] min-h-0 overflow-hidden">
              <div className="gold-card w-full h-full flex flex-col overflow-hidden px-4 py-2.5">
                {current ? (() => {
                  const { academy, city, dancerName, showCity, showName } = dedupInfo(current)
                  return (
                    <>
                      <div className="w-full flex items-center justify-between shrink-0 border-b border-yellow-500/20 pb-2 mb-3">
                        <span className="font-display text-xl md:text-2.5xl font-bold uppercase text-yellow-400 shrink-0 w-1/4 text-left leading-none gold-pulse">
                          #{String(event.current_position).padStart(2, '0')}
                        </span>
                        <span className="font-display text-xl md:text-2.5xl font-bold uppercase text-yellow-400 text-center flex-1 tracking-[0.25em] leading-none gold-pulse">
                          EN ESCENARIO
                        </span>
                        <span className="font-display text-xl md:text-2.5xl font-bold uppercase text-yellow-400 font-mono tabular-nums shrink-0 w-1/4 text-right leading-none gold-pulse">
                          {formatElapsed(elapsed)}
                        </span>
                      </div>
                      <div className="flex-1 flex flex-col items-center justify-center min-h-0 gap-0.5">
                        <p ref={academyRef} className="font-display uppercase font-extrabold text-yellow-400/90 leading-tight break-words max-w-full text-balance text-center w-full">
                          {academy}
                        </p>
                        {showName && (
                          <p className="font-display text-sm md:text-base text-zinc-400 leading-tight text-center uppercase">
                            {dancerName}
                          </p>
                        )}
                      </div>
                      <div className="w-full flex flex-col items-center shrink-0 gap-1.5 mt-auto">
                        <span className="font-display text-xl md:text-3xl text-zinc-200 font-bold uppercase tracking-wider text-center leading-none">
                          {formatSubtitle(current, false)}
                        </span>
                      </div>
                    </>
                  )
                })() : (
                  <div className="flex-1 flex flex-col items-center justify-center min-h-0 px-4">
                    {event.current_position === 0 ? (
                      <p className="font-display text-2xl md:text-3xl text-zinc-500 uppercase tracking-widest font-bold text-center">
                        POR INICIAR
                      </p>
                    ) : (
                      <p className="font-display text-xl md:text-2xl text-zinc-600 uppercase tracking-widest font-bold text-center">
                        — PROGRAMA TERMINADO —
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* SIGUIENTE — 30% con más contraste */}
            <div className="flex-[3] min-h-0 overflow-hidden">
              <div className="bg-white/[0.04] border border-white/10 rounded-2xl w-full h-full flex flex-col overflow-hidden px-3 py-1.5">
                {nextP ? (() => {
                  const { academy, city, dancerName, showCity, showName } = dedupInfo(nextP)
                  return (
                    <>
                      <div className="w-full flex items-center justify-between shrink-0 border-b border-white/10 pb-1.5 mb-2.5">
                        <span className="font-display text-base md:text-xl font-bold uppercase text-zinc-200 shrink-0 w-1/4 text-left leading-none">
                          #{nextP.position}
                        </span>
                        <span className="font-display text-base md:text-xl font-bold uppercase text-zinc-200 text-center flex-1 tracking-[0.2em] leading-none">
                          SIGUIENTE
                        </span>
                        <div className="shrink-0 w-1/4" />
                      </div>
                      <div className="flex-1 flex flex-col items-center justify-center min-h-0 gap-0.5">
                        <p ref={nextAcademyRef} className="font-display uppercase leading-tight text-zinc-100 font-bold break-words max-w-full px-2 text-center w-full">
                          {academy}
                        </p>
                        {showName && (
                          <p className="font-display text-xs text-zinc-400 leading-tight text-center uppercase break-words max-w-full px-2">
                            {dancerName}
                          </p>
                        )}
                      </div>
                      <div className="w-full flex flex-col items-center shrink-0 gap-1 mt-auto">
                        <span className="font-display text-base md:text-xl text-zinc-300 font-semibold uppercase tracking-wider text-center leading-none">
                          {formatSubtitle(nextP, false)}
                        </span>
                      </div>
                    </>
                  )
                })() : (
                  <p className="text-zinc-500 italic font-display text-xs md:text-sm tracking-wider text-center">
                    — FIN DEL PROGRAMA —
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Botones Siguiente / Atrás */}
        <div className="flex gap-2.5 px-4 pb-4 shrink-0 relative z-20">
          <button
            onClick={() => advance(-1)}
            disabled={isAdvancing || event.current_position === 0 || !!event.awards_mode}
            className="flex-1 rounded-2xl font-bold font-display text-xl tracking-wide flex items-center justify-center gap-2 py-3.5 transition-all duration-200 active:scale-96 disabled:opacity-40 bg-red-600 text-white border border-red-500"
          >
            <ChevronLeft className="w-6 h-6" /> ATRÁS
          </button>
          <button
            onClick={() => advance(1)}
            disabled={isAdvancing || !!event.awards_mode}
            className="flex-[2] rounded-2xl font-bold font-display text-xl tracking-wide flex items-center justify-center gap-2 py-3.5 transition-all duration-200 active:scale-96 disabled:opacity-40 bg-green-600 text-white border border-green-500"
          >
            {event.current_position === 0 ? 'COMENZAR' : 'SIGUIENTE'}
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>

        {/* Confirmación premiación */}
        {confirmAwards && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
            <div className="apple-glass-card bg-zinc-950/90 border border-white/10 p-6 max-w-sm w-full space-y-4 text-white">
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
                  className="apple-btn apple-btn-secondary py-2.5 font-bold text-sm"
                >
                  NO
                </button>
                <button
                  onClick={() => { toggleAwards(); setConfirmAwards(false) }}
                  className="apple-btn apple-btn-primary py-2.5 font-bold text-sm"
                >
                  SÍ
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Programa Completo */}
        {showProgram && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex flex-col p-4 animate-fade-in">
            <div className="flex-1 min-h-0 flex flex-col apple-glass-card overflow-hidden bg-zinc-950/80 border border-white/10">
              <div className="bg-black/30 px-4 py-3.5 flex items-center justify-between shrink-0 border-b border-white/5">
                <h3 className="font-display text-xl tracking-widest text-white font-bold">PROGRAMA</h3>
                <button onClick={() => setShowProgram(false)} className="p-1 hover:text-zinc-400 transition-colors" aria-label="Cerrar"><X className="w-6 h-6" /></button>
              </div>
              <SearchBar value={search} onChange={setSearch} />
              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
                {(() => {
                  if (participants.length === 0) return <p className="text-center text-zinc-600 italic py-6">Sin programa</p>
                  const filtered = participants.filter(p => participantMatches(p, search))
                  if (filtered.length === 0) return <p className="text-center text-zinc-600 italic py-6">Sin resultados</p>
                  
                  const rendered: React.ReactNode[] = []
                  let lastCategory = ''
                  let lastSubgroup = ''
                  
                  filtered.forEach(p => {
                    const cat = p.category ? p.category.split('|')[0].trim() : 'Sin categoría'
                    const subgroup = [p.style, p.type].filter(Boolean).join(' · ')
                    const isOnStage = event.current_position === p.position
                    const done = p.position < event.current_position
                    const isGrupal = (p.type || '').trim().toLowerCase() === 'grupal'

                    if (cat !== lastCategory) {
                      rendered.push(
                        <div key={`cat-${cat}-${p.position}`} className="flex items-center gap-2 pt-3 pb-1 first:pt-0">
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
                        <div key={`sub-${cat}-${subgroup}-${p.position}`} className="flex items-center gap-2 pb-0.5">
                          <div className="h-px flex-1 bg-white/5" />
                          <span className="font-display text-[8px] tracking-[0.2em] text-zinc-600 uppercase font-semibold">{subgroup}</span>
                          <div className="h-px flex-1 bg-white/5" />
                        </div>
                      )
                      lastSubgroup = subgroup
                    }
                    
                    rendered.push(
                      <div 
                        key={p.id} 
                        ref={isOnStage ? activeItemRef : undefined}
                        className={`w-full rounded-xl px-4 py-2 flex items-center gap-3 transition-all ${
                          isOnStage ? 'bg-white/15 border border-white/20' : done ? 'opacity-30 bg-white/2' : 'bg-white/4 border border-white/5'
                        }`}
                      >
                        <span className="font-display text-base shrink-0 w-10 text-center leading-none opacity-80 font-bold">#{p.position}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-display text-xl uppercase break-words leading-tight font-bold">{displayName(p)}</p>
                          <p className="font-display text-xs uppercase opacity-60 truncate mt-1 text-zinc-400">{formatSubtitle(p, true)}</p>
                        </div>
                      </div>
                    )
                  })
                  return rendered
                })()}
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
                { text: 'Falla en Micrófono', isCritical: true },
                { text: '¿Quién Sigue?', isCritical: false },
                { text: 'Listo en Escenario', isCritical: false },
                { text: 'Alargando Tiempo', isCritical: false },
              ].map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => sendChatMessage(preset.text, preset.isCritical)}
                  className={`text-xs font-semibold py-2 px-2.5 rounded-xl border transition-all duration-200 active:scale-95 text-center ${
                    preset.isCritical
                      ? 'bg-red-950/40 hover:bg-red-900/40 text-red-300 border-red-500/30 hover:border-red-500'
                      : 'bg-white/5 hover:bg-white/10 text-zinc-300 border-white/5 hover:border-white/20'
                  }`}
                >
                  {preset.text}
                </button>
              ))}
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
                placeholder="Escribe un mensaje..."
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
