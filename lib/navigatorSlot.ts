/**
 * The standalone Navigator app's "one slot" limit (docs/navigation-engine-analysis.md §5): unlike
 * the main app, Navigator can only ever have ONE route or track that it itself let the user create
 * — an imported file/URL, or a free-track recording — at a time. Full planning power (unlimited
 * routes, AI search/build, multiple recordings) stays in the main app; Navigator is meant as an
 * on-the-trail companion, not a second copy of the planning tool.
 *
 * This is deliberately narrower than "does the user have any planned hikes at all": a route
 * planned in the *main* app and merely synced into Navigator's list is NOT limited by this — only
 * `sourceApp: 'navigator'` rows (set exclusively by Navigator's own import/record flows, see
 * PlannedHike.sourceApp / StoredActivity.sourceApp) count against the slot. A user who already had
 * several routes planned before this limit existed sees no change; the limit only ever stops a NEW
 * Navigator-originated import/recording once one is already in place.
 */
import { getAllPlanned } from '@/lib/plannedStore'
import { getAllActivities } from '@/lib/blobStore'

export interface NavigatorSlotStatus {
  used: boolean
  kind: 'planned' | 'activity' | null
  id: string | null
  title: string | null
}

const EMPTY: NavigatorSlotStatus = { used: false, kind: null, id: null, title: null }

export async function getNavigatorSlotStatus(): Promise<NavigatorSlotStatus> {
  const planned = await getAllPlanned()
  const plannedHit = planned.find((h) => h.sourceApp === 'navigator' && !h.archivedAt)
  if (plannedHit) return { used: true, kind: 'planned', id: plannedHit.id, title: plannedHit.title }

  const activities = await getAllActivities()
  const activityHit = activities.find((a) => a.sourceApp === 'navigator')
  if (activityHit) return { used: true, kind: 'activity', id: activityHit.id, title: activityHit.title }

  return EMPTY
}
