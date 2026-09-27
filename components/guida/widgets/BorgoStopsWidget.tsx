'use client'
import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { SITE_TYPE_CONFIG } from '@/lib/metaTypes'
import type { BorgoWalkStop } from '@/lib/borgoWalkPolyline'
import StopSourceSheet, { type StopSourceSheetData } from './StopSourceSheet'

const PREVIEW_CHARS = 160

function truncateStopDescription(text: string): { preview: string; isTruncated: boolean } {
  if (text.length <= PREVIEW_CHARS) return { preview: text, isTruncated: false }
  const cut = text.slice(0, PREVIEW_CHARS)
  const lastSpace = cut.lastIndexOf(' ')
  return { preview: `${cut.slice(0, lastSpace > 0 ? lastSpace : PREVIEW_CHARS)}…`, isTruncated: true }
}

/**
 * "Luoghi visitati" per un Reportage di Borgo/Città — gli stessi stop dell'itinerario curato
 * mostrati in Guida da BorgoTappeWidget (mai una query Overpass generica come per un Sentiero),
 * già filtrati per prossimità reale alla traccia di QUESTA uscita (activity.borgoStops, vedi
 * lib/borgoWalkPolyline.ts's visitedBorgoStops). Sola lettura, retrospettiva: nessuna tab per
 * tappa, nessuno slider, nessuna promozione a Guida — quella personalizzazione appartiene alla
 * pianificazione, non al racconto di ciò che è già stato fatto.
 */
export default function BorgoStopsWidget({ stops }: { stops: BorgoWalkStop[] }) {
  const [openStopId, setOpenStopId] = useState<string | null>(null)

  if (stops.length === 0) return null

  const openStop = stops.find(s => s.id === openStopId)
  const sheetData: StopSourceSheetData | null = openStop ? {
    name: openStop.name,
    description: openStop.description,
    thumbnail: openStop.thumbnail,
    url: openStop.url,
    sourceLabel: 'su Wikipedia',
  } : null

  return (
    <div className="flex flex-col">
      {stops.map((stop, i) => {
        const desc = stop.description
        const { preview, isTruncated } = desc ? truncateStopDescription(desc) : { preview: '', isTruncated: false }
        const isLast = i === stops.length - 1
        return (
          <div key={stop.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="w-6 h-6 shrink-0 rounded-full bg-terra-600 text-white font-barlow font-bold text-xs flex items-center justify-center">
                {i + 1}
              </span>
              {!isLast && <span className="w-px flex-1 bg-terra-100 my-1" />}
            </div>
            <div className={`flex-1 min-w-0 ${!isLast ? 'pb-4' : ''}`}>
              <div className="flex gap-2.5 items-start">
                {stop.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element -- provenienza esterna (Wikipedia/archivio), non un asset ottimizzabile
                  <img
                    src={stop.thumbnail}
                    alt=""
                    className="w-11 h-11 rounded-lg object-cover shrink-0"
                    onError={e => { e.currentTarget.style.display = 'none' }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[13.5px] text-stone-800 leading-tight">
                    {stop.name}
                    {stop.siteType && (
                      <span className="ml-1.5 font-normal text-[10.5px] text-stone-400">
                        · {SITE_TYPE_CONFIG[stop.siteType]?.label ?? stop.siteType}
                      </span>
                    )}
                  </p>
                  {desc && (
                    <p className="text-[12px] text-stone-500 leading-snug mt-0.5">{preview}</p>
                  )}
                  {(isTruncated || stop.url) && (
                    <button
                      type="button"
                      onClick={() => setOpenStopId(stop.id)}
                      className="inline-flex items-center gap-0.5 mt-1 text-[12px] font-semibold text-terra-600 hover:text-terra-700 whitespace-nowrap"
                    >
                      {isTruncated ? 'Leggi tutto' : 'Fonte'} <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
      {sheetData && <StopSourceSheet data={sheetData} onClose={() => setOpenStopId(null)} />}
    </div>
  )
}
