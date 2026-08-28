'use client'
// Dtrek Page Turning Engine — il lembo che si piega sotto il dito durante un trascinamento
// (geometria in lib/pageTurn/pageTurnMath.ts, `computeCurlGeometry`; istantanea in
// lib/pageTurn/pageSnapshot.ts). Montato SOLO mentre un trascinamento è confermato — mai durante
// un click/tastiera, che restano sul rotateY a pagina intera esistente in DtrekPageTurn.tsx.
//
// `position: fixed`, ancorato al rettangolo (viewport) della porzione di pagina visibile al
// momento in cui il trascinamento è partito — non all'intera altezza del contenuto (che può
// scorrere per schermate intere): concettualmente si piega "il foglio che si ha sotto gli occhi
// ora", non l'intero rotolo, e non c'è bisogno di seguire lo scroll durante un gesto che è
// comunque orizzontale (Sezione 15, usePageDrag.ts già impedisce che diventi anche uno scroll).
//
// `setProgress` è imperativo (via ref), scritto ad ogni `pointermove`/frame di tween da
// DtrekPageTurn.tsx — mai React state per frame (Sezione 14): un solo custom property CSS
// (`--curl-progress`) letto da questo stesso componente per calcolare la geometria e scriverla
// come `style` diretto sui tre elementi (lembo, regione già girata, ombra), non su ulteriori
// custom property lette da app/globals.css — qui la geometria cambia forma (posizione E
// larghezza, non solo un angolo), più semplice calcolarla in un posto che scriverla in CSS puro.
import { forwardRef, useImperativeHandle, useRef, type CSSProperties } from 'react'
import { computeCurlGeometry, type HingeSide } from '@/lib/pageTurn/pageTurnMath'
import type { PageSnapshot } from '@/lib/pageTurn/pageSnapshot'

export interface PageCurlOverlayHandle {
  setProgress: (progress: number) => void
}

export interface OverlayRect {
  top: number
  left: number
  width: number
  height: number
}

interface PageCurlOverlayProps {
  rect: OverlayRect
  snapshot: PageSnapshot
  paperBg: string
  /** Fisso per tutta la vita di questo overlay — un trascinamento non cambia cardine a metà
   *  gesto, viene deciso una sola volta alla conferma dell'intento orizzontale (usePageDrag.ts). */
  hinge: HingeSide
}

const PageCurlOverlay = forwardRef<PageCurlOverlayHandle, PageCurlOverlayProps>(function PageCurlOverlay(
  { rect, snapshot, paperBg, hinge }, ref,
) {
  const turnedRef = useRef<HTMLDivElement>(null)
  const flapRef = useRef<HTMLDivElement>(null)
  const flapFrontRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    setProgress(progress) {
      const geo = computeCurlGeometry(progress, hinge, rect.width)
      const turned = turnedRef.current
      const flap = flapRef.current
      const front = flapFrontRef.current
      if (turned) {
        turned.style.left = `${geo.turnedLeftPx}px`
        turned.style.width = `${geo.turnedWidthPx}px`
      }
      if (flap) {
        flap.style.left = `${geo.flapLeftPx}px`
        flap.style.width = `${geo.flapWidthPx}px`
        flap.style.transform = `rotateY(${geo.flapRotateDeg}deg)`
        flap.style.setProperty('--curl-shadow-o', `${geo.shadowOpacity}`)
      }
      if (front) {
        front.style.backgroundPositionX = `${geo.snapshotCropX}px`
      }
    },
  }), [rect.width, hinge])

  // Geometria a riposo (progress=0) usata come stile INIZIALE — `setProgress` la sovrascrive
  // imperativamente da subito, ma senza questo il lembo nascerebbe senza `left`/`width` (un
  // `<div>` assoluto vuoto collassa a dimensione 0) per il singolo frame prima che il primo
  // `pointermove` confermato arrivi a scriverla.
  const initial = computeCurlGeometry(0, hinge, rect.width)

  return (
    <div
      className="dtp-curl-overlay"
      aria-hidden="true"
      data-hinge={hinge}
      style={{
        position: 'fixed', top: rect.top, left: rect.left, width: rect.width, height: rect.height,
        '--dtp-paper-bg': paperBg,
      } as CSSProperties}
    >
      <div
        ref={turnedRef}
        className="dtp-curl-turned dtp-paper-back-tint"
        style={{ left: initial.turnedLeftPx, width: initial.turnedWidthPx }}
      />
      <div
        ref={flapRef}
        className="dtp-curl-flap"
        style={{ left: initial.flapLeftPx, width: initial.flapWidthPx, transform: `rotateY(${initial.flapRotateDeg}deg)`, '--curl-shadow-o': initial.shadowOpacity } as CSSProperties}
      >
        <div
          ref={flapFrontRef}
          className="dtp-curl-flap-front"
          style={{
            backgroundImage: `url(${snapshot.dataUrl})`,
            backgroundSize: `${snapshot.width}px ${snapshot.height}px`,
            backgroundPositionX: initial.snapshotCropX,
          }}
        />
        <div className="dtp-curl-flap-back dtp-paper-back-tint" />
      </div>
    </div>
  )
})

export default PageCurlOverlay
