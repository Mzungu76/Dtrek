// Rule-based fallback used when OSM has no leaf_type/species tags for the
// area (the common case — OSM rarely annotates individual tree species).
// Same approach as lib/safetyScore.ts's inferRegion/getWildlifeRisks: hardcoded
// geographic/ecological domain knowledge, not live data, clearly surfaced as
// an estimate rather than an OSM fact.
export interface VegetationBeltEstimate {
  label: string
  description: string
}

type Region = 'alpi' | 'appennino' | 'mediterraneo'

function regionFlavor(lat: number): Region {
  if (lat >= 44.5) return 'alpi'
  if (lat >= 41.5) return 'appennino'
  return 'mediterraneo'
}

export function estimateVegetationBelt(lat: number, altitudeMax: number): VegetationBeltEstimate {
  const region = regionFlavor(lat)

  if (altitudeMax > 2300) {
    return {
      label: 'fascia alpina/nivale',
      description: 'A queste quote la vegetazione arborea lascia spazio a pascoli d\'alta quota, arbusti pionieri (rododendro, mirtillo) e roccia nuda.',
    }
  }
  if (altitudeMax > 1800) {
    return region === 'alpi'
      ? { label: 'fascia subalpina', description: 'Tipici di questa fascia sulle Alpi sono larice, pino cembro e pino mugo, con pascoli d\'alta quota.' }
      : { label: 'fascia subalpina', description: 'Tipici di questa fascia sull\'Appennino sono faggete contorte dal vento, ginepro nano e pascoli d\'altitudine.' }
  }
  if (altitudeMax > 1200) {
    return region === 'alpi'
      ? { label: 'fascia montana', description: 'Tipici di questa fascia sulle Alpi sono abete rosso, abete bianco e faggio.' }
      : { label: 'fascia montana', description: 'Tipici di questa fascia sull\'Appennino sono faggio e, nelle valli più fresche, abete bianco.' }
  }
  if (altitudeMax > 600) {
    return {
      label: 'fascia submontana/collinare',
      description: 'Tipici di questa fascia sono castagno e querceto misto (rovere, cerro), con faggio alle quote più alte.',
    }
  }
  if (region === 'mediterraneo') {
    return {
      label: 'fascia mediterranea',
      description: 'Tipici di questa fascia sono leccio, sughera e macchia mediterranea (corbezzolo, erica, ginestra).',
    }
  }
  return {
    label: 'fascia collinare',
    description: 'Tipici di questa fascia sono querceto misto (roverella, cerro), castagno e boschi misti di pianura.',
  }
}
