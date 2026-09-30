// Riassunti compatti dei widget che si possono "fissare" sulla mappa della Home (peek). Il peek è
// una piccola tessera in stile vetro, non una scheda intera: ogni widget fissabile dichiara qui
// cosa mostrare in una riga d'etichetta, un valore e (se serve) un anello o un link. Chi ha contenuto
// che arriva in ritardo o interattivo (la foto dell'archivio) ha invece una tessera dedicata in
// peekTiles.tsx. I widget senza né l'uno né l'altra (grafici, elenchi lunghi) restano nella
// dashboard ma non si possono fissare.
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { getMoonIllumination } from 'suncalc'
import { getSunTimes } from '@/lib/daylight'
import { wmoInfo } from '@/lib/weather'
import { weekOverWeek, yearProgress, monthChallenge, topAltitudes, anniversaries } from '@/lib/dashboardStats'
import { referencePoint } from './widgetsExtra'
import { PEEK_TILES } from './peekTiles'
import type { DashboardData } from './types'
import type { DashboardWidgetId } from '@/lib/dashboardConfig'

export interface PeekSummary {
  label: string
  value: string
  caption?: string
  /** Anello di avanzamento a sinistra (0-100). */
  ring?: { value: number; color: string }
  href?: string
}

const km1 = (n: number) => n.toFixed(1).replace('.', ',')
const time = (d: Date | null) => (d ? d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '—')

function readGoalKm(): number {
  try {
    const n = Number(localStorage.getItem('dtrek:dashboard-goal-km'))
    return Number.isFinite(n) && n > 0 ? n : 1000
  } catch { return 1000 }
}

const MOON_NAMES = ['Luna nuova', 'Luna crescente', 'Primo quarto', 'Gibbosa crescente', 'Luna piena', 'Gibbosa calante', 'Ultimo quarto', 'Luna calante']

export const PEEK_SUMMARIES: Partial<Record<DashboardWidgetId, (d: DashboardData) => PeekSummary>> = {
  'recovery': (d) => ({ label: 'Recovery', value: d.recovery.label, ring: { value: d.recovery.score, color: d.recovery.color } }),

  'prossima-uscita': (d) => {
    const next = d.nextOuting
    if (d.nextOutingLoading) return { label: 'Prossima uscita', value: 'Caricamento…' }
    if (!next) return { label: 'Prossima uscita', value: 'Nessuna in programma' }
    const w = next.weather ? wmoInfo(next.weather.weathercode) : null
    return {
      label: 'Prossima uscita', value: next.title, href: `/guida/${encodeURIComponent(next.id)}`,
      caption: `${format(new Date(next.plannedDate), 'EEE d MMM', { locale: it })}${next.weather && w ? ` · ${w.emoji} ${Math.round(next.weather.tempMax)}°` : ''}`,
    }
  },

  'forma': (d) => ({ label: 'Bilancio fisico', value: d.forma.label }),
  'volume': (d) => ({ label: 'Questa settimana', value: `${km1(d.currentWeekKm)} km`, caption: d.volumePhrase ?? undefined }),
  'streak': (d) => ({ label: 'Streak', value: `${d.streaks.currentWeeks} settimane`, caption: `${d.streaks.currentDays} giorni di fila` }),

  'traguardo': (d) => d.nearestBadge
    ? { label: 'Prossimo traguardo', value: d.nearestBadge.name, ring: d.nearestBadge.progressPct != null ? { value: d.nearestBadge.progressPct, color: '#e9ab64' } : undefined }
    : { label: 'Prossimo traguardo', value: 'Nessuno vicino' },

  'obiettivo-annuale': (d) => {
    const goal = readGoalKm()
    const p = yearProgress(d.activities, new Date())
    return { label: `Obiettivo ${new Date().getFullYear()}`, value: `${Math.round(p.doneKm)} / ${goal} km`, ring: { value: Math.min(100, (p.doneKm / goal) * 100), color: '#6fbf8e' } }
  },

  'sfida-mese': (d) => {
    const c = monthChallenge(d.activities, new Date())
    return { label: 'Sfida del mese', value: `${Math.min(c.done, c.target)} / ${c.target} uscite`, ring: { value: Math.min(100, (c.done / c.target) * 100), color: '#6fbf8e' } }
  },

  'confronto-settimana': (d) => {
    const w = weekOverWeek(d.activities, new Date())
    return { label: 'Settimana a confronto', value: `${km1(w.thisWeek.km)} km`, caption: `la scorsa: ${km1(w.lastWeek.km)} km` }
  },

  'fase-lunare': () => {
    const m = getMoonIllumination(new Date())
    return { label: 'Luna di stasera', value: MOON_NAMES[Math.round(m.phase * 8) % 8], caption: `illuminata al ${Math.round(m.fraction * 100)}%` }
  },

  'alba-tramonto': (d) => {
    const ref = referencePoint(d.activities, d.plannedHikes)
    if (!ref) return { label: 'Alba e tramonto', value: 'Serve un’uscita' }
    const t = getSunTimes(ref.lat, ref.lon, new Date())
    return { label: 'Alba e tramonto', value: `${time(t.sunrise)} · ${time(t.sunset)}` }
  },

  'quote-massime': (d) => {
    const top = topAltitudes(d.activities, 1)[0]
    return top ? { label: 'Quota massima', value: `${Math.round(top.altitudeMax).toLocaleString('it-IT')} m`, caption: top.title, href: `/resoconto/${encodeURIComponent(top.id)}` }
      : { label: 'Quota massima', value: '—' }
  },

  'anniversari': (d) => {
    const list = anniversaries(d.activities, new Date())
    return list.length > 0
      ? { label: 'In questo periodo', value: list[0].activity.title, caption: list[0].yearsAgo === 1 ? 'un anno fa' : `${list[0].yearsAgo} anni fa`, href: `/resoconto/${encodeURIComponent(list[0].activity.id)}` }
      : { label: 'In questo periodo', value: 'Nessuna uscita', caption: 'negli anni scorsi' }
  },

  'diario-attivo': (d) => ({ label: 'Diario attivo', value: d.defaultDiary?.title ?? 'Il mio Diario', href: '/diario' }),

  'percorsi-per-te': (d) => ({
    label: 'Percorsi per te',
    value: d.percorsiPerTe.status === 'ok' ? `${d.percorsiPerTe.count} consigliati` : d.percorsiPerTe.status === 'loading' ? 'Caricamento…' : 'Non disponibili',
    href: '/percorsi-per-te',
  }),
}

/** Fissabile = ha un riassunto calcolato al volo oppure una tessera dedicata (peekTiles.tsx). */
export function isPinnable(id: DashboardWidgetId): boolean { return id in PEEK_SUMMARIES || id in PEEK_TILES }
