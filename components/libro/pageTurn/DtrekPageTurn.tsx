'use client'
// Dtrek Page Turning Engine — componente centrale. Il gesto è l'interazione primaria (Sezione
// 1/3 della specifica: "non un effetto autonomo su click, ma dinamico e legato al movimento
// dell'utente") — il dito aggancia la pagina dal primo istante e la piega/sposta materialmente
// ovunque la si tocchi (`usePageDrag.ts`); click/tastiera restano come scorciatoia immediata
// (più naturale su desktop, dove trascinare col mouse lo è meno).
//
// Due rese visive diverse, a seconda di CHI avvia lo sfoglio — non due motori scollegati (stesso
// `flipProgress`, stesso runner di tween, stessa soglia/velocità di completamento), solo due modi
// di disegnarlo:
// - click/tastiera/ingresso: `.dtp-leaf` ruota intero in 3D (rotateY + retro pagina), il
//   meccanismo già in uso da prima — resta così perché deve restare immediato, e riusare
//   `{children}` dal vivo senza bisogno di un'istantanea è più semplice per un'animazione che
//   parte e finisce da sola.
// - trascinamento: la carta si piega davvero sotto il dito, in stile "vero flipbook" (riferimento
//   dell'utente: heyzine.com) — un lembo di larghezza fissa (PageCurlOverlay.tsx) scorre dal
//   bordo libero verso il cardine mentre ruota su se stesso, mostrando un'istantanea della
//   porzione di pagina visibile (lib/pageTurn/pageSnapshot.ts, via html2canvas) invece del
//   contenuto vivo — impossibile piegare/mostrare il retro di una mappa interattiva reale senza
//   smontarla. Il resto della pagina, ovunque il lembo non arrivi ancora, resta il DOM reale
//   inalterato: niente clic, mappe o gallerie perdono mai il proprio stato, tornano semplicemente
//   a rispondere al tocco appena lo sfoglio finisce (Sezione 15).
//
// Perché non serve un Context/Provider a livello di root layout: ogni pagina del libro (Guida,
// Reportage) è una route Next.js a sé, quindi cambia sezione = smonta il vecchio `page.tsx` e ne
// monta uno nuovo — questo componente non sopravvive a quel cambio. La continuità visiva tra "la
// pagina che se ne va" e "la pagina che arriva" passa quindi da `lib/pageTurn/pageTurnHandoff.ts`
// (un semplice modulo condiviso, sopravvive perché la navigazione resta lato client, mai un
// reload): chi lascia anima fino a un punto di passaggio e SUBITO DOPO naviga (Sezione 1, "non
// deve rallentare la navigazione"), chi arriva legge quel punto e continua fino a 0 (pagina
// piatta, posata) — sempre col ramo "rotateY intero", anche se l'uscita era stata un
// trascinamento: l'ingresso è breve e per lo più coperto da ciò che resta dell'uscita, non vale
// la complessità di un'altra istantanea per una frazione di secondo.
import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import {
  computePageTurnVisualState, dragCommitDurationMs, easeOutBack, easeOutCubic, easeInCubic,
  PAGE_TURN_TIMING, type HingeSide,
} from '@/lib/pageTurn/pageTurnMath'
import { consumePageTurnHandoff, writePageTurnHandoff } from '@/lib/pageTurn/pageTurnHandoff'
import { captureVisiblePageSnapshot, visiblePageRect, type PageSnapshot } from '@/lib/pageTurn/pageSnapshot'
import { usePageDrag } from './usePageDrag'
import PageCurlOverlay, { type PageCurlOverlayHandle, type OverlayRect } from './PageCurlOverlay'

export interface DtrekPageTurnHandle {
  /** Avvia uno sfoglio programmatico (click o tastiera) verso `href`, intorno al cardine indicato.
   *  Ritorna `false` se il motore non può gestirlo ora (uno sfoglio è già in corso) — il chiamante
   *  lascia allora che la navigazione avvenga normalmente, senza effetto, invece di perderla. */
  flipTo: (href: string, hinge: HingeSide) => boolean
}

interface DtrekPageTurnProps {
  /** Assente ⇒ un trascinamento in quella direzione non porta da nessuna parte e resta senza
   *  effetto (stesso significato dei pulsanti disabilitati già presenti in BookPage.tsx) — non è
   *  più una zona di presa dedicata su un lato: la direzione la decide il verso del trascinamento,
   *  ovunque parta sulla pagina (vedi usePageDrag.ts). */
  prevHref?: string
  nextHref?: string
  /** Colore di sfondo del tema corrente — usato per lo strato di sicurezza sotto il foglio e per
   *  il retro pagina, cosicché il motore resti neutro rispetto a "pergamena" vs "taccuino" (li
   *  conosce solo BookPage.tsx). */
  paperBg: string
  children: ReactNode
  className?: string
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = () => setReduced(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

interface CurlOverlayState {
  rect: OverlayRect
  snapshot: PageSnapshot
  hinge: HingeSide
}

const DtrekPageTurn = forwardRef<DtrekPageTurnHandle, DtrekPageTurnProps>(function DtrekPageTurn(
  { prevHref, nextHref, paperBg, children, className }, ref,
) {
  const router = useRouter()
  const reducedMotion = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const cancelTweenRef = useRef<(() => void) | null>(null)
  const activeRef = useRef(false)
  const snapshotRef = useRef<PageSnapshot | null>(null)
  /** true mentre il trascinamento IN CORSO usa il lembo con istantanea (PageCurlOverlay) invece
   *  del rotateY a pagina intera — deciso una volta sola all'avvio del gesto (serve un flag
   *  letto in modo sincrono da `onDragProgress`, uno stato React arriverebbe un render troppo
   *  tardi per il primissimo evento). */
  const curlModeRef = useRef(false)
  const curlOverlayHandleRef = useRef<PageCurlOverlayHandle>(null)

  const [hinge, setHinge] = useState<HingeSide>('left')
  const [active, setActive] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)
  const [curlOverlay, setCurlOverlay] = useState<CurlOverlayState | null>(null)

  useEffect(() => { activeRef.current = active }, [active])

  /** Rende il ramo "rotateY a pagina intera" (click/tastiera/ingresso) — scrive un solo custom
   *  property CSS per frame (Sezione 14), mai React state. */
  const applyProgress = useCallback((progress: number, h: HingeSide) => {
    const el = rootRef.current
    if (!el) return
    const v = computePageTurnVisualState(progress, h)
    el.style.setProperty('--dtp-rotate', `${v.rotateDeg}deg`)
    el.style.setProperty('--dtp-lift', `${v.liftPx}px`)
    el.style.setProperty('--dtp-shift', `${v.shiftPx}px`)
    el.style.setProperty('--dtp-scale', `${v.scale}`)
    el.style.setProperty('--dtp-contact-shadow-o', `${v.contactShadowOpacity}`)
    el.style.setProperty('--dtp-contact-shadow-spread', `${v.contactShadowSpreadPct}%`)
    el.style.setProperty('--dtp-self-shadow-o', `${v.selfShadowOpacity}`)
    el.style.setProperty('--dtp-highlight-o', `${v.highlightOpacity}`)
    el.style.setProperty('--dtp-highlight-pos', `${v.highlightPositionPct}%`)
    el.style.setProperty('--dtp-spine-o', `${v.spineGlowOpacity}`)
  }, [])

  // Il contenuto reale è coperto (in un modo o nell'altro, a seconda del ramo) per tutta la
  // durata di uno sfoglio attivo — assente per la lettura assistita in quella finestra invece di
  // restare "presente" nell'albero di accessibilità mentre non lo è visivamente (Sezione 16).
  useEffect(() => {
    contentRef.current?.setAttribute('aria-hidden', active ? 'true' : 'false')
  }, [active])

  /** Se il focus è dentro il contenuto reale quando parte uno sfoglio, lo sposta via prima di
   *  marcarlo `aria-hidden` — evitarlo su un antenato dell'elemento attivo è raccomandato
   *  esplicitamente dalle specifiche ARIA. */
  const blurContentFocus = useCallback(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement && contentRef.current?.contains(active)) active.blur()
  }, [])

  /** Runner unico per ogni tween (auto-flip, coasting di un drag committato, ritorno elastico di
   *  un annullamento, ingresso) — Sezione 2: un solo posto che traduce il tempo in `flipProgress`,
   *  mai una seconda animazione indipendente. `onFrame` è già legato al ramo giusto (rotateY o
   *  lembo con istantanea) da chi chiama — il runner stesso non sa quale dei due sia. */
  const runTween = useCallback((
    from: number, to: number, durationMs: number, ease: (t: number) => number,
    onFrame: (progress: number) => void, onDone?: () => void,
  ) => {
    cancelTweenRef.current?.()
    if (durationMs <= 0) {
      onFrame(to)
      onDone?.()
      return
    }
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      onFrame(from + (to - from) * ease(t))
      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        cancelTweenRef.current = null
        onDone?.()
      }
    }
    raf = requestAnimationFrame(tick)
    cancelTweenRef.current = () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => () => cancelTweenRef.current?.(), [])

  /** Chiude uno sfoglio a trascinamento (committato o annullato): sempre gli stessi tre passi,
   *  mai dimenticarne uno dei due rami. */
  const endDragVisual = useCallback(() => {
    setActive(false)
    setCurlOverlay(null)
    curlModeRef.current = false
  }, [])

  // ── Istantanea per il lembo del trascinamento — catturata in anticipo (mai al volo all'avvio
  // del gesto, che introdurrebbe un ritardo prima che il dito veda un effetto — Sezione 14) e
  // riaggiornata quando lo scroll si ferma, così resta ragionevolmente allineata a cosa si vede
  // ora anche se l'utente ha letto/scorso la pagina nel frattempo. Mai mentre uno sfoglio è già
  // attivo (inutile, e il contenuto è comunque coperto). Un lembo senza istantanea pronta ricade
  // semplicemente sul rotateY a pagina intera (vedi onDragStart) — mai un errore, solo un grado
  // di ricchezza in meno per quel singolo gesto.
  useEffect(() => {
    if (reducedMotion) return
    let cancelled = false
    const capture = () => {
      if (cancelled || activeRef.current) return
      const el = contentRef.current
      if (!el) return
      captureVisiblePageSnapshot(el, paperBg).then(snap => {
        if (!cancelled && snap) snapshotRef.current = snap
      })
    }
    const initialTimer = window.setTimeout(capture, 400)
    let scrollTimer = 0
    const onScroll = () => {
      window.clearTimeout(scrollTimer)
      scrollTimer = window.setTimeout(capture, 150)
    }
    // Un ridimensionamento (rotazione dello schermo, tastiera virtuale, finestra desktop
    // ridimensionata) invalida subito l'istantanea in cache — le sue dimensioni non
    // combacerebbero più con la larghezza reale usata da `computeCurlGeometry` al prossimo
    // trascinamento. Meglio ricadere sul rotateY di riserva per un gesto (vedi onDragStart) che
    // mostrare un'immagine stirata/disallineata.
    let resizeTimer = 0
    const onResize = () => {
      snapshotRef.current = null
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(capture, 200)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    return () => {
      cancelled = true
      window.clearTimeout(initialTimer)
      window.clearTimeout(scrollTimer)
      window.clearTimeout(resizeTimer)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [reducedMotion, paperBg])

  // ── Ingresso: continua un eventuale sfoglio lasciato a metà dalla pagina precedente ──────────
  // Sempre sul ramo rotateY (vedi commento in cima al file: l'ingresso resta semplice a
  // prescindere da come si era usciti dalla pagina precedente).
  useEffect(() => {
    if (reducedMotion) return
    const handoff = consumePageTurnHandoff()
    if (!handoff) return
    setHinge(handoff.hinge)
    setActive(true)
    applyProgress(handoff.enterFromProgress, handoff.hinge)
    runTween(
      handoff.enterFromProgress, 0, PAGE_TURN_TIMING.enterMs, easeOutCubic,
      p => applyProgress(p, handoff.hinge),
      () => setActive(false),
    )
    // Una tantum al mount — non deve rieseguire se `reducedMotion` cambia più tardi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Sfoglio programmatico (click/tastiera) — sempre rotateY, mai il lembo con istantanea ─────
  const flipTo = useCallback((href: string, h: HingeSide): boolean => {
    if (active) return false // uno sfoglio è già in corso: lascia fare alla navigazione normale

    if (reducedMotion) {
      // Sezione 16: "riduci l'effetto fisico e utilizza una transizione semplice e veloce" — niente
      // rotazione 3D, solo una dissolvenza breve. Non scrive nessun handoff: la pagina in arrivo,
      // se anch'essa a movimento ridotto, non troverebbe comunque nulla da consumare.
      setActive(true)
      setFadingOut(true)
      window.setTimeout(() => router.push(href), 120)
      return true
    }

    blurContentFocus()
    setHinge(h)
    setActive(true)
    runTween(
      0, PAGE_TURN_TIMING.clickHandoffProgress, PAGE_TURN_TIMING.clickExitMs, easeInCubic,
      p => applyProgress(p, h),
      () => {
        writePageTurnHandoff({ enterFromProgress: PAGE_TURN_TIMING.clickHandoffProgress, hinge: h })
        router.push(href)
      },
    )
    return true
  }, [active, reducedMotion, router, runTween, blurContentFocus, applyProgress])

  useImperativeHandle(ref, () => ({ flipTo }), [flipTo])

  // ── Sfoglio gesture-driven — sceglie il ramo (lembo con istantanea, o rotateY di riserva) ────
  const { dragSurfaceProps } = usePageDrag({
    containerRef: rootRef,
    disabled: active || reducedMotion,
    canGoPrev: !!prevHref,
    canGoNext: !!nextHref,
    onDragStart: (_direction, h) => {
      blurContentFocus()
      setHinge(h)
      setActive(true)

      const el = contentRef.current
      const snap = snapshotRef.current
      const rect = el ? visiblePageRect(el) : null
      if (snap && rect) {
        curlModeRef.current = true
        setCurlOverlay({ rect, snapshot: snap, hinge: h })
      } else {
        curlModeRef.current = false
        setCurlOverlay(null)
        applyProgress(0, h)
      }
    },
    onDragProgress: (progress, h) => {
      if (curlModeRef.current) curlOverlayHandleRef.current?.setProgress(progress)
      else applyProgress(progress, h)
    },
    onDragCommit: (direction, h, fromProgress) => {
      const href = direction === 'next' ? nextHref : prevHref
      const onFrame = curlModeRef.current
        ? (p: number) => curlOverlayHandleRef.current?.setProgress(p)
        : (p: number) => applyProgress(p, h)
      if (!href) {
        runTween(fromProgress, 0, PAGE_TURN_TIMING.cancelReturnMs, easeOutBack, onFrame, endDragVisual)
        return
      }
      runTween(fromProgress, 1, dragCommitDurationMs(fromProgress), easeOutCubic, onFrame, () => {
        writePageTurnHandoff({ enterFromProgress: 1, hinge: h })
        router.push(href)
        // Niente `endDragVisual()` qui: il componente sta per smontarsi con la navigazione, e
        // fino ad allora l'overlay/lembo resta "a pagina girata" (Sezione 10) — esattamente
        // come fa `.dtp-leaf` sul ramo rotateY.
      })
    },
    onDragCancel: (fromProgress, h) => {
      const onFrame = curlModeRef.current
        ? (p: number) => curlOverlayHandleRef.current?.setProgress(p)
        : (p: number) => applyProgress(p, h)
      runTween(fromProgress, 0, PAGE_TURN_TIMING.cancelReturnMs, easeOutBack, onFrame, endDragVisual)
    },
  })

  return (
    <div
      ref={rootRef}
      className={`dtp-root${active ? ' dtp-root--active' : ''}${fadingOut ? ' dtp-root--fading' : ''} ${className ?? ''}`}
      data-hinge={hinge}
      style={{ '--dtp-paper-bg': paperBg } as CSSProperties}
    >
      <div className="dtp-base" aria-hidden="true" />
      <div className="dtp-contact-shadow" aria-hidden="true" />
      <div className="dtp-spine-glow" aria-hidden="true" />
      <div className="dtp-leaf">
        <div className="dtp-face dtp-face--front">
          {/* Il gesto è agganciato qui, sul contenitore del contenuto VERO — non su un div a parte
              sovrapposto — cosicché `e.target` dentro usePageDrag.ts sia sempre l'elemento
              realmente toccato (un link, la mappa, il testo) e possa riconoscere ed escludere i
              pochi widget con un proprio gesto orizzontale prima di catturare qualunque cosa
              (Sezione 15). Ovunque altro sulla pagina, il tocco aggancia lo sfoglio. */}
          <div className="dtp-content" ref={contentRef} {...dragSurfaceProps}>{children}</div>
          <div className="dtp-self-shadow" aria-hidden="true" />
          <div className="dtp-highlight" aria-hidden="true" />
        </div>
        <div className="dtp-face dtp-face--back" aria-hidden="true" />
      </div>
      {/* Portale su `document.body`, non un figlio normale qui: `.dtp-root` ha `perspective` per
          il rotateY di `.dtp-leaf`, e `perspective`/`transform` su un antenato trasformano
          `position: fixed` in qualcosa di relativo a QUELL'antenato invece che al viewport (regola
          CSS, non un bug del browser) — l'overlay finirebbe disegnato nel posto sbagliato.
          `getBoundingClientRect()` in visiblePageRect.ts è già in coordinate di viewport vere,
          quindi deve restarci anche il `position: fixed` che lo usa. */}
      {curlOverlay && typeof document !== 'undefined' && createPortal(
        <PageCurlOverlay
          ref={curlOverlayHandleRef}
          rect={curlOverlay.rect}
          snapshot={curlOverlay.snapshot}
          hinge={curlOverlay.hinge}
          paperBg={paperBg}
        />,
        document.body,
      )}
    </div>
  )
})

export default DtrekPageTurn
