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
] as const

export type DashboardWidgetId = typeof DASHBOARD_WIDGET_IDS[number]

export interface DashboardTab {
  id: string
  label: string
  widgetIds: DashboardWidgetId[]
}

export interface DashboardConfig {
  tabs: DashboardTab[]
}

/** La scheda con cui ogni account comincia — non eliminabile (l'utente può svuotarla, non farla
 *  sparire: la Bacheca deve sempre avere almeno una scheda). Il suo id è stabile perché non viene
 *  mai rigenerato da normalizeDashboardConfig quando la scheda esiste già. */
export const DEFAULT_TAB_ID = 'oggi'

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
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
  const r = (raw && typeof raw === 'object') ? raw as { tabs?: unknown } : {}
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

  return tabs.length > 0 ? { tabs } : DEFAULT_DASHBOARD_CONFIG
}
