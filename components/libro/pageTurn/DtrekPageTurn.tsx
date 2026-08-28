'use client'
// Dtrek Page Turning Engine — componente centrale. Sostituisce interamente il vecchio sistema
// (View Transitions API + `@keyframes page-turn-in/out` in app/globals.css, rimossi) con un motore
// proprietario. Il gesto è l'interazione primaria (Sezione 1/3 della specifica: "non un effetto
// autonomo su click, ma dinamico e legato al movimento dell'utente") — il dito aggancia la pagina
// dal primo istante e la piega/sposta materialmente ovunque la si tocchi (`usePageDrag.ts`, non
// più ristretto a un bordo stretto e difficile da trovare); click/tastiera restano disponibili
// come scorciatoia immediata (utile su desktop, dove trascinare col mouse è meno naturale) e
// passano dallo STESSO identico codice di rendering/fisica — mai due animazioni scollegate
// (Sezione 2/13 della specifica).
//
// Perché non serve un Context/Provider a livello di root layout: ogni pagina del libro (Guida,
// Reportage) è una route Next.js a sé, quindi cambia sezione = smonta il vecchio `page.tsx` e ne
// monta uno nuovo — questo componente non sopravvive a quel cambio. La continuità visiva tra "la
// pagina che se ne va" e "la pagina che arriva" passa quindi da `lib/pageTurn/pageTurnHandoff.ts`
// (un semplice modulo condiviso, sopravvive perché la navigazione resta lato client, mai un
// reload) invece che da uno stato React condiviso: chi lascia anima da 0 fino a un punto di
// passaggio e SUBITO DOPO naviga (Sezione 1, "non deve rallentare la navigazione" — non si aspetta
// la fine dello sfoglio), chi arriva legge quel punto e continua l'animazione fino a 0 (pagina
// piatta, posata) — le due metà, sommate, si leggono come un solo sfoglio ininterrotto.
//
// Layer del DOM (dal basso in alto): `.dtp-base` (sfondo di sicurezza color pagina — Sezione 10,
// mai un flash bianco), `.dtp-contact-shadow`/`.dtp-spine-glow` (ombre che restano piatte sulla
// "pagina sottostante", non ruotano), `.dtp-leaf` (il foglio vero, ruota in 3D — contiene la
// faccia frontale con il CONTENUTO REALE, mai smontato/clonato durante il gesto, così mappe e stato
// interno restano intatti — e la faccia posteriore, texture di carta, mai un duplicato del
// contenuto). Tutta la matematica (Sezione 2, "tutti gli effetti dipendono da flipProgress") vive
// in `lib/pageTurn/pageTurnMath.ts`; qui si scrive un solo custom property CSS per frame
// (`--dtp-rotate` e affini, mai React state per frame — Sezione 14) e il resto lo fa app/globals.css.
import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  computePageTurnVisualState, dragCommitDurationMs, easeOutBack, easeOutCubic, easeInCubic,
  PAGE_TURN_TIMING, type HingeSide,
} from '@/lib/pageTurn/pageTurnMath'
import { consumePageTurnHandoff, writePageTurnHandoff } from '@/lib/pageTurn/pageTurnHandoff'
import { usePageDrag } from './usePageDrag'

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

const DtrekPageTurn = forwardRef<DtrekPageTurnHandle, DtrekPageTurnProps>(function DtrekPageTurn(
  { prevHref, nextHref, paperBg, children, className }, ref,
) {
  const router = useRouter()
  const reducedMotion = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const cancelTweenRef = useRef<(() => void) | null>(null)
  const showingBackRef = useRef(false)

  const [hinge, setHinge] = useState<HingeSide>('left')
  const [active, setActive] = useState(false)
  const [fadingOut, setFadingOut] = useState(false)

  const applyProgress = useCallback((progress: number, h: HingeSide) => {
    const el = rootRef.current
    if (!el) return
    const v = computePageTurnVisualState(progress, h)
    // Il contenuto reale è girato di schiena rispetto allo schermo oltre la metà rotazione — non
    // solo invisibile (`backface-visibility`, già CSS), anche assente per la lettura assistita
    // finché non torna frontale, invece di restare "presente" nell'albero di accessibilità mentre
    // non lo è visivamente. Scritto solo al cambio di stato, non ad ogni frame.
    if (contentRef.current && v.isShowingBack !== showingBackRef.current) {
      showingBackRef.current = v.isShowingBack
      contentRef.current.setAttribute('aria-hidden', v.isShowingBack ? 'true' : 'false')
    }
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

  /** Se il focus è dentro il contenuto reale quando parte uno sfoglio, lo sposta via prima di
   *  marcarlo `aria-hidden` oltre metà rotazione — evitare `aria-hidden` su un antenato
   *  dell'elemento attivo è raccomandato esplicitamente dalle specifiche ARIA. */
  const blurContentFocus = useCallback(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement && contentRef.current?.contains(active)) active.blur()
  }, [])

  /** Runner unico per ogni tween (auto-flip, coasting di un drag committato, ritorno elastico di
   *  un annullamento, ingresso) — Sezione 2: un solo posto che traduce il tempo in `flipProgress`,
   *  mai una seconda animazione indipendente. */
  const runTween = useCallback((
    from: number, to: number, durationMs: number, ease: (t: number) => number, h: HingeSide, onDone?: () => void,
  ) => {
    cancelTweenRef.current?.()
    if (durationMs <= 0) {
      applyProgress(to, h)
      onDone?.()
      return
    }
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      applyProgress(from + (to - from) * ease(t), h)
      if (t < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        cancelTweenRef.current = null
        onDone?.()
      }
    }
    raf = requestAnimationFrame(tick)
    cancelTweenRef.current = () => cancelAnimationFrame(raf)
  }, [applyProgress])

  useEffect(() => () => cancelTweenRef.current?.(), [])

  // ── Ingresso: continua un eventuale sfoglio lasciato a metà dalla pagina precedente ──────────
  useEffect(() => {
    if (reducedMotion) return
    const handoff = consumePageTurnHandoff()
    if (!handoff) return
    setHinge(handoff.hinge)
    setActive(true)
    applyProgress(handoff.enterFromProgress, handoff.hinge)
    runTween(handoff.enterFromProgress, 0, PAGE_TURN_TIMING.enterMs, easeOutCubic, handoff.hinge, () => setActive(false))
    // Una tantum al mount — non deve rieseguire se `reducedMotion` cambia più tardi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Sfoglio programmatico (click/tastiera) ────────────────────────────────────────────────
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
    runTween(0, PAGE_TURN_TIMING.clickHandoffProgress, PAGE_TURN_TIMING.clickExitMs, easeInCubic, h, () => {
      writePageTurnHandoff({ enterFromProgress: PAGE_TURN_TIMING.clickHandoffProgress, hinge: h })
      router.push(href)
    })
    return true
  }, [active, reducedMotion, router, runTween, blurContentFocus])

  useImperativeHandle(ref, () => ({ flipTo }), [flipTo])

  // ── Sfoglio gesture-driven ─────────────────────────────────────────────────────────────────
  const { dragSurfaceProps } = usePageDrag({
    containerRef: rootRef,
    disabled: active || reducedMotion,
    canGoPrev: !!prevHref,
    canGoNext: !!nextHref,
    onDragStart: (_direction, h) => {
      blurContentFocus()
      setHinge(h)
      setActive(true)
      applyProgress(0, h)
    },
    onDragProgress: (progress, h) => {
      applyProgress(progress, h)
    },
    onDragCommit: (direction, h, fromProgress) => {
      const href = direction === 'next' ? nextHref : prevHref
      if (!href) { runTween(fromProgress, 0, PAGE_TURN_TIMING.cancelReturnMs, easeOutBack, h, () => setActive(false)); return }
      runTween(fromProgress, 1, dragCommitDurationMs(fromProgress), easeOutCubic, h, () => {
        writePageTurnHandoff({ enterFromProgress: 1, hinge: h })
        router.push(href)
      })
    },
    onDragCancel: (fromProgress, h) => {
      runTween(fromProgress, 0, PAGE_TURN_TIMING.cancelReturnMs, easeOutBack, h, () => setActive(false))
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
    </div>
  )
})

export default DtrekPageTurn
