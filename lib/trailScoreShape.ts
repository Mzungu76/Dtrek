// Classifica la *forma* del triangolo Comfort/Sicurezza/Ombra&Acqua che compone il Trail Score
// v2 (lib/trailScoreV2.ts) in un piccolo archetipo evocativo — indipendente dalla grandezza
// assoluta del punteggio (che resta comunicata dal numero), solo dalle proporzioni relative tra i
// 3 assi. Usato da components/TrailScoreShapeBadge.tsx.

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

// Sotto questo scarto totale (asse più alto − asse più basso, in punti 0-100) il triangolo è
// abbastanza vicino a equilatero da chiamarlo "Equilibrato" invece di nominare un asse che si
// scosta di poco.
const BALANCE_SPREAD_THRESHOLD = 12
// Quanto un gap deve essere più grande dell'altro perché la forma sia leggibile come "un asse
// solo spicca/manca" (spike/dent) invece di "i tre assi sono via via diversi" (misto).
const SPIKE_DENT_RATIO = 1.8
// Sopra questo gap (punti 0-100) tra l'asse che spicca/manca e gli altri due, l'intensità passa
// da moderata a estrema.
const EXTREME_GAP_THRESHOLD = 25

type AxisKey = 'cts' | 'safety' | 'shade'
const SPIKE_KEY: Record<AxisKey, 'comfort_spike' | 'safety_spike' | 'shade_spike'> = {
  cts: 'comfort_spike', safety: 'safety_spike', shade: 'shade_spike',
}
const DENT_KEY: Record<AxisKey, 'comfort_dent' | 'safety_dent' | 'shade_dent'> = {
  cts: 'comfort_dent', safety: 'safety_dent', shade: 'shade_dent',
}

/** Classifica la forma dai 3 assi (0-100 ciascuno). Puramente relativa: un triangolo 30/30/30 e
 *  uno 90/90/90 danno entrambi 'equilibrato' — la grandezza resta comunicata dal numero al
 *  centro del badge, non da questa etichetta. */
export function classifyTrailScoreShape({ cts, safety, shade }: ShapeAxes): ShapeArchetype {
  const mean = (cts + safety + shade) / 3
  const devs: Array<{ axis: AxisKey; d: number }> = [
    { axis: 'cts' as const, d: cts - mean },
    { axis: 'safety' as const, d: safety - mean },
    { axis: 'shade' as const, d: shade - mean },
  ].sort((a, b) => b.d - a.d)

  const [top, mid, bottom] = devs
  const spread = top.d - bottom.d
  if (spread < BALANCE_SPREAD_THRESHOLD) return 'equilibrato'

  const gapTop = top.d - mid.d
  const gapBottom = mid.d - bottom.d

  if (gapTop > gapBottom * SPIKE_DENT_RATIO) {
    return `${SPIKE_KEY[top.axis]}_${gapTop >= EXTREME_GAP_THRESHOLD ? 'extreme' : 'mod'}` as ShapeArchetype
  }
  if (gapBottom > gapTop * SPIKE_DENT_RATIO) {
    return `${DENT_KEY[bottom.axis]}_${gapBottom >= EXTREME_GAP_THRESHOLD ? 'extreme' : 'mod'}` as ShapeArchetype
  }
  return 'misto'
}
