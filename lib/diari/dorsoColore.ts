// Palette dei dorsi dei Diari — direzione "Taccuino Botanico" (lib/taccuinoTokens.tsx). Un giro
// deterministico per indice così lo stesso Diario ha sempre lo stesso colore tra un caricamento e
// l'altro (nessuno stato da persistere solo per questo). Condivisa fra il registro a righe
// (components/diari/RegistroRow.tsx) e la Libreria (app/diari/page.tsx,
// docs/libreria-atlante-piano.md).
export const DORSI = [
  'linear-gradient(180deg,#C0603D,#8A3D26)',
  'linear-gradient(180deg,#7C8F6E,#4A5A3F)',
  'linear-gradient(180deg,#A89A78,#5E564C)',
  'linear-gradient(180deg,#8A6A46,#3A352B)',
  'linear-gradient(180deg,#5F7355,#2E3A26)',
]

export function dorsoColore(indice: number): string {
  return DORSI[indice % DORSI.length]
}
