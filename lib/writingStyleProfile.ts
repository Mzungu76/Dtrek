// Profilo di scrittura persistente dell'escursionista — derivato dalla lunghezza/verbosità delle
// sue risposte testuali (text/freewrite) al questionario guidato, per calibrare tono delle domande
// e stile della sezione "Cronaca" del resoconto sul suo registro reale invece di un tono "medio"
// generico. SOLO server-side (chiave service-role), stesso pattern di lib/hikerHistory.ts.
//
// Volutamente limitato al segnale di verbosità (nessuna analisi di tono/formalità via AI, che
// richiederebbe una chiamata extra a ogni risposta salvata): aggiornamento incrementale con un
// semplice fold-in, non un ricalcolo completo.
import { supabase } from './supabase'

export interface WritingStyleProfile {
  /** Quante risposte text/freewrite hanno contribuito finora (le scelte rapide "choice" non contano: non sono rappresentative dello stile di scrittura). */
  answeredCount: number
  sumWords: number
  updatedAt: string
}

/** Sotto questa soglia il profilo esiste ma non è ancora "pronto": né badge né istruzioni nei prompt — troppo pochi dati per essere un segnale affidabile. */
const READY_THRESHOLD = 5

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function isProfileReady(profile: WritingStyleProfile | null): boolean {
  return !!profile && profile.answeredCount >= READY_THRESHOLD
}

function avgWords(profile: WritingStyleProfile): number {
  return profile.answeredCount > 0 ? profile.sumWords / profile.answeredCount : 0
}

export async function readProfile(userId: string): Promise<WritingStyleProfile | null> {
  const { data, error } = await supabase.from('user_settings').select('writing_style_profile').eq('user_id', userId).maybeSingle()
  if (error) console.error('[writingStyleProfile] read failed (probabile colonna non ancora migrata):', error.message)
  return (data?.writing_style_profile as WritingStyleProfile | null) ?? null
}

async function writeProfile(userId: string, profile: WritingStyleProfile): Promise<void> {
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, writing_style_profile: profile, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) console.error('[writingStyleProfile] write failed:', error.message)
}

/** Chiamata (fire-and-forget) quando l'utente salva una risposta text/freewrite non vuota e non
 *  saltata — vedi PATCH in app/api/questionnaire/route.ts. */
export async function updateProfileWithAnswer(userId: string, answerText: string): Promise<void> {
  const words = countWords(answerText)
  if (words === 0) return
  const existing = await readProfile(userId)
  const updated: WritingStyleProfile = {
    answeredCount: (existing?.answeredCount ?? 0) + 1,
    sumWords: (existing?.sumWords ?? 0) + words,
    updatedAt: new Date().toISOString(),
  }
  await writeProfile(userId, updated)
}

/** Blocco testuale per il prompt (questionario o resoconto) — chiamare solo se isProfileReady(). */
export function formatStyleProfileBlock(profile: WritingStyleProfile): string {
  const avg = avgWords(profile)
  if (avg < 8) {
    return `STILE ABITUALE DI RISPOSTA DELL'ESCURSIONISTA: tendenzialmente molto breve e diretto (~${Math.round(avg)} parole per risposta in media) — calibra la formulazione di conseguenza, senza forzarlo verso risposte più lunghe o elaborate.`
  }
  if (avg < 20) {
    return `STILE ABITUALE DI RISPOSTA DELL'ESCURSIONISTA: lunghezza media, né troppo breve né elaborata (~${Math.round(avg)} parole per risposta in media).`
  }
  return `STILE ABITUALE DI RISPOSTA DELL'ESCURSIONISTA: tendenzialmente lungo e articolato, con dettagli e riflessioni (~${Math.round(avg)} parole per risposta in media) — puoi invitarlo a raccontare con respiro, è il suo registro naturale.`
}
