'use client'
import { useState } from 'react'
import { Layers, Box, Check } from 'lucide-react'
import type { MapTilerStyleId } from '@/lib/mapStyles'

export type MapMode = 'offline' | MapTilerStyleId

interface Props {
  mode: MapMode
  onModeChange: (mode: MapMode) => void
  is3D: boolean
  onToggle3D: () => void
  isOnline: boolean
  showNatura2000: boolean
  onToggleNatura2000: () => void
  showGeologia: boolean
  onToggleGeologia: () => void
}

const ONLINE_OPTIONS: { id: MapMode; label: string }[] = [
  { id: 'offline', label: 'Offline (sicura)' },
  { id: 'outdoor', label: 'Outdoor' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'winter', label: 'Winter' },
]

/**
 * Popover to pick between the offline-safe raster map (always available,
 * even without a downloaded package it falls back to on-demand tiles) and
 * the richer MapTiler styles (Outdoor/Satellite/Winter, each with an
 * optional 3D tilt) — those require connectivity, so they're hidden while
 * offline instead of offering a mode that would just fail to load tiles.
 *
 * Opens UPWARD (bottom-14, not top-14): anchored low in the right-side
 * toolbar, a downward popover got clipped behind the bottom sheet — an
 * observed, screenshotted bug — since the sheet sits at a higher stacking
 * position than a mid-screen dropdown drawn top-down.
 */
export default function MapModeSwitcher({
  mode, onModeChange, is3D, onToggle3D, isOnline,
  showNatura2000, onToggleNatura2000, showGeologia, onToggleGeologia,
}: Props) {
  const [open, setOpen] = useState(false)
  const options = isOnline ? ONLINE_OPTIONS : ONLINE_OPTIONS.filter((o) => o.id === 'offline')
  // Both overlays are fetched/rendered live (GeoJSON fetch, WMS raster tiles) — same
  // online-only eligibility as the 3D toggle, not part of the downloaded offline package.
  const is3DEligible = mode !== 'offline'
  const overlaysEligible = mode !== 'offline'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-11 h-11 rounded-full bg-white text-stone-700 shadow-lg flex items-center justify-center"
        aria-label="Cambia mappa"
      >
        <Layers className="w-5 h-5" />
      </button>

      {open && (
        <>
          {/* Full-screen tap-away catcher, so opening the menu doesn't leave it stuck open behind the map. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-14 z-20 w-52 rounded-xl bg-white shadow-2xl border border-stone-200 overflow-hidden">
            {options.map((opt) => (
              <button
                key={opt.id}
                onClick={() => { onModeChange(opt.id); setOpen(false) }}
                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm text-left hover:bg-stone-50 ${mode === opt.id ? 'font-semibold text-terra-600' : 'text-stone-700'}`}
              >
                {opt.label}
                {mode === opt.id && <Check className="w-4 h-4 flex-shrink-0" />}
              </button>
            ))}
            {is3DEligible && (
              <button
                onClick={onToggle3D}
                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm text-left border-t border-stone-100 hover:bg-stone-50 ${is3D ? 'font-semibold text-terra-600' : 'text-stone-700'}`}
              >
                <span className="flex items-center gap-2"><Box className="w-4 h-4 flex-shrink-0" /> Vista 3D</span>
                {is3D && <Check className="w-4 h-4 flex-shrink-0" />}
              </button>
            )}
            {overlaysEligible && (
              <>
                <button
                  onClick={onToggleNatura2000}
                  className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm text-left border-t border-stone-100 hover:bg-stone-50 ${showNatura2000 ? 'font-semibold text-terra-600' : 'text-stone-700'}`}
                >
                  <span>Confini Natura 2000</span>
                  {showNatura2000 && <Check className="w-4 h-4 flex-shrink-0" />}
                </button>
                <button
                  onClick={onToggleGeologia}
                  className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm text-left hover:bg-stone-50 ${showGeologia ? 'font-semibold text-terra-600' : 'text-stone-700'}`}
                >
                  <span>Layer geologico</span>
                  {showGeologia && <Check className="w-4 h-4 flex-shrink-0" />}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
