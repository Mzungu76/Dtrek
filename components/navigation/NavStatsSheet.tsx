'use client'
import { useState } from 'react'
import { X, Pause, Play, MapPin, BookOpen, Camera, NotebookPen, Square, Sun, Contrast } from 'lucide-react'
import type { TrackPoint } from '@/lib/tcxParser'
import ElevationProfileChart from '@/components/ElevationProfileChart'
import type { PaceStatus } from '@/lib/navigation/paceAssistant'
import { useModalBackHandler } from '@/lib/navigation/useModalBackHandler'

type Tab = 'tempi' | 'altimetria' | 'percorso'

interface RemainingPoi {
  id: string | number
  name?: string
  distanceM: number
}

interface Props {
  open: boolean
  onClose: () => void
  distanceCoveredM: number
  distanceRemainingM: number
  currentSpeedMs: number | null
  avgSpeedMs: number | null
  movingTimeMs: number
  etaDate: Date | null
  paceStatus: PaceStatus
  daylightMarginMin: number | null
  timerRunning: boolean
  onTogglePlayPause: () => void
  onStop: () => void
  trackPoints: TrackPoint[]
  currentDistanceM: number
  remainingPois: RemainingPoi[]
  guideExcerpts: string[]
  onOpenFoto: () => void
  onOpenNota: () => void
  /** Non più esposto in UI (riconoscimento specie in stand-by, vedi commento più sotto vicino
   *  al pulsante rimosso) — il prop resta nel tipo così ActiveNavigationView.tsx continua a
   *  passarlo senza modifiche, pronto per essere riesposto con un bottone in futuro. */
  onOpenSpecie: () => void
  wakeLockEnabled: boolean
  onToggleWakeLock: () => void
  /** DTREK-AUDIT.md P1 #20 — nessun sensore di luce ambientale disponibile a una pagina web:
   *  interruttore manuale, stesso principio di wakeLockEnabled sopra. */
  highContrastEnabled: boolean
  onToggleHighContrast: () => void
}

const PACE_STATUS_STYLE: Record<PaceStatus, { label: string; className: string }> = {
  estimating: { label: 'In stima',    className: 'bg-stone-100 text-stone-500' },
  ahead:      { label: 'In anticipo', className: 'bg-forest-100 text-forest-700' },
  on_pace:    { label: 'A ritmo',     className: 'bg-sky-100 text-sky-700' },
  behind:     { label: 'In ritardo',  className: 'bg-amber-100 text-amber-700' },
}

function formatKm(m: number): string { return (m / 1000).toFixed(1) }
function formatKmh(ms: number | null): string { return ms == null || !Number.isFinite(ms) ? '—' : (ms * 3.6).toFixed(1) }
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
function formatDistM(m: number): string { return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m` }
function formatEta(d: Date): string { return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) }

/**
 * Soluzione B: tutto quello che NavBottomSheet teneva dietro il trascina-per-espandere —
 * tempi/altimetria/percorso, foto/nota/specie — ora vive qui, un pannello a schermo intero
 * aperto da NavBottomStrip. Niente più scheda parzialmente sopra la mappa: o la mappa è
 * protagonista (strip sottile), o si guardano i dettagli (qui), mai una via di mezzo che le
 * sottrae spazio in permanenza.
 */
export default function NavStatsSheet({
  open, onClose,
  distanceCoveredM, distanceRemainingM, currentSpeedMs, avgSpeedMs, movingTimeMs, etaDate,
  paceStatus, daylightMarginMin,
  timerRunning, onTogglePlayPause, onStop, trackPoints, currentDistanceM, remainingPois, guideExcerpts,
  onOpenFoto, onOpenNota, wakeLockEnabled, onToggleWakeLock, highContrastEnabled, onToggleHighContrast,
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
        <h2 className="font-display text-lg font-bold text-stone-900 flex-1">Dettagli escursione</h2>
      </div>

      <div className="px-4 pt-3">
        <div className="flex gap-2">
          <button onClick={onOpenFoto} className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl bg-stone-100 text-stone-600 text-[10px] font-semibold">
            <Camera className="w-[18px] h-[18px]" /> Foto
          </button>
          <button onClick={onOpenNota} className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl bg-stone-100 text-stone-600 text-[10px] font-semibold">
            <NotebookPen className="w-[18px] h-[18px]" /> Nota
          </button>
          {/* Riconoscimento specie in stand-by (dipende da un endpoint iNaturalist non
              ufficiale/non garantito per l'uso a più utenti — vedi lib/inatIdentify.ts,
              SpeciesIdentifySheet.tsx e app/api/flora-fauna-identify/route.ts, lasciati intatti
              e già pronti alla coda offline: basta reintrodurre questo bottone quando/se si
              deciderà come gestire l'autenticazione OAuth e i limiti di traffico). */}
          <button onClick={onStop} className="flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl bg-terra-500 text-white text-[10px] font-bold">
            <Square className="w-[18px] h-[18px]" /> Termina
          </button>
        </div>
      </div>

      <div className="flex gap-1 px-4 pt-4 pb-2">
        {([
          ['tempi', 'Tempi'],
          ['altimetria', 'Altimetria'],
          ['percorso', 'Percorso'],
        ] as [Tab, string][]).map(([id, label]) => (
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
                <div className="text-2xl font-bold text-stone-900 font-mono">{formatKm(distanceCoveredM)}<span className="text-sm font-medium text-stone-500 ml-1">km</span></div>
                <div className="text-xs text-stone-500 font-body">Distanza</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-stone-900 font-mono">{formatKmh(currentSpeedMs)}<span className="text-sm font-medium text-stone-500 ml-1">km/h</span></div>
                <div className="text-xs text-stone-500 font-body">Velocità</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-stone-900 font-mono">{formatKm(distanceRemainingM)}<span className="text-sm font-medium text-stone-500 ml-1">km</span></div>
                <div className="text-xs text-stone-500 font-body">Rimanenti</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-stone-900 font-mono">{formatKmh(avgSpeedMs)}<span className="text-sm font-medium text-stone-500 ml-1">km/h</span></div>
                <div className="text-xs text-stone-500 font-body">Velocità media</div>
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 mt-2 border-t border-stone-100">
              <div>
                <div className="text-xl font-bold text-stone-900 font-mono">{formatDuration(movingTimeMs)}</div>
                <div className="text-xs text-stone-500 font-body">Tempo in movimento</div>
                {etaDate && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-terra-600 font-body font-semibold">Arrivo stimato {formatEta(etaDate)}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full font-body ${PACE_STATUS_STYLE[paceStatus].className}`}>
                      {PACE_STATUS_STYLE[paceStatus].label}
                    </span>
                  </div>
                )}
                {daylightMarginMin != null && (
                  <div className={`text-xs font-body mt-0.5 ${daylightMarginMin < 0 ? 'text-red-600 font-semibold' : daylightMarginMin < 60 ? 'text-amber-600' : 'text-stone-400'}`}>
                    {daylightMarginMin < 0
                      ? `Arrivo ${Math.round(-daylightMarginMin)} min dopo il tramonto`
                      : `Tramonto tra ${Math.round(daylightMarginMin)} min dall'arrivo`}
                  </div>
                )}
              </div>
              {!timerRunning && movingTimeMs === 0 ? (
                <button onClick={onTogglePlayPause} className="flex items-center gap-1.5 px-4 h-10 rounded-full bg-forest-500 text-white text-sm font-semibold font-body shadow">
                  <Play className="w-4 h-4" /> Avvia
                </button>
              ) : (
                <button onClick={onTogglePlayPause} className="w-10 h-10 rounded-full bg-forest-500 text-white flex items-center justify-center shadow" aria-label={timerRunning ? 'Pausa' : 'Riprendi'}>
                  {timerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
              )}
            </div>
            <button
              onClick={onToggleWakeLock}
              className="w-full flex items-center justify-between gap-2 mt-3 pt-3 border-t border-stone-100"
            >
              <span className="flex items-center gap-2 text-sm text-stone-700 font-body">
                <Sun className="w-4 h-4 text-stone-400" /> Mantieni lo schermo acceso
              </span>
              <span
                className={`relative w-10 h-6 rounded-full transition-colors ${wakeLockEnabled ? 'bg-forest-500' : 'bg-stone-300'}`}
                role="switch"
                aria-checked={wakeLockEnabled}
                aria-label="Mantieni lo schermo acceso durante la navigazione"
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${wakeLockEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </span>
            </button>
            {/* DTREK-AUDIT.md P1 #20 — nessuna modalità alto contrasto per il sole forte: gli
               sfondi semi-trasparenti dietro il testo di navigazione restano insufficienti sotto
               sole diretto o su uno schermo molto luminoso. Nessun sensore di luce disponibile a
               una pagina web (rimosso ovunque per privacy) — interruttore manuale, stesso
               principio di "Mantieni lo schermo acceso" sopra. */}
            <button
              onClick={onToggleHighContrast}
              className="w-full flex items-center justify-between gap-2 mt-3 pt-3 border-t border-stone-100"
            >
              <span className="flex items-center gap-2 text-sm text-stone-700 font-body">
                <Contrast className="w-4 h-4 text-stone-400" /> Modalità alto contrasto (sole forte)
              </span>
              <span
                className={`relative w-10 h-6 rounded-full transition-colors ${highContrastEnabled ? 'bg-forest-500' : 'bg-stone-300'}`}
                role="switch"
                aria-checked={highContrastEnabled}
                aria-label="Modalità alto contrasto per sole forte durante la navigazione"
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${highContrastEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </span>
            </button>
          </div>
        )}

        {tab === 'altimetria' && (
          <ElevationProfileChart trackPoints={trackPoints} currentDistanceM={currentDistanceM} />
        )}

        {tab === 'percorso' && (
          <div className="space-y-4">
            {remainingPois.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-stone-500 font-body mb-2 uppercase tracking-wide">Punti di interesse</div>
                <ul className="space-y-1.5">
                  {remainingPois.slice(0, 20).map((poi) => (
                    <li key={poi.id} className="flex items-center justify-between gap-2 py-1.5 border-b border-stone-100 text-sm">
                      <span className="flex items-center gap-1.5 text-stone-800 font-body truncate">
                        <MapPin className="w-3.5 h-3.5 text-terra-500 flex-shrink-0" /> {poi.name ?? 'Punto di interesse'}
                      </span>
                      <span className="text-stone-500 font-mono text-xs flex-shrink-0">{formatDistM(poi.distanceM)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {guideExcerpts.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-stone-500 font-body mb-2 uppercase tracking-wide flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" /> Dalla guida
                </div>
                <div className="space-y-2">
                  {guideExcerpts.map((text, i) => (
                    <div key={i} className="p-3 rounded-xl bg-terra-50 border-l-4 border-terra-400 text-sm text-stone-700 font-body italic">
                      {text}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {remainingPois.length === 0 && guideExcerpts.length === 0 && (
              <p className="text-sm text-stone-400 font-body py-6 text-center">Nessun punto di interesse o contenuto guida per questo percorso.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
