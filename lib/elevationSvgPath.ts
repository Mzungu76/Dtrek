// Traccia SVG (linea + area) dell'andamento altimetrico — un'unica versione condivisa tra la
// fascia decorativa della Guida (GuideSection.tsx, quando manca una foto) e il profilo altimetrico
// del Resoconto (HiddenPdfRoot.tsx): stessa forma, stesso scopo (un grafico deterministico, reso
// in DOM/SVG invece che su canvas — nessun ritardo di decodifica immagine da attendere prima della
// cattura html2canvas), prima ognuno con la propria copia.

export function buildElevationSvgPath(
  profile: number[],
  width = 680,
  height = 100,
): { line: string; area: string } {
  const min = Math.min(...profile)
  const max = Math.max(...profile)
  const range = max - min || 1
  const pts = profile.map((v, i) => {
    const x = (i / (profile.length - 1 || 1)) * width
    const y = height - ((v - min) / range) * (height - 12) - 6
    return [x, y]
  })
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  return { line, area }
}

/** Riduce una serie numerica a al più `maxPts` valori campionati a passo costante — stessa idea di
 *  lib/downsamplePolyline.ts ma per un array scalare (altitudine) invece di coppie lat/lon. */
export function downsampleSeries(values: number[], maxPts: number): number[] {
  if (values.length <= maxPts) return values
  const step = (values.length - 1) / (maxPts - 1)
  return Array.from({ length: maxPts }, (_, i) => values[Math.round(i * step)])
}
