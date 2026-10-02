import { buildSequence } from './progress'
import { loadTappaElevation } from './useTappaData'
import { orientedTappa, saveOfflineTappa } from './offlineTappa'
import { navStorageKey } from '@/lib/navigation/navKey'
import { downloadOfflinePackage } from '@/lib/offline/packageManager'
import { loadManifest, isManifestValid } from '@/lib/offline/packageManifest'
import type { CamminoPlan } from './plan'
import type { CamminoDetail } from '@/app/api/cammini/[id]/route'

// Scarico offline di più tappe di fila (docs/piano-cammini.md, offline): per ogni tappa la copia locale (tracciato e
// luoghi) e il pacchetto mappa con la chiave della tappa. Una dopo l'altra, per non saturare rete e storage.

export type BulkScope = { kind: 'next'; count: number } | { kind: 'all' }

/** Ordinali ancora da percorrere, nell'ordine di marcia, secondo l'ambito scelto. */
export function pickOrdinals(plan: CamminoPlan, done: ReadonlySet<number>, scope: BulkScope): number[] {
  const todo = buildSequence(plan).filter(x => !done.has(x.ordinal)).map(x => x.ordinal)
  return scope.kind === 'all' ? todo : todo.slice(0, Math.max(0, scope.count))
}

export interface BulkProgress {
  /** Posizione nella lista (1…total) e ordinale della tappa in corso. */
  index: number
  total: number
  ordinal: number
  /** Avanzamento delle tile della tappa in corso, 0…1. */
  fraction: number
}

export interface BulkResult { ready: number[]; failed: number[] }

export async function downloadTappePackages(
  plan: CamminoPlan,
  hikeId: string,
  ordinals: number[],
  detail: CamminoDetail,
  onProgress?: (p: BulkProgress) => void,
  shouldStop?: () => boolean,
): Promise<BulkResult> {
  const result: BulkResult = { ready: [], failed: [] }
  for (let i = 0; i < ordinals.length; i++) {
    if (shouldStop?.()) break
    const ordinal = ordinals[i]
    const report = (fraction: number) => onProgress?.({ index: i + 1, total: ordinals.length, ordinal, fraction })
    report(0)
    try {
      const pois = (await loadTappaElevation(plan.camminoId, ordinal))?.pois ?? []
      const tappa = orientedTappa(detail, ordinal, plan.direction, pois)
      if (!tappa) throw new Error('tappa')
      await saveOfflineTappa(tappa)
      const key = navStorageKey(hikeId, ordinal)
      if (!isManifestValid(await loadManifest(key))) {
        await downloadOfflinePackage(key, tappa.polyline, { cachedPois: tappa.pois }, p => report(p.tileCount ? p.downloadedCount / p.tileCount : 0))
      }
      if (isManifestValid(await loadManifest(key))) result.ready.push(ordinal)
      else result.failed.push(ordinal)
    } catch {
      result.failed.push(ordinal)
    }
    report(1)
  }
  return result
}
