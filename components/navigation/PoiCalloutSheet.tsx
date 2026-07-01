'use client'
import { X, Volume2 } from 'lucide-react'
import { speak, isSpeechSupported } from '@/lib/navigation/speech'

interface Props {
  title: string
  extract?: string
  imageUrl?: string
  onClose: () => void
}

/**
 * Non-blocking bottom sheet shown when the hiker enters a POI's notify
 * radius, or when a route "moment" is reached. Deliberately simple (no
 * drag-to-resize) — unlike ExploreLayout's 3-state sheet, this one must not
 * demand attention while walking, so it only offers collapse (X) or listen.
 */
export default function PoiCalloutSheet({ title, extract, imageUrl, onClose }: Props) {
  const canSpeak = isSpeechSupported() && !!extract

  return (
    <div className="fixed inset-x-0 bottom-0 z-[1200] px-3 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-md rounded-t-2xl bg-[#fdfcfa] shadow-2xl border border-stone-200 overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          {imageUrl && (
            <img src={imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-bold font-display text-stone-900 truncate">{title}</div>
            {extract && <p className="text-sm text-stone-600 font-body mt-1 line-clamp-3">{extract}</p>}
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
