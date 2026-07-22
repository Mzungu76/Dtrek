// Profilo escursionista + storico attività — segnali di personalizzazione condivisi da
// app/api/route-search/route.ts (ricerca AI di un percorso esistente) e app/api/route-build/route.ts
// (generazione algoritmica di un percorso nuovo). Estratto da route-search/route.ts perché
// entrambi gli endpoint devono leggere esattamente lo stesso profilo/storico per calibrare target
// di lunghezza/dislivello e valutazioni di comfort — nessun comportamento diverso rispetto a prima.
import { supabase } from '@/lib/supabase'
import { readIndex } from '@/lib/blobIndex'
import type { ActivityMeta } from '@/lib/blobStore'
import { concernLabel, environmentPrefLabel } from '@/lib/hikerProfile'

export interface HikerProfileBlock {
  experienceLevel: string | null
  concerns: string[]
  environmentPrefs: string[]
}

export interface ActivityHistorySummary {
  count: number
  avgDistanceKm: number
  avgElevationM: number
  maxDistanceKm: number
  maxElevationM: number
}

export async function fetchHikerProfile(userId: string): Promise<HikerProfileBlock> {
  const { data } = await supabase
    .from('user_settings')
    .select('hiker_experience_level, hiker_concerns, hiker_environment_prefs')
    .eq('user_id', userId)
    .maybeSingle()
  return {
    experienceLevel: (data?.hiker_experience_level as string | null) ?? null,
    concerns: (data?.hiker_concerns as string[] | null) ?? [],
    environmentPrefs: (data?.hiker_environment_prefs as string[] | null) ?? [],
  }
}

export async function fetchActivitySummary(userId: string): Promise<ActivityHistorySummary> {
  let activities: ActivityMeta[] = []
  try { activities = await readIndex() } catch {}
  if (!activities.length) {
    const { data } = await supabase
      .from('activities')
      .select('distance_meters, elevation_gain')
      .eq('user_id', userId)
    if (data) {
      activities = data.map((r: Record<string, unknown>) => ({
        id: '', title: '', startTime: '', totalTimeSeconds: 0, calories: 0,
        avgHeartRate: 0, maxHeartRate: 0, avgSpeedMs: 0, maxSpeedMs: 0, altitudeMax: 0,
        distanceMeters: r.distance_meters as number,
        elevationGain: r.elevation_gain as number,
        elevationLoss: 0,
      }))
    }
  }
  const n = activities.length
  if (n === 0) return { count: 0, avgDistanceKm: 0, avgElevationM: 0, maxDistanceKm: 0, maxElevationM: 0 }
  const avgDistanceKm = activities.reduce((s, a) => s + a.distanceMeters / 1000, 0) / n
  const avgElevationM = activities.reduce((s, a) => s + a.elevationGain, 0) / n
  const maxDistanceKm = Math.max(...activities.map(a => a.distanceMeters / 1000))
  const maxElevationM = Math.max(...activities.map(a => a.elevationGain))
  return { count: n, avgDistanceKm, avgElevationM, maxDistanceKm, maxElevationM }
}

export function buildProfileBlock(profile: HikerProfileBlock, history: ActivityHistorySummary): string {
  const lines: string[] = []
  lines.push(`Livello di esperienza dichiarato: ${profile.experienceLevel ?? 'non indicato'}`)
  lines.push(profile.concerns.length ? `Attenzioni indicate dall'utente: ${profile.concerns.map(concernLabel).join('; ')}` : `Nessuna attenzione particolare indicata`)
  lines.push(profile.environmentPrefs.length ? `Preferenze ambientali: ${profile.environmentPrefs.map(environmentPrefLabel).join('; ')}` : `Nessuna preferenza ambientale indicata`)
  lines.push(history.count > 0
    ? `Storico: ${history.count} escursioni registrate, distanza media ${history.avgDistanceKm.toFixed(1)} km (record ${history.maxDistanceKm.toFixed(1)} km), dislivello medio ${Math.round(history.avgElevationM)} m (record ${Math.round(history.maxElevationM)} m)`
    : `Nessuno storico di escursioni registrate`)
  return lines.join('\n')
}

// Blocco neutro usato in modalità degradata (nessun utente verificato ⇒ nessuna lettura Supabase
// possibile per profilo/storico) — la ricerca/generazione prosegue comunque, solo senza
// personalizzazione, invece di bloccarsi del tutto.
export const DEGRADED_PROFILE_BLOCK = 'Profilo e storico non disponibili in questo momento (Supabase non raggiungibile) — nessuna personalizzazione possibile per questa ricerca.'
