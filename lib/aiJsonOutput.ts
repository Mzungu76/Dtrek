/**
 * Costruisce un `output_config.format` di tipo `json_schema` "auto-parseable" (stesso pattern del
 * pacchetto SDK di zodOutputFormat, senza però aggiungere zod come dipendenza) — usato dalle route
 * che generano JSON strutturato (questionario, caption, confronto percorsi) al posto di "rispondi
 * solo con JSON valido" scritto a parole nel system prompt più un parsing manuale con regex per
 * rimuovere eventuali code fence markdown. Passato a `client.messages.parse(...)`, popola
 * `message.parsed_output` già tipato invece di richiedere `JSON.parse` lato chiamante.
 */
export function jsonSchemaFormat<T>(schema: Record<string, unknown>) {
  return {
    type: 'json_schema' as const,
    schema,
    parse: (content: string): T => JSON.parse(content) as T,
  }
}

/**
 * Esegue una chiamata `client.messages.parse(...)` con un secondo tentativo automatico se il primo
 * fallisce — sia per un errore di rete/API sia per un JSON incompleto o vuoto (l'SDK Anthropic
 * rilancia un errore tipo "Failed to parse structured output: SyntaxError: Unexpected end of JSON
 * input" quando `content` non è JSON valido, es. una risposta troncata o un output vuoto:
 * non comune ma nemmeno raro con gli output strutturati, e quasi sempre transitorio). Se anche il
 * secondo tentativo fallisce, lancia un messaggio pensato per l'utente finale — mai il dettaglio
 * tecnico grezzo, che per un utente non è né comprensibile né azionabile — mentre l'errore
 * originale resta comunque loggato server-side per il debug.
 */
export async function parseWithRetry<T>(
  label: string,
  call: () => Promise<{ parsed_output: T | null }>,
): Promise<T> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const msg = await call()
      if (msg.parsed_output) return msg.parsed_output
      console.error(`[${label}] tentativo ${attempt}: parsed_output vuoto`)
    } catch (e) {
      console.error(`[${label}] tentativo ${attempt} fallito:`, e)
    }
  }
  throw new Error('La risposta AI non è arrivata completa — riprova.')
}
