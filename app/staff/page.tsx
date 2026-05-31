'use client'
import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { supabase, Participant, Event } from '@/lib/supabase'
import { useFitCount } from '@/lib/useFitCount'
import { QrCode, X, ListOrdered, Monitor } from 'lucide-react'
import QRCode from 'qrcode'
import { participantMatches } from '@/lib/search'
import SearchBar from '@/components/SearchBar'
import { subscribePortalConfig, PortalConfig } from '@/lib/portalConfig'
import PortalLockout from '@/components/PortalLockout'

const PILL_PX = 48
const PILL_GAP = 4

export default function StaffPage() {
  const [event, setEvent] = useState<Event | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [qrUrl, setQrUrl] = useState('')
  const [mcQrUrl, setMcQrUrl] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [showProgram, setShowProgram] = useState(false)
  const [activeAnnouncement, setActiveAnnouncement] = useState('')
  const [programSearch, setProgramSearch] = useState('')
  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null)

  useEffect(() => {
    if (!event?.id) return
    const unsubscribe = subscribePortalConfig(event.id, (config) => {
      setPortalConfig(config)
    })
    return () => unsubscribe()
  }, [event?.id])

  useEffect(() => { if (!showProgram) setProgramSearch('') }, [showProgram])

  useEffect(() => { loadLatestEvent() }, [])

  const loadParticipants = useCallback(async (eventId: string) => {
    const { data } = await supabase.from('participants').select('*').eq('event_id', eventId).order('position')
    if (data) setParticipants(data)
  }, [])

  useEffect(() => {
    if (!event) return
    const channel = supabase
      .channel('staff-' + event.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${event.id}` },
        (payload) => setEvent(payload.new as Event))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `event_id=eq.${event.id}` },
        () => loadParticipants(event.id))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [event?.id, loadParticipants])

  // Subscribing to live broadcast channel for voiceovers and announcements
  useEffect(() => {
    if (!event?.id) return
    const ch = supabase.channel(`broadcast-${event.id}`, {
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
  }, [event?.id])

  async function loadLatestEvent() {
    const { data } = await supabase.from('events').select('*').order('created_at', { ascending: false }).limit(1).single()
    if (data) {
      setEvent(data)
      loadParticipants(data.id)
      generateQr(data.id)
    }
  }

  async function generateQr(eventId: string) {
    const coachUrl = `${window.location.origin}/coach/${eventId}`
    const mcUrl = `${window.location.origin}/mc/${eventId}`
    const [coachQr, mcQr] = await Promise.all([
      QRCode.toDataURL(coachUrl, { width: 400, margin: 2 }),
      QRCode.toDataURL(mcUrl, { width: 400, margin: 2 }),
    ])
    setQrUrl(coachQr)
    setMcQrUrl(mcQr)
  }

  const current = participants.find(p => p.position === event?.current_position)
  const onDeck = event ? participants.filter(
    p => p.position > event.current_position && p.position <= event.current_position + event.on_deck_count
  ) : []
  const upcomingAll = event ? participants.filter(
    p => p.position > event.current_position + event.on_deck_count
  ) : []
  const { ref: upcomingRef, count: upcomingFit } = useFitCount(PILL_PX, PILL_GAP)
  const upcoming = upcomingAll.slice(0, upcomingFit)

  if (portalConfig && !portalConfig.enableOperations) {
    return <PortalLockout portalName="Operativo (Staff)" />
  }

  return (
    <div className="h-[100dvh] bg-neutral-900 text-white flex flex-col overflow-hidden select-none">
      {/* Spacer for iOS Notch */}
      <div className="shrink-0 bg-black" style={{ height: 'env(safe-area-inset-top, 0px)' }} />

      {/* Header: LOGO izq | STAFF centro | iconos derecha */}
      <header className="bg-black px-3 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <Image src="/logo.png" alt="Dance4ever" width={56} height={40} priority className="shrink-0" />
          <h1 className="font-display text-3xl tracking-[0.2em] text-fuchsia-500 leading-none">STAFF</h1>
        </div>
        {event ? (
          <div className="flex items-center gap-4 shrink-0">
            <button onClick={() => setShowProgram(true)} className="text-white active:text-fuchsia-500" title="Ver programa completo">
              <ListOrdered className="w-6 h-6" />
            </button>
            <button onClick={() => setShowQr(true)} className="text-white active:text-fuchsia-500" title="Compartir códigos QR">
              <QrCode className="w-6 h-6" />
            </button>
          </div>
        ) : <div className="w-px" />}
      </header>

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
          <div className="animate-marquee-custom font-display text-base tracking-[0.2em] text-yellow-300 font-bold uppercase">
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

      {event ? (
        <>
          {event.awards_mode ? (
            <div className="flex-1 min-h-0 flex flex-col bg-black text-fuchsia-500 px-4">
              <div className="flex-1 flex items-center justify-center text-center animate-pulse">
                <p className="font-display text-7xl leading-none uppercase tracking-wider">Premiación</p>
              </div>
            </div>
          ) : (
            <>
              {/* EN ESCENARIO panel — arriba */}
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

              {/* WAITING ZONE shrink-0 + UPCOMING flex-1 */}
              <div className="flex flex-col min-h-0 flex-1 px-2 pt-1 pb-2 gap-0.5 overflow-hidden">
                <p className="text-center font-display text-base tracking-[0.4em] text-gray-300 leading-none shrink-0">WAITING ZONE</p>

                <div className="space-y-1 shrink-0">
                  {onDeck.map(p => (
                    <Pill key={p.id} p={p} variant={p.present ? 'green' : 'red'} />
                  ))}
                  {onDeck.length === 0 && (
                    <p className="text-xs text-gray-500 italic text-center py-1">Sin participantes en espera</p>
                  )}
                </div>

                <div className="border-t border-neutral-700/60 my-1 shrink-0" />

                <div ref={upcomingRef} className="flex-1 min-h-0 overflow-hidden flex flex-col gap-1">
                  {upcoming.map(p => (
                    <Pill key={p.id} p={p} variant="gray" grow />
                  ))}
                  {upcomingAll.length === 0 && participants.length > 0 && (
                    <p className="text-xs text-gray-500 italic text-center py-1">No hay más turnos</p>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-6 gap-4">
          <Image src="/logo.png" alt="Dance4ever" width={180} height={130} priority />
          <p className="text-center font-display text-lg tracking-wider">No hay evento activo</p>
        </div>
      )}

      {/* QR Modal */}
      {showQr && qrUrl && mcQrUrl && event && (
        <Modal onClose={() => setShowQr(false)}>
          <a
            href={`/coach/${event.id}`}
            target="_blank"
            rel="noreferrer"
            className="block w-full bg-neutral-100 active:bg-neutral-200 rounded-xl p-3 space-y-2 text-black"
          >
            <h3 className="font-display text-lg tracking-widest text-center font-bold">COACHES</h3>
            <img src={qrUrl} alt="QR Coaches" className="w-full rounded-lg" />
            <p className="text-[10px] text-gray-500 text-center break-all">{typeof window !== 'undefined' ? window.location.origin : ''}/coach/{event.id}</p>
          </a>

          <a
            href={`/mc/${event.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 w-full bg-neutral-100 active:bg-neutral-200 rounded-xl p-2 text-black"
          >
            <img src={mcQrUrl} alt="QR Presentador" className="w-1/4 aspect-square rounded-md" />
            <div className="flex-1 min-w-0">
              <h3 className="font-display text-sm tracking-widest flex items-center gap-1 font-bold">
                <Monitor className="w-4 h-4 text-black" /> PRESENTADOR
              </h3>
              <p className="text-[10px] text-gray-500 break-all mt-1">{typeof window !== 'undefined' ? window.location.origin : ''}/mc/{event.id}</p>
            </div>
          </a>
        </Modal>
      )}

      {/* Programa Completo modal */}
      {showProgram && event && (
        <div className="fixed inset-0 bg-neutral-900 z-50 flex flex-col">
          <div className="bg-black px-4 py-3 flex items-center justify-between shrink-0">
            <h3 className="font-display text-2xl tracking-widest text-fuchsia-500">PROGRAMA</h3>
            <button onClick={() => setShowProgram(false)} aria-label="Cerrar"><X className="w-6 h-6" /></button>
          </div>
          <SearchBar value={programSearch} onChange={setProgramSearch} />
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            {(() => {
              if (participants.length === 0) return <p className="text-center text-gray-500 italic py-6">Sin programa</p>
              const filtered = participants.filter(p => participantMatches(p, programSearch))
              if (filtered.length === 0) return <p className="text-center text-gray-500 italic py-6">Sin resultados</p>
              return filtered.map(p => {
                const isOnStage = event.current_position === p.position
                const isOnDeck = !isOnStage && p.position > event.current_position && p.position <= event.current_position + event.on_deck_count
                const done = p.position < event.current_position
                const variant = isOnStage ? 'green' : isOnDeck ? (p.present ? 'green' : 'red') : done ? 'gray' : 'gray'
                return <Pill key={p.id} p={p} variant={variant} />
              })
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

function Pill({ p, variant, onClick, grow }: { p: Participant, variant: 'green' | 'red' | 'gray', onClick?: () => void, grow?: boolean }) {
  const bg =
    variant === 'green' ? 'bg-green-800 active:bg-green-700' :
    variant === 'red' ? 'bg-red-900 active:bg-red-800' :
    'bg-neutral-700'
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={`w-full rounded-md px-3 py-1.5 flex items-center gap-2 ${bg} ${onClick ? 'text-left' : ''} ${grow ? 'flex-1 min-h-0' : ''} transition-colors`}>
      <span className="font-display text-base shrink-0 w-10 text-center leading-none opacity-75">#{p.position}</span>
      <p className="flex-1 min-w-0 font-display text-2xl uppercase truncate leading-none text-center">{p.name}</p>
      <div className="shrink-0 leading-none text-right max-w-[30%]">
        {p.academy && <p className="font-display text-sm uppercase truncate">{p.academy}</p>}
        {p.category && <p className="font-display text-[10px] uppercase opacity-70 truncate mt-1">{p.category}</p>}
      </div>
    </Tag>
  )
}

function Modal({ children, onClose }: { children: React.ReactNode, onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white text-black rounded-2xl p-5 max-w-sm w-full space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex justify-end -mt-1 -mr-1">
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
