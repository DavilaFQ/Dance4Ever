'use client'
import { useEffect, useState, use, useCallback, useRef } from 'react'
import Image from 'next/image'
import { supabase, Participant, Event } from '@/lib/supabase'
import { X, Search, Clock, AlertTriangle, ChevronRight, CheckCircle, Award, Sparkles, Filter, Heart, Share2, Smartphone, Volume2 } from 'lucide-react'
import { subscribePortalConfig, PortalConfig } from '@/lib/portalConfig'

type Props = { params: Promise<{ eventId: string }> }


function extractDancerName(p: Participant): string {
  const type = (p.type || '').trim().toLowerCase()
  // Grupal: show only academy name
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

function ScrollableText({ text, className = '', align = 'center' }: { text: string; className?: string; align?: 'left' | 'center' | 'right' }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const [scrollDistance, setScrollDistance] = useState(0)

  const checkOverflow = useCallback(() => {
    const container = containerRef.current
    const textEl = textRef.current
    if (container && textEl) {
      const distance = textEl.offsetWidth - container.offsetWidth
      setScrollDistance(distance > 0 ? distance : 0)
    }
  }, [])

  useEffect(() => {
    checkOverflow()
    window.addEventListener('resize', checkOverflow)
    return () => window.removeEventListener('resize', checkOverflow)
  }, [text, checkOverflow])

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden whitespace-nowrap relative w-full ${scrollDistance === 0 && align === 'center' ? 'text-center' : ''} ${className}`}
    >
      <span
        ref={textRef}
        className={`inline-block ${scrollDistance > 0 ? 'animate-marquee-hover' : ''}`}
        style={{
          '--scroll-dist': `-${scrollDistance}px`,
        } as React.CSSProperties}
      >
        {text}
      </span>
    </div>
  )
}

export default function PublicProgramPage({ params }: Props) {
  const { eventId } = use(params)
  const [event, setEvent] = useState<Event | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [intermedioIndex, setIntermedioIndex] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)



  // Academy selection support
  const [selectedAcademy, setSelectedAcademy] = useState<string | null>(null)
  const [showAcademyModal, setShowAcademyModal] = useState(false)
  const [academySearch, setAcademySearch] = useState('')
  const [showScreensaver, setShowScreensaver] = useState(false)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const [supportScores, setSupportScores] = useState<Record<string, number>>({})
  const [particles, setParticles] = useState<{ id: number; x: number; y: number }[]>([])
  const [portalUrl, setPortalUrl] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setTimeout(() => setPortalUrl(window.location.href), 0)
    }
  }, [])



  // Support mini-game throttling and real-time broadcast refs
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const pendingTapsRef = useRef<Record<string, number>>({})
  const dbSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Reference to prevent scroll war
  const hasScrolledRef = useRef(false)
  const isFirstLoadRef = useRef(true)
  const listContainerRef = useRef<HTMLDivElement>(null)
  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null)

  // Portal Config subscription
  useEffect(() => {
    if (!eventId) return
    const unsubscribe = subscribePortalConfig(eventId, (config) => {
      setPortalConfig(config)
    })
    return () => unsubscribe()
  }, [eventId])

  // Document Title update
  useEffect(() => {
    if (event) {
      document.title = `${event.name} - Programa en Vivo | Dance4ever`
    } else {
      document.title = 'Programa en Vivo | Dance4ever'
    }
  }, [event])



  // Load Support Academy from LocalStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`support-academy-${eventId}`)
      if (saved) {
        setTimeout(() => setSelectedAcademy(saved), 0)
      } else {
        const skipped = localStorage.getItem(`skip-academy-${eventId}`)
        if (!skipped) {
          setTimeout(() => setShowAcademyModal(true), 0)
        }
      }
    } catch (e) {
      console.warn('LocalStorage failed to load academy:', e)
    }
  }, [eventId])

  // Track initial load settle status
  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => {
        isFirstLoadRef.current = false
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [loading])



  const dismissScreensaver = () => {
    setIsFadingOut(true)
    setTimeout(() => {
      setShowScreensaver(false)
      setIsFadingOut(false)
    }, 2000)
  }

  const handleSupportTap = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!selectedAcademy) return
    
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const particleId = Date.now() + Math.random()
    
    setParticles(prev => [...prev, { id: particleId, x, y }])
    setTimeout(() => {
      setParticles(prev => prev.filter(p => p.id !== particleId))
    }, 1000)

    const currentScore = supportScores[selectedAcademy] || 0
    const nextScore = currentScore + 1
    setSupportScores(prev => ({
      ...prev,
      [selectedAcademy]: nextScore
    }))

    // Send realtime broadcast to all active page viewers instantly
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'support_tap',
        payload: { academy: selectedAcademy, count: 1 }
      })
    }

    // Queue click count locally to batch/debounce database persistence
    pendingTapsRef.current[selectedAcademy] = (pendingTapsRef.current[selectedAcademy] || 0) + 1

    if (!dbSyncTimeoutRef.current) {
      dbSyncTimeoutRef.current = setTimeout(async () => {
        dbSyncTimeoutRef.current = null
        
        const tapsToSync = { ...pendingTapsRef.current }
        pendingTapsRef.current = {}

        for (const [academyName, clickCount] of Object.entries(tapsToSync)) {
          if (clickCount <= 0) continue
          try {
            const { data: existing } = await supabase
              .from('event_checklist')
              .select('id, notes')
              .eq('event_id', eventId)
              .eq('category', 'team_support')
              .eq('text', academyName)
              .maybeSingle()

            if (existing) {
              const latestDbScore = parseInt(existing.notes || '0', 10)
              await supabase
                .from('event_checklist')
                .update({ notes: String(latestDbScore + clickCount) })
                .eq('id', existing.id)
            } else {
              await supabase
                .from('event_checklist')
                .insert({
                  event_id: eventId,
                  category: 'team_support',
                  text: academyName,
                  priority: 'baja',
                  completed: false,
                  notes: String(clickCount)
                })
            }
          } catch (err) {
            console.error('Error syncing batched support taps to DB:', err)
          }
        }
      }, 3000)
    }
  }


  const selectAcademy = (academyName: string) => {
    setSelectedAcademy(academyName)
    setShowAcademyModal(false)
    try {
      localStorage.setItem(`support-academy-${eventId}`, academyName)
    } catch (e) {
      console.warn('LocalStorage failed to save academy:', e)
    }
  }

  const clearAcademy = () => {
    setSelectedAcademy(null)
    setShowAcademyModal(false)
    try {
      localStorage.removeItem(`support-academy-${eventId}`)
      localStorage.setItem(`skip-academy-${eventId}`, 'true')
    } catch (e) {
      console.warn('LocalStorage failed to clear academy:', e)
    }
  }

  const skipAcademy = () => {
    setShowAcademyModal(false)
    try {
      localStorage.setItem(`skip-academy-${eventId}`, 'true')
    } catch (e) {
      console.warn('LocalStorage failed to skip academy:', e)
    }
  }



  // Helper to get ETA
  const getETA = (itemPosition: number) => {
    if (!event || itemPosition <= event.current_position) return null
    const turnsLeft = itemPosition - event.current_position
    return {
      turnsLeft
    }
  }

  // Load data function
  const loadAll = useCallback(async () => {
    try {
      const [ev, ps, supportData, draftData] = await Promise.all([
        supabase.from('events').select('*').eq('id', eventId).single(),
        supabase.from('participants').select('*').eq('event_id', eventId).order('position'),
        supabase.from('event_checklist').select('text, notes').eq('event_id', eventId).eq('category', 'team_support'),
        supabase.from('program_drafts').select('intermedio_index').eq('event_id', eventId).maybeSingle()
      ])
      if (ev.error || !ev.data) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setEvent(ev.data)
      if (ps.data) {
        setParticipants(ps.data)
      }
      if (draftData && draftData.data) {
        setIntermedioIndex(draftData.data.intermedio_index ?? null)
      } else {
        setIntermedioIndex(null)
      }
      if (supportData.data) {
        const scores: Record<string, number> = {}
        supportData.data.forEach(item => {
          scores[item.text] = parseInt(item.notes || '0', 10)
        })
        setSupportScores(scores)
      }
      
      setLoading(false)
    } catch (e) {
      console.error(e)
      setLoading(false)
    }
  }, [eventId])

  // Initial load & Window Focus listeners
  useEffect(() => {
    setTimeout(() => loadAll(), 0)
    const handleFocus = () => loadAll()
    window.addEventListener('focus', handleFocus)
    
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadAll()
    }
    window.addEventListener('visibilitychange', handleVisibility)
    
    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [loadAll])

  // Real-time Postgres Changes Subscriptions
  useEffect(() => {
    const channelId = `public-prog-${eventId}-${Math.random().toString(36).slice(2, 9)}`
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
        (payload) => {
          setEvent(payload.new as Event)
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `event_id=eq.${eventId}` },
        () => loadAll()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'program_drafts', filter: `event_id=eq.${eventId}` },
        () => loadAll()
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_checklist', filter: `event_id=eq.${eventId}` },
        (payload) => {
          const record = (payload.eventType === 'DELETE' ? payload.old : payload.new) as { category?: string; text?: string; notes?: string }
          if (record && record.category === 'team_support' && record.text) {
            setSupportScores(prev => {
              const next = { ...prev }
              if (payload.eventType === 'DELETE') {
                delete next[record.text!]
              } else {
                next[record.text!] = parseInt(record.notes || '0', 10)
              }
              return next
            })
          }
        }
      )
      .on('broadcast', { event: 'support_tap' }, ({ payload }) => {
        const { academy, count } = payload as { academy: string; count: number }
        setSupportScores(prev => ({
          ...prev,
          [academy]: (prev[academy] || 0) + count
        }))
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [eventId, loadAll])

  // Auto-scroll callback ref
  const activeItemRef = useCallback((node: HTMLDivElement | null) => {
    if (node && !hasScrolledRef.current) {
      hasScrolledRef.current = true
      // Only scroll into view if it is not the initial mount to prevent reload scroll jumps
      if (!isFirstLoadRef.current) {
        setTimeout(() => {
          node.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 300)
      }
    }
  }, [])

  // Whenever current_position changes, reset scroll locking so it re-centers
  useEffect(() => {
    hasScrolledRef.current = false
  }, [event?.current_position])

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-black text-white flex flex-col items-center justify-center gap-3">
        <Sparkles className="w-8 h-8 text-yellow-500 animate-spin" />
        <span className="text-zinc-400 font-display tracking-widest text-sm uppercase">Cargando Programa...</span>
      </div>
    )
  }

  if (notFound || !event) {
    return (
      <div className="min-h-[100dvh] bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-4 animate-bounce" />
        <h2 className="text-2xl font-bold font-display uppercase tracking-widest mb-2">Evento no encontrado</h2>
        <p className="text-zinc-400 text-sm max-w-md">No pudimos localizar el evento especificado. Por favor, verifica el enlace provisto.</p>
      </div>
    )
  }

  const current = participants.find(p => p.position === event.current_position)

  const rawLeaderboard = Object.entries(supportScores)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)

  const leaderboard = [...rawLeaderboard]
  const mockNames = ['Estudio Passion et Danse', 'Colegio Paseo', 'NC School Poms']
  while (leaderboard.length < 3) {
    const idx = leaderboard.length
    const name = mockNames[idx] || `Academia Demo ${idx + 1}`
    const prevScore = leaderboard.length > 0 ? leaderboard[leaderboard.length - 1].score : 30
    const score = Math.max(1, Math.round(prevScore * 0.6))
    leaderboard.push({ name, score })
  }
  if (leaderboard.length > 3) {
    leaderboard.splice(3)
  }

  // Filter and Search participants
  const filteredParticipants = participants.filter(p => p.position > event.current_position)



  // Extract unique academies for selector modal
  const uniqueAcademies = Array.from(
    new Set(participants.map(p => p.academy?.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b))

  const filteredAcademies = uniqueAcademies.filter(ac => 
    ac.toLowerCase().includes(academySearch.toLowerCase())
  )

  return (
    <div 
      className={`text-white flex flex-col select-none relative ${
        showScreensaver 
          ? 'h-[100dvh] max-h-[100dvh] overflow-hidden' 
          : 'min-h-[100dvh]'
      }`} 
      style={{
        background: '#000000',
      }}
    >
      {/* Apple Premium Dark Mode Styles */}
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
        .gold-card {
          background: radial-gradient(circle at top right, rgba(234, 179, 8, 0.1) 0%, rgba(9, 9, 11, 0.85) 100%);
          backdrop-filter: blur(30px);
          -webkit-backdrop-filter: blur(30px);
          border: 1.5px solid rgba(234, 179, 8, 0.35);
          box-shadow: 0 8px 32px rgba(234, 179, 8, 0.08);
          border-radius: 24px;
        }
        .gold-pulse {
          animation: goldGlow 3s infinite ease-in-out;
        }
        @keyframes goldGlow {
          0%, 100% { text-shadow: 0 0 4px rgba(234,179,8,0.1); opacity: 0.95; }
          50% { text-shadow: 0 0 12px rgba(234,179,8,0.45); opacity: 1; }
        }
        .gold-border-pulse {
          animation: borderGlow 2s infinite ease-in-out;
        }
        @keyframes borderGlow {
          0%, 100% { border-color: rgba(234, 179, 8, 0.2); }
          50% { border-color: rgba(234, 179, 8, 0.6); }
        }
        .fuchsia-stage-card {
          background: radial-gradient(circle at top right, rgba(217, 70, 239, 0.15) 0%, rgba(9, 9, 11, 0.85) 100%);
          backdrop-filter: blur(30px);
          -webkit-backdrop-filter: blur(30px);
          border: 1.5px solid rgba(217, 70, 239, 0.35);
          box-shadow: 0 8px 32px rgba(217, 70, 239, 0.08);
          border-radius: 24px;
        }
        .fuchsia-stage-pulse {
          animation: fuchsiaStageGlow 3s infinite ease-in-out;
        }
        @keyframes fuchsiaStageGlow {
          0%, 100% { text-shadow: 0 0 4px rgba(217, 70, 239, 0.1); opacity: 0.95; }
          50% { text-shadow: 0 0 12px rgba(217, 70, 239, 0.45); opacity: 1; }
        }
        .fuchsia-stage-border-pulse {
          animation: fuchsiaStageBorderGlow 2s infinite ease-in-out;
        }
        @keyframes fuchsiaStageBorderGlow {
          0%, 100% { border-color: rgba(217, 70, 239, 0.2); }
          50% { border-color: rgba(217, 70, 239, 0.6); }
        }
        .neon-dual-card {
          background: radial-gradient(circle at top right, rgba(217, 70, 239, 0.1) 0%, rgba(234, 179, 8, 0.05) 50%, rgba(9, 9, 11, 0.9) 100%);
          backdrop-filter: blur(30px);
          -webkit-backdrop-filter: blur(30px);
          border: 1.5px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 8px 32px rgba(234, 179, 8, 0.05);
          border-radius: 24px;
        }
        .neon-dual-border-pulse {
          animation: neonDualBorderGlow 2s infinite ease-in-out;
        }
        @keyframes neonDualBorderGlow {
          0%, 100% { border-color: rgba(234, 179, 8, 0.2); }
          50% { border-color: rgba(217, 70, 239, 0.5); }
        }
        @keyframes marquee-scroll-variable {
          0%, 15% {
            transform: translateX(0);
          }
          85%, 100% {
            transform: translateX(var(--scroll-dist, 0px));
          }
        }
        .animate-marquee-hover {
          animation: marquee-scroll-variable 6s ease-in-out infinite alternate;
        }
        .animate-pulse-slow {
          animation: pulse-slow 3.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: .35; }
        }
        @keyframes logo-3d-float {
          0%, 100% {
            transform: translateY(0px) rotateY(-15deg) rotateX(5deg);
          }
          50% {
            transform: translateY(-4px) rotateY(15deg) rotateX(-5deg);
          }
        }
        .animate-logo-3d {
          transform-style: preserve-3d;
          perspective: 1000px;
          animation: logo-3d-float 10s ease-in-out infinite;
        }
        @keyframes logo-shine {
          0%, 100% {
            opacity: 0;
          }
          50% {
            opacity: 0.85;
          }
        }
        .animate-logo-shine {
          filter: brightness(1.22);
          animation: logo-shine 10s ease-in-out infinite;
        }
        @keyframes button-shine {
          0% {
            transform: skewX(-20deg) translateX(-150%);
          }
          100% {
            transform: skewX(-20deg) translateX(350%);
          }
        }
        .animate-button-shine {
          animation: button-shine 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
        @keyframes screensaver-float {
          0% {
            transform: translateY(0px) scale(0.96) rotate(-0.5deg);
            filter: drop-shadow(0 0 15px rgba(234, 179, 8, 0.2));
          }
          50% {
            transform: translateY(-25px) scale(1.04) rotate(0.8deg);
            filter: drop-shadow(0 0 45px rgba(217, 70, 239, 0.45));
          }
          100% {
            transform: translateY(0px) scale(0.96) rotate(-0.5deg);
            filter: drop-shadow(0 0 15px rgba(234, 179, 8, 0.2));
          }
        }
        .animate-screensaver-logo {
          animation: screensaver-float 12s ease-in-out infinite;
          transform-style: preserve-3d;
          perspective: 1000px;
        }
        @keyframes bg-glow-pulse {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.15);
          }
        }
        .screensaver-bg-glow {
          animation: bg-glow-pulse 8s ease-in-out infinite;
        }
        @keyframes particle-float-up {
          0% {
            transform: translate(-50%, -50%) scale(0.6) translateY(0);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(1.4) translateY(-120px);
            opacity: 0;
          }
        }
        .animate-particle {
          animation: particle-float-up 0.8s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
          position: absolute;
          pointer-events: none;
          z-index: 50;
        }
        @keyframes logo-screensaver-idle {
          0% {
            opacity: 0.4;
            filter: blur(3px);
            transform: translateY(185px) scale(1);
          }
          50% {
            opacity: 0.45;
            filter: blur(2px);
            transform: translateY(170px) scale(1.04);
          }
          100% {
            opacity: 0.4;
            filter: blur(3px);
            transform: translateY(185px) scale(1);
          }
        }
        .animate-logo-idle {
          animation: logo-screensaver-idle 7s ease-in-out infinite;
        }
        @keyframes logo-screensaver-exit {
          0% {
            opacity: 0.4;
            filter: blur(3px);
            transform: translateY(185px) scale(1) rotate(0deg);
          }
          25% {
            opacity: 1;
            filter: blur(0px);
            transform: translateY(0px) scale(1.15) rotate(0deg);
          }
          75% {
            opacity: 1;
            filter: blur(0px);
            transform: translateY(0px) scale(1.15) rotate(0deg);
          }
          100% {
            opacity: 0;
            filter: blur(0px);
            transform: translateY(0px) scale(0.15) rotate(-18deg);
          }
        }
        .animate-logo-exit-full {
          animation: logo-screensaver-exit 2s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }
        @keyframes screensaver-backdrop-enter {
          0% {
            opacity: 0;
            backdrop-filter: blur(0px);
            -webkit-backdrop-filter: blur(0px);
          }
          100% {
            opacity: 1;
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
          }
        }
        .animate-screensaver-backdrop-enter {
          animation: screensaver-backdrop-enter 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }
        @keyframes screensaver-content-enter {
          0% {
            opacity: 0;
            transform: scale(0.96) translateY(20px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0px);
          }
        }
        .animate-screensaver-content-enter {
          animation: screensaver-content-enter 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }
        @keyframes screensaver-logo-fade-in {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        .animate-screensaver-logo-fade-in {
          animation: screensaver-logo-fade-in 0.6s ease-out forwards;
        }
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .gradient-names-text span {
          background: linear-gradient(90deg, #f472b6, #a78bfa, #38bdf8, #a78bfa, #f472b6);
          background-size: 300% auto;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
          animation: gradient-shift 4s ease infinite;
        }
      `}} />

      {/* Main Page Layout Wrapper (to apply background blur when screensaver is active) */}
      <div 
        className={`flex-1 flex flex-col transition-all ${
          showScreensaver 
            ? isFadingOut 
              ? 'blur-none opacity-100 scale-100 duration-[2000ms] ease-out h-full max-h-full overflow-hidden' 
              : 'blur-md opacity-35 scale-[0.98] duration-300 h-full max-h-full overflow-hidden'
            : 'duration-300'
        }`}
      >
        {/* Header with integrated safe-area top padding */}
        <header 
          className="apple-glass-header px-4 flex items-center justify-between shrink-0 relative z-20"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.875rem)', // 0.875rem matches the previous py-3.5 (14px)
            paddingBottom: '0.875rem'
          }}
        >
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <div className="animate-logo-3d shrink-0 relative">
            <Image src="/logo.png" alt="Dance4ever" width={46} height={32} priority className="opacity-95" />
            <Image src="/logo.png" alt="Dance4ever Shine" width={46} height={32} priority className="absolute inset-0 opacity-0 pointer-events-none animate-logo-shine" />
          </div>
          <div className="flex flex-col">
            <h1 className="font-display text-lg tracking-[0.1em] text-white leading-none font-bold uppercase truncate max-w-[180px]">
              {event.name}
            </h1>
            <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5">Programa en Vivo</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button 
            type="button" 
            onClick={() => {
              setShowScreensaver(true)
              setIsFadingOut(false)
            }}
            className="relative overflow-hidden group bg-gradient-to-r from-cyan-600/90 to-teal-600/90 hover:from-cyan-500 hover:to-teal-500 text-white font-extrabold rounded-full px-3.5 py-2 flex items-center gap-1.5 text-[10px] tracking-widest uppercase font-display shadow-[0_0_15px_rgba(6,182,212,0.25)] hover:shadow-[0_0_22px_rgba(6,182,212,0.5)] active:scale-95 transition-all duration-300 cursor-pointer border border-white/10"
          >
            {/* Sliding Gloss Reflection */}
            <span className="absolute inset-0 w-[30%] h-full bg-white/25 skew-x-[-25deg] -translate-x-[150%] group-hover:animate-button-shine" />
            <Heart className="w-3.5 h-3.5 text-white fill-current animate-pulse" />
            <span>¡Apoyar!</span>
          </button>
        </div>
      </header>

      {/* Sub-header Academy selection */}
      {selectedAcademy ? (
        <div className="bg-cyan-950/20 border-b border-cyan-900/40 px-4 py-2 flex items-center justify-between shrink-0 text-xs relative z-20 animate-fade-in">
          <span className="text-zinc-300">
            Apoyando a: <strong className="text-cyan-400 font-extrabold uppercase">{selectedAcademy}</strong>
          </span>
          <button 
            type="button" 
            onClick={() => setShowAcademyModal(true)} 
            className="text-cyan-400 font-bold hover:text-cyan-300 transition-colors uppercase tracking-wider text-[10px] active:scale-95"
          >
            Cambiar
          </button>
        </div>
      ) : (
        <div className="bg-zinc-900/20 border-b border-zinc-800/50 px-4 py-2 flex items-center justify-between shrink-0 text-xs relative z-20 animate-fade-in">
          <span className="text-zinc-400">¿A qué academia apoyas hoy?</span>
          <button 
            type="button" 
            onClick={() => setShowAcademyModal(true)} 
            className="text-zinc-300 font-bold hover:text-white transition-colors uppercase tracking-wider text-[10px] active:scale-95"
          >
            Seleccionar
          </button>
        </div>
      )}

      {/* Main Body */}
      <main className="flex-1 flex flex-col relative z-10 px-0 pb-0">
        
        {/* Awards mode banner or Live stage panel */}
        {event.awards_mode ? (
          <div className="py-6 px-4 flex flex-col items-center justify-center text-center gap-3 mt-2 shrink-0 animate-fade-in border-b border-yellow-500/20">
            <Award className="w-12 h-12 text-yellow-400 animate-bounce" />
            <div>
              <h2 className="font-display text-2xl font-black uppercase tracking-[0.15em] text-yellow-400 leading-none">¡PREMIACIÓN EN CURSO!</h2>
              <p className="text-zinc-400 text-xs mt-2 max-w-sm">Los jueces están entregando los premios y medallas en el escenario principal. Te invitamos a estar atento.</p>
            </div>
          </div>
        ) : (
          <>


            {/* EN ESCENARIO - Active display (boxless style with solid yellow background) */}
            <div className="py-5 px-4 flex flex-col shrink-0 relative overflow-hidden border-b border-yellow-600 bg-yellow-500 rounded-none">
              {event.started_at && current ? (
                <>
                  <div className="flex items-center justify-between w-full mb-1.5">
                    <span className="font-display text-sm font-black text-black uppercase tracking-widest leading-none">
                      EN ESCENARIO
                    </span>
                    <span className="font-display text-sm font-black text-black uppercase tracking-widest leading-none">
                      TURNO #{String(current.position).padStart(2, '0')}
                    </span>
                  </div>
                  
                  {/* Clean layout separating Academy (large) and Dancer Name */}
                  <div className="flex-1 flex flex-col items-center justify-center text-center py-1.5">
                    {(() => {
                      const { isGrupal, academy, dancerName } = dedupInfo(current)
                      return (
                        <>
                          <h2 className="font-display text-2xl uppercase font-black tracking-wide text-black leading-tight break-words max-w-full text-center">
                            {isGrupal ? academy : dancerName}
                          </h2>
                          {!isGrupal && academy && (
                            <ScrollableText 
                              text={academy} 
                              className="font-display text-base text-black font-extrabold uppercase tracking-wider mt-1 text-center"
                            />
                          )}
                          <ScrollableText 
                            text={formatSubtitle(current, false)} 
                            className="font-display text-base text-zinc-950 font-bold uppercase tracking-wider mt-2.5 text-center"
                          />
                        </>
                      )
                    })()}
                  </div>
                </>
              ) : portalConfig?.scheduledStartTime ? (
                <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
                  <Clock className="w-8 h-8 text-black animate-pulse" />
                  <p className="font-display text-lg font-black uppercase tracking-widest text-black">Por iniciar</p>
                  <p className="text-sm text-zinc-950 font-semibold leading-normal">
                    El evento está programado para comenzar a las <span className="font-mono text-black font-black">{portalConfig.scheduledStartTime}</span>
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Sparkles className="w-8 h-8 text-black animate-pulse mb-2" />
                  <p className="font-display text-lg font-black uppercase tracking-widest text-black">Esperando Inicio de Turno</p>
                </div>
              )}
            </div>


          </>
        )}

        {/* Program Itinerary List */}
        <div 
          ref={listContainerRef} 
          id="itinerary-list" 
          className="pb-[env(safe-area-inset-bottom,0px)]"
        >
          {filteredParticipants.length > 0 ? (
            <div className="flex flex-col">
              {(() => {
                const rendered: React.ReactNode[] = []
                let lastCategory = ''
                let lastSubgroup = ''

                filteredParticipants.forEach(p => {
                  const isIntermedioPos = intermedioIndex !== null && p.position === intermedioIndex + 1
                  if (isIntermedioPos) {
                    rendered.push(
                      <div key={`intermedio-${p.position}`} className="flex items-center justify-center gap-2 py-3 px-4 my-3 rounded-xl bg-amber-500/10 border border-dashed border-amber-500/30 select-none">
                        <Award className="w-4 h-4 text-amber-400 animate-pulse" />
                        <span className="font-display text-sm tracking-[0.2em] text-amber-400 uppercase font-bold">Bloque 1</span>
                      </div>
                    )
                  }
                  const cat = p.category ? p.category.split('|')[0].trim().toUpperCase() : 'OPEN'
                  const mod = p.type ? p.type.toUpperCase() : ''
                  const styleLabel = p.style ? p.style.toUpperCase() : ''
                  const subgroup = [mod, styleLabel].filter(Boolean).join(' · ')

                  if (cat !== lastCategory) {
                    rendered.push(
                      <div key={`cat-div-${p.id}`} className="flex items-center gap-2 px-4 pt-6 pb-2 select-none opacity-90">
                        <div className="h-[1px] flex-1 bg-rose-500/20" />
                        <span className="font-display text-2xl tracking-[0.25em] text-rose-400/80 uppercase font-black px-1">{cat}</span>
                        <div className="h-[1px] flex-1 bg-rose-500/20" />
                      </div>
                    )
                    lastCategory = cat
                    lastSubgroup = ''
                  }

                  if (subgroup && subgroup !== lastSubgroup) {
                    rendered.push(
                      <div key={`sub-div-${p.id}`} className="flex items-center gap-2 px-4 pt-4 pb-1 select-none opacity-80">
                        <div className="h-[1px] w-3 bg-emerald-500/20" />
                        <span className="text-sm tracking-wider text-emerald-400/70 uppercase font-extrabold px-1">{subgroup}</span>
                        <div className="h-[1px] flex-1 bg-emerald-500/10" />
                      </div>
                    )
                    lastSubgroup = subgroup
                  }

                  const isCurrent = p.position === event.current_position
                  const isCompleted = p.position < event.current_position
                  const isSupported = !!(selectedAcademy && p.academy && p.academy.trim() === selectedAcademy.trim())
                  const eta = getETA(p.position)

                  rendered.push(
                    <div
                      key={p.id}
                      id={`part-${p.id}`}
                      ref={isCurrent ? activeItemRef : null}
                      className={`py-4 px-4 flex items-center gap-3.5 border-b border-zinc-900 transition-all duration-200 relative ${
                        isCurrent 
                          ? 'bg-gradient-to-r from-yellow-500/[0.08] to-transparent' 
                          : isCompleted 
                          ? 'opacity-40' 
                          : ''
                      }`}
                    >
                      {/* Floating Vertical Pill Indicator */}
                      {isCurrent && (
                        <div className="absolute left-[3px] top-1/2 -translate-y-1/2 w-[3px] h-[55%] bg-gradient-to-b from-yellow-400 to-amber-500 rounded-full animate-pulse-slow" />
                      )}
                      {isSupported && !isCurrent && (
                        <div className="absolute left-[3.5px] top-1/2 -translate-y-1/2 w-[3.5px] h-[35%] bg-cyan-500/80 rounded-full animate-pulse-slow" />
                      )}
                      {/* Position / Index badge */}
                      <div className="shrink-0 flex flex-col items-center justify-center w-10.5 h-10.5">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase block leading-none">Turno</span>
                        <span className="text-base font-bold font-mono text-zinc-300 mt-1 leading-none">
                          {String(p.position).padStart(2, '0')}
                        </span>
                      </div>

                      {/* Act Details */}
                      <div className="flex-1 min-w-0">
                        {(() => {
                          const pType = (p.type || '').trim().toLowerCase()
                          const isSolista = pType === 'solista' || pType === 'solo'
                          const isDueto = pType === 'dueto' || pType === 'duo'
                          const isTrio = pType === 'trío' || pType === 'trio'
                          
                          // For trio: show academy as main title, member names as secondary line
                          const mainText = isTrio ? (p.academy || p.name) : extractDancerName(p)
                          const memberNames = isTrio ? extractDancerName(p) : null
                          // Names are on a separate line only when they differ from the title
                          const hasSecondLine = isTrio && memberNames && memberNames !== mainText
                          // Apply gradient to the title itself ONLY IF it represents names AND the user is supporting this academy
                          const titleGradient = isSupported && (isSolista || isDueto || (isTrio && !hasSecondLine)) && !isCurrent
                          return (
                            <>
                              <div className="flex items-center gap-2">
                                <div className={`flex-1 min-w-0 ${titleGradient ? 'gradient-names-text' : ''}`}>
                                  <ScrollableText
                                    text={mainText}
                                    align="left"
                                    className={`font-display text-lg uppercase font-extrabold leading-tight ${!titleGradient ? (isCurrent ? 'text-yellow-400' : 'text-zinc-200') : ''}`}
                                  />
                                </div>
                                {isCurrent && (
                                  <span className="text-[8px] font-bold bg-yellow-500 text-black px-1.5 py-0.5 rounded-full uppercase shrink-0 tracking-wider">
                                    PISO
                                  </span>
                                )}
                                {isSupported && (
                                  <span className="text-[8px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.5 rounded-full uppercase shrink-0 tracking-wider animate-pulse">
                                    Mi Equipo
                                  </span>
                                )}
                              </div>
                              {hasSecondLine && (
                                <ScrollableText
                                  text={memberNames!}
                                  align="left"
                                  className={`text-[11px] uppercase mt-0.5 font-bold tracking-wide ${isSupported ? 'gradient-names-text' : 'text-zinc-400'}`}
                                />
                              )}
                            </>
                          )
                        })()}

                        <ScrollableText
                          text={formatSubtitle(p, true)}
                          align="left"
                          className="text-sm text-zinc-400 uppercase mt-0.5"
                        />

                        {/* Performance countdown / ETA tags */}
                        {!isCompleted && !isCurrent && eta && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] bg-zinc-900 text-zinc-500 font-bold px-1.5 py-0.5 rounded uppercase">
                              Faltan {eta.turnsLeft} {eta.turnsLeft === 1 ? 'turno' : 'turnos'}
                            </span>
                          </div>
                        )}

                        {isCompleted && (
                          <div className="flex items-center gap-1 mt-0.5 text-zinc-500">
                            <CheckCircle className="w-3 h-3 text-zinc-600" />
                            <span className="text-[9px] font-bold uppercase tracking-wider">Completado</span>
                          </div>
                        )}
                      </div>

                    </div>
                  )
                })
                return rendered
              })()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-500 gap-2">
              <Filter className="w-8 h-8 text-zinc-700 animate-pulse" />
              <p className="text-sm font-bold font-display uppercase tracking-widest">No se encontraron turnos</p>
              <p className="text-xs text-zinc-600 max-w-xs">Intenta modificando tu término de búsqueda.</p>
            </div>
          )}
        </div>
      </main>
      </div>

      {/* Academy Selector Modal */}
      {showAcademyModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex flex-col p-4 animate-fade-in">
          <div className="flex-1 min-h-0 flex flex-col apple-glass-card overflow-hidden bg-zinc-950/95 border border-white/10 max-w-md mx-auto w-full shadow-2xl">
            <div className="bg-black/40 px-4 py-4 flex items-center justify-between shrink-0 border-b border-white/5">
              <div>
                <h3 className="font-display text-lg tracking-wider text-white font-bold uppercase">¿A quién apoyas?</h3>
                <p className="text-[10px] text-zinc-400 mt-1 uppercase tracking-wider font-semibold">Elige tu academia / equipo</p>
              </div>
              <button 
                type="button" 
                onClick={skipAcademy} 
                className="p-1.5 text-zinc-400 hover:text-white transition-colors rounded-full border border-zinc-800/80 bg-zinc-900/20"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>


            {/* Academies List */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2.5">
              {filteredAcademies.length > 0 ? (
                filteredAcademies.map((ac) => {
                  const isSelected = selectedAcademy === ac
                  return (
                    <button
                      key={ac}
                      type="button"
                      onClick={() => selectAcademy(ac)}
                      className={`w-full text-left rounded-2xl px-5 py-4.5 font-display text-sm tracking-wide uppercase transition-all duration-200 border flex items-center justify-between font-extrabold ${
                        isSelected
                          ? 'bg-cyan-500/10 border-cyan-500/60 text-cyan-300 shadow-md shadow-cyan-500/5'
                          : 'bg-zinc-900/20 border-zinc-800/60 text-zinc-300 hover:text-white hover:border-zinc-700'
                      }`}
                    >
                      <span className="truncate pr-2">{ac}</span>
                      {isSelected ? (
                        <CheckCircle className="w-5 h-5 text-cyan-400 shrink-0" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-zinc-600 shrink-0" />
                      )}
                    </button>
                  )
                })
              ) : (
                <div className="text-center text-zinc-500 italic py-12 flex flex-col items-center gap-2">
                  <Filter className="w-8 h-8 text-zinc-800" />
                  <span>No se encontraron academias</span>
                </div>
              )}
            </div>

             {/* Footer buttons */}
            <div className="p-4 bg-black/40 border-t border-white/5 flex flex-col gap-2.5 shrink-0">
              {selectedAcademy && (
                <button
                  type="button"
                  onClick={clearAcademy}
                  className="w-full py-3.5 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-sm font-bold tracking-wider uppercase hover:bg-red-500/10 transition-colors"
                >
                  Quitar Selección
                </button>
              )}
              <button
                type="button"
                onClick={skipAcademy}
                className="w-full py-3.5 rounded-xl border border-zinc-800 bg-transparent text-zinc-400 text-sm font-bold tracking-wider uppercase hover:text-white hover:border-zinc-700 transition-colors"
              >
                Omitir / Ver Programa Completo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screensaver Mode */}
      {showScreensaver && (
        <div 
          onClick={dismissScreensaver}
          className={`fixed inset-0 z-[100] flex flex-col items-center justify-between cursor-pointer select-none overflow-y-auto ${
            isFadingOut ? 'pointer-events-none' : ''
          }`}
        >
          {/* Layer 0: Backdrop blur overlay (at z-0 to blur only the underlying program page) */}
          <div 
            className={`fixed bg-black/45 z-0 ${
              isFadingOut 
                ? 'opacity-0 backdrop-blur-none transition-all duration-500' 
                : 'animate-screensaver-backdrop-enter'
            }`}
            style={{
              top: '-10vh',
              bottom: '-20vh',
              left: '-10vw',
              right: '-10vw'
            }}
          />

          {/* Layer 10: Big logo (placed at z-10, above the blurred program backdrop with custom animations, with entrance fade-in) */}
          <div className={`absolute inset-0 z-10 pointer-events-none ${
            isFadingOut ? '' : 'animate-screensaver-logo-fade-in'
          }`}>
            <div className={`absolute inset-0 flex items-center justify-center ${
              isFadingOut ? 'animate-logo-exit-full' : 'animate-logo-idle'
            }`}>
              <Image src="/logo.png" alt="Logo Fondo" width={320} height={230} className="object-contain" />
            </div>
          </div>

          {/* Layer 20: Content elements */}
          <div className={`relative z-20 flex-1 flex flex-col items-center justify-between w-full p-6 ${
            isFadingOut 
              ? 'opacity-0 scale-95 transition-all duration-300' 
              : 'animate-screensaver-content-enter'
          }`}>
            {/* Close button */}
            <button 
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                dismissScreensaver()
              }}
              className="absolute top-6 right-6 p-2.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all z-20 cursor-pointer"
              aria-label="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Top Header: Event & Live Stage Status */}
            <div className="w-full max-w-sm flex flex-col items-center gap-2 z-10 text-center">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em]">Dance4ever en Vivo</span>
              <h2 className="font-display text-base font-black uppercase tracking-wider text-white leading-none">
                {event.name}
              </h2>
              {current && (
                <div className="mt-2 bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1 flex items-center gap-1.5 justify-center">
                  <Volume2 className="w-3.5 h-3.5 text-yellow-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">
                    En Escenario: <strong className="text-white">{extractDancerName(current)}</strong> (Turno #{current.position})
                  </span>
                </div>
              )}
            </div>

            {/* Middle: Game Card (Support Tap) & Leaderboard */}
            <div className="w-full max-w-sm flex flex-col gap-4 z-10">
              {/* Game Card */}
              <div 
                onClick={(e) => e.stopPropagation()}
                className="bg-black/60 border border-zinc-800/80 rounded-2xl p-4 flex flex-col items-center gap-3 relative overflow-hidden"
              >
                {selectedAcademy ? (
                  <>
                    <div className="text-center">
                      <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Tu Academia</span>
                      <h3 className="font-display text-sm font-extrabold uppercase tracking-wide text-cyan-400 mt-0.5">
                        {selectedAcademy}
                      </h3>
                    </div>

                    {/* Tap Button with Particle Spawner */}
                    <button
                      type="button"
                      onClick={handleSupportTap}
                      className="w-full py-3.5 bg-gradient-to-r from-cyan-600 via-teal-500 to-cyan-600 bg-[length:200%_auto] hover:bg-right rounded-xl font-display text-xs font-black uppercase tracking-widest text-white hover:scale-[1.01] hover:shadow-[0_0_25px_rgba(6,182,212,0.45)] active:scale-[0.98] transition-all duration-500 relative overflow-hidden flex items-center justify-center gap-2 cursor-pointer border border-white/20 shadow-[0_4px_20px_rgba(6,182,212,0.25)] group"
                    >
                      {/* Active sliding sheen overlay */}
                      <span className="absolute inset-0 w-[50%] h-full bg-white/20 skew-x-[-20deg] -translate-x-[150%] group-hover:animate-button-shine" />
                      <Heart className="w-4 h-4 fill-current text-white animate-pulse" />
                      <span>¡Toca para enviar apoyo!</span>
                      
                      {/* Floating Particles */}
                      {particles.map(p => (
                        <span
                          key={p.id}
                          className="animate-particle absolute text-cyan-300 pointer-events-none"
                          style={{ left: p.x, top: p.y }}
                        >
                          <Heart className="w-4 h-4 fill-current" />
                        </span>
                      ))}
                    </button>
                    <p className="text-[9px] text-zinc-400 font-semibold uppercase tracking-wider text-center">
                      Apoyo acumulado: {supportScores[selectedAcademy] || 0}
                    </p>
                  </>
                ) : (
                  <div className="text-center py-2 flex flex-col items-center gap-2 w-full">
                    <span className="text-xs text-zinc-300 font-bold uppercase">¿A qué academia apoyas hoy?</span>
                    <button
                      type="button"
                      onClick={() => {
                        dismissScreensaver()
                        setShowAcademyModal(true)
                      }}
                      className="w-full py-3 bg-zinc-950 border border-zinc-800 rounded-xl font-display text-xs font-extrabold uppercase tracking-wider text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors cursor-pointer"
                    >
                      Seleccionar mi Academia
                    </button>
                  </div>
                )}
              </div>

              {/* Leaderboard Card */}
              <div className="bg-black/60 border border-zinc-800/80 rounded-2xl p-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-yellow-500" />
                    Academias Más Apoyadas
                  </span>
                  <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">En Vivo</span>
                </div>
                
                <div className="space-y-2">
                  {leaderboard.length > 0 ? (
                    leaderboard.map((item, idx) => {
                      const maxScore = Math.max(...leaderboard.map(l => l.score), 1)
                      const pct = (item.score / maxScore) * 100
                      const colors = [
                        'from-yellow-400 to-amber-500',
                        'from-zinc-400 to-slate-500',
                        'from-orange-400 to-amber-700'
                      ]
                      return (
                        <div key={item.name} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-[10px] uppercase font-bold">
                            <span className="truncate pr-2 text-zinc-300 max-w-[200px]">
                              {idx + 1}. {item.name}
                            </span>
                            <span className="font-mono text-zinc-400">{item.score} pts</span>
                          </div>
                          <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                            <div 
                              className={`h-full rounded-full bg-gradient-to-r ${colors[idx] || 'from-zinc-500 to-zinc-600'} transition-all duration-500`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-center py-2 text-[10px] text-zinc-500 uppercase tracking-widest">
                      Ningún apoyo registrado aún. ¡Sé el primero!
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Share QR & Event Info */}
            <div 
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm flex items-stretch gap-3 z-10"
            >
              {/* Share QR Code */}
              {portalUrl && (
                <div className="bg-black/60 border border-zinc-800/80 rounded-2xl p-3.5 flex flex-col items-center justify-center gap-2 shrink-0 w-[115px] text-center">
                  <div className="p-1.5 bg-white rounded-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&color=000000&bgcolor=ffffff&qzone=1&data=${encodeURIComponent(portalUrl)}`}
                      alt="QR Code"
                      width={64}
                      height={64}
                      className="w-16 h-16 select-none pointer-events-none"
                    />
                  </div>
                  <span className="text-[7.5px] text-zinc-400 font-extrabold uppercase tracking-wider flex items-center gap-1 leading-none justify-center">
                    <Smartphone className="w-2.5 h-2.5" /> Escanea
                  </span>
                </div>
              )}
              
              {/* Event Info / Call to Action */}
              <div className="flex-1 bg-black/60 border border-zinc-800/80 rounded-2xl p-3.5 flex flex-col justify-center gap-1.5">
                <span className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Share2 className="w-3 h-3 text-cyan-400" />
                  Comparte
                </span>
                <p className="text-[10px] text-zinc-200 font-bold uppercase tracking-wide leading-normal">
                  Sube tus historias con el hashtag:
                </p>
                <span className="text-xs text-yellow-500 font-black tracking-widest uppercase">
                  #Dance4everMX
                </span>
                <p className="text-[8px] text-zinc-500 font-semibold uppercase leading-tight">
                  ¡Etiquétanos en tus historias para poder compartirlas en nuestro Instagram!
                </p>
              </div>
            </div>

            {/* Social Network Links */}
            <div 
              onClick={(e) => e.stopPropagation()}
              className="flex justify-center z-10 w-full max-w-sm"
            >
              <a 
                href="https://www.instagram.com/competencia.dance4ever?igsh=MWRnN3l4djN6Z2prag==" 
                target="_blank" 
                rel="noopener noreferrer"
                className="px-6 py-3 bg-black/60 border border-zinc-800/80 rounded-full text-zinc-300 hover:text-cyan-400 hover:border-cyan-500/50 hover:bg-cyan-500/10 transition-all duration-300 active:scale-95 cursor-pointer flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider w-full"
              >
                <InstagramIcon className="w-4 h-4" />
                Síguenos en Instagram
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const InstagramIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    {...props}
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
)


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
