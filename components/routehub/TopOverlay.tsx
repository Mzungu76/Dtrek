'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import HubNavBar from './HubNavBar'
import type { StatPill, WeatherIcon } from './types'

interface Props {
  /** Stable identity of the current route — used to cross-dissolve title/pills/badges on swipe. */
  itemKey: string
  title: string
  statPills: StatPill[]
  weatherIcon?: WeatherIcon | null
  onOpenWeather?: () => void
  /** Score/rating chips (CTS, Sicurezza, Bellezza…), floating persistently over the map. */
  scoreBadges?: ReactNode
}

const FADE_OUT_MS = 120
const FADE_IN_MS = 150

export default function TopOverlay({ itemKey, title, statPills, weatherIcon, onOpenWeather, scoreBadges }: Props) {
  const [visible, setVisible] = useState(true)
  const prevKey = useRef(itemKey)

  useEffect(() => {
    if (prevKey.current === itemKey) return
    prevKey.current = itemKey
    setVisible(false)
    const id = setTimeout(() => setVisible(true), FADE_OUT_MS)
    return () => clearTimeout(id)
  }, [itemKey])

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/70 to-transparent" />

      <div className="relative px-3 sm:px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)]">
        <HubNavBar />

        <div
          className="transition-opacity ease-out"
          style={{ opacity: visible ? 1 : 0, transitionDuration: `${visible ? FADE_IN_MS : FADE_OUT_MS}ms` }}
        >
          <div className="pointer-events-auto mt-3 flex items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
            {statPills.map(({ icon: Icon, label }) => (
              <span key={label} className="pointer-events-auto shrink-0 flex items-center gap-1.5 bg-white text-stone-700 text-[11px] font-semibold whitespace-nowrap px-2.5 py-1.5 rounded-full shadow-sm">
                <Icon className="w-3 h-3" /> {label}
              </span>
            ))}
            {scoreBadges}
          </div>

          <div className="mt-3 flex items-start gap-2.5">
            <p className="flex-1 font-display text-xl sm:text-2xl font-bold text-white" style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
              {title}
            </p>
            {weatherIcon && onOpenWeather && (
              <button
                onClick={onOpenWeather}
                title={weatherIcon.label}
                className="pointer-events-auto shrink-0 text-2xl leading-none"
                style={{ textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}
              >
                {weatherIcon.emoji}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
