import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getUserFromRequestDetailed } from '@/lib/supabaseAuth'
import { resolveApiKeyAndSettings, resolveEmergencySharedKey } from '@/app/lib/guide/resolveApiKeyAndSettings'
import { FALLBACK_CLAUDE_MODELS, type ClaudeModelOption } from '@/lib/claudeModels'

export const dynamic = 'force-dynamic'

/**
 * Elenco dei modelli Claude selezionabili nelle impostazioni (SectionClaudeKey) — letto in diretta
 * dalla Models API di Anthropic (client.models.list()) con la chiave dell'utente, così resta
 * sempre aggiornato ad ogni nuovo modello rilasciato senza dover toccare un elenco statico nel
 * codice. Se non è possibile leggerlo (nessuna chiave salvata ancora, Anthropic irraggiungibile)
 * torna comunque un elenco di riserva (lib/claudeModels.ts), così il selettore funziona anche
 * prima che l'utente abbia salvato una chiave.
 */
export async function GET(req: NextRequest) {
  const { user, degraded } = await getUserFromRequestDetailed(req)
  // Il "feature" richiesto qui non conta: questa route legge solo apiKey (per interrogare la
  // Models API), mai il claudeModel risolto — 'guide' è un valore arbitrario tra quelli validi.
  const { apiKey } = user
    ? await resolveApiKeyAndSettings(user.id, 'guide')
    : degraded
      ? await resolveEmergencySharedKey('guide')
      : { apiKey: null }

  if (!apiKey) {
    return NextResponse.json({ models: FALLBACK_CLAUDE_MODELS, fromApi: false })
  }

  try {
    const client = new Anthropic({ apiKey })
    const models: ClaudeModelOption[] = []
    for await (const m of client.models.list()) {
      models.push({ id: m.id, displayName: m.display_name ?? m.id })
    }
    return NextResponse.json({
      models:  models.length > 0 ? models : FALLBACK_CLAUDE_MODELS,
      fromApi: models.length > 0,
    })
  } catch {
    return NextResponse.json({ models: FALLBACK_CLAUDE_MODELS, fromApi: false })
  }
}
