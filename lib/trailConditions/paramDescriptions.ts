// Plain-language explanations shown by InfoTooltip next to each "Condizioni attuali" row
// (components/CurrentConditionsNotice.tsx) — one entry per SignalRow.kind.
export const CONDITIONS_PARAM_DESCRIPTIONS: Record<string, string> = {
  weather: 'Precipitazioni e umidità del suolo stimate negli ultimi 7 giorni, pesate in base al tipo di fondo e alla pendenza del sentiero.',
  climateTemp: 'Temperature medie attuali per la zona e la quota del sentiero rispetto ai valori favorevoli per l’escursionismo.',
  climateAltitude: 'Quota elevata combinata con la stagione invernale aumenta il rischio di neve e condizioni difficili.',
  climateSeason: 'Bonus per i mesi di transizione (aprile-maggio, ottobre-novembre) generalmente più favorevoli per camminare.',
}
