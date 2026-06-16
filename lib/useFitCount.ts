'use client'
import { useEffect, useState } from 'react'

export function useFitCount(itemHeight: number, gap: number = 4) {
  const [el, setEl] = useState<HTMLElement | null>(null)
  const [count, setCount] = useState(0)
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (!el || typeof window === 'undefined') return
    const compute = () => {
      const h = el.getBoundingClientRect().height
      if (h <= 0) return
      const fits = Math.max(0, Math.floor((h + gap) / (itemHeight + gap)))
      setCount(prev => (prev === fits ? prev : fits))
      setHeight(prev => (prev === h ? prev : h))
    }
    compute()
    const raf = requestAnimationFrame(compute)
    const observer = new ResizeObserver(compute)
    observer.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [el, itemHeight, gap])

  return { ref: setEl, count, height }
}
