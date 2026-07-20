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

## Note operative — sincronizzazione tra dispositivi

Un guasto reale (mesi di `PATCH`/`POST` falliti in silenzio su `activities`/`planned_hikes`,
poi un service worker rimasto bloccato su una versione vecchia) ha reso i salvataggi invisibili
tra un dispositivo e l'altro. Punti da tenere a mente per non farlo ripetere:

- **Dopo qualunque `ALTER TABLE` su `activities`, `planned_hikes` o `user_settings`** (tabelle già
  in uso), esegui sempre `NOTIFY pgrst, 'reload schema';` — PostgREST non ricarica da solo la
  cache dello schema quando si aggiunge una colonna, e ogni upsert/update che la referenzia fallisce
  con `PGRST204` finché non lo fai. Vedi il blocco dedicato in fondo a `supabase-schema.sql` e
  `supabase/migrations/reload_postgrest_schema_cache.sql`.
- **`public/sw.js`** ha `Cache-Control: no-cache` (vedi `next.config.js`) e
  `components/ServiceWorkerRegister.tsx` chiama `registration.update()` ad ogni apertura
  dell'app, così un dispositivo non può restare bloccato per ore su una versione vecchia del
  service worker (e quindi sulla sua logica di fetch API vecchia) come è successo prima di
  questa correzione.
- La sincronizzazione tra dispositivi combina pull periodico/su trigger (apertura app,
  riconnessione, tab tornata visibile — `lib/sync/pullEngine.ts`,
  `components/SyncEngineProvider.tsx`) e push istantaneo via Supabase Realtime
  (`lib/sync/realtimeSync.ts`, richiede le tabelle nella pubblicazione `supabase_realtime` e
  `REPLICA IDENTITY FULL` — altrimenti gli eventi DELETE vengono scartati in silenzio dalla RLS).
