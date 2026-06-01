'use client'

import { useEffect, useState, useRef } from 'react'
import { RefreshCw } from 'lucide-react'

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void
  children: React.ReactNode
}

export default function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const isPulling = useRef(false)

  const PULL_THRESHOLD = 80 // px to trigger refresh
  const MAX_PULL = 130 // maximum pull down distance

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleTouchStart = (e: TouchEvent) => {
      // Only pull if we are at the very top of the scroll container
      const scrollParent = getScrollParent(container)
      const scrollTop = scrollParent ? scrollParent.scrollTop : window.scrollY
      
      if (scrollTop === 0) {
        startY.current = e.touches[0].pageY
        isPulling.current = true
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current || isRefreshing) return

      const currentY = e.touches[0].pageY
      const diff = currentY - startY.current

      if (diff > 0) {
        // Apply resistance (logarithmic/quadratic pull feeling)
        const resistance = 0.5
        const pull = Math.min(MAX_PULL, diff * resistance)
        setPullDistance(pull)

        // Prevent default scrolling if pulling down
        if (e.cancelable) {
          e.preventDefault()
        }
      } else {
        isPulling.current = false
        setPullDistance(0)
      }
    }

    const handleTouchEnd = async () => {
      if (!isPulling.current) return
      isPulling.current = false

      if (pullDistance >= PULL_THRESHOLD && !isRefreshing) {
        setIsRefreshing(true)
        setPullDistance(PULL_THRESHOLD)
        try {
          await onRefresh()
        } catch (error) {
          console.error('Refresh error:', error)
        } finally {
          setIsRefreshing(false)
          setPullDistance(0)
        }
      } else {
        // Snap back
        setPullDistance(0)
      }
    }

    const getScrollParent = (node: HTMLElement | null): HTMLElement | null => {
      if (node == null) return null
      if (node === document.body) return null
      
      const overflowY = window.getComputedStyle(node).overflowY
      const isScrollable = overflowY === 'auto' || overflowY === 'scroll'
      
      if (isScrollable && node.scrollHeight > node.clientHeight) {
        return node
      }
      return getScrollParent(node.parentElement)
    }

    container.addEventListener('touchstart', handleTouchStart, { passive: false })
    container.addEventListener('touchmove', handleTouchMove, { passive: false })
    container.addEventListener('touchend', handleTouchEnd)

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
    }
  }, [pullDistance, isRefreshing, onRefresh])

  return (
    <div ref={containerRef} className="relative w-full min-h-full flex flex-col">
      {/* Pull indicator */}
      <div 
        className="absolute left-0 right-0 flex items-center justify-center pointer-events-none transition-all duration-200 z-50"
        style={{
          height: `${PULL_THRESHOLD}px`,
          top: `${pullDistance - PULL_THRESHOLD}px`,
          opacity: pullDistance > 10 ? Math.min(1, pullDistance / PULL_THRESHOLD) : 0,
        }}
      >
        <div className="bg-neutral-900/90 border border-neutral-800 text-white p-2.5 rounded-full shadow-2xl flex items-center justify-center gap-2 backdrop-blur-md">
          <RefreshCw 
            className={`w-4 h-4 text-fuchsia-500 transition-transform ${isRefreshing ? 'animate-spin' : ''}`}
            style={{
              transform: isRefreshing ? undefined : `rotate(${pullDistance * 3.6}deg)`,
              animationDuration: isRefreshing ? '0.8s' : undefined
            }}
          />
          {pullDistance >= PULL_THRESHOLD && !isRefreshing && (
            <span className="text-[10px] uppercase tracking-wider font-display font-bold px-1.5 animate-pulse text-fuchsia-400">
              Soltar para actualizar
            </span>
          )}
        </div>
      </div>

      {/* Main content wrapper */}
      <div className="flex-1 flex flex-col w-full h-full">
        {children}
      </div>
    </div>
  )
}
