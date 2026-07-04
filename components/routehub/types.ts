import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export type HubMode = 'guida' | 'resoconto'

export type SectionKind = 'dati' | 'natura' | 'poi' | 'sicurezza' | 'strumenti' | 'altimetria'

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
  /** The real, always-visible map/photo for the current route — `interactive` is false while
   *  the hub is locked (frozen carousel) and true while unlocked (free pan/zoom stage). */
  renderStageMap: (item: RouteHubItem, interactive: boolean) => ReactNode
  /** Composes and returns a full `<SectionSplit>` for the given section (map half + scrollable
   *  content half) — RouteHub only decides *which* section is open, not its content. */
  renderSection: (section: SectionKind, item: RouteHubItem, onClose: () => void) => ReactNode
  /** Guida-only "Avvia navigazione" primary action. */
  onNavigate?: (item: RouteHubItem) => void
  /** Resoconto-only "Vota bellezza" primary action + display of an existing rating. */
  ratingBadge?: (item: RouteHubItem) => ReactNode
  onOpenRating?: (item: RouteHubItem) => void
  /** Small badge (e.g. CTS score) overlaid on the "Dati & punteggi" icon, when available. */
  datiBadge?: (item: RouteHubItem) => ReactNode
  /** The prominent, dedicated icon for the AI-generated long-form content — "Guida Turistica"
   *  (Guida, opens as a section split) or "Racconto" (Resoconto, navigates away directly). Fully
   *  owned by the calling page: RouteHub just renders the button and forwards the click. */
  featuredLabel: string
  featuredIcon: LucideIcon
  onOpenFeatured: (item: RouteHubItem) => void
  /** "Vedi elenco" — links back to the classic grid/calendar index page. */
  onOpenList: () => void
}
