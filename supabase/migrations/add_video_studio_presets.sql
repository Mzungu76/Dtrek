-- ═══════════════════════════════════════════════════════════
-- Stato dello Studio Video salvato su Supabase invece che nel solo localStorage del browser, così
-- segue l'account e non un singolo dispositivo — vedi app/api/video-settings/route.ts e
-- app/api/video-presets/route.ts.
--
-- video_last_settings (colonna JSONB su user_settings): l'ultima configurazione usata nello
-- studio, salvata alla chiusura e riproposta come opzione "Le tue ultime impostazioni" alla
-- riapertura, su qualunque percorso. Una riga sola per utente, come il resto di user_settings.
--
-- video_custom_presets (tabella a sé): preset con nome salvati esplicitamente dall'utente, in
-- numero variabile — non può stare in una colonna di user_settings come le impostazioni sopra.
-- Stesso pattern owner-based di route_search_history (RLS + filtro esplicito lato API).
--
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS video_last_settings JSONB;

CREATE TABLE IF NOT EXISTS video_custom_presets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  label      TEXT NOT NULL,
  cfg        JSONB NOT NULL,   -- VideoConfig — vedi components/RouteMap3D.tsx
  fps        SMALLINT NOT NULL DEFAULT 30
);

CREATE INDEX IF NOT EXISTS idx_video_custom_presets_user ON video_custom_presets (user_id, created_at DESC);

ALTER TABLE video_custom_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "video_custom_presets_owner" ON video_custom_presets;
CREATE POLICY "video_custom_presets_owner"
  ON video_custom_presets FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
