'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import Image from 'next/image'
import { supabase, Participant, Event, Coach } from '@/lib/supabase'
import { parseExcelProgram } from '@/lib/parseExcel'
import { useFitCount } from '@/lib/useFitCount'
import { ChevronRight, ChevronLeft, Upload, QrCode, Settings, X, Plus, RotateCcw, ListOrdered, Monitor, BarChart3, FileSpreadsheet, FileText, Star, Link2, RefreshCw, ClipboardCopy } from 'lucide-react'
import QRCode from 'qrcode'
import { participantMatches } from '@/lib/search'
import SearchBar from '@/components/SearchBar'
import ParticipantEditor from '@/components/ParticipantEditor'
import StatsPanel from '@/components/StatsPanel'
import { exportExcel, exportPdf, exportRegistrations } from '@/lib/export'

type EditorState = { kind: 'edit', p: Participant } | { kind: 'create' } | null

const PILL_PX = 48
const PILL_GAP = 4

function generateToken(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export default function StaffPage() {
  const [event, setEvent] = useState<Event | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [loading, setLoading] = useState(false)
  const [qrUrl, setQrUrl] = useState('')
  const [mcQrUrl, setMcQrUrl] = useState('')
  const [onDeckInput, setOnDeckInput] = useState(3)
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [showSetup, setShowSetup] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showProgram, setShowProgram] = useState(false)
  const [programSearch, setProgramSearch] = useState('')
  const [editor, setEditor] = useState<EditorState>(null)
  const [showPerformed, setShowPerformed] = useState(false)
  const [performedSearch, setPerformedSearch] = useState('')
  const [showStats, setShowStats] = useState(false)
  const [confirmAwards, setConfirmAwards] = useState(false)
  const [registrationCount, setRegistrationCount] = useState(0)
  const [linkCopied, setLinkCopied] = useState(false)
  const [exportingRegs, setExportingRegs] = useState(false)
  const [exportRegsErr, setExportRegsErr] = useState<string | null>(null)

  useEffect(() => {
    if (!event) return
    ;(async () => {
      const { count } = await supabase
        .from('coach_registrations')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .not('confirmed_at', 'is', null)
      setRegistrationCount(count ?? 0)
    })()
  }, [event?.id])

  useEffect(() => {
    if (showSetup && event && !event.registration_token) {
      ensureRegistrationToken()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSetup])

  useEffect(() => { if (!showPerformed) setPerformedSearch('') }, [showPerformed])

  useEffect(() => { if (!showProgram) setProgramSearch('') }, [showProgram])
  const [mode, setMode] = useState<'simple' | 'manager'>('simple')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadLatestEvent() }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem('d4e:staff-mode')
    if (saved === 'manager' || saved === 'simple') setMode(saved)
  }, [])

  function changeMode(next: 'simple' | 'manager') {
    setMode(next)
    if (typeof window !== 'undefined') localStorage.setItem('d4e:staff-mode', next)
    setShowSetup(false)
  }

  const loadParticipants = useCallback(async (eventId: string) => {
    const { data } = await supabase.from('participants').select('*').eq('event_id', eventId).order('position')
    if (data) setParticipants(data)
  }, [])

  const loadCoaches = useCallback(async (eventId: string) => {
    const { data } = await supabase.from('coaches').select('*').eq('event_id', eventId).order('name')
    if (data) setCoaches(data)
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

  async function loadLatestEvent() {
    const { data } = await supabase.from('events').select('*').order('created_at', { ascending: false }).limit(1).single()
    if (data) {
      setEvent(data)
      setOnDeckInput(data.on_deck_count)
      loadParticipants(data.id)
      loadCoaches(data.id)
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

  async function createEvent() {
    if (!eventName || !eventDate) return
    setLoading(true)
    const { data, error } = await supabase.from('events').insert({
      name: eventName, date: eventDate, current_position: 0, on_deck_count: onDeckInput,
      registration_token: generateToken(),
    }).select().single()
    if (!error && data) {
      setEvent(data); generateQr(data.id); setShowCreate(false); setEventName(''); setEventDate('')
    }
    setLoading(false)
  }

  async function copyRegistrationLink() {
    if (!event?.registration_token) return
    const url = `${window.location.origin}/register/${event.id}?t=${event.registration_token}`
    try {
      await navigator.clipboard.writeText(url)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1500)
    } catch { /* ignore */ }
  }

  async function ensureRegistrationToken() {
    if (!event) return
    if (event.registration_token) return
    const token = generateToken()
    await supabase.from('events').update({ registration_token: token }).eq('id', event.id)
    setEvent({ ...event, registration_token: token })
  }

  async function regenerateRegistrationToken() {
    if (!event) return
    if (!confirm('Esto invalidará el link anterior. ¿Continuar?')) return
    const token = generateToken()
    await supabase.from('events').update({ registration_token: token }).eq('id', event.id)
    setEvent({ ...event, registration_token: token })
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!event || !e.target.files?.[0]) return
    setLoading(true)
    try {
      const buffer = await e.target.files[0].arrayBuffer()
      const parsed = parseExcelProgram(buffer)

      await supabase.from('participants').delete().eq('event_id', event.id)
      await supabase.from('coaches').delete().eq('event_id', event.id)

      const coachRows = parsed.coaches.map(name => ({ event_id: event.id, name }))
      const { data: insertedCoaches } = coachRows.length
        ? await supabase.from('coaches').insert(coachRows).select()
        : { data: [] as Coach[] }

      const coachMap = new Map((insertedCoaches || []).map(c => [c.name, c.id]))

      const participantRows = parsed.rows.map(r => ({
        event_id: event.id,
        position: r.position,
        type: r.type,
        style: r.style,
        category: r.category,
        name: r.name,
        academy: r.academy,
        city: r.city,
        coach_id: r.coach ? (coachMap.get(r.coach) || null) : null,
        present: false,
      }))

      await supabase.from('participants').insert(participantRows)
      const { data: refreshedEvent } = await supabase.from('events').update({ current_position: 0, started_at: null, awards_mode: false }).eq('id', event.id).select().single()
      if (refreshedEvent) setEvent(refreshedEvent)
      await loadParticipants(event.id)
      await loadCoaches(event.id)
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function advance(delta: number) {
    if (!event) return
    const total = participants.length || 999
    const next = Math.max(0, Math.min(total + 1, event.current_position + delta))
    const clearAwards = event.awards_mode
    const shouldSetStart = next > 0 && !event.started_at
    setEvent({
      ...event,
      current_position: next,
      awards_mode: clearAwards ? false : event.awards_mode,
    })
    await supabase.from('events').update({
      current_position: next,
      ...(clearAwards ? { awards_mode: false } : {}),
    }).eq('id', event.id)
    if (shouldSetStart) {
      await supabase.rpc('set_started_at_now', { p_id: event.id })
    }
  }

  async function toggleAwards() {
    if (!event) return
    const next = !event.awards_mode
    setEvent({ ...event, awards_mode: next })
    await supabase.from('events').update({ awards_mode: next }).eq('id', event.id)
  }

  async function updateOnDeck() {
    if (!event) return
    await supabase.from('events').update({ on_deck_count: onDeckInput }).eq('id', event.id)
    setEvent({ ...event, on_deck_count: onDeckInput })
  }

  async function togglePresent(p: Participant) {
    const next = !p.present
    setParticipants(prev => prev.map(x => x.id === p.id ? { ...x, present: next } : x))
    await supabase.from('participants').update({ present: next }).eq('id', p.id)
  }

  async function resetPresent() {
    if (!event) return
    setParticipants(prev => prev.map(x => ({ ...x, present: false })))
    await supabase.from('participants').update({ present: false }).eq('event_id', event.id)
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

  return (
    <div className="h-[100dvh] bg-neutral-900 text-white flex flex-col overflow-hidden select-none">
      {/* Header: LOGO izq | STAFF centro | iconos derecha */}
      <header className="bg-black px-3 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          <Image src="/logo.png" alt="Dance4ever" width={56} height={40} priority className="shrink-0" />
          <h1 className="font-display text-3xl tracking-[0.2em] text-fuchsia-500 leading-none">STAFF</h1>
        </div>
        {event ? (
          <div className="flex items-center shrink-0">
            {event.current_position > 0 && mode === 'manager' && (
              <button
                onClick={() => { if (event.awards_mode) toggleAwards(); else setConfirmAwards(true) }}
                className="mr-6 active:opacity-70"
                aria-label="Premiación"
              >
                <Star className={`w-6 h-6 ${event.awards_mode ? 'fill-fuchsia-500 text-fuchsia-500' : 'text-white'}`} />
              </button>
            )}
            <div className="flex items-center gap-4">
              <button onClick={() => setShowProgram(true)} className="text-white active:text-fuchsia-500">
                <ListOrdered className="w-6 h-6" />
              </button>
              <button onClick={() => setShowSetup(true)} className="text-white active:text-fuchsia-500">
                <Settings className="w-6 h-6" />
              </button>
            </div>
          </div>
        ) : <div className="w-px" />}
      </header>

      {event ? (
        <>
          {event.awards_mode ? (
            <div className="flex-1 min-h-0 flex flex-col bg-black text-fuchsia-500 px-4">
              <div className="flex-1 flex items-center justify-center text-center animate-pulse">
                <p className="font-display text-7xl leading-none uppercase tracking-wider">Premiación</p>
              </div>
              <button
                onClick={() => setShowPerformed(true)}
                className="shrink-0 mb-4 bg-neutral-900 border-2 border-fuchsia-500 text-fuchsia-500 active:bg-fuchsia-500 active:text-white px-4 py-4 rounded-md font-display text-2xl tracking-widest"
              >
                VER PRESENTADOS ({participants.filter(p => p.position < event.current_position).length})
              </button>
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
                    <Pill key={p.id} p={p} variant={p.present ? 'green' : 'red'} onClick={() => togglePresent(p)} />
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

          {/* Buttons (solo en modo MANAGER) */}
          {mode === 'manager' && (
            <div className="flex shrink-0">
              {event.current_position > 0 && (
                <button onClick={() => advance(-1)} className="bg-red-500 active:bg-red-600 text-white px-6 py-3 font-display text-2xl flex items-center justify-center gap-2">
                  <ChevronLeft className="w-7 h-7" /> ATRÁS
                </button>
              )}
              <button onClick={() => advance(1)} className="relative flex-1 bg-green-500 active:bg-green-600 text-black py-3 font-display text-2xl flex items-center justify-center">
                {event.current_position === 0 ? 'COMENZAR' : 'SIGUIENTE'}
                <ChevronRight className="w-7 h-7 absolute right-3 top-1/2 -translate-y-1/2" />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-6 gap-4">
          <Image src="/logo.png" alt="Dance4ever" width={180} height={130} priority />
          <p className="text-center">No hay evento activo</p>
          <button onClick={() => setShowCreate(true)} className="bg-fuchsia-500 text-white px-6 py-3 rounded-xl font-display text-xl tracking-widest flex items-center gap-2">
            <Plus className="w-5 h-5" /> CREAR EVENTO
          </button>
        </div>
      )}

      {/* QR Modal */}
      {showQr && qrUrl && mcQrUrl && event && (
        <Modal onClose={() => setShowQr(false)}>
          <a
            href={`/coach/${event.id}`}
            target="_blank"
            rel="noreferrer"
            className="block w-full bg-neutral-100 active:bg-neutral-200 rounded-xl p-3 space-y-2"
          >
            <h3 className="font-display text-lg tracking-widest text-center">COACHES</h3>
            <img src={qrUrl} alt="QR Coaches" className="w-full rounded-lg" />
            <p className="text-[10px] text-gray-500 text-center break-all">{typeof window !== 'undefined' ? window.location.origin : ''}/coach/{event.id}</p>
          </a>

          <a
            href={`/mc/${event.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 w-full bg-neutral-100 active:bg-neutral-200 rounded-xl p-2"
          >
            <img src={mcQrUrl} alt="QR Presentador" className="w-1/4 aspect-square rounded-md" />
            <div className="flex-1 min-w-0">
              <h3 className="font-display text-sm tracking-widest flex items-center gap-1">
                <Monitor className="w-4 h-4" /> PRESENTADOR
              </h3>
              <p className="text-[10px] text-gray-500 break-all mt-1">{typeof window !== 'undefined' ? window.location.origin : ''}/mc/{event.id}</p>
            </div>
          </a>
        </Modal>
      )}

      {/* Create event */}
      {showCreate && (
        <Modal onClose={() => setShowCreate(false)}>
          <h2 className="font-display text-2xl tracking-widest">NUEVO EVENTO</h2>
          <input className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base text-black" placeholder="Nombre del evento" value={eventName} onChange={e => setEventName(e.target.value)} />
          <input className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-base text-black" type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
          <button onClick={createEvent} disabled={loading || !eventName || !eventDate} className="w-full bg-black text-white px-4 py-3 rounded-lg font-display text-xl tracking-widest active:bg-neutral-800 disabled:opacity-50">
            CREAR
          </button>
        </Modal>
      )}

      {/* Settings */}
      {showSetup && event && (
        <div className="fixed inset-0 bg-white text-black z-50 flex flex-col">
          <div className="bg-black px-4 py-3 flex items-center justify-between shrink-0">
            <h3 className="font-display text-2xl tracking-widest text-fuchsia-500">CONFIGURACIÓN</h3>
            <button onClick={() => setShowSetup(false)} aria-label="Cerrar"><X className="w-6 h-6 text-white" /></button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setShowSetup(false); setShowStats(true) }}
              className="flex items-center justify-center gap-2 bg-fuchsia-500 active:bg-fuchsia-500 text-white px-3 py-3 rounded-lg font-bold"
            >
              <BarChart3 className="w-5 h-5" /> ESTADÍSTICAS
            </button>
            <button
              onClick={() => { setShowSetup(false); setShowQr(true) }}
              className="flex items-center justify-center gap-2 bg-black active:bg-neutral-800 text-white px-3 py-3 rounded-lg font-bold"
            >
              <QrCode className="w-5 h-5" /> QRs
            </button>
          </div>

          <div className="space-y-2 pt-3 border-t">
            <label className="text-xs font-bold text-gray-500 uppercase">Modo actual: {mode === 'simple' ? 'BUSCADOR' : 'MANAGER'}</label>
            {mode === 'simple' ? (
              <button onClick={() => changeMode('manager')} className="w-full bg-black text-white px-4 py-3 rounded-lg font-display text-lg tracking-widest active:bg-neutral-800">
                CAMBIAR A MANAGER
              </button>
            ) : (
              <button onClick={() => changeMode('simple')} className="w-full bg-neutral-700 text-white px-4 py-3 rounded-lg font-display text-lg tracking-widest active:bg-neutral-800">
                CAMBIAR A BUSCADOR
              </button>
            )}
          </div>

          {mode === 'manager' && (
            <>
              <div className="space-y-2 pt-3 border-t">
                <label className="text-xs font-bold text-gray-500 uppercase">En espera (cantidad)</label>
                <div className="flex gap-2">
                  <input type="number" min={1} max={20} value={onDeckInput} onChange={e => setOnDeckInput(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 flex-1 text-black" />
                  <button onClick={updateOnDeck} className="bg-gray-200 active:bg-gray-300 text-black px-4 py-2 rounded-lg font-bold text-sm">GUARDAR</button>
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t">
                <label className="text-xs font-bold text-gray-500 uppercase">Programa (Excel)</label>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
                <button onClick={() => fileRef.current?.click()} disabled={loading} className="w-full flex items-center justify-center gap-2 bg-green-600 active:bg-green-700 text-white px-4 py-3 rounded-lg font-bold disabled:opacity-50">
                  <Upload className="w-4 h-4" /> {loading ? 'CARGANDO…' : 'SUBIR EXCEL'}
                </button>
                <p className="text-xs text-gray-500">Formatos: .xlsx, .xls, .csv. Columnas: Numero · Coach · Modalidad · (Estilo) · Categoría · Nombre/Equipo · Academia · (Ciudad)</p>
                <p className="text-xs text-gray-500">{participants.length} participaciones · {coaches.length} coaches</p>
              </div>

              <div className="space-y-2 pt-3 border-t">
                <label className="text-xs font-bold text-gray-500 uppercase">Reiniciar programa</label>
                <button onClick={async () => {
                  await supabase.from('events').update({ current_position: 0, started_at: null, awards_mode: false }).eq('id', event.id)
                  setEvent({ ...event, current_position: 0, started_at: null, awards_mode: false })
                  await resetPresent()
                  setShowSetup(false)
                }} className="w-full flex items-center justify-center gap-2 bg-orange-500 active:bg-orange-600 text-white px-4 py-3 rounded-lg font-bold">
                  <RotateCcw className="w-4 h-4" /> REINICIAR (#1 EN ESPERA)
                </button>
              </div>

              <div className="space-y-2 pt-3 border-t">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-500 uppercase">Registros (coaches)</label>
                  <span className="text-xs text-gray-500">{registrationCount} confirmados</span>
                </div>
                {event.registration_token ? (
                  <>
                    <div className="bg-gray-100 rounded-lg p-3 space-y-2">
                      <p className="text-[11px] text-gray-700 font-mono break-all leading-snug">
                        {typeof window !== 'undefined' ? window.location.origin : ''}/register/{event.id}?t={event.registration_token}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={copyRegistrationLink}
                          className="flex items-center justify-center gap-2 bg-black active:bg-neutral-800 text-white px-3 py-2 rounded-lg text-sm font-bold"
                        >
                          <ClipboardCopy className="w-4 h-4" /> {linkCopied ? 'COPIADO' : 'COPIAR'}
                        </button>
                        <button
                          onClick={regenerateRegistrationToken}
                          className="flex items-center justify-center gap-2 bg-gray-300 active:bg-gray-400 text-black px-3 py-2 rounded-lg text-sm font-bold"
                        >
                          <RefreshCw className="w-4 h-4" /> NUEVO LINK
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={ensureRegistrationToken}
                    className="w-full flex items-center justify-center gap-2 bg-black text-white py-3 rounded-lg font-bold"
                  >
                    <Link2 className="w-4 h-4" /> GENERAR LINK DE REGISTRO
                  </button>
                )}
                <button
                  onClick={async () => {
                    setExportingRegs(true); setExportRegsErr(null)
                    try { await exportRegistrations(event) } catch (e) {
                      setExportRegsErr(e instanceof Error ? e.message : 'Error')
                    } finally { setExportingRegs(false) }
                  }}
                  disabled={exportingRegs || registrationCount === 0}
                  className="w-full flex items-center justify-center gap-2 bg-purple-700 active:bg-purple-800 text-white py-3 rounded-lg font-bold disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-4 h-4" /> {exportingRegs ? 'GENERANDO…' : 'EXPORTAR EXCEL DE REGISTROS'}
                </button>
                {exportRegsErr && (
                  <p className="text-xs text-red-600 break-words">{exportRegsErr}</p>
                )}
              </div>

              <div className="space-y-2 pt-3 border-t">
                <label className="text-xs font-bold text-gray-500 uppercase">Exportar resultados</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => exportExcel(event, participants, coaches)}
                    className="flex items-center justify-center gap-2 bg-green-700 active:bg-green-800 text-white px-3 py-3 rounded-lg font-bold"
                  >
                    <FileSpreadsheet className="w-4 h-4" /> EXCEL
                  </button>
                  <button
                    onClick={() => exportPdf(event, participants, coaches)}
                    className="flex items-center justify-center gap-2 bg-red-700 active:bg-red-800 text-white px-3 py-3 rounded-lg font-bold"
                  >
                    <FileText className="w-4 h-4" /> PDF
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-3 border-t">
                <label className="text-xs font-bold text-gray-500 uppercase">Crear otro evento</label>
                <button onClick={() => { setShowSetup(false); setShowCreate(true) }} className="w-full bg-neutral-900 text-white px-4 py-3 rounded-lg font-bold">+ NUEVO EVENTO</button>
              </div>
            </>
          )}
          </div>
        </div>
      )}

      {/* Programa Completo modal */}
      {showProgram && event && (
        <div className="fixed inset-0 bg-neutral-900 z-50 flex flex-col">
          <div className="bg-black px-4 py-3 flex items-center justify-between shrink-0">
            <h3 className="font-display text-2xl tracking-widest text-fuchsia-500">PROGRAMA</h3>
            <div className="flex items-center gap-4">
              {mode === 'manager' && (
                <button onClick={() => setEditor({ kind: 'create' })} aria-label="Agregar turno">
                  <Plus className="w-7 h-7" />
                </button>
              )}
              <button onClick={() => setShowProgram(false)} aria-label="Cerrar"><X className="w-6 h-6" /></button>
            </div>
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
                return <Pill key={p.id} p={p} variant={variant} onClick={mode === 'manager' ? () => setEditor({ kind: 'edit', p }) : undefined} />
              })
            })()}
          </div>
        </div>
      )}

      {/* Presentados modal (premiación) */}
      {showPerformed && event && (
        <div className="fixed inset-0 bg-neutral-900 z-50 flex flex-col">
          <div className="bg-black px-4 py-3 flex items-center justify-between shrink-0">
            <h3 className="font-display text-2xl tracking-widest text-fuchsia-500">PRESENTADOS</h3>
            <button onClick={() => setShowPerformed(false)} aria-label="Cerrar"><X className="w-6 h-6" /></button>
          </div>
          <SearchBar value={performedSearch} onChange={setPerformedSearch} />
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
            {(() => {
              const performed = participants.filter(p => p.position < event.current_position)
              if (performed.length === 0) return <p className="text-center text-gray-500 italic py-6">Nadie se ha presentado</p>
              const filtered = performed.filter(p => participantMatches(p, performedSearch))
              if (filtered.length === 0) return <p className="text-center text-gray-500 italic py-6">Sin resultados</p>
              return filtered.map(p => (
                <Pill key={p.id} p={p} variant="gray" onClick={mode === 'manager' ? () => setEditor({ kind: 'edit', p }) : undefined} />
              ))
            })()}
          </div>
        </div>
      )}

      {/* Editor de participante */}
      {editor && event && (
        <ParticipantEditor
          mode={editor}
          eventId={event.id}
          coaches={coaches}
          totalCount={participants.length}
          onClose={() => setEditor(null)}
        />
      )}

      {/* Estadísticas */}
      {showStats && event && (
        <StatsPanel event={event} participants={participants} onClose={() => setShowStats(false)} />
      )}

      {/* Confirmación iniciar premiación */}
      {confirmAwards && event && (
        <Modal onClose={() => setConfirmAwards(false)}>
          <h2 className="font-display text-2xl tracking-widest text-center">¿INICIAR PREMIACIÓN?</h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setConfirmAwards(false)}
              className="bg-neutral-200 active:bg-neutral-300 text-black px-4 py-3 rounded-lg font-display text-xl tracking-widest"
            >
              NO
            </button>
            <button
              onClick={() => { toggleAwards(); setConfirmAwards(false) }}
              className="bg-fuchsia-500 active:bg-fuchsia-600 text-white px-4 py-3 rounded-lg font-display text-xl tracking-widest"
            >
              SÍ
            </button>
          </div>
        </Modal>
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
