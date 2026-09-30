'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Pencil, Plus, X, ChevronUp, ChevronDown, Check, LayoutDashboard } from 'lucide-react'
import { MobileNavBar, DesktopNav } from '@/components/Navbar'
import { WIDGET_CATALOG, WIDGET_BY_ID } from '@/components/dashboard/widgets'
import { WIDGET_CATEGORIES } from '@/components/dashboard/widgetKit'
import { PEEK_SUMMARIES, isPinnable, type PeekSummary } from '@/components/dashboard/peekSummaries'
import { PEEK_TILES } from '@/components/dashboard/peekTiles'
import {
  normalizeDashboardConfig, DEFAULT_DASHBOARD_CONFIG, DEFAULT_TAB_ID, MAX_PINNED, applyPin,
  type DashboardConfig, type DashboardTab, type DashboardWidgetId,
} from '@/lib/dashboardConfig'
import type { DashboardData } from './types'

// Quanto (px) deve muoversi il dito prima che un tocco venga letto come trascinamento invece che
// come tap — sotto questa soglia, anche un piccolo movimento involontario apre/chiude la scheda.
const DRAG_COMMIT_PX = 32

function GlassRing({ value, color, size = 40 }: { value: number; color: string; size?: number }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div
      className="rounded-full shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, background: `conic-gradient(${color} ${pct}%, rgba(255,255,255,0.18) ${pct}% 100%)` }}
    >
      <div className="rounded-full bg-[#0b1a24]/90 flex items-center justify-center" style={{ width: size - 9, height: size - 9 }}>
        <span className="font-display font-bold text-white" style={{ fontSize: size * 0.3 }}>{Math.round(value)}</span>
      </div>
    </div>
  )
}

/** Una tessera "vetro" del peek: etichetta, valore ed eventuale anello o link. */
function PeekTile({ summary }: { summary: PeekSummary }) {
  const body = (
    <div className="flex items-center gap-2.5">
      {summary.ring && <GlassRing value={summary.ring.value} color={summary.ring.color} />}
      <div className="min-w-0">
        <div className="font-barlow text-[10px] font-bold tracking-wide uppercase text-white/65 truncate">{summary.label}</div>
        <div className="font-display font-semibold text-[13px] text-white truncate mt-0.5">{summary.value}</div>
        {summary.caption && <div className="text-[10px] text-white/65 mt-0.5 truncate">{summary.caption}</div>}
      </div>
    </div>
  )
  return (
    <div className="flex-1 min-w-0 rounded-2xl bg-white/14 backdrop-blur-md border border-white/20 p-3.5">
      {summary.href ? <Link href={summary.href} className="block">{body}</Link> : body}
    </div>
  )
}

/** I widget sempre visibili sul peek (mobile): quelli che l'utente ha fissato (config.pinned, al
 *  massimo due), ciascuno nella sua versione compatta (peekSummaries.ts). Indipendenti dalle schede
 *  personalizzabili sotto, che si raggiungono trascinando verso l'alto. */
function PeekWidgets({ data, ids }: { data: DashboardData; ids: DashboardWidgetId[] }) {
  const tiles = ids.map(id => {
    const Custom = PEEK_TILES[id]
    if (Custom) return <Custom key={id} data={data} />
    const summary = PEEK_SUMMARIES[id]?.(data)
    return summary ? <PeekTile key={id} summary={summary} /> : null
  }).filter(Boolean)
  if (tiles.length === 0) return null
  return <div className="flex gap-2.5">{tiles}</div>
}

/** Gli stessi widget fissati, ma per lo sfondo chiaro del pannello da lg in su: lì si riusano i
 *  widget interi del catalogo (WIDGET_BY_ID) invece delle tessere "vetro" pensate per stare sopra la
 *  mappa. */
function PinnedPeekWidgets({ data, ids }: { data: DashboardData; ids: DashboardWidgetId[] }) {
  return (
    <>
      {ids.map(id => {
        const C = WIDGET_BY_ID[id]?.Component
        return C ? <C key={id} data={data} /> : null
      })}
    </>
  )
}

/** Pannello a scomparsa (Direzione E): peek con 2 widget chiave + maniglia, trascinata o toccata
 *  per aprire tutto il catalogo di schede/widget personalizzabili già costruito per la Dashboard
 *  a card (Direzione C, app/bacheca/page.tsx prima di questo restyling) — quella logica non
 *  cambia, cambia solo il contenitore: prima era la pagina intera, ora vive qui dentro. */
export default function DashboardSheet({ data }: { data: DashboardData }) {
  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_DASHBOARD_CONFIG)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [activeTabId, setActiveTabId] = useState(DEFAULT_TAB_ID)
  const [open, setOpen] = useState(false)
  // Da lg in su il pannello non è più sempre aperto e docked (spostava la mappa, vedi
  // DashboardHero.tsx): parte iconato (richiesta esplicita) e la mappa resta sempre a piena
  // pagina — il pannello, quando aperto, galleggia sopra come overlay semitrasparente.
  const [desktopOpen, setDesktopOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Se non è null il selettore serve a scegliere il widget fissato nella posizione indicata.
  const [pinSlot, setPinSlot] = useState<number | null>(null)
  const [creatingTab, setCreatingTab] = useState(false)
  const [newTabName, setNewTabName] = useState('')
  const [renaming, setRenaming] = useState(false)

  useEffect(() => {
    fetch('/api/dashboard-config').then(r => r.ok ? r.json() : DEFAULT_DASHBOARD_CONFIG)
      .then(raw => {
        const cfg = normalizeDashboardConfig(raw)
        setConfig(cfg)
        setActiveTabId(cfg.tabs[0].id)
      })
      .catch(() => setConfig(DEFAULT_DASHBOARD_CONFIG))
      .finally(() => setConfigLoaded(true))
  }, [])

  function saveConfig(next: DashboardConfig) {
    setConfig(next)
    fetch('/api/dashboard-config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next),
    }).catch(() => {})
  }

  const activeTab = config.tabs.find(t => t.id === activeTabId) ?? config.tabs[0]

  function updateActiveTab(patch: Partial<DashboardTab>) {
    saveConfig({ ...config, tabs: config.tabs.map(t => t.id === activeTab.id ? { ...t, ...patch } : t) })
  }

  function moveWidget(index: number, dir: -1 | 1) {
    const ids = [...activeTab.widgetIds]
    const j = index + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    updateActiveTab({ widgetIds: ids })
  }

  function removeWidget(id: DashboardWidgetId) {
    updateActiveTab({ widgetIds: activeTab.widgetIds.filter(w => w !== id) })
  }

  function addWidget(id: DashboardWidgetId) {
    if (activeTab.widgetIds.includes(id)) return
    updateActiveTab({ widgetIds: [...activeTab.widgetIds, id] })
    setPickerOpen(false)
  }

  function setPinned(slot: number, id: DashboardWidgetId | null) {
    saveConfig({ ...config, pinned: applyPin(config.pinned, slot, id) })
    setPinSlot(null); setPickerOpen(false)
  }

  function createTab() {
    const label = newTabName.trim()
    if (!label) return
    const tab: DashboardTab = { id: crypto.randomUUID(), label, widgetIds: [] }
    saveConfig({ ...config, tabs: [...config.tabs, tab] })
    setActiveTabId(tab.id)
    setCreatingTab(false); setNewTabName('')
    setEditMode(true)
  }

  function deleteActiveTab() {
    if (config.tabs.length <= 1) return
    const remaining = config.tabs.filter(t => t.id !== activeTab.id)
    saveConfig({ ...config, tabs: remaining })
    setActiveTabId(remaining[0].id)
    setEditMode(false)
  }

  const availableToAdd = pinSlot != null
    ? WIDGET_CATALOG.filter(w => isPinnable(w.id))
    : WIDGET_CATALOG.filter(w => !activeTab.widgetIds.includes(w.id))

  // ── Trascina/tocca la maniglia per aprire o chiudere ──────────────────────────────────────
  const dragStartY = useRef<number | null>(null)
  function handlePointerDown(e: React.PointerEvent) {
    dragStartY.current = e.clientY
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  function handlePointerUp(e: React.PointerEvent) {
    if (dragStartY.current == null) return
    const deltaY = e.clientY - dragStartY.current
    dragStartY.current = null
    if (Math.abs(deltaY) < 6) { setOpen(v => !v); return } // tap
    if (deltaY < -DRAG_COMMIT_PX) setOpen(true)
    else if (deltaY > DRAG_COMMIT_PX) setOpen(false)
  }

  return (
    <>
      {/* ── Peek: sempre visibile, ancorato in basso sopra la mappa — solo sotto lg, dove il
          pannello è un foglio trascinabile che altrimenti coprirebbe tutta la mappa. Da lg in
          su il pannello è un riquadro fisso sempre aperto (sotto), quindi non serve un peek. ── */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2.5 px-4 transition-opacity lg:hidden"
        style={{ opacity: open ? 0 : 1, pointerEvents: open ? 'none' : 'auto' }}
      >
        <button
          onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}
          aria-label="Apri tutti i widget" className="flex flex-col items-center py-1 touch-none select-none"
        >
          <ChevronUp className="w-5 h-5 text-white/65 animate-bounce" strokeWidth={2.5} />
          <span className="font-barlow text-[9.5px] font-bold tracking-wide uppercase text-white/55 mt-0.5">Trascina per tutti i widget</span>
        </button>
        {configLoaded ? <PeekWidgets data={data} ids={config.pinned} /> : (
          <div className="flex gap-2.5">
            {[0, 1].map(i => <div key={i} className="flex-1 h-[72px] rounded-2xl bg-white/10 animate-pulse" />)}
          </div>
        )}
        {/* Barra di navigazione mobile, spostata qui in fondo (sotto il pannello widget e la
            freccetta di scorrimento) — stesso posizionamento di HubNavBar in RouteHub.tsx per
            Guida/Reportage/Diari, solo montata direttamente qui perché la Dashboard non passa da
            RouteHub. -mx-4 per farla toccare i bordi (il contenitore ha px-4). Solo la metà
            mobile: la testata desktop vive fuori da qui sotto, vedi il commento lì per il perché
            (un antenato `position:absolute` con z-index, come questo contenitore, crea un
            proprio contesto di stacking — un `position:fixed` annidato dentro non può più
            "uscirne" per confrontare il proprio z-index con quello di fratelli esterni, come il
            pannello qui sotto: sarebbe rimasto sempre coperto, qualunque z-index gli si desse). */}
        <div className="-mx-4">
          <MobileNavBar className="md:hidden" showAvatar={false} safeAreaTop={false} safeAreaBottom />
        </div>
      </div>

      {/* Testata desktop — fuori da QUALUNQUE antenato con la propria z-index/stacking (il peek
          sopra, il pannello sotto): solo così il suo z-50 si confronta alla pari con quello del
          pannello (z-30) invece di restarne coperto. Da md: in su, a ogni larghezza — DesktopNav
          si nasconde da sé sotto md: (className interno), non serve alcun wrapper qui. */}
      <DesktopNav position="fixed" />

      {/* ── Icona da lg in su, quando il pannello è chiuso (stato iniziale): grande, in tema,
          fissa nello stesso angolo dove poi si apre il pannello — un tocco lo apre. Assente sotto
          lg, dove il pannello resta il solito foglio trascinabile dal basso. ── */}
      {!desktopOpen && (
        <button
          onClick={() => setDesktopOpen(true)}
          title="Apri la Dashboard"
          aria-label="Apri la Dashboard"
          className="hidden lg:flex fixed z-30 top-[calc(env(safe-area-inset-top,0px)+80px)] right-6 w-16 h-16 rounded-2xl items-center justify-center
            bg-forest-600/90 hover:bg-forest-600 backdrop-blur-md border border-white/20 shadow-2xl text-white transition-colors"
        >
          <LayoutDashboard className="w-7 h-7" />
        </button>
      )}

      {/* ── Pannello: sotto lg un foglio trascinabile (stessa logica di sempre); da lg in su una
          card fluttuante in alto a destra, semitrasparente (sfondo/bordi/testata/tab/controlli in
          stile "vetro" scuro, come TopOverlay/HubNavBar) — non più docked/sempre aperta: parte
          iconata (sopra) e si apre/richiude con l'icona o il pulsante di chiusura in testata,
          senza più spostare la mappa di sotto (DashboardHero.tsx torna a piena pagina anche a
          lg). Le SCHEDE dei widget (Component qui sotto) restano invariate: sono già card bianche
          (WIDGET_BY_ID, components/dashboard/widgets.tsx), che sul pannello scuro leggono come
          vetrini luminosi — stesso principio di PeekWidgets sopra la mappa, senza doverle toccare
          una per una. Il contrasto testo/badge resta comunque alto (bianco pieno, non su un
          fondo troppo trasparente) per restare leggibile sopra la mappa sotto. ── */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 bg-stone-50 rounded-t-[26px] shadow-2xl flex flex-col
          transition-transform duration-300 ease-out top-[calc(env(safe-area-inset-top,0px)+64px)]
          ${open ? 'translate-y-0' : 'translate-y-full'}
          lg:translate-y-0 lg:inset-y-auto lg:left-auto lg:right-6 lg:w-[380px]
          lg:top-[calc(env(safe-area-inset-top,0px)+80px)] lg:bottom-6 lg:max-h-[calc(100vh-env(safe-area-inset-top,0px)-104px)]
          lg:rounded-2xl lg:border lg:border-white/15 lg:bg-[#0f2029]/75 lg:backdrop-blur-xl
          lg:origin-top-right lg:transition-all lg:duration-200
          ${desktopOpen ? 'lg:opacity-100 lg:scale-100 lg:pointer-events-auto' : 'lg:opacity-0 lg:scale-95 lg:pointer-events-none'}`}
      >
        <button
          onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}
          aria-label="Chiudi" className="shrink-0 flex flex-col items-center pt-2.5 pb-1 touch-none select-none lg:hidden"
        >
          <div className="w-9 h-1.5 rounded-full bg-stone-300" />
        </button>

        <div className="hidden lg:flex flex-col gap-2.5 px-4 pt-4">
          {configLoaded ? <PinnedPeekWidgets data={data} ids={config.pinned} /> : (
            <div className="flex flex-col gap-2.5">
              {[0, 1].map(i => <div key={i} className="h-[72px] rounded-2xl bg-white/10 animate-pulse" />)}
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-between px-4 pb-2 pt-2 lg:pt-4">
          <h1 className="font-display text-xl font-bold text-stone-800 lg:text-white">Dashboard</h1>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setEditMode(v => !v)}
              title={editMode ? 'Fine modifica' : 'Personalizza questa scheda'}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                editMode ? 'bg-forest-600 text-white' : 'bg-white border border-stone-200 text-forest-700 lg:bg-white/10 lg:border-white/20 lg:text-white'
              }`}
            >
              {editMode ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setDesktopOpen(false)}
              title="Riduci a icona"
              aria-label="Riduci a icona"
              className="hidden lg:flex w-9 h-9 rounded-full items-center justify-center bg-white/10 border border-white/20 text-white transition-colors hover:bg-white/20"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-2 overflow-x-auto px-4 pb-3" style={{ scrollbarWidth: 'none' }}>
          {config.tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setActiveTabId(t.id); setEditMode(false) }}
              className={`shrink-0 px-4 py-2 rounded-full font-barlow text-xs font-bold tracking-wide transition-colors ${
                t.id === activeTab.id ? 'bg-forest-600 text-white shadow-sm' : 'bg-white border border-stone-200 text-stone-500 lg:bg-white/10 lg:border-white/20 lg:text-white/75'
              }`}
            >
              {t.label}
            </button>
          ))}
          {creatingTab ? (
            <div className="shrink-0 flex items-center gap-1.5 bg-white border border-stone-200 rounded-full pl-3 pr-1.5 py-1 lg:bg-white/10 lg:border-white/20">
              <input
                autoFocus value={newTabName} onChange={e => setNewTabName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createTab(); if (e.key === 'Escape') { setCreatingTab(false); setNewTabName('') } }}
                placeholder="Nome scheda"
                className="w-24 text-xs outline-none bg-transparent lg:text-white lg:placeholder:text-white/40"
              />
              <button onClick={createTab} className="w-6 h-6 rounded-full bg-forest-600 text-white flex items-center justify-center shrink-0"><Check className="w-3 h-3" /></button>
            </div>
          ) : (
            <button
              onClick={() => setCreatingTab(true)}
              className="shrink-0 w-9 h-9 rounded-full border-[1.5px] border-dashed border-stone-300 text-stone-400 flex items-center justify-center lg:border-white/30 lg:text-white/50"
              title="Nuova scheda"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {editMode && (
          <div className="shrink-0 mx-4 mb-3 p-3.5 rounded-2xl bg-white border border-stone-200 flex items-center gap-2.5 lg:bg-white/10 lg:border-white/15">
            {renaming ? (
              <input
                autoFocus defaultValue={activeTab.label}
                onBlur={e => { updateActiveTab({ label: e.target.value }); setRenaming(false) }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className="flex-1 text-sm border border-stone-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-forest-400 lg:bg-white/10 lg:border-white/20 lg:text-white"
              />
            ) : (
              <button onClick={() => setRenaming(true)} className="flex-1 text-left text-sm font-semibold text-stone-700 lg:text-white">
                Rinomina «{activeTab.label}»
              </button>
            )}
            {config.tabs.length > 1 && (
              <button onClick={deleteActiveTab} className="text-xs font-semibold text-red-600 shrink-0 lg:text-red-400">Elimina scheda</button>
            )}
          </div>
        )}

        {editMode && (
          <div className="shrink-0 mx-4 mb-3 p-3.5 rounded-2xl bg-white border border-stone-200 lg:bg-white/10 lg:border-white/15">
            <div className="font-barlow text-[10px] font-bold uppercase tracking-[1.5px] text-stone-400 lg:text-white/55 mb-2">Sempre visibili sulla mappa</div>
            <div className="flex gap-2">
              {Array.from({ length: MAX_PINNED }, (_, slot) => {
                const id = config.pinned[slot]
                const entry = id ? WIDGET_BY_ID[id] : null
                return (
                  <div key={slot} className="flex-1 min-w-0 flex items-stretch gap-1">
                    <button
                      onClick={() => { setPinSlot(slot); setPickerOpen(true) }}
                      className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-stone-300 text-left lg:border-white/30"
                    >
                      {entry ? <entry.icon className="w-4 h-4 shrink-0 text-forest-700 lg:text-white/80" /> : <Plus className="w-4 h-4 shrink-0 text-stone-400 lg:text-white/50" />}
                      <span className="truncate text-[12.5px] font-semibold text-stone-700 lg:text-white">{entry ? entry.label : 'Scegli'}</span>
                    </button>
                    {entry && (
                      <button onClick={() => setPinned(slot, null)} aria-label={`Togli ${entry.label} dai fissati`}
                        className="w-9 shrink-0 rounded-xl border border-stone-200 flex items-center justify-center text-stone-400 lg:border-white/20 lg:text-white/60">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 pb-8">
          <div className="flex flex-col gap-3">
            {activeTab.widgetIds.length === 0 && !editMode && (
              <div className="text-center py-14">
                <p className="font-lora italic text-sm text-stone-400 mb-3 lg:text-white/50">Questa scheda è vuota.</p>
                <button onClick={() => setEditMode(true)} className="text-sm font-semibold text-forest-700 lg:text-white">Aggiungi qualche widget →</button>
              </div>
            )}

            {activeTab.widgetIds.map((id, i) => {
              const entry = WIDGET_BY_ID[id]
              if (!entry) return null
              const { Component } = entry
              return (
                <div key={id} className="relative">
                  <Component data={data} />
                  {editMode && (
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <button onClick={() => moveWidget(i, -1)} disabled={i === 0}
                        className="w-6 h-6 rounded-full bg-white shadow border border-stone-200 flex items-center justify-center text-stone-500 disabled:opacity-30">
                        <ChevronUp className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => moveWidget(i, 1)} disabled={i === activeTab.widgetIds.length - 1}
                        className="w-6 h-6 rounded-full bg-white shadow border border-stone-200 flex items-center justify-center text-stone-500 disabled:opacity-30">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => removeWidget(id)}
                        className="w-6 h-6 rounded-full bg-white shadow border border-red-200 flex items-center justify-center text-red-500">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

            {editMode && (
              <button
                onClick={() => setPickerOpen(true)}
                className="flex items-center justify-center gap-2 py-4 rounded-2xl border-[1.5px] border-dashed border-stone-300 text-stone-500 text-sm font-semibold lg:border-white/30 lg:text-white/60"
              >
                <Plus className="w-4 h-4" /> Aggiungi widget
              </button>
            )}
          </div>
        </div>
      </div>

      {pickerOpen && (
        <div className="fixed inset-0 z-50 bg-[#0b1a24] flex flex-col">
          <div className="shrink-0 flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top,0px)+14px)] pb-3 border-b border-white/10">
            <h2 className="font-display text-base font-bold text-white">{pinSlot != null ? 'Scegli il widget da tenere sempre visibile' : 'Aggiungi widget'}</h2>
            <button onClick={() => { setPickerOpen(false); setPinSlot(null) }} aria-label="Chiudi" className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
            {availableToAdd.length === 0 ? (
              <p className="text-center text-white/50 text-sm mt-10">Hai già tutti i widget disponibili su questa scheda.</p>
            ) : WIDGET_CATEGORIES.map(cat => {
              const items = availableToAdd.filter(w => w.category === cat)
              if (items.length === 0) return null
              return (
                <section key={cat} className="mt-5">
                  <h3 className="font-barlow text-[11px] font-bold uppercase tracking-[1.5px] text-white/45 mb-1">{cat}</h3>
                  {items.map(w => (
                    <button
                      key={w.id}
                      onClick={() => (pinSlot != null ? setPinned(pinSlot, w.id) : addWidget(w.id))}
                      className="w-full flex items-center gap-3.5 py-3 border-b border-white/10 text-left"
                    >
                      <div className="w-11 h-11 rounded-xl shrink-0 bg-white/5 flex items-center justify-center">
                        <w.icon className="w-5 h-5 text-white/70" />
                      </div>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14px] font-medium text-white">{w.label}</span>
                        {w.description && <span className="block text-[11.5px] leading-snug text-white/50 mt-0.5">{w.description}</span>}
                      </span>
                      <Plus className="w-4 h-4 text-forest-400 shrink-0" />
                    </button>
                  ))}
                </section>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
