// Copertina "in miniatura" — usata ovunque un Diario compare in un elenco. Due modalità:
//
// 1. Con `title` passato (drawer, cima del Sommario): riproduzione in piccolo dell'EFFETTIVA
//    copertina — la stessa <DiarioCover> di /pubblica e /diari/[id]/copertina, semplicemente
//    scalata (richiesta esplicita dell'utente: "è la riproduzione in piccolo dell'effettiva
//    copertina", non un placeholder a sé con solo lo sfondo). Richiede `width` in px: <DiarioCover>
//    ha dimensioni fisse (PDF_PAGE_W×PDF_PAGE_H), qui va quindi ridimensionata via transform,
//    stesso trucco già usato in /diari/[id]/copertina/page.tsx (ora riusato da lì invece di
//    duplicato).
// 2. Senza `title` (scaffale, DiarioCoverCard): solo lo sfondo (foto o il gradiente verde +
//    profilo di montagne del default reale) — quella card ha già il proprio riquadro di testo
//    (titolo/sottotitolo/"Taccuino N°"/statistiche), aggiungere qui il testo della copertina vera
//    lo raddoppierebbe. Riempie il contenitore al 100% (nessun `width` da passare).
import { DiarioCover } from './DiarioCover'
import { PDF_PAGE_W, PDF_PAGE_H } from '@/lib/pdfPageGeometry'

interface Props {
  coverUrl: string | null
  className?: string
  /** Presente → miniatura CON testo (vedi sopra), a questa larghezza in px (l'altezza segue le
   *  proporzioni reali della copertina). Assente → solo sfondo, 100% del contenitore. */
  width?: number
  title?: string
  subtitle?: string
  author?: string
}

export function DiarioCoverThumb({ coverUrl, className, width, title, subtitle, author }: Props) {
  if (title !== undefined && width !== undefined) {
    const scale = width / PDF_PAGE_W
    const height = width * (PDF_PAGE_H / PDF_PAGE_W)
    return (
      <div className={`relative overflow-hidden ${className ?? ''}`} style={{ width, height }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <DiarioCover coverUrl={coverUrl} diaryTitle={title} diarySubtitle={subtitle ?? ''} diaryAuthor={author ?? ''} />
        </div>
      </div>
    )
  }

  if (coverUrl) {
    return <img src={coverUrl} alt="" className={`w-full h-full object-cover ${className ?? ''}`} />
  }
  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className ?? ''}`}
      style={{ background: 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)' }}
    >
      <svg
        className="absolute bottom-0 left-0 w-full"
        style={{ opacity: 0.16 }}
        viewBox="0 0 794 320"
        preserveAspectRatio="none"
      >
        <path d="M0,320 L70,215 L130,255 L225,125 L305,178 L385,58 L450,125 L520,72 L595,128 L660,82 L730,118 L794,88 L794,320 Z" fill="white" />
      </svg>
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: '#e08d3c' }} />
    </div>
  )
}
