import { renderToStaticMarkup } from 'react-dom/server'
import {
  Eye, Hash, TrendingUp, Leaf, Star, TriangleAlert, MapPin, Image as ImageIcon,
  type LucideIcon,
} from 'lucide-react'
import type { InterludeKind } from '@/lib/videoInterludes'

/**
 * components/video/interludeIcons.tsx — le icone degli stacchi, in stile lucide come il resto
 * dell'app.
 *
 * Prima erano caratteri unicode scelti a occhio (◎ # △ ❦ ★ ! ◆). Due problemi: su Android quei
 * glifi cadono spesso su un ripiego generico del font di sistema — un rombo o un rettangolo vuoto,
 * che non dice niente — e comunque non appartenevano allo stesso alfabeto visivo dei segnaposto
 * dei luoghi (components/poiIcons.tsx), che sono icone a tratto. Due linguaggi diversi sulla
 * stessa mappa.
 *
 * Stesso schema di poiIcons.tsx, apposta: `renderToStaticMarkup` di un'icona lucide, perché sia i
 * divIcon di Leaflet sia i marker DOM di MapLibre accettano markup HTML e non componenti React.
 */

export const INTERLUDE_ICON: Record<InterludeKind, LucideIcon> = {
  visione: Eye,          // lo sguardo d'insieme sul percorso
  numeri:  Hash,         // distanza, tempo, quota
  profilo: TrendingUp,   // il profilo altimetrico
  natura:  Leaf,         // fascia vegetazionale e ambiente
  tei:     Star,         // il punteggio del percorso
  avvisi:  TriangleAlert,// chiusure e allerte
  luoghi:  MapPin,       // i luoghi principali
}

/** Markup SVG dell'icona di uno stacco, per un divIcon Leaflet o un marker DOM. */
export function interludeIconMarkup(kind: InterludeKind, sizePx = 15, color = '#ffffff'): string {
  const Icon = INTERLUDE_ICON[kind] ?? Hash
  return renderToStaticMarkup(
    <Icon width={sizePx} height={sizePx} color={color} strokeWidth={2.25} />,
  )
}

/** Markup SVG dell'icona usata per le foto sul percorso, nello stesso stile. */
export function photoIconMarkup(sizePx = 15, color = '#ffffff'): string {
  return renderToStaticMarkup(
    <ImageIcon width={sizePx} height={sizePx} color={color} strokeWidth={2.25} />,
  )
}
