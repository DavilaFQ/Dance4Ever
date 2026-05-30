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
  const [qrStaffUrl, setQrStaffUrl] = useState('')
  const [qrCoachProgUrl, setQrCoachProgUrl] = useState('')
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
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
    if (!event || !origin) return
    
    // 1. QR Registro (Coaches)
    if (event.registration_token) {
      const urlReg = `${origin}/register/${event.id}?t=${event.registration_token}`
      QRCode.toDataURL(urlReg, { width: 400, margin: 2 }).then(setQrUrl).catch(() => {})
    }

    // 2. QR Staff
    const urlStaff = `${origin}/staff`
    QRCode.toDataURL(urlStaff, { width: 400, margin: 2 }).then(setQrStaffUrl).catch(() => {})

    // 3. QR Programa Coaches
    const urlProg = `${origin}/coach/${event.id}`
    QRCode.toDataURL(urlProg, { width: 400, margin: 2 }).then(setQrCoachProgUrl).catch(() => {})
  }, [event?.registration_token, event?.id, origin])

  function copyToClipboard(text: string, label: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedLink(label)
        setTimeout(() => setCopiedLink(null), 2000)
      }).catch(() => {})
    }
  }

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
        {showQr && event && (
          <div 
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto" 
            onClick={() => setShowQr(false)}
          >
            <div 
              className="w-full max-w-5xl bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col gap-6 relative my-8 animate-scale-in" 
              onClick={e => e.stopPropagation()}
            >
              <button 
                onClick={() => setShowQr(false)} 
                className="absolute top-4 right-4 p-1.5 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400 hover:text-white z-10"
                aria-label="Cerrar modal"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="flex flex-col gap-1.5 text-center sm:text-left pr-8">
                <h3 className="font-display text-xl tracking-wider uppercase text-white font-bold">
                  Códigos QR y Enlaces del Evento
                </h3>
                <p className="text-sm text-neutral-400">
                  Visualiza, comparte y copia los accesos para las plataformas de *{event.name}*.
                </p>
              </div>

              {/* Grid de 3 Columnas */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* 1. Registro Coaches */}
                {qrUrl && (
                  <div className="bg-neutral-950/50 border border-neutral-800/80 rounded-2xl p-5 flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-pink-400">
                        Inscripciones
                      </span>
                      <h4 className="font-display text-base font-bold text-white">
                        Registro de Coaches
                      </h4>
                      <p className="text-xs text-neutral-400 min-h-[32px]">
                        Formulario para registrar bailarines, categorías y coreografías.
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-xl flex items-center justify-center max-w-[160px] mx-auto w-full aspect-square shadow-md">
                      <img src={qrUrl} alt="QR Registro" className="w-full h-full object-contain" />
                    </div>

                    <div className="flex flex-col gap-2 mt-auto">
                      <button
                        onClick={() => copyToClipboard(`${origin}/register/${event.id}?t=${event.registration_token}`, 'reg')}
                        className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors uppercase tracking-wider font-display"
                      >
                        {copiedLink === 'reg' ? '¡Copiado!' : 'Copiar Enlace'}
                      </button>
                      
                      <button
                        onClick={() => {
                          window.open(
                            `https://wa.me/?text=${encodeURIComponent(
                              `¡Hola! Te comparto el enlace de registro oficial de *Dance4Ever* para nuestro próximo evento *${event.name}*:\n\n🔗 ${origin}/register/${event.id}?t=${event.registration_token}\n\nPor favor, ingresa aquí para registrar a tus integrantes y coreografías. ¡Te esperamos!`
                            )}`,
                            '_blank'
                          )
                        }}
                        className="w-full py-2.5 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md uppercase tracking-wider font-display hover:brightness-90"
                        style={{ backgroundColor: WHATSAPP }}
                      >
                        WhatsApp
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. Programa en Vivo Coaches */}
                {qrCoachProgUrl && (
                  <div className="bg-neutral-950/50 border border-neutral-800/80 rounded-2xl p-5 flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                        Día del Evento
                      </span>
                      <h4 className="font-display text-base font-bold text-white">
                        Programa Coaches
                      </h4>
                      <p className="text-xs text-neutral-400 min-h-[32px]">
                        Vista en tiempo real del programa y orden de participación en escenario.
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-xl flex items-center justify-center max-w-[160px] mx-auto w-full aspect-square shadow-md">
                      <img src={qrCoachProgUrl} alt="QR Programa" className="w-full h-full object-contain" />
                    </div>

                    <div className="flex flex-col gap-2 mt-auto">
                      <button
                        onClick={() => copyToClipboard(`${origin}/coach/${event.id}`, 'prog')}
                        className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors uppercase tracking-wider font-display"
                      >
                        {copiedLink === 'prog' ? '¡Copiado!' : 'Copiar Enlace'}
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
                        className="w-full py-2.5 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md uppercase tracking-wider font-display hover:brightness-90"
                        style={{ backgroundColor: WHATSAPP }}
                      >
                        WhatsApp
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. Portal Staff */}
                {qrStaffUrl && (
                  <div className="bg-neutral-950/50 border border-neutral-800/80 rounded-2xl p-5 flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                        Operaciones
                      </span>
                      <h4 className="font-display text-base font-bold text-white">
                        Portal de Staff
                      </h4>
                      <p className="text-xs text-neutral-400 min-h-[32px]">
                        Acceso operativo para logística, backstage y control de asistencia.
                      </p>
                    </div>

                    <div className="bg-white p-3 rounded-xl flex items-center justify-center max-w-[160px] mx-auto w-full aspect-square shadow-md">
                      <img src={qrStaffUrl} alt="QR Staff" className="w-full h-full object-contain" />
                    </div>

                    <div className="flex flex-col gap-2 mt-auto">
                      <button
                        onClick={() => copyToClipboard(`${origin}/staff`, 'staff')}
                        className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors uppercase tracking-wider font-display"
                      >
                        {copiedLink === 'staff' ? '¡Copiado!' : 'Copiar Enlace'}
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
                        className="w-full py-2.5 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md uppercase tracking-wider font-display hover:brightness-90"
                        style={{ backgroundColor: WHATSAPP }}
                      >
                        WhatsApp
                      </button>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </EventContext.Provider>
  )
}
