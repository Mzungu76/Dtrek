// Icona compatta per un singolo POI (nome sotto) o per un gruppo di POI dello stesso tipo (contatore
// sopra) — estratto da components/guida/widgets/PoiListWidget.tsx perché lo stesso metodo grafico
// serve anche per l'anteprima POI nelle schede risultato del route builder
// (components/upload/RouteBuilder.tsx): stessa resa, nessuna duplicazione.
import type { PoiItem, PoiType } from '@/lib/overpass'
import { POI_META } from '@/lib/overpass'
import { POI_ICON } from '@/components/poiIcons'

/** Attenuazione applicata quando un ALTRO POI è evidenziato (colpo d'occhio su un solo POI alla
 *  volta, sia in mappa che nella galleria — vedi PoiMap.tsx e PoiListWidget.tsx). */
const dimmedClass = 'opacity-35 grayscale transition-opacity'

// Sfondo neutro + icona a tratto nel colore del tipo (non più un cerchio pieno colorato): sulla
// mappa poco sotto ogni tipo ha ancora il suo colore pieno (poiBadgeMarkup, dove serve distinguere
// tanti pin sparsi a colpo d'occhio), ma nella riga di chip qui una fila di cerchi tutti diversi
// diventava rumore — il colore resta solo nell'icona, il resto torna neutro.

export function NamedPoiIcon({ poi, highlighted, dimmed, onTap }: { poi: PoiItem; highlighted: boolean; dimmed?: boolean; onTap?: () => void }) {
  const Icon = POI_ICON[poi.type]
  const meta = POI_META[poi.type]
  return (
    <button
      onClick={onTap}
      className={`flex flex-col shrink-0 self-start items-center w-16 gap-1.5 group ${dimmed ? dimmedClass : ''}`}
    >
      <span
        className="flex items-center justify-center w-[38px] h-[38px] rounded-full bg-stone-100 shrink-0 transition-transform group-hover:scale-105"
        style={{ boxShadow: highlighted ? '0 0 0 3px #7dd3fc' : undefined }}
      >
        <Icon width={17} height={17} color={meta.color} strokeWidth={2.25} />
      </span>
      <span className="text-[10px] leading-tight text-center text-stone-700 font-semibold line-clamp-2">
        {poi.name}
      </span>
    </button>
  )
}

export function GroupPoiBadge({
  type, pois, highlighted, dimmed, onTap,
}: { type: PoiType; pois: PoiItem[]; highlighted?: boolean; dimmed?: boolean; onTap?: () => void }) {
  const Icon = POI_ICON[type]
  const meta = POI_META[type]
  return (
    <button
      onClick={onTap}
      title={`${meta.label} × ${pois.length}`}
      className={`flex flex-col shrink-0 self-start items-center w-16 gap-1.5 transition-transform active:scale-95 ${dimmed ? dimmedClass : ''}`}
    >
      <span className="relative w-[38px] h-[38px]">
        <span
          className="flex items-center justify-center w-[38px] h-[38px] rounded-full bg-stone-100"
          style={{ boxShadow: highlighted ? '0 0 0 3px #7dd3fc' : undefined }}
        >
          <Icon width={17} height={17} color={meta.color} strokeWidth={2.25} />
        </span>
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-terra-700 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-sm">
          {pois.length}
        </span>
      </span>
      <span className="text-[10px] leading-tight text-center text-stone-700 font-semibold line-clamp-2">
        {meta.label}
      </span>
    </button>
  )
}
