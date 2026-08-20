'use client'
import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { fetchWikiFullDetails, wikiSourceLabel, type WikiPage, type WikiFullDetails } from '@/lib/wikipedia'

interface Props {
  routeTitle: string
  wiki: WikiPage
  onClose: () => void
}

/**
 * Popup "Leggi tutto" aperto da una card di "Curiosità dai tuoi percorsi" in Home
 * (app/bacheca/page.tsx) — la card mostra solo l'incipit breve già in cache (WikiPage.extract,
 * arrivato gratis con l'arricchimento POI del percorso); il testo più lungo e le foto aggiuntive
 * si scaricano solo qui, alla prima apertura, per non appesantire il caricamento della Home con
 * dati che l'utente potrebbe non guardare mai.
 */
export default function CuriosityModal({ routeTitle, wiki, onClose }: Props) {
  const [details, setDetails] = useState<WikiFullDetails | null>(null)
  const [loading, setLoading] = useState(true)

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
          <img src={heroImage} alt="" className="w-full h-48 object-cover" />
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
                  {gallery.map(src => (
                    <img key={src} src={src} alt="" className="w-full aspect-square object-cover rounded-lg" />
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
    </div>
  )
}
