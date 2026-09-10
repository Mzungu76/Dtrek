// Copertina "in miniatura" — usata ovunque un Diario compare in un elenco. Due modalità:
//
// 1. Con `title` passato (drawer, cima del Sommario): riproduzione in piccolo dell'EFFETTIVA
//    copertina — la stessa <DiarioCover> di /pubblica e /diari/[id]/copertina, semplicemente
//    scalata (richiesta esplicita dell'utente: "è la riproduzione in piccolo dell'effettiva
//    copertina", non un placeholder a sé con solo lo sfondo). Richiede `width` in px: <DiarioCover>
//    ha dimensioni fisse (PDF_PAGE_W×PDF_PAGE_H), qui va quindi ridimensionata via transform,
//    stesso trucco già usato in /diari/[id]/copertina/page.tsx (ora riusato da lì invece di
//    duplicato).
// 2. Senza `title`: solo lo sfondo (foto o il gradiente verde + profilo di montagne del default
//    reale), per un chiamante che disegna il proprio riquadro di testo intorno — aggiungere qui il
//    testo della copertina vera lo raddoppierebbe. Riempie il contenitore al 100% (nessun `width`
//    da passare). Non più usata dalla griglia di /diari (sostituita dal registro a righe della
//    versione A, docs/diari-restyling-piano.md), ma resta la modalità corretta per un eventuale
//    futuro chiamante che voglia solo lo sfondo.
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
        {/* <DiarioCover> ha un margin: '24px auto' proprio (pensato per la sua vetrina a schermo
            intero su /pubblica e /diari/[id]/copertina, dove c'è spazio intorno) — qui, ritagliata
            in una miniatura, quel margine spingeva la copertina verso il basso lasciando un vuoto
            in cima e tagliando il fondo (segnalato dall'utente, ancora presente dopo un primo
            tentativo con la sola `translateY(-24px)`: quel margine, senza nulla che lo contenga,
            COLLASSA fuori da questo `<div>` durante il layout — diventa spazio reale PRIMA che il
            `<div>` inizi, non più al suo interno — e una trasformazione applicata AL `<div>` non
            può annullare uno spazio che è già "scappato" fuori dal suo perimetro prima ancora del
            calcolo del transform). `overflow: hidden` blocca il collasso — il margine resta
            contenuto dentro questo `<div>`, dove `translateY(-24px)` (nelle stesse unità "vere" del
            contenuto non ancora scalato, applicata PRIMA di `scale` nell'ordine di lettura) può
            davvero annullarlo. Serve anche `width: PDF_PAGE_W` esplicita: senza, la larghezza
            "auto" di questo `<div>` è quella del SUO genitore (già scalata a `width` px, molto più
            stretta di `PDF_PAGE_W`) — con `overflow: hidden` quello avrebbe ritagliato `DiarioCover`
            a una fetta verticale invece di lasciarla semplicemente sporgere (comportamento di
            `overflow: visible`, invisibile finché non si aggiunge `hidden` per il motivo sopra). */}
        <div className="overflow-hidden" style={{ width: PDF_PAGE_W, transform: `scale(${scale}) translateY(-24px)`, transformOrigin: 'top left' }}>
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
