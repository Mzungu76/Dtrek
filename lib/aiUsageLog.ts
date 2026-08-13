import { supabase } from '@/lib/supabase'

/**
 * Raw token counter per chiamata Claude nella generazione guida — costruito per rispondere con
 * dati reali, non stime, a "quanto costa in media/al massimo generare un percorso" (serve a
 * dimensionare i tetti di volume dei pacchetti, decisione 3 dell'artifact "La Guida IA"). Scrive
 * solo token grezzi: il costo in denaro va calcolato a query-time con la tariffa corrente, mai
 * congelato qui dentro.
 *
 * Best-effort e silenziosa come le altre scritture accessorie in app/api/guide/route.ts: un
 * fallimento qui non deve mai far fallire la generazione della guida, solo lasciare un buco nella
 * telemetria (recuperabile dal prossimo utilizzo).
 */
export async function logAiUsage(entry: {
  userId: string | null
  hikeId: string | null
  feature: string
  model: string
  inputTokens: number
  outputTokens: number
}): Promise<void> {
  try {
    const { error } = await supabase.from('ai_usage_log').insert({
      user_id:       entry.userId,
      hike_id:       entry.hikeId,
      feature:       entry.feature,
      model:         entry.model,
      input_tokens:  entry.inputTokens,
      output_tokens: entry.outputTokens,
    })
    if (error) console.error('[aiUsageLog] insert failed:', error.message)
  } catch (e) {
    console.error('[aiUsageLog] insert failed:', e)
  }
}
