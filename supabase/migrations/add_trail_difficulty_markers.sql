-- ═══════════════════════════════════════════════════════════
-- Tratti difficili segnalati nei file GPX importati (Komoot/AllTrails) —
-- waypoint/commenti del tracciato classificati per gravità (vedi
-- lib/difficultyMarkers.ts). Alimentano la componente Community del
-- punteggio SI (vedi lib/si/signals/communitySignals.ts) e la mappa del
-- percorso. Interrogata per prossimità geografica (lat/lon), non per FK
-- rigida, così funziona sia per planned_hikes standalone sia per trail OSM
-- già matchati.
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trail_difficulty_markers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planned_hike_id TEXT REFERENCES planned_hikes(id) ON DELETE CASCADE,
  lat             DOUBLE PRECISION NOT NULL,
  lon             DOUBLE PRECISION NOT NULL,
  source          TEXT NOT NULL,           -- 'gpx_waypoint' | 'gpx_track_cmt'
  source_text     TEXT NOT NULL,
  severity        TEXT NOT NULL,           -- 'info' | 'warning' | 'danger'
  keywords        TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_difficulty_markers_planned_hike ON trail_difficulty_markers (planned_hike_id);
CREATE INDEX IF NOT EXISTS idx_difficulty_markers_latlon       ON trail_difficulty_markers (lat, lon);
