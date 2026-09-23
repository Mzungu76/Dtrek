import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Image as ImageIcon } from 'lucide-react'
import type { RoutePhoto } from '@/app/lib/guide/fetchRoutePhotos'
import type { SiteType } from '@/lib/metaTypes'
import GuideGalleryLightbox, { type GuideGalleryItem } from './GuideGalleryLightbox'

// Avviso GENERICO di categoria, non una segnalazione su QUESTA Meta specifica (quella resta a
// "Verificato online", l'unica sezione con una ricerca AI mirata) — una proprietà tipica del tipo
// di luogo, non un fatto verificato per questo posto preciso. Assente per i tipi dove un avviso
// generico non aggiungerebbe nulla di specifico.
const CATEGORY_CAUTION: Partial<Record<SiteType, string>> = {
  cascata: 'Le zone vicine al salto sono spesso bagnate e scivolose — occhio all\'appoggio, specie con maltempo recente.',
  grotta: 'Terreno umido e irregolare, luce scarsa — servono spesso scarpe adatte e, in alcuni casi, una guida.',
  belvedere: 'Parapetti e dislivelli: attenzione se soffri di vertigini o sei con bambini piccoli.',
}

interface Props {
  lat: number
  lon: number
  siteType?: SiteType
}

/** Galleria fotografica per un Sito famiglia 'galleria_sicurezza' (lib/guideCardVariant.ts) —
 *  riusa app/lib/guide/fetchRoutePhotos.ts (Wikimedia Commons, già in produzione per il mosaico
 *  foto di un Sentiero), qui con un raggio stretto attorno alla Meta stessa invece del punto medio
 *  di una traccia. L'avviso di sicurezza è generico per tipologia (CATEGORY_CAUTION sopra), non
 *  una segnalazione verificata su questo luogo preciso — quella resta "Verificato online". */
export default function SitoGalleryWidget({ lat, lon, siteType }: Props) {
  const [photos, setPhotos] = useState<RoutePhoto[]>([])
  useEffect(() => {
    let cancelled = false
    import('@/app/lib/guide/fetchRoutePhotos').then(({ fetchRoutePhotos }) => fetchRoutePhotos(lat, lon, 1500, 6))
      .then(found => { if (!cancelled) setPhotos(found) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [lat, lon])

  const caution = siteType ? CATEGORY_CAUTION[siteType] : undefined
  // Verifica utente: il tap qui apriva subito il file immagine su un'altra scheda invece di
  // ingrandirlo dentro l'app, come la stessa galleria nei Reportage — stesso GuideGalleryLightbox
  // già usato in components/guida/GuideReader.tsx per la Galleria fotografica di fondo pagina.
  const galleryItems = useMemo<GuideGalleryItem[]>(
    () => photos.map(p => ({ imageUrl: p.url, title: p.title, sourceUrl: p.url, sourceLabel: p.credit })),
    [photos],
  )
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  if (photos.length === 0 && !caution) return null

  return (
    <div className="flex flex-col gap-3">
      {photos.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 font-barlow font-bold uppercase tracking-wide text-[10px] text-stone-400 mb-2">
            <ImageIcon className="w-3 h-3" /> Galleria
          </p>
          <div data-hscroll className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {photos.map((p, i) => (
              <button key={p.url} type="button" onClick={() => setLightboxIndex(i)} className="shrink-0 w-24 text-left">
                {/* eslint-disable-next-line @next/next/no-img-element -- foto esterna (Wikimedia Commons), non un asset ottimizzabile */}
                <img src={p.url} alt={p.title} className="w-24 h-24 rounded-xl object-cover" />
                <p className="text-[9.5px] text-stone-400 mt-1 truncate">{p.credit}</p>
              </button>
            ))}
          </div>
          {lightboxIndex != null && (
            <GuideGalleryLightbox
              items={galleryItems}
              index={lightboxIndex}
              onNavigate={setLightboxIndex}
              onClose={() => setLightboxIndex(null)}
            />
          )}
        </div>
      )}
      {caution && (
        <div className="flex gap-2.5 items-start bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-[12.5px] text-amber-900 leading-snug">{caution}</p>
        </div>
      )}
    </div>
  )
}
