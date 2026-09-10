-- Regione di casa dell'utente (P-O5 in UX-AUDIT.md, Fase 4) — a differenza di gift_route_offered_at
-- (che segna solo se il passo del regalo è stato proposto), questo campo persiste la regione scelta
-- durante l'onboarding (auto-rilevata via geolocalizzazione o scelta manualmente in
-- components/onboarding/GiftRouteStep.tsx) come dato riusabile ovunque nell'app serva un primo segnale
-- geografico senza AI — non solo per il percorso omaggio, che resta l'unico consumatore finché non ne
-- arrivano altri. Slug di lib/italianRegions.ts (es. 'lazio'), NULL se l'utente ha scelto
-- esplicitamente "preferisco non specificare" invece di una regione.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS home_region TEXT;
