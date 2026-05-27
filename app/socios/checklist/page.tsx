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

interface ChecklistItem {
  id: string
  event_id: string
  text: string
  category: 'logistica' | 'audio' | 'staff' | 'premios' | 'jueces' | 'general'
  priority: 'alta' | 'media' | 'baja'
  completed: boolean
  notes: string | null
  created_at: string
}

const CATEGORIES = [
  { id: 'all', label: 'Todos', color: 'text-white bg-neutral-800 border-neutral-700' },
  { id: 'logistica', label: 'Logística', icon: Shield, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  { id: 'audio', label: 'Audio / DJ', icon: Music, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  { id: 'staff', label: 'Staff', icon: Users, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  { id: 'premios', label: 'Premios', icon: Award, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  { id: 'jueces', label: 'Jueces', icon: Bookmark, color: 'text-fuchsia-400 bg-fuchsia-500/10 border-fuchsia-500/20' },
  { id: 'general', label: 'General', icon: ClipboardList, color: 'text-neutral-400 bg-neutral-500/10 border-neutral-700/30' },
] as const

const DANCE_EVENT_TEMPLATE = [
  { text: 'Colocar trofeos, medallas y diplomas en el podium', category: 'premios', priority: 'alta', notes: 'Verificar cantidad según categorías antes de iniciar.' },
  { text: 'Probar micrófonos de jueces y presentador (MC)', category: 'audio', priority: 'alta', notes: 'Tener baterías de repuesto a la mano.' },
  { text: 'Cargar música de todas las academias en la laptop de cabina', category: 'audio', priority: 'alta', notes: 'Verificar orden del programa en el sistema.' },
  { text: 'Preparar pulseras, folletos y boletos en taquilla', category: 'logistica', priority: 'alta', notes: 'Verificar cambio en caja.' },
  { text: 'Colocar botellas de agua para los jueces y staff', category: 'staff', priority: 'media', notes: 'Mantener botellas frías en nevera.' },
  { text: 'Imprimir u organizar hojas de calificación/jueces digitales', category: 'jueces', priority: 'alta', notes: 'Verificar claves de acceso al panel de jueceo.' },
  { text: 'Asegurar que el fotógrafo y videógrafo estén posicionados', category: 'staff', priority: 'media', notes: 'Confirmar tomas del escenario principal.' },
  { text: 'Verificar kit de primeros auxilios en backstage', category: 'logistica', priority: 'alta', notes: 'Hielo instantáneo para torceduras indispensable.' },
  { text: 'Coordinar la entrega de comida/snacks para el staff', category: 'staff', priority: 'baja', notes: 'Agendar entrega para el receso de la tarde.' },
  { text: 'Instalar/verificar lectores QR en la entrada', category: 'logistica', priority: 'alta', notes: 'Probar conexión a internet.' },
]

export default function ChecklistPage() {
  const { event } = useEventContext()
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedPriority, setSelectedPriority] = useState<string>('all')

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

  useEffect(() => {
    if (!event) return
    setLoading(true)
    fetchChecklist()
  }, [event?.id, fetchChecklist])

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
    const total = items.length
    const completed = items.filter((i) => i.completed).length
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, percentage }
  }, [items])

  // Filtered Checklist items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = item.text.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (item.notes && item.notes.toLowerCase().includes(searchTerm.toLowerCase()))
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory
      const matchesPriority = selectedPriority === 'all' || item.priority === selectedPriority
      return matchesSearch && matchesCategory && matchesPriority
    })
  }, [items, searchTerm, selectedCategory, selectedPriority])

  // Handle Toggle Complete
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
    <div className="p-4 pb-24 space-y-4 max-w-xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl tracking-wider uppercase flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-fuchsia-500" /> Checklist
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">Control de logística en tiempo real</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-1 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white px-3.5 py-2.5 rounded-xl font-display text-xs font-bold tracking-wider active:scale-95 transition-all shadow-[0_0_15px_rgba(217,70,239,0.3)] hover:brightness-110"
        >
          <Plus className="w-4 h-4" /> NUEVO
        </button>
      </div>

      {/* Circular/Glow Progress Card */}
      <div className="relative overflow-hidden rounded-3xl bg-neutral-900 border border-neutral-800 p-5 space-y-4 shadow-xl">
        <div className="absolute top-0 right-0 w-32 h-32 bg-fuchsia-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-sm text-neutral-400 font-bold uppercase tracking-wider">Estado del Evento</h2>
            <p className="text-xs text-neutral-500">
              {stats.completed} de {stats.total} tareas logradas
            </p>
          </div>
          <div className="text-right">
            <span className="font-display text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-purple-400 drop-shadow-[0_0_10px_rgba(217,70,239,0.2)]">
              {stats.percentage}%
            </span>
          </div>
        </div>

        {/* Progress Bar Container */}
        <div className="space-y-1.5">
          <div className="h-2.5 w-full bg-neutral-800 rounded-full overflow-hidden border border-neutral-700/30">
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

      {/* Toolbar / Search & Filters */}
      <div className="space-y-3 bg-neutral-800/20 border border-neutral-800/60 p-3 rounded-2xl">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            type="text"
            placeholder="Buscar tareas u organizadores..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-neutral-900/60 rounded-xl border border-neutral-800 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-fuchsia-500/50 transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Categories Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin select-none">
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id
            const CatIcon = 'icon' in cat ? cat.icon : null
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all active:scale-95 ${
                  isActive
                    ? cat.id === 'all'
                      ? 'bg-fuchsia-500 text-white border-fuchsia-500'
                      : 'bg-neutral-800 text-white border-fuchsia-500/40 ring-1 ring-fuchsia-500/20'
                    : cat.id === 'all'
                    ? 'bg-neutral-900 border-neutral-800 text-neutral-500'
                    : 'bg-neutral-900 border-neutral-800/40 text-neutral-400 hover:border-neutral-700/50'
                }`}
              >
                {CatIcon && <CatIcon className="w-3.5 h-3.5" />}
                {cat.label}
              </button>
            )
          })}
        </div>

        {/* Priority Filter */}
        <div className="flex items-center justify-between text-xs pt-1 border-t border-neutral-800/40">
          <span className="text-neutral-500 font-bold uppercase tracking-wider">Filtrar por prioridad:</span>
          <div className="flex gap-2">
            {['all', 'alta', 'media', 'baja'].map((pri) => (
              <button
                key={pri}
                onClick={() => setSelectedPriority(pri)}
                className={`px-2 py-0.5 rounded-md font-semibold text-[10px] uppercase border transition-all ${
                  selectedPriority === pri
                    ? pri === 'alta'
                      ? 'bg-red-500/20 text-red-400 border-red-500/30'
                      : pri === 'media'
                      ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                      : pri === 'baja'
                      ? 'bg-slate-500/20 text-slate-400 border-slate-500/30'
                      : 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-neutral-300'
                }`}
              >
                {pri === 'all' ? 'Todas' : pri}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Checklist Items List */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 space-y-3">
          <Loader2 className="w-8 h-8 text-fuchsia-500 animate-spin" />
          <p className="text-xs text-neutral-500">Cargando tareas en tiempo real...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-neutral-800/10 border border-neutral-800/50 rounded-2xl p-8 text-center space-y-4">
          <ClipboardList className="w-12 h-12 text-neutral-600 mx-auto" />
          <div className="space-y-1">
            <h3 className="font-display text-base tracking-wide uppercase text-neutral-300">No hay tareas</h3>
            <p className="text-xs text-neutral-500 max-w-xs mx-auto">
              {searchTerm || selectedCategory !== 'all' || selectedPriority !== 'all'
                ? 'Ninguna tarea coincide con los filtros aplicados.'
                : 'Esta lista está vacía. Comienza agregando una tarea o carga nuestra plantilla recomendada para danza.'}
            </p>
          </div>
          {(!searchTerm && selectedCategory === 'all' && selectedPriority === 'all') && (
            <button
              onClick={handleLoadTemplate}
              className="mx-auto flex items-center gap-1.5 bg-neutral-800 hover:bg-neutral-700 text-fuchsia-400 px-4 py-2.5 rounded-xl text-xs font-bold border border-fuchsia-500/20 active:scale-95 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 text-fuchsia-500" /> CARGAR PLANTILLA DE DANZA
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* Active checklist count banner */}
          <div className="flex items-center justify-between px-2 text-[10px] text-neutral-500 font-bold uppercase tracking-wider">
            <span>Tareas ({filteredItems.length})</span>
            <span className="flex items-center gap-1 text-fuchsia-500/80">
              <Activity className="w-3 h-3 animate-pulse" /> Sincronizado en tiempo real
            </span>
          </div>

          {/* List layout */}
          <div className="space-y-2">
            {filteredItems.map((item) => {
              const categoryDetails = CATEGORIES.find((c) => c.id === item.category)
              const CatIcon = categoryDetails && 'icon' in categoryDetails ? categoryDetails.icon : ClipboardList

              return (
                <div
                  key={item.id}
                  className={`group relative flex items-start gap-3 p-3.5 rounded-2xl border transition-all duration-300 ${
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
                      <CheckSquare className="w-5.5 h-5.5 text-fuchsia-500 scale-105 transition-all" />
                    ) : (
                      <Square className="w-5.5 h-5.5 text-neutral-600 hover:scale-105 transition-all" />
                    )}
                  </button>

                  {/* Task Content */}
                  <div className="flex-1 min-w-0 pr-12 space-y-1">
                    <p
                      className={`text-sm leading-snug font-medium select-text ${
                        item.completed ? 'line-through text-neutral-500 font-normal' : 'text-white'
                      }`}
                    >
                      {item.text}
                    </p>

                    {/* Notes (collapsible/subtext) */}
                    {item.notes && (
                      <p className="text-[11px] leading-relaxed text-neutral-500 italic select-text">
                        {item.notes}
                      </p>
                    )}

                    {/* Badges row */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {/* Category Badge */}
                      {categoryDetails && item.category !== 'general' && (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-extrabold uppercase border ${categoryDetails.color}`}>
                          <CatIcon className="w-2.5 h-2.5" />
                          {categoryDetails.label}
                        </span>
                      )}

                      {/* Priority Badge */}
                      <span
                        className={`px-1.5 py-0.5 rounded-md text-[9px] font-extrabold uppercase border ${
                          item.priority === 'alta'
                            ? 'bg-red-500/10 text-red-400 border-red-500/20'
                            : item.priority === 'media'
                            ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                            : 'bg-slate-500/10 text-slate-400 border-slate-700/40'
                        }`}
                      >
                        {item.priority}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons (visible on hover/focus in group) */}
                  <div className="absolute right-3.5 top-3.5 flex items-center gap-1 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEditModal(item)}
                      className="p-1.5 bg-neutral-800 text-neutral-400 hover:text-white rounded-lg border border-neutral-700/50 hover:bg-neutral-700/60 active:scale-90 transition-all"
                      title="Editar tarea"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-1.5 bg-red-500/10 text-red-400 hover:text-white hover:bg-red-500 rounded-lg border border-red-500/20 active:scale-90 transition-all"
                      title="Eliminar tarea"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
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
                  className="w-full px-3.5 py-2.5 bg-neutral-950 rounded-xl border border-neutral-800 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-fuchsia-500 transition-colors"
                />
              </div>

              {/* Category Picker */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">
                  Categoría
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.filter((c) => c.id !== 'all').map((cat) => {
                    const isSelected = taskCategory === cat.id
                    const CatIcon = 'icon' in cat ? cat.icon : ClipboardList
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setTaskCategory(cat.id as ChecklistItem['category'])}
                        className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs font-bold gap-1 transition-all ${
                          isSelected
                            ? 'bg-fuchsia-500/10 border-fuchsia-500 text-fuchsia-400 shadow-[0_0_10px_rgba(217,70,239,0.1)]'
                            : 'bg-neutral-950 border-neutral-800/80 text-neutral-500 hover:border-neutral-700/50 hover:text-neutral-300'
                        }`}
                      >
                        <CatIcon className="w-4 h-4" />
                        <span className="text-[9px] uppercase tracking-wider">{cat.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Priority Picker */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">
                  Prioridad
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['baja', 'media', 'alta'] as const).map((pri) => {
                    const isSelected = taskPriority === pri
                    return (
                      <button
                        key={pri}
                        type="button"
                        onClick={() => setTaskPriority(pri)}
                        className={`py-2 rounded-xl border text-[10px] font-extrabold uppercase transition-all ${
                          isSelected
                            ? pri === 'alta'
                              ? 'bg-red-500/20 border-red-500 text-red-400'
                              : pri === 'media'
                              ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                              : 'bg-slate-500/20 border-slate-500 text-slate-400'
                            : 'bg-neutral-950 border-neutral-800/80 text-neutral-500 hover:border-neutral-700/50'
                        }`}
                      >
                        {pri}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Notes Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">
                  Notas / Detalles (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Instrucciones adicionales para los socios..."
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-neutral-950 rounded-xl border border-neutral-800 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-fuchsia-500 transition-colors resize-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSaving || !taskText.trim()}
                  className="flex-1 py-3 bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-display text-sm tracking-wider font-bold rounded-xl active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingItem ? 'GUARDAR CAMBIOS' : 'CREAR TAREA'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-3 bg-neutral-800 text-neutral-400 rounded-xl text-xs font-bold hover:text-white border border-neutral-700/30 transition-colors"
                >
                  CANCELAR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
