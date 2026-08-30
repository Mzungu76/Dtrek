# ISTAT → dtrek_places

Non ancora implementato. Serve la base geografica dei Comuni italiani (piano
`docs/piano-mete-multitipologia.md` §4.1): "ISTAT Basi Territoriali" (ISTAT definisce entità
territoriali — Dtrek applica poi la propria classificazione turistica sopra, mai `Comune = Borgo`,
vedi piano §6).

## Perché non è nel commit

Questo ambiente non ha accesso di rete al portale ISTAT (nessuna connessione in uscita consentita
verso domini esterni fuori dagli host già usati dall'app). Il download va fatto da un ambiente con
accesso di rete reale (locale, o un altro ambiente Claude Code con network policy diversa) — vedi
le istruzioni Supabase del progetto: "Prefer local development and testing before applying changes
to a remote project."

## Cosa serve

- Dataset: ISTAT "Basi Territoriali" (edizione più recente disponibile al momento del download —
  verificarne l'URL corrente su istat.it, non copiare un link non verificato in questa sessione).
  Formato tipico: Geopackage/Shapefile con confini comunali + tabella attributi (nome Comune,
  codice ISTAT, provincia, regione).
- Estrarre almeno: nome Comune, codice ISTAT, provincia, regione, geometria (poligono confine
  amministrativo) e/o centroide.

## Interfaccia attesa

Un `fetch.ts` in questa cartella che legge il file scaricato in `data/istat/` (stesso pattern di
`data/ptpr/`, gitignored) e produce `PlaceCandidate[]` (vedi `scripts/places/types.ts`) con:

```ts
{
  metaType: 'borgo_citta',
  subtype: undefined,   // la classificazione borgo/città (piano §6) NON viene da ISTAT — resta da
                         // decidere in un passo successivo (Blocco C), ISTAT dà solo l'entità
                         // amministrativa e le sue coordinate
  municipality: <nome Comune>,
  municipalityIstatCode: <codice ISTAT>,
  province, region,
  source: 'istat',
  sourceId: <codice ISTAT>,
  confidence: 1,
}
```

Poi passarli a `importPlaceCandidates()` da `scripts/places/import.ts`, come fa già
`scripts/places/ptpr/import.ts`.
