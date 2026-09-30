// Configurazione della Bacheca-dashboard (Direzione C, docs/mockup-bacheca-dashboard/README.md) —
// schede personalizzabili dall'utente, ciascuna con il proprio elenco di widget. Stesso principio
// di lib/diaryConfig.ts: file puro (nessun React/DOM), condiviso da client e server
// (app/api/dashboard-config/route.ts), sempre normalizzato in lettura per tollerare un JSON
// malformato o scritto da una versione precedente dell'app.

/** Un widget aggiunto dall'utente non deve mai far sparire i propri dati se l'app viene aggiornata
 *  con nuovi widget — l'elenco cresce solo in coda, non si rinumerano id esistenti. */
export const DASHBOARD_WIDGET_IDS = [
  'quote', 'prossima-uscita', 'recovery', 'forma', 'volume', 'streak',
  'traguardo', 'diario-attivo', 'percorsi-per-te', 'raccolte', 'accesso-rapido',
  'record', 'heatmap', 'mensile', 'tss',
  'obiettivo-annuale', 'sfida-mese', 'quote-massime', 'record-anno', 'anniversari',
  'confronto-settimana', 'distanza-cumulata', 'distribuzione-distanze', 'giorni-settimana',
  'ora-partenza', 'mese-record', 'dislivello-uscite', 'lo-sapevi', 'fase-lunare', 'alba-tramonto',
  'meteo-uscita', 'reportage-da-scrivere', 'da-riprovare', 'foto-diario',
] as const

export type DashboardWidgetId = typeof DASHBOARD_WIDGET_IDS[number]

export interface DashboardTab {
  id: string
  label: string
  widgetIds: DashboardWidgetId[]
}

export interface DashboardConfig {
  tabs: DashboardTab[]
  /** I widget sempre visibili sulla mappa della Home (peek): fino a MAX_PINNED, scelti dall'utente.
   *  Solo widget con un riassunto compatto (components/dashboard/peekSummaries.ts). */
  pinned: DashboardWidgetId[]
}

export const MAX_PINNED = 2
/** Quelli fissi di prima, per chi non ha mai scelto. */
export const DEFAULT_PINNED: DashboardWidgetId[] = ['recovery', 'prossima-uscita']

/** La scheda con cui ogni account comincia — non eliminabile (l'utente può svuotarla, non farla
 *  sparire: la Bacheca deve sempre avere almeno una scheda). Il suo id è stabile perché non viene
 *  mai rigenerato da normalizeDashboardConfig quando la scheda esiste già. */
export const DEFAULT_TAB_ID = 'oggi'

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  pinned: DEFAULT_PINNED,
  tabs: [
    {
      id: DEFAULT_TAB_ID,
      label: 'Oggi',
      widgetIds: ['quote', 'prossima-uscita', 'recovery', 'volume', 'accesso-rapido'],
    },
  ],
}

function isWidgetId(x: unknown): x is DashboardWidgetId {
  return typeof x === 'string' && (DASHBOARD_WIDGET_IDS as readonly string[]).includes(x)
}

export function normalizeDashboardConfig(raw: unknown): DashboardConfig {
  const r = (raw && typeof raw === 'object') ? raw as { tabs?: unknown; pinned?: unknown } : {}
  const rawTabs: unknown[] = Array.isArray(r.tabs) ? r.tabs : []

  const seenIds = new Set<string>()
  const tabs: DashboardTab[] = rawTabs
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map(t => {
      let id = typeof t.id === 'string' && t.id.trim() ? t.id.trim() : crypto.randomUUID()
      while (seenIds.has(id)) id = crypto.randomUUID()
      seenIds.add(id)
      return {
        id,
        label: typeof t.label === 'string' && t.label.trim() ? t.label.trim().slice(0, 40) : 'Scheda',
        widgetIds: Array.isArray(t.widgetIds) ? t.widgetIds.filter(isWidgetId) : [],
      }
    })

  // pinned assente (configurazioni salvate prima di questa opzione) = i due di sempre; presente ma
  // vuoto = l'utente non ne vuole nessuno.
  const pinned: DashboardWidgetId[] = Array.isArray(r.pinned)
    ? Array.from(new Set(r.pinned.filter(isWidgetId))).slice(0, MAX_PINNED)
    : DEFAULT_PINNED

  return tabs.length > 0 ? { tabs, pinned } : { ...DEFAULT_DASHBOARD_CONFIG, pinned }
}

/** Fissa `id` nella posizione `slot` (o la svuota con null). Se `id` è già fissato in un'altra posizione
 *  le due si scambiano, così non si perde mai l'altro widget scelto. */
export function applyPin(pinned: DashboardWidgetId[], slot: number, id: DashboardWidgetId | null): DashboardWidgetId[] {
  const next = [...pinned]
  if (id == null) { next.splice(slot, 1); return next }
  const existing = next.indexOf(id)
  if (existing !== -1 && existing !== slot) {
    if (slot < next.length) { next[existing] = next[slot]; next[slot] = id }
    return next.slice(0, MAX_PINNED)
  }
  if (slot < next.length) next[slot] = id
  else next.push(id)
  return next.slice(0, MAX_PINNED)
}
