'use client'
import { useState } from 'react'
import { ArrowRight, Plus, Trash2, Users, Clipboard, Calendar, School, Info, Sparkles, ChevronDown, Check } from 'lucide-react'
import { supabase, AGE_CATEGORY_ORDER, AGE_CATEGORY_LABELS, AGE_CATEGORY_HINTS, categoryFromBirthdate, type AgeCategory, type Event, type Level } from '@/lib/supabase'
import { type State, type Step, type Coach, type Dancer, type Act, STYLES, CATEGORY_COLORS, DEFAULT_DANCER_COLOR, MODALITY_OPTIONS } from '@/components/register/types'
import { minDancers, maxDancers, modalityLabel, effectiveCategory, ageFromBirthdate, formatMoney, getDancerDisplayName } from '@/components/register/utils'
import FullSummary from '@/components/register/FullSummary'
import CartaResponsiva from '@/components/register/CartaResponsiva'


export default 
function StepViewContent(props: {
  step: Step
  state: State
  event: Event | null
  isKeyboardOpen: boolean
  editMode: boolean
  isEditSave: boolean
  isMobile: boolean
  onNext: () => void
  onBack: () => void
  goToStep: (s: Step) => void
  updateCoach: (p: Partial<Coach>) => void
  updateState: React.Dispatch<React.SetStateAction<State>>
  updateDancer: (i: number, p: Partial<Dancer>) => void
  addDancer: () => void
  removeDancer: (i: number) => void
  onOpenSmartPaste: () => void
  updateAct: (i: number, p: Partial<Act>) => void
  addAct: () => void
  removeAct: (i: number) => void
  confirm: () => Promise<void>
  saving: boolean
  saveErr: string | null
  startEdit: () => void
  signature: string | null
  setSignature: (s: string | null) => void
  actsConfirmed: boolean
  setActsConfirmed: (b: boolean) => void
  activeActIndex: number | null
  setActiveActIndex: (i: number | null) => void
  videoEnded: boolean
  videoProgress: number
  currentTime: number
  useFallback: boolean
  startBlurring: boolean
  videoLoaded: boolean
  setVideoEnded: React.Dispatch<React.SetStateAction<boolean>>
  setVideoProgress: React.Dispatch<React.SetStateAction<number>>
  setCurrentTime: React.Dispatch<React.SetStateAction<number>>
  setUseFallback: React.Dispatch<React.SetStateAction<boolean>>
  setStartBlurring: React.Dispatch<React.SetStateAction<boolean>>
  setVideoLoaded: React.Dispatch<React.SetStateAction<boolean>>
  videoRef: React.RefObject<HTMLVideoElement | null>
}) {
  const { step, state, event, editMode, isEditSave, onNext, goToStep, updateCoach, updateState, updateDancer, addDancer, removeDancer, onOpenSmartPaste, updateAct, addAct, removeAct, confirm, saving, saveErr, startEdit, signature, setSignature, actsConfirmed, setActsConfirmed, activeActIndex, setActiveActIndex, videoEnded, videoProgress, currentTime, useFallback, startBlurring, videoLoaded, setVideoEnded, setVideoProgress, setCurrentTime, setUseFallback, setStartBlurring, setVideoLoaded, videoRef } = props
  const [lastAddedAssistantIndex, setLastAddedAssistantIndex] = useState<number | null>(null)
  const [datePickerIndex, setDatePickerIndex] = useState<number | null>(null)
  const [datePickerVal, setDatePickerVal] = useState({ day: '', month: '', year: '' })
  const [datePickerClosing, setDatePickerClosing] = useState(false)

  const closeDatePicker = () => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#F6F4EF')
    setDatePickerClosing(true)
    setTimeout(() => { setDatePickerIndex(null); setDatePickerClosing(false) }, 180)
  }

  switch (step.kind) {
    case 'welcome': {
      return (
        <div 
          className="relative flex flex-col items-center justify-end h-[100dvh] w-full overflow-hidden select-none px-6 pb-4" 
          style={{ 
            background: 'transparent', 
            touchAction: 'none', 
            animation: 'fadeIn 0.5s ease-out' 
          }}
        >
          <style>{`
            @keyframes riseUp {
              0% { opacity: 0; transform: translateY(30px); }
              100% { opacity: 1; transform: translateY(0); }
            }
            @keyframes sweep {
              0% { left: -100%; }
              50% { left: 160%; }
              100% { left: 160%; }
            }
            @keyframes slideFromLeft {
              0% {
                opacity: 0;
                transform: translateX(-150px) scale(0.9);
                filter: blur(4px);
              }
              100% {
                opacity: 1;
                transform: translateX(0) scale(1);
                filter: blur(0px);
              }
            }
            @keyframes textReveal {
              0% {
                opacity: 0;
                letter-spacing: -0.05em;
                filter: blur(8px);
                transform: translateY(20px);
              }
              50% {
                opacity: 0.5;
                filter: blur(3px);
              }
              100% {
                opacity: 1;
                letter-spacing: 0.08em;
                filter: blur(0px);
                transform: translateY(0);
              }
            }
            @keyframes logoPremiumEffect {
              0% {
                transform: translateY(0px);
                filter: drop-shadow(0 0 20px rgba(245, 158, 11, 0.15));
              }
              50% {
                transform: translateY(-8px);
                filter: drop-shadow(0 0 45px rgba(245, 158, 11, 0.45));
              }
              100% {
                transform: translateY(0px);
                filter: drop-shadow(0 0 20px rgba(245, 158, 11, 0.15));
              }
            }
            @keyframes arrowPulse {
              0%, 100% {
                transform: translateX(0px);
                filter: drop-shadow(0 0 3px rgba(245, 158, 11, 0.4));
              }
              50% {
                transform: translateX(5px);
                filter: drop-shadow(0 0 12px rgba(245, 158, 11, 0.85));
              }
            }
            .blur-transition-layer {
              backdrop-filter: blur(0px);
              -webkit-backdrop-filter: blur(0px);
              transition: backdrop-filter 2200ms cubic-bezier(0.25, 1, 0.5, 1), -webkit-backdrop-filter 2200ms cubic-bezier(0.25, 1, 0.5, 1);
            }
            .blur-transition-layer.blurred {
              backdrop-filter: blur(12px);
              -webkit-backdrop-filter: blur(12px);
            }
          `}</style>

          {/* CINEMATIC BRAND REVEAL CENTERED (Fades in when video ends) */}
          <div 
            className={`absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none px-6 pb-28 transition-all pointer-events-none ${
              (videoEnded || useFallback || startBlurring) ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'
            }`}
            style={{
              transitionDuration: '2200ms',
              transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)'
            }}
          >
            {/* Super Large Logo with Gold Pulsing Glow */}
            <img 
              src="/logo.png" 
              alt="Dance4Ever" 
              className="w-11/12 max-w-[340px] sm:max-w-[480px] md:max-w-[580px] h-auto object-contain shrink-0"
              style={{
                animation: (videoEnded || useFallback || startBlurring) ? 'logoPremiumEffect 6s ease-in-out infinite' : 'none'
              }}
            />
          </div>

          {/* BOTTOM-CENTER FLOATING CARD CONTAINER */}
          <div 
            className={`relative z-10 w-full max-w-sm flex flex-col items-center justify-center mb-0 transition-opacity duration-300 ${
              (videoEnded || useFallback || currentTime >= 1.8 || startBlurring) ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* Cinematic Typography Reveal (Super Large & Placed Directly Above Button/Card) */}
            <h1 
              className="mb-6 sm:mb-8 font-display text-4xl sm:text-6xl md:text-7xl font-black text-center uppercase tracking-[0.06em] text-transparent bg-clip-text bg-gradient-to-b from-white via-amber-100 to-amber-400 drop-shadow-[0_4px_20px_rgba(245,158,11,0.45)] leading-tight w-[140%] max-w-[92vw] shrink-0 opacity-0"
              style={{
                animation: (videoEnded || useFallback || startBlurring) ? 'textReveal 2.2s cubic-bezier(0.16, 1, 0.3, 1) forwards' : 'none'
              }}
            >
              ¿Listos para la GRAN NACIONAL?
            </h1>

            {!(videoEnded || useFallback) ? (
              /* EXPECTATION / PROGRESS LOADER CARD */
              <div 
                className="w-full h-[88px] px-6 rounded-2xl border border-amber-500/20 bg-black/40 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.5)] flex flex-col items-center justify-center relative overflow-hidden"
                style={{ animation: 'slideFromLeft 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="font-display text-[10px] sm:text-xs tracking-[0.25em] font-extrabold text-amber-400/80 uppercase animate-pulse">
                    Preparando todo...
                  </span>
                </div>
                
                {/* Thin Premium Loading Bar */}
                <div className="w-full h-[3px] bg-white/10 rounded-full overflow-hidden relative">
                  <div 
                    className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 transition-all duration-100 ease-out shadow-[0_0_8px_#f59e0b]"
                    style={{ width: `${Math.min(videoProgress, 100)}%` }}
                  />
                </div>
                
                <span className="mt-2 text-[9px] tracking-[0.15em] font-medium text-white/40 uppercase">
                  Dance4Ever • La Gran Nacional 2026
                </span>
              </div>
            ) : (
              /* CLICKABLE CTA BUTTON */
              <button
                onClick={onNext}
                className="w-full h-[88px] rounded-2xl font-display text-2xl tracking-[0.2em] font-extrabold hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 relative overflow-hidden group shadow-[0_15px_40px_rgba(245,158,11,0.15),inset_0_1px_1px_rgba(255,255,255,0.08)] border border-amber-500/35 bg-amber-500/[0.04] backdrop-blur-xl text-amber-400 hover:text-yellow-200 hover:border-amber-500/50 flex items-center justify-center"
                style={{ animation: 'riseUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
              >
                {/* Sliding Gold Sheen Overlay on Hover */}
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-amber-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ease-out z-0" />

                {/* Sparkling Light Sweep Overlay */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
                  <div 
                    className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-25"
                    style={{ 
                      left: '-100%',
                      animation: 'sweep 3.5s infinite ease-in-out',
                    }} 
                  />
                </div>

                <span className="relative z-20 flex items-center justify-center gap-3.5 uppercase font-black tracking-[0.16em] filter drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]">
                  COMENZAR REGISTRO
                  <ArrowRight 
                    className="w-5.5 h-5.5 text-amber-400 group-hover:text-yellow-200 shrink-0" 
                    style={{ animation: 'arrowPulse 1.4s infinite ease-in-out' }}
                  />
                </span>
              </button>
            )}
          </div>
        </div>
      )
    }

    case 'setup': {
      const isEmailValid = state.coach.email.trim().length >= 5 && state.coach.email.includes('@') && state.coach.email.includes('.')
      const isCoachValid = state.coach.name.trim().length >= 2 && state.coach.phone.trim().length >= 8 && isEmailValid
      const isAcademyValid = state.academy.trim().length >= 2
      const isCityValid = state.city && state.city.trim().length >= 2
      const isValid = isCoachValid && isAcademyValid && isCityValid

      return (
        <div className="space-y-2.5 py-1 sm:space-y-3 overflow-visible max-h-none md:overflow-y-auto md:max-h-[80vh] px-0 sm:px-1" style={{ animation: 'fadeIn 0.3s ease-out' }}>
          {editMode && (
            <div className="mb-4 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border border-amber-500/30 text-amber-800 rounded-2xl p-4 flex items-start gap-3 shadow-sm backdrop-blur-sm animate-[fadeIn_0.3s_ease-out] mx-4 sm:mx-0">
              <span className="text-xl shrink-0">⚠️</span>
              <div className="text-xs sm:text-sm leading-relaxed text-left">
                <span className="font-bold text-amber-950 block mb-0.5">MODO EDICIÓN ACTIVO</span>
                Tienes cambios sin guardar en la base de datos. Para que se apliquen, debes avanzar al paso final <strong className="text-amber-900 font-bold">(CONFIRMAR)</strong> y hacer clic en <strong className="text-amber-900 font-bold bg-amber-500/20 px-1.5 py-0.5 rounded-lg inline-block">GUARDAR CAMBIOS</strong>.
              </div>
            </div>
          )}
          <div className="text-center lg:text-left space-y-0.5 px-4 sm:px-0">
            <h2 className="font-display text-3xl lg:text-4xl text-[rgb(var(--c-text-strong))]">Paso 1: Coach y Academia</h2>
            <p className="text-xs text-[rgb(var(--c-text))]">Completa tu información organizativa general</p>
          </div>

          <div className="bg-[rgb(var(--c-surface))] border-t sm:border-b sm:border border-[rgb(var(--c-border)/0.4)] rounded-none sm:rounded-3xl shadow-none sm:shadow-sm overflow-hidden divide-y divide-[rgb(var(--c-border)/0.25)]">
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-[rgb(var(--c-border)/0.25)]">
              {/* COACH CARD */}
              <div className="p-3 sm:p-5 space-y-2.5">
                <h3 className="font-display text-xl text-[rgb(var(--c-primary))] flex items-center gap-2 border-b border-[rgb(var(--c-border)/0.2)] pb-1.5">
                  <Users className="w-5 h-5" /> COACH
                </h3>
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] mb-1">NOMBRE COMPLETO</label>
                    <input
                      type="text"
                      value={state.coach.name}
                      onChange={e => updateCoach({ name: e.target.value })}
                      placeholder="Nombre del coach"
                      className="w-full bg-white border border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] rounded-2xl px-4 py-3 outline-none focus:border-[rgb(var(--c-primary))] focus:ring-1 focus:ring-[rgb(var(--c-primary))] transition-all text-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                      autoCapitalize="words"
                      autoComplete="name"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] mb-1">WHATSAPP (TELÉFONO)</label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={state.coach.phone}
                        onChange={e => updateCoach({ phone: e.target.value.replace(/\D/g, '') })}
                        placeholder="Números sin espacios ni guiones"
                        className="w-full bg-white border border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] rounded-2xl px-4 py-3 outline-none focus:border-[rgb(var(--c-primary))] focus:ring-1 focus:ring-[rgb(var(--c-primary))] transition-all text-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                        autoComplete="one-time-code"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] mb-1">CORREO ELECTRÓNICO</label>
                      <input
                        type="email"
                        value={state.coach.email}
                        onChange={e => updateCoach({ email: e.target.value })}
                        placeholder="correo@ejemplo.com"
                        className="w-full bg-white border border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] rounded-2xl px-4 py-3 outline-none focus:border-[rgb(var(--c-primary))] focus:ring-1 focus:ring-[rgb(var(--c-primary))] transition-all text-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                        autoCapitalize="off"
                        autoComplete="email"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ACADEMY CARD */}
              <div className="p-3 sm:p-5 space-y-2.5">
                <h3 className="font-display text-xl text-[rgb(var(--c-primary))] flex items-center gap-2 border-b border-[rgb(var(--c-border)/0.2)] pb-1.5">
                  <School className="w-5 h-5" /> ACADEMIA Y EQUIPO
                </h3>
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] mb-1">CIUDAD</label>
                      <input
                        type="text"
                        value={state.city}
                        onChange={e => updateState(s => ({ ...s, city: e.target.value }))}
                        placeholder="Ej. Monterrey"
                        className="w-full bg-white border border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] rounded-2xl px-4 py-3 outline-none focus:border-[rgb(var(--c-primary))] focus:ring-1 focus:ring-[rgb(var(--c-primary))] transition-all text-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                        autoCapitalize="words"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] mb-1">COLEGIO / ACADEMIA</label>
                      <input
                        type="text"
                        value={state.academy}
                        onChange={e => updateState(s => ({ ...s, academy: e.target.value }))}
                        placeholder="Ej. Escuela de Danza Ritmo"
                        className="w-full bg-white border border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] rounded-2xl px-4 py-3 outline-none focus:border-[rgb(var(--c-primary))] focus:ring-1 focus:ring-[rgb(var(--c-primary))] transition-all text-sm shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                        autoCapitalize="sentences"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ASISTENTES */}
            <div className="p-3.5 sm:p-6 space-y-3">
              <div className="flex justify-between items-center border-b border-[rgb(var(--c-border)/0.2)] pb-2">
                <h3 className="font-display text-xl text-[rgb(var(--c-primary))] flex items-center gap-2">
                  <Users className="w-5 h-5" /> ASISTENTES
                </h3>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                  }}
                  onClick={() => {
                    const newIndex = state.coach.assistants.length
                    setLastAddedAssistantIndex(newIndex)
                    updateCoach({ assistants: [...state.coach.assistants, ''] })
                  }}
                  className="inline-flex items-center gap-1 text-xs text-[rgb(var(--c-primary))] font-bold hover:opacity-85 active:scale-95 transition-all duration-150 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> AGREGAR
                </button>
              </div>
              {state.coach.assistants.length === 0 ? (
                <p className="text-xs text-[rgb(var(--c-text)/0.5)] italic bg-[rgb(var(--c-surface))] p-3 rounded-2xl text-center">No hay asistentes registrados</p>
              ) : (
                <div className="space-y-2">
                  {state.coach.assistants.map((ast, idx) => (
                    <div key={`assistant-${idx}`} className="flex gap-2 animate-[fadeIn_0.2s_ease-out_forwards]">
                      <input
                        type="text"
                        value={ast}
                        onChange={ev => updateCoach({ assistants: state.coach.assistants.map((x, j) => j === idx ? ev.target.value : x) })}
                        placeholder={`Nombre del asistente ${idx + 1}`}
                        className="flex-1 bg-white border border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] rounded-xl px-3 py-2 outline-none focus:border-[rgb(var(--c-primary))] text-xs shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                        autoCapitalize="words"
                        autoFocus={idx === lastAddedAssistantIndex}
                        onBlur={() => {
                          if (idx === lastAddedAssistantIndex) {
                            setLastAddedAssistantIndex(null)
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => updateCoach({ assistants: state.coach.assistants.filter((_, j) => j !== idx) })}
                        className="text-[rgb(var(--c-primary))] bg-[rgb(var(--c-primary)/0.1)] active:bg-[rgb(var(--c-primary)/0.2)] p-2 rounded-xl active:scale-95 transition-all duration-150"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2 pt-1.5">
                <p className="text-[10px] text-[rgb(var(--c-text)/0.65)] text-center font-bold">
                  {formatMoney(event?.cost_asistente ?? 400)} MXN por asistente · 1 pase gratis por cada {event?.dancers_por_asistente_gratis ?? 8} integrantes inscritos
                </p>
                <div className="bg-amber-50/60 border border-amber-200/40 rounded-2xl p-3 text-[10px] leading-relaxed text-amber-900 font-medium space-y-1">
                  <p className="flex items-center gap-1.5 font-bold text-amber-950">
                    <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    ADVERTENCIA IMPORTANTE DE ACCESO A BACKSTAGE:
                  </p>
                  <p>
                    No existe un límite en el número de asistentes que puedes registrar. No obstante, toma en cuenta que incluso si se liquidan sus entradas, <strong>su ingreso al área de backstage está sujeto a revisión y podría restringirse</strong>. Esto se implementa por razones de espacio limitado y la estricta seguridad de las niñas, dependiendo de si las condiciones del lugar lo hacen viable.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="hidden lg:block pt-3">
            <button
              onClick={onNext}
              disabled={!isValid}
              className="w-full bg-gradient-to-r from-purple-700 via-purple-600 to-pink-600 hover:from-purple-800 hover:to-pink-700 active:scale-[0.98] text-white font-display text-lg sm:text-xl tracking-widest py-4 rounded-2xl transition-all duration-200 shadow-[0_4px_20px_rgba(168,85,247,0.3)] hover:shadow-[0_6px_25px_rgba(168,85,247,0.5)] disabled:opacity-30 disabled:pointer-events-none font-black text-center flex items-center justify-center gap-2"
            >
              CONTINUAR AL PASO 2: INTEGRANTES
              <ArrowRight className="w-5 h-5 animate-pulse" />
            </button>
          </div>
        </div>
      )
    }

    case 'dancers': {
      const isAllValid = state.dancers.length > 0 && state.dancers.every(d => d.name.trim().length >= 2 && d.birthdate.length === 10)

      return (
        <><div className="space-y-3 py-1 sm:space-y-4 overflow-visible max-h-none md:overflow-y-auto md:max-h-[82vh] px-0 sm:px-1 flex flex-col md:h-full md:min-h-0" style={{ animation: 'fadeIn 0.3s ease-out' }}>
          {editMode && (
            <div className="mb-4 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border border-amber-500/30 text-amber-800 rounded-2xl p-4 flex items-start gap-3 shadow-sm backdrop-blur-sm animate-[fadeIn_0.3s_ease-out] mx-4 sm:mx-0">
              <span className="text-xl shrink-0">⚠️</span>
              <div className="text-xs sm:text-sm leading-relaxed text-left">
                <span className="font-bold text-amber-950 block mb-0.5">MODO EDICIÓN ACTIVO</span>
                Tienes cambios sin guardar en la base de datos. Para que se apliquen, debes avanzar al paso final <strong className="text-amber-900 font-bold">(CONFIRMAR)</strong> y hacer clic en <strong className="text-amber-900 font-bold bg-amber-500/20 px-1.5 py-0.5 rounded-lg inline-block">GUARDAR CAMBIOS</strong>.
              </div>
            </div>
          )}
          <div className="shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 sm:px-0">
            <div className="text-center md:text-left space-y-0.5">
              <h2 className="font-display text-3xl text-[rgb(var(--c-text-strong))]">Paso 2: Registro de Integrantes</h2>
              <p className="text-xs text-[rgb(var(--c-text))]">Ingresa los integrantes. La edad y categoría se calculan automáticamente.</p>
            </div>
            
            <div className="flex gap-2 justify-center shrink-0">
              <button
                type="button"
                onClick={onOpenSmartPaste}
                className="inline-flex items-center gap-1.5 bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-primary)/0.4)] text-[rgb(var(--c-primary))] px-4 py-2.5 rounded-2xl font-display text-sm tracking-wider font-bold shadow-sm active:scale-95 active:bg-[rgb(var(--c-surface-2))] transition-all duration-150"
              >
                <Clipboard className="w-4 h-4 text-[rgb(var(--c-primary))]" /> PEGAR LISTA
              </button>
              <button
                type="button"
                onClick={addDancer}
                className="inline-flex items-center gap-1 bg-[rgb(var(--c-primary))] hover:bg-[rgb(var(--c-primary-strong))] text-white px-4 py-2.5 rounded-2xl font-display text-sm tracking-wider font-bold shadow-sm active:scale-95 transition-all duration-150"
              >
                <Plus className="w-4 h-4" /> AGREGAR INTEGRANTE
              </button>
            </div>
          </div>

          <div className="overflow-visible md:flex-1 md:min-h-0 md:overflow-y-auto bg-[rgb(var(--c-surface))] border-t sm:border-b sm:border border-[rgb(var(--c-border)/0.4)] rounded-none sm:rounded-3xl shadow-none sm:shadow-sm p-2 sm:p-4">
            {state.dancers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                <div className="p-4 bg-[rgb(var(--c-primary)/0.05)] rounded-full text-[rgb(var(--c-primary))]">
                  <Users className="w-12 h-12" />
                </div>
                <div>
                  <h4 className="font-display text-xl text-[rgb(var(--c-text-strong))]">Sin integrantes registrados</h4>
                  <p className="text-xs text-[rgb(var(--c-text)/0.7)] mt-1 max-w-xs mx-auto">
                    {'Usa el botón "Agregar Fila" para escribir un nombre, o "Pegar Lista" para cargar desde WhatsApp.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {state.dancers.map((d, i) => {
                  const compCat = categoryFromBirthdate(d.birthdate)
                  const age = ageFromBirthdate(d.birthdate)
                  const isDancerValid = d.name.trim().length >= 2 && d.birthdate.length === 10
                  const color = compCat ? CATEGORY_COLORS[compCat] : DEFAULT_DANCER_COLOR

                  return (
                    <div
                      key={`dancer-${i}`}
                      className={`border rounded-2xl overflow-hidden transition-all duration-200 animate-[fadeIn_0.2s_ease-out_forwards] ${
                        isDancerValid ? `${color.bg} ${color.border}` : 'bg-[rgb(var(--c-surface))] border-[rgb(var(--c-border)/0.4)]'
                      }`}
                    >
                      {/* Nombre */}
                      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[rgb(var(--c-border)/0.2)]">
                        <span className="font-display text-base text-[rgb(var(--c-primary))] shrink-0 w-5 text-center">{i + 1}</span>
                        <input
                          type="text"
                          value={d.name}
                          onChange={e => updateDancer(i, { name: e.target.value })}
                          placeholder="Nombre completo"
                          className="flex-1 min-w-0 bg-transparent text-[rgb(var(--c-text-strong))] text-sm font-semibold outline-none placeholder:text-[rgb(var(--c-text)/0.3)]"
                          autoCapitalize="words"
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                        />
                        <button type="button" onClick={() => removeDancer(i)} className="shrink-0 text-[rgb(var(--c-text)/0.25)] active:text-red-500 p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Fecha de nacimiento */}
                      <div className="px-3 pt-2 pb-1">
                        <p className="text-[9px] font-bold tracking-widest text-[rgb(var(--c-text)/0.4)] mb-1.5">FECHA DE NACIMIENTO</p>
                        <button
                          type="button"
                          onClick={() => {
                            const [y, m, day] = d.birthdate ? d.birthdate.split('-') : ['', '', '']
                            setDatePickerVal({ day: day || '', month: m || '', year: y || '' })
                            setDatePickerIndex(i)
                            document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#000000')
                          }}
                          className="w-full bg-white border border-[rgb(var(--c-border)/0.5)] rounded-xl px-3 py-2 text-sm font-semibold text-left flex items-center gap-2 active:border-[rgb(var(--c-primary))] transition-all shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]"
                        >
                          <Calendar className="w-4 h-4 text-[rgb(var(--c-primary)/0.7)]" />
                          <span className={d.birthdate && d.birthdate.length === 10 ? 'text-[rgb(var(--c-text-strong))]' : 'text-[rgb(var(--c-text)/0.35)]'}>
                            {d.birthdate && d.birthdate.length === 10
                              ? (() => { const [y,m,day] = d.birthdate.split('-'); return `${day}/${m}/${y}` })()
                              : 'DD / MM / AAAA'}
                          </span>
                        </button>
                      </div>

                      {/* Categoría y edad */}
                      <div className="px-3 pt-1 pb-2.5 flex items-end gap-2">
                        {compCat && (
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] font-bold tracking-widest text-[rgb(var(--c-text)/0.4)] mb-1.5">CATEGORÍA</p>
                            <div className="bg-white border border-[rgb(var(--c-border)/0.5)] rounded-xl px-2 py-2 text-sm font-bold text-[rgb(var(--c-text-strong))] shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)]">
                              {AGE_CATEGORY_LABELS[compCat]}
                            </div>
                          </div>
                        )}
                        {age !== null && (
                          <div className="w-16 shrink-0 text-center">
                            <p className="text-[9px] font-bold tracking-widest text-[rgb(var(--c-text)/0.4)] mb-1.5">EDAD</p>
                            <span className="block bg-[rgb(var(--c-surface-2))] border border-[rgb(var(--c-border)/0.3)] rounded-xl py-2 text-sm font-mono font-bold text-[rgb(var(--c-text)/0.6)] whitespace-nowrap">{age} años</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                {state.dancers.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-[rgb(var(--c-border)/0.25)] flex justify-center">
                    <button
                      type="button"
                      onClick={addDancer}
                      className="w-full inline-flex items-center justify-center gap-1.5 bg-[rgb(var(--c-primary))] hover:bg-[rgb(var(--c-primary-strong))] text-white py-3 rounded-2xl font-display text-sm tracking-wider font-bold shadow-sm active:scale-95 transition-all duration-150"
                    >
                      <Plus className="w-4 h-4" /> AGREGAR INTEGRANTE
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="hidden lg:block shrink-0 pt-2">
            <button
              onClick={onNext}
              disabled={!isAllValid}
              className="w-full bg-gradient-to-r from-purple-700 via-purple-600 to-pink-600 hover:from-purple-800 hover:to-pink-700 active:scale-[0.98] text-white font-display text-lg sm:text-xl tracking-widest py-4 rounded-2xl transition-all duration-200 shadow-[0_4px_20px_rgba(168,85,247,0.3)] hover:shadow-[0_6px_25px_rgba(168,85,247,0.5)] disabled:opacity-30 disabled:pointer-events-none font-black text-center flex items-center justify-center gap-2"
            >
              CONTINUAR AL PASO 3: REGISTRO DE COREOGRAFÍAS ({state.dancers.length} Integrantes)
              <ArrowRight className="w-5 h-5 animate-pulse" />
            </button>
          </div>
        </div>

        {/* DATE PICKER SHEET */}
        {datePickerIndex !== null && (
          <div className="fixed inset-x-0 bottom-0 top-24 z-[99998] flex flex-col justify-end" onClick={closeDatePicker} style={{ animation: datePickerClosing ? 'fadeOut 0.18s ease-in forwards' : 'fadeIn 0.2s ease-out' }}>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-black/50" />
            <div className="relative bg-[rgb(var(--c-surface))] rounded-t-3xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center">
                <button type="button" onClick={closeDatePicker} className="text-sm text-[rgb(var(--c-text)/0.5)] font-semibold px-2 py-1">Cancelar</button>
                <p className="font-display text-lg tracking-widest text-[rgb(var(--c-text-strong))]">FECHA DE NACIMIENTO</p>
                <button type="button" onClick={() => {
                  if (datePickerVal.day && datePickerVal.month && datePickerVal.year) {
                    updateDancer(datePickerIndex, { birthdate: `${datePickerVal.year}-${datePickerVal.month}-${datePickerVal.day}` })
                  }
                  closeDatePicker()
                }} className="text-sm text-[rgb(var(--c-primary))] font-bold px-2 py-1">Listo</button>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <p className="text-[9px] font-bold tracking-widest text-[rgb(var(--c-text)/0.4)] mb-1.5 text-center">DÍA</p>
                  <select value={datePickerVal.day} onChange={e => setDatePickerVal(v => ({ ...v, day: e.target.value }))}
                    className="w-full bg-[rgb(var(--c-surface-2))] border border-[rgb(var(--c-border)/0.5)] rounded-xl px-2 py-2.5 text-sm font-semibold text-center outline-none text-[rgb(var(--c-text-strong))]">
                    <option value="">Día</option>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={String(d).padStart(2, '0')}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-[2]">
                  <p className="text-[9px] font-bold tracking-widest text-[rgb(var(--c-text)/0.4)] mb-1.5 text-center">MES</p>
                  <select value={datePickerVal.month} onChange={e => setDatePickerVal(v => ({ ...v, month: e.target.value }))}
                    className="w-full bg-[rgb(var(--c-surface-2))] border border-[rgb(var(--c-border)/0.5)] rounded-xl px-2 py-2.5 text-sm font-semibold text-center outline-none text-[rgb(var(--c-text-strong))]">
                    <option value="">Mes</option>
                    {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'].map((m, idx) => (
                      <option key={m} value={String(idx + 1).padStart(2, '0')}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-[1.5]">
                  <p className="text-[9px] font-bold tracking-widest text-[rgb(var(--c-text)/0.4)] mb-1.5 text-center">AÑO</p>
                  <select value={datePickerVal.year} onChange={e => setDatePickerVal(v => ({ ...v, year: e.target.value }))}
                    className="w-full bg-[rgb(var(--c-surface-2))] border border-[rgb(var(--c-border)/0.5)] rounded-xl px-2 py-2.5 text-sm font-semibold text-center outline-none text-[rgb(var(--c-text-strong))]">
                    <option value="">Año</option>
                    {Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i).map(y => (
                      <option key={y} value={String(y)}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}
        </>
      )
    }

    case 'acts': {
      const isAllValid = state.acts.length > 0 && state.acts.every(a => a.modality && a.style && a.dancerIndices.length >= minDancers(a.modality))

      const handleCreateAct = () => {
        addAct()
        setActiveActIndex(state.acts.length)
      }

      return (
        <div className="space-y-3 py-1 overflow-visible max-h-none md:overflow-y-auto md:max-h-[82vh] px-0 sm:px-1 flex flex-col md:h-full md:min-h-0" style={{ animation: 'fadeIn 0.3s ease-out' }}>
          {editMode && (
            <div className="mb-4 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-red-500/10 border border-amber-500/30 text-amber-800 rounded-2xl p-4 flex items-start gap-3 shadow-sm backdrop-blur-sm animate-[fadeIn_0.3s_ease-out] mx-4 sm:mx-0">
              <span className="text-xl shrink-0">⚠️</span>
              <div className="text-xs sm:text-sm leading-relaxed text-left">
                <span className="font-bold text-amber-950 block mb-0.5">MODO EDICIÓN ACTIVO</span>
                Tienes cambios sin guardar en la base de datos. Para que se apliquen, debes avanzar al paso final <strong className="text-amber-900 font-bold">(CONFIRMAR)</strong> y hacer clic en <strong className="text-amber-900 font-bold bg-amber-500/20 px-1.5 py-0.5 rounded-lg inline-block">GUARDAR CAMBIOS</strong>.
              </div>
            </div>
          )}
          <div className="shrink-0 flex items-center justify-between px-4 sm:px-0">
            <div className="text-center lg:text-left space-y-0.5">
              <h2 className="font-display text-3xl text-[rgb(var(--c-text-strong))]">Paso 3: Registro de Coreografías</h2>
              <p className="text-xs text-[rgb(var(--c-text))]">Registra tus coreografías, modalidades y selecciona a sus integrantes.</p>
            </div>
            
            <button
              type="button"
              onClick={handleCreateAct}
              className="inline-flex items-center gap-1 bg-[rgb(var(--c-primary))] hover:bg-[rgb(var(--c-primary-strong))] text-white px-4 py-2.5 rounded-2xl font-display text-sm tracking-wider font-bold shadow-sm active:scale-95 transition-all duration-150 shrink-0"
            >
              <Plus className="w-4 h-4" /> AGREGAR COREOGRAFÍA
            </button>
          </div>
          <div className="overflow-visible md:flex-1 md:min-h-0 md:overflow-y-auto">
            {state.acts.length === 0 ? (
              <div className="bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.5)] rounded-3xl p-16 text-center space-y-4 shadow-sm mx-4 sm:mx-0">
                <div className="p-4 bg-[rgb(var(--c-primary)/0.05)] rounded-full text-[rgb(var(--c-primary))] inline-block">
                  <Sparkles className="w-12 h-12" />
                </div>
                <div>
                  <h4 className="font-display text-xl text-[rgb(var(--c-text-strong))]">Ninguna coreografía registrada todavía</h4>
                  <p className="text-xs text-[rgb(var(--c-text)/0.7)] mt-1 max-w-xs mx-auto">
                    {'Presiona "Agregar Coreografía" para registrar tu primera coreografía/participación.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-[rgb(var(--c-surface))] border-t sm:border-b sm:border border-[rgb(var(--c-border)/0.4)] rounded-none sm:rounded-3xl shadow-none sm:shadow-sm divide-y divide-[rgb(var(--c-border)/0.25)] overflow-hidden">
                {state.acts.map((act, i) => {
                  const isOpen = activeActIndex === i
                  const labelModality = act.modality ? modalityLabel(act.modality) : 'Sin modalidad'
                  const styleName = act.style ? act.style.toUpperCase() : 'ESTILO PENDIENTE'
                  const actDancersCount = act.dancerIndices.length
                  const reqDancers = minDancers(act.modality)
                  const limitDancers = maxDancers(act.modality)
                  const isActValid = act.modality && act.style && actDancersCount >= reqDancers && actDancersCount <= limitDancers

                  // Dynamic numbering sequence
                  let stepNum = 1
                  const modalityNum = stepNum++
                  const levelNum = act.modality === 'grupal' ? stepNum++ : null
                  const styleNum = stepNum++
                  const dancersNum = act.modality ? stepNum++ : null

                  return (
                    <div
                      key={`act-${i}`}
                      className="overflow-hidden"
                    >
                      {/* Header Acordeón */}
                      <div
                        onClick={() => setActiveActIndex(isOpen ? null : i)}
                        className={`px-4 py-2.5 sm:py-3 flex items-center justify-between cursor-pointer active:bg-[rgb(var(--c-surface))] transition-all ${
                          isActValid ? 'border-l-4 border-l-[rgb(var(--c-success))]' : 'border-l-4 border-l-[rgb(var(--c-primary))]'
                        }`}
                      >
                        <div className="min-w-0 flex-1 flex items-center gap-3">
                          <span className="font-display text-2xl text-[rgb(var(--c-primary))]">#{i + 1}</span>
                          <div className="truncate">
                            <p className="font-display text-lg text-[rgb(var(--c-text-strong))] uppercase leading-tight">
                              {act.ageCategory ? AGE_CATEGORY_LABELS[act.ageCategory].toUpperCase() : 'Categoría Pendiente'}
                            </p>
                            <p className="text-xs text-[rgb(var(--c-text)/0.8)] mt-0.5 font-medium leading-none">
                              {labelModality} · {styleName} {act.level === 'basico' ? '· BÁSICO' : act.level === 'avanzado' ? '· AVANZADO' : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3.5 shrink-0">
                          {actDancersCount > 0 && (
                            <span className="text-[10px] font-bold text-[rgb(var(--c-success-strong))] bg-[rgb(var(--c-success)/0.08)] border border-[rgb(var(--c-success)/0.2)] px-2.5 py-1 rounded-xl">
                              {actDancersCount} Integrantes
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeAct(i) }}
                            className="text-[rgb(var(--c-text)/0.4)] hover:text-[rgb(var(--c-primary))] p-1 hover:bg-[rgb(var(--c-primary)/0.05)] rounded-lg active:scale-95 transition-all duration-150"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <ChevronDown className={`w-5 h-5 text-[rgb(var(--c-text)/0.6)] transition-transform duration-300 ${isOpen ? 'rotate-180 text-[rgb(var(--c-primary))]' : ''}`} />
                        </div>
                      </div>

                      {/* Body Acordeón */}
                      {isOpen && (
                        <div className="p-3.5 sm:p-4 border-t border-[rgb(var(--c-border)/0.25)] space-y-4 animate-[fadeIn_0.25s_ease-out_forwards]">
                          {/* 1. Modalidad */}
                          <div className="space-y-1.5">
                            <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] uppercase">{modalityNum}. Selecciona la Modalidad</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                              {MODALITY_OPTIONS.map(opt => {
                                const isSelected = act.modality === opt.value
                                const isDisabled = state.dancers.length < minDancers(opt.value)
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() => {
                                      if (isDisabled) return
                                      const cleanedDancers = act.dancerIndices.slice(0, maxDancers(opt.value))
                                      updateAct(i, {
                                        modality: opt.value,
                                        dancerIndices: cleanedDancers,
                                        level: opt.value === 'grupal' ? act.level : null
                                      })
                                    }}
                                    className={`py-2 px-3 rounded-xl font-display text-xs sm:text-sm tracking-wider font-bold transition-all border duration-150 ${
                                      isSelected
                                        ? 'bg-[rgb(var(--c-primary))] border-[rgb(var(--c-primary))] text-white shadow-sm'
                                        : isDisabled
                                          ? 'bg-[rgb(var(--c-surface-2))] border-[rgb(var(--c-border)/0.2)] text-[rgb(var(--c-text)/0.35)] cursor-not-allowed opacity-60'
                                          : 'bg-[rgb(var(--c-surface))] border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] hover:bg-[rgb(var(--c-surface-2))] active:scale-95'
                                    }`}
                                    title={isDisabled ? `Requiere al menos ${minDancers(opt.value)} integrantes registrados` : undefined}
                                  >
                                    {opt.label}
                                  </button>
                                )
                              })}
                            </div>
                            {state.dancers.length < 4 && (
                              <p className="text-[10px] text-[rgb(var(--c-primary))] font-semibold mt-1 animate-[fadeIn_0.2s_ease-out_forwards]">
                                * Registraste {state.dancers.length} {state.dancers.length === 1 ? 'integrante' : 'integrantes'}. 
                                Para habilitar {state.dancers.length < 2 ? 'Dueto, Trío o Grupal' : state.dancers.length < 3 ? 'Trío o Grupal' : 'Grupal'}, 
                                agrega más alumnos en el Paso 2.
                              </p>
                            )}
                            <div className="mt-2.5 bg-amber-50 border border-amber-200/60 rounded-xl p-3 flex items-start gap-2 shadow-xs animate-[fadeIn_0.2s_ease-out_forwards]">
                              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                              <p className="text-[11px] leading-snug text-amber-800 font-medium">
                                <strong>Nota importante:</strong> No existe nivel básico para solistas, dúos y tríos, todos son avanzados.
                              </p>
                            </div>
                          </div>

                          {/* 2. Nivel (Solo si es Grupal) */}
                          {act.modality === 'grupal' && (
                            <div className="space-y-1.5 animate-[fadeIn_0.2s_ease-out_forwards]">
                              <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] uppercase">{levelNum}. Nivel Escolar de la Categoría</label>
                              <div className="grid grid-cols-2 gap-2.5 max-w-sm">
                                {[
                                  { val: 'basico', label: 'BÁSICO' },
                                  { val: 'avanzado', label: 'AVANZADO' }
                                ].map(opt => {
                                  const isSelected = act.level === opt.val
                                  return (
                                    <button
                                      key={opt.val}
                                      type="button"
                                      onClick={() => updateAct(i, { level: opt.val as Level })}
                                      className={`py-2 px-3 rounded-xl font-display text-sm tracking-wider font-bold transition-all border active:scale-95 duration-150 ${
                                        isSelected
                                          ? 'bg-[rgb(var(--c-primary))] border-[rgb(var(--c-primary))] text-white shadow-sm'
                                          : 'bg-[rgb(var(--c-surface))] border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] hover:bg-[rgb(var(--c-surface-2))]'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* 3. Estilo */}
                          <div className="space-y-1.5">
                            <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] uppercase">{styleNum}. Estilo Coreográfico</label>
                            <div className="flex flex-wrap justify-center gap-2.5">
                              {STYLES.map(style => {
                                const isSelected = act.style === style
                                return (
                                  <button
                                    key={style}
                                    type="button"
                                    onClick={() => updateAct(i, { style })}
                                    className={`py-3 px-5 rounded-xl font-display text-sm tracking-wider font-bold transition-all border active:scale-95 duration-150 ${
                                      isSelected
                                        ? 'bg-[rgb(var(--c-primary))] border-[rgb(var(--c-primary))] text-white shadow-sm'
                                        : 'bg-[rgb(var(--c-surface))] border-[rgb(var(--c-border)/0.5)] text-[rgb(var(--c-text-strong))] hover:bg-[rgb(var(--c-surface-2))]'
                                    }`}
                                  >
                                    {style.toUpperCase()}
                                  </button>
                                )
                              })}
                            </div>
                          </div>

                          {/* 4. Integrantes (Dancers Picker) */}
                          {act.modality ? (
                            <div className="space-y-2 animate-[fadeIn_0.2s_ease-out_forwards]">
                              <div className="flex justify-between items-center">
                                <label className="block text-[10px] font-bold tracking-widest text-[rgb(var(--c-text)/0.7)] uppercase">
                                  {dancersNum}. Selecciona Integrantes ({actDancersCount} de {limitDancers === 100 ? '4 o más' : limitDancers})
                                </label>
                                
                                {act.ageCategory && (
                                  <span className="text-[10px] font-bold font-display bg-[rgb(var(--c-primary))] text-white px-2.5 py-0.5 rounded-lg uppercase">
                                    Categoría de Coreografía: {AGE_CATEGORY_LABELS[act.ageCategory]}
                                  </span>
                                )}
                              </div>

                              {state.dancers.length === 0 ? (
                                <p className="text-xs text-[rgb(var(--c-text)/0.6)] italic bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.3)] rounded-2xl p-4 text-center">
                                  Regresa al Paso anterior y registra integrantes primero
                                </p>
                              ) : (
                                <div className="bg-[rgb(var(--c-surface))] border border-[rgb(var(--c-border)/0.4)] rounded-2xl p-3 sm:p-4 max-h-none overflow-visible md:max-h-[300px] md:overflow-y-auto space-y-4">
                                  {/* Group Dancers by calculated ageCategory */}
                                  {AGE_CATEGORY_ORDER.map(cat => {
                                    const groupDancers = state.dancers
                                      .map((d, di) => ({ d, di }))
                                      .filter(({ d }) => effectiveCategory(d) === cat)
                                    
                                    if (groupDancers.length === 0) return null

                                    return (
                                      <div key={cat} className="space-y-2">
                                        <p className="text-sm sm:text-base font-extrabold text-[rgb(var(--c-primary))] border-b border-[rgb(var(--c-border)/0.25)] pb-1 uppercase mt-2.5 first:mt-0">
                                          {AGE_CATEGORY_LABELS[cat]} <span className="text-xs font-normal text-[rgb(var(--c-text)/0.6)] lowercase italic">({AGE_CATEGORY_HINTS[cat]})</span>
                                        </p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                                          {groupDancers.map(({ d, di }) => {
                                            const isSel = act.dancerIndices.includes(di)
                                            
                                            const toggleDancer = () => {
                                              let nextIndices: number[]
                                              if (isSel) {
                                                nextIndices = act.dancerIndices.filter(idx => idx !== di)
                                              } else {
                                                if (act.modality === 'solista') {
                                                  nextIndices = [di]
                                                } else {
                                                  if (act.dancerIndices.length >= limitDancers) return
                                                  nextIndices = [...act.dancerIndices, di]
                                                }
                                              }
                                              
                                              // Compute high category
                                              const selectedCategories = nextIndices
                                                .map(idx => effectiveCategory(state.dancers[idx]))
                                                .filter(Boolean) as AgeCategory[]
                                              let highestCat: AgeCategory | null = null
                                              if (selectedCategories.length > 0) {
                                                const maxIndex = Math.max(...selectedCategories.map(c => AGE_CATEGORY_ORDER.indexOf(c)))
                                                highestCat = AGE_CATEGORY_ORDER[maxIndex]
                                              }

                                              updateAct(i, { dancerIndices: nextIndices, ageCategory: highestCat })
                                            }

                                            return (
                                              <button
                                                key={di}
                                                type="button"
                                                onClick={toggleDancer}
                                                className={`flex items-center justify-between p-2.5 rounded-xl font-display text-xs tracking-wider transition-all border active:scale-[0.98] duration-100 text-left ${
                                                  isSel
                                                    ? 'bg-purple-50/90 border-purple-300 text-purple-950 font-bold shadow-sm'
                                                    : 'bg-[rgb(var(--c-surface))] border-[rgb(var(--c-border)/0.4)] text-[rgb(var(--c-text-strong))] hover:bg-[rgb(var(--c-surface-2))]'
                                                }`}
                                              >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                                    isSel ? 'bg-purple-600 border-purple-600 text-white' : 'border-[rgb(var(--c-border)/0.7)] bg-[rgb(var(--c-surface))]'
                                                  }`}>
                                                    {isSel && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                                                  </div>
                                                  <span className="break-words">{getDancerDisplayName(d, di, state.dancers)}</span>
                                                </div>
                                              </button>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}

                            </div>
                          ) : (
                            <p className="text-xs text-[rgb(var(--c-text)/0.5)] italic text-center py-3">Selecciona modalidad y estilo primero para habilitar los integrantes</p>
                          )}
                        </div>
                      )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

          <div className="hidden lg:block shrink-0 pt-2">
            {!actsConfirmed ? (
              <button
                type="button"
                onClick={() => {
                  setActiveActIndex(null)
                  setActsConfirmed(true)
                }}
                disabled={!isAllValid}
                className="w-full bg-[rgb(var(--c-primary))] hover:bg-[rgb(var(--c-primary-strong))] active:bg-[rgb(var(--c-primary-strong))] text-white font-display text-lg tracking-widest py-4 rounded-2xl transition-all shadow-md active:scale-[0.98] duration-150 font-bold disabled:opacity-40 disabled:pointer-events-none"
              >
                CONFIRMAR CONFIGURACIÓN DE COREOGRAFÍAS ({state.acts.length} {state.acts.length === 1 ? 'Coreografía' : 'Coreografías'})
              </button>
            ) : (
              <button
                type="button"
                onClick={onNext}
                disabled={!isAllValid}
                className="w-full bg-gradient-to-r from-purple-700 via-purple-600 to-pink-600 hover:from-purple-800 hover:to-pink-700 active:scale-[0.98] text-white font-display text-lg sm:text-xl tracking-widest py-4 rounded-2xl transition-all duration-200 shadow-[0_4px_20px_rgba(168,85,247,0.3)] hover:shadow-[0_6px_25px_rgba(168,85,247,0.5)] disabled:opacity-30 disabled:pointer-events-none font-black text-center flex items-center justify-center gap-2"
              >
                SIGUIENTE: IR A LA REVISIÓN ({state.acts.length} {state.acts.length === 1 ? 'Coreografía' : 'Coreografías'})
                <ArrowRight className="w-5 h-5 animate-pulse" />
              </button>
            )}
          </div>
        </div>
      )
    }

    case 'summary':
      return (
        <FullSummary
          state={state}
          editMode={editMode}
          isEditSave={isEditSave}
          confirm={confirm}
          saving={saving}
          saveErr={saveErr}
          updateState={updateState}
          goToStep={goToStep}
          event={event}
        />
      )

    case 'pending':
      return (
        <FullSummary
          state={state}
          editMode={true}
          pending
          isEditSave={isEditSave}
          startEdit={() => startEdit()}
          confirm={confirm}
          saving={saving}
          saveErr={saveErr}
          updateState={updateState}
          goToStep={goToStep}
          event={event}
        />
      )

    case 'confirmed':
      return (
        <FullSummary
          state={state}
          editMode={false}
          confirmed
          isEditSave={isEditSave}
          startEdit={startEdit}
          updateState={updateState}
          goToStep={goToStep}
          event={event}
        />
      )

    case 'carta':
      return (
        <div className="overflow-visible max-h-none md:overflow-y-auto md:max-h-[82vh] px-0 sm:px-1 w-full" style={{ animation: 'fadeIn 0.3s ease-out' }}>
          <CartaResponsiva
            state={state}
            event={event}
            signature={signature}
            setSignature={setSignature}
            confirm={confirm}
            saving={saving}
            goToStep={goToStep}
          />
        </div>
      )
  }
}
