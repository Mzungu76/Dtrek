'use client'
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import Image from 'next/image'
import { ImageOff, Loader2 } from 'lucide-react'

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

  // Stato di caricamento. `loadedSrc` registra SEMPRE quale src è già stato caricato dal browser,
  // anche quando `loadingIndicator` non è ancora presente: un chiamante può passarlo in modo
  // condizionale (RouteHub.tsx: `inWindow ? <CoverLoadingSpinner/> : undefined`) e una slide fuori
  // finestra carica la foto in lazy PRIMA che lo spinner esista — se onLoad venisse ignorato in
  // quel momento, quando la slide entra nella finestra (swipe) lo spinner resterebbe per sempre
  // perché l'evento di caricamento non scatta una seconda volta (verifica utente: miniatura ok,
  // copertina sullo spinner all'infinito). Dipende da `src` e dalla sola PRESENZA del booleano,
  // mai dall'identità dell'elemento JSX (nuova ad ogni render del chiamante).
  const [loadedSrc, setLoadedSrc] = useState<typeof src | null>(null)
  const [minDelayDone, setMinDelayDone] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)
  const hasLoadingIndicator = !!loadingIndicator
  useEffect(() => {
    if (!hasLoadingIndicator) return
    setMinDelayDone(false)
    const t = setTimeout(() => setMinDelayDone(true), minLoadingMs)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, hasLoadingIndicator])
  // Foto già completa prima dell'idratazione o prima che lo spinner comparisse: onLoad è andato perso.
  useEffect(() => {
    const el = imgRef.current
    if (el && el.complete && el.naturalWidth > 0) setLoadedSrc(src)
  }, [src, hasLoadingIndicator])

  if (failed) return <>{fallback}</>

  const imageReady = loadedSrc === src
  const isLoading = !!loadingIndicator && !(imageReady && minDelayDone)

  return (
    <>
      {isLoading && loadingIndicator}
      <Image
        ref={imgRef}
        src={src}
        onError={() => setFailed(true)}
        onLoad={e => { setLoadedSrc(src); onLoad?.(e) }}
        className={loadingIndicator
          ? [className, 'transition-opacity duration-500', isLoading ? 'opacity-0' : 'opacity-100'].filter(Boolean).join(' ')
          : className}
        {...imgProps}
      />
      {children}
    </>
  )
}

/** Spinner a tutta area (genitore `relative`) da passare come `loadingIndicator` quando la foto
 *  riempie il proprio contenitore (`fill`) — stesso stile neutro dei ripieghi delle copertine. */
export function ImageSpinner() {
  return (
    <div className="absolute inset-0 z-[1] flex items-center justify-center bg-stone-200/80">
      <Loader2 className="w-6 h-6 text-stone-500/70 animate-spin" strokeWidth={2} />
    </div>
  )
}

/** Segnaposto a tutta area (genitore `relative`) da passare come `fallback` quando la foto non si
 *  carica: mai un buco né l'icona "immagine rotta" del browser. */
export function ImagePlaceholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-stone-100">
      <ImageOff className="w-6 h-6 text-stone-300" />
    </div>
  )
}

/** True per un URL su un host Wikimedia (Commons/upload/Wikipedia) — sorgenti che servono già
 *  miniature ridimensionate dal proprio CDN, quindi inutile (e lento) ripassarle dall'ottimizzatore
 *  di immagini di Next per le foto grandi a tutta larghezza. */
export function isWikimediaUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const h = new URL(url).hostname
    return h.endsWith('.wikimedia.org') || h.endsWith('.wikipedia.org')
  } catch { return false }
}
