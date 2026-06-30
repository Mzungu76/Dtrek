// Turns real GBIF occurrence data (the same feed behind the Galleria Animali)
// into extra WildlifeRisk entries for the Safety Score, on top of the static
// per-region table in safetyScore.ts. Best-effort: any failure/timeout
// degrades silently to an empty list, leaving the static table as fallback.
import type { AnimalItem } from '@/app/api/animals/route'
import type { WildlifeRisk } from '@/lib/safetyScore'

const TIPS: Record<string, string> = {
  alto: 'Fai rumore mentre cammini, non avvicinarti, segnala l\'avvistamento',
  moderato: 'Mantieni le distanze, non dare cibo, non bloccare la via di fuga dell\'animale',
}

export async function fetchWildlifeRiskFromGbif(bbox: string, month: number, timeoutMs = 8000): Promise<WildlifeRisk[]> {
  try {
    const res = await fetch(`/api/animals?bbox=${encodeURIComponent(bbox)}&month=${month}`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return []
    const data = await res.json() as { items: AnimalItem[] }
    const dangerous = (data.items ?? []).filter(i => i.dangerLevel === 'alto' || i.dangerLevel === 'moderato')

    // dedupe by species name, keep the most dangerous classification
    const bySpecies = new Map<string, AnimalItem>()
    for (const item of dangerous) {
      const name = item.vernacularIta ?? item.scientificName
      const existing = bySpecies.get(name)
      if (!existing || (item.dangerLevel === 'alto' && existing.dangerLevel !== 'alto')) {
        bySpecies.set(name, item)
      }
    }

    return Array.from(bySpecies.values()).map(item => ({
      animal: item.vernacularIta ?? item.scientificName,
      encounterProbability: 'media' as const,
      dangerLevel: item.dangerLevel as 'alto' | 'moderato',
      tip: TIPS[item.dangerLevel as string] ?? 'Mantieni le distanze, non avvicinarti',
    }))
  } catch {
    return []
  }
}
