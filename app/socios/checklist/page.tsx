'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useEventContext } from '@/app/socios/layout'
import {
  Plus,
  X,
  Edit3,
  Trash2,
  ClipboardList,
  Check,
  Search,
  Sparkles,
  AlertTriangle,
  Music,
  Award,
  Shield,
  Users,
  CheckSquare,
  Square,
  FileText,
  Bookmark,
  Activity,
  Loader2,
} from 'lucide-react'
import { STATUS } from '../colors'

interface ChecklistItem {
  id: string
  event_id: string
  text: string
  category: 'escenografia' | 'iluminacion' | 'jueceo' | 'premiacion' | 'registro' | 'papeleria' | 'general'
  priority: 'alta' | 'media' | 'baja'
  completed: boolean
  notes: string | null
  created_at: string
}

const CATEGORIES = [
  { id: 'all', label: 'Todos', color: 'text-white' },
  { id: 'escenografia', label: 'Escenografía', icon: Activity, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  { id: 'iluminacion', label: 'Iluminación', icon: Shield, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { id: 'jueceo', label: 'Jueceo', icon: Bookmark, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { id: 'premiacion', label: 'Premiación', icon: Award, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  { id: 'registro', label: 'Registro', icon: Users, color: 'text-teal-400 bg-teal-500/10 border-teal-500/20' },
  { id: 'papeleria', label: 'Papelería', icon: FileText, color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  { id: 'general', label: 'General', icon: ClipboardList, color: 'text-neutral-400 bg-neutral-500/10 border-neutral-700/30' },
] as const

const DANCE_EVENT_TEMPLATE = [
  { text: 'Telas (fondo escenario)', category: 'escenografia', priority: 'alta', notes: '' },
  { text: 'Cinchos', category: 'escenografia', priority: 'alta', notes: '' },
  { text: 'Rollos piso', category: 'escenografia', priority: 'alta', notes: '' },
  { text: 'Cinta piso', category: 'escenografia', priority: 'alta', notes: '' },
  { text: 'Luces (4)', category: 'iluminacion', priority: 'alta', notes: '' },
  { text: 'Laptops Jueces (3)', category: 'jueceo', priority: 'alta', notes: '' },
  { text: 'Extensiones', category: 'iluminacion', priority: 'alta', notes: '' },
  { text: 'Mantel premiación', category: 'premiacion', priority: 'media', notes: '' },
  { text: 'Manteles rosas', category: 'premiacion', priority: 'media', notes: '' },
  { text: 'Manteles negros', category: 'premiacion', priority: 'media', notes: '' },
  { text: 'Muros tipo araña (3)', category: 'escenografia', priority: 'alta', notes: '' },
  { text: 'Banner Registro (1)', category: 'registro', priority: 'alta', notes: '' },
  { text: 'Banner Bienvenidos', category: 'general', priority: 'media', notes: '' },
  { text: 'Cinta precaución', category: 'escenografia', priority: 'media', notes: '' },
  { text: 'Diurex grueso (2)', category: 'papeleria', priority: 'media', notes: '' },
  { text: 'Cinta gris (1)', category: 'papeleria', priority: 'media', notes: '' },
  { text: 'Cutter (1)', category: 'papeleria', priority: 'media', notes: '' },
  { text: 'Tijeras medianas (1)', category: 'papeleria', priority: 'media', notes: '' },
  { text: 'Plumas', category: 'papeleria', priority: 'baja', notes: '' },
  { text: 'Medallas', category: 'premiacion', priority: 'alta', notes: '' },
  ] as const

export default function ChecklistPage() {
  const { event } = useEventContext()
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedPriority, setSelectedPriority] = useState<string>('all')

  // Sub-tab State
  const [activeSubTab, setActiveSubTab] = useState<'logistica' | 'pulseras'>('logistica')
  const [registrations, setRegistrations] = useState<any[]>([])
  const [dancers, setDancers] = useState<any[]>([])
  const [loadingRegs, setLoadingRegs] = useState(true)

  // Modal State
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null)
  const [taskText, setTaskText] = useState('')
  const [taskCategory, setTaskCategory] = useState<ChecklistItem['category']>('general')
  const [taskPriority, setTaskPriority] = useState<ChecklistItem['priority']>('media')
  const [taskNotes, setTaskNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Fetch Checklist items
  const fetchChecklist = useCallback(async () => {
    if (!event) return
    try {
      const { data, error } = await supabase
        .from('event_checklist')
        .select('*')
        .eq('event_id', event.id)
        .order('created_at', { ascending: true })

      if (error) throw error
      if (data) setItems(data)
    } catch (err) {
      console.error('Error fetching checklist:', err)
    } finally {
      setLoading(false)
    }
  }, [event?.id])

  // Fetch Registrations and Dancers for Pulseras Checklist
  const fetchRegistrations = useCallback(async () => {
    if (!event) return
    setLoadingRegs(true)
    try {
      const [rr, dr] = await Promise.all([
        supabase.from('coach_registrations').select('*').eq('event_id', event.id),
        supabase.from('registration_dancers').select('*'),
      ])
      const regs = rr.data ?? []
      const regIds = new Set(regs.map(r => r.id))
      
      // Excluir borradores o no enviados
      const validRegs = regs.filter(r => r.submitted_at && !r.submitted_at.startsWith('1970-01-01'))
      
      setRegistrations(validRegs)
      setDancers((dr.data ?? []).filter(d => regIds.has(d.registration_id)))
    } catch (err) {
      console.error('Error fetching registrations for checklist:', err)
    } finally {
      setLoadingRegs(false)
    }
  }, [event?.id])

  useEffect(() => {
    if (!event) return
    setLoading(true)
    fetchChecklist()
    fetchRegistrations()
  }, [event?.id, fetchChecklist, fetchRegistrations])

  // Realtime Subscription
  useEffect(() => {
    if (!event) return

    const ch = supabase
      .channel(`socios-checklist-${event.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'event_checklist',
          filter: `event_id=eq.${event.id}`,
        },
        (payload) => {
          // React to realtime changes dynamically!
          if (payload.eventType === 'INSERT') {
            const newItem = payload.new as ChecklistItem
            setItems((prev) => {
              if (prev.some((item) => item.id === newItem.id)) return prev
              return [...prev, newItem].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            })
          } else if (payload.eventType === 'UPDATE') {
            const updatedItem = payload.new as ChecklistItem
            setItems((prev) => prev.map((item) => (item.id === updatedItem.id ? updatedItem : item)))
          } else if (payload.eventType === 'DELETE') {
            const oldItem = payload.old as { id: string }
            setItems((prev) => prev.filter((item) => item.id !== oldItem.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [event?.id])

  // Stats calculation
  const stats = useMemo(() => {
    const logisticaItems = items.filter((i) => i.category !== 'pulseras')
    const total = logisticaItems.length
    const completed = logisticaItems.filter((i) => i.completed).length
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, percentage }
  }, [items])

  // Filtered Checklist items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (item.category === 'pulseras') return false // Exclude pulseras from general list
      const matchesSearch = item.text.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (item.notes && item.notes.toLowerCase().includes(searchTerm.toLowerCase()))
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory
      const matchesPriority = selectedPriority === 'all' || item.priority === selectedPriority
      return matchesSearch && matchesCategory && matchesPriority
    })
  }, [items, searchTerm, selectedCategory, selectedPriority])

  // Map database checklist items for pulseras by registration ID (stored in notes)
  const pulserasItemsMap = useMemo(() => {
    const map = new Map<string, ChecklistItem>()
    items.forEach((item) => {
      if (item.category === 'pulseras' && item.notes) {
        map.set(item.notes, item)
      }
    })
    return map
  }, [items])

  // Enrich and calculate wristbands for each registration
  const registrationsWithPulseras = useMemo(() => {
    return registrations.map((r) => {
      const regDancers = dancers.filter((d) => d.registration_id === r.id)
      const dbItem = pulserasItemsMap.get(String(r.id))
      const extraCoaches = (r.extra_coaches || []).filter((s: string) => s.trim() !== '')
      const asistentesCount = extraCoaches.filter((s: string) => s.startsWith('Asistente:') && s.replace(/^Asistente:\s*/, '').trim() !== '').length
      const coachCount = 1
      const totalPulseras = regDancers.length + asistentesCount + coachCount

      return {
        ...r,
        regDancers,
        asistentesCount,
        coachCount,
        totalPulseras,
        completed: dbItem ? dbItem.completed : false,
        dbItemId: dbItem ? dbItem.id : null,
      }
    }).sort((a, b) => (a.academy || '').localeCompare(b.academy || ''))
  }, [registrations, pulserasItemsMap, dancers])

  // Stats calculation for pulseras sub-tab
  const pulserasStats = useMemo(() => {
    const total = registrationsWithPulseras.length
    const completed = registrationsWithPulseras.filter((r) => r.completed).length
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, percentage }
  }, [registrationsWithPulseras])

  // Handle Toggle Complete for General Tareas
  async function handleToggleComplete(item: ChecklistItem) {
    // Optimistic Update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, completed: !item.completed } : i))
    )

    const { error } = await supabase
      .from('event_checklist')
      .update({ completed: !item.completed })
      .eq('id', item.id)

    if (error) {
      // Revert if error
      alert('Error al actualizar tarea: ' + error.message)
      fetchChecklist()
    }
  }

  // Handle Toggle Complete for Team Wristbands
  async function handleTogglePulsera(reg: any) {
    if (!event) return
    const nextCompleted = !reg.completed

    if (reg.dbItemId) {
      // Optimistic Update
      setItems((prev) =>
        prev.map((item) =>
          item.id === reg.dbItemId ? { ...item, completed: nextCompleted } : item
        )
      )

      const { error } = await supabase
        .from('event_checklist')
        .update({ completed: nextCompleted })
        .eq('id', reg.dbItemId)

      if (error) {
        alert('Error al actualizar entrega de pulseras: ' + error.message)
        fetchChecklist()
      }
    } else {
      // Optimistic Insert
      const tempId = 'temp-' + Math.random().toString(36).substr(2, 9)
      const newItem: ChecklistItem = {
        id: tempId,
        event_id: event.id,
        text: `Pulseras: ${reg.academy || reg.team_name || 'Sin nombre'}`,
        category: 'pulseras',
        priority: 'media',
        completed: nextCompleted,
        notes: String(reg.id),
        created_at: new Date().toISOString(),
      }

      setItems((prev) => [...prev, newItem])

      const { data, error } = await supabase
        .from('event_checklist')
        .insert({
          event_id: event.id,
          text: `Pulseras: ${reg.academy || reg.team_name || 'Sin nombre'}`,
          category: 'pulseras',
          priority: 'media',
          completed: nextCompleted,
          notes: String(reg.id),
        })
        .select('*')
        .single()

      if (error) {
        alert('Error al guardar registro de pulseras: ' + error.message)
        fetchChecklist()
      } else if (data) {
        // Swap temporary ID with real DB ID
        setItems((prev) =>
          prev.map((item) => (item.id === tempId ? (data as ChecklistItem) : item))
        )
      }
    }
  }

  // Load standard dance templates
  async function handleLoadTemplate() {
    if (!event) return
    if (items.length > 0 && !confirm('¿Deseas cargar la plantilla? Esto agregará las tareas predefinidas a la lista actual.')) return
    
    setLoading(true)
    const rows = DANCE_EVENT_TEMPLATE.map((t) => ({
      event_id: event.id,
      text: t.text,
      category: t.category,
      priority: t.priority,
      completed: false,
      notes: t.notes,
    }))

    const { error } = await supabase.from('event_checklist').insert(rows)
    if (error) {
      alert('Error al cargar la plantilla: ' + error.message)
    }
    fetchChecklist()
  }

  // Save or Update Item
  async function handleSaveItem(e: React.FormEvent) {
    e.preventDefault()
    if (!event || !taskText.trim()) return

    setIsSaving(true)
    try {
      if (editingItem) {
        // Update
        const { error } = await supabase
          .from('event_checklist')
          .update({
            text: taskText.trim(),
            category: taskCategory,
            priority: taskPriority,
            notes: taskNotes.trim() || null,
          })
          .eq('id', editingItem.id)

        if (error) throw error
      } else {
        // Create new
        const { error } = await supabase
          .from('event_checklist')
          .insert({
            event_id: event.id,
            text: taskText.trim(),
            category: taskCategory,
            priority: taskPriority,
            completed: false,
            notes: taskNotes.trim() || null,
          })

        if (error) throw error
      }
      setShowModal(false)
      setTaskText('')
      setTaskCategory('general')
      setTaskPriority('media')
      setTaskNotes('')
      setEditingItem(null)
      fetchChecklist()
    } catch (err) {
      alert('Error al guardar la tarea: ' + (err as Error).message)
    } finally {
      setIsSaving(false)
    }
  }

  // Delete Item
  async function handleDeleteItem(id: string) {
    if (!confirm('¿Estás seguro de eliminar esta tarea del checklist?')) return

    // Optimistic Delete
    setItems((prev) => prev.filter((item) => item.id !== id))

    const { error } = await supabase.from('event_checklist').delete().eq('id', id)
    if (error) {
      alert('Error al eliminar tarea: ' + error.message)
      fetchChecklist()
    }
  }

  // Open modal for editing
  function openEditModal(item: ChecklistItem) {
    setEditingItem(item)
    setTaskText(item.text)
    setTaskCategory(item.category)
    setTaskPriority(item.priority)
    setTaskNotes(item.notes || '')
    setShowModal(true)
  }

  // Open modal for creating
  function openCreateModal() {
    setEditingItem(null)
    setTaskText('')
    setTaskCategory('general')
    setTaskPriority('media')
    setTaskNotes('')
    setShowModal(true)
  }

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 space-y-3">
        <Loader2 className="w-8 h-8 text-fuchsia-500 animate-spin" />
        <p className="text-sm text-neutral-400">Cargando evento activo...</p>
      </div>
    )
  }

  return (
    <div className="px-1 py-4 pb-24 space-y-4 w-full">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <h1 className="font-display text-xl tracking-wider uppercase flex items-center gap-2 text-white">
            <ClipboardList className="w-5 h-5 text-fuchsia-500" /> Checklist
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">Control de logística</p>
        </div>
        {activeSubTab === 'logistica' && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-1 program-badge bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 hover:bg-fuchsia-500/20 px-3.5 py-2.5 font-display text-xs font-bold tracking-wider active:scale-[0.98] transition-all rounded-xl"
          >
            <Plus className="w-4 h-4" /> <span>NUEVO</span>
          </button>
        )}
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-neutral-800/40 w-full mb-1">
        <button
          onClick={() => {
            setActiveSubTab('logistica')
            setSearchTerm('')
          }}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 text-center ${
            activeSubTab === 'logistica'
              ? 'border-fuchsia-500 text-fuchsia-400 font-extrabold'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          Logística General
        </button>
        <button
          onClick={() => {
            setActiveSubTab('pulseras')
            setSearchTerm('')
          }}
          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 text-center ${
            activeSubTab === 'pulseras'
              ? 'border-fuchsia-500 text-fuchsia-400 font-extrabold'
              : 'border-transparent text-neutral-400 hover:text-white'
          }`}
        >
          Control de Pulseras
        </button>
      </div>

      {/* Search Input (Logística General only) */}
      {activeSubTab === 'logistica' && (
        <div className="relative w-full px-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar tarea..."
            className="search-input w-full pl-12 pr-3 py-2.5 bg-neutral-800/60 border border-neutral-600/40 text-xs focus:outline-none focus:border-fuchsia-500/50 focus:bg-neutral-800 text-white placeholder-neutral-500 rounded-xl"
          />
        </div>
      )}

      {activeSubTab === 'logistica' ? (
        <>
          {/* Circular/Glow Progress Card */}
          <div className="relative overflow-hidden rounded-2xl bg-neutral-800/40 border border-neutral-700/50 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-sm text-neutral-400 font-bold uppercase tracking-wider">Estado del Evento</h2>
                <p className="text-xs text-neutral-500">
                  {stats.completed} de {stats.total} tareas logradas
                </p>
              </div>
              <div className="text-right">
                <span className="font-display text-3xl font-extrabold text-white">
                  {stats.percentage}%
                </span>
              </div>
            </div>

            {/* Progress Bar Container */}
            <div className="space-y-1.5">
              <div className="h-2.5 w-full bg-neutral-900/60 rounded-full overflow-hidden border border-neutral-700/30">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 transition-all duration-500 relative"
                  style={{ width: `${stats.percentage}%` }}
                >
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.3)_50%,transparent_100%)] animate-pulse" />
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">
                <span>Inicio</span>
                <span>{stats.percentage >= 100 ? '¡Listo para el show!' : 'En preparación'}</span>
              </div>
            </div>
          </div>

          {/* Main Checklist Items List */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <Loader2 className="w-8 h-8 text-fuchsia-500 animate-spin" />
              <p className="text-xs text-neutral-500">Cargando tareas...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-8 text-center space-y-4">
              <ClipboardList className="w-12 h-12 text-neutral-600 mx-auto" />
              <div className="space-y-1">
                <h3 className="font-display text-base tracking-wide uppercase text-neutral-300">No hay tareas</h3>
                <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                  {searchTerm ? 'No se encontraron tareas que coincidan con la búsqueda.' : 'Esta lista está vacía. Comienza agregando una tarea o carga nuestra plantilla recomendada para danza.'}
                </p>
              </div>
              {!searchTerm && (
                <button
                  onClick={handleLoadTemplate}
                  className="mx-auto flex items-center gap-1.5 program-badge bg-neutral-800/80 text-white px-4 py-2.5 text-xs font-bold border border-neutral-700 hover:bg-neutral-750 active:scale-95 transition-all rounded-xl"
                >
                  Cargar plantilla
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* Active checklist count banner */}
              <div className="flex items-center justify-between px-2 text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
                <span>Tareas ({filteredItems.length})</span>
              </div>

              {/* List layout */}
              <div className="space-y-3">
                {filteredItems
                  .slice()
                  .sort((a, b) => {
                    if (a.completed === b.completed) {
                      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                    }
                    return a.completed ? 1 : -1
                  })
                  .map((item) => {
                  return (
                    <div
                      key={item.id}
                      className={`group relative flex items-start gap-4 p-4.5 rounded-2xl border transition-all duration-300 ${
                        item.completed
                          ? 'bg-neutral-900/40 border-neutral-800/40 opacity-50'
                          : 'bg-neutral-800/30 border-neutral-700/30 hover:border-neutral-700 hover:bg-neutral-800/40 shadow-sm'
                      }`}
                    >
                      {/* Interactive Checkbox */}
                      <button
                        onClick={() => handleToggleComplete(item)}
                        className="shrink-0 mt-0.5 text-neutral-500 hover:text-fuchsia-500 transition-colors focus:outline-none"
                        aria-label={item.completed ? 'Marcar como pendiente' : 'Marcar como completada'}
                      >
                        {item.completed ? (
                          <CheckSquare className="w-7 h-7 text-fuchsia-500 transition-all animate-fade-in" />
                        ) : (
                          <Square className="w-7 h-7 text-neutral-600 hover:scale-105 transition-all" />
                        )}
                      </button>

                      {/* Task Content */}
                      <div className="flex-1 min-w-0 pr-16 space-y-1.5 text-left">
                        <p
                          className={`text-base sm:text-lg leading-snug font-bold select-text ${
                            item.completed ? 'line-through text-neutral-500 font-normal' : 'text-white'
                          }`}
                        >
                          {item.text}
                        </p>

                        {/* Notes */}
                        {item.notes && (
                          <p className="text-xs leading-relaxed text-neutral-400 italic select-text mt-1">
                            {item.notes}
                          </p>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="absolute right-4 top-4 flex items-center gap-2 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-2 bg-black hover:bg-neutral-900 border border-neutral-800 rounded-xl active:scale-95 transition-all flex items-center justify-center"
                          title="Editar tarea"
                        >
                          <Edit3 className="w-[18px] h-[18px]" stroke="#ffffff" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-2 bg-black hover:bg-neutral-900 border border-neutral-800 rounded-xl active:scale-95 transition-all flex items-center justify-center"
                          title="Eliminar tarea"
                        >
                          <Trash2 className="w-[18px] h-[18px]" stroke="#ffffff" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Pulseras Progress Card */}
          <div className="relative overflow-hidden rounded-2xl bg-neutral-800/40 border border-neutral-700/50 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-sm text-neutral-400 font-bold uppercase tracking-wider">Entrega de Pulseras</h2>
                <p className="text-xs text-neutral-500">
                  {pulserasStats.completed} de {pulserasStats.total} equipos contabilizados
                </p>
              </div>
              <div className="text-right">
                <span className="font-display text-3xl font-extrabold text-white">
                  {pulserasStats.percentage}%
                </span>
              </div>
            </div>

            {/* Progress Bar Container */}
            <div className="space-y-1.5">
              <div className="h-2.5 w-full bg-neutral-900/60 rounded-full overflow-hidden border border-neutral-700/30">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 transition-all duration-500 relative"
                  style={{ width: `${pulserasStats.percentage}%` }}
                >
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.3)_50%,transparent_100%)] animate-pulse" />
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-neutral-500 font-semibold uppercase tracking-wider">
                <span>Inicio</span>
                <span>{pulserasStats.percentage >= 100 ? '¡Todo entregado!' : 'En proceso'}</span>
              </div>
            </div>
          </div>

          {/* Pulseras List */}
          {loadingRegs ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <Loader2 className="w-8 h-8 text-fuchsia-500 animate-spin" />
              <p className="text-xs text-neutral-500">Cargando equipos...</p>
            </div>
          ) : registrationsWithPulseras.length === 0 ? (
            <p className="text-center text-neutral-500 py-10 text-xs">No hay equipos registrados para este evento.</p>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-2 text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
                <span>Equipos ({registrationsWithPulseras.length})</span>
              </div>

              <div className="space-y-3">
                {registrationsWithPulseras
                  .map((reg) => {
                    return (
                      <div
                        key={reg.id}
                        className={`group relative flex items-start gap-4 p-4.5 rounded-2xl border transition-all duration-300 ${
                          reg.completed
                            ? 'bg-neutral-900/40 border-neutral-800/40 opacity-60 shadow-inner'
                            : 'bg-neutral-800/30 border-neutral-700/30 hover:border-neutral-750 hover:bg-neutral-800/40 shadow-sm'
                        }`}
                      >
                        {/* Interactive Checkbox */}
                        <button
                          onClick={() => handleTogglePulsera(reg)}
                          className="shrink-0 mt-1 text-neutral-500 hover:text-fuchsia-500 transition-colors focus:outline-none"
                          aria-label={reg.completed ? 'Marcar como pendiente' : 'Marcar como listas'}
                        >
                          {reg.completed ? (
                            <CheckSquare className="w-7 h-7 text-emerald-500 transition-all animate-fade-in" />
                          ) : (
                            <Square className="w-7 h-7 text-neutral-600 hover:scale-105 transition-all" />
                          )}
                        </button>

                        {/* Team Wristbands Info */}
                        <div className="flex-1 min-w-0 space-y-2 text-left">
                          <div>
                            <h3 className={`text-base sm:text-lg leading-snug font-bold ${
                              reg.completed ? 'line-through text-neutral-500 font-normal' : 'text-white'
                            }`}>
                              {reg.academy || '(sin academia)'}
                            </h3>
                            <p className="text-xs text-neutral-400 mt-0.5">
                              Coach: <span className="text-neutral-300">{reg.coach_name}</span>
                            </p>
                          </div>

                          {/* Wristbands breakdown */}
                          <div className="grid grid-cols-4 gap-2 pt-2 border-t border-neutral-800/40 text-xs">
                            <div>
                              <span className="text-neutral-500 uppercase text-[9px] tracking-wider font-bold">Total</span>
                              <p className={`text-base font-black mt-0.5 ${reg.completed ? 'text-neutral-500' : 'text-fuchsia-400'}`}>{reg.totalPulseras}</p>
                            </div>
                            <div>
                              <span className="text-neutral-500 uppercase text-[9px] tracking-wider font-bold">Integrantes</span>
                              <p className={`text-base font-black mt-0.5 ${reg.completed ? 'text-neutral-500' : 'text-white'}`}>{reg.regDancers?.length || 0}</p>
                            </div>
                            <div>
                              <span className="text-neutral-500 uppercase text-[9px] tracking-wider font-bold">Asistentes</span>
                              <p className={`text-base font-black mt-0.5 ${reg.completed ? 'text-neutral-500' : 'text-white'}`}>{reg.asistentesCount}</p>
                            </div>
                            <div>
                              <span className="text-neutral-500 uppercase text-[9px] tracking-wider font-bold">Coach</span>
                              <p className={`text-base font-black mt-0.5 ${reg.completed ? 'text-neutral-500' : 'text-white'}`}>{reg.coachCount}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Create/Edit Task Modal Dialog */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-md p-5 space-y-4 shadow-2xl relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-fuchsia-500/5 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg tracking-wider uppercase text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-fuchsia-500" />
                {editingItem ? 'Editar Tarea' : 'Nueva Tarea'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4">
              {/* Task Text Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">
                  Descripción
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Comprar baterías para los micrófonos"
                  value={taskText}
                  onChange={(e) => setTaskText(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-neutral-950 rounded-xl border border-neutral-700 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-fuchsia-500 transition-colors"
                />
              </div>



              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">
                  Notas (opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Detalles adicionales..."
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-neutral-950 rounded-xl border border-neutral-700 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-fuchsia-500 transition-colors resize-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSaving || !taskText.trim()}
                  style={{ backgroundColor: '#000000', color: '#ffffff' }}
                  className="flex-1 py-3 bg-black hover:bg-neutral-900 border border-neutral-800 font-display text-sm tracking-wider font-bold rounded-xl active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#ffffff' }} />}
                  <span style={{ color: '#ffffff' }}>{editingItem ? 'GUARDAR CAMBIOS' : 'CREAR TAREA'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{ backgroundColor: '#000000', color: '#ffffff' }}
                  className="px-4 py-3 bg-black hover:bg-neutral-900 border border-neutral-800 rounded-xl text-xs font-bold"
                >
                  <span style={{ color: '#ffffff' }}>CANCELAR</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
