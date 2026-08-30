import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    // Fase 26 — mancava questa cartella: alcuni file con JSX/className vivono qui (es.
    // lib/taccuinoTokens.tsx) e in una build di produzione da zero Tailwind non li scansiona,
    // quindi le classi usate SOLO lì (es. `-z-10`, mai scritta altrove nel repo) non vengono
    // generate — l'elemento resta `position: fixed` ma con `z-index: auto` invece di `-10`,
    // e per le regole di stacking di un elemento posizionato senza z-index esplicito dipinge
    // DOPO il contenuto normale di flusso, cioè sopra il testo della pagina invece che sotto.
    // Il bug non si vedeva con `next dev` perché la cache JIT di Tailwind di quel processo aveva
    // già generato la classe da un uso precedente altrove nel repo, mascherando il problema in
    // ogni verifica fatta finora in questa modalità — solo una build pulita (`next build`) lo
    // riproduce in modo affidabile. Vedi docs/diario-a-libro-piano.md, Fase 26.
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Gradini di opacità usati dal design ma assenti dalla scala predefinita di Tailwind
      // (che ha solo 0,5,10,15,20,…). Il modificatore con la barra (`bg-white/7`) si risolve su
      // questa scala: senza questi valori quelle classi non generano NESSUNA regola CSS e
      // spariscono in silenzio — è così che il foglio del wizard (`bg-stone-900/97`) restava senza
      // sfondo e i campi di testo (`bg-white/7`) finivano bianchi col testo bianco sopra.
      opacity: {
        7: '0.07', 8: '0.08', 12: '0.12', 22: '0.22', 28: '0.28', 38: '0.38', 97: '0.97',
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        terra: {
          50:  '#fdf6ee',
          100: '#f9e8d0',
          200: '#f2cd9d',
          300: '#e9ab64',
          400: '#e08d3c',
          500: '#d97220',
          600: '#c05a17',
          700: '#9f4315',
          800: '#813619',
          900: '#6a2e18',
        },
        // Direzione "Taccuino Botanico" (docs/taccuino-botanico-piano.md), fase di estensione a
        // tutta l'app: la chiave resta `forest` (rinominarla avrebbe richiesto toccare ~100 file
        // per la sola stringa della classe, senza cambiare nulla nel risultato visivo) ma i valori
        // non sono più il verde brillante originale — sono una rampa salvia, stessa gerarchia di
        // luminosità (50 chiarissimo → 900 scurissimo) usata finora per badge/icone/bottoni verdi
        // "generici" in tutta l'app. 500/600/700 sono esattamente gli hex della tabella palette
        // della guida (salvia polverosa/accento secondario, salvia scura/barra globale, hero
        // scuro) — non inventati. Il colore delle tracce sulle mappe non passa da qui: usa
        // FOREST/ROUTE_COLORS in lib/designTokens.ts, un oggetto JS separato, mai toccato — quel
        // verde resta quello originale apposta (già "ripristinato" più volte in sessioni precedenti).
        forest: {
          50:  '#F4F7F0',
          100: '#E9EEE3',
          200: '#D7E0CE',
          300: '#BCC9AF',
          400: '#9BAC8C',
          500: '#7C8F6E',
          600: '#5F7355',
          700: '#4A5A3F',
          800: '#3A4A32',
          900: '#2E3A26',
        },
        stone: {
          50:  '#f8f7f4',
          100: '#eeece5',
          200: '#dcd8cc',
          300: '#c4bead',
          400: '#a9a18e',
          500: '#978e7a',
          600: '#8a7f6e',
          700: '#73695c',
          800: '#5e564c',
          900: '#4d4740',
        },
        // Direzione "Taccuino Botanico" (docs/taccuino-botanico-piano.md) — palette del chrome di
        // sistema (barra inferiore, avatar flottante, pillola Guida/Resoconto, tema "taccuino" di
        // BookPage): sostituisce FOREST come colore di sistema. Non una scala numerica come
        // terra/forest/stone (qui i ruoli sono discreti, non un gradiente 50-900) — chiavi
        // nominali che rispecchiano 1:1 le righe della tabella palette della guida.
        botanico: {
          paper: '#F5EDDD',
          'paper-light': '#F9F2E4',
          card: '#EBE0C8',
          'card-border': '#D9C9A8',
          contour: '#A89A78',
          ink: '#2E2A22',
          'ink-hand': '#7A6F52',
          'ink-muted': '#95886A',
          accent: '#C0603D',       // terracotta — primario, CTA/stato selezionato
          'accent-2': '#7C8F6E',   // salvia polverosa — secondario, non CTA
          'accent-tint': '#E9DAC3',
          bar: '#5F7355',          // salvia scura — barra globale / status bar
          'bar-active': '#F5EDDD',
          'bar-inactive': '#B9C4AE',
        },
      },
      backgroundImage: {
        'topography': "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='400' height='400' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
}
export default config
