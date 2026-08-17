type CloseFn = () => void
const stack: CloseFn[] = []

/**
 * Registra una funzione di chiusura in cima allo stack — usata da NavigatorBackHandler.tsx per
 * sapere se il tasto/gesto indietro hardware deve chiudere un pannello/popup aperto invece di
 * navigare alla schermata precedente o proporre di uscire dall'app. Senza questo, un pannello
 * aperto con un semplice useState (non con la cronologia, a differenza del guard di
 * ActiveNavigationView.tsx) veniva scavalcato: indietro saltava dritto alla logica di
 * navigazione/uscita, lasciando il pannello aperto sopra una schermata già cambiata sotto — nel
 * caso peggiore (un pannello aperto sulla home di Navigator) un secondo tocco chiudeva l'intera
 * app invece del pannello.
 *
 * Ritorna la funzione di deregistrazione, da richiamare quando il pannello si chiude.
 */
export function pushBackHandler(onClose: CloseFn): () => void {
  stack.push(onClose)
  return () => {
    const i = stack.lastIndexOf(onClose)
    if (i !== -1) stack.splice(i, 1)
  }
}

/** Chiama e "consuma" il gestore più in cima allo stack, se presente. Ritorna true se ha
 *  effettivamente chiuso qualcosa (il chiamante non deve fare altro), false se lo stack è vuoto. */
export function closeTopModal(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top()
  return true
}
