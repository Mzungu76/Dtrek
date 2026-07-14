# 🥾 DTrek — diario di trekking

App Next.js 14 (App Router, TypeScript) per pianificare, navigare e registrare escursioni.

## Architettura dati (stato reale, non aspirazionale)

L'app è a metà di una migrazione verso un modello **local-first**: non tutte le entità sono
allo stesso punto, quindi non va assunto che "local-first" sia già lo stato di tutto il codice.

- **Local-first (IndexedDB + coda di sync in background)**: user settings, resoconti di
  escursione, percorsi pianificati, attività (GPX/TCX importati) e risposte al questionario.
  Lo strato locale vive in `lib/localStore.ts` (key/value + outbox di scritture pendenti) e
  `lib/sync/syncEngine.ts` (motore di flush generico, con debounce e retry); ogni entità
  registra il proprio handler (vedi `lib/sync/userSettingsStore.ts`, `lib/plannedStore.ts`,
  `lib/blobStore.ts`, `lib/questionnaireStore.ts`). Le letture sono cache-first, le scritture
  si applicano subito in locale e vengono sincronizzate in background verso Supabase.
- **Supabase diretto (nessun local-first)**: la maggior parte delle altre feature — guida AI,
  sessioni/storico di navigazione, condizioni sentiero, condivisione/report pubblici, dati
  admin, sorgenti POI/PTPR, cache di specie (Wikidata/GBIF) — legge e scrive Supabase
  direttamente dalle route API, senza cache locale né supporto offline.
- **Vercel Blob**: ancora presente (`lib/blobIndex.ts`, `lib/plannedIndex.ts`) come percorso
  legacy dall'architettura pre-Supabase — usato da `app/api/migrate/route.ts` (migrazione
  una tantum) e come fallback di lettura in un paio di route. Non è più lo storage primario.

Se devi modificare una feature, verifica prima in quale categoria ricade prima di assumere
che segua il pattern local-first o quello Supabase-diretto.

## Sviluppo locale

```bash
npm install
cp .env.example .env.local
# .env.example copre solo le integrazioni geo-dati opzionali — mancano ancora le variabili
# Supabase (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY),
# KV_REST_API_URL/TOKEN (Upstash, cache chiavi AI) e ANTHROPIC_API_KEY (guida "Giulia").
npm run dev
```

## Deploy

Push su GitHub → import su Vercel, deploy automatico ad ogni push. Il progetto Supabase va
configurato separatamente (schema in `supabase-schema.sql` e `supabase/migrations/`).
