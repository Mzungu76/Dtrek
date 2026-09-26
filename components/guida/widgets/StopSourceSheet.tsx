'use client'

import { useEffect, useState } from 'react'
import { X, ExternalLink, ChevronRight } from 'lucide-react'
import SitoInfoWidget from './SitoInfoWidget'
import type { PlaceDetail } from '@/app/api/places/[id]/route'

export interface StopSourceSheetData {
  name: string
  description?: string
  thumbnail?: string
  url?: string
  sourceLabel: string
  /** dtrek_places.id collegato — solo una tappa 'archivio' ce l'ha (verifica utente 2026-09-28:
   *  consolidamento con l'anteprima di SiteGuideOverlay, prima un componente separato quasi
   *  identico). Abilita una foto migliore di data.thumbnail e i dati pratici reali via
   *  SitoInfoWidget, quando presente. */
  placeId?: string
  /** id della planned_hikes Guida già creata per questa tappa, se esiste — abilita "Apri come
   *  Guida completa" in fondo al foglio. */
  siteGuideId?: string
}

/**
 * Pagina di lettura in-app per una tappa — verifica utente: prima "Fonte" apriva subito Wikipedia
 * in un'altra scheda del browser, ora resta un tap "dentro l'app" a leggibilità piena (stesso
 * testo esteso già in stop.description, solo senza il ritaglio della timeline compatta). Il link
 * esterno vero resta disponibile, ma solo come azione esplicita e secondaria in fondo — mai la
 * destinazione di default del tap, stesso principio già applicato in GuideGalleryLightbox.
 *
 * Consolidato con quella che era l'anteprima compatta di SiteGuideOverlay.tsx (piano §51.4,
 * verifica utente 2026-09-28: "le differenze sono talmente poche da non giustificare l'esistenza
 * di entrambe") — un solo foglio, con foto/dati pratici quando la tappa ha un Sito collegato
 * (placeId) e "Apri come Guida completa" quando quel Sito ha già una Guida (siteGuideId).
 * SiteGuideOverlay ora fa solo la Guida completa vera e propria.
 */
export default function StopSourceSheet({
  data, onClose, onOpenSiteGuide,
}: {
  data: StopSourceSheetData
  onClose: () => void
  /** Assente per un chiamante che non gestisce mai una Guida di Sito — in quel caso data.siteGuideId
   *  è comunque sempre undefined, quindi il bottone non compare. */
  onOpenSiteGuide?: (siteId: string) => void
}) {
  const [placeDetail, setPlaceDetail] = useState<PlaceDetail | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    setPlaceDetail(null)
    if (!data.placeId) return
    let cancelled = false
    fetch(`/api/places/${data.placeId}`)
      .then(res => res.ok ? res.json() : null)
      .then(d => { if (!cancelled && d) setPlaceDetail(d as PlaceDetail) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [data.placeId])

  // Foto dell'archivio (dtrek_places, via placeDetail) è quasi sempre migliore della thumbnail
  // leggera della tappa (geosearch Wikipedia) — usata solo come ripiego quando manca.
  const imageUrl = placeDetail?.imageUrl ?? data.thumbnail

  return (
    <div className="fixed inset-0 z-[95] bg-black/50 flex items-end sm:items-center justify-center print:hidden" onClick={onClose}>
      <div
        className="w-full sm:max-w-lg sm:rounded-2xl bg-white max-h-[85vh] flex flex-col overflow-hidden rounded-t-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative shrink-0">
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- foto hotlinkata dalla fonte, mai copiata sui nostri server
            <img src={imageUrl} alt="" className="w-full h-40 object-cover" />
          )}
          <div className={`flex items-start justify-between gap-3 px-5 ${imageUrl ? 'pt-3' : 'pt-4'}`}>
            <h3 className="font-display text-lg font-semibold text-stone-800 leading-tight">{data.name}</h3>
            <button onClick={onClose} className="text-stone-400 hover:text-stone-600 shrink-0" aria-label="Chiudi">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {placeDetail && (
          <SitoInfoWidget
            openingHours={typeof placeDetail.openingHours === 'string' ? placeDetail.openingHours : null}
            officialLink={placeDetail.officialUrl ?? placeDetail.website ?? null}
            wikipediaUrl={placeDetail.wikipedia?.url}
            address={placeDetail.address}
            phone={placeDetail.phone}
            email={placeDetail.email}
          />
        )}

        <div className="overflow-y-auto px-5 pb-5 pt-3">
          <p className="text-[14px] text-stone-600 leading-relaxed whitespace-pre-line">{data.description}</p>
          {data.url && (
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-stone-400 hover:text-stone-600 transition-colors"
            >
              Apri {data.sourceLabel} <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {data.siteGuideId && onOpenSiteGuide && (
          <div className="shrink-0 border-t border-stone-200 px-5 py-3">
            <button
              onClick={() => { onOpenSiteGuide(data.siteGuideId!); onClose() }}
              className="w-full flex items-center justify-center gap-1.5 text-[13px] font-bold text-terra-700 hover:text-terra-800 py-1.5"
            >
              Apri come Guida completa <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
