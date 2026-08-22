'use client'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type * as L from 'leaflet'
import { useEffect, useRef } from 'react'
import { POI_META, type PoiType } from '@/lib/overpass'
import { poiBadgeMarkup } from '@/components/poiIcons'

export interface TerritoryPoi {
  key: string
  lat: number
  lon: number
  name: string
  type: PoiType
}

export type TerritoryRouteCategory = 'planned' | 'suggested'

export interface TerritoryRoute {
  key: string
  title: string
  polyline: [number, number][]
  category: TerritoryRouteCategory
}

// Stessa lettura cromatica già in uso altrove in Bacheca: forest per i percorsi già pianificati
// dall'utente (RouteThumb di default per "Altre uscite in programma"), terra per quelli proposti
// da DTrek (badge "Consigliato"/reasonTag di "Percorsi suggeriti") — qui riproposta come legenda
// invece che come badge, per distinguere le due categorie di tracciati sulla stessa mappa.
const ROUTE_CATEGORY_COLOR: Record<TerritoryRouteCategory, string> = {
  planned: '#2d7a3d',
  suggested: '#d97220',
}
const ROUTE_CATEGORY_LABEL: Record<TerritoryRouteCategory, string> = {
  planned: 'In programma',
  suggested: 'Suggeriti',
}

interface Props {
  pois: TerritoryPoi[]
  routes?: TerritoryRoute[]
  height?: string
  interactive?: boolean
}

// Oltre questa lunghezza un'etichetta viene troncata di default — un titolo intero ("Cascata del
// Picchio – I Cavoni di Nepi giro ad anello con partenza da Nepi") andava a capo su 5-6 righe da
// solo, più alto di quanto la mappa potesse mostrare in modo leggibile. Tocco per espandere/
// ridurre invece di mostrare sempre tutto o sempre solo l'anteprima.
const TRUNCATE_LENGTH = 20
function truncateLabelText(text: string): string {
  return text.length > TRUNCATE_LENGTH ? `${text.slice(0, TRUNCATE_LENGTH).trimEnd()}…` : text
}

/**
 * Etichetta permanente troncata di default, espandibile al tocco (solo se davvero più lunga della
 * soglia — un'etichetta già corta non ha nulla da nascondere/mostrare, resta un testo semplice).
 * bindTooltip/setTooltipContent non toccano mai il className del contenitore DOM, quindi la classe
 * "espansa" va aggiunta/rimossa direttamente sull'elemento a ogni tocco.
 */
function bindExpandableTooltip(
  layer: L.Layer,
  fullText: string,
  baseClassName: string,
  options: L.TooltipOptions,
  onToggle: () => void,
) {
  const truncatable = fullText.length > TRUNCATE_LENGTH
  let expanded = false
  layer.bindTooltip(truncateLabelText(fullText), {
    ...options,
    className: `${baseClassName}${truncatable ? ' territory-label-expandable' : ''}`,
    interactive: truncatable,
  })
  if (!truncatable) return
  // Per un layer già sulla mappa (sempre il caso qui: bindExpandableTooltip viene chiamata dopo
  // .addTo(map)), bindTooltip con permanent:true apre subito il tooltip in modo sincrono, PRIMA che
  // il codice torni qui sotto — un ascoltatore 'tooltipopen' registrato solo dopo bindTooltip
  // arriva sempre troppo tardi per quel primo evento (già emesso e perso), quindi il click non
  // veniva mai agganciato. Si aggancia subito, e 'tooltipopen' resta solo come ripescaggio per
  // l'eventuale caso in cui il layer non fosse ancora montato al momento del bind.
  const attachClickHandler = () => {
    const el = layer.getTooltip()?.getElement()
    if (!el || el.dataset.expandBound) return
    el.dataset.expandBound = '1'
    el.addEventListener('click', e => {
      e.stopPropagation()
      expanded = !expanded
      layer.setTooltipContent(expanded ? fullText : truncateLabelText(fullText))
      el.classList.toggle('territory-label-expanded', expanded)
      onToggle()
    })
  }
  attachClickHandler()
  layer.on('tooltipopen', attachClickHandler)
}

// Caricamento condiviso a livello di modulo, non per-mount: leaflet.markercluster è un side-effect
// import (patcha `window.L` invece di esportare qualcosa) e un modulo ESM esegue il proprio corpo
// UNA SOLA VOLTA in tutto il processo, non a ogni `import()`. Se ogni mount di questo componente
// creasse la propria copia mutabile di L (vedi il commento sotto sul perché serve una copia) e la
// assegnasse a window.L, solo il PRIMO mount a montare (qui, la mappa compatta in Bacheca)
// riceverebbe davvero la patch: i mount successivi (qui, la stessa mappa più grande nel foglio a
// comparsa) rifarebbero la copia ma il plugin non ci girerebbe più sopra una seconda volta, quindi
// `L.markerClusterGroup` risulterebbe sistematicamente assente su di loro. Una sola copia,
// riutilizzata da ogni mount presente e futuro, evita il problema alla radice.
let leafletWithClusterPromise: Promise<typeof import('leaflet')> | null = null
function loadLeafletWithCluster() {
  if (!leafletWithClusterPromise) {
    leafletWithClusterPromise = import('leaflet').then(async leafletModule => {
      // leaflet.markercluster è un plugin "vecchio stile" che si aspetta L già globale (come da
      // un tag <script>, non da un import ESM/CJS) e vi assegna direttamente nuove proprietà
      // (`L.MarkerClusterGroup = L.FeatureGroup.extend(...)`). Il namespace object restituito da
      // `import('leaflet')` è però non estensibile per specifica ECMAScript — quell'assegnazione
      // lanciava un TypeError silenzioso (promise mai catturata) che interrompeva l'inizializzazione
      // della mappa a metà, PRIMA di disegnare i marker POI e di chiamare fitBounds: da fuori
      // sembrava che i POI fossero spariti e che lo zoom iniziale ignorasse tracciati/POI. Una copia
      // semplice (mutabile) risolve: le classi/factory di Leaflet restano le stesse, solo il
      // contenitore cambia.
      const L = { ...leafletModule } as typeof leafletModule
      ;(window as unknown as { L: typeof L }).L = L
      await import('leaflet.markercluster')
      return L
    })
  }
  return leafletWithClusterPromise
}

/**
 * Mappa dei luoghi citati in "Da sapere sui tuoi percorsi" (app/bacheca/page.tsx), affiancati ai
 * tracciati delle altre due righe della Home — stessa coppia icona/colore per tipo (poiBadgeMarkup
 * + POI_META) di MapView/NavigationMap per i POI, con un'etichetta col nome sempre visibile
 * accanto al marker (qui i luoghi non sono su un unico tracciato con cui l'utente possa già
 * orientarsi, quindi il nome non può restare solo al tocco come altrove).
 *
 * I POI sono raggruppati (leaflet.markercluster) invece che singoli L.marker: sparsi su più
 * percorsi anche lontani tra loro, la mappa deve restare zoomata abbastanza da contenerli tutti —
 * a quello zoom, POI vicini tra loro (es. sullo stesso percorso) finiscono altrimenti impilati
 * sullo stesso pixel, col marker più recente che nasconde tutti gli altri sotto di sé: non erano
 * mai spariti dai dati, solo invisibili l'uno sopra l'altro.
 */
export default function TerritoryMap({ pois, routes = [], height = '200px', interactive = true }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const interactiveRef = useRef(interactive)
  interactiveRef.current = interactive

  const validPois = pois.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))
  const validRoutes = routes.filter(r => r.polyline && r.polyline.length > 1)

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    if (validPois.length === 0 && validRoutes.length === 0) return

    let cancelled = false
    loadLeafletWithCluster().then(L => {
      if (cancelled || !mapRef.current || mapInstance.current) return

      const map = L.map(mapRef.current!, {
        dragging: interactiveRef.current,
        scrollWheelZoom: interactiveRef.current,
        doubleClickZoom: interactiveRef.current,
        touchZoom: interactiveRef.current,
        boxZoom: interactiveRef.current,
        keyboard: interactiveRef.current,
        zoomControl: interactiveRef.current,
      }).setView([44, 11], 7)
      mapInstance.current = map

      L.tileLayer('/api/tile?z={z}&x={x}&y={y}&style=light', {
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map)

      const allBounds: L.LatLngBounds[] = []
      // Etichette permanenti (route + POI), nell'ordine in cui vince un conflitto di spazio sotto
      // — vedi declutterLabels più sotto: i tracciati "in programma" vengono prima dei "suggeriti"
      // perché territoryRoutes (app/bacheca/page.tsx) li costruisce già in quest'ordine.
      const labelLayers: L.Layer[] = []

      for (const route of validRoutes) {
        const line = L.polyline(route.polyline, {
          color: ROUTE_CATEGORY_COLOR[route.category],
          weight: 3,
          opacity: 0.75,
          smoothFactor: 1.5,
        }).addTo(map)
        // L'etichetta non è più legata al tracciato stesso (un tooltip 'center' finiva sempre
        // sopra la linea, nascondendola) ma a un piccolo pallino colorato piazzato su un vertice
        // reale del percorso (non il centro del bounding box, che per un tracciato a L/a zig-zag
        // può cadere fuori dalla linea) — l'etichetta sta sopra il pallino (direction 'top'), con
        // la punta del fumetto di Leaflet a fare da indicatore verso il punto reale.
        const anchorPoint = route.polyline[Math.floor((route.polyline.length - 1) / 2)]
        const anchorDot = L.circleMarker(anchorPoint, {
          radius: 4,
          color: '#fff',
          weight: 1.5,
          fillColor: ROUTE_CATEGORY_COLOR[route.category],
          fillOpacity: 1,
        }).addTo(map)
        bindExpandableTooltip(
          anchorDot,
          route.title,
          `territory-map-label territory-label-${route.category}`,
          { permanent: true, direction: 'top', offset: [0, -6] },
          scheduleDeclutter,
        )
        labelLayers.push(anchorDot)
        allBounds.push(line.getBounds())
      }

      if (validPois.length > 0) {
        const clusterGroup = L.markerClusterGroup({
          maxClusterRadius: 50,
          spiderfyOnMaxZoom: true,
          iconCreateFunction: (cluster) => L.divIcon({
            className: '',
            html: `<div style="width:30px;height:30px;border-radius:50%;background:#57534e;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)">${cluster.getChildCount()}</div>`,
            iconSize: [30, 30],
          }),
        })
        for (const poi of validPois) {
          const meta = POI_META[poi.type]
          const icon = L.divIcon({
            className: '',
            html: poiBadgeMarkup(poi.type, meta?.color ?? '#d97220', 24),
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          })
          const marker = L.marker([poi.lat, poi.lon], { icon, title: poi.name })
          bindExpandableTooltip(
            marker,
            poi.name,
            'territory-map-label',
            { permanent: true, direction: 'right', offset: [8, 0] },
            scheduleDeclutter,
          )
          labelLayers.push(marker)
          clusterGroup.addLayer(marker)
        }
        clusterGroup.addTo(map)
        allBounds.push(clusterGroup.getBounds())

        // Leaflet non nasconde da solo un'etichetta permanente quando due marker/tracciati finiscono
        // vicini sullo schermo (la sovrapposizione segnalata dall'utente): riprogrammata a ogni
        // evento che può cambiare CHI è visibile a questo zoom — non solo pan/zoom della mappa, ma
        // anche 'animationend' del cluster (un marker che (s)compare dal raggruppamento non tocca
        // né zoomend né moveend).
        clusterGroup.on('animationend', scheduleDeclutter)
      }

      if (allBounds.length > 0) {
        const combined = allBounds.reduce((acc, b) => acc.extend(b), allBounds[0])
        map.fitBounds(combined, { padding: [32, 32], maxZoom: 13 })
      }

      // Stesso motivo di AllRoutesMap.tsx: il contenitore può cambiare dimensione dopo il primo
      // render (qui, tipicamente, quando questa mappa passa dalla riga compatta in Bacheca al
      // foglio a comparsa più grande) e Leaflet non se ne accorge da solo.
      const ro = new ResizeObserver(() => map.invalidateSize())
      ro.observe(mapRef.current!)
      resizeObserverRef.current = ro

      // Tiene solo la prima etichetta di ogni gruppo che si sovrappone sullo schermo (con un
      // margine), nascondendo le altre — non uno spostamento reciproco (spiderfy esiste già per i
      // marker raggruppati, non per le etichette testuali), solo un diradamento: a zoom basso più
      // tracciati/POI restano senza nome finché non si zooma abbastanza da separarli, invece di
      // un ammasso illeggibile di riquadri bianchi.
      let declutterRaf: number | null = null
      function declutterLabels() {
        const kept: DOMRect[] = []
        const PAD = 3
        for (const layer of labelLayers) {
          const el = layer.getTooltip()?.getElement()
          if (!el) continue
          const rect = el.getBoundingClientRect()
          const overlaps = kept.some(r => !(
            rect.right + PAD < r.left || r.right + PAD < rect.left ||
            rect.bottom + PAD < r.top || r.bottom + PAD < rect.top
          ))
          el.style.visibility = overlaps ? 'hidden' : ''
          if (!overlaps) kept.push(rect)
        }
      }
      function scheduleDeclutter() {
        if (declutterRaf != null) cancelAnimationFrame(declutterRaf)
        declutterRaf = requestAnimationFrame(() => { declutterLabels(); declutterRaf = null })
      }
      map.on('zoomend moveend', scheduleDeclutter)
      scheduleDeclutter()
    }).catch(err => {
      // La causa reale del bug "POI spariti e zoom iniziale non centrato" (vedi il commento sopra
      // su leaflet.markercluster) era esattamente questo: un errore qui non arrivava mai a console,
      // solo un fallimento silenzioso a metà inizializzazione.
      if (!cancelled) console.error('TerritoryMap: inizializzazione mappa fallita', err)
    })

    return () => {
      cancelled = true
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      if (mapInstance.current) {
        mapInstance.current.remove()
        mapInstance.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapInstance.current
    if (!map) return
    const handlers = [map.dragging, map.scrollWheelZoom, map.doubleClickZoom, map.touchZoom, map.boxZoom, map.keyboard]
    handlers.forEach(h => { if (h) interactive ? h.enable() : h.disable() })
  }, [interactive])

  if (validPois.length === 0 && validRoutes.length === 0) return null

  return (
    <div className="relative">
      <div ref={mapRef} style={{ height }} className="rounded-xl overflow-hidden border border-stone-200 shadow-sm" />
      {validRoutes.some(r => r.category === 'planned') && validRoutes.some(r => r.category === 'suggested') && (
        <div className="absolute bottom-2 left-2 flex items-center gap-2.5 bg-white/90 backdrop-blur-sm rounded-full px-2.5 py-1 text-[9.5px] font-semibold text-stone-600 shadow-sm">
          {(['planned', 'suggested'] as const).map(cat => (
            <span key={cat} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ROUTE_CATEGORY_COLOR[cat] }} />
              {ROUTE_CATEGORY_LABEL[cat]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
