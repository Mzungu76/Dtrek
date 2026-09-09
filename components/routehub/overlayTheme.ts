/**
 * Token di stile condivisi per il contenuto di Screen 2 (RoutePage): pagina bianca stile
 * magazine — usano già lo stesso font (`font-display`) e la stessa scala neutra (`stone-*`) del
 * resto dell'app, non una palette a parte: qui sono solo alias brevi per non ripetere le stesse
 * classi Tailwind riga dopo riga in ResocontoHub/GuidaHub/AssessmentPanel e nei widget della
 * Guida (i chiamanti reali, tutti piccoli menu/popover su sfondo chiaro — non la copertina a
 * foto piena di GuidaHub/ResocontoHub, che resta deliberatamente un modo visivo a sé, vedi il
 * commento in testa a components/libro/BookPage.tsx).
 *
 * Fase 3 del riordino UI/UX (docs/diario-valutazione-ux-piano.md): rimossi `glassTile`,
 * `glassTileHover`, `glassChip` e `textFaint` — verificato che nessuno dei quattro fosse più
 * importato da nessuna parte (il commento originale diceva che `glassChip` serviva ancora ai
 * punteggi CTS/Sicurezza/Bellezza di TopOverlay, ma quella pagina non lo usa più: quei punteggi
 * sono stati ridisegnati altrove nel frattempo senza che questo file venisse aggiornato).
 */
export const textPrimary = 'text-stone-800'
export const textMuted   = 'text-stone-500'
export const bigNumber   = 'font-display font-black text-stone-900'
export const sectionHeading = 'font-display text-sm font-bold text-stone-500 uppercase tracking-wider'
