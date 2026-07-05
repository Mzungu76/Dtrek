'use client'
import HubNavBar from './HubNavBar'
import type { StatPill, WeatherIcon } from './types'

interface Props {
  title: string
  statPills: StatPill[]
  weatherIcon?: WeatherIcon | null
  onOpenWeather?: () => void
}

export default function TopOverlay({ title, statPills, weatherIcon, onOpenWeather }: Props) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20">
      <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/70 to-transparent" />

      <div className="relative px-3 sm:px-4 pt-[calc(env(safe-area-inset-top,0px)+10px)]">
        <HubNavBar />

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {statPills.map(({ icon: Icon, label }) => (
            <span key={label} className="pointer-events-auto flex items-center gap-1.5 bg-black/45 backdrop-blur-md text-white text-[11px] font-semibold whitespace-nowrap px-2.5 py-1.5 rounded-full border border-white/10">
              <Icon className="w-3 h-3" /> {label}
            </span>
          ))}
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
  )
}
