import { getISOWeek } from 'date-fns'

// Banco di frasi pre-scritte per fascia di Recovery Score — nessuna chiamata AI.
// Ruota settimanalmente, non giornalmente: un escursionista non genera nuovi dati
// ogni giorno, quindi non ha senso cambiare frase più spesso di quanto i dati
// stessi cambino. Solo "Buono" è popolato per ora: le altre fasce usano il campo
// `suggestion` già calcolato da computeRecoveryScore come fallback, in attesa che
// il resto del banco venga scritto con lo stesso tono.
export const RECOVERY_PHRASES: Record<string, string[]> = {
  Buono: [
    'Buon equilibrio tra sforzo e riposo — hai margine per un\'uscita di slancio.',
    'Sei in un momento solido: nulla ti trattiene da una tappa più impegnativa.',
    'Il corpo ha smaltito bene il carico recente. Puoi permetterti di spingere un po\'.',
    'Stai bene: non al massimo, ma abbastanza per un percorso con qualche dislivello in più.',
    'Recupero solido. Se hai un sentiero in mente da un po\', questo è un buon momento.',
    'Ti sei ripreso bene dalle uscite recenti — margine per qualcosa di più lungo.',
    'Un equilibrio che regge: puoi scegliere un percorso più esigente senza rischiare troppo.',
    'Sei fresco a sufficienza per non doverti risparmiare, ma senza esagerare.',
    'Buona base — il tipo di momento in cui un sentiero nuovo vale la candela.',
    'Ti reggi bene sulle gambe: hai margine, anche se non sei al tuo picco.',
    'Recovery buono: la fatica accumulata resta sotto controllo.',
    'Discreto respiro tra sforzo e recupero — puoi alzare un po\' l\'asticella.',
    'Non sei scarico: c\'è margine per una salita che normalmente eviteresti.',
    'Bilancio positivo tra carico e riposo. Buon momento per qualcosa di più ambizioso.',
  ],
}

export function pickRecoveryPhrase(label: string, fallback: string, date: Date = new Date()): string {
  const bank = RECOVERY_PHRASES[label]
  if (!bank || bank.length === 0) return fallback
  return bank[getISOWeek(date) % bank.length]
}
