-- ═══════════════════════════════════════════════════════════
-- Diario come fulcro — Fase 0 di docs/diario-fulcro-piano.md (vedi anche l'artifact di
-- mockup "Diario, il fulcro" linkato lì). Introduce l'entità Diario: una raccolta nominata e
-- personalizzabile di Percorsi, condivisibile/stampabile per conto proprio. Ogni utente ha un
-- Diario di default ("Il mio Diario", is_default = true) creato dal backfill che accompagna
-- questa migrazione — non creato qui, perché richiede di leggere gli utenti esistenti.
--
-- planned_hikes diventa la tabella "Percorso": porta già quasi tutto il necessario (cached_guide,
-- cached_trail_score, cached_safety_score, assessment, ecc.) — niente tabella percorsi separata,
-- solo due colonne aggiuntive. first_completed_at sostituisce la cancellazione della riga quando
-- un'attività la consuma (vedi lib/activitySave.ts): un Percorso deve poter essere ricamminato più
-- volte, quindi non sparisce più alla prima uscita, resta l'ancora permanente a cui le attività
-- successive si collegano via activities.linked_planned_id (colonna già esistente, mai stata
-- vincolata a un solo utilizzo).
--
-- Esegui nel Supabase SQL Editor (idempotente).
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS diaries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title         TEXT NOT NULL DEFAULT 'Il mio Diario',
  subtitle      TEXT NOT NULL DEFAULT '',
  author        TEXT NOT NULL DEFAULT '',
  cover_url     TEXT,
  footer_text   TEXT NOT NULL DEFAULT '',
  is_default    BOOLEAN NOT NULL DEFAULT false,
  share_token   UUID,
  share_pdf_url TEXT,
  -- Toggle statistiche/sezioni pubbliche/foto selezionate per resoconto ecc. — stessa forma di
  -- DiaryConfig in lib/diaryConfig.ts, oggi un singolo user_settings.diary_config per utente,
  -- qui uno per Diario.
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un solo Diario di default per utente, e non è opzionale (ogni utente deve poterne avere uno da
-- cui non si può togliere la spunta accidentalmente lasciandone zero).
CREATE UNIQUE INDEX IF NOT EXISTS idx_diaries_one_default_per_user
  ON diaries (user_id) WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_diaries_user ON diaries (user_id);

ALTER TABLE diaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diaries_owner" ON diaries;
CREATE POLICY "diaries_owner"
  ON diaries FOR ALL
  USING     (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Lettura pubblica per link di condivisione (stesso schema di app/leggi/d/[token] oggi su
-- user_settings.diary_token) — solo le righe con un share_token impostato, e solo quella riga.
DROP POLICY IF EXISTS "diaries_public_share" ON diaries;
CREATE POLICY "diaries_public_share"
  ON diaries FOR SELECT
  USING (share_token IS NOT NULL);

-- planned_hikes → Percorso: appartenenza a un Diario + marcatura "vissuto almeno una volta".
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS diary_id UUID REFERENCES diaries(id) ON DELETE SET NULL;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS first_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_planned_hikes_diary ON planned_hikes (diary_id);
