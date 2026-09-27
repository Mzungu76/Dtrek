import { Palette } from 'lucide-react'
import type { MuseumOpera } from '@/lib/museumOpere'

interface Props {
  opere: MuseumOpera[]
}

/**
 * "Opere di questo museo" (docs/opere-musei-wikidata.md) — da Wikidata (P195/P276), con cache su
 * dtrek_places (lib/museumOpere.ts). Silenzioso (null) quando vuoto — quasi sempre il caso per un
 * museo locale/tematico (atteso: "opere d'arte catalogate" non è pertinente per la maggioranza dei
 * musei già in Dtrek), mai un riquadro vuoto o un placeholder di caricamento: i dati arrivano già
 * risolti dentro placeDetail (stesso principio di RelatedPlacesWidget).
 */
export default function OpereMuseoWidget({ opere }: Props) {
  if (opere.length === 0) return null

  return (
    <div className="px-5 sm:px-8 md:px-10 py-4 border-b border-stone-200">
      <p className="flex items-center gap-1.5 font-barlow font-bold uppercase tracking-wide text-[10px] text-stone-400 mb-3">
        <Palette className="w-3 h-3" /> Opere di questo museo
      </p>
      <div data-hscroll className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
        {opere.map(opera => (
          <a
            key={opera.wikidataId}
            href={`https://www.wikidata.org/wiki/${opera.wikidataId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 w-32 rounded-xl border border-stone-200 overflow-hidden hover:border-terra-300 transition-colors"
          >
            {opera.image ? (
              // Fonte esterna (Wikimedia Commons, URL arbitrario per opera) — non ottimizzabile da next/image senza un domain allowlist dedicato.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={opera.image} alt={opera.title} className="w-32 h-24 object-cover" loading="lazy" />
            ) : (
              <div className="w-32 h-24 bg-stone-100 flex items-center justify-center">
                <Palette className="w-5 h-5 text-stone-300" />
              </div>
            )}
            <div className="px-2 py-1.5">
              <p className="font-semibold text-[12px] text-stone-800 leading-snug line-clamp-2">{opera.title}</p>
              {(opera.creator || opera.year) && (
                <p className="text-[10px] text-stone-500 mt-0.5 line-clamp-1">
                  {[opera.creator, opera.year].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
