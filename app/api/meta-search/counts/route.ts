import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Cache edge Next.js — l'archivio dtrek_places cambia solo con un import batch (script offline),
// mai per un'azione dell'utente in app: non c'è motivo di interrogare Supabase a ogni apertura
// dell'hub di ricerca (app/percorsi/cerca/page.tsx). Stesso pattern di app/api/animals/route.ts.
export const revalidate = 3600

export interface MetaSearchCounts {
  borgo_citta: number
  sito: number
}

/**
 * Quante righe ha oggi l'archivio dtrek_places per tipologia — usato dagli scaffali "Borghi e
 * Città"/"Siti" dell'hub di ricerca (docs/piano-ricerca-mete.md, Fase 0) per mostrare un numero
 * vero invece di uno scritto a mano nel mockup. `head: true` con `count: 'exact'` conta le righe
 * senza trasferirle (nessun `select('*')` sull'intero catalogo).
 */
export async function GET() {
  const [{ count: borghi, error: borghiError }, { count: siti, error: sitiError }] = await Promise.all([
    supabase.from('dtrek_places').select('id', { count: 'exact', head: true }).eq('meta_type', 'borgo_citta'),
    supabase.from('dtrek_places').select('id', { count: 'exact', head: true }).eq('meta_type', 'sito'),
  ])

  if (borghiError || sitiError) {
    console.error('[meta-search/counts]', borghiError || sitiError)
    return NextResponse.json({ error: 'Errore interno' }, { status: 500 })
  }

  const body: MetaSearchCounts = { borgo_citta: borghi ?? 0, sito: siti ?? 0 }
  return NextResponse.json(body)
}
