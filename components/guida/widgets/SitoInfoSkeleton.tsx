/**
 * Placeholder per SitoInfoWidget, mostrato mentre placeDetail è ancora in caricamento
 * (GuideReader.tsx's placeDetailLoading) — verifica utente 2026-09-29: "gli elementi sembrano
 * arrivare a cascata", causato da questo pannello che non esisteva affatto finché placeDetail non
 * arrivava (cells.length === 0 ⇒ null) e appariva di colpo, già completo, quando i dati erano
 * pronti. Stessa forma esatta del pannello reale (label + griglia 2×2), solo con blocchi grigi al
 * posto del contenuto — la comparsa diventa una rivelazione, non un salto di layout.
 *
 * Copre anche il caso più insidioso: per un siteType "ambiguo" (sitoCardFamily in
 * lib/guideCardVariant.ts) la famiglia di scheda dipende da placeDetail stesso (hasVisitInfo) —
 * senza questo skeleton il pannello poteva letteralmente cambiare TIPO (da galleria a scheda
 * pratica) non appena i dati arrivavano. Mostrato al posto di ENTRAMBE le varianti finché
 * placeDetail non si stabilizza, mai quella sbagliata per un istante.
 */
export default function SitoInfoSkeleton() {
  return (
    <div className="bg-stone-100 border-b border-stone-200 px-5 sm:px-8 md:px-10 py-4">
      <div className="h-2.5 w-32 rounded bg-stone-200 animate-pulse mb-3" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ animationDelay: `${i * 70}ms` }}>
            <div className="w-4 h-4 rounded bg-stone-300 animate-pulse" />
            <div className="h-3 w-4/5 rounded bg-stone-300 animate-pulse mt-1.5" />
            <div className="h-2 w-1/2 rounded bg-stone-200 animate-pulse mt-1" />
          </div>
        ))}
      </div>
    </div>
  )
}
