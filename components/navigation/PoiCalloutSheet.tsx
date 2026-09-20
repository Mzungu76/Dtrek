'use client'
import { useEffect, useState } from 'react'
import { X, Volume2 } from 'lucide-react'
import { speak, isSpeechSupported } from '@/lib/navigation/speech'

interface Props {
  title: string
  extract?: string
  imageUrl?: string
  onClose: () => void
}

// Sopra questa lunghezza il testo non ci sta comunque in 3 righe clampate — sotto, mostrare
// "Leggi tutto" sarebbe un pulsante che non fa nulla di visibile (il clamp non taglia mai un
// testo già così corto). Non una misura esatta del layout, solo una soglia ragionevole per non
// mostrare l'azione a vuoto.
const COLLAPSE_THRESHOLD_CHARS = 180

/**
 * Non-blocking bottom sheet shown when the hiker enters a POI's notify
 * radius, or when a route "moment" is reached. Deliberately simple (no
 * drag-to-resize) — unlike ExploreLayout's 3-state sheet, this one must not
 * demand attention while walking, so by default it only offers collapse (X)
 * or listen.
 *
 * `extract` here is already the richest text available for this POI (the
 * curated ~200-word note from the pre-hike AI guide when one exists —
 * usePoiNotes.ts, cached for offline use — falling back to the short
 * Wikipedia incipit otherwise; see ActiveNavigationView.tsx's `note ?? wiki?.extract`).
 * Previously always clamped to 3 lines with no way to see the rest, even
 * though the fuller text was already sitting in memory/offline cache and
 * costs nothing to show — "Leggi tutto" just lifts the clamp, no new fetch.
 */
export default function PoiCalloutSheet({ title, extract, imageUrl, onClose }: Props) {
  const [expanded, setExpanded] = useState(false)
  // Un nuovo POI/momento non deve ereditare lo stato "espanso" di quello precedente — questo
  // componente può restare montato invariato tra un callout e il successivo (vedi
  // ActiveNavigationView.tsx: `{callout && <PoiCalloutSheet .../>}`, non rimontato a ogni cambio).
  useEffect(() => { setExpanded(false) }, [title])

  const canSpeak = isSpeechSupported() && !!extract
  const isLong = !!extract && extract.length > COLLAPSE_THRESHOLD_CHARS

  return (
    <div className="fixed inset-x-0 bottom-0 z-[1200] px-3 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-md rounded-t-2xl bg-[#fdfcfa] shadow-2xl border border-stone-200 overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          {imageUrl && (
            <img src={imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-bold font-display text-stone-900 truncate">{title}</div>
            {extract && (
              <p
                className={`text-sm text-stone-600 font-body mt-1 whitespace-pre-line ${
                  expanded ? 'max-h-[42vh] overflow-y-auto pr-1' : 'line-clamp-3'
                }`}
              >
                {extract}
              </p>
            )}
            {isLong && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 text-xs font-bold text-forest-700 underline decoration-forest-300 underline-offset-2"
              >
                {expanded ? 'Mostra meno' : 'Leggi tutto'}
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            {canSpeak && (
              <button
                onClick={() => speak(`${title}. ${extract}`)}
                className="p-2 rounded-full bg-forest-50 text-forest-600 hover:bg-forest-100"
                aria-label="Ascolta"
              >
                <Volume2 size={18} />
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200" aria-label="Chiudi">
              <X size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
