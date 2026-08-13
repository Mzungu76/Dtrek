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

## Schema tecnico del gate (progettato, non ancora implementato)

Verificato prima di disegnare: `middleware.ts` evita deliberatamente ogni chiamata a Supabase (per non trasformare un outage Supabase in 504 su tutta l'app, vedi commento in cima al file) — stesso principio già applicato all'autenticazione, che infatti middleware.ts gestisce solo come redirect UX "nessun cookie" e lascia la verifica vera a `getUserFromRequest` nelle singole API route. Il gate trial/paywall segue lo stesso schema: **mai nel middleware**, sempre negli endpoint/layout che già parlano con Supabase.

1. **Migrazione DB** (`supabase/migrations/add_trial_and_owner_columns.sql`, stesso pattern di `add_guide_section_lengths_column.sql`):
   ```sql
   ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT false;
   ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
   ```
   Nessuna colonna contatore per percorsi/resoconti: si contano live con `COUNT(*)` su `planned_hikes`/`hike_reports` filtrati per `user_id` (tabelle già esistenti con quella colonna) — niente da tenere sincronizzato, niente rischio di drift. Dopo la migrazione, `UPDATE user_settings SET is_owner = true WHERE user_id = '<tuo uuid>'` va eseguito una tantum a mano su Supabase (non nel codice).

2. **Risolutore centrale** — nuovo `lib/dtrekEntitlement.ts`, stile analogo a `resolveApiKeyAndSettings.ts` (`app/lib/guide/`):
   ```ts
   interface DtrekEntitlement {
     unlocked: boolean       // is_owner || subscription_tier === 'premium' || claude_api_key propria (BYOK)
     isOwner: boolean
     trialExpired: boolean   // solo se !unlocked
     trialDaysLeft: number
     routesUsed: number; routesLimit: 2; canCreateRoute: boolean
     reportsUsed: number; reportsLimit: 2; canCreateReport: boolean
     forcedTextLength: 'essenziale' | null   // non-null quando in trial attivo (!unlocked && !trialExpired)
   }
   ```
   **Tetti indipendenti (confermato)**: `canCreateRoute = routesUsed < 2`, `canCreateReport = reportsUsed < 2`, valutati separatamente — esaurire i percorsi non blocca i resoconti e viceversa. `trialExpired` (sola lettura su tutto) scatta solo quando **entrambi** i tetti sono esauriti (`routesUsed >= 2 && reportsUsed >= 2`) oppure sono passati i 30 giorni da `trial_started_at`, qualunque condizione arrivi prima.

3. **Punti di enforcement** (lato server, negli endpoint che scrivono):
   - Creazione percorso → `app/api/planned`, `app/api/route-build`, salvataggio da `GpxUploader.tsx`: check `canCreateRoute`.
   - Creazione resoconto → `app/api/resoconto` (POST): check `canCreateReport`.
   - Generazione guida/resoconto AI → forza lunghezza `essenziale` quando `forcedTextLength` è impostato (riuso di `sanitizeSectionLengths`/pattern di `clampMoltoApprofondita` già in `lib/guideSections.ts`).
   - Modifica di contenuti esistenti dopo `trialExpired` → bloccata (sola lettura); le GET restano sempre permesse, in ogni stato.
   - UI: CTA di upgrade nelle hub (`/guida/elenco`, `/resoconto/elenco`, `/upload`) con percorsi/resoconti rimasti — mirror visivo del pattern già usato per lo slot Navigator (`lib/navigatorSlot.ts`).

## Forme di pagamento — decisioni prese (2026-08-13, terza parte sessione)

### Vincolo store: perché il pagamento vive solo su Dtrek web, mai dentro Navigator

Google Play e Apple App Store vietano di vendere contenuti/abbonamenti digitali **dentro l'app nativa** con un processore terzo — per farlo lì servirebbe Google Play Billing / Apple In-App Purchase (che trattengono 15–30%). Bypassare questa regola con un checkout esterno richiamato da dentro l'app rischia rifiuto/rimozione dallo store.

Il codice attuale è già nel pattern sicuro: `lib/native/mainAppLinks.ts` apre Dtrek nel **browser di sistema**, non in una webview interna — lo stesso schema "reader app" di Kindle/Netflix/Spotify (l'app nativa non vende nulla al suo interno, resta genuinamente gratuita, e rimanda a un sito esterno dove il pagamento avviene sotto la responsabilità del sito, non dell'app in store).

**Confermato**: si resta su questo pattern.
- Navigator (app store) **non deve mai** mostrare linguaggio di vendita/upgrade al suo interno — niente bottone "Sblocca Premium" con link diretto al checkout. Resta il link generico "Apri app principale" già esistente, verso il browser di sistema.
- Il checkout Paddle vive **esclusivamente** sul sito web Dtrek (pagina `/prezzi`), mai in una webview dentro l'app nativa.
- **Non implementato ora, ma annotato come opzione futura**: se un domani si volesse vendere Premium anche *dentro* l'app Navigator sullo store, servirebbe integrare separatamente Google Play Billing / Apple IAP — lavoro e commissioni distinti da Paddle, non necessario oggi perché il Premium sblocca Dtrek (prodotto web), non Navigator.

### Processore: Paddle

Scelto **Paddle** (Merchant of Record) invece di Stripe: Paddle è il venditore legale, calcola e versa lui l'IVA verso qualsiasi paese ed emette le fatture — zero burocrazia fiscale per un developer singolo. Commissioni più alte (~5%) di Stripe (~1,5–2,9%+fisso), accettate come compromesso per non dover gestire da soli la registrazione IVA OSS. Rivalutabile verso Stripe in futuro se il volume giustifica il risparmio.

### Struttura prezzi

- **Ricorrente mensile** (rinnovo automatico via Paddle).
- **Una tantum lifetime** (sblocco permanente, nessun rinnovo).
- **Importi esatti**: ancora da definire — nessun numero deciso finché non si crea il prodotto su Paddle.

### Checkout: self-serve dal lancio

Nessuna gestione manuale intermedia: pagina `/prezzi` pubblica con Paddle Checkout integrato, sblocco automatico via webhook, disponibile da subito.

### Schema DB aggiuntivo per il pagamento (estende lo schema del gate sopra)

```sql
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS premium_expires_at    TIMESTAMPTZ;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS paddle_customer_id     TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS paddle_subscription_id TEXT;
```
- `subscription_tier = 'premium'` **e** `premium_expires_at IS NULL` → lifetime (una tantum), nessuna scadenza.
- `subscription_tier = 'premium'` **e** `premium_expires_at` valorizzato → abbonamento ricorrente attivo fino a quella data (aggiornata a ogni rinnovo dal webhook; se il rinnovo/pagamento fallisce o l'utente cancella, un webhook successivo o un controllo lato `resolveDtrekEntitlement` sulla data scaduta riporta l'utente a `'free'`).
- `paddle_customer_id`/`paddle_subscription_id`: necessari per il link al Customer Portal ospitato da Paddle (gestione/cancellazione autonoma da parte dell'utente, linkato da `/profilo/impostazioni`) e per riconciliare gli eventi webhook.

`unlocked` in `lib/dtrekEntitlement.ts` (già disegnato sopra) va quindi precisato:
```
unlocked = is_owner
  || (subscription_tier === 'premium' && (premium_expires_at === null || premium_expires_at > now()))
  || claude_api_key propria (BYOK)
```

### Nuovi pezzi da costruire (in aggiunta a quanto già elencato per il gate)

- Pagina pubblica `/prezzi` con i due Paddle Checkout (mensile, lifetime).
- Endpoint webhook `app/api/webhooks/paddle/route.ts`: gestisce eventi di sottoscrizione creata/rinnovata/cancellata e acquisto una tantum completato, aggiorna `user_settings`.
- Link al Customer Portal Paddle in `/profilo/impostazioni` per chi ha un abbonamento ricorrente.
- Prerequisito **non tecnico**: creare l'account Paddle, configurare i due prodotti/prezzi (importi ancora da decidere) e recuperare le chiavi API prima di poter scrivere il codice del webhook/checkout.

## Gate/trial — implementato (2026-08-13, quarta parte sessione)

Pushato su `claude/navigator-dtrek-boundary-planning-lb60ge`. Pagamenti esclusi per ora, come da indicazione — il gate funziona già da solo perché owner e BYOK bastano a sbloccare.

1. **Migrazione applicata** in produzione (Supabase `sdxlcpxgbkagbxhukehd`, non solo nel repo): `supabase/migrations/add_trial_and_owner_columns.sql` + specchiata in `supabase-schema.sql`. `user_settings.is_owner` e `.trial_started_at` esistono già sul DB live.
2. **Flag owner impostato**: `is_owner = true` sulla riga di mzulpt@gmail.com (`user_id fa57488b-1b0c-4cce-b79a-2f1fbf634bdd`) — accesso pieno confermato, nessun limite di trial si applica a questo account.
3. **`lib/dtrekEntitlement.ts`**: risolutore centrale, esattamente come progettato — `unlocked` (owner/premium/BYOK), tetti indipendenti `canCreateRoute`/`canCreateReport` (2+2), `trialExpired` solo quando scadono ENTRAMBI i tetti o i 30 giorni. Su blackout Supabase degrada a sbloccato temporaneamente (stesso principio di degrado morbido usato altrove nel codice, es. `lib/supabaseAuth.ts`) invece di bloccare in scrittura chi normalmente avrebbe accesso.
4. **Enforcement lato server**:
   - `app/api/planned` POST — blocca la creazione di una riga *nuova* se `!canCreateRoute`; blocca ogni update (nuovo o esistente) se `trialExpired`.
   - `app/api/resoconto` POST — blocca un resoconto *nuovo* (nessuna riga `report-{activityId}` esistente) se `!canCreateReport`; forza `length = 'breve'` quando la prova è attiva, a prescindere da cosa chiede il client.
   - `app/api/resoconto` PATCH — blocca ogni modifica se `trialExpired`.
   - `app/api/guide` POST (`generateGuide`) — blocca la generazione/aggiornamento se `trialExpired`; forza tutte le sezioni a `'essenziale'` quando la prova è attiva (sovrascrive sia le preferenze salvate sia gli override per singola generazione). Il percorso di emergenza (Supabase JWKS irraggiungibile, nessuna identità verificabile) resta fuori da questo controllo, stesso principio già applicato a `resolveEmergencySharedKey`.
   - Le GET restano sempre permesse ovunque — mai toccate.
5. **UI minima**: `GET /api/dtrek-entitlement` espone lo stato al client; `components/dtrek/TrialStatusBanner.tsx` (banner invisibile se sbloccato, promemoria durante la prova con conteggio percorsi/resoconti/giorni rimasti, avviso di sola lettura a prova scaduta) montato in `/upload`, `/guida/elenco`, `/resoconto/elenco`. Il CTA porta a `/profilo/ai` — non c'è ancora una pagina prezzi/checkout, ma aggiungere lì una chiave Claude propria (BYOK) sblocca già oggi l'intero Dtrek.
6. Type-check (`tsc --noEmit`) e lint (`eslint`) puliti su tutti i file toccati.

## Bug di onboarding riscontrati testando come nuovo utente (2026-08-13, quinta parte sessione)

Segnalati testando la registrazione da zero, sia su Dtrek che su Navigator. Quattro bug di codice risolti e pushati (stesso branch); due punti restano fuori perché non sono bug di codice.

1. **"Errore di autenticazione" dopo il link di conferma email — risolto.** `app/auth/callback/route.ts` gestiva solo il flusso PKCE (`?code=...` + `exchangeCodeForSession`), che richiede il `code_verifier` salvato nel **browser che ha avviato la registrazione** — se il link si apre altrove (app di posta, altro dispositivo) la verifica fallisce sempre. La route ora gestisce anche `token_hash`+`type` via `verifyOtp`, che non dipende da nessun segreto locale al browser.
   **Azione manuale richiesta (non modificabile da codice/SQL)** — nel dashboard Supabase del progetto `sdxlcpxgbkagbxhukehd`, Authentication → Email Templates, aggiornare il link in due template così:
   - **Confirm signup**: `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup`
   - **Reset Password**: `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`

   (`{{ .RedirectTo }}` risolve già a `.../auth/callback?next=...` — l'app lo imposta lei stessa in `app/signup/page.tsx` e `app/reset-password/page.tsx` — quindi non serve altro nel template).
2. **Email di conferma inviata "da Supabase"** — non è un bug di codice: è l'infrastruttura di invio condivisa di default. Per un mittente/dominio Dtrek serve configurare un provider SMTP proprio in Authentication → Email → SMTP Settings (azione manuale, dashboard Supabase).
3. **Foto profilo di un altro account ereditata dal nuovo utente — risolto.** `lib/userProfile.ts` teneva avatar/nome in `localStorage` sotto una chiave fissa e globale (`dtrek_user_profile`), non legata all'utente — su un dispositivo dove era già stato loggato un altro account, restava visibile finché non veniva sovrascritta. Aggiunta `clearProfile()`, chiamata ad ogni sign-out (`app/profilo/page.tsx`, `components/navigation/NavigatorMenu.tsx`) accanto a `lsClearAll()`.
4. **Registrazione da Navigator finiva sulla home di Dtrek — risolto.** `/login` rispettava già `?next=`, `app/signup/page.tsx` no: redirect fisso a `/`, e anche il link "Torna al login" della schermata "controlla la tua email" perdeva il parametro. Ora `next` è letto e propagato ovunque nel signup (link da/verso login, redirect post-conferma, `emailRedirectTo`), mirror di come già funzionava login.
5. **Schermate iniziali spoglie per un utente nuovo** — non è un bug, resta una decisione di prodotto aperta (percorso omaggio precaricato come pianificazione+resoconto, o altro onboarding). Non affrontato in questa sessione.
6. **Nessun modo di importare un GPX restando dentro Navigator — risolto.** `GpxUploader` era montato solo in `app/upload` (Dtrek); il menu di Navigator non offriva altro che uscire verso l'app principale. Aggiunta `app/navigatore/importa/page.tsx` (stesso pattern di stato/limite di `app/navigatore/traccia/page.tsx`: rispetta `NAVIGATOR_SLOT_LIMIT`, `lib/navigatorSlot.ts`), raggiungibile dal menu di Navigator e dallo stato vuoto di "Percorsi pianificati". `GpxUploader` ora accetta `sourceApp`/`afterSaveHref` opzionali (default invariato per `/upload`) per marcare il percorso come `sourceApp: 'navigator'` e restare dentro le schermate di Navigator (`/guida/{id}/naviga`) invece di aprire una pagina di Dtrek nella webview.

Type-check e lint puliti su tutti i file toccati. Non verificato in un browser reale (nessun ambiente per farlo in questa sessione) — soprattutto il punto 1 andrebbe riprovato end-to-end dopo aver aggiornato i template email su Supabase.

## Prossimi passi noti

- Decidere gli importi esatti (mensile e lifetime) prima di configurare i prodotti su Paddle.
- Creare l'account Paddle e i prodotti/prezzi.
- Implementare lo schema di pagamento: colonne Paddle, pagina `/prezzi`, webhook, Customer Portal — quando pronto, `lib/dtrekEntitlement.ts` va esteso con `premium_expires_at` (vedi sezione pagamenti sopra) e il CTA del banner puntato lì invece che a `/profilo/ai`.
- Modifiche UX al layout/menu del Navigator (rimandate finché non si chiudeva la questione architetturale — ora sbloccate; **vincolo**: nessun linguaggio di vendita dentro Navigator, vedi sopra).
- Rivedere le stime di costo AI con dati reali (`ai_usage_log`) una volta che ci sarà traffico.
- Provare il gate end-to-end con un account di test (non owner) una volta disponibile un ambiente per farlo, dato che questa sessione non ha un browser per verificarlo manualmente.
