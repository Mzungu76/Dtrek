# 🥾 Diario Trekking — con Vercel Blob

App Next.js per registrare e visualizzare le tue escursioni tramite file TCX.
I dati vengono archiviati permanentemente su **Vercel Blob**.

## Configurazione Vercel Blob

### 1. Crea il Blob Store su Vercel

1. Apri la dashboard Vercel → seleziona il progetto
2. Vai su **Storage** → **Create Database** → **Blob**
3. Dai un nome (es. `trekking-diary-blob`) e crea
4. Nella sezione **Settings** del Blob Store → clicca **Connect to Project** → seleziona il tuo progetto

La variabile `BLOB_READ_WRITE_TOKEN` viene aggiunta **automaticamente** alle variabili d'ambiente del progetto.

### 2. Per lo sviluppo locale

```bash
# Copia il file esempio
cp .env.local.example .env.local

# Inserisci il token che trovi su Vercel → Storage → il tuo Blob Store → Settings → Tokens
# BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

npm install
npm run dev
```

## Deploy

Carica su GitHub e importa su Vercel. Il deploy è automatico ad ogni `git push`.

Assicurati che il Blob Store sia **connesso al progetto** prima del primo deploy.

## Struttura dati su Blob

```
activities/
  index.json           ← lista leggera di tutte le escursioni (ActivityMeta[])
  2026-05-23T06_49_54Z.json   ← dati completi di ogni escursione
  ...
```

## Aggiornamento dal progetto v1 (localStorage)

Sostituire i file seguenti con quelli di questa patch:

| File da sostituire / aggiungere | Motivo |
|---|---|
| `package.json` | aggiunge `@vercel/blob` |
| `lib/blobStore.ts` | nuovo store (sostituisce `lib/store.ts`) |
| `app/api/activities/route.ts` | nuovo — GET lista |
| `app/api/activity/route.ts` | nuovo — GET/POST/PATCH/DELETE |
| `app/page.tsx` | usa `blobStore` |
| `app/upload/page.tsx` | usa `blobStore` |
| `app/escursione/[id]/page.tsx` | usa `blobStore` |
| `app/statistiche/page.tsx` | usa `blobStore` |

Il file `lib/store.ts` originale **non va eliminato** se `utils/exportExcel.ts` e `utils/exportDoc.ts` vi fanno riferimento — ma in questo progetto già usano direttamente `StoredActivity` importato da `blobStore.ts`.
