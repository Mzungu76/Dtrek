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

## Eliminazione account (2026-08-13, sesta parte sessione)

Richiesta per due motivi: un utente può voler cancellare tutti i propri dati, e serve anche in fase di test per riusare la stessa email invece di doverne inventare una nuova ogni volta. Implementata e pushata.

- **`lib/accountDeletion.ts`** — `deleteAccountAndData(userId)`: ripulisce prima lo Storage (bucket `dtrek-photos`/`dtrek-reports`, path `${userId}/...`, con discesa ricorsiva perché `.list()` di Supabase Storage non è ricorsivo), poi anonimizza `ai_usage_log` (unica tabella con `user_id` senza FK/CASCADE verso `auth.users` — colonna di telemetria aggregata, impostata a `NULL` invece di cancellare la riga), infine chiama `supabase.auth.admin.deleteUser(userId)` (hard delete, non soft — l'email torna subito libera). Verificate tutte le altre tabelle in `supabase-schema.sql` e nelle migrazioni: hanno già `user_id ... REFERENCES auth.users(id) ON DELETE CASCADE` (activities, planned_hikes, user_settings, hike_reports, hike_questionnaires, guide_questions, route_recommendations, activity_photos, route_search_history, route_build_logs, video_custom_presets, hike_navigation_sessions e a cascata i suoi eventi/track), quindi si svuotano da sole. Le cache condivise (poi_notes, dtm_cache, start_point_cache, ...) non hanno mai `user_id` — restano intatte, esattamente il comportamento "i dati comuni restano" richiesto.
- **`app/api/account/delete/route.ts`** (DELETE) — autentica via sessione (mai un id passato dal client), poi blocca esplicitamente l'account owner (`is_owner`, via `resolveDtrekEntitlement`) con 403: questa funzione serve a liberare email di test, non a poter distruggere per errore l'unico account reale del prodotto.
- **UI**: `components/profilo/SectionEliminaAccount.tsx`, danger zone in fondo a `/profilo/impostazioni` — conferma per digitazione esatta dell'email (stesso pattern GitHub/Vercel), poi sign-out + pulizia locale (`lsClearAll`, `clearProfile`) + redirect a `/login`.

Type-check e lint puliti. Non testato in un browser reale in questa sessione.

## Percorso omaggio — pilota Sardegna/Puglia (2026-08-13, settima parte sessione)

Implementata l'infrastruttura completa. **Decisione importante presa durante la costruzione**: niente testo generato da Claude nel percorso omaggio (solo dati calcolati: distanza, dislivello, tempo, POI reali da Overpass/Wikipedia, punteggi sicurezza/bellezza) e **nessun resoconto collegato** — un resoconto in Dtrek è quasi solo testo AI, e nessuno ha davvero percorso il sentiero. Riconsiderabile in futuro (schema e funzione di clonazione già pronti a coprirlo).

1. **Schema DB**: `is_sample`/`sample_region` su `planned_hikes` (e, per un eventuale futuro, anche su `hike_reports`) — righe "master" candidate per regione. `user_settings.gift_route_offered_at`, **indipendente** da `onboarding_completed_at`: il wizard di onboarding imposta il proprio flag prima ancora di offrire il regalo, quindi un flag unico avrebbe perso l'occasione per sempre se il browser si fosse chiuso a metà tra i due passi.
2. **`clone_row_for_user`**: funzione SQL generica (`to_jsonb`/`jsonb_populate_record`, non un elenco di colonne scritto a mano) per copiare una riga con nuovo id/user_id — resta corretta anche quando in futuro si aggiungono colonne a `planned_hikes` (già successo molte volte).
3. **`lib/italianRegions.ts`**: le 20 regioni con centroide, per il match "regione più vicina" da geolocalizzazione e per il picker manuale.
4. **`lib/giftRoute.ts`** + **`app/api/gift-route/claim`**: un solo regalo per account per sempre; clona il master della regione azzerando esplicitamente ogni campo AI (`cached_guide` e affini) e la valutazione personalizzata (calcolata sullo storico di chi ha creato il master, non dell'utente nuovo).
5. **`lib/dtrekEntitlement.ts`**: `is_sample=true` escluso dal conteggio dei 2 percorsi di prova.
6. **`components/onboarding/GiftRouteStep.tsx`**, incatenato dopo il wizard in `OnboardingGate.tsx`: richiede la geolocalizzazione (timeout di sicurezza a 10s se il browser non risponde al prompt), calcola la regione più vicina; se negata o assente mostra il picker manuale delle 20 regioni. Sempre saltabile.
7. **`components/guida/GiftRouteAdminToggle.tsx`** + **`app/api/gift-route/mark`**: pulsante fluttuante visibile solo all'account owner (`is_owner`) nella pagina di un percorso, per taggarlo come master di una regione — un solo master per regione (rimuove automaticamente il flag da un eventuale altro). Self-service per le prossime 18 regioni, senza passare da SQL manuale.

Type-check e lint puliti su tutti i file.

### Bug scoperti testando il pilota — risolti

- **Titolo GPX concatenato**: `lib/gpxParser.ts` prendeva `.textContent` di `<name>` senza gestire i GPX (es. esportazioni CAI) che usano un figlio per lingua (`<name><it>SI Z17</it><en>SI Z17</en>...</name>`) — risultato tipo "SI Z17SI Z17SI Z17...". Ora prende solo l'italiano (o il primo figlio disponibile).
- **Clonazione silenziosamente fallita**: il primo test end-to-end (nuovo account, Sardegna selezionata a mano) non mostrava nessun percorso — `gift_route_offered_at` risultava impostato (il claim era stato tentato) ma zero righe clonate. Causa: `clone_row_for_user` rimuoveva `created_at`/`updated_at` dal jsonb senza rimpiazzarli — `jsonb_populate_record` con base `null::TABELLA` lascia NULL ogni chiave assente (non il DEFAULT della colonna), quindi l'INSERT falliva sul vincolo NOT NULL di `updated_at` (errore Postgres 23502, riprodotto dal vivo). Fix: la funzione ora imposta esplicitamente `created_at`/`updated_at` a `now()`. Verificato di persona per l'account di test già creato (clonazione manuale via SQL, stesso path che userà l'app).
- **Beauty Score non neutro**: il percorso omaggio della Sardegna, verificato via SQL, aveva POI/Wikipedia/Safety Score correttamente calcolati e nessun testo AI — ma il Beauty Score era stato calcolato con i pesi TEI **personali** dell'owner (cultura 100 vs default 20, geodiversità 80 vs default 10, sensibilità antropica disattivata), non quelli di default che ha chiunque non abbia mai toccato quei cursori in Impostazioni. Un regalo deve restare neutro per chiunque lo riceva, non riflettere il gusto di chi l'ha creato — la Safety Score invece è oggettiva (pendenza/fauna) e non aveva questo problema. Fix in `components/guida/GiftRouteAdminToggle.tsx`: "Imposta come omaggio" ora ricalcola sempre il Beauty Score forzando i pesi di default (`DEFAULT_TEI_WEIGHTS`, sensibilità 'normale', sforzo/durata di default) prima di salvare; aggiunto anche un pulsante "Ricalcola Beauty Score neutro" per i master già marcati prima di questa fix (serve per la Sardegna, già impostata).

### Cosa manca prima che il pilota sia visibile a un utente vero

Non generabile da questa sessione — nessun accesso a Overpass/Wikipedia/Anthropic da questa sandbox (rete bloccata, vedi sopra). **Azione tua**:
1. Importa `SIZ17.gpx` (Sardegna) e `SIR08.gpx` (Puglia) da `/upload` → tab "Per la Guida" — l'arricchimento POI (Overpass + Wikipedia) parte automaticamente all'import, nessun'altra azione richiesta. Non serve (e per Sardegna/Puglia non ha effetto sul regalo, che lo azzera comunque) generare la guida AI.
2. Apri ciascun percorso, usa il pulsante "Percorso omaggio" in basso a destra (visibile solo a te), scegli la regione, "Imposta come omaggio".
3. Verifica end-to-end con un account di test: registrati, completa/salta il wizard, concedi o nega la geolocalizzazione, controlla che il percorso compaia in `/guida/elenco` con i dati giusti e senza consumare il tetto di prova.

## Bug grave: il trial non dava mai accesso AI (2026-08-13, ottava parte sessione)

Segnalato dall'utente vedendo "Racconto di Giulia non disponibile — aggiungi la tua chiave API" su un percorso in un account senza premium/BYOK. **Non era un problema di testo**: `resolveApiKeyAndSettings.ts` e diversi endpoint AI concedevano la chiave condivisa solo a premium/BYOK, mai durante il periodo di prova attivo — contraddicendo il piano deciso ("free con accesso pieno, limitato per volume/tempo"). Di fatto nessun utente in trial poteva mai generare nulla con l'AI. Risolto:

1. **`resolveApiKeyAndSettings.ts`**: la chiave condivisa ora va a chi è `entitlement.unlocked` (owner/premium/BYOK) **o** `entitlement.trialActive` — resa disponibile anche `entitlement` nel valore di ritorno, così i chiamanti non devono richiamare `resolveDtrekEntitlement` una seconda volta.
2. Stesso bug, stesso fix, trovato e corretto anche in **`app/api/questionnaire/route.ts`** e **`app/api/caption/route.ts`** (avevano una copia locale della vecchia logica invece di passare dal punto centrale) — `app/api/resoconto/route.ts` è stato solo riordinato per riusare l'entitlement già risolta. `route-search`, `route-compare`, `resoconto-assist`, `guide/qa` erano già a posto perché passano tutti da `resolveApiKeyAndSettings`.
3. **Messaggi aggiornati** (`GuideReader.tsx`, e i messaggi d'errore server dei quattro endpoint sopra): tolto "aggiungi la tua chiave API Claude" come messaggio di default — ora distinguono "prova scaduta" (con link a sblocca Dtrek) da un generico "nessun accesso al momento", senza mai implicare che serva per forza una chiave propria.
4. **`TrialStatusBanner`** montato anche in `app/guida/[id]/page.tsx`, non solo nelle tre hub — così quanto resta del periodo di prova è visibile anche aprendo un percorso.
5. **Terminologia**: l'interruttore owner-only ora dice "Percorso di Default" invece di "omaggio"/"regalo" (nomi interni — tabelle, `lib/giftRoute.ts`, endpoint — non toccati, solo il testo visibile). Aggiunto anche un **badge visibile a tutti gli utenti** (`components/guida/SampleRouteBadge.tsx`, non solo owner) sulla pagina di un percorso di Default, con la regione e la precisazione "dati reali, nessun testo generato da AI".

Type-check (0 errori sull'intero progetto) e lint puliti.

## Pagamenti Paddle — implementati (2026-08-13, nona parte sessione)

Prodotto "Dtrek Premium" creato in Paddle con due prezzi (mensile 4,99€, lifetime — in Sandbox e poi anche in Live per errore, non un problema: nessun addebito finché non c'è un checkout reale). Costruito tutto il resto:

1. **DB**: `premium_expires_at`, `paddle_customer_id`, `paddle_subscription_id` su `user_settings` (migrazione applicata anche in produzione). `lib/dtrekEntitlement.ts` ora controlla la scadenza: `premium_expires_at` NULL = lifetime, valorizzato = ricorrente valido solo fino a quella data.
2. **`lib/paddle.ts`**: base URL sandbox/production da `NEXT_PUBLIC_PADDLE_ENVIRONMENT`, lettura del prezzo live da Paddle (mai scritto a mano nel codice — niente rischio di disallineamento), verifica della firma webhook (HMAC-SHA256, confronto a tempo costante).
3. **`/prezzi`**: pagina pubblica (aggiunta a `lib/publicPaths.ts`), due card con `CheckoutButton.tsx` (Paddle.js, `@paddle/paddle-js` aggiunto alle dipendenze) — passa `dtrek_user_id` come `customData`, l'unico modo con cui il webhook sa quale account sbloccare. Rimanda al login solo al click se non loggato, non blocca la pagina a un visitatore anonimo.
4. **`app/api/webhooks/paddle`**: gestisce `subscription.created`/`subscription.updated` (estende `premium_expires_at` alla fine del periodo corrente, con fallback per `paddle_subscription_id` se un rinnovo non ripete `custom_data`) e `transaction.completed` senza `subscription_id` (acquisto lifetime, `premium_expires_at = null`). Cancellazione non gestita esplicitamente per scelta: senza rinnovi la data smette di avanzare e l'accesso scade da solo.
5. **`app/api/paddle/portal`** + **`SectionAbbonamento.tsx`** riscritta (era un teaser statico "Prossimamente", ora stato reale): chi è sbloccato vede "Gestisci abbonamento" (Customer Portal Paddle), chi non lo è vede la vera card con link a `/prezzi`.

Type-check (0 errori sull'intero progetto) e lint puliti. **Non testato end-to-end** — nessun accesso a Paddle da questa sandbox, stesso limite di sempre.

## UX acquisti — badge Premium in Navbar (2026-08-13, decima parte sessione)

Richiesta: l'accesso all'acquisto era scomodo, nascosto dentro Impostazioni → AI. Deciso con l'utente (via domande mirate): icona/badge persistente in Navbar (stesso trattamento riservato a `ProfileAvatar`), visibile anche a chi ha già sbloccato Dtrek (mostra lo stato, utile per raggiungere il Customer Portal), un tap apre una scheda breve con la scelta mensile/lifetime affiancata prima del checkout vero e proprio.

1. **`GET /api/paddle/prices`**: endpoint pubblico (nessuna auth) che legge i due prezzi live da Paddle via `lib/paddle.ts` e li espone insieme al loro `priceId` — così il frontend non ha mai bisogno di conoscere gli ID a mano.
2. **`components/premium/UpgradeChoicePanel.tsx`**: le due card mensile/lifetime estratte da `/prezzi` in un componente condiviso con prop `compact`, usato sia dalla pagina piena sia dentro il pannello del badge.
3. **`components/premium/UnlockedStatusPanel.tsx`**: stessa estrazione per il pulsante "Gestisci abbonamento" (Customer Portal) + card di stato, condiviso tra `SectionAbbonamento.tsx` e il badge.
4. **`components/premium/PremiumBadge.tsx`**: pillola nel `DesktopNav` (icona + testo "Premium"/"Sblocca"), cerchio ambra/verde nel `MobileTopBar`. Legge `/api/dtrek-entitlement` via `fetchOnce` (cache di sessione, non ricarica ad ogni navigazione), resta nascosto finché non risponde e per utenti anonimi. Un tap apre uno `Sheet` con `UnlockedStatusPanel` (sbloccato) o testo di stato prova + `UpgradeChoicePanel` (non sbloccato) — mai una navigazione a pagina intera.
5. **Montato in `components/Navbar.tsx`**: prima del divider/avatar nel desktop, prima dell'avatar nella barra mobile.
6. **CTA sparsi aggiornati da `/profilo/ai` a `/prezzi`**: `TrialStatusBanner.tsx`, `GuideReader.tsx` (messaggio prova scaduta/nessun accesso), `NavigatorMenu.tsx` (voce "DTrek AI", badge cambiato da "Prossimamente" a "Premium" perché il checkout ora esiste davvero) e `app/navigatore/traccia/page.tsx` (bottone "Scopri DTrek AI" quando si raggiunge il limite di percorsi in Navigator). Nessuna di queste è dentro l'app nativa Navigator in senso stretto tranne le due appena citate, che restano nel vincolo esistente: aprono il browser di sistema su `/prezzi`, non un checkout in webview.
7. **`SectionAbbonamento.tsx`** rimane come percorso secondario in Impostazioni, ora semplicemente `<UnlockedStatusPanel />` quando sbloccato — il punto di accesso primario è il badge in Navbar, raggiungibile da qualunque pagina.

Type-check (0 errori sull'intero progetto) e lint puliti (solo un warning preesistente e non correlato su `<img>` in `Navbar.tsx`).

### Cosa manca prima che un pagamento vero funzioni

Tutto lato tuo, in ordine:
1. **Su Vercel** (Settings → Environment Variables), aggiungi:

   | Nome | Valore |
   |---|---|
   | `PADDLE_API_KEY` | La tua API key Sandbox (mai condivisa qui) |
   | `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | `test_3bdc37ef3e61964fd8664e2a261` |
   | `NEXT_PUBLIC_PADDLE_ENVIRONMENT` | `sandbox` |
   | `PADDLE_PRICE_ID_MONTHLY` | `pri_01kzy09bka1qfcw8wfyqk0tn6p` |
   | `PADDLE_PRICE_ID_LIFETIME` | `pri_01kzy0ccfgks1jaceq3p6pyrgx` |

2. **Redeploy** (le variabili d'ambiente su Vercel richiedono un nuovo deploy per essere lette).
3. **Crea il webhook** in Paddle (Developer Tools → Notifications → nuovo destinatario) puntato a `https://<il-tuo-dominio>/api/webhooks/paddle`, eventi `subscription.created`, `subscription.updated`, `transaction.completed` — Paddle ti mostra un segreto in quel momento, va aggiunto su Vercel come `PADDLE_WEBHOOK_SECRET`.
4. **Prova**: apri `/prezzi` (o il badge Premium in Navbar) da loggato, fai un acquisto con una carta di test Sandbox, controlla che `user_settings` si aggiorni (posso verificarlo io via SQL) e che il badge mostri "Premium"/"Dtrek sbloccato".
5. Solo dopo che tutto funziona in Sandbox: ripeti i passi 1-3 con le credenziali **Live** (Price ID già pronti, servono ancora API key/client token/webhook secret Live) prima di accettare pagamenti reali.

## Prossimi passi noti

- Attivare Paddle Sandbox in produzione: variabili d'ambiente su Vercel, redeploy, webhook + segreto, un acquisto di prova (vedi "Cosa manca prima che un pagamento vero funzioni" sopra) — passo attualmente in carico all'utente.
- Ripetere con le credenziali Live solo dopo che tutto funziona in Sandbox.
- Rivedere le stime di costo AI con dati reali (`ai_usage_log`) una volta che ci sarà traffico.
- Provare il gate end-to-end con un account di test (non owner) una volta disponibile un ambiente per farlo, dato che questa sessione non ha un browser per verificarlo manualmente.
