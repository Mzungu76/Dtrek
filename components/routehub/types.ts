import type { ReactNode, Ref } from 'react'
import type { LucideIcon } from 'lucide-react'

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
  /** Straight-line (haversine) meters from the user's saved starting address to the trailhead —
   *  undefined until the address is known/geocoded, which just hides the "Distanza" sort option. */
  distance?: number
}

/** Mode-agnostic normalized item RouteHub operates on — one per route in the carousel/gallery. */
export interface RouteHubItem {
  id: string
  title: string
  /** [lat, lon] pairs — undefined/short means "no GPS track available". */
  polyline?: [number, number][]
  /** Cover photo for the fullscreen stage + gallery thumb (Resoconto: real activity photo).
   *  When absent, the cover falls back to a stylized, non-interactive route map (CoverMap). */
  coverPhotoUrl?: string
  statPills: StatPill[]
  sortValues?: SortValues
  /** Best-effort score badge for the gallery thumbnail (top-left) — Guida: partial Trail Score
   *  from whatever's already cached (no live fetch per list item); Resoconto: the user's manual
   *  rating. Undefined when nothing's known yet for this item. */
  scorePreview?: { value: number; max: number; color?: string }
}

/** One tab of the Screen 2 page's pill tab-bar — only meaningful when bodyMode === 'tabbed'. */
export interface TabDef {
  key: SectionKind
  label: string
  icon: LucideIcon
  badge?: ReactNode
}

/** The page's pinned primary CTA (e.g. "Naviga"/"Vota bellezza") — always visible regardless of
 *  scroll position, never covered by the page's own scrollable content. */
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
  /** 'continuous': Screen 2 is a single scroll hosting renderSection('featured', ...) (Guida's
   *  magazine guide) — 'strumenti' is reachable via a menu drawer instead of a tab.
   *  'tabbed': Screen 2 keeps the pill tab-bar + swipe-between-tabs UI (Resoconto). */
  bodyMode: 'continuous' | 'tabbed'
  /** Tabs shown in the pill tab-bar, in display order — only used when bodyMode === 'tabbed'. */
  tabs?: TabDef[]
  /** Returns just the section's own content (no chrome — RoutePage owns title/close/tab-bar).
   *  `onClose` is only needed by content that opens its own full-screen layer above the page and
   *  wants its own exit button to also close the page itself. */
  renderSection: (section: SectionKind, item: RouteHubItem, onClose: () => void) => ReactNode
  /** Attaches to the page's real scrolling element for sections that track scroll position
   *  (e.g. `useCenteredItem`, to sync a highlighted POI/marker with what's centered in the list). */
  tabScrollRef?: (section: SectionKind) => Ref<HTMLDivElement> | undefined
  /** The page's pinned primary action (Guida: "Naviga"; Resoconto: "Vota bellezza"/voto
   *  esistente) — null hides it entirely for that item. */
  primaryAction: (item: RouteHubItem) => PrimaryAction | null
  /** Sentence from the personalized assessment, shown floating over the cover just above the
   *  bottom gallery (Screen 1 only). Undefined/null when there's nothing to show. */
  summaryBanner?: (item: RouteHubItem) => string | null | undefined
  /** Today's/relevant weather icon — shown next to the route title. Undefined while unknown. */
  weatherIcon?: (item: RouteHubItem) => WeatherIcon | null | undefined
  /** Fired whenever the open section changes (including to/from null) — lets the caller derive
   *  section-specific state (highlighted POI/difficulty index, POI layer visibility, …) without
   *  lifting the whole reducer out of RouteHub. */
  onSectionChange?: (section: SectionKind | null) => void
  /** Score/rating chips (CTS, Sicurezza, Bellezza…) shown floating over the cover at all times —
   *  not gated behind any open section. `onTap` opens `scoreBadgesTargetSection` (default 'dati'). */
  scoreBadges?: (item: RouteHubItem, onTap: () => void) => ReactNode
  /** Section opened by the score badges' `onTap` — Guida targets 'featured' (its only page). */
  scoreBadgesTargetSection?: SectionKind
  /** Resoconto only: horizontal photo strip shown above every tab's content. */
  heroPhotos?: ReactNode
  /** Extra chip(s) shown in RoutePage's fixed header (e.g. the "programma data" chip). */
  headerActions?: ReactNode
  /** Import a new GPX/FIT/TCX — rendered as the first tile in the bottom gallery, always
   *  present (even with a single route) so there's a persistent way back to /upload. */
  importLabel?: string
  onImport?: () => void
  /** Ad-hoc (Guida, written by the AI at generation time) or heuristic (Resoconto) tagline for
   *  the magazine-cover closed card — undefined/null hides the subtitle line entirely. */
  subtitle?: (item: RouteHubItem) => string | null | undefined
  /** 'magazine' bumps the closed-card title size and shows the subtitle line — opt-in so any
   *  future caller that doesn't pass it keeps today's compact look. */
  topOverlayVariant?: 'default' | 'magazine'
}
