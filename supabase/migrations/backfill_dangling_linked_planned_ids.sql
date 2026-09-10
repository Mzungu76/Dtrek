-- ═══════════════════════════════════════════════════════════
-- Diario come fulcro — completamento del backfill in backfill_diaries_from_existing_data.sql.
-- Quello script sanava solo le activities con linked_planned_id NULL (mai state collegate a un
-- piano). Restano le activities il cui linked_planned_id punta a un planned_hikes ormai
-- inesistente: uscite completate PRIMA di questa sessione, quando "Sovrascrivi il percorso
-- pianificato" cancellava davvero la riga collegata (comportamento rimosso da
-- lib/activitySave.ts — un Percorso ora non si cancella più). Stessa cura delle attività orfane:
-- un Percorso sintetico per ciascuna, così ogni Reportage ha sempre un Percorso genitore.
--
-- Idempotente (il WHERE esclude le activities già sanate). Esegui nel Supabase SQL Editor DOPO
-- add_diaries_table.sql e backfill_diaries_from_existing_data.sql.
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
  act RECORD;
  new_planned_id TEXT;
  default_diary_id UUID;
BEGIN
  FOR act IN
    SELECT a.* FROM activities a
    WHERE a.linked_planned_id IS NOT NULL
      AND a.user_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM planned_hikes p WHERE p.id = a.linked_planned_id)
  LOOP
    SELECT id INTO default_diary_id
    FROM diaries
    WHERE user_id = act.user_id AND is_default = true
    LIMIT 1;

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
