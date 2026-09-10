-- Flag di rollout per la Fase 4 di docs/diario-a-libro-piano.md: il nuovo routing "a libro" per
-- Percorso/Guida/Reportage dentro il Diario (Fase 3) resta dietro un booleano finché non è stato
-- validato in produzione con dati reali — stesso principio già seguito dal piano "Diario come
-- fulcro" (Fase 7 lì). Scoped SOLO al punto d'ingresso Percorso del Diario
-- (/diari/[id]/percorsi/[percorsoId]): /guida/[id] e /resoconto/[id] standalone restano sempre sul
-- motore invariato, a prescindere da questo flag. Default spento — vedi
-- components/profilo/SectionAvanzate.tsx per come si accende sul proprio account durante la
-- validazione.
--
-- Esegui nel Supabase SQL Editor (idempotente).

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS diario_libro_enabled BOOLEAN NOT NULL DEFAULT false;
