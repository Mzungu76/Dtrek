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
