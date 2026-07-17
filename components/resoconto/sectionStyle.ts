import type { ReactNode } from 'react'
import { BarChart2, Mountain, Leaf, MapPin, Compass, Route, Flag, BookOpen, Camera } from 'lucide-react'
import { createElement } from 'react'

export type ReportFixedSectionKey = 'dati_punteggi' | 'andamento' | 'natura' | 'poi' | 'foto_mappa'

/** Colori/icone delle sezioni "dati" fisse — sempre presenti, indipendentemente dal racconto AI/
 *  manuale (stesso principio di components/guida/sectionStyle.ts: ogni widget resta raggiungibile
 *  anche senza testo). Palette forest/stone dell'app, non terra (quella resta la firma di Guida).
 *  "foto_mappa" è l'eccezione (ambra, come i pin numerati) — inclusa in ReportReader solo se
 *  esiste almeno una foto geolocalizzata, a differenza delle altre quattro sempre presenti. */
export const REPORT_SECTION_STYLE: Record<ReportFixedSectionKey, { icon: ReactNode; color: string }> = {
  dati_punteggi: { icon: createElement(BarChart2, { className: 'w-4 h-4' }), color: '#57534e' }, // stone-700
  andamento:     { icon: createElement(Mountain,  { className: 'w-4 h-4' }), color: '#277134' }, // forest-600
  natura:        { icon: createElement(Leaf,      { className: 'w-4 h-4' }), color: '#378d44' }, // forest-500
  poi:           { icon: createElement(MapPin,    { className: 'w-4 h-4' }), color: '#1c4724' }, // forest-800
  foto_mappa:    { icon: createElement(Camera,    { className: 'w-4 h-4' }), color: '#b45309' }, // amber-700
}

export const REPORT_SECTION_TITLE: Record<ReportFixedSectionKey, string> = {
  dati_punteggi: 'Dati e punteggi',
  andamento: 'Andamento',
  natura: 'Natura',
  poi: 'Punti di interesse',
  foto_mappa: 'Foto sulla mappa',
}

// Icone/colori a rotazione per i capitoli del racconto (AI o manuale) — titoli liberi, non
// legati a chiavi fisse come in Guida, quindi qui la varietà visiva viene da una rotazione
// invece che da una mappa 1:1 titolo→stile.
const NARRATIVE_ICONS = [Compass, Route, Mountain, Flag, BookOpen]
const NARRATIVE_COLORS = ['#2d6a4f', '#40916c', '#74c69d', '#1c4724', '#277134']

export function narrativeStyleFor(index: number): { icon: ReactNode; color: string } {
  const Icon = NARRATIVE_ICONS[index % NARRATIVE_ICONS.length]
  return { icon: createElement(Icon, { className: 'w-4 h-4' }), color: NARRATIVE_COLORS[index % NARRATIVE_COLORS.length] }
}
