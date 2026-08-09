// Telaio del sito pubblico del Diario: testata, navigazione, piede e richiami a DTrek.
//
// Il link condiviso non è più una pagina sola che scorre: è un piccolo sito con una home e una
// pagina per escursione. Il telaio è quello che lo tiene insieme e lo fa sembrare un sito e non
// un documento — testata persistente, navigazione sempre raggiungibile, piede con il richiamo
// all'app.
//
// Sui richiami a DTrek: sono tre, di intensità crescente e mai invadenti — un pulsante discreto in
// testata, una scheda in fondo alla home, una riga nel piede. Chi legge il diario di un amico è
// esattamente il pubblico giusto per l'app, ma lo è finché il diario resta il protagonista.

import { DTREK_URL } from '@/lib/publicSite'

export function SiteHeader({ token, diaryTitle, current }: {
  token: string
  diaryTitle: string
  /** Voce attiva, per l'evidenza in navigazione. */
  current?: 'home' | 'escursione'
}) {
  return (
    <header className="sticky top-0 z-30 bg-forest-900/95 backdrop-blur text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-5">
        <div className="flex items-center justify-between h-14">
          <a href={`/leggi/d/${token}`} className="flex items-center gap-2.5 min-w-0 group">
            <span className="text-forest-300 text-lg leading-none">▲</span>
            <span className="font-display font-bold text-base truncate group-hover:text-forest-200 transition">
              {diaryTitle}
            </span>
          </a>
          <nav className="flex items-center gap-1 shrink-0">
            <a href={`/leggi/d/${token}`}
              className={`hidden sm:block text-xs font-semibold px-3 py-1.5 rounded-full transition ${
                current === 'home' ? 'bg-white/15' : 'hover:bg-white/10 text-white/70'
              }`}>
              Il diario
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

/** Richiamo all'app in fondo alla home: l'unico che occupa spazio, e solo lì. */
export function DtrekCallout() {
  return (
    <section className="rounded-3xl overflow-hidden border border-stone-200 shadow-sm bg-white">
      <div className="bg-gradient-to-br from-forest-700 to-forest-900 p-7 sm:p-9 text-center text-white">
        <p className="font-barlow font-bold text-[10px] tracking-[0.25em] uppercase text-terra-300">
          Questo diario è fatto con
        </p>
        <p className="font-display text-2xl sm:text-3xl font-bold mt-2 flex items-center justify-center gap-2">
          <span className="text-forest-300">▲</span> DTrek
        </p>
        <p className="text-sm text-white/70 mt-3 max-w-sm mx-auto leading-relaxed">
          Carica la traccia di un&apos;escursione e ne ricavi mappe, profilo altimetrico, punteggi
          del percorso e un racconto da conservare. Il diario si costruisce da sé, uscita dopo
          uscita.
        </p>
        <a href={DTREK_URL} target="_blank" rel="noopener noreferrer"
          className="inline-block mt-5 bg-white text-forest-800 font-display font-bold text-sm rounded-full px-7 py-3 hover:bg-stone-100 transition">
          Comincia il tuo diario
        </a>
      </div>
    </section>
  )
}

export function SiteFooter() {
  return (
    <footer className="mt-2 pb-8 text-center space-y-1.5">
      <p className="text-[11px] text-stone-400">
        Pubblicato con{' '}
        <a href={DTREK_URL} target="_blank" rel="noopener noreferrer"
          className="font-semibold text-forest-700 hover:text-forest-600 transition">
          DTrek
        </a>
      </p>
      <p className="text-[10px] text-stone-300">Mappe © OpenStreetMap contributors · © CARTO</p>
    </footer>
  )
}
