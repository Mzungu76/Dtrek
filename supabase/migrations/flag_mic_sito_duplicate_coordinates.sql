-- ═══════════════════════════════════════════════════════════
-- Bug segnalato dal vivo (2026-09-18): pin "Sito" posizionati fuori dalla loro posizione reale
-- sulla mappa di test (components/mete/MeteSearchMap.tsx). Causa isolata con una query diretta:
-- 391 Siti importati da MiC/ArCo (source='mic') condividono coordinate IDENTICHE (fino alla sesta
-- cifra decimale) con altri Siti chiaramente diversi e scollegati — il caso peggiore, un unico
-- punto in centro Roma, è condiviso da 20 luoghi sparsi in tutta Italia (Caserta, Savona, Messina,
-- Verbania...). Sospetto forte: un bug nella query SPARQL d'importazione
-- (scripts/places/mic/fetch.ts) — ?site arriva da un OPTIONAL precedente e, quando un record non
-- ha affatto un cis:hasSite, resta una variabile libera invece che assente: i successivi
-- OPTIONAL { ?site geo:lat ... } possono legarla a una risorsa arbitraria del grafo invece di non
-- trovare nulla, un classico prodotto incrociato SPARQL. Non verificabile da un ambiente di
-- sviluppo locale (stesso "Bloccante di rete" documentato in scripts/places/mic/README.md — solo
-- GitHub Actions raggiunge dati.cultura.gov.it), quindi qui si interviene solo sui DATI già
-- importati, non sulla query stessa.
--
-- Un pin in un punto sbagliato è peggio di nessun pin (piano §48.8, mai un dato fabbricato o
-- inaffidabile spacciato per buono): queste righe restano nel catalogo (mai cancellate — un
-- intervento umano futuro potrebbe correggerne la posizione da una fonte migliore) ma smettono di
-- comparire in ricerca finché non hanno una posizione verificata — vedi il filtro aggiunto in
-- lib/metaSearch/searchSiti.ts su metadata.coordinatesUnreliable.
--
-- Idempotente (il WHERE via il JOIN su coordinate duplicate individua sempre lo stesso insieme;
-- una riga già marcata viene semplicemente rimarcata con lo stesso valore). Esegui nel Supabase
-- SQL Editor in qualunque momento — nessuna dipendenza da altre migration.
-- ═══════════════════════════════════════════════════════════

WITH dup_coords AS (
  SELECT latitude, longitude, count(*) AS n_condivisi
  FROM dtrek_places
  WHERE meta_type = 'sito' AND source = 'mic'
  GROUP BY latitude, longitude
  HAVING count(*) > 1
)
UPDATE dtrek_places p
SET
  metadata = p.metadata || jsonb_build_object(
    'coordinatesUnreliable', true,
    'coordinatesUnreliableReason',
      'coordinate identiche condivise con altri ' || (dp.n_condivisi - 1)
      || ' Siti — probabile bug della query SPARQL MiC/ArCo (variabile ?site non vincolata in '
      || 'scripts/places/mic/fetch.ts), individuato 2026-09-18',
    'coordinatesUnreliableFlaggedAt', now()
  ),
  confidence = least(p.confidence, 0.1)
FROM dup_coords dp
WHERE p.meta_type = 'sito' AND p.source = 'mic'
  AND p.latitude = dp.latitude AND p.longitude = dp.longitude;
