-- ═══════════════════════════════════════════════════════════
-- Seguito di flag_mic_sito_duplicate_coordinates.sql: quella migration aveva escluso dalla
-- ricerca 391 Siti da MiC/ArCo (~10% dell'archivio Siti) con coordinate condivise/inaffidabili,
-- segnalato dal vivo come "abbiamo perso circa il 10% dei siti" (2026-09-18).
--
-- Geocodifica live non disponibile da nessun ambiente di sviluppo (stesso "Bloccante di rete" di
-- ISTAT/PTPR/MiC — verificato di nuovo in questa sessione, anche Nominatim/OSM è negato dal
-- gateway di rete). Tutte e 391 le righe coinvolte hanno però un indirizzo (cis:siteAddress) E un
-- Comune riconosciuto — verificato con una query diretta: ciascuna combacia con ESATTAMENTE un
-- borgo_citta esistente (stesso nome+regione, nessuna ambiguità, nessun Comune mancante). Quel
-- borgo_citta ha già una posizione corretta (centroide ISTAT) — usata qui come ripiego: non la
-- posizione esatta del Sito, ma il Comune giusto invece di un punto a centinaia di km, con la
-- stessa precisione "sufficiente" già accettata per un centroide comunale ISTAT (vedi
-- scripts/places/istat/fetch.ts). La posizione originale (sbagliata) resta in metadata per
-- riferimento, mai persa — una geocodifica precisa futura la sostituirà del tutto.
--
-- metadata.coordinatesUnreliable → false: il filtro di lib/metaSearch/searchSiti.ts le
-- ri-include automaticamente in ricerca, nessuna modifica di codice necessaria oltre a mostrare
-- coordinatesApproximate in UI dove opportuno (app/mete/[id]/page.tsx).
--
-- Idempotente (il WHERE seleziona solo righe ancora coordinatesUnreliable=true; una volta
-- eseguita, una riga non viene più toccata da un secondo run). Esegui DOPO
-- flag_mic_sito_duplicate_coordinates.sql.
-- ═══════════════════════════════════════════════════════════

UPDATE dtrek_places s
SET
  latitude = bc.latitude,
  longitude = bc.longitude,
  confidence = 0.4,
  metadata = s.metadata || jsonb_build_object(
    'coordinatesUnreliable', false,
    'coordinatesApproximate', true,
    'coordinatesApproximateReason',
      'posizione originale MiC/ArCo scartata (condivisa con altri Siti scollegati, probabile bug '
      || 'SPARQL) — sostituita col centro del Comune (' || s.municipality
      || ') in attesa di una geocodifica precisa',
    'coordinatesOriginalLat', s.latitude,
    'coordinatesOriginalLon', s.longitude,
    'coordinatesApproximateFixedAt', now()
  )
FROM dtrek_places bc
WHERE s.meta_type = 'sito' AND (s.metadata->>'coordinatesUnreliable')::boolean IS TRUE
  AND bc.meta_type = 'borgo_citta'
  AND lower(bc.name) = lower(s.municipality)
  AND bc.region = s.region;
