# Regione Toscana → dtrek_places (Siti) — riserva, non priorità

**Non partire da qui.** Prima verifica `scripts/places/mic/fetch.ts` — vedi
`scripts/places/mic/README.md` sezione "Toscana" e il commento in cima a
`scripts/places/toscana/probe.ts`. Questo file esiste solo come piano B, pronto da usare SE quel
test conferma una copertura povera anche col fix già applicato.

## Perché questa cartella esiste

Verifica utente (2026-09-25): 0 Siti con `source='mic'` per la Toscana in Supabase, stesso ordine
di gravità del caso Lombardia (2 record) che aveva già richiesto una fonte dedicata
(`scripts/places/lombardia/`, SIRBeC via ArcGIS, 651 record verificati).

**Differenza importante rispetto alla scoperta Lombardia**: quando fu costruita la fonte Lombardia,
`mic/fetch.ts` NON aveva ancora la geocodifica di ripiego per i record ArCo senza coordinate
dirette (aggiunta il 2026-09-21/22, commento "coordinate mancanti Lombardia/Toscana" in cima a
`fetch.ts`). Quel fix è stato verificato dal vivo SOLO sulla Lombardia (run GitHub Actions
2026-09-22: 6 record trovati, 6/6 geocodificati con successo via Nominatim). Il valore "Toscana: 0"
osservato oggi risale invece a un run precedente a quel fix (2026-09-17) — quindi probabilmente
obsoleto, non un dato aggiornato.

## Piano in due fasi

1. **Fase 1 (priorità)**: appena le GitHub Actions sono di nuovo disponibili, lanciare
   `mode: dry-run`, `region: Toscana` sul workflow "Import Places — MiC" — nessun codice nuovo
   necessario, `fetch.ts` è già pronto. Se il numero di Siti trovati (con coordinate dirette o
   geocodificate) è ragionevole, la Toscana potrebbe non aver bisogno affatto di una fonte
   dedicata.
2. **Fase 2 (riserva, solo se la Fase 1 conferma una copertura povera)**: usare
   `scripts/places/toscana/probe.ts` per verificare dal vivo le fonti candidate elencate nel
   commento in cima al file (CKAN `dati.toscana.it`, GEOscopio/GeoServer regionale,
   eventualmente LaMMA) — stesso metodo già usato per la Lombardia (probe → describe/dry-run →
   write), nessuna fonte scelta prima di una verifica con dati reali.

## Bloccante di rete

Stesso limite già documentato per MiC/PTPR/Lombardia: nessun ambiente di sviluppo (incluse le
sessioni Claude) raggiunge `dati.toscana.it` o `regione.toscana.it` — solo GitHub Actions ci
arriva. Nessuno dei probe in `probe.ts` è stato eseguito dal vivo: sono candidati trovati via
WebSearch in questa sessione (2026-09-25), da verificare con `mode: probe` quando le Action
saranno di nuovo disponibili.

## Uso

```bash
npx tsx scripts/places/toscana/probe.ts                              # diagnostica fonti candidate
npx tsx scripts/places/toscana/probe.ts --only "ckan-package-search-beni-culturali"
```
