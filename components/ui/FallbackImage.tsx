'use client'
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'
import Image from 'next/image'

interface Props extends Omit<ComponentProps<typeof Image>, 'onError'> {
  /** Mostrato al posto dell'immagine quando il caricamento fallisce — link morto, dominio con
   *  hotlink protection, 404/5xx transitorio della fonte esterna (Wikidata/Wikipedia/Commons, mai
   *  self-hosted). Verificato dal vivo: la copertina di Viterbo aveva un `photoUrl` valorizzato ma
   *  l'immagine non si caricava comunque — ogni punto che mostra una foto esterna ha già un ripiego
   *  pensato per quando la foto MANCA (gradiente+icona, mappa del percorso...), ma nessuno si
   *  attivava quando la foto c'è ma il caricamento fallisce per davvero: restava un'area vuota o
   *  un'icona di immagine rotta. Passa lo stesso ripiego già usato per "nessuna foto", mai uno nuovo
   *  — un URL rotto e l'assenza di URL sono lo stesso caso agli occhi di chi guarda. */
  fallback: ReactNode
  /** Opzionale: mostrato SOLO mentre l'immagine sta ancora caricando (mai su un errore — lì vince
   *  `fallback` — mai a caricamento riuscito), con l'immagine stessa che vi si dissolve sopra
   *  invece di comparire di scatto. Omesso ⇒ comportamento invariato, nessun overlay né transizione
   *  (l'immagine appare così com'è, non appena il browser la dipinge) — usato dalla maggior parte
   *  dei chiamanti che non hanno mai avuto bisogno di altro. Verifica utente: un lampo "schermo
   *  nero" sulle copertine Borgo/Sito, sia nell'hero della Guida aperta sia nelle miniature delle
   *  Guide chiuse (galleria/carosello) — stesso problema, stesso ripiego, un solo posto da
   *  mantenerlo invece di ripeterlo in ogni chiamante. */
  loadingIndicator?: ReactNode
  /** Tempo minimo (ms) per cui `loadingIndicator` resta a schermo anche se l'immagine carica prima
   *  — senza, un'immagine già in cache del browser (Guida/miniatura già vista) carica più in fretta
   *  di quanto un frame impieghi a disegnarsi, rendendo l'indicatore de facto invisibile (verifica
   *  utente). Non aggiunge mai un ritardo quando il caricamento reale è più lento di questo valore.
   *  Ignorato quando `loadingIndicator` è assente. */
  minLoadingMs?: number
}

const DEFAULT_MIN_LOADING_MS = 300

/**
 * Wrapper attorno a next/image che ricade su `fallback` quando il caricamento fallisce davvero
 * (onError), non solo quando `src` è assente — quella scelta resta al chiamante (mostra `fallback`
 * direttamente, mai questo componente, se non c'è alcun URL da tentare). `children` sono renderizzati
 * SOLO sopra l'immagine quando si carica con successo (es. un overlay di contrasto o un'attribuzione
 * di licenza che non avrebbe senso mostrare sopra il ripiego).
 */
export default function FallbackImage({
  fallback, loadingIndicator, minLoadingMs = DEFAULT_MIN_LOADING_MS, children, src, className, onLoad, ...imgProps
}: Props) {
  const [failed, setFailed] = useState(false)
  // Un nuovo src (nuova Meta scorsa in un carosello, copertina rigenerata) deve poter ritentare da
  // zero — mai restare bloccato sul fallback di un URL precedente ormai sostituito.
  useEffect(() => { setFailed(false) }, [src])

  // Stato di caricamento gestito solo quando serve (loadingIndicator fornito) — altrove niente
  // stato/effect in più, comportamento esattamente quello di sempre. Dipende da `src` e dalla sola
  // PRESENZA di loadingIndicator (booleano), mai dalla sua identità: è quasi sempre un elemento JSX
  // creato inline dal chiamante (nuova identità ad ogni render del genitore), quindi includere
  // l'elemento stesso qui avrebbe fatto ripartire il timer — e tornare "in caricamento" anche a
  // foto già pronta — ad ogni singolo re-render del chiamante, non solo al cambio reale della foto.
  // Il booleano invece resta stabile fra un render e l'altro tranne quando il chiamante lo passa in
  // modo condizionale (es. RouteHub.tsx's `inWindow ? <CoverLoadingSpinner/> : undefined` sulla
  // stessa src) — lì serve comunque reagire, o isLoading resterebbe vero per sempre da quel punto
  // in poi (minDelayDone mai avviato finché loadingIndicator era assente).
  const [imageReady, setImageReady] = useState(false)
  const [minDelayDone, setMinDelayDone] = useState(false)
  const hasLoadingIndicator = !!loadingIndicator
  useEffect(() => {
    if (!hasLoadingIndicator) return
    setImageReady(false)
    setMinDelayDone(false)
    const t = setTimeout(() => setMinDelayDone(true), minLoadingMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, hasLoadingIndicator])

  if (failed) return <>{fallback}</>

  const isLoading = !!loadingIndicator && !(imageReady && minDelayDone)

  return (
    <>
      {isLoading && loadingIndicator}
      <Image
        src={src}
        onError={() => setFailed(true)}
        onLoad={e => { if (loadingIndicator) setImageReady(true); onLoad?.(e) }}
        className={loadingIndicator
          ? [className, 'transition-opacity duration-500', isLoading ? 'opacity-0' : 'opacity-100'].filter(Boolean).join(' ')
          : className}
        {...imgProps}
      />
      {children}
    </>
  )
}
