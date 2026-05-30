'use client'

import { useEffect, useState, useCallback, createContext, useContext, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase, Event } from '@/lib/supabase'
import { hashPassword } from '@/lib/crypto'
import { TAB, WHATSAPP } from './colors'
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
  ClipboardList,
  Eye,
  EyeOff,
  LogOut,
} from 'lucide-react'

import QRCode from 'qrcode'

// Import all subpages statically as components of the SPA
import ResumenPage from '@/app/socios/resumen/page'
import RegistrosPage from '@/app/socios/registros/page'
import RegistrationDetailPage from '@/app/socios/registros/[registrationId]/page'
import FinanzasPage from '@/app/socios/finanzas/page'
import ProgramaPage from '@/app/socios/programa/page'
import ChecklistPage from '@/app/socios/checklist/page'
import EventosPage from '@/app/socios/eventos/page'

type EventContextType = {
  events: Event[]
  event: Event | null
  lastSync: string
  loadAll: () => Promise<void>
  loadEvents: () => Promise<void>
  refreshEvent: () => Promise<void>
  hideFinancials: boolean
  toggleHideFinancials: () => void
}

export const EventContext = createContext<EventContextType>({
  events: [],
  event: null,
  lastSync: new Date().toISOString(),
  loadAll: async () => {},
  loadEvents: async () => {},
  refreshEvent: async () => {},
  hideFinancials: false,
  toggleHideFinancials: () => {},
})

export function useEventContext() {
  return useContext(EventContext)
}

const TABS = [
  { id: 'resumen', label: 'Resumen', icon: Home },
  { id: 'registros', label: 'Registros', icon: Users },
  { id: 'finanzas', label: 'Finanzas', icon: DollarSign },
  { id: 'programa', label: 'Programa', icon: ListOrdered },
  { id: 'checklist', label: 'Checklist', icon: ClipboardList },
  { id: 'eventos', label: 'Ajustes', icon: Settings },
] as const

export default function SociosLayout({ children }: { children: React.ReactNode }) {
  // Security states
  const [isGateUnlocked, setIsGateUnlocked] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [verifyingPassword, setVerifyingPassword] = useState(false)

  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 1. Verificar la puerta secreta por token URL o si es PWA/Web Clip autónomo (Add to Home Screen)
    const isStandalone = typeof window !== 'undefined' && (
      (window.navigator as any).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches
    )

    const params = new URLSearchParams(window.location.search)
    const tParam = params.get('t')

    if (tParam === 'd4e' || isStandalone) {
      localStorage.setItem('d4e_dashboard_gate', 'unlocked')
      setIsGateUnlocked(true)
      
      // Limpiar el parámetro de la URL sin recargar (solo si venía el token)
      if (tParam === 'd4e') {
        const cleanUrl = window.location.pathname
        window.history.replaceState({}, '', cleanUrl)
      }
    } else {
      const savedGate = localStorage.getItem('d4e_dashboard_gate')
      if (savedGate === 'unlocked') {
        setIsGateUnlocked(true)
      } else {
        // Redirigir al inicio si no se tiene acceso secreto
        router.push('/')
        return
      }
    }

    // 2. Verificar hash guardado contra la contraseña del servidor
    const savedHash = localStorage.getItem('d4e_dashboard_hash')
    const envPassword = process.env.NEXT_PUBLIC_DASHBOARD_PASSWORD
    if (savedHash && envPassword) {
      setVerifyingPassword(true)
      hashPassword(envPassword).then(expectedHash => {
        if (savedHash === expectedHash) {
          setIsAuthenticated(true)
        } else {
          localStorage.removeItem('d4e_dashboard_hash')
        }
      }).catch(() => {
        localStorage.removeItem('d4e_dashboard_hash')
      }).finally(() => {
        setCheckingAuth(false)
        setVerifyingPassword(false)
      })
    } else {
      setCheckingAuth(false)
    }
  }, [router])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!authPassword.trim()) return
    setVerifyingPassword(true)
    setAuthError(null)

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: authPassword.trim() }),
      })

      if (res.ok) {
        const h = await hashPassword(authPassword.trim())
        if (h) localStorage.setItem('d4e_dashboard_hash', h)
        setIsAuthenticated(true)
      } else {
        setAuthError('Contraseña incorrecta')
      }
    } catch (err) {
      setAuthError('Error de conexión con el servidor')
    } finally {
      setVerifyingPassword(false)
    }
  }

  function handleLogout() {
    if (confirm('¿Desea cerrar sesión y bloquear el acceso al dashboard?')) {
      localStorage.removeItem('d4e_dashboard_hash')
      localStorage.removeItem('d4e_dashboard_gate')
      setIsAuthenticated(false)
      setIsGateUnlocked(false)
      router.push('/')
    }
  }

  const [activeTab, setActiveTab] = useState<'resumen' | 'registros' | 'finanzas' | 'programa' | 'checklist' | 'eventos'>('resumen')
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<string | null>(null)

  
  const [events, setEvents] = useState<Event[]>([])
  const [event, setEvent] = useState<Event | null>(null)
  const [lastSync, setLastSync] = useState<string>(new Date().toISOString())
  const [showQr, setShowQr] = useState(false)
  const [qrUrl, setQrUrl] = useState('')
  const [origin, setOrigin] = useState('')
  const [hideFinancials, setHideFinancials] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [isKeyboardActive, setIsKeyboardActive] = useState(false)
  const lastFocusedInput = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Set mobile browser status bar (safe area/notch) color to match our light header
    const metaTheme = document.querySelector('meta[name="theme-color"]')
    const originalColor = metaTheme ? metaTheme.getAttribute('content') : '#000000'
    if (metaTheme) {
      metaTheme.setAttribute('content', '#ffffff')
    }

    return () => {
      // Restore original theme color upon leaving socios dashboard
      if (metaTheme && originalColor) {
        metaTheme.setAttribute('content', originalColor)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        lastFocusedInput.current = target
        // En móviles y tablets (ancho <= 1024px) donde hay teclados virtuales
        if (window.innerWidth <= 1024) {
          setIsKeyboardActive(true)
        }
      }
    }

    const handleFocusOut = () => {
      setTimeout(() => {
        const activeEl = document.activeElement
        if (!activeEl || (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA')) {
          setIsKeyboardActive(false)
        }
      }, 50)
    }

    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)
    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [])

  useEffect(() => {
    if (!isKeyboardActive) {
      if (typeof window !== 'undefined') {
        window.scrollTo(0, 0) // Resetea cualquier scroll externo de ventana del OS
      }
      setTimeout(() => {
        if (lastFocusedInput.current) {
          // Desplaza de forma suave el input desenfocado al área visible para que no se oculte tras el nav bar
          lastFocusedInput.current.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
          })
        }
      }, 100)
    }
  }, [isKeyboardActive])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('hideFinancials') === 'true'
      setHideFinancials(saved)
      ;(window as any).hideFinancials = saved
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)
    
    setIsOffline(!navigator.onLine)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const toggleHideFinancials = useCallback(() => {
    const next = !hideFinancials
    setHideFinancials(next)
    if (typeof window !== 'undefined') {
      localStorage.setItem('hideFinancials', String(next))
      ;(window as any).hideFinancials = next
    }
  }, [hideFinancials])

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
    await loadEvents()
  }, [loadEvents])

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

  if (checkingAuth || (!isGateUnlocked && typeof window !== 'undefined')) {
    return (
      <div className="min-h-[100dvh] bg-black flex flex-col items-center justify-center p-6 select-none">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-neutral-600 animate-spin" style={{ animationDuration: '2s' }} />
          <p className="font-display text-sm tracking-[0.2em] font-bold text-neutral-500 uppercase">
            Verificando credenciales...
          </p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] bg-black text-white flex flex-col items-center justify-center p-6 select-none relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(217,70,239,0.05)_0%,transparent_60%)] pointer-events-none" />

        <div className="mb-6 opacity-90">
          <Image src="/logo.png" alt="Dance4ever" width={220} height={160} priority className="h-auto w-auto" />
        </div>

        <div className="border border-neutral-800 bg-neutral-950/60 backdrop-blur-md p-8 w-full max-w-sm rounded-none text-center space-y-6">
          <div className="space-y-1">
            <h2 className="font-display text-base tracking-widest uppercase font-bold text-white">
              Acceso al Dashboard
            </h2>
            <p className="text-neutral-500 text-[10px] uppercase font-bold tracking-wider">
              Área de Administración
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5 text-left">
              <label className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider block">
                Contraseña de Acceso
              </label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="••••••••••••"
                disabled={verifyingPassword}
                className="w-full px-3.5 py-2.5 bg-neutral-950 rounded-none border border-neutral-800 text-sm text-center text-white placeholder-neutral-700 focus:outline-none focus:border-fuchsia-500 transition-colors font-mono"
              />
            </div>

            {authError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs py-2 px-3 rounded-none text-center font-semibold animate-pulse">
                ⚠️ {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={verifyingPassword || !authPassword.trim()}
              className="w-full py-3 bg-white text-black hover:bg-neutral-200 transition-colors font-display text-sm tracking-widest font-bold rounded-none disabled:opacity-50 uppercase flex items-center justify-center gap-2"
            >
              {verifyingPassword ? 'Verificando...' : 'Ingresar'}
            </button>
          </form>
        </div>

        <div className="flex flex-col items-center gap-2 mt-12">
          <div className="w-12 h-[1px] bg-neutral-800" />
          <p className="text-neutral-700 text-[9px] tracking-[0.4em] uppercase font-bold font-mono">
            Dance4ever
          </p>
        </div>
      </div>
    )
  }

  return (
    <EventContext.Provider value={{ events, event, lastSync, loadAll, loadEvents, refreshEvent, hideFinancials, toggleHideFinancials }}>

      <div className="socios-light h-[100dvh] flex flex-col bg-white text-white overflow-hidden select-none">
        <div className="flex-1 flex flex-col w-full max-w-xl mx-auto relative overflow-hidden border-x border-neutral-800">
          <header className="shrink-0 bg-neutral-900 border-b border-neutral-800 z-30" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex items-center justify-between px-4 py-2 gap-2">
            <div className="flex items-center gap-2 min-w-0 shrink">
              <Image src="/logo.png" alt="Dance4ever" width={56} height={42} priority className="shrink-0 -ml-1" />
              <span className="font-display text-xl sm:text-2xl font-bold tracking-wider text-white truncate">
                Dashboard
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Botón de QR */}
              <button
                onClick={() => event?.registration_token && setShowQr(true)}
                disabled={!event?.registration_token}
                className={`w-10 h-10 flex items-center justify-center rounded-xl border active:scale-90 transition-all ${
                  event?.registration_token
                    ? 'bg-fuchsia-500/15 border-fuchsia-500/30 text-fuchsia-400 hover:text-fuchsia-300'
                    : 'bg-neutral-800/30 border-neutral-700/30 text-neutral-600 cursor-not-allowed'
                }`}
                aria-label="Mostrar QR de registro"
                title={event?.registration_token ? "Mostrar QR de registro" : "QR no disponible - registro congelado"}
              >
                <QrCode className="w-[19px] h-[19px]" />
              </button>

              {/* Botón de ocultar cifras */}
              <button
                onClick={toggleHideFinancials}
                className={`w-10 h-10 flex items-center justify-center rounded-xl border active:scale-90 transition-all ${
                  hideFinancials
                    ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                    : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'
                }`}
                aria-label={hideFinancials ? "Mostrar cifras" : "Ocultar cifras"}
                title={hideFinancials ? "Mostrar cifras" : "Ocultar cifras"}
              >
                {hideFinancials ? <EyeOff className="w-[19px] h-[19px]" /> : <Eye className="w-[19px] h-[19px]" />}
              </button>

              {/* Botón de cerrar sesión */}
              <button
                onClick={handleLogout}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-neutral-800 border border-neutral-700 text-neutral-400 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 active:scale-90 transition-all"
                aria-label="Cerrar sesión"
                title="Cerrar sesión"
              >
                <LogOut className="w-[19px] h-[19px]" />
              </button>


              {/* Botón de actualizar - Solo aparece dinámicamente en caso de desconexión */}
              {isOffline && (
                <button
                  onClick={() => loadAll()}
                  className="px-3 h-10 flex items-center justify-center gap-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 active:scale-90 transition-all hover:brightness-110 animate-pulse"
                  aria-label="Sincronizar (Modo Desconectado)"
                  title="Sin conexión - Intentar reconectar"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '3s' }} />
                  <span className="text-[10px] font-display font-bold tracking-wider">SIN CONEXIÓN</span>
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 min-h-0 overflow-y-auto">
          {activeTab === 'resumen' && <ResumenPage />}
          {activeTab === 'registros' && (
            selectedRegistrationId ? (
              <RegistrationDetailPage
                registrationIdProp={selectedRegistrationId}
                onBack={() => setSelectedRegistrationId(null)}
              />
            ) : (
              <RegistrosPage onSelectRegistration={(id) => setSelectedRegistrationId(id)} />
            )
          )}
          {activeTab === 'finanzas' && <FinanzasPage />}
          {activeTab === 'programa' && <ProgramaPage />}
          {activeTab === 'checklist' && <ChecklistPage />}
          {activeTab === 'eventos' && <EventosPage />}
        </main>

        {!isKeyboardActive && (
            <nav
            className="shrink-0 bg-neutral-900 border-t border-neutral-800 z-30"
          >
            <div className="grid grid-cols-6 h-20">
              {TABS.map(tab => {
                const active = tab.id === activeTab
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id)
                      setSelectedRegistrationId(null)
                    }}
                    className="flex flex-col items-center justify-center gap-1.5 transition-colors active:bg-neutral-800/50"
                    style={{ color: active ? TAB[tab.id] : undefined }}
                  >
                    <tab.icon className="w-6 h-6" />
                    <span className={`text-xs font-display tracking-normal font-semibold ${active ? 'font-bold' : ''}`}>
                      {tab.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </nav>
        )}

        {/* QR Modal */}
        {showQr && event && qrUrl && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowQr(false)}>
            <div className="bg-neutral-800 rounded-2xl border border-neutral-700 w-full max-w-sm p-6 pt-8 space-y-4 text-center relative shadow-2xl" onClick={e => e.stopPropagation()}>
              <button 
                onClick={() => setShowQr(false)} 
                className="absolute top-4 right-4 text-neutral-400 hover:text-white transition-colors"
                aria-label="Cerrar modal"
              >
                <X className="w-5 h-5" />
              </button>
              
              <h3 className="font-display text-lg tracking-wider uppercase text-white font-bold">QR de Registro</h3>
              <div className="bg-white rounded-xl p-3 shadow-inner">
                <img src={qrUrl} alt="QR Registro" className="w-full rounded-lg" />
              </div>
              <p className="text-[11px] text-neutral-300 text-center break-all font-mono bg-neutral-900/60 p-2 rounded-lg border border-neutral-700/50 select-all">
                {origin}/register/{event.id}?t={event.registration_token}
              </p>
              <p className="text-xs text-neutral-400 text-center leading-relaxed">
                Escanea este código QR para acceder al formulario de registro.
              </p>
              
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `¡Hola! Te comparto el enlace de registro oficial de *Dance4Ever* para nuestro próximo evento *${event.name}*:\n\n🔗 ${origin}/register/${event.id}?t=${event.registration_token}\n\nPor favor, ingresa aquí para registrar a tus integrantes y coreografías. ¡Te esperamos!`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 active:scale-[0.98] text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md text-sm uppercase tracking-wider font-display hover:brightness-90"
                style={{ backgroundColor: WHATSAPP }}
              >
                <svg className="w-[18px] h-[18px] fill-current" viewBox="0 0 24 24">
                  <path d="M19.073 9.57a8.556 8.556 0 0 0-14.168 7.378c0 1.637.427 3.237 1.238 4.646L5 24l2.483-1.02a8.536 8.536 0 0 0 4.09 1.03h.005a8.556 8.556 0 0 0 7.495-14.44zM12.01 22.08h-.005a6.837 6.837 0 0 1-3.488-.957l-.25-.148-2.6 1.07.288-2.524-.165-.262a6.852 6.852 0 0 1-1.049-3.69c0-3.785 3.08-6.866 6.872-6.866a6.856 6.856 0 0 1 6.868 6.872c0 3.786-3.08 6.866-6.868 6.866zm3.763-5.14c-.206-.103-1.22-.602-1.408-.671-.189-.07-.327-.103-.465.103-.138.207-.534.672-.655.81-.12.137-.241.155-.447.052a5.64 5.64 0 0 1-1.659-1.024 6.22 6.22 0 0 1-1.147-1.428c-.12-.207-.013-.319.09-.422.093-.092.207-.24.31-.362.103-.12.138-.206.207-.344.069-.138.034-.258-.017-.362-.052-.103-.465-1.12-.638-1.534-.168-.405-.333-.35-.465-.357-.12-.006-.258-.007-.396-.007-.138 0-.361.052-.55.258-.19.207-.723.707-.723 1.724 0 1.017.74 2 .843 2.138.103.137 1.455 2.222 3.525 3.117.492.213.877.34 1.177.435.495.158.946.135 1.302.082.397-.06 1.22-.498 1.393-.98.172-.483.172-.897.12-.98-.051-.085-.19-.138-.396-.241z"/>
                </svg>
                Compartir por WhatsApp
              </a>
            </div>
          </div>
        )}
        </div>
      </div>
    </EventContext.Provider>
  )
}
