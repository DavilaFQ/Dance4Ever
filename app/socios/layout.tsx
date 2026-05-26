'use client'

import { useEffect, useState, useCallback, createContext, useContext, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase, Event } from '@/lib/supabase'
import {
  Home,
  Users,
  Calendar,
  ListOrdered,
  DollarSign,
  Settings,
  QrCode,
  X,
  RefreshCw,
} from 'lucide-react'
import QRCode from 'qrcode'
import { formatRelative } from '@/lib/format'

type EventContextType = {
  events: Event[]
  event: Event | null
  lastSync: string
  loadAll: () => Promise<void>
  loadEvents: () => Promise<void>
  refreshEvent: () => Promise<void>
}

export const EventContext = createContext<EventContextType>({
  events: [],
  event: null,
  lastSync: new Date().toISOString(),
  loadAll: async () => {},
  loadEvents: async () => {},
  refreshEvent: async () => {},
})

export function useEventContext() {
  return useContext(EventContext)
}

const TABS = [
  { id: 'resumen', label: 'Resumen', icon: Home, path: '/socios/resumen' },
  { id: 'registros', label: 'Registros', icon: Users, path: '/socios/registros' },
  { id: 'finanzas', label: 'Finanzas', icon: DollarSign, path: '/socios/finanzas' },
  { id: 'programa', label: 'Programa', icon: ListOrdered, path: '/socios/programa' },
  { id: 'eventos', label: 'Ajustes', icon: Settings, path: '/socios/eventos' },
] as const

export default function SociosLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [events, setEvents] = useState<Event[]>([])
  const [event, setEvent] = useState<Event | null>(null)
  const [lastSync, setLastSync] = useState<string>(new Date().toISOString())
  const [showQr, setShowQr] = useState(false)
  const [qrUrl, setQrUrl] = useState('')
  const [origin, setOrigin] = useState('')

  useEffect(() => { setOrigin(window.location.origin) }, [])

  const loadEvents = useCallback(async () => {
    const { data } = await supabase.from('events').select('*').order('created_at', { ascending: false })
    if (data && data.length > 0) {
      setEvents(data)
      const freshCurrent = data.find(e => e.id === event?.id)
      if (freshCurrent) {
        setEvent(freshCurrent)
      } else {
        setEvent(data[0])
      }
    }
  }, [event?.id])

  const refreshEvent = useCallback(async () => {
    if (!event) return
    const { data } = await supabase.from('events').select('*').eq('id', event.id).single()
    if (data) setEvent(data)
  }, [event])

  const loadAll = useCallback(async () => {
    setLastSync(new Date().toISOString())
  }, [])

  useEffect(() => { loadEvents() }, [])

  useEffect(() => {
    if (!event) return
    const ch = supabase
      .channel(`socios-shell-${event.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => loadEvents())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [event?.id, loadEvents])

  useEffect(() => {
    if (!event?.registration_token || !origin) return
    const url = `${origin}/register/${event.id}?t=${event.registration_token}`
    QRCode.toDataURL(url, { width: 400, margin: 2 }).then(setQrUrl).catch(() => {})
  }, [event?.registration_token, event?.id, origin])

  const activeTab = TABS.find(t => pathname.startsWith(t.path))?.id ?? 'resumen'

  return (
    <EventContext.Provider value={{ events, event, lastSync, loadAll, loadEvents, refreshEvent }}>
      <div className="socios-dark h-[100dvh] flex flex-col bg-neutral-900 text-white overflow-hidden select-none">
        <div className="shrink-0 bg-neutral-900" style={{ height: 'env(safe-area-inset-top, 0px)' }} />

        <header className="shrink-0 backdrop-blur-xl bg-neutral-900/85 border-b border-neutral-800 z-30">
          <div className="flex items-center justify-between px-4 py-2.5 gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Image src="/logo.png" alt="Dance4ever" width={36} height={27} priority className="shrink-0" />
              <div className="min-w-0">
                <p className="text-[9px] font-display tracking-[0.3em] text-fuchsia-500 font-bold leading-none uppercase">SOCIOS</p>
                <p className="font-display text-base tracking-wider text-white truncate">
                  {event?.name ?? 'Cargando...'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {event?.registration_token && (
                <button
                  onClick={() => setShowQr(true)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/30 text-fuchsia-400 active:scale-90 transition-all"
                  aria-label="Mostrar QR de registro"
                >
                  <QrCode className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => loadAll()}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-500 active:scale-90 transition-all"
                aria-label="Sincronizar"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </main>

        <nav
          className="shrink-0 backdrop-blur-xl bg-neutral-900/85 border-t border-neutral-800 z-30"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="grid grid-cols-5 h-14">
            {TABS.map(tab => {
              const active = tab.id === activeTab
              return (
                <button
                  key={tab.id}
                  onClick={() => router.push(tab.path)}
                  className={`flex flex-col items-center justify-center gap-0.5 transition-colors active:bg-neutral-800/50 ${
                    active ? 'text-fuchsia-500' : 'text-neutral-600'
                  }`}
                >
                  <tab.icon className="w-5 h-5" />
                  <span className={`text-[10px] font-display tracking-wider ${active ? 'font-bold' : ''}`}>
                    {tab.label}
                  </span>
                </button>
              )
            })}
          </div>
        </nav>

        {/* QR Modal */}
        {showQr && event && qrUrl && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowQr(false)}>
            <div className="bg-neutral-800 rounded-2xl border border-neutral-700 w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg tracking-wider uppercase text-white">QR de Registro</h3>
                <button onClick={() => setShowQr(false)}><X className="w-5 h-5 text-neutral-400" /></button>
              </div>
              <div className="bg-white rounded-xl p-3">
                <img src={qrUrl} alt="QR Registro" className="w-full rounded-lg" />
              </div>
              <p className="text-[10px] text-neutral-400 text-center break-all font-mono">
                {origin}/register/{event.id}?t={event.registration_token}
              </p>
              <p className="text-xs text-neutral-500 text-center">
                Escanea este codigo QR para acceder al formulario de registro
              </p>
            </div>
          </div>
        )}
      </div>
    </EventContext.Provider>
  )
}
