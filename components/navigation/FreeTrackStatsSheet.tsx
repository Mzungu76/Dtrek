'use client'
import { useState } from 'react'
import { X, Pause, Play, Camera, NotebookPen } from 'lucide-react'
import type { TrackPoint } from '@/lib/tcxParser'
import ElevationProfileChart from '@/components/ElevationProfileChart'
import { useModalBackHandler } from '@/lib/navigation/useModalBackHandler'

type Tab = 'tempi' | 'altimetria'

interface Props {
  open: boolean
  onClose: () => void
  distanceMeters: number
  durationSeconds: number
  elevationGain: number
  currentSpeedMs: number | null
  timerRunning: boolean
  onTogglePlayPause: () => void
  trackPoints: TrackPoint[]
  onOpenFoto: () => void
  onOpenNota: () => void
}

function formatKm(m: number): string { return (m / 1000).toFixed(2) }
function formatKmh(ms: number | null): string { return ms == null || !Number.isFinite(ms) ? '—' : (ms * 3.6).toFixed(1) }
function formatDuration(totalSeconds: number): string {
  const s = Math.floor(totalSeconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/**
 * Equivalente di NavStatsSheet per la registrazione libera (Soluzione B) — stesso pannello a
 * schermo intero aperto da NavBottomStrip, con due sole schede (Tempi/Altimetria: senza percorso
 * pianificato non ci sono POI o guida da elencare in una scheda "Percorso"). L'altimetria usa gli
 * stessi punti registrati dalla sessione (FreeTrackSession.getPoints()), lo stesso
 * ElevationProfileChart e la stessa palette colore della navigazione pianificata.
 */
export default function FreeTrackStatsSheet({
  open, onClose, distanceMeters, durationSeconds, elevationGain, currentSpeedMs,
  timerRunning, onTogglePlayPause, trackPoints, onOpenFoto, onOpenNota,
}: Props) {
  const [tab, setTab] = useState<Tab>('tempi')
  useModalBackHandler(open, onClose)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[2100] bg-[#fdfcfa] flex flex-col">
      <div className="flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top)+14px)] pb-3 border-b border-stone-100">
        <button onClick={onClose} className="w-9 h-9 rounded-full bg-stone-100 text-stone-600 flex items-center justify-center shrink-0" aria-label="Chiudi dettagli">
          <X className="w-4.5 h-4.5" />
        </button>
        <h2 className="font-display text-lg font-bold text-stone-900 flex-1">Dettagli registrazione</h2>
      </div>

      <div className="px-4 pt-3">
        <div className="flex gap-2">
          <button onClick={onOpenFoto} className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl bg-stone-100 text-stone-600 text-[10px] font-semibold">
            <Camera className="w-[18px] h-[18px]" /> Foto
          </button>
          <button onClick={onOpenNota} className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl bg-stone-100 text-stone-600 text-[10px] font-semibold">
            <NotebookPen className="w-[18px] h-[18px]" /> Nota
          </button>
        </div>
      </div>

      <div className="flex gap-1 px-4 pt-4 pb-2">
        {([['tempi', 'Tempi'], ['altimetria', 'Altimetria']] as [Tab, string][]).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold font-body transition-colors ${
              tab === id ? 'bg-terra-500 text-white' : 'bg-stone-100 text-stone-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {tab === 'tempi' && (
          <div>
            <div className="grid grid-cols-2 gap-y-4 py-2">
              <div>
                <div className="text-2xl font-bold text-stone-900 font-mono">{formatKm(distanceMeters)}<span className="text-sm font-medium text-stone-500 ml-1">km</span></div>
                <div className="text-xs text-stone-500 font-body">Distanza</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-stone-900 font-mono">{formatKmh(currentSpeedMs)}<span className="text-sm font-medium text-stone-500 ml-1">km/h</span></div>
                <div className="text-xs text-stone-500 font-body">Velocità</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-stone-900 font-mono">+{Math.round(elevationGain)}<span className="text-sm font-medium text-stone-500 ml-1">m</span></div>
                <div className="text-xs text-stone-500 font-body">Dislivello</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-stone-900 font-mono">{formatDuration(durationSeconds)}</div>
                <div className="text-xs text-stone-500 font-body">Durata</div>
              </div>
            </div>
            <div className="flex justify-end pt-3 mt-2 border-t border-stone-100">
              <button onClick={onTogglePlayPause} className="w-10 h-10 rounded-full bg-forest-500 text-white flex items-center justify-center shadow" aria-label={timerRunning ? 'Pausa' : 'Riprendi'}>
                {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {tab === 'altimetria' && (
          trackPoints.length > 1
            ? <ElevationProfileChart trackPoints={trackPoints} currentDistanceM={distanceMeters} />
            : <p className="text-sm text-stone-400 font-body py-6 text-center">Non ancora abbastanza dati di quota per il profilo altimetrico.</p>
        )}
      </div>
    </div>
  )
}
