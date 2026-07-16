# Ottimizzazione qualità/costi dei prompt AI (Giulia + le altre 4 persone)

> **Stato**: i punti 1-4 del piano d'azione (model tiering, revisione testuale, structured
> outputs, web search come "controllo mirato") sono stati implementati — vedi commit
> `b990344` su `claude/ai-guide-section-errors-f299zk`. Il punto 5 (caching sul resoconto) è
> stato scartato per ritorno marginale, come spiegato più sotto. I capitoli "Contesto di
> business" e "Personalizzazione AI di default" restano direzione di prodotto non ancora
> progettata/implementata.
>
> **Aggiornamento successivo**: il prompt caching su guida/Q&A/route-search, descritto qui
> sotto come "già ottimo", è stato **rimosso** in una sessione successiva dopo un incidente
> di costo reale — vedi "Rimozione del prompt caching" più sotto per i dettagli e il piano di
> reintroduzione futura limitato alla chiave condivisa/premium.

## Contesto

Nel corso della sessione ho già: diagnosticato e corretto i 500 sulla guida, differenziato le lunghezze per sezione, implementato prompt caching su guida e Q&A, aggiunto un selettore di modello Claude per utente, e un cooldown anti-spam server-side sulle 3 chiamate più costose. Ora l'utente chiede una valutazione complessiva di **tutti e 7** i prompt AI dell'app (non solo Giulia), un piano di ottimizzazione del rapporto qualità/costi, e una simulazione di costo con i modelli a miglior rapporto qualità/prezzo — usando Claude come riferimento principale ma confrontandolo con OpenAI e Google.

Decisioni già prese con l'utente (AskUserQuestion):
- Il confronto con altri fornitori è **solo un benchmark informativo** — nessuna architettura multi-provider (l'app resta 100% Anthropic SDK: prompt caching e web_search sono già specifici per Claude e riscriverli sarebbe un progetto a sé).
- Vogliamo **differenziare il modello di default per funzionalità** (es. Haiku per compiti strutturati, Sonnet per narrativa lunga), mantenendo la scelta esplicita dell'utente in Impostazioni come override che vince sempre.
- La simulazione di costo userà **scenari illustrativi** (per-generazione, per-1000, e 3 scale di esempio), non telemetria reale (che non esiste ancora nell'app).
- L'utente ha anche condiviso la direzione di business verso cui questo piano deve preparare il terreno (freemium/premium/acquisto una tantum) — trattata come capitolo di contesto (vedi "Contesto di business" più sotto), non progettata/implementata in questo piano.

## Valutazione per singolo prompt

| Route | Persona | Caching oggi | Modello proposto | Perché |
|---|---|---|---|---|
| `guide/route.ts` | Giulia | ❌ rimosso (vedi "Rimozione del prompt caching" più sotto) | **Sonnet** (resta) | Narrativa lunga + verifica web di sicurezza reale (chiusure/frane): qui la qualità conta più del risparmio, ed è la chiamata a volume più alto (auto-generata a ogni import) |
| `guide/qa/route.ts` | Giulia | ❌ rimosso (vedi "Rimozione del prompt caching" più sotto) | **Sonnet** (resta) | Risposte su sicurezza/stato del percorso — stesso motivo del sopra, non conviene abbassare qualità qui |
| `resoconto/route.ts` | Giornalista | ❌ nessun caching | **Sonnet** (resta) | Output lungo e visibile/condivisibile (articolo). **Il costo qui è dominato dai token di OUTPUT, non input** — quindi il caching aiuterebbe poco (vedi sotto) |
| `resoconto-assist/route.ts` | Editor | ❌ nessun caching (corretto: prompt troppo corto + testo diverso ogni volta, non c'è nulla da cacheare) | **Haiku** (nuovo default) | Editing meccanico e vincolato (correggi/espandi/sintetizza) su un testo già esistente, mai generazione libera — compito facile per un modello più economico |
| `route-compare/route.ts` | Giulia | ❌ nessun caching (corretto: system troppo corto per il minimo cacheabile, contenuto sempre diverso) | **Sonnet** (resta) | Deve pesare dati numerici + storico + preferenze e produrre una classifica che guida una decisione reale dell'utente |
| `questionnaire/route.ts` | Intervistatrice | ❌ nessun caching (corretto: prompt troppo corto) | **Haiku** (nuovo default) | Genera un JSON strutturato e vincolato da un elenco di "ancore" già preparate — compito templato |
| `caption/route.ts` | Social media marketer | ❌ nessun caching (corretto: prompt troppo corto anche per Haiku, che richiede 4096 token minimi) | **Haiku** (nuovo default) | JSON strutturato con regole di formato già del tutto esplicite nel system prompt (conteggio parole/hashtag) — compito templato |

**Chiarimento importante su `max_tokens`**: non è una leva di costo. È solo un tetto di sicurezza — Anthropic fattura i token di output *effettivamente generati*, non il tetto impostato. I valori attuali (1300 guida, 600 Q&A, 1800/6000/10000 resoconto per lunghezza, ecc.) sono già ragionevoli e non vanno toccati per motivi di costo — solo se si osservano troncamenti reali (log `[guide] generazione troncata`).

**La vera leva di costo diretto sulla ricerca web** è `max_uses` sul tool `web_search` (ogni uso è fatturato $10/1000 ricerche = $0.01/uso, indipendentemente dal fatto che serva davvero). Oggi: guida 4 (ma scatta per *ogni* generazione auto, essendo "Il percorso" ormai una sezione di default — è il consumo più alto dell'app), Q&A 3 (su richiesta esplicita, volume molto minore). Vedi punto 4 del piano d'azione per la revisione concordata con l'utente (guida → 2 ricerche mirate, Q&A → 2), guidata dal principio "la ricerca web è un controllo mirato, non il motore della guida".

## Piano d'azione (in ordine di rapporto beneficio/rischio)

### 1. Model tiering per-funzionalità (priorità alta, rischio basso) — ✅ implementato
- `lib/claudeModels.ts`: aggiungere una mappa `FEATURE_DEFAULT_MODEL` (guide/guideQa/resoconto/routeCompare → `claude-sonnet-5`; resocontoAssist/questionnaire/caption → `claude-haiku-4-5`) e una funzione `resolveDefaultModel(feature)`.
- `app/lib/guide/resolveApiKeyAndSettings.ts`: `resolveApiKeyAndSettings` e `resolveEmergencySharedKey` accettano un parametro `feature`; il fallback quando `claude_model` è null diventa `resolveDefaultModel(feature)` invece del vecchio `DEFAULT_CLAUDE_MODEL` fisso. La scelta esplicita dell'utente (colonna non nulla) resta prioritaria ovunque, invariata.
- Aggiornare le chiamate in `app/api/guide/route.ts`, `app/api/guide/qa/route.ts`, `app/api/resoconto-assist/route.ts`, `app/api/route-compare/route.ts` per passare il proprio `feature`.
- `app/api/resoconto/route.ts`, `app/api/questionnaire/route.ts`, `app/api/caption/route.ts`: hanno una query inline (non passano dal resolver condiviso) — sostituire `... : DEFAULT_CLAUDE_MODEL` con `... : FEATURE_DEFAULT_MODEL.resoconto/questionnaire/caption`.
- `components/profilo/SectionClaudeKey.tsx`: una riga di testo che spiega che senza una scelta esplicita l'app usa "il modello più adatto per ogni funzionalità" invece di dire semplicemente "Sonnet 5 di default".
- Risparmio: **~65-70%** sul costo AI di resoconto-assist, questionnaire e caption (rapporto prezzo Haiku/Sonnet).
- In fase di implementazione è emersa un'ottava funzionalità non censita in questa valutazione, `app/api/route-search/route.ts` (ricerca percorsi assistita da Giulia) — aggiunta a `FEATURE_DEFAULT_MODEL` come `routeSearch` (Sonnet). Nota: quella route ignora comunque la scelta modello dell'utente con un `MODEL` hardcoded (`claude-sonnet-4-6`) — non toccato, fuori scope per questo piano.

### 2. Revisione testuale dei prompt per ridurre i token (priorità alta, rischio basso-medio) — ✅ implementato
Ogni token di istruzione fissa (system prompt) costa ad ogni chiamata — per le 5 route **non** cacheate (resoconto, resoconto-assist, route-compare, questionnaire, caption) il 100% del taglio si traduce in risparmio diretto su OGNI chiamata, senza alcun effetto attenuante della cache. Per guida e Q&A (già cacheate) il beneficio è più piccolo ma non nullo: un prompt più snello costa meno anche in scrittura di cache (1.25x-2x il prezzo input, pagato ad ogni refresh del TTL) e sul primo utilizzo/cache-miss.

Metodo: distinguere frasi che sono vera **istruzione di comportamento** (da conservare, a volte anche ripetute apposta per rinforzare l'aderenza del modello a un vincolo) da frasi di **flavour/motivazionali** che non cambiano l'output (da tagliare), e unire istruzioni che si sovrappongono concettualmente. Ogni taglio va verificato con rigenerazioni di prova prima/dopo (vedi sezione Verifica) — non è un esercizio puramente stilistico, un vincolo tagliato per errore può degradare l'aderenza al formato (tag `[avviso]`/`[indovinello]`/`[epoca]`, regole hashtag, ecc.).

Esempi concreti di taglio individuati:
- **`SYSTEM_CORE` guida** (~1700 token, cacheato): il paragrafo di apertura ripete due volte il tono ("caldo, colloquiale e contagioso... amica esperta...") e include una frase puramente motivazionale ("I dettagli che la gente non trova sulle guide ordinarie sono il tuo punto di forza.") che non aggiunge un vincolo verificabile — accorciabile di circa ~15-20% senza perdere le costrizioni sostanziali (onestà prima dell'entusiasmo, seconda persona, niente asterischi/bullet).
- **`caption/route.ts` SYSTEM** (~280 parole, NON cacheato): elenca 10 hashtag di esempio scritti per esteso (`#escursionismo #camminandoimparo #italiainmontagna #montagnagram #hikingitaly #trailrunning #alpinism #mountainlife #reelsitalia #videooftheday #outdooradventure`) — bastano 2-3 esempi per categoria, il modello generalizza il pattern. Risparmio ~100-150 token *per ogni chiamata*, essendo non cacheato.
- **`guide/qa/route.ts` SYSTEM_BASE** (~650 token, cacheato): la lista di argomenti pertinenti e l'elenco di richieste da rifiutare si sovrappongono concettualmente (in pratica definiscono lo stesso confine "solo domande su questo percorso" da due prospettive) — accorpabili in un solo paragrafo.
- **`resoconto/route.ts` SYSTEM** (~380 token, NON cacheato) e **`route-compare/route.ts` SYSTEM** (~280 token, NON cacheato): già relativamente compatti, margine di taglio minore (~10%) ma comunque a beneficio pieno essendo non cacheati.
- **`questionnaire/route.ts` SYSTEM** e **`resoconto-assist/route.ts` SYSTEM**: già molto stringati, margine di taglio minimo — non prioritari.

Stima di risparmio aggiuntivo: ~3-5% sul costo AI complessivo (si somma al tiering e alla riduzione di `max_uses`), concentrato soprattutto sulle route non cacheate a più alto volume (resoconto, questionario, caption).

### 3. Structured outputs per le route JSON (priorità media, rischio basso) — ✅ implementato
`questionnaire`, `caption` e `route-compare` oggi chiedono "rispondi solo con JSON valido" nel prompt e fanno parsing manuale con fallback su regex per rimuovere eventuali code fence. Sostituire con `output_config: {format: {type: "json_schema", schema}}` e `client.messages.parse()` (supportato su Sonnet 5 e Haiku 4.5). Non è un risparmio diretto in $, ma elimina i fallimenti di parsing (che oggi costano una generazione sprecata + un retry utente) — migliora il rapporto qualità/costo eliminando lo spreco, non il prezzo unitario. Bonus: il JSON schema può sostituire anche parte delle istruzioni di formato oggi scritte a parole nel system prompt (altro taglio di token, si somma al punto 2).

Nuovo helper condiviso: `lib/aiJsonOutput.ts` (`jsonSchemaFormat<T>(schema)`), usato dalle tre route senza aggiungere zod come dipendenza.

### 4. Web search come "controllo medico", non motore della guida (priorità alta, rischio basso se scoping corretto) — ✅ implementato
Rivisto con l'utente: il rischio reale non è il costo della singola ricerca, è che la qualità percepita di Dtrek dipenda dal *trovare fonti* invece che dal *fondere dati già posseduti* (GIS, POI, traccia, profilo, conoscenza generale) — la ricerca web deve restare un controllo mirato, non un motore esplorativo.

- **Guida** (`app/api/guide/route.ts`): `max_uses: 4` → **2**, e il prompt `SYSTEM_RESEARCH` viene riscritto per rendere esplicite le due uniche sotto-domande consentite: (1) condizioni attuali del percorso, (2) sicurezza/chiusure/deviazioni. Non un budget generico da spendere come il modello preferisce, due ricerche mirate.
  - **Scartata la terza ricerca "storico/naturalistico" proposta inizialmente**: contraddice la stessa logica "fusione di dati, non ricerca extra" — quel contenuto (aneddoti, `[epoca]`, `[indovinello]`) nasce già dagli estratti Wikipedia dei POI già presenti nel prompt (nessuna chiamata aggiuntiva) più la conoscenza del modello. È anche disallineata architetturalmente: appartiene alla sezione "I luoghi da non perdere", che dalla modifica di questa sessione **non è più una sezione di default** — la generazione iniziale (dove scatta la ricerca) tipicamente non la include nemmeno. Se in futuro si vuole arricchire la parte storica con ricerca web, va legata alla generazione della sezione "luoghi" quando richiesta esplicitamente, come iniziativa separata — non aggiunta qui.
- **Chiedi a Giulia** (`app/api/guide/qa/route.ts`): `max_uses: 3` → **2**.
- **Beneficio secondario per il modello di business**: un tetto più basso non abbassa solo il costo medio, abbassa soprattutto il **costo massimo per generazione** (da $0.04 a $0.02 nel caso peggiore) — rilevante per definire un prezzo di abbonamento premium senza rischio di margine negativo su un utente che genera molto (vedi capitolo "Contesto di business").
- Da monitorare comunque (log di troncamento/qualità avvisi) — non c'è telemetria sul numero di ricerche realmente usate oggi, quindi resta un cambiamento da validare con generazioni di prova su percorsi con chiusure/lavori noti prima di considerarlo definitivo.

### 5. Caching sul resoconto (priorità bassa — incluso per completezza, non conviene molto) — ❌ scartato
Si potrebbe cacheare system + contesto condiviso (guida/POI/natura) di `resoconto/route.ts` separandolo dall'istruzione di lunghezza finale. **Ma il costo di resoconto è dominato dai token di OUTPUT (narrativa lunga, ~$0.03-0.06 a generazione), non di input** — il caching agirebbe solo sulla frazione più piccola del costo, quindi il ritorno è marginale rispetto allo sforzo di ristrutturare il prompt in blocchi. Non incluso come azione immediata; da riconsiderare solo se in futuro si osserva un pattern reale di rigenerazioni ravvicinate (utente che prova "breve" poi "lunga" sullo stesso resoconto).

### 6. Rimozione del prompt caching su guida/Q&A/route-search — ✅ implementato (sessione successiva)

Il prompt caching (`cache_control: {type: 'ephemeral'}`) su `guide/route.ts`, `guide/qa/route.ts` e
`route-search/route.ts` — presentato nei punti sopra come "già ottimo" — è stato **tolto del tutto**
dopo un incidente reale con l'utente: una generazione guida con tutte le 8 sezioni + "Il percorso"
(percorso ben documentato online, lago di Bolsena) è costata **~0,20€** invece della frazione di
centesimo attesa.

**Causa radice, confermata dalla documentazione Anthropic** ("Tool use with prompt caching" →
"Server tool results are cached automatically"): quando una richiesta ha `cache_control` **e** usa un
server tool come `web_search`, l'API mette **automaticamente** in cache anche i risultati grezzi
della ricerca — a prezzo maggiorato (1,25× l'input normale), mai richiesto esplicitamente da noi. Sul
test reale: ~44.000 token di scrittura cache in una sola chiamata, quasi tutti dai risultati di 2
ricerche web. Rimuovendo `cache_control` quel contenuto torna a essere billed come input normale (1×
invece di 1,25×) ma **resta comunque grande** — il vero limite è che `web_search_20250305` (versione
base) carica ogni risultato per intero nel contesto, senza nessun controllo sulla dimensione.

**Due correzioni applicate insieme**:
1. **`cache_control` rimosso** da tutti e 3 i breakpoint (guida, Q&A, route-search) — non solo per il
   rischio della cache automatica, ma perché il beneficio reale è comunque minimo: generare una guida
   è un'azione rara per un utente con chiave personale, improbabile che rilegga lo stesso prefisso
   entro la finestra di 5 minuti/1 ora della cache. Il 25% di sovrapprezzo su system prompt piccoli
   (~450-2000 token) vale pochi millesimi di centesimo — non giustifica il rischio residuo nemmeno a
   parte il problema `web_search`. Decisione esplicita dell'utente.
2. **Tool aggiornato da `web_search_20250305` a `web_search_20260209`** (filtro dinamico, supportato
   da Sonnet 5/4.6, Opus 4.6-4.8, Fable 5, Mythos 5): Claude scrive ed esegue del codice che filtra i
   risultati di ricerca PRIMA che entrino nel contesto, tenendo solo il contenuto rilevante — la
   stessa ottimizzazione raccomandata dalla documentazione Anthropic per "richieste con uso intenso
   di ricerca". Non ancora verificato con un test reale successivo alla modifica (né il comportamento
   con un modello che l'utente scegliesse manualmente e che non supporti il filtro dinamico).

**Reintroduzione futura, SOLO per la chiave condivisa/premium**: a differenza di una chiave personale
(riletture rare, beneficio marginale), una chiave condivisa usata da **molti utenti diversi** rende
molto più probabile che due richieste diverse capitino nella stessa finestra di 5 minuti/1 ora — lì il
prompt caching torna a valere la pena. Quando la tier "Premium" (vedi "Contesto di business" più
sotto) avrà volume reale, va **assolutamente reintrodotta** la cache sulla chiave condivisa — ma
strutturata diversamente da come era: **mai `cache_control` nella stessa chiamata che usa
`web_search`** (la causa dell'incidente). L'architettura corretta, discussa con l'utente ma non ancora
implementata: separare la ricerca web in una chiamata dedicata, piccola, mai cacheata (system minimo +
`web_search`, output solo gli avvisi trovati) da una chiamata di generazione narrativa sempre cacheata
(SYSTEM_CORE ecc., **senza** `web_search`) — gli avvisi trovati dalla prima entrano come testo semplice
nella seconda, esattamente come già avviene per `assessmentBlock`/`scoresBlock`. Così le due
funzionalità (cache del prompt fisso, ricerca web) non convivono mai nella stessa richiesta e il
problema non può ripresentarsi.

File toccati: `app/api/guide/route.ts`, `app/api/guide/qa/route.ts`, `app/api/route-search/route.ts`.

### Esplicitamente fuori scope per questo piano
- **Cache route-status condivisa** (idea "punto 1" già discussa e scartata in questa sessione): il cambiamento con il potenziale di risparmio più alto in assoluto, ma richiede nuova tabella Supabase + logica di lettura/scrittura + integrazione nel prompt — un progetto a sé.
- **Supporto multi-provider** (OpenAI/Gemini): l'utente ha confermato di volerlo solo come benchmark informativo, non come implementazione.

## Benchmark informativo con altri fornitori (luglio 2026)

| Modello | Input $/1M | Output $/1M | Note |
|---|---|---|---|
| **Claude Sonnet 5** | $3.00 ($2.00 intro fino al 31/8/2026) | $15.00 ($10.00 intro) | Usato oggi per guida/Q&A/resoconto/confronto |
| **Claude Haiku 4.5** | $1.00 | $5.00 | Proposto per resoconto-assist/questionario/caption |
| Claude Opus 4.8 | $5.00 | $25.00 | Non usato nell'app (fuori portata per un uso di massa) |
| OpenAI "Terra" (fascia media, lug. 2026) | $2.50 | $15.00 | Sostanzialmente alla pari con Sonnet 5 |
| OpenAI "Luna" (fascia economica) | $1.00 | $6.00 | Alla pari con Haiku sull'input, leggermente più caro sull'output |
| Google Gemini 2.5 Flash | $0.30 | $2.50 | **Il più economico in assoluto** — ma perdere il prompt caching Anthropic (già implementato e funzionante) e il web_search tool Claude (chiuso, integrato, senza pipeline da ricostruire) probabilmente vanifica il risparmio unitario, oltre al costo di sviluppo per aggiungere un secondo provider |
| Google Gemini 2.5 Pro | $1.25 / $2.50 oltre 200k | $10.00 / $15.00 oltre 200k | Più economico di Sonnet 5 a listino pieno, ma Sonnet 5 ha il prezzo introduttivo fino ad agosto 2026 che lo rende quasi alla pari |

**Conclusione**: Claude resta una scelta ragionevole per il rapporto qualità/costo di questo caso d'uso specifico (narrativa italiana di qualità + ricerca web integrata + prompt caching già sfruttato). Gemini 2.5 Flash è l'unica vera occasione di risparmio strutturale se un giorno si valutasse multi-provider, ma il costo di sviluppo/manutenzione di una seconda integrazione supera probabilmente il risparmio sui prezzi unitari, specialmente dato il volume attuale dell'app.

## Simulazione di costo (illustrativa — nessuna telemetria reale disponibile)

Stime basate sulle dimensioni reali dei prompt in questa sessione (system + contesto tipico + output medio), **non** su dati misurati.

| Funzionalità | Costo/generazione oggi (Sonnet ovunque) | Costo/generazione con il piano (tiering + max_uses 2 + taglio testo) | Risparmio |
|---|---|---|---|
| Guida (auto, 2 sezioni default) | ~$0.031 (incl. ~1.5 ricerche web, tetto a 4) | ~$0.025 (tetto a 2 ricerche mirate + system ~15% più snello) | ~19% (e tetto massimo per generazione dimezzato: $0.04 → $0.02) |
| Chiedi a Giulia (1 domanda) | ~$0.0065 | ~$0.0058 (tetto a 2 ricerche + SYSTEM_BASE più snello) | ~11% |
| Resoconto "media" | ~$0.037 | ~$0.036 (system non cacheato più snello, ma il costo resta dominato dall'output) | ~3% |
| Resoconto-assist (1 modifica) | ~$0.0066 | ~$0.0022 (Haiku) | ~67% |
| Confronto percorsi | ~$0.0096 | ~$0.0093 (Sonnet + system più snello) | ~3% |
| Questionario | ~$0.0096 | ~$0.0031 (Haiku + system più snello) | ~68% |
| Caption Instagram | ~$0.0072 | ~$0.0022 (Haiku + hashtag di esempio ridotti) | ~69% |

Il taglio testuale da solo pesa poco in valore assoluto (i token di sistema sono una piccola frazione del costo totale rispetto a contesto e output) ma è a costo di implementazione quasi nullo e si somma senza conflitti alle altre leve — per questo resta nel piano nonostante il ritorno modesto.

**Per 1000 generazioni** (stesso mix): il costo di guida (~$28-31), resoconto (~$37) e Q&A (~$6.5) restano i più pesanti — sono anche quelli con la narrativa più lunga/di qualità più visibile, coerentemente lasciati su Sonnet.

**3 scenari mensili illustrativi** (mix tipico: guida = 1 per utente/mese + 20% extra da "Approfondisci"/"Genera il resto"; resoconto/Q&A/confronto/caption più rari, questionario spesso abbinato al resoconto):

| Scala | Utenti attivi/mese | Costo AI stimato oggi | Costo AI stimato con il piano completo | Risparmio |
|---|---|---|---|---|
| Piccola | 300 | ~$14/mese | ~$11.5/mese | ~18% |
| Media | 2.000 | ~$95/mese | ~$77/mese | ~19% |
| Grande | 10.000 | ~$480/mese | ~$385/mese | ~20% |

Il risparmio percentuale complessivo resta nell'ordine del ~18-20% (non di più) perché il grosso della spesa rimane concentrato su guida e resoconto — le due funzionalità dove **non** conviene scendere di modello né tagliare troppo per non intaccare la qualità narrativa che è il cuore del prodotto. Il tiering porta un taglio netto (~67%) sulle 3 funzionalità meccaniche, la riduzione di `max_uses` un taglio mirato (~10%) sulla chiamata a volume più alto, e il taglio testuale un ~3-5% trasversale che si somma senza costi di implementazione rilevanti.

## Contesto di business: verso freemium / premium / acquisto una tantum

Durante questa sessione di planning l'utente ha introdotto la direzione di business che guiderà i prossimi passi, da tenere presente ma **non progettata/implementata in questo piano** (è un progetto a sé — tracking utilizzo, gate su `subscription_tier`, probabilmente Stripe):

1. **Freemium**: tutte le sezioni con i dati sempre visibili, generazioni AI limitate.
2. **Premium** (abbonamento mensile/annuale): generazione libera, con tetti giornalieri/settimanali anti-abuso.
3. **Acquisto una tantum**: costo più alto, sblocca la possibilità di usare la propria chiave API — inclusa la scelta futura di più fornitori (non solo Claude).

**Perché è la leva di costo più grande di tutte**: ogni ottimizzazione di questo piano (tiering modello, taglio testuale, `max_uses`) agisce sul *costo per generazione*. Le quote per tier agiscono sul *numero di generazioni pagate da Dtrek* — che è il vero moltiplicatore della spesa totale. Il taglio testuale dei prompt (punto 2) da solo vale ~3-5%; un limite freemium ben calibrato vale ordini di grandezza di più, perché elimina del tutto il costo delle generazioni che oggi un utente free-tier senza chiave propria non potrebbe nemmeno fare (nota: oggi senza abbonamento premium E senza chiave propria l'accesso AI è già a zero, vedi punto sotto — quindi la vera novità di questa strategia non è "aggiungere un limite dove oggi non c'è", ma **introdurre una fascia intermedia** tra "zero accesso" e "accesso illimitato dietro abbonamento".

**Tre punti risolti con l'utente, da portare avanti nel progetto futuro**:
- **Prompt caching sulla chiave condivisa/premium**: da reintrodurre **assolutamente** quando questa
  tier avrà volume reale (più utenti diversi che condividono la stessa chiave rendono probabile una
  rilettura entro la finestra di cache, a differenza di una chiave personale) — vedi "Rimozione del
  prompt caching" più sopra per il perché è stata tolta ora e come va strutturata per non ripetere
  l'incidente di costo (mai insieme a `web_search` nella stessa chiamata).
- **BYOK non più gratuito per tutti**: oggi qualunque utente (anche free) può incollare la propria chiave Claude in Impostazioni e ottenere generazioni illimitate a costo zero per Dtrek (nessun gate su `subscription_tier`) — questo svuoterebbe di senso la tier "acquisto una tantum". Deciso: nel progetto futuro, il campo chiave personale (`user_settings.claude_api_key`, oggi in `components/profilo/SectionClaudeKey.tsx`) andrà **gate-ato** dietro l'acquisto una tantum, rimosso/nascosto per free e premium. Comportamento diverso da oggi — non toccato in questo piano.
- **Multi-provider per la tier 3**: confermato come iniziativa futura, non progettata ora. Richiederà: un livello di astrazione sopra l'attuale `new Anthropic({ apiKey })` (usato identico in tutte e 7 le route), un secondo/terzo campo per chiavi OpenAI/Gemini in `user_settings`, e — il pezzo più delicato — un equivalente per prompt caching e web_search che oggi sono implementati con la sintassi specifica Anthropic (`cache_control`, `web_search_20250305`) e non hanno un corrispettivo 1:1 negli altri SDK. Stima indicativa: è un progetto dell'ordine di grandezza dell'intera integrazione AI attuale, non un'estensione incrementale.

**Come le modifiche di QUESTO piano preparano il terreno** (nessun lavoro aggiuntivo necessario ora, ma vale la pena saperlo):
- Il **model tiering per-funzionalità** (punto 1) e il concetto di `FEATURE_DEFAULT_MODEL` si estendono naturalmente a un domani "tier-aware default model" (es. free-tier sempre su Haiku dove possibile, premium può scegliere Sonnet) — stessa infrastruttura, un parametro in più.
- Il **cooldown anti-spam** (già implementato, `lib/aiCooldown.ts`, Upstash Redis) è la base tecnica giusta su cui costruire i tetti giornalieri/settimanali della tier premium — stesso meccanismo (`SET NX EX` per finestra temporale), basta aggiungere contatori invece di un semplice flag booleano.
- Il **model selector already esistente** (`SectionClaudeKey.tsx`) è già il punto dove andrà inserito il gate "solo se hai acquistato la tier one-time" quando si implementerà quel pezzo.

## Personalizzazione AI di default (nuova direzione di prodotto)

L'utente ha chiarito che la filosofia dell'app è "personale": di default Giulia deve scrivere usando profilo dichiarato, storico percorsi e dati biometrici reali dell'utente (se presenti), con un interruttore per disattivarlo e ottenere un testo più generico/adatto a pubblicazioni online. Decisione presa con l'utente: **"Il percorso" resta sempre oggettiva/narrativa**, anche a personalizzazione attiva — è l'unica sezione con verifica web di sicurezza in tempo reale ed è la più probabile da condividere.

**Nota privacy (non è una consulenza legale)**: i dati biometrici (frequenza cardiaca, calorie) sono dati sanitari, categoria "particolare" secondo il GDPR (art. 9). Uno pseudonimo (Nick invece del nome) è *pseudonimizzazione*, non anonimizzazione — il dato resta personale finché collegabile a un account, quindi restano necessari consenso esplicito specifico per l'uso dei dati sanitari, un'informativa che menzioni l'invio a un fornitore AI terzo (serve un DPA con Anthropic), e la possibilità di revoca. Raccomando una revisione legale prima del rilascio di questa funzionalità, data la sensibilità del dato.

**Design proposto** (capitolo di contesto/direzione — non tutti i dettagli UI/schema sono chiusi, ma il pattern tecnico è chiaro perché riusa infrastruttura già esistente):
- Nuova colonna `user_settings.ai_personalization` (boolean, default `true`) accanto a `claude_model`/`guide_breve_sections`, stesso pattern di lettura/scrittura.
- **Consenso ai dati biometrici tenuto separato** dal toggle di personalizzazione generale: un utente potrebbe voler personalizzare con profilo/storico (dato dichiarato, non sanitario) ma non con la frequenza cardiaca (dato sanitario) — serve quindi un secondo opt-in esplicito e più visibile solo per la componente biometrica, non un unico interruttore che copre tutto.
- Quando attivo: estendere il pattern già usato da `buildComfortContext`/`fetchHikerProfileForComfort`/`readOrBackfillHistoryStats` (`app/api/guide/route.ts`, oggi usato SOLO per la sezione `comfort`) alle altre sezioni dove ha senso — es. `prima_di_partire` (equipaggiamento tarato sul livello dichiarato), `dati_sicurezza` (rischi confrontati con lo storico reale), `consigli`. **`il_percorso` esclusa sempre**, per decisione presa sopra.
- Quando disattivo: nessun contesto personale iniettato, il prompt si comporta come oggi per tutte le sezioni non-`comfort`.
- **Tensione esplicita con l'ottimizzazione costi di questo piano**: più contesto personale = più token di input ad ogni chiamata, e questo contesto è per-utente quindi non beneficia del prompt caching condiviso come il system prompt. Va gestito iniettando un riassunto sintetico per sezione (poche righe, come già fa `buildComfortContext`), non un dump completo del profilo/storico — compromesso consapevole tra "davvero personale" e "non esplodere i costi", non un effetto collaterale ignorato.
- UI: un interruttore in Impostazioni (vicino a `components/profilo/SectionGuida.tsx` o una sezione dedicata) con copy che spiega la scelta e il consenso biometrico separato.

## File toccati (implementazione punti 1-4)

- `lib/claudeModels.ts` — mappa `FEATURE_DEFAULT_MODEL` + `resolveDefaultModel(feature)` (+ `routeSearch`, vedi nota punto 1)
- `lib/aiKeyCache.ts` — `claudeModel` nella cache Redis diventato nullable (valore grezzo, non risolto)
- `lib/aiJsonOutput.ts` — nuovo helper `jsonSchemaFormat<T>()` per gli structured outputs
- `app/lib/guide/resolveApiKeyAndSettings.ts` — parametro `feature` su `resolveApiKeyAndSettings`/`resolveEmergencySharedKey`
- `app/api/guide/route.ts` — `feature: 'guide'`; `max_uses: 4` → `2`; `SYSTEM_RESEARCH` riscritto; `SYSTEM_CORE` snellito
- `app/api/guide/qa/route.ts` — `feature: 'guideQa'`; `max_uses: 3` → `2`; `SYSTEM_BASE` accorpato/snellito
- `app/api/resoconto-assist/route.ts` — `feature: 'resocontoAssist'`
- `app/api/route-compare/route.ts` — `feature: 'routeCompare'`; `SYSTEM` snellito; migrato a `output_config.format`
- `app/api/resoconto/route.ts` — fallback a `resolveDefaultModel('resoconto')`; `SYSTEM` snellito
- `app/api/questionnaire/route.ts` — fallback a `resolveDefaultModel('questionnaire')`; migrato a `output_config.format`
- `app/api/caption/route.ts` — fallback a `resolveDefaultModel('caption')`; hashtag di esempio ridotti; migrato a `output_config.format`
- `app/api/ai-models/route.ts`, `app/api/route-search/route.ts` — aggiornati per il nuovo parametro `feature` obbligatorio (scoperti durante l'implementazione, non nella valutazione iniziale)
- `components/profilo/SectionClaudeKey.tsx` — copy aggiornato sul comportamento di default

**Sessione successiva** (vedi punto 6 sopra):
- `app/api/guide/route.ts`, `app/api/guide/qa/route.ts`, `app/api/route-search/route.ts` — rimosso `cache_control`; tool aggiornato a `web_search_20260209` (filtro dinamico)

## Verifica

- `npx tsc --noEmit` e `npx eslint` sui file toccati — eseguiti, puliti.
- Test manuale: generare una guida (verificare `claudeModel` risolto = Sonnet quando l'utente non ha scelto nulla), generare una caption/questionario (verificare che vada su Haiku), impostare un modello esplicito in Impostazioni e verificare che vinca ovunque.
- Se si riduce `max_uses` sulla guida: generare guide per 2-3 percorsi noti per avere chiusure/lavori in corso e verificare che gli avvisi vengano comunque trovati con 2 ricerche invece di 4.
- Per ogni system prompt snellito: rigenerare lo stesso contenuto (stesso percorso/attività) prima e dopo il taglio e confrontare a occhio che formato dei tag (`[avviso]`/`[indovinello]`/`[epoca]`/`[curiosita]`/`[sottotitolo]`), tono e aderenza alle regole (es. mix hashtag, rifiuto domande fuori tema) restino invariati — un taglio che degrada la qualità va rollback-ato subito, non è mai accettabile scambiare qualità percepita per pochi centesimi di risparmio.
