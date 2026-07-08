// Shared by ManualPlanUploader and FromActivityUploader — both create a PlannedHike with no
// GPX-derived pendingExpiresAt of their own, so they need the account's default window.
export async function defaultPendingExpiresAt(): Promise<string> {
  const days = await fetch('/api/user-settings')
    .then(r => r.json())
    .then(d => d.guidePendingDays ?? 30)
    .catch(() => 30)
  return new Date(Date.now() + days * 86400000).toISOString()
}
