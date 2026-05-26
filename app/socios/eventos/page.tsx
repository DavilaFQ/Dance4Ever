'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase, Event } from '@/lib/supabase'
import { useEventContext } from '@/app/socios/layout'
import { safeFormatDate, generateToken } from '@/lib/format'
import {
  Plus,
  X,
  Edit3,
  Trash2,
  Calendar,
  Lock,
  Unlock,
  Copy,
  Check,
  RefreshCw,
  Download,
  Save,
  DollarSign,
  Clock,
  Ticket,
  FileSpreadsheet,
  FileText,
  Camera,
  ChevronDown,
  ChevronUp,
  Link2,
} from 'lucide-react'
import { exportExcel, exportPdf, exportRegistrations, exportAllRegistrationsZip } from '@/lib/export'

export default function EventosPage() {
  const { events, event, loadEvents } = useEventContext()
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [eventName, setEventName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')
  const [exporting, setExporting] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<{ id: string; label: string; createdAt: string }[]>([])

  // Event settings
  const [costPaquete, setCostPaquete] = useState(2700)
  const [costRepeticion, setCostRepeticion] = useState(500)
  const [costAsistente, setCostAsistente] = useState(400)
  const [costEntradaTemprana, setCostEntradaTemprana] = useState(500)
  const [costEntradaTardia, setCostEntradaTardia] = useState(600)
  const [deadlineEntrada, setDeadlineEntrada] = useState('')
  const [deadlineRegistro, setDeadlineRegistro] = useState('')
  const [deadlineCambios, setDeadlineCambios] = useState('')
  const [fechaCambioCoreo, setFechaCambioCoreo] = useState('')
  const [dancersPorAsistente, setDancersPorAsistente] = useState(8)
  const [settingsExpanded, setSettingsExpanded] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  // Edit state
  const [editEventName, setEditEventName] = useState('')
  const [editEventDate, setEditEventDate] = useState('')

  // Registrations count
  const [regCount, setRegCount] = useState(0)

  useEffect(() => {
    setOrigin(window.location.origin)
    try {
      const raw = localStorage.getItem('d4e:socios:snapshots')
      if (raw) setSnapshots(JSON.parse(raw))
    } catch {}
  }, [])

  useEffect(() => {
    if (!event) return
    supabase.from('coach_registrations').select('id', { count: 'exact', head: true })
      .eq('event_id', event.id).not('confirmed_at', 'is', null)
      .then(({ count }) => setRegCount(count ?? 0))
  }, [event?.id])

  useEffect(() => {
    if (!event) return
    setCostPaquete(event.default_cost_paquete ?? 2700)
    setCostRepeticion(event.default_cost_repeticion ?? 500)
    setCostAsistente(event.cost_asistente ?? 400)
    setCostEntradaTemprana(event.cost_entrada_temprana ?? 500)
    setCostEntradaTardia(event.cost_entrada_tardia ?? 600)
    setDeadlineEntrada(event.deadline_precio_entrada ?? '')
    setDeadlineRegistro(event.deadline_registro ? event.deadline_registro.slice(0, 16) : '')
    setDeadlineCambios(event.deadline_cambios ? event.deadline_cambios.slice(0, 16) : '')
    setFechaCambioCoreo(event.fecha_cambio_tarifa_coreo ?? '')
    setDancersPorAsistente(event.dancers_por_asistente_gratis ?? 8)
  }, [event])

  async function handleCreate() {
    if (!eventName || !eventDate) return
    setIsSaving(true)
    const token = generateToken()
    const { data, error } = await supabase.from('events').insert({
      name: eventName,
      date: eventDate,
      current_position: 0,
      on_deck_count: 5,
      awards_mode: false,
      registration_token: token,
      default_cost_paquete: 2700,
      default_cost_repeticion: 500,
      cost_asistente: 400,
      cost_entrada_temprana: 500,
      cost_entrada_tardia: 600,
    }).select().single()

    if (error) alert('Error: ' + error.message)
    else if (data) {
      setShowCreate(false)
      setEventName('')
      setEventDate('')
      loadEvents()
    }
    setIsSaving(false)
  }

  async function handleUpdate() {
    if (!event) return
    setIsSaving(true)
    await supabase.from('events').update({
      name: editEventName, date: editEventDate,
    }).eq('id', event.id)
    loadEvents()
    setShowEdit(false)
    setIsSaving(false)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Eliminar "${name}"? Se borraran todos los datos asociados.`)) return
    await supabase.from('events').delete().eq('id', id)
    loadEvents()
  }

  async function handleSaveSettings() {
    if (!event) return
    setSavingSettings(true)
    const { error } = await supabase.from('events').update({
      default_cost_paquete: costPaquete,
      default_cost_repeticion: costRepeticion,
      cost_asistente: costAsistente,
      cost_entrada_temprana: costEntradaTemprana,
      cost_entrada_tardia: costEntradaTardia,
      deadline_precio_entrada: deadlineEntrada ? deadlineEntrada : null,
      deadline_registro: deadlineRegistro ? new Date(deadlineRegistro).toISOString() : null,
      deadline_cambios: deadlineCambios ? new Date(deadlineCambios).toISOString() : null,
      fecha_cambio_tarifa_coreo: fechaCambioCoreo ? fechaCambioCoreo : null,
      dancers_por_asistente_gratis: dancersPorAsistente,
    }).eq('id', event.id)
    if (error) alert('Error: ' + error.message)
    else loadEvents()
    setSavingSettings(false)
  }

  async function handleToggleFreeze() {
    if (!event) return
    const isLocked = !event.registration_token
    const nextToken = isLocked ? generateToken() : null
    await supabase.from('events').update({ registration_token: nextToken }).eq('id', event.id)
    loadEvents()
  }

  async function handleRegenerateToken() {
    if (!event) return
    if (!confirm('Esto invalidara el link anterior. Continuar?')) return
    await supabase.from('events').update({ registration_token: generateToken() }).eq('id', event.id)
    loadEvents()
  }

  function copyLink(e: Event) {
    const url = `${origin}/register/${e.id}?t=${e.registration_token}`
    navigator.clipboard.writeText(url).catch(() => {
      const el = document.createElement('textarea')
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    })
    setCopiedId(e.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function runExport(kind: 'excel' | 'pdf' | 'regs' | 'zip') {
    if (!event) return
    setExporting(kind)
    try {
      const [{ data: parts }, { data: cos }] = await Promise.all([
        supabase.from('participants').select('*').eq('event_id', event.id).order('position'),
        supabase.from('coaches').select('*').eq('event_id', event.id).order('name'),
      ])
      if (kind === 'excel') exportExcel(event, parts ?? [], cos ?? [])
      else if (kind === 'pdf') exportPdf(event, parts ?? [], cos ?? [])
      else if (kind === 'regs') await exportRegistrations(event)
      else if (kind === 'zip') await exportAllRegistrationsZip(event)
    } catch (err) {
      alert('Error al exportar: ' + (err as Error).message)
    } finally { setExporting(null) }
  }

  function takeSnapshot() {
    const label = prompt('Etiqueta del snapshot:', `Snapshot ${new Date().toLocaleString('es-MX')}`)
    if (!label) return
    const next = [{ id: crypto.randomUUID(), label, createdAt: new Date().toISOString() }, ...snapshots].slice(0, 10)
    setSnapshots(next)
    localStorage.setItem('d4e:socios:snapshots', JSON.stringify(next))
  }

  return (
    <div className="p-4 pb-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl tracking-wider uppercase">Eventos</h1>
          <p className="text-xs text-neutral-500 mt-0.5">Gestion y configuracion de eventos</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-fuchsia-500 text-white px-4 py-2.5 rounded-xl font-display text-sm tracking-wider active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" /> CREAR EVENTO
        </button>
      </div>

      {/* Event list */}
      <div className="space-y-3">
        {events.map(e => {
          const isActive = e.id === event?.id
          return (
            <div
              key={e.id}
              className={`rounded-2xl border p-4 transition-all ${
                isActive ? 'bg-fuchsia-500/5 border-fuchsia-500/40' : 'bg-neutral-800/30 border-neutral-700/40'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-lg tracking-wide uppercase">
                    {e.name}
                    {isActive && <span className="ml-2 text-[10px] bg-fuchsia-500 text-white px-2 py-0.5 rounded-full align-middle">ACTIVO</span>}
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">{safeFormatDate(e.date, { dateStyle: 'long' })}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!isActive && (
                    <button
                      onClick={() => { loadEvents() }}
                      className="px-3 py-1.5 bg-neutral-700 text-white text-xs font-bold rounded-lg hover:bg-neutral-600"
                    >
                      Seleccionar
                    </button>
                  )}
                  <button
                    onClick={() => { setEditEventName(e.name); setEditEventDate(e.date); setShowEdit(true) }}
                    className="w-7 h-7 rounded-lg bg-neutral-700/50 text-neutral-400 flex items-center justify-center hover:text-white"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(e.id, e.name)}
                    className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Event link */}
              <div className="mt-3 pt-3 border-t border-neutral-700/30">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-neutral-500 font-mono truncate flex-1">
                    {e.registration_token
                      ? `/register/${e.id}?t=${e.registration_token}`
                      : 'REGISTRO BLOQUEADO'}
                  </p>
                  {e.registration_token && (
                    <button
                      onClick={() => copyLink(e)}
                      className="shrink-0 text-[10px] font-bold bg-fuchsia-500/10 text-fuchsia-400 px-2 py-1 rounded-lg border border-fuchsia-500/20 flex items-center gap-1"
                    >
                      {copiedId === e.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedId === e.id ? 'COPIADO' : 'COPIAR'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Active event settings */}
      {event && (
        <div className="space-y-5 pt-2">
          {/* Settings toggle */}
          <button
            onClick={() => setSettingsExpanded(v => !v)}
            className="w-full flex items-center justify-between bg-neutral-800/40 rounded-2xl border border-neutral-700/50 p-4 hover:border-fuchsia-500/30 transition-all"
          >
            <div>
              <h2 className="font-display text-lg tracking-wider uppercase">Configuracion del Evento</h2>
              <p className="text-xs text-neutral-500 mt-0.5">Costos, fechas limite y token de registro</p>
            </div>
            {settingsExpanded ? <ChevronUp className="w-5 h-5 text-neutral-400" /> : <ChevronDown className="w-5 h-5 text-neutral-400" />}
          </button>

          {settingsExpanded && (
            <div className="space-y-5">
              {/* Costs */}
              <div className="bg-neutral-800/30 rounded-2xl border border-neutral-700/40 p-4 space-y-3">
                <h3 className="font-display text-base tracking-wider uppercase text-fuchsia-400 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Costos
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-neutral-400 font-bold uppercase">
                    Inscripcion base
                    <input type="number" value={costPaquete} onChange={e => setCostPaquete(Number(e.target.value) || 0)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                  </label>
                  <label className="text-xs text-neutral-400 font-bold uppercase">
                    Coreografia extra
                    <input type="number" value={costRepeticion} onChange={e => setCostRepeticion(Number(e.target.value) || 0)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                  </label>
                  <label className="text-xs text-neutral-400 font-bold uppercase">
                    Asistente staff
                    <input type="number" value={costAsistente} onChange={e => setCostAsistente(Number(e.target.value) || 0)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                  </label>
                  <label className="text-xs text-neutral-400 font-bold uppercase">
                    Entrada temprana
                    <input type="number" value={costEntradaTemprana} onChange={e => setCostEntradaTemprana(Number(e.target.value) || 0)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                  </label>
                  <label className="text-xs text-neutral-400 font-bold uppercase">
                    Entrada tardia
                    <input type="number" value={costEntradaTardia} onChange={e => setCostEntradaTardia(Number(e.target.value) || 0)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                  </label>
                  <label className="text-xs text-amber-400 font-bold uppercase">
                    Fecha limite precio entrada
                    <input type="date" value={deadlineEntrada} onChange={e => setDeadlineEntrada(e.target.value)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-amber-500/30 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                  </label>
                </div>
              </div>

              {/* Reglas de negocio */}
              <div className="bg-neutral-800/30 rounded-2xl border border-neutral-700/40 p-4 space-y-3">
                <h3 className="font-display text-base tracking-wider uppercase text-fuchsia-400 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Reglas de Negocio
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-xs text-neutral-400 font-bold uppercase">
                    Fecha cambio tarifa coreo
                    <input type="date" value={fechaCambioCoreo} onChange={e => setFechaCambioCoreo(e.target.value)} placeholder="Despues de esta fecha todas las coreos se cobran como extra" className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                    <span className="text-[10px] text-neutral-600 mt-0.5 block">Antes: 1ra coreo incluida. Despues: todas se cobran.</span>
                  </label>
                  <label className="text-xs text-neutral-400 font-bold uppercase">
                    Alumnos por asistente gratis
                    <input type="number" value={dancersPorAsistente} onChange={e => setDancersPorAsistente(Number(e.target.value) || 1)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                    <span className="text-[10px] text-neutral-600 mt-0.5 block">Cada X alumnos = 1 pase de staff gratis.</span>
                  </label>
                </div>
              </div>

              {/* Deadlines */}
              <div className="bg-neutral-800/30 rounded-2xl border border-neutral-700/40 p-4 space-y-3">
                <h3 className="font-display text-base tracking-wider uppercase text-fuchsia-400 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Fechas Limite
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-xs text-neutral-400 font-bold uppercase">
                    Cierre de registros
                    <input type="datetime-local" value={deadlineRegistro} onChange={e => setDeadlineRegistro(e.target.value)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                  </label>
                  <label className="text-xs text-neutral-400 font-bold uppercase">
                    Cierre de cambios
                    <input type="datetime-local" value={deadlineCambios} onChange={e => setDeadlineCambios(e.target.value)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                  </label>
                </div>
              </div>

              {/* Token management */}
              <div className="bg-neutral-800/30 rounded-2xl border border-neutral-700/40 p-4 space-y-3">
                <h3 className="font-display text-base tracking-wider uppercase text-fuchsia-400 flex items-center gap-2">
                  <Link2 className="w-4 h-4" /> Token de Registro
                </h3>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-white flex items-center gap-2">
                      {event.registration_token ? (
                        <><Unlock className="w-4 h-4 text-green-400" /> REGISTRO ABIERTO</>
                      ) : (
                        <><Lock className="w-4 h-4 text-amber-400" /> REGISTRO CONGELADO</>
                      )}
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {regCount} registros confirmados
                    </p>
                  </div>
                  <button
                    onClick={handleToggleFreeze}
                    className={`w-12 h-6 rounded-full relative transition-colors ${
                      event.registration_token ? 'bg-green-500/30 border border-green-500' : 'bg-amber-500/30 border border-amber-500'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full transition-all bg-white ${
                      event.registration_token ? 'left-6' : 'left-0.5'
                    }`} />
                  </button>
                </div>

                {event.registration_token && (
                  <div className="bg-neutral-900/50 rounded-xl p-3 space-y-2">
                    <p className="text-[10px] text-neutral-500 font-mono break-all leading-relaxed">
                      {origin || 'https://dance4ever.vercel.app'}/register/{event.id}?t={event.registration_token}
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => copyLink(event)} className="flex-1 flex items-center justify-center gap-1 py-2 bg-fuchsia-500 text-white text-xs font-bold rounded-lg active:scale-95">
                        <Copy className="w-3.5 h-3.5" /> Copiar link
                      </button>
                      <button onClick={handleRegenerateToken} className="flex items-center justify-center gap-1 px-3 py-2 bg-neutral-700 text-neutral-300 text-xs font-bold rounded-lg active:scale-95">
                        <RefreshCw className="w-3.5 h-3.5" /> Nuevo token
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Save settings button */}
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="w-full py-3 bg-fuchsia-500 text-white font-display text-base tracking-wider rounded-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" />
                {savingSettings ? 'GUARDANDO...' : 'GUARDAR CONFIGURACION'}
              </button>
            </div>
          )}

          {/* Exports & Snapshots */}
          <div className="bg-neutral-800/30 rounded-2xl border border-neutral-700/40 p-4 space-y-3">
            <h3 className="font-display text-base tracking-wider uppercase text-fuchsia-400 flex items-center gap-2">
              <Download className="w-4 h-4" /> Exportaciones y Respaldos
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => runExport('excel')} disabled={exporting === 'excel'} className="py-3 bg-fuchsia-500 text-white font-display text-xs tracking-wider rounded-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4" /> {exporting === 'excel' ? '...' : 'Excel MC'}
              </button>
              <button onClick={() => runExport('pdf')} disabled={exporting === 'pdf'} className="py-3 bg-fuchsia-500 text-white font-display text-xs tracking-wider rounded-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5">
                <FileText className="w-4 h-4" /> {exporting === 'pdf' ? '...' : 'PDF MC'}
              </button>
              <button onClick={() => runExport('regs')} disabled={exporting === 'regs'} className="py-3 bg-fuchsia-500 text-white font-display text-xs tracking-wider rounded-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4" /> {exporting === 'regs' ? '...' : 'Regs XLSX'}
              </button>
              <button onClick={() => runExport('zip')} disabled={exporting === 'zip'} className="py-3 bg-purple-500 text-white font-display text-xs tracking-wider rounded-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5">
                <Download className="w-4 h-4" /> {exporting === 'zip' ? '...' : 'Todos ZIP'}
              </button>
            </div>

            <button
              onClick={takeSnapshot}
              className="w-full py-2.5 bg-neutral-700/50 text-neutral-300 font-display text-xs tracking-wider rounded-xl active:scale-95 flex items-center justify-center gap-2"
            >
              <Camera className="w-4 h-4" /> CREAR SNAPSHOT
            </button>

            {snapshots.length > 0 && (
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {snapshots.map(s => (
                  <div key={s.id} className="flex items-center justify-between text-xs py-1.5 border-b border-neutral-700/30">
                    <span className="truncate">{s.label}</span>
                    <span className="text-neutral-500 shrink-0 ml-2">{safeFormatDate(s.createdAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create event modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div className="bg-neutral-800 rounded-2xl border border-neutral-700 w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl tracking-wide uppercase">Nuevo Evento</h3>
              <button onClick={() => setShowCreate(false)}><X className="w-5 h-5 text-neutral-400" /></button>
            </div>
            <label className="block text-xs text-neutral-400 font-bold uppercase">
              Nombre
              <input value={eventName} onChange={e => setEventName(e.target.value)} placeholder="Ej. Gala 2026" className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500 placeholder-neutral-500" />
            </label>
            <label className="block text-xs text-neutral-400 font-bold uppercase">
              Fecha
              <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
            </label>
            <div className="flex gap-2 pt-1">
              <button onClick={handleCreate} disabled={isSaving || !eventName || !eventDate} className="flex-1 py-3 bg-fuchsia-500 text-white font-display text-base tracking-wider rounded-xl active:scale-95 disabled:opacity-50">
                {isSaving ? 'CREANDO...' : 'CREAR EVENTO'}
              </button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-3 bg-neutral-700 text-neutral-300 rounded-xl text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit event modal */}
      {showEdit && event && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowEdit(false)}>
          <div className="bg-neutral-800 rounded-2xl border border-neutral-700 w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl tracking-wide uppercase">Editar Evento</h3>
              <button onClick={() => setShowEdit(false)}><X className="w-5 h-5 text-neutral-400" /></button>
            </div>
            <label className="block text-xs text-neutral-400 font-bold uppercase">
              Nombre
              <input value={editEventName} onChange={e => setEditEventName(e.target.value)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
            </label>
            <label className="block text-xs text-neutral-400 font-bold uppercase">
              Fecha
              <input type="date" value={editEventDate} onChange={e => setEditEventDate(e.target.value)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
            </label>
            <div className="flex gap-2 pt-1">
              <button onClick={handleUpdate} disabled={isSaving} className="flex-1 py-3 bg-fuchsia-500 text-white font-display text-base tracking-wider rounded-xl active:scale-95 disabled:opacity-50">
                {isSaving ? 'GUARDANDO...' : 'GUARDAR'}
              </button>
              <button onClick={() => setShowEdit(false)} className="px-4 py-3 bg-neutral-700 text-neutral-300 rounded-xl text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
