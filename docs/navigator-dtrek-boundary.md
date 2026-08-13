# Confine Navigator ↔ Dtrek — stato e decisioni aperte

Sintesi di sessione (2026-08-13), da riprendere prima di toccare layout Navigator o codice di paywall.

## Lavoro tecnico completato in questa sessione (pushato su `claude/dtrek-navigation-engine-18lu5c`)

1. Limite Navigator (3 percorsi, `lib/navigatorSlot.ts`) + CTA di upgrade.
2. Contatore d'uso AI (`ai_usage_log`) + cache condivisa per-POI `poi_notes` (cross-utente, cross-hike) — scrittura lato Dtrek.
3. Navigator legge `poi_notes` (online-first).
4. Dtrek: il PDF della guida usa `poi_notes` per arricchire le descrizioni POI invece del solo estratto Wikipedia troncato a 300 caratteri (`app/lib/guide/buildGuideContent.ts`, `app/lib/guide/usePDFExport.ts`).
5. Bundling offline di `poi_notes` (`lib/offline/poiNotesStore.ts`, IndexedDB, stesso pattern di `lib/navigation/trailGraphStore.ts`) — la narrazione arricchita sopravvive senza rete sul sentiero una volta scaricato il pacchetto offline. Nuovi campi manifest `hasPoiNotes`/`poiNotesCount`.

Tutto type-check e lint puliti al momento del push.

### Costi AI — stato dei dati

Verificato live su Supabase (progetto `sdxlcpxgbkagbxhukehd`): le tabelle `ai_usage_log` e `poi_notes` esistono ma hanno **0 righe** — nessuna generazione reale è ancora passata dal contatore. Le stime di costo sono quindi ancora teoriche, ricavate dai tetti nel codice (`GUIDE_MAX_TOKENS_CEILING = 18000` in `app/api/guide/route.ts`):

| Scenario | Costo per guida |
|---|---|
| Tipico | ~$0,05–0,10 |
| Caso peggiore (tetto max, raro) | ~$0,30–0,35 |

Query pronta per i numeri reali appena c'è traffico:

```sql
select feature, model, count(*) as n,
       avg(input_tokens) as avg_in, avg(output_tokens) as avg_out,
       max(input_tokens) as max_in, max(output_tokens) as max_out
from ai_usage_log group by feature, model;
```

## Discussione architetturale aperta — Navigator vs Dtrek (NON implementata)

### Problema di partenza

Le due app sono percepite come "fuse" e confusionarie lato utente/business.

### Cosa è stato verificato nel codice

- **Account unico**: corretto, resta così — nessun cambiamento previsto qui.
- Navigator è solo una shell Capacitor separata sullo stesso codebase Next.js (route `/navigatore/*`), non un'app/repo distinta. Il bottone "apri app principale" (`lib/native/mainAppLinks.ts`) apre semplicemente Dtrek nel browser di sistema, **stessa sessione, nessun cancello**.
- Il freemium di oggi (`user_settings.subscription_tier`: `free`/`premium`) gate **solo il costo Claude**: chiave propria (BYOK, sempre gratis) vs. chiave condivisa (`premium`, a pagamento). Non gate l'accesso alle *pagine* — chiunque loggato naviga liberamente Guida/Resoconto e vede solo stati vuoti/CTA se manca l'accesso AI. Nessuna integrazione Stripe/pagamenti trovata nel repo: `subscription_tier` oggi sembra impostabile solo manualmente, non c'è flusso di acquisto self-serve.
- **POI su GPX importato**: già funzionante per utenti Navigator-only, a costo zero. `components/upload/GpxUploader.tsx` arricchisce automaticamente ogni percorso importato con Overpass (POI vicini) + Wikipedia (estratto/foto) al momento del salvataggio, indipendentemente da Dtrek. Quello che manca a un utente Navigator-only è solo il racconto AI più ricco (`poi_notes`) — disponibile solo se *qualcun altro* ha già generato una guida Dtrek che tocca lo stesso POI (cache condivisa).

### Proposta in discussione (non decisa)

- Navigator resta **sempre gratuito**, limitato (percorsi, POI base via Overpass/Wikipedia).
- Dtrek diventa **prodotto a pagamento**: premium ricorrente + una tantum + BYOK come *metodo di sblocco alternativo* di Dtrek (non più un tier gratuito parallelo dentro Dtrek).
- Tecnicamente: spostare il gate da "bottone genera" a "ingresso nelle sezioni Dtrek" — probabilmente a livello di `layout.tsx` per `/guida/*` e `/resoconto/*`, dato che esistono link diretti che bypassano l'hub (es. redirect a `/guida/${id}` subito dopo un import GPX in `GpxUploader.tsx`).

### Decisioni prese (2026-08-13, seconda parte sessione) — chiuse, pronte per l'implementazione

1. **Perimetro del paywall**: **tutto Dtrek** (pianificazione percorsi inclusa), non solo le funzioni AI. Navigator resta sempre gratuito e separato.
2. **BYOK**: sblocca **tutto Dtrek**, non solo il costo AI — è un metodo di sblocco alternativo al premium ricorrente/una tantum, come da proposta iniziale.
3. **Periodo di prova** (nuovo utente senza premium né BYOK): attivo finché **non scade per primo** uno dei due limiti:
   - **Tempo**: 30 giorni dalla registrazione.
   - **Consumo**: 2 percorsi creati in totale in Dtrek (pianificazione — AI o manuale, ogni percorso conta) + 2 resoconti.
   - Durante il trial, le generazioni AI (guida e resoconto) sono forzate al taglio **"Essenziale"** (`GuideTextLength = 'essenziale'`, già esistente in `lib/guideSections.ts`) — niente "Approfondita"/"Molto approfondita".
4. **Al termine del trial** (tempo o consumo esaurito) senza upgrade: i percorsi/resoconti già creati restano **leggibili in sola lettura** (consultabili/esportabili), ma non se ne possono creare/generare di nuovi né modificare quelli esistenti finché l'utente non sblocca (premium o BYOK).
5. **Account owner** (solo l'utente stesso, mzulpt@gmail.com): nuovo flag `is_owner boolean` in `user_settings`, protetto dalla RLS già esistente sulla tabella (`user_settings_owner` policy, `supabase-schema.sql:107-111` — ogni utente legge solo la propria riga, quindi il flag non è mai visibile ad altri account). Quando `is_owner = true`, bypassa paywall e limiti di trial ovunque nel codice.
6. **Utenti esistenti**: non rilevante in pratica — l'unico account reale è quello owner (accesso pieno via flag). Non serve una migrazione di grandfathering per altri utenti.

## Prossimi passi noti

- Progettare il meccanismo tecnico: nuove colonne/contatori per il trial (es. data inizio prova, conteggio percorsi/resoconti creati), punto di enforcement del gate (probabilmente `layout.tsx` per le sezioni di Dtrek, dato che esistono link diretti che bypassano l'hub), forzatura `sectionLengths` a `essenziale` durante il trial, e il bypass owner.
- Modifiche UX al layout/menu del Navigator (rimandate finché non si chiudeva la questione architetturale — ora sbloccate).
- Rivedere le stime di costo AI con dati reali (`ai_usage_log`) una volta che ci sarà traffico.
