import { supabase } from '@/lib/supabase'
import { deleteActivityCascade } from './deleteActivityCascade'

/**
 * Cancella per intero una Meta (planned_hikes): le Guide di Sito nate da una sua tappa (piano
 * §51.3/§51.4 — "Leggi tutto" su BorgoTappeWidget, planned_hikes.parent_meta_id), ricorsivamente
 * con la stessa cascata (verificato: cancellando un Borgo/Città quelle restavano, orfane con un
 * parent_meta_id ormai inesistente e i propri Reportage mai ripuliti), poi tutti i Reportage di
 * QUESTA Meta (activities collegate via linked_planned_id, ciascuna con la stessa cascata di
 * deleteActivityCascade — foto, resoconto scritto, PDF), infine la Meta stessa. "Un percorso è un
 * sentiero ripetibile" (Fase 0 di docs/diario-fulcro-piano.md) significa che può avere più
 * Reportage: cancellarlo deve sempre portarli via con sé, mai lasciarli orfani con un
 * linked_planned_id ormai inesistente. Ricorsiva per coerenza, anche se oggi solo un Borgo/Città
 * può avere figli — mai un Sito.
 */
export async function deletePercorsoCascade(userId: string, percorsoId: string): Promise<void> {
  const { data: children } = await supabase
    .from('planned_hikes')
    .select('id')
    .eq('user_id', userId)
    .eq('parent_meta_id', percorsoId)

  for (const child of children ?? []) {
    await deletePercorsoCascade(userId, child.id as string)
  }

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
