'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { supabase, Event } from '@/lib/supabase'
import { useEventContext } from '@/app/socios/layout'
import { safeFormatDate, generateToken } from '@/lib/format'
import { TAB } from '../colors'
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
  Users,
} from 'lucide-react'
import { exportExcel, exportPdf, exportRegistrations, exportAllRegistrationsZip } from '@/lib/export'
import { fetchPortalConfig, savePortalConfig } from '@/lib/portalConfig'
import QRCode from 'qrcode'


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
  const [snapshots, setSnapshots] = useState<{ id: string; label: string; created_at: string }[]>([])

  // Auto-save indicator
  const [savedIndicator, setSavedIndicator] = useState<'saving' | 'saved' | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Event settings
  const [costPaquete, setCostPaquete] = useState(2700)
  const [costRepeticion, setCostRepeticion] = useState(500)
  const [costAsistente, setCostAsistente] = useState(400)
  const [costEntradaTemprana, setCostEntradaTemprana] = useState(500)
  const [costEntradaTardia, setCostEntradaTardia] = useState(600)
  const [deadlineEntrada, setDeadlineEntrada] = useState('')
  const [deadlineRegistro, setDeadlineRegistro] = useState('')
  const [deadlineCambios, setDeadlineCambios] = useState('')
  const [dancersPorAsistente, setDancersPorAsistente] = useState(8)
  const [eventsExpanded, setEventsExpanded] = useState(false)
  const [settingsExpanded, setSettingsExpanded] = useState(false)
  const [qrsExpanded, setQrsExpanded] = useState(false)
  const [exportsExpanded, setExportsExpanded] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)

  // QR access states
  const [qrStaffUrl, setQrStaffUrl] = useState('')
  const [qrCoachProgUrl, setQrCoachProgUrl] = useState('')
  const [copiedQrLink, setCopiedQrLink] = useState<string | null>(null)

  // Edit state
  const [editEventName, setEditEventName] = useState('')
  const [editEventDate, setEditEventDate] = useState('')

  // Registrations count
  const [regCount, setRegCount] = useState(0)

  // Portal status
  const [enableOperations, setEnableOperations] = useState(true)
  const [enableRegistration, setEnableRegistration] = useState(true)
  const [loadingPortalConfig, setLoadingPortalConfig] = useState(false)
  const [loadingFreeze, setLoadingFreeze] = useState(false)


  // Load snapshots from Supabase, migrate from localStorage on first load
  useEffect(() => {
    setOrigin(window.location.origin)
    if (!event) return
    supabase.from('event_snapshots').select('id, label, created_at')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setSnapshots(data as { id: string; label: string; created_at: string }[])
          return
        }
        // Migrate from localStorage if Supabase is empty
        try {
          const raw = localStorage.getItem('d4e:socios:snapshots')
          if (raw) {
            const localSnaps = JSON.parse(raw) as { id: string; label: string; createdAt: string }[]
            if (localSnaps.length > 0) {
              const rows = localSnaps.map(s => ({
                event_id: event.id,
                label: s.label,
                created_at: s.createdAt || new Date().toISOString(),
              }))
              supabase.from('event_snapshots').insert(rows).then(() => {
                supabase.from('event_snapshots').select('id, label, created_at')
                  .eq('event_id', event.id)
                  .order('created_at', { ascending: false })
                  .then(({ data: d2 }) => {
                    if (d2) setSnapshots(d2 as { id: string; label: string; created_at: string }[])
                  })
              })
              localStorage.removeItem('d4e:socios:snapshots')
            }
          }
        } catch { /* ignore */ }
      })
  }, [event])

  useEffect(() => {
    if (!event || !origin) return
    
    // 1. QR Staff
    const urlStaff = `${origin}/staff`
    QRCode.toDataURL(urlStaff, { width: 400, margin: 2 }).then(setQrStaffUrl).catch(() => {})

    // 2. QR Programa Coaches
    const urlProg = `${origin}/coach/${event.id}`
    QRCode.toDataURL(urlProg, { width: 400, margin: 2 }).then(setQrCoachProgUrl).catch(() => {})
  }, [event?.id, origin])

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
    setDeadlineRegistro(event.deadline_registro ? event.deadline_registro.slice(0, 10) : '')
    setDeadlineCambios(event.deadline_cambios ? event.deadline_cambios.slice(0, 10) : '')
    setDancersPorAsistente(event.dancers_por_asistente_gratis ?? 8)
  }, [event])

  useEffect(() => {
    if (!event) return
    setLoadingPortalConfig(true)
    fetchPortalConfig(event.id)
      .then(config => {
        setEnableOperations(config.enableOperations)
        setEnableRegistration(config.enableRegistration)
      })
      .finally(() => setLoadingPortalConfig(false))
  }, [event?.id])

  // Reusable save function (used by both auto-save and explicit save)
  const doSaveSettings = useCallback(async () => {
    if (!event || savingSettings) return
    setSavingSettings(true)
    try {
      const { error } = await supabase.from('events').update({
        default_cost_paquete: costPaquete,
        default_cost_repeticion: costRepeticion,
        cost_asistente: costAsistente,
        cost_entrada_temprana: costEntradaTemprana,
        cost_entrada_tardia: costEntradaTardia,
        deadline_precio_entrada: deadlineEntrada ? deadlineEntrada : null,
        deadline_registro: deadlineRegistro ? new Date(deadlineRegistro).toISOString() : null,
        deadline_cambios: deadlineCambios ? new Date(deadlineCambios).toISOString() : null,
        dancers_por_asistente_gratis: dancersPorAsistente,
      }).eq('id', event.id)
      if (!error) loadEvents()
      return error
    } finally {
      setSavingSettings(false)
    }
  }, [event, costPaquete, costRepeticion, costAsistente, costEntradaTemprana, costEntradaTardia, deadlineEntrada, deadlineRegistro, deadlineCambios, dancersPorAsistente, loadEvents, savingSettings])

  // Auto-save settings on any field change (debounced 1.2s)
  useEffect(() => {
    if (!event) return
    // Don't auto-save right after loading (event object changed = settings were just loaded)
    const skipInitial = event.default_cost_paquete === costPaquete &&
      event.default_cost_repeticion === costRepeticion &&
      event.cost_asistente === costAsistente &&
      event.cost_entrada_temprana === costEntradaTemprana &&
      event.cost_entrada_tardia === costEntradaTardia
    if (skipInitial && event.deadline_precio_entrada === (deadlineEntrada || null) &&
      (event.deadline_registro ? event.deadline_registro.slice(0, 10) : '') === deadlineRegistro &&
      (event.deadline_cambios ? event.deadline_cambios.slice(0, 10) : '') === deadlineCambios &&
      event.dancers_por_asistente_gratis === dancersPorAsistente) return

    setSavedIndicator('saving')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const error = await doSaveSettings()
      if (!error) {
        setSavedIndicator('saved')
        setTimeout(() => setSavedIndicator(null), 2000)
      } else {
        setSavedIndicator(null)
      }
    }, 1200)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [costPaquete, costRepeticion, costAsistente, costEntradaTemprana, costEntradaTardia, deadlineEntrada, deadlineRegistro, deadlineCambios, dancersPorAsistente, event, doSaveSettings])

  async function handleToggleOperations() {
    if (!event || loadingPortalConfig) return
    setLoadingPortalConfig(true)
    const nextVal = !enableOperations
    setEnableOperations(nextVal)
    try {
      await savePortalConfig(event.id, {
        enableOperations: nextVal,
        enableRegistration
      })
    } catch (err) {
      alert('Error al guardar: ' + (err as Error).message)
      setEnableOperations(!nextVal)
    } finally {
      setLoadingPortalConfig(false)
    }
  }

  async function handleToggleRegistration() {
    if (!event || loadingPortalConfig) return
    setLoadingPortalConfig(true)
    const nextVal = !enableRegistration
    setEnableRegistration(nextVal)
    try {
      await savePortalConfig(event.id, {
        enableOperations,
        enableRegistration: nextVal
      })
    } catch (err) {
      alert('Error al guardar: ' + (err as Error).message)
      setEnableRegistration(!nextVal)
    } finally {
      setLoadingPortalConfig(false)
    }
  }

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

  async function handleToggleFreeze() {
    if (!event || loadingFreeze) return
    setLoadingFreeze(true)
    try {
      const isLocked = !event.registration_token
      const nextToken = isLocked ? generateToken() : null
      await supabase.from('events').update({ registration_token: nextToken }).eq('id', event.id)
      await loadEvents()
    } finally {
      setLoadingFreeze(false)
    }
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

  async function takeSnapshot() {
    if (!event) return
    const label = prompt('Etiqueta del snapshot:', `Snapshot ${new Date().toLocaleString('es-MX')}`)
    if (!label) return
    const { data, error } = await supabase.from('event_snapshots').insert({
      event_id: event.id,
      label,
      created_at: new Date().toISOString(),
    }).select('id, label, created_at').single()
    if (!error && data) {
      setSnapshots(prev => [{ id: data.id, label: data.label, created_at: data.created_at }, ...prev])
    }
  }

  async function deleteSnapshot(id: string) {
    if (!confirm('Eliminar este snapshot?')) return
    await supabase.from('event_snapshots').delete().eq('id', id)
    setSnapshots(prev => prev.filter(s => s.id !== id))
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

      {/* Event list toggle */}
      <button
        onClick={() => setEventsExpanded(v => !v)}
        className="w-full flex items-center justify-between bg-neutral-800/40 rounded-2xl border border-neutral-700/50 p-4 hover:border-fuchsia-500/30 transition-all text-left"
      >
        <div>
          <h2 className="font-display text-lg tracking-wider uppercase">Selección de Evento Activo</h2>
          <p className="text-xs text-neutral-500 mt-0.5">Lista de eventos registrados y selección</p>
        </div>
        {eventsExpanded ? <ChevronUp className="w-5 h-5 text-neutral-400" /> : <ChevronDown className="w-5 h-5 text-neutral-400" />}
      </button>

      {/* Event list */}
      {eventsExpanded && (
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
      )}

      {/* Active event settings */}
      {event && (
        <div className="space-y-5 pt-2">
          {/* Settings toggle */}
          <button
            onClick={() => setSettingsExpanded(v => !v)}
            className="w-full flex items-center justify-between bg-neutral-800/40 rounded-2xl border border-neutral-700/50 p-4 hover:border-fuchsia-500/30 transition-all text-left"
          >
            <div>
              <h2 className="font-display text-lg tracking-wider uppercase">Configuracion del Evento</h2>
              <p className="text-xs text-neutral-500 mt-0.5">Costos, fechas limite y token de registro</p>
            </div>
            {settingsExpanded ? <ChevronUp className="w-5 h-5 text-neutral-400" /> : <ChevronDown className="w-5 h-5 text-neutral-400" />}
          </button>

          {settingsExpanded && (
            <div className="space-y-5">
              {/* 1. Costos de Inscripción */}
              <div className="bg-neutral-800/30 rounded-2xl border border-neutral-700/40 p-4 space-y-3">
                <h3 className="font-display text-base tracking-wider uppercase flex items-center gap-2" style={{ color: TAB.resumen }}>
                  <DollarSign className="w-4 h-4" /> Costos de Inscripción
                </h3>
                <div className="space-y-2.5">
                  <label className="text-xs text-neutral-400 font-bold uppercase block">
                    Inscripción base
                    <input type="number" value={costPaquete} onChange={e => setCostPaquete(Number(e.target.value) || 0)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                  </label>
                  <label className="text-xs text-neutral-400 font-bold uppercase block">
                    Coreografía extra
                    <input type="number" value={costRepeticion} onChange={e => setCostRepeticion(Number(e.target.value) || 0)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                  </label>
                </div>
              </div>

              {/* 2. Entradas */}
              <div className="bg-neutral-800/30 rounded-2xl border border-neutral-700/40 p-4 space-y-3">
                <h3 className="font-display text-base tracking-wider uppercase flex items-center gap-2" style={{ color: TAB.programa }}>
                  <Ticket className="w-4 h-4" /> Entradas
                </h3>
                <div className="space-y-2.5">
                  <label className="text-xs text-neutral-400 font-bold uppercase block">
                    Preventa entradas
                    <input type="number" value={costEntradaTemprana} onChange={e => setCostEntradaTemprana(Number(e.target.value) || 0)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                  </label>
                  <label className="text-xs text-neutral-400 font-bold uppercase block">
                    Precio regular
                    <input type="number" value={costEntradaTardia} onChange={e => setCostEntradaTardia(Number(e.target.value) || 0)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                  </label>
                  <label className="text-xs text-amber-400 font-bold uppercase block">
                    Fecha límite preventa
                    <input type="date" value={deadlineEntrada} onChange={e => setDeadlineEntrada(e.target.value)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-amber-500/30 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                  </label>
                </div>
              </div>

              {/* 3. Asistentes */}
              <div className="bg-neutral-800/30 rounded-2xl border border-neutral-700/40 p-4 space-y-3">
                <h3 className="font-display text-base tracking-wider uppercase flex items-center gap-2" style={{ color: TAB.registros }}>
                  <Users className="w-4 h-4" /> Asistentes
                </h3>
                <div className="space-y-2.5">
                  <label className="text-xs text-neutral-400 font-bold uppercase block">
                    Costo por asistente
                    <input type="number" value={costAsistente} onChange={e => setCostAsistente(Number(e.target.value) || 0)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                  </label>
                  <label className="text-xs text-neutral-400 font-bold uppercase block">
                    Integrantes por asistente gratis
                    <input type="number" value={dancersPorAsistente} onChange={e => setDancersPorAsistente(Number(e.target.value) || 1)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                    <span className="text-[10px] text-neutral-600 mt-0.5 block">Cada X integrantes = 1 pase gratis.</span>
                  </label>
                </div>
              </div>

              {/* 4. Fechas Límite */}
              <div className="bg-neutral-800/30 rounded-2xl border border-neutral-700/40 p-4 space-y-3">
                <h3 className="font-display text-base tracking-wider uppercase flex items-center gap-2" style={{ color: TAB.checklist }}>
                  <Clock className="w-4 h-4" /> Fechas Límite
                </h3>
                <div className="space-y-2.5">
                  <label className="text-xs text-neutral-400 font-bold uppercase block">
                    Cierre de registros
                    <input type="date" value={deadlineRegistro} onChange={e => setDeadlineRegistro(e.target.value)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                  </label>
                  <label className="text-xs text-neutral-400 font-bold uppercase block">
                    Cierre de cambios
                    <input type="date" value={deadlineCambios} onChange={e => setDeadlineCambios(e.target.value)} className="mt-1 w-full px-3 py-2 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
                  </label>
                </div>
              </div>

              {/* 5. Token de Registro */}
              <div className="bg-neutral-800/30 rounded-2xl border border-neutral-700/40 p-4 space-y-3">
                <h3 className="font-display text-base tracking-wider uppercase flex items-center gap-2" style={{ color: TAB.finanzas }}>
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
                    disabled={loadingFreeze}
                    className={`w-12 h-6 rounded-full relative transition-colors ${
                      loadingFreeze ? 'opacity-50 cursor-not-allowed' : ''
                    } ${
                      event.registration_token ? 'bg-green-500/30 border border-green-500' : 'bg-amber-500/30 border border-amber-500'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full transition-all bg-white ${
                      event.registration_token ? 'left-6' : 'left-0.5'
                    }`} />
                  </button>
                </div>

                {event.registration_token && (
                  <div className="rounded-xl p-3 space-y-2 bg-neutral-700/30 border border-neutral-600/30">
                    <p className="text-xs text-neutral-300 font-mono break-all leading-relaxed">
                      {origin || 'https://dance4ever.vercel.app'}/register/{event.id}?t={event.registration_token}
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => copyLink(event)} className="flex-1 flex items-center justify-center gap-1 py-2 bg-fuchsia-500 text-white text-xs font-bold rounded-lg active:scale-95">
                        <Copy className="w-3.5 h-3.5" /> Copiar link
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 6. Estado de Portales */}
              <div className="bg-neutral-800/30 rounded-2xl border border-neutral-700/40 p-4 space-y-4">
                <h3 className="font-display text-base tracking-wider uppercase flex items-center gap-2" style={{ color: TAB.eventos }}>
                  <Lock className="w-4 h-4" /> Estado de Portales
                </h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-white uppercase tracking-wide">
                        Portales Operativos (Staff, Coach, MC)
                      </p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Habilita o deshabilita accesos para las vistas en vivo del evento.
                      </p>
                    </div>
                    <button
                      onClick={handleToggleOperations}
                      disabled={loadingPortalConfig}
                      className={`w-12 h-6 rounded-none relative transition-colors shrink-0 ${
                        enableOperations ? 'bg-neutral-900 border border-neutral-950' : 'bg-neutral-200 border border-neutral-300'
                      }`}
                      aria-label="Alternar portales operativos"
                    >
                      <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-none transition-all ${
                        enableOperations ? 'left-6 bg-white' : 'left-0.5 bg-neutral-500'
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-4 border-t border-neutral-700/20">
                    <div>
                      <p className="text-sm font-bold text-white uppercase tracking-wide">
                        Registro de Academias
                      </p>
                      <p className="text-[11px] text-neutral-500 mt-0.5">
                        Habilita o deshabilita el formulario de inscripción principal.
                      </p>
                    </div>
                    <button
                      onClick={handleToggleRegistration}
                      disabled={loadingPortalConfig}
                      className={`w-12 h-6 rounded-none relative transition-colors shrink-0 ${
                        enableRegistration ? 'bg-neutral-900 border border-neutral-950' : 'bg-neutral-200 border border-neutral-300'
                      }`}
                      aria-label="Alternar portal de registro"
                    >
                      <span className={`absolute top-0.5 w-4.5 h-4.5 rounded-none transition-all ${
                        enableRegistration ? 'left-6 bg-white' : 'left-0.5 bg-neutral-500'
                      }`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* 7. Guardar */}
              <div className="flex items-center gap-2">
                {savedIndicator && (
                  <span className={`text-xs font-bold ${savedIndicator === 'saving' ? 'text-amber-400' : 'text-green-400'}`}>
                    {savedIndicator === 'saving' ? 'Guardando...' : 'Guardado \u2713'}
                  </span>
                )}
                <button
                  onClick={() => { setSavingSettings(true); doSaveSettings().finally(() => setSavingSettings(false)) }}
                  disabled={savingSettings}
                  className="flex-1 py-3 bg-black hover:bg-neutral-900 border border-neutral-800 text-white font-display text-xs tracking-wider font-bold rounded-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-md transition-all"
                >
                  <Save className="w-4 h-4" />
                  {savingSettings ? 'GUARDANDO...' : 'GUARDAR AHORA'}
                </button>
              </div>
            </div>
          )}

          {/* QR Codes toggle */}
          <button
            onClick={() => setQrsExpanded(v => !v)}
            className="w-full flex items-center justify-between bg-neutral-800/40 rounded-2xl border border-neutral-700/50 p-4 hover:border-fuchsia-500/30 transition-all animate-fade-in text-left"
          >
            <div>
              <h2 className="font-display text-lg tracking-wider uppercase">Códigos QR de Accesos</h2>
              <p className="text-xs text-neutral-500 mt-0.5">QRs de Programa en Vivo (Coaches) y Portal de Staff</p>
            </div>
            {qrsExpanded ? <ChevronUp className="w-5 h-5 text-neutral-400" /> : <ChevronDown className="w-5 h-5 text-neutral-400" />}
          </button>

          {/* QR Codes Section */}
          {qrsExpanded && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 1. Programa Coaches */}
              {qrCoachProgUrl && (
                <div className="bg-neutral-800/30 border border-neutral-700/40 rounded-2xl p-4 flex flex-col gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                      Día del Evento
                    </span>
                    <h4 className="font-display text-sm font-bold text-white uppercase">
                      Programa Coaches
                    </h4>
                    <p className="text-[11px] text-neutral-500">
                      Vista en vivo del orden en escenario.
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-xl flex items-center justify-center max-w-[200px] mx-auto w-full aspect-square shadow-md">
                    <img src={qrCoachProgUrl} alt="QR Programa" className="w-full h-full object-contain" />
                  </div>

                  <div className="flex flex-col gap-1.5 mt-auto">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${origin}/coach/${event.id}`).then(() => {
                          setCopiedQrLink('prog')
                          setTimeout(() => setCopiedQrLink(null), 2000)
                        })
                      }}
                      className="w-full py-2 bg-black hover:bg-neutral-900 border border-neutral-800 text-white font-bold text-[11px] rounded-lg flex items-center justify-center gap-1.5 transition-colors uppercase tracking-wider font-display active:scale-95"
                    >
                      {copiedQrLink === 'prog' ? '¡Copiado!' : 'Copiar Enlace'}
                    </button>
                    
                    <button
                      onClick={() => {
                        window.open(
                          `https://wa.me/?text=${encodeURIComponent(
                            `¡Hola! Sigue el programa en vivo y orden de coreografías en el escenario de *Dance4Ever* aquí:\n\n🔗 ${origin}/coach/${event.id}`
                          )}`,
                          '_blank'
                        )
                      }}
                      className="w-full py-2 text-white font-bold text-[11px] rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md uppercase tracking-wider font-display hover:brightness-90"
                      style={{ backgroundColor: '#25D366' }}
                    >
                      Compartir
                    </button>
                  </div>
                </div>
              )}

              {/* 2. Portal Staff */}
              {qrStaffUrl && (
                <div className="bg-neutral-800/30 border border-neutral-700/40 rounded-2xl p-4 flex flex-col gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                      Operaciones
                    </span>
                    <h4 className="font-display text-sm font-bold text-white uppercase">
                      Portal de Staff
                    </h4>
                    <p className="text-[11px] text-neutral-500">
                      Acceso operativo para logística y backstage.
                    </p>
                  </div>

                  <div className="bg-white p-3 rounded-xl flex items-center justify-center max-w-[200px] mx-auto w-full aspect-square shadow-md">
                    <img src={qrStaffUrl} alt="QR Staff" className="w-full h-full object-contain" />
                  </div>

                  <div className="flex flex-col gap-1.5 mt-auto">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${origin}/staff`).then(() => {
                          setCopiedQrLink('staff')
                          setTimeout(() => setCopiedQrLink(null), 2000)
                        })
                      }}
                      className="w-full py-2 bg-black hover:bg-neutral-900 border border-neutral-800 text-white font-bold text-[11px] rounded-lg flex items-center justify-center gap-1.5 transition-colors uppercase tracking-wider font-display active:scale-95"
                    >
                      {copiedQrLink === 'staff' ? '¡Copiado!' : 'Copiar Enlace'}
                    </button>
                    
                    <button
                      onClick={() => {
                        window.open(
                          `https://wa.me/?text=${encodeURIComponent(
                            `Enlace de acceso al Portal del Staff de *Dance4Ever*:\n\n🔗 ${origin}/staff`
                          )}`,
                          '_blank'
                        )
                      }}
                      className="w-full py-2 text-white font-bold text-[11px] rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md uppercase tracking-wider font-display hover:brightness-90"
                      style={{ backgroundColor: '#25D366' }}
                    >
                      Compartir
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

           {/* Exports toggle */}
          <button
            onClick={() => setExportsExpanded(v => !v)}
            className="w-full flex items-center justify-between bg-neutral-800/40 rounded-2xl border border-neutral-700/50 p-4 hover:border-fuchsia-500/30 transition-all text-left"
          >
            <div>
              <h2 className="font-display text-lg tracking-wider uppercase">Exportaciones y Respaldos</h2>
              <p className="text-xs text-neutral-500 mt-0.5">Descarga de reportes XLSX, PDF y copias de seguridad</p>
            </div>
            {exportsExpanded ? <ChevronUp className="w-5 h-5 text-neutral-400" /> : <ChevronDown className="w-5 h-5 text-neutral-400" />}
          </button>

          {/* Exports & Snapshots */}
          {exportsExpanded && (
            <div className="bg-neutral-800/30 rounded-2xl border border-neutral-700/40 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => runExport('excel')} disabled={exporting === 'excel'} className="py-3 bg-fuchsia-500 text-white font-display text-xs tracking-wider rounded-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4" /> {exporting === 'excel' ? '...' : 'Excel MC'}
                </button>
                <button onClick={() => runExport('pdf')} disabled={exporting === 'pdf'} className="py-3 bg-fuchsia-500 text-white font-display text-xs tracking-wider rounded-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  <FileText className="w-4 h-4" /> {exporting === 'pdf' ? '...' : 'PDF MC'}
                </button>
                <button onClick={() => runExport('regs')} disabled={exporting === 'regs'} className="col-span-2 py-3 bg-fuchsia-500 text-white font-display text-xs tracking-wider rounded-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4" /> {exporting === 'regs' ? 'GENERANDO...' : 'Exportar Finanzas (XLSX)'}
                </button>
                <button onClick={() => runExport('zip')} disabled={exporting === 'zip'} className="col-span-2 py-3 bg-purple-500 text-white font-display text-xs tracking-wider rounded-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  <Download className="w-4 h-4" /> {exporting === 'zip' ? 'GENERANDO...' : 'Todos ZIP'}
                </button>
              </div>

              <button
                onClick={takeSnapshot}
                className="w-full py-2.5 bg-neutral-700/50 text-neutral-300 font-display text-xs tracking-wider rounded-xl active:scale-95 flex items-center justify-center gap-2"
              >
                <Camera className="w-4 h-4" /> CREAR SNAPSHOT
              </button>

              {snapshots.length > 0 && (
                <div className="space-y-1 max-h-24 overflow-y-auto font-mono">
                  {snapshots.map(s => (
                    <div key={s.id} className="flex items-center justify-between text-xs py-1.5 border-b border-neutral-700/30">
                      <span className="truncate">{s.label}</span>
                      <span className="text-neutral-500 shrink-0 ml-2">{safeFormatDate(s.created_at, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      <button onClick={() => deleteSnapshot(s.id)} className="shrink-0 ml-1.5 text-neutral-600 hover:text-red-400"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create event modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div className="bg-neutral-800 rounded-2xl border border-neutral-700 w-full max-w-sm p-8 pt-10 space-y-5 text-center" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-xl tracking-wide uppercase">Nuevo Evento</h3>
            <label className="block text-xs text-neutral-400 font-bold uppercase text-center">
              Nombre
              <input value={eventName} onChange={e => setEventName(e.target.value)} placeholder="Ej. Gala 2026" className="mt-1.5 w-full px-4 py-3 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white text-center focus:outline-none focus:border-fuchsia-500 placeholder-neutral-500" />
            </label>
            <label className="block text-xs text-neutral-400 font-bold uppercase text-center">
              Fecha
              <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="mt-1.5 w-48 mx-auto block px-4 py-3 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white text-center focus:outline-none focus:border-fuchsia-500" />
            </label>
            <div className="flex gap-2 pt-1 px-4">
              <button onClick={handleCreate} disabled={isSaving || !eventName || !eventDate} className="flex-1 py-2.5 bg-fuchsia-500 text-white font-display text-sm tracking-wider rounded-xl active:scale-95 disabled:opacity-50">
                {isSaving ? 'CREANDO...' : 'CREAR EVENTO'}
              </button>
              <button onClick={() => setShowCreate(false)} className="px-3 py-2.5 bg-neutral-700 text-neutral-300 rounded-xl text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit event modal */}
      {showEdit && event && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowEdit(false)}>
          <div className="bg-neutral-800 rounded-2xl border border-neutral-700 w-full max-w-sm p-8 pt-10 space-y-5 text-center" onClick={e => e.stopPropagation()}>
            <h3 className="font-display text-xl tracking-wide uppercase">Editar Evento</h3>
            <label className="block text-xs text-neutral-400 font-bold uppercase text-center">
              Nombre
              <input value={editEventName} onChange={e => setEditEventName(e.target.value)} className="mt-1.5 w-full px-4 py-3 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white text-center focus:outline-none focus:border-fuchsia-500" />
            </label>
            <label className="block text-xs text-neutral-400 font-bold uppercase text-center">
              Fecha
              <input type="date" value={editEventDate} onChange={e => setEditEventDate(e.target.value)} className="mt-1.5 w-48 mx-auto block px-4 py-3 bg-neutral-700/50 rounded-lg border border-neutral-600 text-sm text-white text-center focus:outline-none focus:border-fuchsia-500" />
            </label>
            <div className="flex gap-2 pt-1 px-4">
              <button onClick={handleUpdate} disabled={isSaving || !editEventName || !editEventDate} className="flex-1 py-2.5 bg-fuchsia-500 text-white font-display text-sm tracking-wider rounded-xl active:scale-95 disabled:opacity-50">
                {isSaving ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}
              </button>
              <button onClick={() => setShowEdit(false)} className="px-3 py-2.5 bg-neutral-700 text-neutral-300 rounded-xl text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
