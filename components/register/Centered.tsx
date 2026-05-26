'use client'
import { MessageCircle } from 'lucide-react'


export default function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[rgb(var(--c-surface))] text-[rgb(var(--c-text-strong))] flex flex-col font-sans">
      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
        {children}
      </div>
      <div className="px-6 py-3 shrink-0 flex justify-end">
        <a
          href="https://wa.me/525645415263"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 text-[rgb(var(--c-text))] hover:text-[rgb(var(--c-primary))] transition-all group active:scale-98"
        >
          <MessageCircle className="w-5 h-5 text-[rgb(var(--c-success))] shrink-0" />
          <span className="text-sm md:text-base">
            ¿Dudas o ayuda? Escríbenos por WhatsApp:{' '}
            <span className="font-display tracking-wider text-[rgb(var(--c-primary))]">564 541 5263</span>
          </span>
        </a>
      </div>
    </div>
  )
}

function MoneyInput({ value, onChange, onEnter }: {
  value: number | null
  onChange: (n: number | null) => void
  onEnter?: () => void
}) {
  return (
    <div className="relative max-w-sm mx-auto">
      <span className="absolute left-4 lg:left-5 top-1/2 -translate-y-1/2 text-[rgb(var(--c-primary))] font-display text-2xl lg:text-3xl pointer-events-none">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={value === null ? '' : String(value)}
        onChange={e => {
          const v = e.target.value.replace(/[^0-9.]/g, '')
          if (v === '') onChange(null)
          else {
            const n = Number(v)
            if (Number.isFinite(n)) onChange(n)
          }
        }}
        onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter() }}
        placeholder="0.00"
        className="w-full bg-white border border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] text-2xl lg:text-3xl text-center rounded-2xl h-12 lg:h-16 outline-none focus:border-[rgb(var(--c-primary))] focus:ring-1 focus:ring-[rgb(var(--c-primary))] font-display pl-10 lg:pl-12 pr-10 lg:pr-12 placeholder:text-[rgb(var(--c-text)/0.6)] transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none font-bold"
      />
    </div>
  )
}
