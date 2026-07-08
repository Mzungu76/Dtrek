-- Stesso blocco anche in supabase-schema.sql
-- Livello della guida turistica generata (breve = automatica all'import, con testo AI solo
-- sulle sezioni scelte in guide_breve_sections; approfondita = generata su richiesta con
-- "Approfondisci", testo AI su tutte le sezioni). NULL con cached_guide già popolato indica
-- una guida generata prima di questa colonna (formato legacy, resa comunque leggibile).
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS guide_tier TEXT CHECK (guide_tier IN ('breve','approfondita'));
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS guide_generated_at TIMESTAMPTZ;

-- Sezioni (massimo 2) per cui la guida Breve genera testo AI — le altre restano solo-widget.
-- NULL/vuoto ⇒ default applicato lato server: prima_di_partire + il_percorso.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS guide_breve_sections TEXT[];
