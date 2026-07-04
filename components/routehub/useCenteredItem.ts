import { useEffect, useRef, useState } from 'react'

/**
 * Tracks which item in a vertically-scrolling list currently sits nearest the center of its
 * scroll container — used to sync a scrollable section's content with a highlighted marker on
 * the map above it (POI, Sicurezza). `count` must match the number of items registered via
 * `setItemRef`.
 */
export function useCenteredItem(count: number) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLElement | null)[]>([])
  const [centeredIndex, setCenteredIndex] = useState<number | null>(count > 0 ? 0 : null)

  useEffect(() => {
    const root = containerRef.current
    if (!root || count === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        let best: { idx: number; dist: number } | null = null
        const rootRect = root.getBoundingClientRect()
        const rootCenter = rootRect.top + rootRect.height / 2
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const idx = itemRefs.current.findIndex(el => el === entry.target)
          if (idx === -1) continue
          const rect = entry.boundingClientRect
          const dist = Math.abs(rect.top + rect.height / 2 - rootCenter)
          if (!best || dist < best.dist) best = { idx, dist }
        }
        if (best) setCenteredIndex(best.idx)
      },
      { root, rootMargin: '-40% 0px -40% 0px', threshold: 0.01 },
    )
    itemRefs.current.forEach(el => el && observer.observe(el))
    return () => observer.disconnect()
  }, [count])

  const setItemRef = (i: number) => (el: HTMLElement | null) => { itemRefs.current[i] = el }

  return { containerRef, setItemRef, centeredIndex }
}
