import type { ReactNode } from 'react'
import {
  Compass, Route, BarChart2, Heart, MapPin, Leaf, Utensils, ShieldCheck, BookOpen, Radar,
} from 'lucide-react'
import type { GuideSectionKey } from '@/lib/guideSections'

// Colori presi dalla palette terra/forest/stone dell'app (tailwind.config.ts). Usati con
// parsimonia nel nuovo header editoriale (icona/eyebrow/riga d'accento) invece che come
// riempimento pieno — vedi SectionCard.tsx. "verificato" è l'unica eccezione alla palette
// terra/forest/stone (un azzurro "verifica live"), per distinguerla visivamente dalle altre
// sezioni — è l'unica con contenuto che cambia nel tempo, non narrativa statica.
export const SECTION_STYLE: Record<GuideSectionKey, { icon: ReactNode; color: string }> = {
  prima_di_partire: { icon: <Compass     className="w-4 h-4" />, color: '#c05a17' }, // terra-600
  il_percorso:      { icon: <Route       className="w-4 h-4" />, color: '#277134' }, // forest-600
  verificato:       { icon: <Radar       className="w-4 h-4" />, color: '#0f6e94' }, // sky-700
  dati_sicurezza:   { icon: <BarChart2   className="w-4 h-4" />, color: '#73695c' }, // stone-700
  comfort:          { icon: <Heart       className="w-4 h-4" />, color: '#9f4315' }, // terra-700
  luoghi:           { icon: <MapPin      className="w-4 h-4" />, color: '#813619' }, // terra-800
  natura:           { icon: <Leaf        className="w-4 h-4" />, color: '#378d44' }, // forest-500
  sapori:           { icon: <Utensils    className="w-4 h-4" />, color: '#d97220' }, // terra-500
  consigli:         { icon: <ShieldCheck className="w-4 h-4" />, color: '#5e564c' }, // stone-800
}

export const LEGACY_STYLE = { icon: <BookOpen className="w-4 h-4" />, color: '#978e7a' }
