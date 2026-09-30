'use client'
// Elementi condivisi dai widget della Bacheca (stile, tipi, mattoni visivi). I widget "storici" in
// widgets.tsx hanno copie locali di CARD/EYEBROW: qui le stesse classi, per i widget nuovi.
import type { LucideIcon } from 'lucide-react'
import type { DashboardData } from './types'
import type { DashboardWidgetId } from '@/lib/dashboardConfig'

export interface WidgetProps { data: DashboardData }

export type WidgetCategory =
  | 'Oggi' | 'Allenamento' | 'Obiettivi e gioco' | 'Statistiche' | 'Cultura e curiosità'
  | 'Natura e meteo' | 'Pianificazione' | 'Diario e reportage' | 'Scorciatoie'

export const WIDGET_CATEGORIES: WidgetCategory[] = [
  'Oggi', 'Allenamento', 'Obiettivi e gioco', 'Statistiche', 'Cultura e curiosità',
  'Natura e meteo', 'Pianificazione', 'Diario e reportage', 'Scorciatoie',
]

export interface WidgetCatalogEntry {
  id: DashboardWidgetId
  label: string
  icon: LucideIcon
  Component: React.ComponentType<WidgetProps>
  category: WidgetCategory
  /** Una riga che dice cosa mostra, per il selettore. */
  description?: string
}

export const CARD = 'bg-white rounded-2xl border border-stone-200 p-4'
export const EYEBROW = 'font-barlow text-[10px] font-bold uppercase tracking-[1.5px] text-stone-400'

export function WidgetEmpty({ text }: { text: string }) {
  return <p className="font-lora italic text-[12px] text-stone-400">{text}</p>
}

export function WidgetShell({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className={CARD}>
      <div className={`${EYEBROW} mb-2`}>{title}</div>
      {children}
      {footer && <div className="mt-2.5 text-[10px] text-stone-400">{footer}</div>}
    </div>
  )
}

/** Barre verticali semplici con etichetta sotto e valore sopra; l'altezza è relativa al massimo. */
export function MiniBars({ values, labels, highlight, unit = '' }: { values: number[]; labels: string[]; highlight?: number; unit?: string }) {
  const max = Math.max(1, ...values)
  return (
    <div className="flex items-end gap-1.5 h-24">
      {values.map((v, i) => (
        <div key={i} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full gap-1">
          <span className="text-[9.5px] font-semibold text-stone-500 tabular-nums">{v > 0 ? `${v}${unit}` : ''}</span>
          <div
            className={`w-full rounded-t-md ${i === highlight ? 'bg-terra-500' : 'bg-forest-300'}`}
            style={{ height: `${Math.max(v > 0 ? 6 : 2, (v / max) * 62)}%` }}
          />
          <span className="text-[9.5px] text-stone-400 truncate w-full text-center">{labels[i]}</span>
        </div>
      ))}
    </div>
  )
}

export function ProgressBar({ pct, marker, color = 'bg-forest-500' }: { pct: number; marker?: number; color?: string }) {
  const p = Math.max(0, Math.min(100, pct))
  return (
    <div className="relative h-2.5 rounded-full bg-stone-200 overflow-visible">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${p}%` }} />
      {marker != null && (
        <div className="absolute -top-1 w-0.5 h-4.5 bg-stone-500/70" style={{ left: `${Math.max(0, Math.min(100, marker))}%`, height: '18px' }} title="Dove dovresti essere a questo punto dell'anno" />
      )}
    </div>
  )
}

export function fmtKm(n: number): string { return `${Math.round(n).toLocaleString('it-IT')} km` }
export function fmtDate(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function readLocal(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
export function writeLocal(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* storage non disponibile */ }
}
