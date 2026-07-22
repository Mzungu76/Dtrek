// Icona compatta per un singolo POI (nome sotto) o per un gruppo di POI dello stesso tipo (contatore
// sopra) — estratto da components/guida/widgets/PoiListWidget.tsx perché lo stesso metodo grafico
// serve anche per l'anteprima POI nelle schede risultato del route builder
// (components/upload/RouteBuilder.tsx): stessa resa, nessuna duplicazione.
import type { PoiItem, PoiType } from '@/lib/overpass'
import { POI_META } from '@/lib/overpass'
import { POI_ICON } from '@/components/poiIcons'

export function NamedPoiIcon({ poi, highlighted, onTap }: { poi: PoiItem; highlighted: boolean; onTap?: () => void }) {
  const Icon = POI_ICON[poi.type]
  const meta = POI_META[poi.type]
  return (
    <button
      onClick={onTap}
      className="flex flex-col shrink-0 self-start items-center w-16 gap-1.5 group"
    >
      <span
        className="flex items-center justify-center w-[38px] h-[38px] rounded-full shadow-sm shrink-0 transition-transform group-hover:scale-105"
        style={{ backgroundColor: meta.color, boxShadow: highlighted ? '0 0 0 3px #7dd3fc' : undefined }}
      >
        <Icon width={16} height={16} color="#fff" strokeWidth={2.25} />
      </span>
      <span className="text-[10px] leading-tight text-center text-stone-700 font-semibold line-clamp-2">
        {poi.name}
      </span>
    </button>
  )
}

export function GroupPoiBadge({
  type, pois, onTap,
}: { type: PoiType; pois: PoiItem[]; onTap?: () => void }) {
  const Icon = POI_ICON[type]
  const meta = POI_META[type]
  return (
    <button onClick={onTap} title={`${meta.label} × ${pois.length}`} className="relative self-start shrink-0 w-[38px] h-[38px] transition-transform active:scale-95">
      <span
        className="flex items-center justify-center w-[38px] h-[38px] rounded-full shadow-sm"
        style={{ backgroundColor: meta.color }}
      >
        <Icon width={16} height={16} color="#fff" strokeWidth={2.25} />
      </span>
      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-forest-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-sm">
        {pois.length}
      </span>
    </button>
  )
}
