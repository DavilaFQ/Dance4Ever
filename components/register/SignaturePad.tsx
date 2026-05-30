'use client'
import { useRef, useState, useEffect, useCallback } from 'react'

export default function SignaturePad({ value, onChange }: {
  value: string | null
  onChange: (dataUrl: string | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)

  const resize = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
    }
  }, [])

  useEffect(() => {
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [resize])

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    setDrawing(true)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  const move = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!drawing) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  const end = () => {
    setDrawing(false)
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL()
    setHasSignature(true)
    onChange(dataUrl)
  }

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
    onChange(null)
  }

  return (
    <div className="space-y-2">
      <div className="bg-white rounded-xl border-2 border-dashed border-neutral-300 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="w-full h-32 touch-none cursor-crosshair"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
      </div>
      <button
        type="button"
        onClick={clear}
        className="text-xs text-neutral-500 hover:text-red-500 underline"
      >
        Limpiar firma
      </button>
    </div>
  )
}
