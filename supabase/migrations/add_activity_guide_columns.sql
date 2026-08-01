-- ═══════════════════════════════════════════════════════════
-- La guida del percorso sopravvive all'escursione completata
--
-- Il testo della guida scritto da Giulia vive su planned_hikes (cached_guide e compagni), e quella
-- riga viene CANCELLATA quando l'uscita pianificata viene "consumata" in un'attività completata
-- (lib/activitySave.ts, deleteLinkedPlanned). Finora il resoconto — e quindi il video — nasceva
-- perciò senza nessun testo di guida e senza l'abbinamento POI↔Wikipedia già pagato in fase di
-- generazione: informazione prodotta una volta e buttata via.
--
-- Queste colonne conservano quel materiale sull'attività al momento del salvataggio, così la
-- modalità video "Illustrativo" può raccontare il percorso (didascalie, avvisi di sicurezza,
-- immagini dei luoghi) invece di limitarsi a mostrarlo.
--
-- Nessun backfill possibile: per le attività già salvate il piano è stato eliminato e il testo non
-- è più recuperabile. Le colonne restano NULL e il video degrada senza errori.
--
-- Esegui nel Supabase SQL Editor (idempotente, IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════

-- Markdown completo della guida ("## Sezione\n\ncorpo"), stesso formato di planned_hikes.cached_guide
ALTER TABLE activities ADD COLUMN IF NOT EXISTS guide_text text;

-- Sottotitolo da copertina scritto dall'AI alla generazione (tag [sottotitolo])
ALTER TABLE activities ADD COLUMN IF NOT EXISTS guide_subtitle text;

-- Avvisi su chiusure/deviazioni/lavori trovati dalla ricerca web alla generazione.
-- Forma: [{severity:'danger'|'warning'|'info', text:string}] — le guide più vecchie hanno
-- stringhe semplici, normalizzare con normalizeGuideNotices() prima dell'uso (lib/guideNotices.ts).
ALTER TABLE activities ADD COLUMN IF NOT EXISTS guide_notices jsonb;

-- Quando la guida è stata generata. NON è un dettaglio di servizio: gli avvisi qui sopra sono una
-- fotografia del web a quella data, e un video è un artefatto che resta e circola — chi lo guarda
-- mesi dopo deve poter vedere a quando risale un "sentiero chiuso".
ALTER TABLE activities ADD COLUMN IF NOT EXISTS guide_generated_at timestamptz;

-- Abbinamento POI↔pagina Wikipedia (con thumbnail ed estratto) già risolto in fase di guida.
-- Forma: [{poi: PoiItem, wiki: WikiPage}] — stesso contenuto di planned_hikes.cached_poi_wiki.
ALTER TABLE activities ADD COLUMN IF NOT EXISTS poi_wiki jsonb;
