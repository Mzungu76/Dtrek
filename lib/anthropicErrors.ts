// Riconoscimento dell'errore "credito Anthropic esaurito" — l'API Claude lo restituisce come un
// comune invalid_request_error con un messaggio testuale ("Your credit balance is too low..."),
// non con un codice/tipo dedicato, quindi l'unico modo affidabile per distinguerlo da un'altra
// richiesta non valida è cercare quella frase nel messaggio d'errore.
export function isCreditBalanceError(e: unknown): boolean {
  const message = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
  return /credit balance/i.test(message)
}
