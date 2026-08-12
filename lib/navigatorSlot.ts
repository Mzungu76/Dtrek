/**
 * The standalone Navigator app's slot limit (docs/navigation-engine-analysis.md §5): unlike the
 * main app, Navigator can only ever have up to NAVIGATOR_SLOT_LIMIT routes/tracks that it itself
 * let the user create — an imported file/URL, or a free-track recording — at a time. Full planning
 * power (unlimited routes, AI search/build, multiple recordings) stays in the main app; Navigator
 * is meant as an on-the-trail companion, not a second copy of the planning tool. Raised from 1 to 3
 * (product decision, ago 2026): enough room that a user who's gotten used to Navigator doesn't hit
 * the wall on their very next hike, while the gap to "unlimited in the main app" stays the premium
 * pitch.
 *
 * This is deliberately narrower than "does the user have any planned hikes at all": a route
 * planned in the *main* app and merely synced into Navigator's list is NOT limited by this — only
 * `sourceApp: 'navigator'` rows (set exclusively by Navigator's own import/record flows, see
 * PlannedHike.sourceApp / StoredActivity.sourceApp) count against the slot. A user who already had
 * several routes planned before this limit existed sees no change; the limit only ever stops a NEW
 * Navigator-originated import/recording once the slots already in place reach the cap.
 */
import { getAllPlanned } from '@/lib/plannedStore'
import { getAllActivities } from '@/lib/blobStore'

export const NAVIGATOR_SLOT_LIMIT = 3

export interface NavigatorSlotItem {
  kind: 'planned' | 'activity'
  id: string
  title: string
}

export interface NavigatorSlotStatus {
  items: NavigatorSlotItem[]
  atLimit: boolean
}

export async function getNavigatorSlotStatus(): Promise<NavigatorSlotStatus> {
  const planned = await getAllPlanned()
  const plannedItems: NavigatorSlotItem[] = planned
    .filter((h) => h.sourceApp === 'navigator' && !h.archivedAt)
    .map((h) => ({ kind: 'planned' as const, id: h.id, title: h.title }))

  const activities = await getAllActivities()
  const activityItems: NavigatorSlotItem[] = activities
    .filter((a) => a.sourceApp === 'navigator')
    .map((a) => ({ kind: 'activity' as const, id: a.id, title: a.title }))

  const items = [...plannedItems, ...activityItems]
  return { items, atLimit: items.length >= NAVIGATOR_SLOT_LIMIT }
}
