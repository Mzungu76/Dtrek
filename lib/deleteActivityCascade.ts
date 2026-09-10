import { supabase } from '@/lib/supabase'

/**
 * Cancella per intero un'attività (un Reportage): le sue foto (righe + blob Storage), il
 * resoconto scritto (hike_reports, riga + eventuale PDF esportato), poi l'attività stessa. Nessuna
 * delle tre tabelle ha un vincolo FK verso `activities` (colonne di testo semplice, non
 * REFERENCES) — senza questa cascata applicativa, cancellare un'attività lascia per sempre righe
 * e file orfani. Prima solo le foto venivano ripulite qui (app/api/activity/route.ts): il
 * resoconto scritto e il suo PDF restavano — stesso difetto, mai chiuso finché non serviva anche
 * per la cascata Percorso → Reportage di Fase 6 (docs/diario-fulcro-piano.md).
 */
export async function deleteActivityCascade(userId: string, activityId: string): Promise<void> {
  const { data: photoRows } = await supabase
    .from('activity_photos')
    .select('storage_path')
    .eq('activity_id', activityId)
    .eq('user_id', userId)

  if (photoRows && photoRows.length > 0) {
    const paths = photoRows.flatMap((row) => {
      const storagePath = row.storage_path as string | null
      if (!storagePath) return []
      const thumbPath = storagePath.replace(/(\.[^./]+)$/, '-thumb$1')
      return [storagePath, thumbPath]
    })
    if (paths.length > 0) await supabase.storage.from('dtrek-photos').remove(paths)

    await supabase.from('activity_photos').delete().eq('activity_id', activityId).eq('user_id', userId)
  }

  // Il PDF di un resoconto esportato (se mai generato) vive a un percorso deterministico — vedi
  // lib/pdfUpload.ts's uploadReportPdf — non serve leggerlo dalla riga per saperlo. remove() su un
  // file inesistente non è un errore.
  await supabase.storage.from('dtrek-reports').remove([`${userId}/${activityId}-report.pdf`])
  await supabase.from('hike_reports').delete().eq('activity_id', activityId).eq('user_id', userId)

  await supabase.from('activities').delete().eq('id', activityId).eq('user_id', userId)
}
