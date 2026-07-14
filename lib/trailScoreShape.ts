// Classifica la *forma* del triangolo Comfort/Sicurezza/Ombra&Acqua che compone il Trail Score
// v2 (lib/trailScoreV2.ts) in un piccolo archetipo evocativo — indipendente dalla grandezza
// assoluta del punteggio (che resta comunicata dal numero), solo dal rapporto tra i 3 assi.
// Usato da components/TrailScoreShapeBadge.tsx.

export interface ShapeAxes {
  cts: number
  safety: number
  shade: number
}

export type ShapeArchetype =
  | 'equilibrato' | 'misto'
  | 'comfort_spike_mod'  | 'comfort_spike_extreme'
  | 'safety_spike_mod'   | 'safety_spike_extreme'
  | 'shade_spike_mod'    | 'shade_spike_extreme'
  | 'comfort_dent_mod'   | 'comfort_dent_extreme'
  | 'safety_dent_mod'    | 'safety_dent_extreme'
  | 'shade_dent_mod'     | 'shade_dent_extreme'

// Una parola sola, di uso comune — niente termini letterari/rari: la sicurezza in particolare
// deve essere immediatamente chiara ("Rischioso", non "Insidia").
export const SHAPE_LABEL: Record<ShapeArchetype, string> = {
  equilibrato:            'Equilibrato',
  misto:                  'Misto',
  comfort_spike_mod:      'Piacevole',
  comfort_spike_extreme:  'Delizioso',
  safety_spike_mod:       'Sicuro',
  safety_spike_extreme:   'Blindato',
  shade_spike_mod:        'Fresco',
  shade_spike_extreme:    'Boschivo',
  comfort_dent_mod:       'Essenziale',
  comfort_dent_extreme:   'Spartano',
  safety_dent_mod:        'Cautela',
  safety_dent_extreme:    'Rischioso',
  shade_dent_mod:         'Assolato',
  shade_dent_extreme:     'Arido',
}

// La forma è definita dal RAPPORTO tra i 3 assi (la quota di ciascuno sul totale, non lo scarto
// assoluto in punti dalla media) — due percorsi 5/5/1 e 50/50/10 hanno proporzioni identiche e
// devono ricevere la stessa etichetta, pur avendo uno scarto assoluto dalla media 10 volte più
// piccolo. Le quote di 3 assi bilanciati valgono 1/3 ciascuna; gli scarti sotto sono espressi come
// differenza da quella quota (range utile circa ±0.33..±0.67, non 0-100).
function shareDeviations({ cts, safety, shade }: ShapeAxes): Array<{ axis: AxisKey; d: number }> {
  const total = cts + safety + shade
  if (total <= 0) return [{ axis: 'cts', d: 0 }, { axis: 'safety', d: 0 }, { axis: 'shade', d: 0 }]
  const third = 1 / 3
  return [
    { axis: 'cts' as const,    d: cts / total - third },
    { axis: 'safety' as const, d: safety / total - third },
    { axis: 'shade' as const,  d: shade / total - third },
  ].sort((a, b) => b.d - a.d)
}

// Sotto questo scarto totale di quota (asse con quota più alta − asse con quota più bassa, sul
// totale dei 3) il triangolo è abbastanza vicino a equilatero da chiamarlo "Equilibrato" invece
// di nominare un asse che pesa solo di poco più degli altri.
const BALANCE_SHARE_SPREAD_THRESHOLD = 0.05
// Quanto un gap di quota deve essere più grande dell'altro perché la forma sia leggibile come "un
// asse solo spicca/manca" (spike/dent) invece di "i tre pesano via via diversamente" (misto).
const SPIKE_DENT_RATIO = 1.8
// Sopra questo gap di quota tra l'asse che spicca/manca e gli altri due, l'intensità passa da
// moderata a estrema.
const EXTREME_SHARE_GAP_THRESHOLD = 0.15

type AxisKey = 'cts' | 'safety' | 'shade'
const SPIKE_KEY: Record<AxisKey, 'comfort_spike' | 'safety_spike' | 'shade_spike'> = {
  cts: 'comfort_spike', safety: 'safety_spike', shade: 'shade_spike',
}
const DENT_KEY: Record<AxisKey, 'comfort_dent' | 'safety_dent' | 'shade_dent'> = {
  cts: 'comfort_dent', safety: 'safety_dent', shade: 'shade_dent',
}

/** Classifica la forma dai 3 assi (0-100 ciascuno) in base al RAPPORTO tra loro — quanto ciascuno
 *  pesa sul totale dei 3, non quanto si scosta in punti assoluti. Puramente proporzionale: un
 *  triangolo 30/30/30 e uno 90/90/90 danno entrambi 'equilibrato' (stesse proporzioni, 1/3 a
 *  testa) — la grandezza resta comunicata dal numero a fianco del badge, non da questa etichetta. */
export function classifyTrailScoreShape(axes: ShapeAxes): ShapeArchetype {
  const [top, mid, bottom] = shareDeviations(axes)
  const spread = top.d - bottom.d
  if (spread < BALANCE_SHARE_SPREAD_THRESHOLD) return 'equilibrato'

  const gapTop = top.d - mid.d
  const gapBottom = mid.d - bottom.d

  if (gapTop > gapBottom * SPIKE_DENT_RATIO) {
    return `${SPIKE_KEY[top.axis]}_${gapTop >= EXTREME_SHARE_GAP_THRESHOLD ? 'extreme' : 'mod'}` as ShapeArchetype
  }
  if (gapBottom > gapTop * SPIKE_DENT_RATIO) {
    return `${DENT_KEY[bottom.axis]}_${gapBottom >= EXTREME_SHARE_GAP_THRESHOLD ? 'extreme' : 'mod'}` as ShapeArchetype
  }
  return 'misto'
}
