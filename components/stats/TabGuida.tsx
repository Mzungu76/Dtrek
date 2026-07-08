'use client'
import { useEffect } from 'react'
import { BookOpen, Activity, TrendingUp, Heart, Zap, Target, BarChart2, Trophy, Brain, Mountain, Flame, Star, Sun } from 'lucide-react'

interface Props { initialAnchor?: string | null }

function Section({ id, icon, title, children }: {
  id: string
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div id={id} className="scroll-mt-6 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-forest-600">{icon}</span>
        <h3 className="font-semibold text-stone-800">{title}</h3>
      </div>
      <div className="space-y-2 text-sm text-stone-600 leading-relaxed pl-6">
        {children}
      </div>
    </div>
  )
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-stone-100 rounded-lg px-4 py-2 font-mono text-xs text-stone-700 border-l-2 border-forest-400 my-1">
      {children}
    </div>
  )
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-sky-50 rounded-lg px-3 py-2 text-xs text-sky-700 flex items-start gap-2 my-1">
      <span className="shrink-0">💡</span>
      <span>{children}</span>
    </div>
  )
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm space-y-5">
      <h2 className="text-base font-bold text-stone-800 border-b border-stone-100 pb-3 flex items-center gap-2">
        {icon} {title}
      </h2>
      {children}
    </div>
  )
}

export default function TabGuida({ initialAnchor }: Props) {
  useEffect(() => {
    if (!initialAnchor) return
    const t = setTimeout(() => {
      document.getElementById(initialAnchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)
    return () => clearTimeout(t)
  }, [initialAnchor])

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="bg-gradient-to-br from-forest-700 to-forest-800 text-white rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="w-5 h-5 text-forest-300" />
          <h2 className="text-xl font-bold font-display">Guida alle Statistiche</h2>
        </div>
        <p className="text-forest-200 text-sm leading-relaxed">
          Spiegazione di ogni indice, grafico e metrica. Clicca l&apos;icona
          <span className="inline-flex w-4 h-4 rounded-full bg-white/20 text-white text-[10px] font-bold items-center justify-center mx-1.5 align-middle">i</span>
          accanto a qualsiasi dato nell&apos;app per arrivare direttamente alla sezione corrispondente.
        </p>
      </div>

      {/* Panoramica */}
      <Card title="Panoramica" icon={<Activity className="w-4 h-4 text-forest-600" />}>

        <Section id="kpi" icon={<BarChart2 className="w-4 h-4" />} title="Indicatori Chiave (KPI)">
          <p>I sei riquadri in cima mostrano i valori cumulativi dell&apos;intera carriera:</p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li><strong>Distanza totale</strong> — somma di tutti i km percorsi.</li>
            <li><strong>Tempo totale</strong> — ore e minuti complessivi in movimento.</li>
            <li><strong>Calorie totali</strong> — stima cumulativa delle calorie bruciate.</li>
            <li><strong>Dislivello totale</strong> — D+ (solo salita) di tutte le uscite.</li>
            <li><strong>FC media storica</strong> — media delle frequenze cardiache medie di ogni uscita.</li>
            <li><strong>Quota max mai</strong> — la cima più alta mai raggiunta.</li>
          </ul>
        </Section>

        <Section id="streak" icon={<Activity className="w-4 h-4" />} title="Continuità (Streak)">
          <p>Una <strong>streak</strong> è una serie consecutiva di giorni o settimane con almeno un&apos;uscita.</p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li><strong>Streak attuale (giorni)</strong> — quanti giorni di fila stai uscendo fino ad oggi.</li>
            <li><strong>Record streak</strong> — la serie più lunga mai raggiunta.</li>
            <li><strong>Streak settimanale</strong> — settimane consecutive con almeno un&apos;uscita (criterio più accessibile).</li>
            <li><strong>Giorni/settimane attivi totali</strong> — conteggio complessivo, non necessariamente consecutivo.</li>
          </ul>
          <Tip>La streak settimanale è più sostenibile: punta ad almeno un&apos;uscita ogni 7 giorni invece di ogni giorno.</Tip>
        </Section>

        <Section id="records" icon={<Trophy className="w-4 h-4" />} title="Record Personali">
          <p>La tua escursione migliore in ogni categoria:</p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li><strong>Più lunga (km)</strong> — distanza massima in una singola uscita.</li>
            <li><strong>Più dislivello</strong> — D+ più alto in una giornata.</li>
            <li><strong>Passo più veloce</strong> — il passo medio (min/km) più basso registrato.</li>
            <li><strong>Più calorie</strong> — massimo di calorie stimate in una sessione.</li>
            <li><strong>Quota massima</strong> — il punto più alto mai raggiunto.</li>
            <li><strong>Più difficile (D+/km)</strong> — rapporto più alto tra dislivello e distanza.</li>
          </ul>
        </Section>

        <Section id="passo" icon={<Zap className="w-4 h-4" />} title="Passo (min/km)">
          <p>Quanti minuti e secondi impieghi mediamente per percorrere 1 km. È l&apos;inverso della velocità.</p>
          <Formula>Passo = Durata totale (min) ÷ Distanza (km)</Formula>
          <p>Per il trekking un passo tipico è 12–20 min/km; in salita ripida può superare i 30 min/km.</p>
        </Section>

        <Section id="difficolta" icon={<Mountain className="w-4 h-4" />} title="Indice di Difficoltà (D+/km)">
          <p>Misura la pendenza media effettiva di un percorso — indipendentemente dalla sua lunghezza.</p>
          <Formula>Indice Difficoltà = Dislivello positivo (m) ÷ Distanza (km)</Formula>
          <ul className="list-disc list-inside space-y-1 pl-1 mt-1">
            <li>{'<'} 30 m/km — pianura o colline lievi</li>
            <li>30–60 m/km — sentieri collinari</li>
            <li>60–100 m/km — montagna impegnativa</li>
            <li>{'>'} 100 m/km — alpinismo / itinerari tecnici</li>
          </ul>
        </Section>

      </Card>

      {/* Grafici */}
      <Card title="Grafici" icon={<BarChart2 className="w-4 h-4 text-forest-600" />}>

        <Section id="heatmap" icon={<CalendarIcon />} title="Calendario Attività (Heatmap)">
          <p>Ogni cella è un giorno dell&apos;anno. Il colore si intensifica con i km percorsi:</p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li>Grigio chiaro — nessuna uscita</li>
            <li>Verde chiaro → verde scuro — 1 km → ≥ 20 km</li>
          </ul>
          <Tip>Usa la heatmap per individuare i periodi di pausa e pianificare una ripresa graduale.</Tip>
        </Section>

        <Section id="confronto-annuale" icon={<BarChart2 className="w-4 h-4" />} title="Confronto Annuale">
          <p>Confronta i km mensili tra anni diversi. Utile per verificare se stai progredendo rispetto alla stagione scorsa a parità di periodo.</p>
        </Section>

        <Section id="score-evolution" icon={<Star className="w-4 h-4" />} title="Evoluzione Score nel Tempo">
          <p>Andamento dei tre punteggi soggettivi nel tempo:</p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li><strong>Trail Score (0–100)</strong> — qualità complessiva del percorso.</li>
            <li><strong>Soddisfazione (×10)</strong> — come ti sei sentito nell&apos;uscita.</li>
            <li><strong>Rating (×10)</strong> — valutazione personale dell&apos;escursione.</li>
          </ul>
          <p>La <strong>linea continua</strong> è la media mobile a 5 uscite (riduce il rumore dei singoli valori). La descrizione testuale indica il trend della regressione lineare:</p>
          <Formula>Regressione lineare: y = a·x + b → slope a {'>'} 0 = miglioramento nel tempo</Formula>
        </Section>

        <Section id="stagionale" icon={<Sun className="w-4 h-4" />} title="Analisi Stagionale">
          <p>Suddivide le uscite per stagione astronomica:</p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li>🌸 <strong>Primavera</strong> — marzo, aprile, maggio</li>
            <li>☀️ <strong>Estate</strong> — giugno, luglio, agosto</li>
            <li>🍂 <strong>Autunno</strong> — settembre, ottobre, novembre</li>
            <li>❄️ <strong>Inverno</strong> — dicembre, gennaio, febbraio</li>
          </ul>
          <p>Per ogni stagione: numero di uscite, km medi, D+ medio, FC media e soddisfazione media.</p>
          <Tip>La FC media estiva è spesso più alta a parità di sforzo, per il calore. L&apos;autunno è tipicamente il periodo di forma fisica migliore.</Tip>
        </Section>

        <Section id="altimetrica" icon={<Mountain className="w-4 h-4" />} title="Distribuzione Altimetrica">
          <p>Raggruppa le uscite in base alla quota massima raggiunta (<em>altitudeMax</em>) in fasce di 500m. Mostra a quali altitudini sei più attivo e se stai gradualmente esplorando quote più elevate.</p>
        </Section>

        <Section id="fc-trend" icon={<Heart className="w-4 h-4" />} title="Trend FC Media">
          <p>Come varia la frequenza cardiaca media nel tempo. Una linea in discesa a parità di sforzo percepito è il segnale che il tuo cuore sta diventando più efficiente — progresso aerobico in atto.</p>
        </Section>

      </Card>

      {/* Forma */}
      <Card title="Forma — Training Load" icon={<Brain className="w-4 h-4 text-forest-600" />}>

        <Section id="training-load" icon={<Brain className="w-4 h-4" />} title="CTL, ATL e TSB (modello Banister)">
          <p>Il modello di <strong>Training Load</strong> — usato da coach professionisti e piattaforme come TrainingPeaks — descrive la tua forma tramite tre indici:</p>
          <ul className="list-disc list-outside pl-4 space-y-3 mt-2">
            <li>
              <strong>CTL — Fitness (verde)</strong>: media esponenziale del carico su 42 giorni. Rappresenta la capacità aerobica accumulata. Sale lentamente con l&apos;allenamento costante.
              <Formula>CTL(oggi) = CTL(ieri) × e^(−1/42) + TSS × (1 − e^(−1/42))</Formula>
            </li>
            <li>
              <strong>ATL — Fatica (arancione)</strong>: media esponenziale su 7 giorni. Sale rapidamente dopo un&apos;uscita intensa e scende in pochi giorni di riposo.
              <Formula>ATL(oggi) = ATL(ieri) × e^(−1/7) + TSS × (1 − e^(−1/7))</Formula>
            </li>
            <li>
              <strong>TSB — Forma (blu)</strong>: differenza tra fitness e fatica.
              <Formula>TSB = CTL − ATL</Formula>
              <ul className="list-disc list-inside pl-2 mt-1 space-y-0.5">
                <li>TSB {'>'} +5: fresco e pronto — ideale prima di un evento</li>
                <li>TSB tra 0 e −10: affaticamento moderato, normale con allenamento regolare</li>
                <li>TSB {'<'} −20: sovraffaticamento, rischio infortunio</li>
              </ul>
            </li>
          </ul>
          <Tip>Il picco di prestazione si raggiunge quando CTL è alto e TSB è leggermente positivo (5–15). Per un&apos;uscita importante, riduci il carico 7–10 giorni prima.</Tip>
        </Section>

        <Section id="tss" icon={<Zap className="w-4 h-4" />} title="TSS — Training Stress Score">
          <p>Stima il carico di ogni singola uscita combinando distanza, dislivello e durata:</p>
          <Formula>TSS = (km × 3) + (D+ in m × 0.01) + (minuti × 0.5)</Formula>
          <p className="text-xs text-stone-400 italic">Nota: è una stima semplificata basata sui metadati. Con dati di frequenza cardiaca sarebbe possibile usare TRIMPS per una stima più precisa.</p>
        </Section>

        <Section id="volume-settimanale" icon={<BarChart2 className="w-4 h-4" />} title="Volume Settimanale">
          <p>Km e D+ per ciascuna delle ultime 16 settimane. Aiuta a verificare la progressione del carico e a identificare le settimane di scarico.</p>
          <Tip>Una progressione sana aumenta il volume del 10% a settimana, con una settimana di scarico (−30%) ogni 3–4 settimane.</Tip>
        </Section>

      </Card>

      {/* Confronto */}
      <Card title="Confronto Attività" icon={<Target className="w-4 h-4 text-forest-600" />}>

        <Section id="confronto-attivita" icon={<Target className="w-4 h-4" />} title="Come Funziona il Confronto">
          <p>Seleziona due o più escursioni per confrontarle su distanza, D+, durata, passo, FC media, calorie e trail score. Con la modalità grafico vengono sovrapposte le zone di frequenza cardiaca.</p>
        </Section>

        <Section id="zone-fc" icon={<Heart className="w-4 h-4" />} title="Zone di Frequenza Cardiaca">
          <p>La FC viene divisa in 5 zone basate sulla percentuale della FC massima personale:</p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li><strong>Z1 (50–60% FCmax)</strong> — recupero attivo. Metabolismo lipidico quasi esclusivo.</li>
            <li><strong>Z2 (60–70% FCmax)</strong> — base aerobica. La zona più importante per costruire resistenza duratura. Devi riuscire a parlare comodamente.</li>
            <li><strong>Z3 (70–80% FCmax)</strong> — soglia aerobica. Sforzo controllato ma impegnativo.</li>
            <li><strong>Z4 (80–90% FCmax)</strong> — soglia anaerobica. Allenamento di qualità, insostenibile a lungo.</li>
            <li><strong>Z5 (90–100% FCmax)</strong> — massima intensità. Sforzo massimale, sostenibile per pochi minuti.</li>
          </ul>
          <Tip>Per la FCmax usa la formula di Tanaka: 211 − 0,64 × età. Impostala nel profilo per calcoli precisi delle zone.</Tip>
        </Section>

      </Card>

      {/* Traguardi */}
      <Card title="Traguardi e Badge" icon={<Trophy className="w-4 h-4 text-amber-500" />}>

        <Section id="badge" icon={<Trophy className="w-4 h-4" />} title="Sistema Badge">
          <p>I badge vengono assegnati automaticamente in base ai tuoi dati. Sono divisi in 5 categorie:</p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li><strong>Distanza</strong> — km totali percorsi (50, 100, 500, 1000 km e oltre)</li>
            <li><strong>Dislivello</strong> — D+ su singola uscita o cumulativo</li>
            <li><strong>Quota</strong> — altitudine massima raggiunta (2000, 3000, 4000m)</li>
            <li><strong>Frequenza</strong> — numero di uscite o streak consecutive</li>
            <li><strong>Speciale</strong> — performance particolari (passo rapido, rating perfetto, Trail Score elevato)</li>
          </ul>
          <p>I badge bloccati mostrano una barra di avanzamento con la percentuale già completata verso il prossimo obiettivo.</p>
          <Tip>Il bollino &quot;NEW&quot; compare sui badge sbloccati dall&apos;ultima visita a questa pagina — non li perderai.</Tip>
        </Section>

      </Card>

      {/* Fisico */}
      <Card title="Stato Fisico" icon={<Heart className="w-4 h-4 text-red-500" />}>

        <Section id="recovery-score" icon={<Activity className="w-4 h-4" />} title="Recovery Score">
          <p>Indica quanto sei riposato e pronto per uno sforzo. Deriva direttamente dal <strong>TSB</strong> (Training Stress Balance).</p>
          <Formula>Recovery Score = (TSB + 30) ÷ 60 × 100  [0–100]</Formula>
          <ul className="list-disc list-inside space-y-1 pl-1 mt-1">
            <li>80–100 — ottimamente riposato, pronto per uscite impegnative</li>
            <li>50–80 — forma discreta, uscite moderate consigliate</li>
            <li>30–50 — qualche affaticamento accumulato</li>
            <li>0–30 — recupero necessario prima di uno sforzo intenso</li>
          </ul>
          <Tip>Un Recovery Score basso non impedisce di uscire: una camminata lenta in Z1–Z2 favorisce il recupero attivo.</Tip>
        </Section>

        <Section id="fitness-score" icon={<TrendingUp className="w-4 h-4" />} title="Fitness Score">
          <p>Misura l&apos;efficienza aerobica attuale rispetto al <strong>picco personale storico</strong>. È una scala relativa — 100/100 significa che sei nella migliore forma mai registrata su DTrek.</p>
          <Formula>Fitness Score = EF_recente ÷ EF_max_storico × 100</Formula>
          <p>La freccia accanto al valore indica il trend rispetto alle ultime 3 uscite con dati di FC.</p>
          <Tip>Un Fitness Score che sale gradualmente nei mesi è il segnale più chiaro di un miglioramento aerobico.</Tip>
        </Section>

        <Section id="vo2max" icon={<Heart className="w-4 h-4" />} title="VO₂max Stimato">
          <p>Il VO₂max è la quantità massima di ossigeno consumabile per minuto per kg di peso. È il parametro più importante della capacità aerobica. L&apos;app usa la <strong>formula Uth-Sørensen</strong>:</p>
          <Formula>VO₂max ≈ (FCmax ÷ FC_riposo) × 15,3  [ml/kg/min]</Formula>
          <ul className="list-disc list-inside space-y-1 pl-1 mt-1">
            <li>{'<'} 35 — basso</li>
            <li>35–45 — nella media per adulti</li>
            <li>45–55 — buono, sopra la media</li>
            <li>{'>'} 55 — eccellente, tipico di atleti allenati</li>
          </ul>
          <p className="text-xs text-stone-400 italic">Limitazione: senza FC a riposo accurata (misurazione mattutina a letto, prima di alzarsi) la stima ha un margine di ±5 ml/kg/min.</p>
          <Tip>Imposta la FC a riposo reale nel profilo per una stima più precisa. Rimisurarla ogni 3 mesi riflette il tuo progresso.</Tip>
        </Section>

        <Section id="ef-aerobica" icon={<Zap className="w-4 h-4" />} title="Efficienza Aerobica (EF — Efficiency Factor)">
          <p>Misura quanta strada il cuore riesce a farti percorrere per ogni battito. È il proxy più affidabile del miglioramento aerobico nel lungo periodo, usato da coach professionisti.</p>
          <Formula>EF = Velocità media (m/s) ÷ FC media (bpm)</Formula>
          <p>DTrek applica anche una piccola correzione per il dislivello, così le uscite in montagna non risultano meno efficienti di quelle pianeggianti.</p>
          <p>Il grafico mostra punti (EF di ogni uscita) e una linea smussata (media mobile a 5 punti) per evidenziare il trend reale.</p>
          <Tip>Un EF crescente nel tempo significa che il tuo cuore lavora meno a parità di velocità: la base aerobica sta migliorando.</Tip>
        </Section>

        <Section id="distribuzione-polarizzata" icon={<BarChart2 className="w-4 h-4" />} title="Distribuzione Polarizzata dell'Allenamento">
          <p>La ricerca scientifica (Seiler, 2010) mostra che gli atleti di endurance d&apos;élite distribuiscono il tempo di allenamento così:</p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li><strong>~80% bassa intensità (Z1+Z2)</strong> — costruisce la base aerobica e favorisce il recupero</li>
            <li><strong>~10% media intensità (Z3)</strong> — soglia aerobica</li>
            <li><strong>~10% alta intensità (Z4+Z5)</strong> — qualità e velocità</li>
          </ul>
          <p>L&apos;app stima la distribuzione dalla <strong>FC media</strong> di ogni attività (approssimazione — per dati precisi servirebbe la traccia HR secondo per secondo).</p>
          <Tip>Troppa Z3 (&quot;zona grigia&quot;) è l&apos;errore più comune: stancante come la Z4 ma con ritorno inferiore. Rendi le uscite facili davvero facili e quelle dure davvero dure.</Tip>
        </Section>

        <Section id="calorie-metabolismo" icon={<Flame className="w-4 h-4" />} title="Efficienza Metabolica (kcal/kg/h)">
          <p>Normalizza le calorie per peso corporeo e durata, permettendo di confrontare l&apos;intensità metabolica tra uscite diverse. Corrisponde al concetto di <strong>MET (Metabolic Equivalent)</strong>:</p>
          <Formula>Efficienza = Calorie (kcal) ÷ Peso (kg) ÷ Durata (h)</Formula>
          <p>Valori tipici per il trekking:</p>
          <ul className="list-disc list-inside space-y-1 pl-1">
            <li>3–4 kcal/kg/h — passeggiata pianeggiante leggera</li>
            <li>4–6 kcal/kg/h — trekking normale</li>
            <li>6–8 kcal/kg/h — trekking con zaino pesante o forte pendenza</li>
            <li>{'>'} 8 kcal/kg/h — alpinismo / trail running</li>
          </ul>
          <Tip>Aggiorna il peso corporeo nel profilo periodicamente per avere dati accurati nel tempo.</Tip>
        </Section>

      </Card>

      {/* Footer */}
      <div className="bg-stone-100 rounded-2xl p-5 text-xs text-stone-500 leading-relaxed">
        <p className="font-medium text-stone-600 mb-1">Nota sui dati</p>
        <p>
          Le metriche fisiologiche avanzate (EF, Recovery Score, VO₂max, distribuzione zone FC) richiedono
          attività con dati di frequenza cardiaca registrati da un cardiofrequenzimetro. Le attività senza
          dati HR contribuiscono comunque alle statistiche di volume (km, D+, durata, calorie, badge).
          Per le stime più accurate imposta nel profilo: età, FC massima e FC a riposo.
        </p>
      </div>

    </div>
  )
}

// Small inline icon helper to avoid unused import warning
function CalendarIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}
