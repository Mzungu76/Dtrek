-- "Percorsi per te" — cronologia di rotazione: quali percorsi (per osmId) sono già stati proposti
-- e quando, per evitare di riproporre sempre la stessa cinquina in una raggiera stretta.
-- Vedi lib/routeBuilder/generateRecommendations.ts.
-- Esegui nel Supabase SQL Editor (idempotente).

ALTER TABLE route_recommendations
  ADD COLUMN IF NOT EXISTS shown_history JSONB NOT NULL DEFAULT '{}';
-- { [osmId]: { lastShownAt: ISO string, timesShown: number } }
