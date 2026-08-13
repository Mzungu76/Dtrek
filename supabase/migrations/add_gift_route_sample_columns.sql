-- Percorso omaggio per nuovo utente (docs/navigator-dtrek-boundary.md) — un percorso/resoconto
-- "master" per regione, taggato is_sample, clonato nell'account di ogni nuovo utente al primo
-- accesso (lib/giftRoute.ts). sample_region è NULL su ogni riga normale; valorizzato solo sulle
-- righe master, con uno slug di lib/italianRegions.ts (es. 'sardegna', 'puglia').
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS is_sample     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE planned_hikes ADD COLUMN IF NOT EXISTS sample_region TEXT;

ALTER TABLE hike_reports  ADD COLUMN IF NOT EXISTS is_sample     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE hike_reports  ADD COLUMN IF NOT EXISTS sample_region TEXT;
