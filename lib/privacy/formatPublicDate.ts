// Data di un'escursione sulla pagina pubblica — intera o solo mese/anno, secondo la preferenza di
// privacy dell'utente (docs/raccolte-pubblicazione-piano.md, Fase 3f). Il giorno esatto di per sé
// non localizza nulla (a differenza del punto di partenza, vedi trimHomeStart.ts), ma un elenco
// pubblico di date rende leggibili le abitudini di chi lo pubblica — quali giorni della settimana
// esce, con quale ricorrenza.
import { format } from 'date-fns'
import { it } from 'date-fns/locale'

export function formatPublicDate(iso: string, hideExactDate: boolean): string {
  return format(new Date(iso), hideExactDate ? 'MMMM yyyy' : 'd MMMM yyyy', { locale: it })
}
