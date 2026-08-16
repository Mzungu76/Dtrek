// Fase 4 di docs/navigator-orizzonti-roadmap.md — implementazione reale del segnale Community,
// finora solo referenziato nei commenti di trail_difficulty_markers/supabase-schema.sql (al
// percorso `lib/si/signals/communitySignals.ts`, un sistema "SI"/"CL" più ampio che non esiste
// più in questo repo — vedi il commento in cima a ./types.ts, "dopo la rimozione di
// Affidabilità/CL"). Vive qui, accanto a weatherSignals.ts/climateSignals.ts, gli unici altri
// collector ancora vivi: stesso pattern (`collectXSignal(osmRelationId, ctx)`, mai un'eccezione
// propagata), stessa cartella dei moduli che oggi alimentano davvero /api/trails/conditions.
import { supabase } from '@/lib/supabase'
import { fetchCompletionsSummary } from '@/lib/community/completionsSummary'
import type { CommunitySignal, SignalContext } from './types'

const MARKERS_LIMIT = 20
// Peso massimo del segnale community anche nel caso più "confermato" — mai alla pari con gli
// altri (weather/climate arrivano a moltiplicatori/penalità pieni): un valore alto qui
// significherebbe "mi fido di 3 note quanto di un calcolo meteo", che non è l'intento.
const MAX_CONFIDENCE_WEIGHT = 0.5
// Sopra questo numero di completamenti recenti il peso satura a MAX_CONFIDENCE_WEIGHT — oltre
// non aggiunge altra fiducia, solo più dati dello stesso segno.
const FULL_CONFIDENCE_COMPLETIONS = 5

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

interface NearbyMarker { severity: string; keywords: string[] }

async function fetchNearbyDifficultyMarkers(ctx: SignalContext): Promise<NearbyMarker[]> {
  const { data } = await supabase
    .from('trail_difficulty_markers')
    .select('severity, keywords')
    .gte('lat', ctx.bbox.minLat).lte('lat', ctx.bbox.maxLat)
    .gte('lon', ctx.bbox.minLon).lte('lon', ctx.bbox.maxLon)
    .limit(MARKERS_LIMIT)
  return (data ?? []) as NearbyMarker[]
}

const EMPTY_SIGNAL: CommunitySignal = {
  completions30d: 0, completionsTotal: 0, notes: [],
  difficultyMarkerCount: 0, recentDifficultyKeywords: [], confidenceWeight: 0,
}

/**
 * `_ctx` porta comunque il bbox necessario per i marker di difficoltà (proximity by bbox, non
 * un vero raggio geodetico — coerente con quanto già fa questa stessa route per le altre
 * risorse). Mai un errore propagato: un fallimento di uno dei due collector interni (rete
 * Supabase, timeout) degrada a "nessun segnale community", non blocca l'intera risposta di
 * /api/trails/conditions.
 */
export async function collectCommunitySignal(osmRelationId: number, ctx: SignalContext): Promise<CommunitySignal> {
  if (!Number.isFinite(osmRelationId) || osmRelationId <= 0) return EMPTY_SIGNAL

  try {
    const [summary, markers] = await Promise.all([
      fetchCompletionsSummary(osmRelationId),
      fetchNearbyDifficultyMarkers(ctx),
    ])

    const keywordCounts = new Map<string, number>()
    for (const marker of markers) {
      for (const kw of marker.keywords ?? []) keywordCounts.set(kw, (keywordCounts.get(kw) ?? 0) + 1)
    }
    const recentDifficultyKeywords = Array.from(keywordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([kw]) => kw)

    const confidenceWeight = clamp01(summary.completions30d / FULL_CONFIDENCE_COMPLETIONS) * MAX_CONFIDENCE_WEIGHT

    return {
      completions30d: summary.completions30d,
      completionsTotal: summary.completionsTotal,
      notes: summary.notes,
      difficultyMarkerCount: markers.length,
      recentDifficultyKeywords,
      confidenceWeight,
    }
  } catch {
    return EMPTY_SIGNAL
  }
}
