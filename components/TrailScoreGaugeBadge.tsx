'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { tsColor, useCountUp } from '@/components/ScoreRing'
import { ctsLabel } from '@/lib/trailScore'
import { objectiveSafetyLabel } from '@/lib/safetyScore'
import { verdictPhrase, type PersonalSafety } from '@/lib/personalSafetyFit'
import SafetyDisclaimer from '@/components/SafetyDisclaimer'
import InfoButton from '@/components/stats/InfoButton'
import type { SafetyScore } from '@/lib/safetyScore'

export type SafetyPreview = Pick<SafetyScore, 'overall' | 'color' | 'label'>

export interface TrailScoreGaugeBadgeProps {
  /** Trail Score v2 aggregato, 0-100 — anello interno, spesso, e numero al centro. */
  total: number | null
  /** Comfort TrailScore grezzo, pre-cancello (prima del taglio di Sicurezza), 0-100 — non più usato
   *  dalla didascalia (vedi sotto), mantenuto per compatibilità dei chiamanti esistenti. */
  value?: number | null
  /** Sicurezza Oggettiva, 0-100 — anello esterno, sottile, sulla propria scala di colore (non su
   *  quella del TS). Ignorato quando `personalSafety` è presente (che porta la stessa Sicurezza
   *  Oggettiva già dentro `.objective`, più il correttivo personale). */
  safety: SafetyPreview | null
  /** Sicurezza scomposta in Oggettiva + Idoneità per Te (lib/personalSafetyFit.ts) — quando
   *  presente, l'anello Sicurezza si disegna come due archi consecutivi (oggettivo pieno, poi il
   *  correttivo personale appeso subito dopo se positivo, o intagliato in coda se negativo) invece
   *  di un arco unico: la lunghezza totale è la somma dei due, ma resta sempre leggibile quanto
   *  viene dal percorso in sé e quanto dal profilo di chi lo guarda. */
  personalSafety?: PersonalSafety | null
  loading?: boolean
  vetoed?: boolean
  size?: number
  /** Didascalia a fianco del badge — il numero di righe e cosa mostrano dipende da
   *  `captionLayout` (vedi sotto). Disattivata negli usi molto compatti (miniatura di galleria). */
  showLabel?: boolean
  /** "popup": asterisco cliccabile che apre il disclaimer in una nuvoletta (copertine di galleria,
   *  poco spazio). "inline": testo del disclaimer sempre visibile (scheda aperta, spazio libero).
   *  "none" (default): nessun disclaimer — badge usato senza personalSafety, o già coperto da un
   *  disclaimer esterno al componente. */
  disclaimer?: 'popup' | 'inline' | 'none'
  /** "curved" (default): copertine dei percorsi (schede chiuse in Guida) — due righe sole, "Trail
   *  Score" (ti può piacere?) e "Sicurezza" (è sicuro per te?, frase unica che combina Oggettiva +
   *  Idoneità, lib/personalSafetyFit.ts's combinedSafetyPhrase), col margine che segue la curva
   *  dell'anello. "stacked": il pannello "Punteggio complessivo" della scheda aperta — dettaglio
   *  granulare su 4 righe (Trail Score, Sicurezza Oggettiva, Idoneità per te, Consiglio — quest'ultimo
   *  la sintesi di Trail Score + Sicurezza, verdictPhrase), ciascuna con il proprio bottone "i". */
  captionLayout?: 'curved' | 'stacked'
  /** Avvisi trovati dalla ricerca web di Giulia (vedi lib/guideNotices.ts) — disegnati come
   *  puntini colorati sull'anello Sicurezza, uno per avviso. Puramente informativo: non cambia il
   *  numero della Sicurezza né del TS, un percorso con un avviso "warning" e Sicurezza 90 mostra
   *  comunque 90 — l'avviso segnala solo "verifica prima di partire", non ricalcola il rischio.
   *  Assente/vuoto ⇒ nessun puntino. */
  notices?: { severity: NoticeDotSeverity }[]
  /** true (default) sulle copertine/miniature scure (foto o mappa) — testo bianco con ombra.
   *  false nelle card chiare proprie (Guida "Dati e sicurezza", Resoconto "Dati e punteggi"). */
  dark?: boolean
  /** "stacked" con un Consiglio (percorso + personalSafety): quel Consiglio da solo resta sempre
   *  visibile come verdetto, le altre righe (Sicurezza oggettiva/Idoneità) vanno dietro "Vedi il
   *  dettaglio" — un solo elemento a vista invece di quattro righe sempre impilate (piano
   *  semplificazione visiva). `detailExtra` è contenuto aggiuntivo mostrato nello stesso pannello
   *  a comparsa (ScoresWidget ci passa ScoreRing invece di tenerlo come card separata sotto).
   *  Ignorato per captionLayout="curved" o quando non c'è un Consiglio da riassumere. */
  detailExtra?: ReactNode
}

export type NoticeDotSeverity = 'danger' | 'warning' | 'info'

const NOTICE_DOT_COLOR: Record<NoticeDotSeverity, string> = {
  danger: '#dc2626',
  warning: '#f59e0b',
  info: '#0ea5e9',
}
// Oltre questo numero i puntini si affollerebbero sull'anello senza restare leggibili — Giulia
// comunque crea avvisi solo per problemi concreti e specifici, non ci si aspetta di arrivarci.
const MAX_NOTICE_DOTS = 5

const NEUTRAL_TRACK_DARK = 'rgba(255,255,255,0.18)'
const NEUTRAL_TRACK_LIGHT = '#efe9df'

/**
 * Badge compatto del Trail Score: due anelli concentrici — l'anello esterno sottile è la
 * Sicurezza (il cancello che può azzerare tutto), l'anello interno spesso è il TS finale
 * (Comfort TrailScore già passato dal cancello). Due indicatori separati, ciascuno sulla propria
 * scala di colore, invece di una geometria che finge una parità che nella formula non esiste.
 * Usato nella copertina del percorso aperto (app/guida/GuidaHub.tsx), in versione compatta nella
 * miniatura di galleria filtrata per TS (components/routehub/BottomGallery.tsx), e in "Dati e
 * sicurezza" (components/guida/widgets/ScoresWidget.tsx).
 *
 * Si anima al mount (anelli che si riempiono, numero che conta) invece di comparire già pieno —
 * ogni chiamante che lo smonta/rimonta (es. un cambio di tab) fa ripartire l'animazione da zero.
 *
 * Puramente presentazionale (nessun proprio `<button>`): i chiamanti lo mettono già dentro un
 * elemento cliccabile proprio (un `<button>` dedicato, o l'intera tile di galleria) — un secondo
 * `<button>` qui dentro anniderebbe due elementi interattivi, HTML non valido oltre che
 * problematico per il click della tile in galleria.
 */
export function TrailScoreGaugeBadge({
  total, safety, personalSafety, loading, vetoed, size = 80, showLabel = true, disclaimer = 'none',
  captionLayout = 'curved', notices, detailExtra, dark = true,
}: TrailScoreGaugeBadgeProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  const [detailOpen, setDetailOpen] = useState(false)
  const neutralTrack = dark ? NEUTRAL_TRACK_DARK : NEUTRAL_TRACK_LIGHT

  const cx = size / 2
  const cy = size / 2
  const rOuter = size * 0.44
  const swOuter = size * 0.064
  const rInner = size * 0.315
  const swInner = size * 0.14

  const animatedTotal = useCountUp(mounted && total != null ? total : 0)

  if (loading) {
    return (
      <div className="flex items-center gap-3 animate-pulse">
        <div className="rounded-full bg-white/20" style={{ width: size, height: size }} />
      </div>
    )
  }

  const totalColor = total != null ? tsColor(total) : '#a8a29e'
  const totalPct = total != null ? Math.max(0, Math.min(100, total)) / 100 : 0
  const cOuter = 2 * Math.PI * rOuter
  const cInner = 2 * Math.PI * rInner
  const innerLen = mounted ? cInner * totalPct : 0

  // Sicurezza semplice (un solo arco) — usata quando non c'è personalSafety, es. la miniatura di
  // galleria che mostra solo la Sicurezza Oggettiva cachata.
  const safetyPct = safety != null ? Math.max(0, Math.min(100, safety.overall)) / 100 : 0
  const outerLen = mounted ? cOuter * safetyPct : 0

  // Sicurezza scomposta — arco oggettivo pieno, poi il correttivo personale appeso in coda
  // (bonus, se il profilo alza il finale) o intagliato nella coda dell'oggettivo (se lo abbassa).
  const objectivePct = personalSafety ? Math.max(0, Math.min(100, personalSafety.objective.overall)) / 100 : 0
  const finalPct = personalSafety ? Math.max(0, Math.min(100, personalSafety.finalScore)) / 100 : 0
  const bonusPct = personalSafety ? Math.max(0, finalPct - objectivePct) : 0
  const penaltyPct = personalSafety ? Math.max(0, objectivePct - finalPct) : 0
  const objectiveArcLen = mounted ? cOuter * objectivePct : 0
  const bonusArcLen = mounted ? cOuter * bonusPct : 0
  const penaltyArcLen = mounted ? cOuter * penaltyPct : 0

  const tsCaption = total != null ? ctsLabel(total).label : null
  const objectiveCaption = personalSafety ? objectiveSafetyLabel(personalSafety.objective.overall).label : null

  // Distribuiti sull'anello Sicurezza, non ammucchiati in un angolo — a partire da alto-destra
  // (non esattamente in cima, dove parte l'arco stesso) e girando in senso orario.
  const noticeDots = (notices ?? []).slice(0, MAX_NOTICE_DOTS)
  const dotR = Math.max(2.5, size * 0.045)

  // Righe della didascalia (esclude il disclaimer inline, che ha altezza variabile e resta piatto
  // sotto lo stack) — dati grezzi (non JSX già composto): in layout "curved" ciascuna riga
  // ("ETICHETTA valore" su una sola riga) riceve il margine calcolato dalla curva del cerchio; in
  // layout "stacked" etichetta e valore vanno su righe separate senza curva, così il valore va a
  // capo in modo pulito sotto la propria etichetta invece di spezzarsi a metà accanto ad essa.
  interface ScoreLine { key: string; label: string; value: string; color?: string; extra?: ReactNode; infoSection?: string }
  const scoreLines: ScoreLine[] = []

  if (captionLayout === 'curved') {
    // Sulla copertina (scheda chiusa) Sicurezza Oggettiva e Idoneità non si mostrano più separate
    // — sembravano due indici che dicono la stessa cosa, a volte in apparente contraddizione. Qui
    // rispondono a una sola domanda ciascuna: "Ti può piacere?" (Trail Score) e "È sicuro per te?"
    // (Sicurezza, frase unica da combinedSafetyPhrase). Il dettaglio granulare resta in "stacked".
    if (tsCaption) scoreLines.push({ key: 'ts', label: 'Trail Score', value: tsCaption })
    if (personalSafety) {
      scoreLines.push({
        key: 'safety', label: 'Sicurezza', value: personalSafety.combinedSafety.label, color: personalSafety.combinedSafety.color,
        extra: disclaimer === 'popup' ? <span className="ml-1"><SafetyDisclaimer variant="popup" dark /></span> : null,
      })
    } else if (safety) {
      scoreLines.push({ key: 'safety', label: 'Sicurezza', value: safety.label })
    }
  } else {
    if (tsCaption) scoreLines.push({ key: 'ts', label: 'Trail Score', value: tsCaption, infoSection: 'trail-score-overview' })
    if (!personalSafety && safety) scoreLines.push({ key: 'safety', label: 'Sicurezza', value: safety.label })
    if (personalSafety && objectiveCaption) {
      scoreLines.push({ key: 'objective', label: 'Sicurezza oggettiva', value: objectiveCaption, infoSection: 'sicurezza-oggettiva' })
      scoreLines.push({ key: 'fit', label: 'Idoneità per te', value: personalSafety.personalFit.label, infoSection: 'idoneita-per-te' })
      const verdict = verdictPhrase(total, personalSafety)
      scoreLines.push({
        key: 'consiglio', label: 'Consiglio', value: verdict.label, color: verdict.color, infoSection: 'consiglio-percorso',
        extra: disclaimer === 'inline' ? <span className="ml-1 text-stone-400">*</span> : null,
      })
    }
  }

  // Quando c'è un Consiglio, riassume già Sicurezza oggettiva + Idoneità in una frase sola — quelle
  // due righe (più i punteggi grezzi di ScoreRing via `detailExtra`) restano dietro "Vedi il
  // dettaglio" invece di sempre a vista. Senza Consiglio (nessun personalSafety) le righe erano già
  // solo una o due: niente da nascondere, si mostrano tutte come prima.
  const consiglioLine = scoreLines.find(l => l.key === 'consiglio')
  const collapsible = captionLayout === 'stacked' && !!consiglioLine
  const primaryLine = collapsible ? consiglioLine! : null
  const subtitleLine = collapsible ? scoreLines.find(l => l.key === 'ts') ?? null : null
  const secondaryLines = collapsible ? scoreLines.filter(l => l.key === 'objective' || l.key === 'fit') : []

  // Stima di altezza riga/interlinea (font 11-12px, leading-tight) — approssimata perché non c'è
  // una misura reale del DOM disponibile qui, ma l'effetto è comunque impercettibilmente diverso
  // da quello esatto per uno spostamento di pochi pixel come questo.
  const LABEL_LINE_H = 15
  const LABEL_LINE_GAP = 4
  const stackHeight = scoreLines.length > 0
    ? scoreLines.length * LABEL_LINE_H + (scoreLines.length - 1) * LABEL_LINE_GAP
    : 0
  // Raggio vero del bordo esterno dell'anello (compreso lo spessore del tratto), non solo rOuter —
  // è il confine reale che il testo deve costeggiare a distanza costante.
  const curveR = rOuter + swOuter / 2

  return (
    <div style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'scale(1)' : 'scale(0.9)', transition: 'opacity 400ms ease, transform 400ms cubic-bezier(.22,.8,.25,1)' }}>
      <div className={`flex gap-2.5 ${captionLayout === 'stacked' ? 'items-start' : 'items-center'}`}>
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} style={{ overflow: 'visible' }}>
            <circle cx={cx} cy={cy} r={rOuter} fill="none" stroke={neutralTrack} strokeWidth={swOuter} />

            {!personalSafety && safety != null && (
              <circle
                cx={cx} cy={cy} r={rOuter} fill="none" stroke={safety.color} strokeWidth={swOuter} strokeLinecap="round"
                strokeDasharray={cOuter} strokeDashoffset={cOuter - outerLen} transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.22,.8,.25,1)' }}
              />
            )}

            {personalSafety && (
              <>
                <circle
                  cx={cx} cy={cy} r={rOuter} fill="none" stroke={personalSafety.objective.color} strokeWidth={swOuter} strokeLinecap="round"
                  strokeDasharray={`${objectiveArcLen} ${cOuter - objectiveArcLen}`} transform={`rotate(-90 ${cx} ${cy})`}
                  style={{ transition: 'stroke-dasharray 700ms cubic-bezier(.22,.8,.25,1)' }}
                />
                {bonusPct > 0 && (
                  <circle
                    cx={cx} cy={cy} r={rOuter} fill="none" stroke={personalSafety.personalFit.color} strokeWidth={swOuter} strokeLinecap="round"
                    opacity={0.65}
                    strokeDasharray={`${bonusArcLen} ${cOuter - bonusArcLen}`}
                    transform={`rotate(${-90 + objectivePct * 360} ${cx} ${cy})`}
                    style={{ transition: 'stroke-dasharray 700ms cubic-bezier(.22,.8,.25,1) 120ms' }}
                  />
                )}
                {penaltyPct > 0 && (
                  <circle
                    cx={cx} cy={cy} r={rOuter} fill="none" stroke="#000" strokeWidth={swOuter * 1.15} strokeLinecap="round"
                    opacity={0.5}
                    strokeDasharray={`${penaltyArcLen} ${cOuter - penaltyArcLen}`}
                    transform={`rotate(${-90 + finalPct * 360} ${cx} ${cy})`}
                    style={{ transition: 'stroke-dasharray 700ms cubic-bezier(.22,.8,.25,1) 120ms' }}
                  />
                )}
              </>
            )}

            <circle cx={cx} cy={cy} r={rInner} fill="none" stroke={neutralTrack} strokeWidth={swInner} />
            {total != null && (
              <circle
                cx={cx} cy={cy} r={rInner} fill="none" stroke={totalColor} strokeWidth={swInner} strokeLinecap="round"
                strokeDasharray={cInner} strokeDashoffset={cInner - innerLen} transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.22,.8,.25,1) 120ms' }}
              />
            )}
            {noticeDots.map((n, i) => {
              const angle = (-90 + 40 + (360 / Math.max(noticeDots.length, 1)) * i) * (Math.PI / 180)
              const dx = cx + rOuter * Math.cos(angle)
              const dy = cy + rOuter * Math.sin(angle)
              return (
                <circle
                  key={i} cx={dx} cy={dy} r={dotR} fill={NOTICE_DOT_COLOR[n.severity]} stroke="#fff" strokeWidth={1.25}
                  style={{ opacity: mounted ? 1 : 0, transition: `opacity 300ms ease ${260 + i * 80}ms` }}
                />
              )
            })}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span
              className={`font-display font-black leading-none tabular-nums ${dark ? 'text-white' : 'text-stone-800'}`}
              style={{ fontSize: size * 0.32, textShadow: dark ? '0 1px 4px rgba(0,0,0,0.6)' : 'none' }}
            >
              {total != null ? Math.round(animatedTotal) : '—'}
            </span>
          </div>
          {vetoed && (
            <span
              title="Sconsigliato, rischio elevato"
              className="absolute -top-1 -right-1 flex items-center justify-center rounded-full bg-red-600 text-white leading-none"
              style={{ width: size * 0.3, height: size * 0.3, fontSize: size * 0.2 }}
            >
              ⚠
            </span>
          )}
        </div>
        {showLabel && scoreLines.length > 0 && (
          <div className={`flex flex-col flex-1 min-w-0 ${captionLayout === 'stacked' ? 'gap-2.5' : 'gap-1'}`}>
            {captionLayout === 'curved' ? (
              // Una riga per punteggio, col margine che segue la curva del cerchio (equazione
              // della circonferenza) invece di un gap piatto uguale per tutte — pensato per le
              // copertine compatte (schede chiuse). "flex-1 min-w-0" sulla colonna + troncamento
              // con ellissi qui sotto: una frase più lunga del previsto (es. con due fattori
              // citati) si accorcia con "…" invece di uscire dallo schermo, che è quello che
              // succedeva con solo whitespace-nowrap e nessun limite di larghezza.
              scoreLines.map((line, i) => {
                const lineCenter = i * (LABEL_LINE_H + LABEL_LINE_GAP) + LABEL_LINE_H / 2
                const dy = lineCenter - stackHeight / 2
                const curveEdge = Math.sqrt(Math.max(0, curveR * curveR - dy * dy))
                const marginLeft = Math.min(0, curveEdge - curveR)
                return (
                  <div key={line.key} className="min-w-0" style={{ marginLeft }}>
                    <span
                      className="block whitespace-nowrap overflow-hidden text-ellipsis text-white text-[11px] sm:text-xs font-bold leading-tight"
                      style={{ color: line.color, textShadow: '0 1px 5px rgba(0,0,0,0.6)' }}
                    >
                      <span className="text-white/55 font-semibold uppercase tracking-wide mr-1.5">{line.label}</span>
                      {line.value}
                      {line.extra}
                    </span>
                  </div>
                )
              })
            ) : collapsible ? (
              // Solo il verdetto a vista — riassume già Sicurezza oggettiva + Idoneità in una
              // frase sola, col Trail Score come sottotitolo. Il resto sta dietro "Vedi il
              // dettaglio" più sotto, non impilato qui.
              <div className="min-w-0">
                <p className="text-stone-400 text-[10px] font-semibold uppercase tracking-wide leading-tight">
                  {subtitleLine ? `Trail Score · ${subtitleLine.value}` : primaryLine!.label}
                </p>
                <p className="text-[15px] font-bold leading-snug mt-1" style={{ color: primaryLine!.color ?? '#2b2419' }}>
                  {primaryLine!.value}
                  {primaryLine!.extra}
                </p>
              </div>
            ) : (
              // Etichetta e valore su righe separate — in mobile la colonna di testo è troppo
              // stretta perché "ETICHETTA valore" stia su una riga sola: qui il valore va a capo
              // sotto la propria etichetta invece di spezzarsi a metà parola accanto ad essa.
              scoreLines.map(line => (
                <div key={line.key} className="min-w-0">
                  <p className="flex items-center gap-1 text-stone-400 text-[10px] font-semibold uppercase tracking-wide leading-tight">
                    {line.label}
                    {line.infoSection && <InfoButton section={line.infoSection} />}
                  </p>
                  <p className="text-sm font-bold leading-snug mt-0.5" style={{ color: line.color ?? '#2b2419' }}>
                    {line.value}
                    {line.extra}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {showLabel && collapsible && (
        <>
          <button
            type="button"
            onClick={() => setDetailOpen(o => !o)}
            className="mt-3 inline-flex items-center gap-1 text-stone-800 text-[12.5px] font-bold"
          >
            Vedi il dettaglio
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${detailOpen ? 'rotate-180' : ''}`} />
          </button>
          {detailOpen && (
            <div className="mt-3 pt-3 border-t border-dashed border-stone-200 space-y-2.5">
              {secondaryLines.map(line => (
                <div key={line.key} className="min-w-0">
                  <p className="flex items-center gap-1 text-stone-400 text-[10px] font-semibold uppercase tracking-wide leading-tight">
                    {line.label}
                    {line.infoSection && <InfoButton section={line.infoSection} />}
                  </p>
                  <p className="text-sm font-bold leading-snug mt-0.5" style={{ color: line.color ?? '#2b2419' }}>
                    {line.value}
                  </p>
                </div>
              ))}
              {detailExtra}
            </div>
          )}
        </>
      )}
      {/* Senza un Consiglio (nessun personalSafety) le righe erano già solo una o due — niente da
          nascondere dietro un tap, quindi detailExtra (ScoreRing) resta semplicemente a vista. */}
      {showLabel && !collapsible && detailExtra && <div className="mt-3">{detailExtra}</div>}

      {/* Disclaimer a piena larghezza sotto anello+didascalie, non stretto nella colonna di testo
          accanto all'anello — nel pannello "Punteggio complessivo" quella colonna è troppo stretta
          perché ci stia comodamente un intero paragrafo di testo. */}
      {showLabel && disclaimer === 'inline' && (
        <div className="mt-3"><SafetyDisclaimer variant="inline" dark={dark} /></div>
      )}
    </div>
  )
}
