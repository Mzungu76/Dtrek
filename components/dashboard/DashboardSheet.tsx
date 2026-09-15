'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { Pencil, Plus, X, ChevronUp, ChevronDown, Check } from 'lucide-react'
import HubNavBar from '@/components/routehub/HubNavBar'
import { WIDGET_CATALOG, WIDGET_BY_ID } from '@/components/dashboard/widgets'
import {
  normalizeDashboardConfig, DEFAULT_DASHBOARD_CONFIG, DEFAULT_TAB_ID,
  type DashboardConfig, type DashboardTab, type DashboardWidgetId,
} from '@/lib/dashboardConfig'
import { wmoInfo } from '@/lib/openmeteo'
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

/** Le 2 "chiavi" fisse mostrate nel pannello a scomparsa (peek), indipendenti dalle schede
 *  personalizzabili sotto — stesso principio del mockup (docs/mockup-dashboard-hero/
 *  DirezioneE.dc.html): Recovery e Prossima uscita restano sempre visibili sull'hero, il resto (il
 *  catalogo widget completo, con le sue schede) si raggiunge trascinando verso l'alto. */
function PeekWidgets({ data }: { data: DashboardData }) {
  const next = data.nextOuting
  const weatherIcon = next?.weather ? wmoInfo(next.weather.weathercode) : null
  return (
    <div className="flex gap-2.5">
      <div className="flex-1 rounded-2xl bg-white/14 backdrop-blur-md border border-white/20 p-3.5">
        <div className="flex items-center gap-2.5">
          <GlassRing value={data.recovery.score} color={data.recovery.color} />
          <div className="min-w-0">
            <div className="font-barlow text-[10px] font-bold tracking-wide uppercase text-white/65">Recovery</div>
            <div className="text-[11px] text-white/85 mt-0.5 truncate">{data.recovery.label}</div>
          </div>
        </div>
      </div>
      <div className="flex-1 rounded-2xl bg-white/14 backdrop-blur-md border border-white/20 p-3.5 min-w-0">
        <div className="font-barlow text-[10px] font-bold tracking-wide uppercase text-white/65 mb-1">Prossima uscita</div>
        {data.nextOutingLoading ? (
          <div className="text-[11px] text-white/60">Caricamento…</div>
        ) : next ? (
          <Link href={`/guida/${encodeURIComponent(next.id)}`} className="block">
            <div className="font-display font-semibold text-[13px] text-white truncate">{next.title}</div>
            <div className="text-[10px] text-white/65 mt-0.5">
              {format(new Date(next.plannedDate), 'EEE d MMM', { locale: it })}
              {next.weather && weatherIcon && ` · ${weatherIcon.emoji} ${Math.round(next.weather.tempMax)}°`}
            </div>
          </Link>
        ) : (
          <p className="font-lora italic text-[11px] text-white/55 leading-snug">Nessuna uscita in programma</p>
        )}
      </div>
    </div>
  )
}

/** Le stesse 2 "chiavi" del peek mobile (Recovery/Prossima uscita), ma nella versione già pronta
 *  per uno sfondo chiaro: da lg in su il pannello è un riquadro bianco fisso, non più un foglio
 *  sopra la mappa scura, quindi qui si riusano i widget del catalogo (WIDGET_BY_ID) invece dello
 *  stile "vetro" di PeekWidgets sopra, pensato apposta per stare sopra la mappa. */
function PinnedPeekWidgets({ data }: { data: DashboardData }) {
  const RecoveryC = WIDGET_BY_ID.recovery.Component
  const NextOutingC = WIDGET_BY_ID['prossima-uscita'].Component
  return (
    <>
      <RecoveryC data={data} />
      <NextOutingC data={data} />
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
  const [editMode, setEditMode] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
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
    saveConfig({ tabs: config.tabs.map(t => t.id === activeTab.id ? { ...t, ...patch } : t) })
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

  function createTab() {
    const label = newTabName.trim()
    if (!label) return
    const tab: DashboardTab = { id: crypto.randomUUID(), label, widgetIds: [] }
    saveConfig({ tabs: [...config.tabs, tab] })
    setActiveTabId(tab.id)
    setCreatingTab(false); setNewTabName('')
    setEditMode(true)
  }

  function deleteActiveTab() {
    if (config.tabs.length <= 1) return
    const remaining = config.tabs.filter(t => t.id !== activeTab.id)
    saveConfig({ tabs: remaining })
    setActiveTabId(remaining[0].id)
    setEditMode(false)
  }

  const availableToAdd = WIDGET_CATALOG.filter(w => !activeTab.widgetIds.includes(w.id))

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
        {configLoaded ? <PeekWidgets data={data} /> : (
          <div className="flex gap-2.5">
            {[0, 1].map(i => <div key={i} className="flex-1 h-[72px] rounded-2xl bg-white/10 animate-pulse" />)}
          </div>
        )}
        {/* Barra di navigazione, spostata qui in fondo (sotto il pannello widget e la freccetta
            di scorrimento) — stesso posizionamento di HubNavBar in RouteHub.tsx per Guida/
            Reportage/Diari, solo montata direttamente qui perché la Dashboard non passa da
            RouteHub. -mx-4 per farla toccare i bordi (il contenitore ha px-4). */}
        <div className="-mx-4">
          <HubNavBar />
        </div>
      </div>

      {/* ── Pannello: sotto lg un foglio trascinabile (stessa logica di sempre); da lg in su un
          riquadro fisso a destra, sempre aperto — niente maniglia da trascinare, niente peek
          separato: le due "chiavi" del peek (Recovery/Prossima uscita) restano in cima anche
          qui, sopra le schede. Il catalogo di widget/schede sotto non cambia. ── */}
      <div
        className={`fixed inset-x-0 bottom-0 z-30 bg-stone-50 rounded-t-[26px] shadow-2xl flex flex-col
          transition-transform duration-300 ease-out top-[calc(env(safe-area-inset-top,0px)+64px)]
          ${open ? 'translate-y-0' : 'translate-y-full'}
          lg:translate-y-0 lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[420px]
          lg:rounded-t-none lg:rounded-l-2xl lg:shadow-none lg:border-l lg:border-stone-200`}
      >
        <button
          onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}
          aria-label="Chiudi" className="shrink-0 flex flex-col items-center pt-2.5 pb-1 touch-none select-none lg:hidden"
        >
          <div className="w-9 h-1.5 rounded-full bg-stone-300" />
        </button>

        <div className="hidden lg:flex flex-col gap-2.5 px-4 pt-4">
          {configLoaded ? <PinnedPeekWidgets data={data} /> : (
            <div className="flex flex-col gap-2.5">
              {[0, 1].map(i => <div key={i} className="h-[72px] rounded-2xl bg-stone-100 animate-pulse" />)}
            </div>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-between px-4 pb-2 pt-2 lg:pt-4">
          <h1 className="font-display text-xl font-bold text-stone-800">Dashboard</h1>
          <button
            onClick={() => setEditMode(v => !v)}
            title={editMode ? 'Fine modifica' : 'Personalizza questa scheda'}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
              editMode ? 'bg-forest-600 text-white' : 'bg-white border border-stone-200 text-forest-700'
            }`}
          >
            {editMode ? <Check className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          </button>
        </div>

        <div className="shrink-0 flex items-center gap-2 overflow-x-auto px-4 pb-3" style={{ scrollbarWidth: 'none' }}>
          {config.tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setActiveTabId(t.id); setEditMode(false) }}
              className={`shrink-0 px-4 py-2 rounded-full font-barlow text-xs font-bold tracking-wide transition-colors ${
                t.id === activeTab.id ? 'bg-forest-600 text-white shadow-sm' : 'bg-white border border-stone-200 text-stone-500'
              }`}
            >
              {t.label}
            </button>
          ))}
          {creatingTab ? (
            <div className="shrink-0 flex items-center gap-1.5 bg-white border border-stone-200 rounded-full pl-3 pr-1.5 py-1">
              <input
                autoFocus value={newTabName} onChange={e => setNewTabName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createTab(); if (e.key === 'Escape') { setCreatingTab(false); setNewTabName('') } }}
                placeholder="Nome scheda"
                className="w-24 text-xs outline-none bg-transparent"
              />
              <button onClick={createTab} className="w-6 h-6 rounded-full bg-forest-600 text-white flex items-center justify-center shrink-0"><Check className="w-3 h-3" /></button>
            </div>
          ) : (
            <button
              onClick={() => setCreatingTab(true)}
              className="shrink-0 w-9 h-9 rounded-full border-[1.5px] border-dashed border-stone-300 text-stone-400 flex items-center justify-center"
              title="Nuova scheda"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>

        {editMode && (
          <div className="shrink-0 mx-4 mb-3 p-3.5 rounded-2xl bg-white border border-stone-200 flex items-center gap-2.5">
            {renaming ? (
              <input
                autoFocus defaultValue={activeTab.label}
                onBlur={e => { updateActiveTab({ label: e.target.value }); setRenaming(false) }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                className="flex-1 text-sm border border-stone-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-forest-400"
              />
            ) : (
              <button onClick={() => setRenaming(true)} className="flex-1 text-left text-sm font-semibold text-stone-700">
                Rinomina «{activeTab.label}»
              </button>
            )}
            {config.tabs.length > 1 && (
              <button onClick={deleteActiveTab} className="text-xs font-semibold text-red-600 shrink-0">Elimina scheda</button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 pb-8">
          <div className="flex flex-col gap-3">
            {activeTab.widgetIds.length === 0 && !editMode && (
              <div className="text-center py-14">
                <p className="font-lora italic text-sm text-stone-400 mb-3">Questa scheda è vuota.</p>
                <button onClick={() => setEditMode(true)} className="text-sm font-semibold text-forest-700">Aggiungi qualche widget →</button>
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
                className="flex items-center justify-center gap-2 py-4 rounded-2xl border-[1.5px] border-dashed border-stone-300 text-stone-500 text-sm font-semibold"
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
            <h2 className="font-display text-base font-bold text-white">Aggiungi widget</h2>
            <button onClick={() => setPickerOpen(false)} aria-label="Chiudi" className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)]">
            {availableToAdd.length === 0 ? (
              <p className="text-center text-white/50 text-sm mt-10">Hai già tutti i widget disponibili su questa scheda.</p>
            ) : availableToAdd.map(w => (
              <button
                key={w.id}
                onClick={() => addWidget(w.id)}
                className="w-full flex items-center gap-3.5 py-3 border-b border-white/10 text-left"
              >
                <div className="w-11 h-11 rounded-xl shrink-0 bg-white/5 flex items-center justify-center">
                  <w.icon className="w-5 h-5 text-white/70" />
                </div>
                <span className="flex-1 text-[14px] font-medium text-white">{w.label}</span>
                <Plus className="w-4 h-4 text-forest-400 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
