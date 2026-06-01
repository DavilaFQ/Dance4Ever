'use client'
import { useEffect, useState, use, useCallback } from 'react'
import Image from 'next/image'
import { supabase, Participant, Event } from '@/lib/supabase'
import { participantMatches } from '@/lib/search'
import SearchBar from '@/components/SearchBar'
import { X } from 'lucide-react'
import { subscribePortalConfig, PortalConfig } from '@/lib/portalConfig'
import PortalLockout from '@/components/PortalLockout'
import PullToRefresh from '@/components/PullToRefresh'


type Props = { params: Promise<{ eventId: string }> }

export default function MCPage({ params }: Props) {
  const { eventId } = use(params)
  const [event, setEvent] = useState<Event | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [notFound, setNotFound] = useState(false)
  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null)

  const [showProgram, setShowProgram] = useState(false)
  const [search, setSearch] = useState('')
  const [activeAnnouncement, setActiveAnnouncement] = useState('')
  const [audioUnlocked, setAudioUnlocked] = useState(false)

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
    const channelId = `mc-${eventId}-${Math.random().toString(36).slice(2, 9)}`
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${eventId}` },
        (payload) => setEvent(payload.new as Event))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `event_id=eq.${eventId}` },
        () => loadAll())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [eventId, loadAll])

  if (notFound) {
    return (
      <div className="h-[100dvh] bg-black flex items-center justify-center text-fuchsia-500 font-display text-3xl tracking-widest">
        EVENTO NO ENCONTRADO
      </div>
    )
  }

  if (portalConfig && !portalConfig.enableOperations) {
    return <PortalLockout portalName="Operativo (MC)" />
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
        <Image src="/logo.png" alt="Dance4ever" width={56} height={40} priority className="shrink-0" />
      </header>

      {event.awards_mode ? (
        <div className="flex-1 min-h-0 flex flex-col bg-black text-fuchsia-500 px-4">
          <div className="flex-1 flex items-center justify-center text-center animate-pulse">
            <p className="font-display text-6xl leading-none uppercase tracking-wider">Premiación</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-[3] min-h-0 bg-fuchsia-500 text-white flex flex-col items-center justify-center px-4 py-3 text-center overflow-hidden">
            {current ? (
              <>
                <p className="font-display text-xl tracking-[0.4em] leading-none mb-2">EN ESCENARIO</p>
                <p className="font-display text-7xl leading-none">#{String(current.position).padStart(2, '0')}</p>
                <p className="font-display text-5xl uppercase leading-tight mt-4 break-words max-w-full">{current.name}</p>
                <div className="mt-4 space-y-1">
                  {current.academy && <p className="font-display text-2xl uppercase opacity-80 leading-tight">{current.academy}</p>}
                  {(current.category || current.type) && (
                    <p className="font-display text-xl uppercase opacity-70 leading-tight">
                      {[current.category, current.type].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </>
            ) : event.current_position === 0 ? (
              <p className="font-display text-5xl leading-none">POR INICIAR</p>
            ) : (
              <p className="font-display text-3xl leading-none">— PROGRAMA TERMINADO —</p>
            )}
          </div>

          <div className="flex-1 min-h-0 bg-neutral-900 border-t-2 border-fuchsia-500/40 flex flex-col items-center justify-center px-4 py-2 text-center overflow-hidden">
            {next ? (
              <>
                <p className="font-display text-sm tracking-[0.4em] text-fuchsia-500 leading-none mb-1">SIGUIENTE</p>
                <div className="flex items-baseline gap-2 max-w-full">
                  <span className="font-display text-3xl text-fuchsia-500 leading-none shrink-0">#{next.position}</span>
                  <p className="font-display text-2xl uppercase leading-tight truncate min-w-0">{next.name}</p>
                </div>
                <p className="font-display text-base uppercase opacity-70 leading-tight mt-1 truncate max-w-full">
                  {[next.academy, next.category].filter(Boolean).join(' · ')}
                </p>
              </>
            ) : (
              <p className="text-gray-500 italic font-display text-lg tracking-wider">— FIN DEL PROGRAMA —</p>
            )}
          </div>
        </>
      )}

      <button
        onClick={() => setShowProgram(true)}
        className="shrink-0 bg-green-500 active:bg-green-600 text-black py-3 font-display text-2xl tracking-widest"
      >
        PROGRAMA COMPLETO
      </button>

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
              return filtered.map(p => {
                const isOnStage = event.current_position === p.position
                const done = p.position < event.current_position
                const bg = isOnStage ? 'bg-fuchsia-500 text-white' : done ? 'bg-neutral-800/60 opacity-40' : 'bg-neutral-700'
                return (
                  <div key={p.id} className={`w-full rounded-md px-3 py-2 flex items-center gap-3 ${bg}`}>
                    <span className="font-display text-3xl shrink-0 leading-none">#{p.position}</span>
                    <p className="flex-1 min-w-0 font-display text-2xl uppercase truncate leading-none">{p.name}</p>
                    <div className="text-right shrink-0 leading-tight max-w-[45%]">
                      {p.academy && <p className="font-display text-xl uppercase truncate">{p.academy}</p>}
                      {p.category && <p className="font-display text-sm uppercase opacity-70 truncate">{p.category}</p>}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        </div>
      )}
    </div>
    </PullToRefresh>
  )
}
