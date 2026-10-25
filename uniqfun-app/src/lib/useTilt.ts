import { useCallback, useEffect, useRef } from 'react'

/**
 * 3D mouse-tilt hook for CoinCard.
 * Tilts toward the mouse (max ±6deg), writes --rx / --ry CSS custom properties,
 * rAF-throttled, active only on hover + fine pointer when motion is allowed,
 * and resets on pointer leave.
 */
export function useTilt<T extends HTMLElement = HTMLElement>(maxDeg = 6) {
  const ref = useRef<T | null>(null)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current)
      }
    }
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent<T>) => {
      const el = ref.current
      if (!el || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

      const clientX = e.clientX
      const clientY = e.clientY

      if (frameRef.current !== null) return
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
        const node = ref.current
        if (!node) return
        const rect = node.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return
        const nx = (clientX - rect.left) / rect.width - 0.5
        const ny = (clientY - rect.top) / rect.height - 0.5
        const rx = Math.max(-maxDeg, Math.min(maxDeg, -ny * maxDeg * 2))
        const ry = Math.max(-maxDeg, Math.min(maxDeg, nx * maxDeg * 2))
        node.style.setProperty('--rx', `${rx.toFixed(2)}deg`)
        node.style.setProperty('--ry', `${ry.toFixed(2)}deg`)
      })
    },
    [maxDeg]
  )

  const onPointerLeave = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    const el = ref.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
  }, [])

  return { ref, onPointerMove, onPointerLeave }
}
