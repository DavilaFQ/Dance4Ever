'use client'
import { Search, X } from 'lucide-react'

export default function SearchBar({ value, onChange, placeholder = 'BUSCAR…' }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="bg-neutral-900 px-3 py-2 shrink-0 border-b border-neutral-800">
      <div className="relative">
        <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode="search"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full bg-neutral-800 text-white rounded-md pl-10 pr-9 py-2.5 font-display tracking-wider text-lg placeholder:text-neutral-500 outline-none focus:bg-neutral-700"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-neutral-400 active:text-white"
            aria-label="Limpiar búsqueda"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  )
}
