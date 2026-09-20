// Shared by ManualPlanUploader and FromActivityUploader — both create a PlannedHike with no
// GPX-derived pendingExpiresAt of their own, so they need the account's default window.
import { getUserSettingsCached } from '@/lib/sync/userSettingsStore'

export async function defaultPendingExpiresAt(): Promise<string> {
  const days = await getUserSettingsCached()
    .then(d => d.guidePendingDays ?? 30)
    .catch(() => 30)
  return new Date(Date.now() + days * 86400000).toISOString()
}

// Vista mappa (centro + zoom) condivisa fra CreaGuidaMapSearch e ManualRouteEditor — sollevata in
// app/upload/page.tsx (che monta l'uno o l'altro come rami esclusivi, mai insieme) così passare da
// "Scopri"/"Genera" a "Crea un percorso a mano", o tornare indietro, non fa mai ripartire la mappa
// dal centro Italia: vedi i prop initialView/onViewChange di entrambi i componenti.
export interface MapView {
  lat: number
  lon: number
  zoom: number
}
