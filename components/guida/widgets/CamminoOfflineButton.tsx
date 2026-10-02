'use client'
import { useEffect, useMemo, useState } from 'react'
import OfflinePackageDownloader from '@/components/navigation/OfflinePackageDownloader'
import { useCamminoDetail } from '@/lib/cammini/useCamminoDetail'
import { loadTappaElevation } from '@/lib/cammini/useTappaData'
import { loadTappaServices } from '@/lib/cammini/tappaServices'
import type { ServiceItem } from '@/lib/cammini/services'
import { orientedTappa, saveOfflineTappa } from '@/lib/cammini/offlineTappa'
import { navStorageKey } from '@/lib/navigation/navKey'
import type { PoiItem } from '@/lib/overpass'
import type { CamminoPlan } from '@/lib/cammini/plan'

// "Scarica per l'offline" di una tappa: salva il tracciato e i luoghi della tappa (così il Navigator parte anche
// senza rete) e scarica il pacchetto mappa con la chiave della tappa (lib/navigation/navKey.ts).

export default function CamminoOfflineButton({ plan, hikeId, ordinal }: { plan: CamminoPlan; hikeId: string; ordinal: number }) {
  const detail = useCamminoDetail(plan.camminoId)
  const [pois, setPois] = useState<PoiItem[] | null>(null)
  // undefined = non ancora letti; null = non disponibili (si salva la tappa senza, non con "nessun servizio").
  const [services, setServices] = useState<ServiceItem[] | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    loadTappaElevation(plan.camminoId, ordinal).then(d => { if (!cancelled) setPois(d?.pois ?? []) })
    loadTappaServices(plan.camminoId, ordinal).then(sv => { if (!cancelled) setServices(sv) })
    return () => { cancelled = true }
  }, [plan.camminoId, ordinal])

  const tappa = useMemo(
    () => (detail && pois && services !== undefined ? orientedTappa(detail, ordinal, plan.direction, pois, Date.now(), services ?? undefined) : null),
    [detail, pois, services, ordinal, plan.direction],
  )
  useEffect(() => { if (tappa) saveOfflineTappa(tappa) }, [tappa])

  if (!tappa) return null
  return (
    <OfflinePackageDownloader
      hikeId={navStorageKey(hikeId, ordinal)}
      routePolyline={tappa.polyline}
      hikeData={{ cachedPois: tappa.pois }}
    />
  )
}
