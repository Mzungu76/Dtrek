import Link from 'next/link'
import { MapPin } from 'lucide-react'
import { META_TYPE_CONFIG, SITE_TYPE_CONFIG, isSiteType } from '@/lib/metaTypes'
import type { RelatedPlace } from '@/lib/metaSearch/placeRelations'

interface Props {
  places: RelatedPlace[]
}

/**
 * "Vicino a te" per la Guida di un Sito AUTONOMO (piano §51.6) — da dtrek_place_relations
 * (part_of/located_in/near), oggi quasi sempre vuoto finché quei dati non vengono importati
 * (lib/metaSearch/placeRelations.ts). Silenzioso (null) finché lo è — mai un riquadro vuoto.
 * Apre la SCHEDA del luogo (/mete/[id]), non una Guida: un posto correlato non ha
 * necessariamente una Guida propria ancora.
 */
export default function RelatedPlacesWidget({ places }: Props) {
  if (places.length === 0) return null

  return (
    <div className="px-5 sm:px-8 md:px-10 py-4 border-b border-stone-200">
      <p className="flex items-center gap-1.5 font-barlow font-bold uppercase tracking-wide text-[10px] text-stone-400 mb-3">
        <MapPin className="w-3 h-3" /> Vicino a te
      </p>
      <div data-hscroll className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
        {places.map(p => {
          const Icon = isSiteType(p.subtype) ? SITE_TYPE_CONFIG[p.subtype].icon : META_TYPE_CONFIG[p.metaType].icon
          return (
            <Link
              key={p.id}
              href={`/mete/${encodeURIComponent(p.id)}`}
              className="shrink-0 w-32 rounded-xl border border-stone-200 px-3 py-2.5 hover:border-terra-300 transition-colors"
            >
              <Icon className="w-4 h-4 text-terra-600 mb-1.5" />
              <p className="font-semibold text-[12px] text-stone-800 leading-snug line-clamp-2">{p.name}</p>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
