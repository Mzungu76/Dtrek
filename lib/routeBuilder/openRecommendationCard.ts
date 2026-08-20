'use client'
// Salva una card di "Percorsi per te" come percorso pianificato e ne ritorna l'id — condiviso tra
// app/percorsi-per-te/page.tsx (lista completa, bottone "Apri") e app/bacheca/page.tsx (riga
// compatta in Home, Fase 3 di P-O5: prima solo un teaser, ora vere card cliccabili) per non
// duplicare la stessa sequenza in due punti. Nessuno step titolo/data intermedio, stessa logica di
// handleSave del wizard completo (components/upload/RouteBuilder.tsx) applicata a una scelta
// diretta da una card già pronta.
import { buildHikeFromBuilt, buildHikeFromFound, enrichWithPois, enrichBuiltCandidateForImport, enrichFoundCandidateForImport } from '@/lib/routeBuilder/buildHikeFromCandidate'
import { savePlanned } from '@/lib/plannedStore'
import { computeCtsForHike } from '@/lib/computeCtsForHike'
import { computeSafetyForHike } from '@/lib/computeSafetyForHike'
import { defaultPendingExpiresAt } from '@/components/upload/sharedHelpers'
import { routeTypeLabel } from '@/lib/routeBuilder/loopBuilder'
import type { RecommendationCard } from '@/lib/routeBuilder/generateRecommendations'
import type { ScoredCandidate } from '@/lib/routeBuilder/scoreCandidates'
import type { FoundRouteItem } from '@/lib/routeBuilder/foundRoute'

export async function openRecommendationCard(card: RecommendationCard): Promise<string> {
  const pendingExpiresAt = await defaultPendingExpiresAt()
  // Entrambi i tipi di card arrivano con quota STIMATA (generateRecommendations.ts non chiama mai
  // il DTM reale durante la generazione, né per "Su misura" né per "Esistenti") — arricchita qui,
  // una sola volta, per la sola card scelta.
  const hike = card.kind === 'built'
    ? buildHikeFromBuilt(await enrichBuiltCandidateForImport(card.data as ScoredCandidate), `${routeTypeLabel((card.data as ScoredCandidate).type)} per te`, '', pendingExpiresAt)
    : buildHikeFromFound(await enrichFoundCandidateForImport(card.data as FoundRouteItem), (card.data as FoundRouteItem).name, '', pendingExpiresAt)
  await enrichWithPois(hike)
  await savePlanned(hike)
  computeCtsForHike(hike).catch(() => {})
  computeSafetyForHike(hike).catch(() => {})
  return hike.id
}
