import type { ReactNode } from 'react'
import { BarChart2, Mountain, Leaf, MapPin, Compass, Route, Flag, BookOpen, Camera } from 'lucide-react'
import { createElement } from 'react'

export type ReportFixedSectionKey = 'dati_punteggi' | 'andamento' | 'natura' | 'poi' | 'galleria_foto'

/** Colori/icone delle sezioni "dati" fisse — sempre presenti, indipendentemente dal racconto AI/
 *  manuale (stesso principio di components/guida/sectionStyle.ts: ogni widget resta raggiungibile
 *  anche senza testo). Palette forest/stone dell'app, non terra (quella resta la firma di Guida).
 *  "galleria_foto" è l'eccezione (ambra, come i pin numerati) — riunisce mappa foto + "le tue
 *  foto" + gestione foto (ex-Strumenti); inclusa in ReportReader solo se ci sono foto caricate,
 *  a differenza delle altre quattro sempre presenti. */
export const REPORT_SECTION_STYLE: Record<ReportFixedSectionKey, { icon: ReactNode; color: string }> = {
  dati_punteggi: { icon: createElement(BarChart2, { className: 'w-4 h-4' }), color: '#57534e' }, // stone-700
  andamento:     { icon: createElement(Mountain,  { className: 'w-4 h-4' }), color: '#277134' }, // forest-600
  natura:        { icon: createElement(Leaf,      { className: 'w-4 h-4' }), color: '#378d44' }, // forest-500
  poi:           { icon: createElement(MapPin,    { className: 'w-4 h-4' }), color: '#1c4724' }, // forest-800
  galleria_foto: { icon: createElement(Camera,    { className: 'w-4 h-4' }), color: '#b45309' }, // amber-700
}

export const REPORT_SECTION_TITLE: Record<ReportFixedSectionKey, string> = {
  dati_punteggi: 'Dati e punteggi',
  andamento: 'Andamento',
  natura: 'Natura',
  poi: 'Punti di interesse',
  galleria_foto: 'Galleria fotografica',
}

// Icone/colori a rotazione per i capitoli del racconto (AI o manuale) — titoli liberi, non
// legati a chiavi fisse come in Guida, quindi qui la varietà visiva viene da una rotazione
// invece che da una mappa 1:1 titolo→stile.
const NARRATIVE_ICONS = [Compass, Route, Mountain, Flag, BookOpen]
// Contrasto testo bianco verificato (WCAG) su ogni colore — nessuno sotto ~5:1, per restare
// leggibile nel pallino/pillola attivo del sommario (era un mint troppo chiaro, quasi invisibile).
const NARRATIVE_COLORS = ['#2d6a4f', '#40916c', '#6d4c41', '#1c4724', '#277134']

export function narrativeStyleFor(index: number): { icon: ReactNode; color: string } {
  const Icon = NARRATIVE_ICONS[index % NARRATIVE_ICONS.length]
  return { icon: createElement(Icon, { className: 'w-4 h-4' }), color: NARRATIVE_COLORS[index % NARRATIVE_COLORS.length] }
}
