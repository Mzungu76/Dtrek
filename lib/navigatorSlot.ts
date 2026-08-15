/**
 * The standalone Navigator app's slot limit (docs/navigation-engine-analysis.md §5): unlike the
 * main app, Navigator can only ever have up to NAVIGATOR_SLOT_LIMIT routes/tracks that it itself
 * let the user create — an imported file/URL, or a free-track recording — at a time. Full planning
 * power (unlimited routes, AI search/build, multiple recordings) stays in the main app; Navigator
 * is meant as an on-the-trail companion, not a second copy of the planning tool. Back down to 1
 * (product decision, ago 2026, reverting the earlier raise to 3): Navigator holds exactly the one
 * route currently in play. Trying to add a second one always resolves to a choice — overwrite the
 * one already there, or go plan in the main app (`app/navigatore/importa/page.tsx`,
 * `app/navigatore/traccia/page.tsx`) — never a silent "pick which of several to delete" list.
 *
 * This is deliberately narrower than "does the user have any planned hikes at all": a route
 * planned in the *main* app and merely synced into Navigator's list is NOT limited by this — only
 * `sourceApp: 'navigator'` rows (set exclusively by Navigator's own import/record flows, see
 * PlannedHike.sourceApp / StoredActivity.sourceApp) count against the slot. A user who already had
 * several routes planned before this limit existed sees no change; the limit only ever stops a NEW
 * Navigator-originated import/recording once the slot already in place is taken.
 *
 * The limit stops applying entirely once the account has activated Dtrek (user_settings.
 * dtrek_activated_at, "Passa a Dtrek" in NavigatorMenu.tsx) — it existed only to nudge an
 * unconverted user, and would otherwise get in the way of someone who deliberately kept Navigator
 * installed as their native GPS companion after already choosing Dtrek (docs/navigator-dtrek-
 * boundary.md — the "arrivato da Dtrek" path, not just "arrivato da Navigator").
 */
import { getAllPlanned } from '@/lib/plannedStore'
import { getAllActivities } from '@/lib/blobStore'
import { isDtrekActivated } from '@/lib/useEntitlement'

export const NAVIGATOR_SLOT_LIMIT = 1

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
  const activated = await isDtrekActivated()
  return { items, atLimit: !activated && items.length >= NAVIGATOR_SLOT_LIMIT }
}
