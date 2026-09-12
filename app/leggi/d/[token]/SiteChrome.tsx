// Telaio del sito pubblico del Diario: testata, navigazione, piede e richiami a DTrek.
//
// Direzione Taccuino Botanico (docs/siti-pubblici-taccuino-piano.md): carta, rilegatura, scrittura
// a mano — non più la palette editoriale forest/terra. Riusa `lib/taccuinoTokens.tsx` così com'è,
// prima implementazione reale di quella direzione (nessuna schermata la montava finora).
//
// Sui richiami a DTrek: sono tre, di intensità crescente e mai invadenti — un pulsante discreto in
// testata, una scheda in fondo alla home, una riga nel piede. Chi legge il diario di un amico è
// esattamente il pubblico giusto per l'app, ma lo è finché il diario resta il protagonista.

import { DTREK_URL } from '@/lib/publicSite'
import { taccuinoPaperBackgroundStyle, TaccuinoSpineShadow } from '@/lib/taccuinoTokens'

export { taccuinoPaperBackgroundStyle, TaccuinoSpineShadow }

export function SiteHeader({ homeHref, homeLabel = 'Il diario', title, current }: {
  /** Dove porta il logo/titolo e la voce "home" della navigazione — l'indice di questo sito
   *  (il Diario stesso), o, per un Diario annidato in una Raccolta, l'indice della Raccolta. */
  homeHref: string
  /** Etichetta della voce "home" in navigazione — "Il diario" di default, "La raccolta" per una
   *  Raccolta (docs/raccolte-pubblicazione-piano.md, Fase 3g). */
  homeLabel?: string
  title: string
  /** Voce attiva, per l'evidenza in navigazione. */
  current?: 'home' | 'escursione'
}) {
  return (
    <header className="sticky top-0 z-30 bg-[#F9F2E4]/95 backdrop-blur border-b border-[#D9C9A8] pl-[34px]">
      <div className="max-w-4xl mx-auto px-4 sm:px-5">
        <div className="flex items-center justify-between h-14">
          <a href={homeHref} className="flex items-center gap-2.5 min-w-0 group">
            <span className="text-[#C0603D] text-lg leading-none">▲</span>
            <span className="font-barlow font-bold text-[10px] tracking-[.2em] uppercase text-[#95886A] truncate group-hover:text-[#7A6F52] transition">
              {title}
            </span>
          </a>
          <nav className="flex items-center gap-1 shrink-0">
            <a href={homeHref}
              className={`hidden sm:block text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                current === 'home' ? 'bg-[#EBE0C8] text-[#2E2A22]' : 'text-[#7A6F52] hover:bg-[#EBE0C8]/60'
              }`}>
              {homeLabel}
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

/** Richiamo all'app in fondo alla home: l'unico che occupa spazio, e solo lì. */
export function DtrekCallout() {
  return (
    <section className="rounded-3xl overflow-hidden border border-[#D9C9A8] shadow-sm bg-[#EBE0C8]">
      <div className="p-7 sm:p-9 text-center" style={{ background: 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)' }}>
        <p className="font-barlow font-bold text-[10px] tracking-[0.25em] uppercase text-[#e9ab64]">
          Questo diario è fatto con
        </p>
        <p className="font-display text-2xl sm:text-3xl font-bold mt-2 flex items-center justify-center gap-2 text-white">
          <span className="text-[#8cc894]">▲</span> DTrek
        </p>
        <p className="text-sm text-white/70 mt-3 max-w-sm mx-auto leading-relaxed">
          Carica la traccia di un&apos;escursione e ne ricavi mappe, profilo altimetrico, punteggi
          del percorso e un racconto da conservare. Il diario si costruisce da sé, uscita dopo
          uscita.
        </p>
        <a href={DTREK_URL} target="_blank" rel="noopener noreferrer"
          className="inline-block mt-5 bg-white text-[#193b20] font-display font-bold text-sm rounded-full px-7 py-3 hover:bg-stone-100 transition">
          Comincia il tuo diario
        </a>
      </div>
    </section>
  )
}

export function SiteFooter() {
  return (
    <footer className="mt-2 pb-8 text-center space-y-1.5">
      <p className="text-[11px] text-[#95886A]">
        Pubblicato con{' '}
        <a href={DTREK_URL} target="_blank" rel="noopener noreferrer"
          className="font-semibold text-[#C0603D] hover:text-[#9f4d33] transition">
          DTrek
        </a>
      </p>
      <p className="text-[10px] text-[#c4bead]">Mappe © OpenStreetMap contributors · © CARTO</p>
    </footer>
  )
}
