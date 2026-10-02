'use client'
import { useEffect, useState } from 'react'
import { loadManifest, isManifestValid } from '@/lib/offline/packageManifest'
import { navStorageKey } from '@/lib/navigation/navKey'

interface Props {
  hikeId: string
  next: { ordinal: number; name: string; lengthM: number }
  onNavigate: () => void
  onReport: () => void
}

/** Dopo aver salvato una tappa di cammino: la tappa dopo, con o senza mappa già scaricata, oppure il reportage. */
export default function CamminoNextTappaDialog({ hikeId, next, onNavigate, onReport }: Props) {
  const [offlineReady, setOfflineReady] = useState<boolean | null>(null)
  useEffect(() => {
    loadManifest(navStorageKey(hikeId, next.ordinal)).then(m => setOfflineReady(isManifestValid(m))).catch(() => setOfflineReady(false))
  }, [hikeId, next.ordinal])

  return (
    <div className="fixed inset-0 z-[3000] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-forest-600 mb-1">Tappa salvata</p>
        <h2 className="text-lg font-bold font-display text-stone-900 mb-1">Prossima: {next.name}</h2>
        <p className="text-sm text-stone-600 font-body mb-1">{(next.lengthM / 1000).toFixed(1).replace('.', ',')} km</p>
        <p className="text-xs text-stone-500 mb-5">
          {offlineReady == null ? '' : offlineReady ? 'Mappa offline già scaricata.' : 'Mappa offline non ancora scaricata: scaricala dalla guida finché hai rete.'}
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={onNavigate} className="w-full rounded-full bg-forest-600 py-3 text-sm font-bold text-white">Naviga la prossima tappa</button>
          <button onClick={onReport} className="w-full rounded-full border border-stone-300 bg-white py-3 text-sm font-bold text-stone-700">Vai al reportage</button>
        </div>
      </div>
    </div>
  )
}
