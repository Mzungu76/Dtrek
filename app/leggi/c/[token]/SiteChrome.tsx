// Testata del sito pubblico della Raccolta — stesso telaio di app/leggi/d/[token]/SiteChrome.tsx,
// di cui questo file riusa DtrekCallout/SiteFooter così come sono (nessuna delle due dipende da un
// Diario in particolare). Solo la testata cambia: naviga tra la home della collana e i suoi volumi,
// non tra la home del Diario e le sue escursioni.
//
// Direzione Taccuino Botanico (docs/siti-pubblici-taccuino-piano.md): estesa qui per coerenza con
// app/leggi/d/[token] — un'escursione dentro un volume di una Raccolta (v/[vi]/e/[n]) riusa già
// EntryArticle.tsx, quindi senza questo allineamento la card in stile taccuino galleggiava su una
// pagina rimasta nella vecchia palette editoriale.
import { DTREK_URL } from '@/lib/publicSite'

export { DtrekCallout, SiteFooter, TaccuinoPaperTexture, TaccuinoSpineShadow } from '@/app/leggi/d/[token]/SiteChrome'

export function SiteHeader({ token, collectionTitle, current }: {
  token: string
  collectionTitle: string
  current?: 'home' | 'volume' | 'escursione'
}) {
  return (
    <header className="sticky top-0 z-30 bg-[#F9F2E4]/95 backdrop-blur border-b border-[#D9C9A8] pl-[34px]">
      <div className="max-w-4xl mx-auto px-4 sm:px-5">
        <div className="flex items-center justify-between h-14">
          <a href={`/leggi/c/${token}`} className="flex items-center gap-2.5 min-w-0 group">
            <span className="text-[#C0603D] text-lg leading-none">▲</span>
            <span className="font-barlow font-bold text-[10px] tracking-[.2em] uppercase text-[#95886A] truncate group-hover:text-[#7A6F52] transition">
              {collectionTitle}
            </span>
          </a>
          <nav className="flex items-center gap-1 shrink-0">
            <a href={`/leggi/c/${token}`}
              className={`hidden sm:block text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                current === 'home' ? 'bg-[#EBE0C8] text-[#2E2A22]' : 'text-[#7A6F52] hover:bg-[#EBE0C8]/60'
              }`}>
              La raccolta
            </a>
            <a href={DTREK_URL} target="_blank" rel="noopener noreferrer"
              className="text-xs font-semibold bg-[#C0603D] hover:bg-[#9f4d33] transition rounded-full px-3.5 py-1.5 text-white">
              Prova DTrek
            </a>
          </nav>
        </div>
      </div>
    </header>
  )
}
