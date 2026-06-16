'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { supabase, Participant, Event } from '@/lib/supabase'
import { useFitCount } from '@/lib/useFitCount'
import { QrCode, X, ListOrdered, Monitor, Settings } from 'lucide-react'
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
  const [presentadorQrUrl, setPresentadorQrUrl] = useState('')
  const [showQr, setShowQr] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [showProgram, setShowProgram] = useState(false)
  const [activeAnnouncement, setActiveAnnouncement] = useState('')
  const [programSearch, setProgramSearch] = useState('')
  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null)
  const [mode, setMode] = useState<'simple' | 'manager'>('simple')
  const [managerPasswordInput, setManagerPasswordInput] = useState('')
  const [showManagerPasswordModal, setShowManagerPasswordModal] = useState(false)
  const [managerPasswordError, setManagerPasswordError] = useState(false)
  const [onDeckInput, setOnDeckInput] = useState(3)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [errorState, setErrorState] = useState<string | null>(null)
  const pendingUpdatesRef = useRef<Map<number, { present: boolean | null, time: number }>>(new Map())
  const blockUpcomingClicksRef = useRef(0)

  useEffect(() => {
    if (!event?.id) return
    const unsubscribe = subscribePortalConfig(event.id, (config) => {
      setPortalConfig(config)
    })
    return () => unsubscribe()
  }, [event?.id])

  useEffect(() => { if (!showProgram) setProgramSearch('') }, [showProgram])

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `event_id=eq.${event.id}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Participant
            const pending = pendingUpdatesRef.current.get(updated.id)
            
            // If we have a very recent local update (less than 2.5 seconds ago)
            if (pending && Date.now() - pending.time < 2500) {
              // Only update if the database state has caught up to our latest optimistic state
              if (updated.present !== pending.present) {
                // Ignore this update because it's a stale realtime event from a previous click
                return
              } else {
                // Database has caught up, we can clear the pending reference
                pendingUpdatesRef.current.delete(updated.id)
              }
            }
            
            setParticipants(prev => prev.map(x => x.id === updated.id ? { ...x, present: updated.present } : x))
          } else {
            // For INSERT or DELETE, we reload to be 100% safe
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
    try {
      const { data, error } = await supabase.from('events').select('*').order('created_at', { ascending: false }).limit(1).single()
      if (error) {
        setErrorState(error.message)
      } else if (data) {
        setEvent(data)
        setOnDeckInput(data.on_deck_count)
        loadParticipants(data.id)
        generateQr(data.id)
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
    const [coachQr, presentadorQr] = await Promise.all([
      QRCode.toDataURL(coachUrl, { width: 400, margin: 2 }),
      QRCode.toDataURL(presentadorUrl, { width: 400, margin: 2 }),
    ])
    setQrUrl(coachQr)
    setPresentadorQrUrl(presentadorQr)
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
        next = false // gray -> red
      } else if (p.present === false) {
        next = true  // red -> green
      } else {
        next = null  // green -> gray (normal)
      }
    } else {
      // Non-manager can only toggle between red and green
      if (p.present === false) {
        next = true  // red -> green
      } else if (p.present === true) {
        next = false // green -> red (cannot return to gray)
      } else {
        return // Ignore gray cards for non-managers
      }
    }
    
    // 1. Optimistic Update (instant UI feedback)
    setParticipants(prev => prev.map(x => x.id === p.id ? { ...x, present: next as any } : x))
    
    // 2. Lock it locally with a timestamp
    pendingUpdatesRef.current.set(p.id, { present: next, time: Date.now() })
    
    // 3. Dispatch to Supabase
    await supabase.from('participants').update({ present: next }).eq('id', p.id)

    // 4. If returned to normal, potentially shrink waiting zone
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
  const nextParticipants = event ? participants.filter(p => p.position > event.current_position) : []
  const { ref: listRef, count: listFit } = useFitCount(70, 0)
  const visibleParticipants = nextParticipants.slice(0, listFit)

  if (portalConfig && !portalConfig.enableOperations) {
    return <PortalLockout portalName="Operativo (Staff)" />
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

        {/* Spacer for iOS Notch */}
        <div className="shrink-0 bg-black" style={{ height: 'env(safe-area-inset-top, 0px)' }} />

        {/* Header: LOGO izq | STAFF centro | iconos derecha */}
        <header className="apple-glass-header px-4 py-3.5 flex items-center justify-between shrink-0 relative z-20">
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <Image src="/logo.png" alt="Dance4ever" width={46} height={32} priority className="shrink-0 opacity-90" />
            <h1 className="font-display text-2xl tracking-[0.15em] text-white leading-none font-bold uppercase">STAFF</h1>
          </div>
          {event ? (
            <div className="flex items-center gap-4 shrink-0">
  
              <button onClick={() => setShowProgram(true)} className="text-zinc-400 hover:text-white transition-colors" title="Ver programa completo">
                <ListOrdered className="w-6 h-6" />
              </button>
              <button onClick={() => setShowQr(true)} className="text-zinc-400 hover:text-white transition-colors" title="Compartir códigos QR">
                <QrCode className="w-6 h-6" />
              </button>
              <button onClick={() => setShowSetup(true)} className="text-zinc-400 hover:text-white transition-colors" title="Ajustes de operación">
                <Settings className="w-6 h-6" />
              </button>
            </div>
          ) : <div className="w-px" />}
        </header>

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
          <>
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
              <>
                {/* EN ESCENARIO panel — arriba */}
                 <div className={`${current ? 'gold-card text-black' : 'neutral-header-card text-white'} px-4 py-4 shrink-0 text-center relative overflow-hidden mb-3 -mx-4`}>
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

                {/* LISTA COMPLETA DE PRÓXIMOS TURNOS */}
                <div className="flex flex-col min-h-0 flex-1 px-4 pt-0 pb-0 gap-0 overflow-hidden relative z-10">
                  <div ref={listRef} className="flex-1 min-h-0 overflow-hidden flex flex-col gap-0 -mx-4">
                    {visibleParticipants.map(p => {
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

                      return (
                        <Pill 
                          key={p.id} 
                          p={p} 
                          variant={p.present === true ? 'green' : p.present === false ? 'red' : 'gray'} 
                          grow
                          onClick={clickHandler}
                        />
                      )
                    })}
                    {(() => {
                      if (visibleParticipants.length === 0) return null
                      const lastP = visibleParticipants[visibleParticipants.length - 1]
                      const lastBg =
                        lastP.present === true ? 'boxless-item-green' :
                        lastP.present === false ? 'boxless-item-red' :
                        'boxless-item'
                      return (
                        <div className={`w-full shrink-0 ${lastBg}`} style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
                      )
                    })()}
                    {visibleParticipants.length === 0 && participants.length > 0 && (
                      <p className="text-sm text-zinc-600 italic text-center py-4">No hay más turnos</p>
                    )}
                  </div>
                </div>
              </>
            )}


          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-zinc-500 p-6 gap-4 z-10">
            <Image src="/logo.png" alt="Dance4ever" width={180} height={130} priority className="opacity-80" />
            <p className="text-center font-display text-lg tracking-wider font-semibold">No hay evento activo</p>
          </div>
        )}

        {/* QR Modal */}
        {showQr && qrUrl && presentadorQrUrl && event && (
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
          </Modal>
        )}

        {/* Simplified Settings Modal */}
        {showSetup && event && (
          <Modal onClose={() => setShowSetup(false)}>
            <h2 className="font-display text-xl tracking-widest text-white uppercase font-bold text-center border-b border-white/5 pb-2">
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
                    className={`py-2 px-3 rounded-xl font-bold text-sm border transition-all ${
                      mode === 'simple'
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    Buscador
                  </button>
                  <button
                    onClick={() => changeMode('manager')}
                    className={`py-2 px-3 rounded-xl font-bold text-sm border transition-all ${
                      mode === 'manager'
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    Manager
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500 leading-snug">
                  El modo <b>Manager</b> permite activar coreografías por venir y gestionar la zona de espera en tiempo real.
                </p>
              </div>
            </div>
            
            <button
              onClick={() => setShowSetup(false)}
              className="w-full mt-4 apple-btn apple-btn-primary py-3 text-sm uppercase tracking-widest"
            >
              Aceptar
            </button>
          </Modal>
        )}

        {/* Complete Program Modal */}
        {showProgram && event && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex flex-col p-4 animate-fade-in">
            <div className="flex-1 min-h-0 flex flex-col apple-glass-card overflow-hidden bg-zinc-950/80 border border-white/10">
              <div className="bg-black/30 px-4 py-3.5 flex items-center justify-between shrink-0 border-b border-white/5">
                <h3 className="font-display text-xl tracking-widest text-white font-bold">PROGRAMA</h3>
                <button onClick={() => setShowProgram(false)} className="p-1 hover:text-zinc-400 transition-colors" aria-label="Cerrar"><X className="w-6 h-6" /></button>
              </div>
              <SearchBar value={programSearch} onChange={setProgramSearch} />
              <div className="flex-1 min-h-0 overflow-y-auto py-3 px-0">
                {(() => {
                  if (participants.length === 0) return <p className="text-center text-zinc-600 italic py-6">Sin programa</p>
                  const filtered = participants.filter(p => participantMatches(p, programSearch))
                  if (filtered.length === 0) return <p className="text-center text-zinc-600 italic py-6">Sin resultados</p>

                  const rendered: React.ReactNode[] = []
                  let lastCategory = ''
                  let lastSubgroup = ''
                  
                  filtered.forEach(p => {
                    const cat = p.category || 'Sin categoría'
                    const subgroup = [p.style, p.type].filter(Boolean).join(' · ')
                    const isOnStage = event.current_position === p.position
                    const done = p.position < event.current_position
                    const variant = isOnStage ? 'green' : done ? 'done' : (p.present === true ? 'green' : p.present === false ? 'red' : 'gray')
                    
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
                          <span className="font-display text-[8px] tracking-[0.2em] text-zinc-650 uppercase font-semibold">{subgroup}</span>
                          <div className="h-px flex-1 bg-white/5" />
                        </div>
                      )
                      lastSubgroup = subgroup
                    }
                    
                    rendered.push(
                      <div key={p.id} ref={isOnStage ? activeItemRef : undefined} className="w-full mb-1.5">
                        <Pill 
                          p={p} 
                          variant={variant} 
                          onClick={(!isOnStage && !done && (mode === 'manager' || p.present === true || p.present === false)) ? async () => {
                            const isUpcoming = p.position > event.current_position + event.on_deck_count
                            if (isUpcoming) {
                              if (mode !== 'manager') return
                              const newCount = p.position - event.current_position
                              if (newCount > event.on_deck_count) {
                                await updateOnDeck(newCount)
                              }
                            }
                            await togglePresentCycle(p)
                          } : undefined}
                        />
                      </div>
                    )
                  })
                  return rendered
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Manager Password Modal */}
        {showManagerPasswordModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[60] flex items-center justify-center p-4 animate-fade-in">
            <div className="apple-glass-card bg-zinc-950/90 border border-white/10 p-6 max-w-xs w-full space-y-4 text-white">
              <div className="flex justify-end -mt-2 -mr-2">
                <button onClick={() => setShowManagerPasswordModal(false)} className="p-1.5 hover:text-zinc-400 transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <h2 className="font-display text-lg tracking-widest text-white text-center font-bold uppercase">Modo Manager</h2>
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
                className="w-full apple-btn apple-btn-primary py-3 text-sm uppercase tracking-widest"
              >
                Ingresar
              </button>
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

function estimateStaffPillHeight(p: Participant): number {
  const name = extractDancerName(p) || ''
  const maxChars = 34
  const lines = Math.max(1, Math.ceil(name.length / maxChars))
  return 70 + (lines - 1) * 28
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

// Keep for backward compatibility with main screen Pill
function pillDisplayName(p: Participant): string {
  return extractDancerName(p)
}

function Pill({ p, variant, onClick, grow }: { p: Participant, variant: 'green' | 'red' | 'gray' | 'done', onClick?: () => void, grow?: boolean }) {
  const bg =
    variant === 'green' ? 'boxless-item-green' :
    variant === 'red' ? 'boxless-item-red' :
    variant === 'done' ? 'boxless-item-done' :
    'boxless-item'
  const dancerName = pillDisplayName(p)
  const subtitle = formatSubtitle(p)
  const growClass = grow ? 'flex-1 min-h-0' : 'shrink-0 min-h-[48px]'

  const numberColor = 
    variant === 'green' ? 'text-emerald-400 font-extrabold' :
    variant === 'red' ? 'text-red-400 font-bold' :
    variant === 'done' ? 'text-zinc-600' :
    'text-zinc-500 font-semibold'

  const titleColor =
    variant === 'green' ? 'text-emerald-400 font-bold' :
    variant === 'red' ? 'text-red-400 font-bold' :
    variant === 'done' ? 'text-zinc-500' :
    'text-white'

  const subtitleColor =
    variant === 'green' ? 'text-emerald-200/50' :
    variant === 'red' ? 'text-red-200/50' :
    variant === 'done' ? 'text-zinc-600' :
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
      className={`w-full flex items-center ${bg} ${onClick ? 'text-left cursor-pointer select-none outline-none' : ''} transition-all duration-200 z-10 overflow-hidden ${growClass}`}
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
      <div className="apple-glass-card bg-zinc-950/85 border border-white/10 p-6 max-w-sm w-full space-y-4 text-white" onClick={e => e.stopPropagation()}>
        <div className="flex justify-end -mt-2 -mr-2">
          <button onClick={onClose} className="p-1.5 hover:text-zinc-400 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}
