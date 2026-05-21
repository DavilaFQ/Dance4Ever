'use client'
import { useState } from 'react'
import { X, Trash2, Save } from 'lucide-react'
import { supabase, Participant, Coach } from '@/lib/supabase'

type Mode = { kind: 'edit', p: Participant } | { kind: 'create' }

export default function ParticipantEditor({
  mode,
  eventId,
  coaches,
  totalCount,
  onClose,
}: {
  mode: Mode
  eventId: string
  coaches: Coach[]
  totalCount: number
  onClose: () => void
}) {
  const isEdit = mode.kind === 'edit'
  const p = mode.kind === 'edit' ? mode.p : null

  const defaultPosition = p ? p.position : Math.max(1, totalCount + 1)
  const maxPos = isEdit ? Math.max(1, totalCount) : Math.max(1, totalCount + 1)

  const [position, setPosition] = useState<number>(defaultPosition)
  const [name, setName] = useState(p?.name ?? '')
  const [academy, setAcademy] = useState(p?.academy ?? '')
  const [category, setCategory] = useState(p?.category ?? '')
  const [type, setType] = useState(p?.type ?? '')
  const [style, setStyle] = useState(p?.style ?? '')
  const [city, setCity] = useState(p?.city ?? '')
  const [coachId, setCoachId] = useState<string | null>(p?.coach_id ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const safePosition = Math.max(1, Math.min(maxPos, Number.isFinite(position) ? position : defaultPosition))

  async function save() {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      if (isEdit && p) {
        if (safePosition !== p.position) {
          const { error: rpcErr } = await supabase.rpc('reorder_participant', { p_id: p.id, new_pos: safePosition })
          if (rpcErr) throw rpcErr
        }
        const { error: updErr } = await supabase.from('participants').update({
          name: name.trim(),
          academy: academy.trim(),
          category: category.trim(),
          type: type.trim(),
          style: style.trim(),
          city: city.trim(),
          coach_id: coachId,
        }).eq('id', p.id)
        if (updErr) throw updErr
      } else {
        const { error: rpcErr } = await supabase.rpc('insert_participant', {
          p_event_id: eventId,
          p_position: safePosition,
          p_name: name.trim(),
          p_academy: academy.trim() || null,
          p_category: category.trim() || null,
          p_type: type.trim() || null,
          p_style: style.trim() || null,
          p_city: city.trim() || null,
          p_coach_id: coachId,
        })
        if (rpcErr) throw rpcErr
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  async function del() {
    if (!isEdit || !p) return
    if (!confirm(`¿Eliminar #${p.position} ${p.name}?`)) return
    setBusy(true)
    setError(null)
    try {
      const { error: rpcErr } = await supabase.rpc('delete_participant_compact', { p_id: p.id })
      if (rpcErr) throw rpcErr
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-neutral-900 z-[60] flex flex-col">
      <div className="bg-black px-4 py-3 flex items-center justify-between shrink-0">
        <h3 className="font-display text-2xl tracking-widest text-fuchsia-500 truncate">
          {isEdit && p ? `EDITAR #${p.position}` : 'NUEVO TURNO'}
        </h3>
        <button onClick={onClose} aria-label="Cerrar"><X className="w-6 h-6" /></button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 text-white">
        <Field label="POSICIÓN">
          <input type="number" min={1} max={maxPos} value={position}
            onChange={e => setPosition(Number(e.target.value))}
            className="w-full bg-neutral-800 text-white rounded-md px-3 py-2 font-display text-xl outline-none focus:bg-neutral-700"
          />
          <p className="text-xs text-neutral-500 mt-1">1 a {maxPos}</p>
        </Field>
        <Field label="NOMBRE / EQUIPO">
          <input value={name} onChange={e => setName(e.target.value)} autoCapitalize="characters"
            className="w-full bg-neutral-800 text-white rounded-md px-3 py-2 font-display text-xl uppercase outline-none focus:bg-neutral-700"
          />
        </Field>
        <Field label="ACADEMIA">
          <input value={academy} onChange={e => setAcademy(e.target.value)} autoCapitalize="characters"
            className="w-full bg-neutral-800 text-white rounded-md px-3 py-2 font-display text-xl uppercase outline-none focus:bg-neutral-700"
          />
        </Field>
        <Field label="CATEGORÍA">
          <input value={category} onChange={e => setCategory(e.target.value)} autoCapitalize="characters"
            className="w-full bg-neutral-800 text-white rounded-md px-3 py-2 font-display text-xl uppercase outline-none focus:bg-neutral-700"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="MODALIDAD">
            <input value={type} onChange={e => setType(e.target.value)} autoCapitalize="characters"
              className="w-full bg-neutral-800 text-white rounded-md px-3 py-2 font-display text-xl uppercase outline-none focus:bg-neutral-700"
            />
          </Field>
          <Field label="ESTILO">
            <input value={style} onChange={e => setStyle(e.target.value)} autoCapitalize="characters"
              className="w-full bg-neutral-800 text-white rounded-md px-3 py-2 font-display text-xl uppercase outline-none focus:bg-neutral-700"
            />
          </Field>
        </div>
        <Field label="CIUDAD">
          <input value={city} onChange={e => setCity(e.target.value)} autoCapitalize="characters"
            className="w-full bg-neutral-800 text-white rounded-md px-3 py-2 font-display text-xl uppercase outline-none focus:bg-neutral-700"
          />
        </Field>
        <Field label="COACH">
          <select value={coachId ?? ''} onChange={e => setCoachId(e.target.value || null)}
            className="w-full bg-neutral-800 text-white rounded-md px-3 py-2 font-display text-xl outline-none focus:bg-neutral-700"
          >
            <option value="">— Sin coach —</option>
            {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        {error && (
          <p className="text-red-400 text-sm bg-red-950/40 border border-red-900 rounded-md px-3 py-2 break-words">{error}</p>
        )}
      </div>

      <div className="shrink-0 flex">
        {isEdit && (
          <button onClick={del} disabled={busy} className="bg-red-600 active:bg-red-700 text-white px-5 py-4 font-display text-xl flex items-center gap-2 disabled:opacity-50">
            <Trash2 className="w-5 h-5" /> ELIMINAR
          </button>
        )}
        <button onClick={save} disabled={busy || !name.trim()} className="flex-1 bg-green-500 active:bg-green-600 text-black py-4 font-display text-xl flex items-center justify-center gap-2 disabled:opacity-50">
          <Save className="w-5 h-5" /> {busy ? 'GUARDANDO…' : 'GUARDAR'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string, children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-display tracking-widest text-neutral-400">{label}</label>
      {children}
    </div>
  )
}
