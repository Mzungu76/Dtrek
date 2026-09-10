// Quali badge l'utente ha già visto "nuovi" — condiviso tra components/stats/TabTraguardi.tsx e la
// riga di P-O2 in ReportReader.tsx (UX-AUDIT.md), così lo stesso sblocco non viene festeggiato due
// volte in due punti diversi dell'app. localStorage semplice, legato al dispositivo (un badge visto
// su un dispositivo può ripresentarsi "nuovo" su un altro — costo accettabile per una pura
// preferenza di UI, non uno stato di prodotto da sincronizzare).
const LS_KEY = 'dtrek_badges_seen'

export function getSeenBadgeIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_KEY) ?? '[]')) } catch { return new Set() }
}

export function markBadgesSeen(ids: string[]) {
  try {
    const current = getSeenBadgeIds()
    ids.forEach(id => current.add(id))
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(current)))
  } catch {}
}
