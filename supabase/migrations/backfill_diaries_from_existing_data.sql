-- ═══════════════════════════════════════════════════════════
-- Diario come fulcro — backfill che segue add_diaries_table.sql (va eseguito dopo, mai prima).
--
-- Tre passi, tutti idempotenti (rieseguibile senza duplicare nulla):
--  1. Crea "Il mio Diario" (is_default = true) per ogni utente che ha almeno un planned_hikes o
--     una activity ma non ha ancora un Diario di default.
--  2. Assegna diary_id (verso il Diario di default appena creato o già esistente) a ogni
--     planned_hikes ancora senza diary_id.
--  3. Ogni activity senza linked_planned_id (import diretto, mai passato da un piano) non ha oggi
--     un Percorso genitore — ne crea uno sintetico copiando titolo/statistiche/traccia
--     dall'attività stessa, già marcato first_completed_at (l'uscita è già avvenuta), e collega
--     l'attività ad esso. Necessario perché nel nuovo modello ogni Reportage vive dentro un
--     Percorso — senza questo passo, le attività importate senza piano resterebbero orfane.
--
-- Esegui nel Supabase SQL Editor, DOPO add_diaries_table.sql.
-- ═══════════════════════════════════════════════════════════

-- ── 1. Diario di default per utente ─────────────────────────────────────────
INSERT INTO diaries (user_id, title, is_default)
SELECT DISTINCT u.user_id, 'Il mio Diario', true
FROM (
  SELECT user_id FROM planned_hikes WHERE user_id IS NOT NULL
  UNION
  SELECT user_id FROM activities WHERE user_id IS NOT NULL
) u
WHERE NOT EXISTS (
  SELECT 1 FROM diaries d WHERE d.user_id = u.user_id AND d.is_default = true
);

-- ── 2. diary_id sui planned_hikes esistenti ─────────────────────────────────
UPDATE planned_hikes ph
SET diary_id = d.id
FROM diaries d
WHERE d.user_id = ph.user_id AND d.is_default = true AND ph.diary_id IS NULL;

-- ── 3. Percorso sintetico per ogni activity orfana ──────────────────────────
DO $$
DECLARE
  act RECORD;
  new_planned_id TEXT;
  default_diary_id UUID;
BEGIN
  FOR act IN
    SELECT * FROM activities
    WHERE linked_planned_id IS NULL
      AND user_id IS NOT NULL
  LOOP
    SELECT id INTO default_diary_id
    FROM diaries
    WHERE user_id = act.user_id AND is_default = true
    LIMIT 1;

    -- Non dovrebbe mai succedere dopo il passo 1, ma senza un Diario non c'è dove archiviare
    -- il Percorso sintetico: salta l'attività invece di far fallire l'intero backfill.
    CONTINUE WHEN default_diary_id IS NULL;

    new_planned_id := gen_random_uuid()::text;

    INSERT INTO planned_hikes (
      id, user_id, diary_id, title, distance_meters, elevation_gain, elevation_loss,
      altitude_max, altitude_min, estimated_time_seconds, route_polyline, track_points,
      first_completed_at, created_at
    ) VALUES (
      new_planned_id, act.user_id, default_diary_id,
      COALESCE(act.title, 'Percorso'),
      COALESCE(act.distance_meters, 0), COALESCE(act.elevation_gain, 0), COALESCE(act.elevation_loss, 0),
      act.altitude_max, act.altitude_min, COALESCE(act.total_time_seconds, 0),
      act.route_polyline, act.track_points,
      COALESCE(act.start_time, act.created_at, NOW()), COALESCE(act.created_at, NOW())
    );

    UPDATE activities SET linked_planned_id = new_planned_id WHERE id = act.id;
  END LOOP;
END $$;
