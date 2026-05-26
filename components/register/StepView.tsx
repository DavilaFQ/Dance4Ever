'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { ArrowRight } from 'lucide-react'
import { type Event } from '@/lib/supabase'
import { type State, type Step, type Coach, type Dancer, type Act } from '@/components/register/types'
import StepViewContent from '@/components/register/StepViewContent'


export default 
function StepView(props: {
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
  actsConfirmed: boolean
  setActsConfirmed: (b: boolean) => void
  activeActIndex: number | null
  setActiveActIndex: (i: number | null) => void
}) {
  const [videoEnded, setVideoEnded] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [useFallback, setUseFallback] = useState(false)
  const [startBlurring, setStartBlurring] = useState(false)
  const [videoLoaded, setVideoLoaded] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    // Autoplay safeguard: if after 1.5 seconds the video has not played, show button immediately
    const timer = setTimeout(() => {
      if (videoRef.current && (videoRef.current.paused || videoRef.current.currentTime < 0.1)) {
        setUseFallback(true)
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [])

  const isWelcome = props.step.kind === 'welcome'

  return (
    <>
      {/* Background Video Container - kept in DOM during all steps of StepView to prevent WebKit visual flicker */}
      <div 
        className="absolute inset-0 pointer-events-none z-0 transition-all duration-1000 ease-out overflow-hidden" 
        style={{ 
          opacity: isWelcome ? 1 : 0, 
          visibility: isWelcome ? 'visible' : 'hidden',
          background: '#000000',
        }}
      >
        {/* BACKGROUND VIDEO (Plays once, blurs on end, top-aligned) */}
        <video
          ref={videoRef}
          autoPlay
          muted
          loop={false}
          onEnded={() => setVideoEnded(true)}
          onTimeUpdate={(e) => {
            const video = e.currentTarget
            if (video.duration) {
              setVideoProgress((video.currentTime / video.duration) * 100)
              // Trigger slow blur and brand fade 2.2 seconds before video ends
              if (video.duration - video.currentTime <= 2.2) {
                setStartBlurring(true)
              }
            }
            setCurrentTime(video.currentTime)
          }}
          playsInline
          onPlaying={() => setVideoLoaded(true)}
          className="absolute top-0 left-0 w-full h-[106dvh] object-contain z-0 pointer-events-none select-none"
          style={{
            objectPosition: 'center top',
            backgroundColor: '#000000',
          }}
          poster="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
        >
          <source src="/untitled.mp4#t=0.001" type="video/mp4" />
        </video>

        {/* SOLID BLACK COVER OVERLAY (Fades out when video starts playing) */}
        <div 
          className="absolute inset-0 z-10 bg-black pointer-events-none transition-opacity duration-[800ms] ease-out"
          style={{
            opacity: (videoLoaded || useFallback) ? 0 : 1,
          }}
        />

        {/* CINEMATIC GRADIENT OVERLAY WHEN VIDEO ENDS */}
        <div 
          className={`absolute inset-0 z-20 bg-gradient-to-b from-amber-950/20 via-black/80 to-black transition-opacity pointer-events-none ${
            (videoEnded || useFallback || startBlurring) ? 'opacity-100' : 'opacity-0'
          }`} 
          style={{
            transitionDuration: '2200ms',
            transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)'
          }}
        />

        {/* SMOOTH BACKDROP BLUR TRANSITION LAYER */}
        <div 
          className={`absolute inset-0 z-20 pointer-events-none blur-transition-layer ${
            (videoEnded || useFallback || startBlurring) ? 'blurred' : ''
          }`} 
        />
      </div>

      <StepViewContent
        {...props}
        videoEnded={videoEnded}
        videoProgress={videoProgress}
        currentTime={currentTime}
        useFallback={useFallback}
        startBlurring={startBlurring}
        videoLoaded={videoLoaded}
        setVideoEnded={setVideoEnded}
        setVideoProgress={setVideoProgress}
        setCurrentTime={setCurrentTime}
        setUseFallback={setUseFallback}
        setStartBlurring={setStartBlurring}
        setVideoLoaded={setVideoLoaded}
        videoRef={videoRef}
      />
    </>
  )
}
