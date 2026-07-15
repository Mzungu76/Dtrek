'use client'

/**
 * Local-first access to /api/resoconto's editable fields (content/sections/
 * authored_by) — same cache-first read / queued write pattern as
 * lib/blobStore.ts and lib/plannedStore.ts. Report *generation* (the AI
 * streaming POST) is deliberately NOT covered here: it's inherently
 * network-dependent (a Claude call) and has no offline equivalent, so
 * app/resoconto/[id]/RacconContent.tsx keeps calling it directly.
 */

import { lsGet, lsSet, LS_KEYS, obEnqueue } from '@/lib/localStore'
import { registerEntityFlusher, scheduleFlush, flushRows } from './syncEngine'
import { revalidateInBackground } from './pullEngine'
import { apiFetch } from '@/lib/apiFetch'
import type { HikeReport, ReportSection, ReportAuthoredBy } from '@/lib/reportStore'

const ENTITY_TYPE = 'hike_report'

function fetchReportFromServer(activityId: string): Promise<HikeReport | null> {
  return apiFetch<HikeReport | null>(`/api/resoconto?activityId=${encodeURIComponent(activityId)}`)
}

/**
 * Returns the local copy if present (and kicks a background revalidation against Supabase in case
 * another device edited it since — see lib/sync/pullEngine.ts); only awaits the network when
 * there's no local copy yet.
 */
export async function getReport(activityId: string): Promise<HikeReport | null> {
  const local = await lsGet<HikeReport>(LS_KEYS.report(activityId))
  if (local) {
    revalidateInBackground(LS_KEYS.report(activityId), local, () => fetchReportFromServer(activityId))
    return local
  }
  try {
    const data = await fetchReportFromServer(activityId)
    if (data) await lsSet(LS_KEYS.report(activityId), data)
    return data
  } catch {
    return null
  }
}

/** Caches a report fetched by other means (e.g. right after AI generation) so subsequent reads are cache-first. */
export async function cacheReport(activityId: string, report: HikeReport): Promise<void> {
  await lsSet(LS_KEYS.report(activityId), report)
}

/**
 * Applies the edited content/sections to the local cache immediately and
 * queues the change for background sync — never blocks on the network
 * (autosave while typing in the manual editor shouldn't feel like a network
 * request).
 */
export async function saveReportContent(
  activityId: string,
  content: string,
  sections?: ReportSection[],
  authoredBy?: ReportAuthoredBy,
): Promise<void> {
  const local = await lsGet<HikeReport>(LS_KEYS.report(activityId))
  const merged: HikeReport = {
    ...(local ?? {
      id: `report-${activityId}`,
      activity_id: activityId,
      title: 'Escursione',
      photos: [],
      created_at: new Date().toISOString(),
    }),
    content,
    ...(sections    !== undefined ? { sections } : {}),
    ...(authoredBy  !== undefined ? { authored_by: authoredBy } : {}),
    updated_at: new Date().toISOString(),
  }
  await lsSet(LS_KEYS.report(activityId), merged)
  // Only include keys that were actually passed — an explicit `undefined` here would, once
  // merged into a pending outbox row by obEnqueue's coalescing, overwrite an earlier queued
  // `sections`/`authoredBy` value with undefined instead of leaving it alone.
  const payload: Record<string, unknown> = { content }
  if (sections   !== undefined) payload.sections   = sections
  if (authoredBy !== undefined) payload.authoredBy = authoredBy
  await obEnqueue(ENTITY_TYPE, activityId, 'patch', payload)
  scheduleFlush()
}

registerEntityFlusher(ENTITY_TYPE, (rows) => flushRows(rows, async (row) => {
  const payload = row.payload as { content?: string; sections?: ReportSection[]; authoredBy?: ReportAuthoredBy } ?? {}
  await apiFetch('/api/resoconto', {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ activityId: row.recordId, ...payload }),
  })
}))
