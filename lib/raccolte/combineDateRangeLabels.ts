// Combina i `dateRangeLabel` di più volumi (ciascuno già "anno" o "anno–anno", da
// lib/sharePublicDiary.ts) nell'intervallo complessivo di una Raccolta pubblica —
// docs/raccolte-pubblicazione-piano.md, Fase 3b. Modulo a sé (non dentro
// lib/sharePublicCollection.ts) per restare testabile senza toccare `lib/supabase.ts`, che lancia
// se le variabili d'ambiente non sono impostate — anche solo per un helper puro come questo.
export function combineDateRangeLabels(labels: (string | undefined)[]): string | undefined {
  const years = labels
    .filter((l): l is string => !!l)
    .flatMap(l => l.split('–').map(y => parseInt(y, 10)))
    .filter(y => Number.isFinite(y))
  if (years.length === 0) return undefined
  const min = Math.min(...years)
  const max = Math.max(...years)
  return min === max ? String(min) : `${min}–${max}`
}
