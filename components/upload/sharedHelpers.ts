// Shared by ManualPlanUploader and FromActivityUploader — both create a PlannedHike with no
// GPX-derived pendingExpiresAt of their own, so they need the account's default window.
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'

export async function defaultPendingExpiresAt(): Promise<string> {
  const days = await getUserSettingsCached()
    .then(d => d.guidePendingDays ?? 30)
    .catch(() => 30)
  return new Date(Date.now() + days * 86400000).toISOString()
}
