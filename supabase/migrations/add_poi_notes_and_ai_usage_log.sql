-- ═══════════════════════════════════════════════════════════
-- poi_notes — cross-hike cache of AI-generated POI narrative text (Guida IA, ago 2026)
-- ai_usage_log — raw token counter for every guide-generation Claude call (same effort)
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════

-- poi_notes: la sezione "I luoghi da non perdere" della guida (app/api/guide/route.ts) genera già,
-- dentro la stessa chiamata IA che produce tutta la guida, un blocco "### Nome luogo" per ogni POI
-- con un vero racconto storico — nessuna chiamata IA aggiuntiva qui, solo persistenza di un output
-- che oggi viene scartato non appena renderizzato una volta. Chiave = poi_id (id OSM, lo stesso già
-- usato per la deduplica in app/lib/guide/buildGuideContent.ts): due percorsi diversi che passano
-- dallo stesso luogo condividono automaticamente lo stesso testo, senza rilevare quanto i percorsi
-- si somiglino (decisione 2, vedi artifact "La Guida IA").
CREATE TABLE IF NOT EXISTS poi_notes (
  poi_id          bigint NOT NULL,
  lang            text NOT NULL DEFAULT 'it',
  name            text NOT NULL,
  text            text NOT NULL,
  source_hike_id  uuid,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (poi_id, lang)
);

-- Public cache table, no user-owned data — same reasoning as dtm_cache/other shared caches:
-- server (service_role) is the only writer, read access is harmless to expose.
ALTER TABLE poi_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "poi_notes_public_read" ON poi_notes;
CREATE POLICY "poi_notes_public_read" ON poi_notes FOR SELECT USING (true);

-- ai_usage_log: token counter per chiamata Claude nella generazione guida (narrazione principale +
-- "Verificato online", le due chiamate in app/api/guide/route.ts) — costruito per rispondere con
-- dati reali, non stime, a "quanto costa in media/al massimo generare un percorso" (serve a
-- dimensionare i tetti di volume dei pacchetti, decisione 3). Costo in denaro NON calcolato qui:
-- le tariffe cambiano, si ricava a query-time dai token grezzi.
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        uuid,
  hike_id        uuid,
  feature        text NOT NULL,
  model          text NOT NULL,
  input_tokens   integer NOT NULL,
  output_tokens  integer NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created_at ON ai_usage_log (created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_feature ON ai_usage_log (feature);

-- Tabella interna di costo/telemetria, non dati utente da esporre: RLS abilitata senza alcuna
-- policy pubblica — solo il client service_role (server) può leggerla o scriverla.
ALTER TABLE ai_usage_log ENABLE ROW LEVEL SECURITY;
