'use client'
import type { CSSProperties, ReactNode } from 'react'
import { TACCUINO_ACCENT, TACCUINO_ACCENT_TINT } from '@/lib/taccuinoTokens'

/**
 * Foto/mappe "ritagliate a mano" con nastro washi — Taccuino Botanico. Calibrata in un mockup
 * dedicato (Artifact, non su file) prima di questo porting: bordo strappato, bordino di carta,
 * ombra "sollevata" e occlusione ambientale (entrambe affievolite verso il nastro, dove la carta
 * è comunque incollata allo sfondo), nastro che prosegue oltre il bordo sulla carta dietro.
 *
 * Le classi CSS (`.torn-*`, app/globals.css) fanno il lavoro pesante — questo componente sceglie
 * solo la variante (strappo + posizione nastro) e assembla i quattro layer nell'ordine giusto.
 * `children` (la foto reale o il widget mappa) vive UNA sola volta, dentro `.torn-cast`: gli
 * altri due layer (`.torn-ao`/`.torn-rim`) servono solo al loro drop-shadow, il loro riempimento
 * è invisibile (sempre coperto dal contenuto reale sopra) — vedi il commento in globals.css.
 */

type TornSize = 'photo' | 'map' | 'hero'

type CSSVarStyle = CSSProperties & Record<`--${string}`, string>

interface TapePreset {
  /** Posizione del nastro dentro `--tape-x`/`--tape-y` (con unità: px o %) — coordinate del
   *  riquadro ORIGINALE (non ingrandito), consumate via calc() da .torn-ao/.torn-cast per
   *  centrare la maschera radiale. Una % (non solo px) permette a un riquadro responsivo (size
   *  "hero", larghezza non nota qui) di restare corretta a qualunque larghezza. */
  tapeX: string
  tapeY: string
  rotate: number
  style: CSSProperties
}

// Il nastro sta SEMPRE sul lato superiore (mai in basso: è così che si nastra davvero una foto a
// un quaderno). Quattro varianti per dimensione, indice allineato al taglio (.torn-cut-1..4) —
// stessi valori calibrati nel mockup approvato, non riscalati automaticamente: le due dimensioni
// (144x112 e 87x87) sono state tarate a mano l'una dall'altra nel mockup, non da un unico fattore
// di scala.
const PHOTO_TAPE: TapePreset[] = [
  { tapeX: '20px', tapeY: '4px', rotate: -9, style: { top: -13, left: -4 } },
  { tapeX: '121px', tapeY: '4px', rotate: 7, style: { top: -14, right: -8 } },
  { tapeX: '46px', tapeY: '4px', rotate: -5, style: { top: -12, left: '32%', marginLeft: -29 } },
  { tapeX: '17px', tapeY: '4px', rotate: 8, style: { top: -13, left: -6 } },
]
const MAP_TAPE: TapePreset[] = [
  { tapeX: '12px', tapeY: '3px', rotate: -9, style: { top: -9, left: -3 } },
  { tapeX: '60px', tapeY: '3px', rotate: 7, style: { top: -9, right: -5 } },
  { tapeX: '28px', tapeY: '3px', rotate: -5, style: { top: -9, left: '24%', marginLeft: -20 } },
  { tapeX: '10px', tapeY: '3px', rotate: 8, style: { top: -8, left: -4 } },
]
// Un solo preset, in alto al centro — riquadro responsivo (larghezza non nota qui): `tapeX`
// resta in % (non px) così la maschera segue il centro a qualunque larghezza. Posizionato fra i
// due cluster di chip della mappa (entrambi in alto, ma ai lati — components/RouteMapSection.tsx)
// invece che sopra uno dei due (test iniziale, non ancora tarato in un mockup dedicato).
const HERO_TAPE: TapePreset[] = [
  { tapeX: '50%', tapeY: '4px', rotate: -4, style: { top: -14, left: '50%', marginLeft: -38 } },
]
const TAPE_PRESETS: Record<TornSize, TapePreset[]> = { photo: PHOTO_TAPE, map: MAP_TAPE, hero: HERO_TAPE }

/**
 * Taglio (1-4) e posizione del nastro (indice 0-3, stesso indice del taglio) derivati dall'id —
 * stesso principio di `cutoutRotation` in app/percorsi/page.tsx: mai `Math.random()`, così la
 * stessa foto/percorso si straccia e si nastra sempre allo stesso modo tra un render e l'altro.
 */
export function tornVariant(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return Math.abs(hash) % 4
}

export function TornFrame({
  size, variant, rotate, badge, className, children,
}: {
  size: TornSize
  /** Da `tornVariant(id)` — 0-3. */
  variant: number
  /** Inclinazione dell'intero riquadro (variante mappa, righe elenco) — indipendente
   *  dall'inclinazione del solo nastro. */
  rotate?: number
  badge?: ReactNode
  className?: string
  children: ReactNode
}) {
  const idx = ((variant % 4) + 4) % 4
  const cut = idx + 1
  const presets = TAPE_PRESETS[size]
  const tape = presets[idx % presets.length]
  const frameStyle: CSSVarStyle = {
    '--tape-x': tape.tapeX,
    '--tape-y': tape.tapeY,
    ...(rotate ? { transform: `rotate(${rotate}deg)` } : {}),
  }
  return (
    <div className={`torn-frame torn-frame-${size} ${className ?? ''}`} style={frameStyle}>
      <div className={`torn-ao torn-ao-${size}`}><div className={`torn-filler torn-cut-${cut}`} /></div>
      <div className={`torn-rim torn-rim-${size}`}><div className={`torn-filler torn-cut-${cut}`} /></div>
      <div className={`torn-cast torn-cast-${size}`}><div className={`torn-filler torn-cut-${cut}`} /></div>
      {/* Sempre in cima, mai mascherato/filtrato — vedi il commento su .torn-content in
          globals.css: se questo layer condividesse la maschera "affievolisci verso il nastro"
          di .torn-cast, vicino al nastro sparirebbe la foto vera insieme all'ombra. */}
      <div className={`torn-content torn-cut-${cut}`}>{children}</div>
      {badge}
      <div
        className={`torn-tape torn-tape-${size}`}
        style={{ ...tape.style, transform: `rotate(${tape.rotate}deg)`, background: TACCUINO_ACCENT_TINT }}
      />
    </div>
  )
}

/** Numero di galleria — sporge sull'angolo come un'etichetta appuntata, non incassato. */
export function TornBadge({ children }: { children: ReactNode }) {
  return <span className="torn-badge" style={{ background: TACCUINO_ACCENT[600] }}>{children}</span>
}
