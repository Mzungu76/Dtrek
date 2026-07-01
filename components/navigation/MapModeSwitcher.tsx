'use client'
import { useState } from 'react'
import { Layers, Box, Map as MapIcon } from 'lucide-react'
import type { MapTilerStyleId } from '@/lib/mapStyles'

export type MapMode = 'offline' | MapTilerStyleId

interface Props {
  mode: MapMode
  onModeChange: (mode: MapMode) => void
  is3D: boolean
  onToggle3D: () => void
  isOnline: boolean
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
 */
export default function MapModeSwitcher({ mode, onModeChange, is3D, onToggle3D, isOnline }: Props) {
  const [open, setOpen] = useState(false)
  const options = isOnline ? ONLINE_OPTIONS : ONLINE_OPTIONS.filter((o) => o.id === 'offline')
  const is3DEligible = mode !== 'offline'

  return (
    <div className="absolute right-3 z-10" style={{ top: 'calc(50% + 64px)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-11 h-11 rounded-full bg-white text-slate-700 shadow-lg flex items-center justify-center"
        aria-label="Cambia mappa"
      >
        <Layers className="w-5 h-5" />
      </button>

      {open && (
        <div className="absolute right-0 top-14 w-48 rounded-xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => { onModeChange(opt.id); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-slate-50 ${mode === opt.id ? 'font-semibold text-sky-600' : 'text-slate-700'}`}
            >
              <MapIcon className="w-4 h-4 flex-shrink-0" /> {opt.label}
            </button>
          ))}
          {is3DEligible && (
            <button
              onClick={onToggle3D}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left border-t border-slate-100 hover:bg-slate-50 ${is3D ? 'font-semibold text-sky-600' : 'text-slate-700'}`}
            >
              <Box className="w-4 h-4 flex-shrink-0" /> Vista 3D {is3D ? '(attiva)' : ''}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
