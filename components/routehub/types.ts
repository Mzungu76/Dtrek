import type { ReactNode, Ref } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { SheetSnap } from './useRouteHubState'

export type HubMode = 'guida' | 'resoconto'

export type SectionKind = 'dati' | 'natura' | 'poi' | 'sicurezza' | 'strumenti' | 'meteo' | 'featured' | 'profilo'

export interface StatPill {
  icon: LucideIcon
  label: string
}

export interface WeatherIcon {
  emoji: string
  label: string
}

/** Raw sortable metrics for the gallery sort filters — undefined fields just disable that option. */
export interface SortValues {
  date: number
  km: number
  dplus: number
  cts?: number
  rating?: number
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
  sortValues?: SortValues
  /** Best-effort score badge for the gallery thumbnail (top-left) — Guida: partial Trail Score
   *  from whatever's already cached (no live fetch per list item); Resoconto: the user's manual
   *  rating. Undefined when nothing's known yet for this item. */
  scorePreview?: { value: number; max: number; color?: string }
}

/** One tab of the Screen 2 bottom sheet — replaces the old floating per-section icons, each
 *  now with an explicit text label instead of a bare icon. */
export interface TabDef {
  key: SectionKind
  label: string
  icon: LucideIcon
  badge?: ReactNode
}

/** The sheet's pinned primary CTA (e.g. "Naviga"/"Vota bellezza") — always visible regardless
 *  of snap-point, never covered by the sheet's own scrollable content. */
export interface PrimaryAction {
  label: string
  icon: LucideIcon
  onClick: () => void
  variant: 'terra' | 'glass'
  badge?: ReactNode
}

export interface RouteHubProps {
  mode: HubMode
  items: RouteHubItem[]
  initialIndex: number
  /** Called (debounced) whenever the current route settles on a new index — used to sync the URL. */
  onIndexChange?: (item: RouteHubItem, index: number) => void
  /** The real, always-visible map/photo for the current route — `interactive` is false while
   *  Screen 1's carousel is showing and true whenever the Screen 2 sheet is open.
   *  `obscuredBottomPx` is the sheet's current height in px (0 on Screen 1) — forwarded to the
   *  map so it can keep its focus point centered in the shrinking/growing visible band. */
  renderStageMap: (item: RouteHubItem, interactive: boolean, obscuredBottomPx: number) => ReactNode
  /** Tabs shown in the Screen 2 sheet's horizontal tab-bar, in display order. Does not include
   *  'meteo' — that quick-view is reachable only via the weather icon next to the title. */
  tabs: TabDef[]
  /** Returns just the section's own content (no more per-section overlay chrome — RouteSheet
   *  owns title/close/3D/tab-bar, this only supplies what goes inside). `onClose` is only needed
   *  by content that opens its own full-screen layer above the sheet (e.g. Guida's "schermo
   *  intero" reader) and wants its own exit button to also close the sheet itself. */
  renderSection: (section: SectionKind, item: RouteHubItem, onClose: () => void) => ReactNode
  /** Attaches to the sheet's real scrolling element for sections that track scroll position
   *  (e.g. `useCenteredItem`, to sync a highlighted POI/marker on the map with what's centered
   *  in the list). */
  tabScrollRef?: (section: SectionKind) => Ref<HTMLDivElement> | undefined
  /** The sheet's pinned primary action (Guida: "Naviga"; Resoconto: "Vota bellezza"/voto
   *  esistente) — null hides it entirely for that item. */
  primaryAction: (item: RouteHubItem) => PrimaryAction | null
  /** Sentence from the personalized assessment, shown floating over the map just above the
   *  bottom gallery (Screen 1 only). Undefined/null when there's nothing to show. */
  summaryBanner?: (item: RouteHubItem) => string | null | undefined
  /** Today's/relevant weather icon — shown next to the route title; clicking it opens the
   *  "meteo" quick-view. Undefined while unknown/unavailable. */
  weatherIcon?: (item: RouteHubItem) => WeatherIcon | null | undefined
  /** Opens the fullscreen 3D map view for the current route — closes the sheet first. */
  onOpenMap3D?: (item: RouteHubItem) => void
  /** Fired whenever the open tab changes (including to/from null) — lets the caller derive
   *  section-specific map props (highlighted POI/difficulty index, POI layer visibility, …) without
   *  lifting the whole reducer out of RouteHub. */
  onSectionChange?: (section: SectionKind | null) => void
  /** Score/rating chips (CTS, Sicurezza, Bellezza…) shown floating over the map at all times — not
   *  gated behind any open section. `onTap` opens `scoreBadgesTargetSection` (default 'dati'). */
  scoreBadges?: (item: RouteHubItem, onTap: () => void) => ReactNode
  /** Tab opened by the score badges' `onTap` — Guida folded punteggi/sicurezza into the 'featured'
   *  guide article, so it targets that instead of the ('dati' tab no longer exists there);
   *  Resoconto still has a standalone 'dati' tab and doesn't need to override this. */
  scoreBadgesTargetSection?: SectionKind
  /** Resoconto only: horizontal photo strip shown above every tab's content. */
  heroPhotos?: ReactNode
  /** Extra chip(s) shown in the sheet's docking strip next to the 3D button (e.g. POI layer toggle). */
  mapHeaderActions?: ReactNode
  /** Import a new GPX/FIT/TCX — rendered as the first tile in the bottom gallery, always
   *  present (even with a single route) so there's a persistent way back to /upload. */
  importLabel?: string
  onImport?: () => void
}
