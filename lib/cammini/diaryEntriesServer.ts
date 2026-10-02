import { supabase } from '@/lib/supabase'
import { groupCamminoActivities, type CamminoGroup, type CamminoPlannedRow, type CamminoActivityRow } from './diaryEntries'

/** I cammini (con le loro tappe percorse) fra le Mete indicate — per raccogliere ogni cammino in una sola voce. */
export async function loadCamminoGroups(userId: string, plannedIds: string[]): Promise<CamminoGroup[]> {
  if (plannedIds.length === 0) return []
  const [{ data: planned }, { data: acts }] = await Promise.all([
    supabase.from('planned_hikes').select('id, title, cammino_plan').eq('user_id', userId).in('id', plannedIds).not('cammino_plan', 'is', null),
    supabase.from('activities').select('id, linked_planned_id, tappa_index, start_time, distance_meters, total_time_seconds, elevation_gain').eq('user_id', userId).in('linked_planned_id', plannedIds).not('tappa_index', 'is', null),
  ])
  return groupCamminoActivities((planned ?? []) as unknown as CamminoPlannedRow[], (acts ?? []) as CamminoActivityRow[])
}
