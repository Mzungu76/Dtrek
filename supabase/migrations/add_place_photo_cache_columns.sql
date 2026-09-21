-- ═══════════════════════════════════════════════════════════
-- Cache della foto di copertina per una Meta Borgo/Città o Sito (discussione "Guida Borgo/Città
-- e Sito", 2026-09-21) — dtrek_places.image_url esiste già ma nessuna fonte della pipeline lo
-- popola oggi (verificato: MiC/ArCo lo esclude esplicitamente, OSM/Wikidata non lo toccano). La
-- fonte reale è lib/placePhotoCache.ts (Wikidata P18 → Wikipedia thumbnail → geosearch Wikimedia
-- Commons, in quest'ordine di precisione), interrogata dal vivo e persistita qui — stesso
-- principio già in uso per le foto delle specie (species_image_fallback/lib/wikidataFallback.ts):
-- mai ripetere la stessa ricerca ad ogni apertura della Guida, e salvare anche l'esito negativo.
--
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS). Stesso blocco anche in
-- supabase-schema.sql.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE dtrek_places ADD COLUMN IF NOT EXISTS image_credit text;
ALTER TABLE dtrek_places ADD COLUMN IF NOT EXISTS image_checked_at timestamptz;

COMMENT ON COLUMN dtrek_places.image_credit IS
  'Attribuzione da mostrare sotto image_url quando viene da Wikimedia Commons (quasi sempre CC BY-SA) — vedi lib/placePhotoCache.ts.';
COMMENT ON COLUMN dtrek_places.image_checked_at IS
  'Timestamp dell''ultima ricerca foto (riuscita o no). NULL = mai cercata. Valorizzato con image_url ancora NULL = cercata, nessuna foto trovata: non ri-interrogare.';
