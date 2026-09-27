'use client'

interface Props {
  tappaIndex: number
  tappaCount: number
  onContinue: () => void
  onFinishForToday: () => void
}

/**
 * Modale di arrivo a fine tappa (Borgo/Città su più giornate, Navigator "Modalità A" — sessione di
 * navigazione unica che segnala il confine tra tappe invece di trattarle come un cammino
 * continuo). Diverso da un semplice callout passivo (PoiCalloutSheet, usato per gli altri
 * RouteMoment): qui c'è una vera decisione da prendere, quindi un modale con due azioni come
 * ConfirmEndDialog, non un avviso che si chiude da solo.
 *
 * Riaprire il Navigator un altro giorno sulla stessa Meta non richiede alcuno stato salvato apposta
 * qui: il motore di posizionamento ritrova da solo il punto più vicino sul percorso non appena
 * riceve un fix GPS reale, esattamente come già succede per una pausa/ripresa nella stessa uscita.
 */
export default function TappaCompleteDialog({ tappaIndex, tappaCount, onContinue, onFinishForToday }: Props) {
  return (
    <div className="fixed inset-0 z-[3000] bg-black/50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-forest-600 mb-1">
          Tappa {tappaIndex + 1} di {tappaCount} completata
        </p>
        <h2 className="text-lg font-bold font-display text-stone-900 mb-2">Ottimo lavoro!</h2>
        <p className="text-sm text-stone-600 font-body mb-6">
          Hai raggiunto la fine di questa tappa. Puoi continuare subito con la prossima, oppure
          fermarti qui e riprendere un altro giorno — basterà riaprire la navigazione da questo
          stesso punto.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onFinishForToday}
            className="flex-1 py-2.5 rounded-xl bg-stone-100 text-stone-700 font-semibold font-body text-sm hover:bg-stone-200"
          >
            Fine per oggi
          </button>
          <button
            onClick={onContinue}
            className="flex-1 py-2.5 rounded-xl bg-forest-500 text-white font-semibold text-sm hover:bg-forest-600"
          >
            Continua ora
          </button>
        </div>
      </div>
    </div>
  )
}
