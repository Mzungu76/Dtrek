-- Percorso omaggio (docs/navigator-dtrek-boundary.md), seguito di add_gift_route_sample_columns.sql
-- — per ora il regalo è solo la pianificazione (dati calcolati: distanza, dislivello, POI reali da
-- Overpass/Wikipedia, punteggi sicurezza/bellezza), senza testo generato da Claude né un resoconto
-- collegato (nessuno ha davvero percorso il sentiero) — decisione esplicita, non un'omissione.
-- 'activities'/'hike_reports' restano comunque nell'allowlist sotto: se in futuro si aggiunge un
-- resoconto d'esempio, la funzione di clonazione è già pronta a coprirlo.
--
-- Clona una riga in una di queste tre tabelle per un nuovo utente, con nuovo id e nuovo user_id —
-- generica (via to_jsonb/jsonb_populate_record) invece di un elenco di colonne scritto a mano,
-- così resta corretta anche quando in futuro si aggiungono colonne a planned_hikes/activities/
-- hike_reports (è già successo molte volte, vedi le ALTER TABLE sopra in questo stesso file).
-- p_extra sovrascrive/aggiunge campi oltre a id/user_id (es. is_sample, sample_region, activity_id
-- per il resoconto clonato che deve puntare alla NUOVA activity, non a quella master).
CREATE OR REPLACE FUNCTION clone_row_for_user(
  p_table       text,
  p_source_id   text,
  p_new_id      text,
  p_new_user_id uuid,
  p_extra       jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
BEGIN
  IF p_table NOT IN ('planned_hikes', 'activities', 'hike_reports') THEN
    RAISE EXCEPTION 'clone_row_for_user: tabella non consentita: %', p_table;
  END IF;

  EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE id = $1', p_table)
    INTO v_row
    USING p_source_id;

  IF v_row IS NULL THEN
    RAISE EXCEPTION 'clone_row_for_user: riga sorgente non trovata in % (id=%)', p_table, p_source_id;
  END IF;

  -- jsonb_populate_record con base null::TABELLA lascia NULL ogni chiave assente dal jsonb (non il
  -- DEFAULT della colonna) — created_at/updated_at vanno quindi rimpiazzati con un valore esplicito,
  -- non solo rimossi, altrimenti l'INSERT fallisce sul vincolo NOT NULL di updated_at (visto dal
  -- vivo sul primo tentativo di clonazione: 23502 null value in column "updated_at").
  v_row := (v_row - 'id' - 'user_id' - 'created_at' - 'updated_at')
           || jsonb_build_object('id', p_new_id, 'user_id', p_new_user_id, 'created_at', now(), 'updated_at', now())
           || p_extra;

  EXECUTE format('INSERT INTO %I SELECT * FROM jsonb_populate_record(null::%I, $1)', p_table, p_table)
    USING v_row;
END;
$$;
