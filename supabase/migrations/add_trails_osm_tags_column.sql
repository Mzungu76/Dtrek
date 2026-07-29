-- Tag OSM del sentiero (accesso, superficie, network...) usati da "Condizioni attuali"
-- (app/api/trails/conditions/route.ts) per modulare il segnale meteo — vedi lib/trailConditions/
-- osmTags.ts. Prima di questa colonna venivano rifatti da zero via Overpass ad ogni apertura di
-- ogni guida con un sentiero riconosciuto, anche se non cambiano quasi mai: stessa tabella e stesso
-- pattern "cache per sempre, popolata al bisogno" già in uso per geometry_simplified in questa
-- stessa tabella, non una cache nuova con scadenza. NULL = non ancora richiesti (non lo stesso di
-- "richiesti e risultati vuoti", che si salva come {} — vedi il codice, non solo la colonna).
-- Esegui nel Supabase SQL Editor (idempotente).

ALTER TABLE trails ADD COLUMN IF NOT EXISTS osm_tags jsonb;
