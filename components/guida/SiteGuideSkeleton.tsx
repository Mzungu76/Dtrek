import SitoInfoSkeleton from './widgets/SitoInfoSkeleton'

/**
 * Mostrato in SiteGuideOverlay.tsx mentre la Guida (hike) è ancora in caricamento — verifica
 * utente 2026-09-29: prima un semplice spinner centrato, poi la Guida vera appariva tutta insieme
 * di colpo. Ricalca la forma reale (copertina, titolo, pannello info, righe di testo) così la
 * comparsa dei dati veri è una rivelazione al posto giusto, non un salto di layout — stesso
 * principio di HubSkeleton.tsx (components/routehub), qui per la sola Guida di Sito.
 */
export default function SiteGuideSkeleton() {
  return (
    <div style={{ background: '#fdfcfa' }}>
      <div
        className="relative w-full overflow-hidden bg-stone-200 animate-pulse [--hero-h:clamp(200px,50vw,300px)] md:[--hero-h:clamp(240px,32vw,380px)] lg:[--hero-h:clamp(280px,26vw,460px)]"
        style={{ height: 'var(--hero-h)' }}
      >
        <div className="absolute left-5 sm:left-8 right-5 sm:right-8 bottom-6 space-y-2.5">
          <div className="h-3 w-28 rounded-full bg-white/40" />
          <div className="h-6 sm:h-7 w-2/3 rounded-md bg-white/50" />
        </div>
      </div>

      <SitoInfoSkeleton />

      <div className="px-5 sm:px-8 md:px-10 py-5 space-y-2.5">
        {[100, 94, 88, 60].map((w, i) => (
          <div
            key={i}
            className="h-3 rounded bg-stone-200 animate-pulse"
            style={{ width: `${w}%`, animationDelay: `${i * 70}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
