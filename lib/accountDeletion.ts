/**
 * Eliminazione account (docs/navigator-dtrek-boundary.md) — un utente che vuole liberarsi di tutti
 * i propri dati, o semplicemente riusare la stessa email per un nuovo account di test, senza dover
 * aspettare/inventare un indirizzo nuovo ogni volta.
 *
 * Le cache condivise (poi_notes, dtm_cache, start_point_cache, ...) non hanno mai una colonna
 * user_id — sono dati comuni per definizione, mai toccati qui, esattamente come atteso.
 */
import { supabase } from '@/lib/supabase'

// Bucket con percorso `${userId}/...` — vedi lib/activityPhotos.ts, lib/pdfUpload.ts,
// lib/diaryCoverUpload.ts, lib/fieldNotePhotos.ts. Devono essere ripuliti PRIMA di cancellare
// l'utente Auth: dopo, le righe DB che contenevano questi storagePath spariscono per CASCADE, e con
// loro l'unico riferimento a cosa cancellare nello Storage.
const USER_PREFIXED_BUCKETS = ['dtrek-photos', 'dtrek-reports'] as const

// Supabase Storage .list() non è ricorsivo (una cartella compare come voce con id null, senza il
// suo contenuto) — alcuni path sotto questi bucket annidano una sottocartella in più (es.
// `${userId}/field-notes/${hikeId}/${noteId}.jpg`), quindi serve scendere finché non si trovano solo file.
async function listAllPaths(bucket: string, prefix: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 })
  if (error || !data || data.length === 0) return []
  const paths: string[] = []
  for (const entry of data) {
    const fullPath = `${prefix}/${entry.name}`
    if (entry.id === null) paths.push(...(await listAllPaths(bucket, fullPath)))
    else paths.push(fullPath)
  }
  return paths
}

async function purgeBucket(bucket: string, userId: string): Promise<void> {
  const paths = await listAllPaths(bucket, userId)
  for (let i = 0; i < paths.length; i += 100) {
    await supabase.storage.from(bucket).remove(paths.slice(i, i + 100))
  }
}

/**
 * Cancella irreversibilmente l'account e tutti i dati personali dell'utente. Da chiamare solo dopo
 * aver verificato che chi chiede la cancellazione è proprio quell'utente (vedi
 * app/api/account/delete/route.ts) — non accetta userId arbitrari da un chiamante diverso.
 */
export async function deleteAccountAndData(userId: string): Promise<void> {
  await Promise.all(USER_PREFIXED_BUCKETS.map((bucket) => purgeBucket(bucket, userId)))

  // ai_usage_log.user_id non ha una FK verso auth.users (colonna uuid semplice, vedi
  // supabase/migrations/add_poi_notes_and_ai_usage_log.sql) quindi il CASCADE sotto non la tocca —
  // anonimizzata invece di cancellata: il conteggio token aggregato (costo AI) resta utile senza
  // restare legato a un account che non esiste più.
  await supabase.from('ai_usage_log').update({ user_id: null }).eq('user_id', userId)

  // Cancella l'utente Auth — ogni tabella con `user_id ... REFERENCES auth.users(id) ON DELETE
  // CASCADE` (activities, planned_hikes, user_settings, hike_reports, hike_questionnaires,
  // guide_questions, route_recommendations, activity_photos, route_search_history,
  // route_build_logs, video_custom_presets, hike_navigation_sessions e a cascata i suoi
  // eventi/track) si svuota da sola — vedi supabase-schema.sql e le migrazioni in
  // supabase/migrations/. Hard delete (non soft): l'email torna subito disponibile per una nuova
  // registrazione, requisito esplicito per riusarla nei test.
  const { error } = await supabase.auth.admin.deleteUser(userId)
  if (error) throw error
}
