'use client'
import { useEffect, useRef, useState, type ImgHTMLAttributes, type ReactNode } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'

type Candidate = string | null | undefined

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError' | 'onLoad'> {
  src: Candidate
  /** Altre immagini da provare, nell'ordine, quando `src` non si carica (link morto, hotlink
   *  protection, 404/5xx transitorio). Es. la miniatura al posto dell'originale, o la foto
   *  successiva del reportage. Duplicati e valori vuoti sono ignorati. */
  fallbackSrcs?: Candidate[]
  /** Mostrato quando NESSUNA immagine (src + fallbackSrcs) si carica. Omesso ⇒ un segnaposto
   *  neutro (gradiente + icona) che occupa la stessa area, così un'immagine rotta non lascia mai
   *  un buco né l'icona "immagine rotta" del browser. */
  fallback?: ReactNode
  /** 'cover' ⇒ l'immagine riempie un genitore `relative` (absolute inset-0): durante il
   *  caricamento compare uno spinner a tutta area. 'thumb' (default) ⇒ immagine dimensionata da
   *  `className`: durante il caricamento l'immagine stessa è uno scheletro pulsante. */
  variant?: 'cover' | 'thumb'
  /** Sfondo dello spinner in variant 'cover' (default: gradiente forest). */
  spinnerBackground?: string
  onLoad?: () => void
  /** Chiamato quando tutte le sorgenti sono fallite. */
  onAllFailed?: () => void
}

const COVER_BG = 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)'

/**
 * <img> con tre garanzie: (1) feedback di caricamento (spinner sulle coperture, scheletro sulle
 * miniature), (2) catena di sorgenti alternative su errore, (3) un ripiego visibile quando non
 * resta più nulla da provare — mai un'area vuota. Per le foto esterne/di Supabase Storage che non
 * passano da next/image (vedi components/ui/FallbackImage.tsx per quelle che ci passano).
 */
export default function SafeImg({
  src, fallbackSrcs, fallback, variant = 'thumb', spinnerBackground, className, style, onLoad, onAllFailed, alt = '', ...rest
}: Props) {
  const candidates: string[] = []
  for (const c of [src, ...(fallbackSrcs ?? [])]) if (c && !candidates.includes(c)) candidates.push(c)
  const key = candidates.join('|')

  const [idx, setIdx] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const ref = useRef<HTMLImageElement>(null)

  // Nuove sorgenti (es. copertina cambiata) ⇒ si riparte dalla prima.
  useEffect(() => { setIdx(0); setLoaded(false) }, [key])

  // Immagine già in cache del browser: onLoad può scattare prima dell'idratazione, lo si recupera qui.
  useEffect(() => {
    const el = ref.current
    if (!el || !el.complete) return
    // Già finita prima dell'idratazione: onLoad/onError sono andati persi, si legge l'esito qui.
    if (el.naturalWidth > 0) setLoaded(true)
    else setIdx(i => i + 1)
  }, [idx, key])

  const exhausted = candidates.length === 0 || idx >= candidates.length
  useEffect(() => { if (exhausted) onAllFailed?.() }, [exhausted]) // eslint-disable-line react-hooks/exhaustive-deps

  if (exhausted) {
    if (fallback !== undefined) return <>{fallback}</>
    return variant === 'cover'
      ? (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: spinnerBackground ?? COVER_BG }} role="img" aria-label={alt || 'Immagine non disponibile'}>
          <ImageOff className="w-8 h-8 text-white/30" />
        </div>
      )
      : (
        <div className={`${className ?? ''} bg-stone-100 flex items-center justify-center overflow-hidden`} style={style} role="img" aria-label={alt || 'Immagine non disponibile'}>
          <ImageOff className="w-5 h-5 text-stone-300" />
        </div>
      )
  }

  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- foto esterne/Supabase Storage, non ottimizzabili da next/image senza loader dedicato
    <img
      ref={ref}
      key={candidates[idx]}
      src={candidates[idx]}
      alt={alt}
      {...rest}
      style={style}
      className={variant === 'cover'
        ? [className, 'transition-opacity duration-500', loaded ? 'opacity-100' : 'opacity-0'].filter(Boolean).join(' ')
        : [className, loaded ? '' : 'animate-pulse bg-stone-200'].filter(Boolean).join(' ')}
      onLoad={() => { setLoaded(true); onLoad?.() }}
      onError={() => { setLoaded(false); setIdx(i => i + 1) }}
    />
  )

  if (variant !== 'cover') return img
  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 z-[1] flex items-center justify-center" style={{ background: spinnerBackground ?? COVER_BG }}>
          <Loader2 className="w-8 h-8 text-white/70 animate-spin" strokeWidth={2} />
        </div>
      )}
      {img}
    </>
  )
}
