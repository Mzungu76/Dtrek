'use client'
import { useEffect, useRef, useState } from 'react'
import { X, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { fetchWikiFullDetails, wikiSourceLabel, type WikiPage, type WikiFullDetails } from '@/lib/wikipedia'

interface Props {
  routeTitle: string
  wiki: WikiPage
  onClose: () => void
}

// Soglia di trascinamento (px) oltre cui uno swipe conta come "cambia foto" invece che un tocco
// accidentale — stesso ordine di grandezza di altri gesti a soglia già nell'app (RouteHub.tsx).
const SWIPE_THRESHOLD_PX = 40

/** Carosello a schermo intero per le foto del popup "Leggi tutto" — apre sulla foto toccata (copertina
 *  o una della galleria), poi scorre avanti/indietro con le frecce o con lo swipe. Sopra il popup
 *  stesso (z-index più alto), mai annidato dentro il suo overflow-y-auto. */
function PhotoCarousel({ photos, startIndex, onClose }: { photos: string[]; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex)
  const touchStartX = useRef<number | null>(null)

  const prev = () => setIndex(i => (i - 1 + photos.length) % photos.length)
  const next = () => setIndex(i => (i + 1) % photos.length)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="fixed inset-0 z-[1400] bg-black/95 flex items-center justify-center"
      onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        if (touchStartX.current == null) return
        const delta = e.changedTouches[0].clientX - touchStartX.current
        if (delta > SWIPE_THRESHOLD_PX) prev()
        else if (delta < -SWIPE_THRESHOLD_PX) next()
        touchStartX.current = null
      }}
    >
      <button
        onClick={onClose}
        aria-label="Chiudi"
        className="absolute top-3 right-3 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <X className="w-5 h-5" />
      </button>

      {photos.length > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="Foto precedente"
            className="absolute left-2 sm:left-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={next}
            aria-label="Foto successiva"
            className="absolute right-2 sm:right-4 z-10 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      <img src={photos[index]} alt="" className="max-w-full max-h-full object-contain" />

      {photos.length > 1 && (
        <div className="absolute bottom-4 left-0 right-0 text-center text-white/70 text-[12px] font-medium">
          {index + 1} / {photos.length}
        </div>
      )}
    </div>
  )
}

/**
 * Popup "Leggi tutto" aperto da una card di "Info dai tuoi percorsi" in Home
 * (app/bacheca/page.tsx) — la card mostra solo l'incipit breve già in cache (WikiPage.extract,
 * arrivato gratis con l'arricchimento POI del percorso); il testo più lungo e le foto aggiuntive
 * si scaricano solo qui, alla prima apertura, per non appesantire il caricamento della Home con
 * dati che l'utente potrebbe non guardare mai. Ogni foto (copertina o galleria) è cliccabile e
 * apre PhotoCarousel sopra, sulla foto toccata, scorribile fino alle altre.
 */
export default function CuriosityModal({ routeTitle, wiki, onClose }: Props) {
  const [details, setDetails] = useState<WikiFullDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [carouselIndex, setCarouselIndex] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setDetails(null)
    setLoading(true)
    fetchWikiFullDetails(wiki)
      .then(d => { if (!cancelled) setDetails(d) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wiki.pageid, wiki.url])

  const heroImage = wiki.thumbnail ?? details?.images[0]
  // Nessun duplicato dell'immagine già usata come copertina in cima al popup.
  const gallery = (details?.images ?? []).filter(src => src !== heroImage)
  // Stesso ordine in cui compaiono nel popup (copertina prima, poi la griglia) — l'indice del
  // carosello deve corrispondere esattamente a questo array, non a `gallery` da solo.
  const allPhotos = heroImage ? [heroImage, ...gallery] : gallery

  return (
    <div className="fixed inset-0 z-[1300] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-md max-h-[85vh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-y-auto">
        <button
          onClick={onClose}
          aria-label="Chiudi"
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/40 text-white hover:bg-black/60"
        >
          <X className="w-4 h-4" />
        </button>

        {heroImage && (
          <button onClick={() => setCarouselIndex(0)} className="block w-full">
            <img src={heroImage} alt="" className="w-full h-48 object-cover" />
          </button>
        )}

        <div className="p-5">
          <p className="font-barlow font-extrabold text-[10.5px] tracking-[1.5px] uppercase text-terra-500 mb-1">
            {routeTitle}
          </p>
          <h2 className="font-display font-bold text-[20px] text-stone-900 leading-snug">{wiki.title}</h2>
          {wiki.description && (
            <p className="text-[12.5px] text-stone-400 mt-0.5">{wiki.description}</p>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-stone-400 text-sm py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Caricamento…
            </div>
          ) : (
            <>
              <p className="text-[13.5px] text-stone-700 leading-relaxed mt-3 whitespace-pre-line">
                {details?.extract ?? wiki.extract}
              </p>

              {gallery.length > 0 && (
                <div className="grid grid-cols-3 gap-1.5 mt-4">
                  {gallery.map((src, i) => (
                    <button key={src} onClick={() => setCarouselIndex((heroImage ? 1 : 0) + i)}>
                      <img src={src} alt="" className="w-full aspect-square object-cover rounded-lg" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <a
            href={wiki.url} target="_blank" rel="noopener noreferrer"
            className="inline-block text-[11.5px] font-medium text-stone-400 hover:text-stone-500 mt-5"
          >
            Fonte: {wikiSourceLabel(wiki.source)} →
          </a>
        </div>
      </div>

      {carouselIndex !== null && (
        <PhotoCarousel photos={allPhotos} startIndex={carouselIndex} onClose={() => setCarouselIndex(null)} />
      )}
    </div>
  )
}
