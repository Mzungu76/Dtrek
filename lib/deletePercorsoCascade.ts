import { supabase } from '@/lib/supabase'
import { deleteActivityCascade } from './deleteActivityCascade'

/**
 * Cancella per intero un Percorso (planned_hikes): tutti i suoi Reportage (activities collegate
 * via linked_planned_id, ciascuna con la stessa cascata di deleteActivityCascade — foto, resoconto
 * scritto, PDF), poi il Percorso stesso. "Un percorso è un sentiero ripetibile" (Fase 0 di
 * docs/diario-fulcro-piano.md) significa che può avere più Reportage: cancellarlo deve sempre
 * portarli via con sé, mai lasciarli orfani con un linked_planned_id ormai inesistente.
 */
export async function deletePercorsoCascade(userId: string, percorsoId: string): Promise<void> {
  const { data: activities } = await supabase
    .from('activities')
    .select('id')
    .eq('user_id', userId)
    .eq('linked_planned_id', percorsoId)

  for (const a of activities ?? []) {
    await deleteActivityCascade(userId, a.id as string)
  }

  await supabase.from('planned_hikes').delete().eq('id', percorsoId).eq('user_id', userId)
}
