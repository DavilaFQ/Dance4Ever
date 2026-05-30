'use client'

import Image from 'next/image'
import { Lock } from 'lucide-react'

interface PortalLockoutProps {
  portalName: string
}

export default function PortalLockout({ portalName }: PortalLockoutProps) {
  return (
    <div className="min-h-[100dvh] bg-black flex flex-col items-center justify-center gap-8 p-6 select-none animate-fade-in text-white">
      {/* Background Radial Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.08)_0%,transparent_70%)] pointer-events-none" />

      {/* Brand Logo */}
      <div className="relative z-10 opacity-90">
        <Image src="/logo.png" alt="Dance4ever" width={200} height={150} priority className="h-auto w-auto" />
      </div>

      {/* Locked Card Container */}
      <div className="relative z-10 text-center space-y-5 max-w-sm w-full p-8 border border-neutral-800 bg-neutral-950/60 backdrop-blur-md rounded-none">
        {/* Animated Lock Icon */}
        <div className="mx-auto w-16 h-16 flex items-center justify-center bg-red-500/10 border border-red-500/20 text-red-500 rounded-none relative">
          <Lock className="w-7 h-7 animate-pulse" />
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </span>
        </div>

        {/* Lockout Details */}
        <div className="space-y-2.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/10 border border-red-500/30 text-[10px] font-extrabold uppercase tracking-wider text-red-400">
            Portal Desactivado
          </span>
          <h1 className="font-display text-lg tracking-widest uppercase font-bold text-white">
            {portalName}
          </h1>
          <p className="text-neutral-400 text-xs leading-relaxed max-w-[280px] mx-auto">
            Este acceso ha sido temporalmente desactivado por la administración para este evento.
          </p>
        </div>

      </div>

      {/* Bottom Brand Line */}
      <div className="relative z-10 flex flex-col items-center gap-2 mt-2">
        <div className="w-12 h-[1px] bg-neutral-800" />
        <p className="text-neutral-700 text-[9px] tracking-[0.4em] uppercase font-bold font-mono">
          Dance4ever
        </p>
      </div>
    </div>
  )
}
