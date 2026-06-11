'use client'
import { use, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Props = { params: Promise<{ eventId: string }> }

/**
 * Ruta legacy /mc/[eventId] — Redirige a /presentador/[eventId]
 * Mantiene compatibilidad con QR codes ya generados.
 */
export default function MCRedirectPage({ params }: Props) {
  const { eventId } = use(params)
  const router = useRouter()

  useEffect(() => {
    router.replace(`/presentador/${eventId}`)
  }, [eventId, router])

  return (
    <div className="h-[100dvh] bg-black flex items-center justify-center text-fuchsia-500 font-display text-xl tracking-widest animate-pulse">
      Redirigiendo…
    </div>
  )
}
