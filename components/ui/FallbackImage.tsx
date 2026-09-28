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
}

/**
 * Wrapper attorno a next/image che ricade su `fallback` quando il caricamento fallisce davvero
 * (onError), non solo quando `src` è assente — quella scelta resta al chiamante (mostra `fallback`
 * direttamente, mai questo componente, se non c'è alcun URL da tentare). `children` sono renderizzati
 * SOLO sopra l'immagine quando si carica con successo (es. un overlay di contrasto o un'attribuzione
 * di licenza che non avrebbe senso mostrare sopra il ripiego).
 */
export default function FallbackImage({ fallback, children, src, ...imgProps }: Props) {
  const [failed, setFailed] = useState(false)
  // Un nuovo src (nuova Meta scorsa in un carosello, copertina rigenerata) deve poter ritentare da
  // zero — mai restare bloccato sul fallback di un URL precedente ormai sostituito.
  useEffect(() => { setFailed(false) }, [src])

  if (failed) return <>{fallback}</>
  return (
    <>
      <Image src={src} onError={() => setFailed(true)} {...imgProps} />
      {children}
    </>
  )
}
