// Testata del sito pubblico della Raccolta — stesso telaio di app/leggi/d/[token]/SiteChrome.tsx,
// di cui questo file riusa DtrekCallout/SiteFooter così come sono (nessuna delle due dipende da un
// Diario in particolare). Solo la testata cambia: naviga tra la home della collana e i suoi volumi,
// non tra la home del Diario e le sue escursioni.
import { DTREK_URL } from '@/lib/publicSite'

export { DtrekCallout, SiteFooter } from '@/app/leggi/d/[token]/SiteChrome'

export function SiteHeader({ token, collectionTitle, current }: {
  token: string
  collectionTitle: string
  current?: 'home' | 'volume' | 'escursione'
}) {
  return (
    <header className="sticky top-0 z-30 bg-forest-900/95 backdrop-blur text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-5">
        <div className="flex items-center justify-between h-14">
          <a href={`/leggi/c/${token}`} className="flex items-center gap-2.5 min-w-0 group">
            <span className="text-forest-300 text-lg leading-none">▲</span>
            <span className="font-display font-bold text-base truncate group-hover:text-forest-200 transition">
              {collectionTitle}
            </span>
          </a>
          <nav className="flex items-center gap-1 shrink-0">
            <a href={`/leggi/c/${token}`}
              className={`hidden sm:block text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                current === 'home' ? 'bg-white/15' : 'hover:bg-white/10 text-white/70'
              }`}>
              La raccolta
            </a>
            <a href={DTREK_URL} target="_blank" rel="noopener noreferrer"
              className="text-xs font-semibold bg-terra-500 hover:bg-terra-400 transition rounded-full px-3.5 py-1.5">
              Prova DTrek
            </a>
          </nav>
        </div>
      </div>
    </header>
  )
}
