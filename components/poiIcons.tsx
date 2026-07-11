import { renderToStaticMarkup } from 'react-dom/server'
import {
  Mountain, Home, Tent, Droplet, Eye, Plus, Milestone, Waves, CircleDot,
  Landmark, Waypoints, Castle, Droplets, Armchair, Church, UtensilsCrossed,
  TowerControl, Award, type LucideIcon,
} from 'lucide-react'
import type { PoiType } from '@/lib/overpass'

export const POI_ICON: Record<PoiType, LucideIcon> = {
  peak: Mountain,
  hut: Home,
  bivouac: Tent,
  spring: Droplet,
  viewpoint: Eye,
  cross: Plus,
  pass: Milestone,
  waterfall: Waves,
  cave: CircleDot,
  shelter: Tent,
  ruins: Landmark,
  bridge: Waypoints,
  archaeological: Landmark,
  castle: Castle,
  fountain: Droplets,
  bench: Armchair,
  chapel: Church,
  picnic: UtensilsCrossed,
  tower: TowerControl,
  monument: Award,
}

/** Markup SVG (stringa) dell'icona associata a un tipo di POI — sostituisce l'emoji nativa (resa
 *  in modo incoerente tra piattaforme/browser) con un'icona a tratto in stile lucide, coerente
 *  col resto dell'app. Usata sia dai marker Leaflet (divIcon) sia dai marker DOM MapLibre della
 *  mappa 3D — entrambi accettano semplice markup HTML/SVG per il contenuto del marker. */
export function poiIconMarkup(type: PoiType, sizePx = 15, color = '#ffffff'): string {
  const Icon = POI_ICON[type] ?? Mountain
  return renderToStaticMarkup(
    <Icon width={sizePx} height={sizePx} color={color} strokeWidth={2.25} />,
  )
}

/** Badge completo (cerchio colorato + icona) come stringa HTML, pronto per un divIcon/marker. */
export function poiBadgeMarkup(type: PoiType, color: string, sizePx: number, shadowBlur = 2): string {
  return `<div style="width:${sizePx}px;height:${sizePx}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;box-shadow:0 1px ${shadowBlur}px rgba(0,0,0,0.45);border:2px solid white">${poiIconMarkup(type, Math.round(sizePx * 0.52))}</div>`
}
