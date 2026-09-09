// Fonte unica di verità per palette e tipografia, condivisa da ciò che NON passa da Tailwind:
// i template stampati (Diario, Resoconto, Guida), il disegno su canvas delle immagini di
// condivisione e i documenti jsPDF. I valori replicano `tailwind.config.ts` e `app/layout.tsx`:
// quando lì cambia qualcosa, qui va aggiornato di conseguenza — è l'unico punto da toccare.
//
// Perché serve: prima di questo file ogni superficie aveva la propria idea di "verde DTrek".
// I PDF usavano #166534 (green-800 di Tailwind), le card del diario #f0fdf4/#166534, le immagini
// condivise #1a3c26, e nessuno di questi è un colore della palette dell'app.

// ── Tipografia ────────────────────────────────────────────────────────────────
//
// I font sono self-hosted da `next/font` (app/layout.tsx), che registra @font-face con nomi
// OFFUSCATI (es. "__Playfair_Display_a1b2c3") ed espone solo le custom property qui sotto.
// Il nome letterale "Playfair Display" NON è registrato da nessuna parte: scriverlo in un
// fontFamily non carica il font, cade in silenzio sul serif di sistema. Da qui in avanti si
// referenzia sempre la variabile, mai il nome.

export const FONT_VAR = {
  display: '--font-display', // Playfair Display — titoli editoriali
  body:    '--font-body',    // DM Sans — corpo e interfaccia
  mono:    '--font-mono',    // JetBrains Mono — cifre e statistiche
  barlow:  '--font-barlow',  // Barlow Condensed — occhielli ed etichette maiuscole
  lora:    '--font-lora',    // Lora — prosa narrativa
} as const

/** Stack pronti per `style={{ fontFamily: … }}` e per i fogli di stile della stampa. */
export const FONT = {
  display: `var(${FONT_VAR.display}), Georgia, 'Times New Roman', serif`,
  body:    `var(${FONT_VAR.body}), system-ui, -apple-system, 'Segoe UI', sans-serif`,
  mono:    `var(${FONT_VAR.mono}), ui-monospace, 'SFMono-Regular', Menlo, monospace`,
  barlow:  `var(${FONT_VAR.barlow}), 'Arial Narrow', system-ui, sans-serif`,
  lora:    `var(${FONT_VAR.lora}), Georgia, serif`,
} as const

export type FontRole = keyof typeof FONT

// ── Scala tipografica ───────────────────────────────────────────────────────
//
// Fase 1 del riordino UI/UX (docs/diario-valutazione-ux-piano.md): prima di questa scala
// convivevano 42 gradini di dimensione distinti (da 7px a 70px, spesso a mezzo pixel di distanza
// l'uno dall'altro) fra classi Tailwind arbitrarie (`text-[11px]`) e `fontSize` inline — differenze
// troppo piccole per essere percepite come gerarchia, solo rumore. Sono stati consolidati sulla
// scala NOMINALE di Tailwind, già presente di default e quindi senza bisogno di un'estensione in
// tailwind.config.ts: xs=12 · sm=14 · base=16 · lg=18 · xl=20 · 2xl=24 · 3xl=30 · 4xl=36 · 5xl=48 ·
// 6xl=60 · 7xl=72. Sotto i 12px non si scende più (floor di leggibilità: l'app si usa spesso
// all'aperto, in movimento, con luce forte).
//
// I sette ruoli, con la famiglia che ciascuno usa in pratica nel codice esistente:
//
//   display   Playfair (FONT.display) — copertina, nome del Diario, titolo di pagina (h1)
//   heading   Playfair (FONT.display) — titolo di sezione o di card (h2/h3)
//   body      DM Sans  (FONT.body)    — interfaccia: bottoni, liste, controlli — il default
//   reading   Lora     (FONT.lora)    — prosa narrativa: i paragrafi di Reportage/Guida/Diario e
//                                        delle pagine pubbliche di lettura (`/leggi/...`). NON un
//                                        doppione di `display`: è la seconda voce di una coppia
//                                        editoriale deliberata (serif da titolo + serif da testo),
//                                        vedi lib/taccuinoTokens.tsx — "corpo del testo resta su
//                                        FONT.lora: professionalità e precisione del contenuto".
//   secondary DM Sans  (FONT.body)    — metadati, sottotitoli, didascalie (14px)
//   label     Barlow   (FONT.barlow)  — etichette maiuscole, chip, unità di misura (12px)
//   hand      Caveat   (FONT_HAND, lib/taccuinoTokens.tsx) — annotazioni e date scritte a mano
//
// La prosa narrativa (`reading`) usa 16px (`text-base`), non 14px: è la dimensione confortevole
// per un paragrafo lungo, distinta dai 14px di `secondary` che restano adatti a un metadato breve.
// Eccezione dichiarata: i template a pagina fissa per l'export PDF del Diario
// (components/diario/*, che importano lib/pdfPageGeometry.ts) NON sono coperti da questo riordino
// — un aumento di corpo lì rischia di rompere l'impaginazione a altezza fissa della pagina
// stampata, verificabile solo rendendo davvero il PDF pagina per pagina. Restano sulle dimensioni
// precedenti finché non si fa un intervento dedicato con quella verifica.

/**
 * Famiglia effettivamente risolta dal browser per un ruolo, come stringa utilizzabile in
 * `ctx.font` su canvas.
 *
 * Serve perché il contesto 2D di un canvas non conosce le custom property: `ctx.font =
 * "20px var(--font-display)"` viene scartato in silenzio e resta il font precedente. Qui si
 * legge la famiglia risolta da un elemento sonda, così il canvas usa davvero il font del brand.
 * Va chiamata dopo `await document.fonts.ready`, altrimenti il font può non essere ancora
 * disponibile e il primo disegno esce con il fallback.
 */
export function resolvedFontFamily(role: FontRole): string {
  if (typeof document === 'undefined') return FONT[role]
  const probe = document.createElement('span')
  probe.style.cssText = `position:absolute;left:-9999px;font-family:${FONT[role]}`
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).fontFamily
  probe.remove()
  return resolved || FONT[role]
}

/** Attende che i font del brand siano pronti prima di disegnare su canvas. */
export async function waitForBrandFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  try { await document.fonts.ready } catch { /* non bloccare mai il disegno per questo */ }
}

// ── Palette ───────────────────────────────────────────────────────────────────
// Le tre scale custom di `tailwind.config.ts`. Attenzione a `stone`: sovrascrive quella di
// Tailwind ed è molto più calda (#978e7a contro #78716c). Usare per sbaglio lo stone di
// Tailwind in un PDF accanto a un'interfaccia in stone DTrek si nota subito.

export const TERRA = {
  50: '#fdf6ee', 100: '#f9e8d0', 200: '#f2cd9d', 300: '#e9ab64', 400: '#e08d3c',
  500: '#d97220', 600: '#c05a17', 700: '#9f4315', 800: '#813619', 900: '#6a2e18',
} as const

export const FOREST = {
  50: '#f1f8f2', 100: '#dcf0de', 200: '#bbe0bf', 300: '#8cc894', 400: '#58aa63',
  500: '#378d44', 600: '#277134', 700: '#20592b', 800: '#1c4724', 900: '#193b20',
} as const

export const STONE = {
  50: '#f8f7f4', 100: '#eeece5', 200: '#dcd8cc', 300: '#c4bead', 400: '#a9a18e',
  500: '#978e7a', 600: '#8a7f6e', 700: '#73695c', 800: '#5e564c', 900: '#4d4740',
} as const

/** Colori d'uso non appartenenti a una scala, presi da `app/globals.css`. */
export const INK      = '#2c2520' // colore del testo sul body
export const PAPER    = '#f8f7f4' // sfondo del body (= stone-50)
export const HAIRLINE = '#dcd8cc' // filo di separazione (= stone-200)
export const WHITE    = '#ffffff'

// ── Tracce sulle mappe ────────────────────────────────────────────────────────
/**
 * Colori per tracciati multipli, in ordine di assegnazione. Sostituisce le tre copie divergenti
 * della vecchia palette (mapTiles.ts due volte, app/diario/page.tsx una): erano colori generici
 * di Tailwind, ed essendo copie separate la legenda del diario finiva per mostrare colori diversi
 * dai tracciati che stava descrivendo.
 */
export const ROUTE_COLORS = [
  FOREST[600], TERRA[600], '#0369a1', '#7c3aed',
  FOREST[400], TERRA[400], '#0f766e', '#be123c',
] as const

export const ROUTE_START = FOREST[500]
export const ROUTE_END   = TERRA[600]

// ── Conversione per jsPDF ─────────────────────────────────────────────────────
// jsPDF vuole terne RGB 0-255, non stringhe esadecimali.

export type Rgb = [number, number, number]

export function rgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}
