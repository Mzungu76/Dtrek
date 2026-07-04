import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type HubMode = 'guida' | 'resoconto'

export type PopupKind = 'dati' | 'natura' | 'poi' | 'sicurezza' | 'strumenti'

export interface StatPill {
  icon: LucideIcon
  label: string
}

/** Mode-agnostic normalized item RouteHub operates on — one per route in the carousel/gallery. */
export interface RouteHubItem {
  id: string
  title: string
  /** [lat, lon] pairs — undefined/short means "no GPS track available". */
  polyline?: [number, number][]
  /** Resoconto only: cover photo URL for the fullscreen stage + gallery thumb. */
  coverPhotoUrl?: string
  statPills: StatPill[]
}

export interface RouteHubProps {
  mode: HubMode
  items: RouteHubItem[]
  initialIndex: number
  /** Called (debounced) whenever the current route settles on a new index — used to sync the URL. */
  onIndexChange?: (item: RouteHubItem, index: number) => void
  /** Content for the 5 non-altimetry popups, supplied by the calling page. */
  renderPopup: (popup: PopupKind, item: RouteHubItem) => ReactNode
  /** Top half of the altimetry split view — always the real route map, never the cover photo. */
  renderAltimetryMap: (item: RouteHubItem, activeIndex: number | null) => ReactNode
  /** Bottom half of the altimetry split view — the calling page wraps its own ElevationProfileChart (it owns the full TrackPoint[]) and forwards hover/active-point events via the given callbacks. */
  renderAltimetryChart: (
    item: RouteHubItem,
    onHover: (index: number | null) => void,
    onActivePoint: (d: { alt: number; kmNum: number } | null) => void,
  ) => ReactNode
  /** Guida-only: the real interactive (pannable/zoomable) MapView shown in unlocked mode. Resoconto uses coverPhotoUrl directly instead. */
  renderStageMap?: (item: RouteHubItem) => ReactNode
  /** Guida-only "Avvia navigazione" primary action. */
  onNavigate?: (item: RouteHubItem) => void
  /** Resoconto-only "Vota bellezza" primary action + display of an existing rating. */
  ratingBadge?: (item: RouteHubItem) => ReactNode
  onOpenRating?: (item: RouteHubItem) => void
  /** "Vedi elenco" — links back to the classic grid/calendar index page. */
  onOpenList: () => void
}
