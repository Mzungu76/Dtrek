// Fase 1 di docs/navigator-orizzonti-roadmap.md — scrive la posizione corrente sulla riga
// hike_navigation_sessions dell'utente ogni volta che viene chiamato (il chiamante,
// ActiveNavigationView.tsx, decide la cadenza — v1 ~15-20s), quando la condivisione live è
// abilitata. Best-effort puro, nessuna coda locale: se la scrittura fallisce (offline), si
// riprova semplicemente al prossimo tick — stesso principio già usato per la creazione della
// sessione stessa (best-effort, la navigazione locale prosegue comunque).
//
// Scrittura diretta via client browser (RLS "nav_sessions_owner" già la autorizza), non
// tramite una API route dedicata — stesso pattern già in uso in lib/sync/realtimeSync.ts/
// syncEngine.ts per scritture autenticate frequenti, non quello a coda/batch di
// navigationStore.ts (pensato per la traccia storica, non per un aggiornamento "ultima
// posizione" a bassa latenza).
import { getBrowserSupabase } from '@/lib/supabaseBrowser'

export interface LiveFix {
  lat: number
  lon: number
  ts: number
  accuracyM: number | null
}

// DTREK-AUDIT.md P0 #8 — torna un booleano di successo (prima Promise<void>, l'esito era del
// tutto invisibile al chiamante) così che ActiveNavigationView.tsx possa accorgersi se il proprio
// "battito" di posizione live smette di arrivare al server e avvisare l'escursionista stesso —
// oggi l'unico modo per saperlo era controllare a mano il link pubblico da un altro dispositivo.
export async function publishLivePosition(sessionId: string, fix: LiveFix): Promise<boolean> {
  try {
    const { error } = await getBrowserSupabase()
      .from('hike_navigation_sessions')
      .update({
        last_live_lat: fix.lat,
        last_live_lon: fix.lon,
        last_live_ts: new Date(fix.ts).toISOString(),
        last_live_accuracy_m: fix.accuracyM,
      })
      .eq('id', sessionId)
    return !error
  } catch {
    // Silenzioso by design — vedi commento in testa al file: si riprova al prossimo tick.
    return false
  }
}
