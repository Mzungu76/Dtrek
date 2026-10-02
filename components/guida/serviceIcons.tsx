import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  Droplets, Utensils, Coffee, ShoppingBasket, Croissant, BedDouble, Tent, Footprints, Bus, TrainFront, Pill, type LucideIcon,
} from 'lucide-react'
import { SERVICE_META, type ServiceCategory, type ServiceItem } from '@/lib/cammini/services'

// Icone dedicate dei servizi di un cammino: un riquadro arrotondato (i luoghi di interesse sono tondi) con l'icona del tipo
// di servizio, non un punto. Tratteggiato = dato OpenStreetMap non verificato.

export const SERVICE_STYLE: Record<ServiceCategory, { Icon: LucideIcon; color: string }> = {
  water: { Icon: Droplets, color: '#0284c7' },
  food: { Icon: Utensils, color: '#ea580c' },
  shop: { Icon: ShoppingBasket, color: '#15803d' },
  lodging: { Icon: BedDouble, color: '#7e22ce' },
  transport: { Icon: Bus, color: '#334155' },
  pharmacy: { Icon: Pill, color: '#dc2626' },
}

/** Icona più precisa del tipo di servizio quando c'è (bar, panetteria, campeggio, ostello del pellegrino, stazione). */
export function serviceIconFor(s: Pick<ServiceItem, 'category' | 'kind'>): LucideIcon {
  switch (s.kind) {
    case 'Bar/caffè': case 'Bar': case 'Gelateria': return Coffee
    case 'Panetteria': return Croissant
    case 'Campeggio': case 'Bivacco': case 'Area camper': return Tent
    case 'Ostello del pellegrino': return Footprints
    case 'Stazione': return TrainFront
    default: return SERVICE_STYLE[s.category].Icon
  }
}

export const CONFIDENCE_LABEL: Record<ServiceItem['confidence'], string> = {
  alta: 'Controllato di recente',
  media: 'Dati parziali',
  bassa: 'Non verificato',
}

/** Riquadro-icona (stringa HTML) per un marker Leaflet/MapLibre. */
export function serviceBadgeMarkup(s: ServiceItem, sizePx = 30): string {
  const Icon = serviceIconFor(s)
  const svg = renderToStaticMarkup(createElement(Icon, { width: Math.round(sizePx * 0.58), height: Math.round(sizePx * 0.58), color: '#ffffff', strokeWidth: 2.25 }))
  const border = s.confidence === 'bassa' ? '2px dashed rgba(255,255,255,0.95)' : '2px solid #ffffff'
  return `<div style="width:${sizePx}px;height:${sizePx}px;border-radius:9px;background:${SERVICE_STYLE[s.category].color};display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.5);border:${border}">${svg}</div>`
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`)

/** Scheda del servizio (HTML per il popup della mappa). Nomi e testi vengono da OpenStreetMap: sempre escapati. */
export function servicePopupHtml(s: ServiceItem): string {
  const lines = [
    `<div style="font:700 13px sans-serif;margin-bottom:2px">${esc(s.name ?? s.kind)}</div>`,
    `<div style="font:12px sans-serif;color:#57534e">${esc(SERVICE_META[s.category].label)} · ${esc(s.kind)}${s.distFromTrack != null ? ` · a ${s.distFromTrack} m dal sentiero` : ''}</div>`,
    s.openingHours ? `<div style="font:12px sans-serif;margin-top:4px">Orari: ${esc(s.openingHours)}</div>` : '',
    s.phone ? `<div style="font:12px sans-serif">Tel. <a href="tel:${esc(s.phone.replace(/[^\d+]/g, ''))}">${esc(s.phone)}</a></div>` : '',
    s.website ? `<div style="font:12px sans-serif"><a href="${esc(safeUrl(s.website))}" target="_blank" rel="noopener noreferrer">Sito</a></div>` : '',
    `<div style="font:11px sans-serif;color:#a8a29e;margin-top:4px">${esc(CONFIDENCE_LABEL[s.confidence])}${s.checkDate ? ` (${esc(s.checkDate)})` : ''} · OpenStreetMap: non garantisce che sia aperto oggi</div>`,
  ]
  return lines.join('')
}
