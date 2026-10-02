import { haversineM, bearingDeg } from '@/lib/geoUtils'
import type { EscapeOption, EscapeSafety } from '@/lib/navigation/escapeEngine'
import type { ServiceItem } from './services'
import { SERVICE_META } from './services'
import { placeServices, type PlacedService } from './serviceGaps'

// Vie d'uscita per un cammino (docs/piano-cammini.md, Fase E): oltre a tornare sul sentiero, dove dormire, come
// andarsene (bus/treno) e dove accorciare la tappa. Si aggiungono alle opzioni del Navigator, mai al posto loro.
// Distanze in linea d'aria o lungo la traccia, dichiarate come tali; OSM non dice se un servizio è aperto adesso.

const MAX_DIRECT_M = 5000
const MAX_OFF_ROUTE_SHORTEN_M = 800
const MIN_SHORTEN_AHEAD_M = 500

export interface CamminoEscapeInput {
  services: ServiceItem[]
  routePolyline: [number, number][]
  currentLat: number
  currentLon: number
  /** Posizione lungo la tappa e lunghezza secondo il motore di navigazione. */
  alongM: number
  totalM: number
}

const km = (m: number) => (m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`)
const safetyFor = (m: number): EscapeSafety => (m <= 1500 ? 'alta' : m <= 3500 ? 'media' : 'bassa')
const nameOf = (s: ServiceItem) => s.name ?? s.kind
const caveat = (s: ServiceItem) => (s.confidence === 'alta' ? '' : ' Dato di OpenStreetMap non verificato: controlla che sia aperto prima di contarci.')

export function computeCamminoEscapeOptions(input: CamminoEscapeInput): EscapeOption[] {
  const { services, routePolyline, currentLat, currentLon, alongM, totalM } = input
  const options: EscapeOption[] = []
  const nearest = (cat: ServiceItem['category']) => {
    let best: { s: ServiceItem; d: number } | null = null
    for (const s of services) {
      if (s.category !== cat) continue
      const d = haversineM(currentLat, currentLon, s.lat, s.lon)
      if (d <= MAX_DIRECT_M && (!best || d < best.d)) best = { s, d }
    }
    return best
  }
  const direct = (s: ServiceItem, d: number, label: string, reason: string): EscapeOption => ({
    kind: 'safe_poi', label, distanceM: d, safety: safetyFor(d), reason,
    bearingDeg: bearingDeg(currentLat, currentLon, s.lat, s.lon), targetLat: s.lat, targetLon: s.lon, path: null,
  })

  // 1. Accorcia la tappa: il primo alloggio o trasporto davanti a te, vicino al sentiero.
  const placed: PlacedService[] = placeServices(services, routePolyline, totalM, MAX_OFF_ROUTE_SHORTEN_M)
  const ahead = placed.find(p => (p.service.category === 'lodging' || p.service.category === 'transport') && p.alongM - alongM >= MIN_SHORTEN_AHEAD_M)
  if (ahead) {
    const dAlong = ahead.alongM - alongM
    const saved = Math.max(0, totalM - ahead.alongM)
    options.push({
      ...direct(ahead.service, haversineM(currentLat, currentLon, ahead.service.lat, ahead.service.lon), `Accorcia la tappa: ${nameOf(ahead.service)}`,
        `${SERVICE_META[ahead.service.category].label} sul percorso a ${km(dAlong)} da qui (${km(ahead.offRouteM)} dal sentiero): chiudi la tappa lì e risparmi ${km(saved)}.${caveat(ahead.service)}`),
      distanceM: dAlong,
      safety: safetyFor(dAlong),
    })
  }

  // 2. Dove dormire, 3. come andarsene, 4. dove rifornirsi — il più vicino in linea d'aria.
  const lodging = nearest('lodging')
  if (lodging) options.push(direct(lodging.s, lodging.d, `Dormi a ${nameOf(lodging.s)}`, `${lodging.s.kind} a circa ${km(lodging.d)} in linea d'aria.${caveat(lodging.s)}`))
  const transport = nearest('transport')
  if (transport) options.push(direct(transport.s, transport.d, `Esci con ${transport.s.kind === 'Stazione' ? 'il treno' : 'il bus'}: ${nameOf(transport.s)}`, `${transport.s.kind} a circa ${km(transport.d)} in linea d'aria. Gli orari non sono noti: verificali.${caveat(transport.s)}`))
  const shop = nearest('shop') ?? nearest('food')
  if (shop) options.push(direct(shop.s, shop.d, `Rifornisciti: ${nameOf(shop.s)}`, `${shop.s.kind} a circa ${km(shop.d)} in linea d'aria.${caveat(shop.s)}`))

  return options
}
