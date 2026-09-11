'use client'
import { useEffect, useState } from 'react'
import { Pencil, Plus, X, ChevronUp, ChevronDown, Loader2, Check } from 'lucide-react'
import HubNavBar from '@/components/routehub/HubNavBar'
import { useDashboardData } from '@/components/dashboard/useDashboardData'
import { WIDGET_CATALOG, WIDGET_BY_ID } from '@/components/dashboard/widgets'
import {
  normalizeDashboardConfig, DEFAULT_DASHBOARD_CONFIG, DEFAULT_TAB_ID,
  type DashboardConfig, type DashboardTab, type DashboardWidgetId,
} from '@/lib/dashboardConfig'

// Bacheca come dashboard personalizzabile (Direzione C, docs/mockup-bacheca-dashboard/README.md):
// l'utente crea le proprie schede e sceglie quali widget mettere in ciascuna — non più la galleria
// fotografica a schermo intero di prima. Stile chiaro a card della app (non l'hero scuro di
// RouteHub: quello resta per Guida/Resoconto/Diari), riordino con frecce su/giù invece di
// drag&drop (stessa scelta già fatta per le Raccolte, niente @dnd-kit).
export default function BachecaPage() {
  const { data, loading: dataLoading } = useDashboardData()

  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_DASHBOARD_CONFIG)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [activeTabId, setActiveTabId] = useState(DEFAULT_TAB_ID)
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

  if (dataLoading || !configLoaded) {
    return (
      <div className="min-h-screen bg-stone-50">
        <HubNavBar />
        <div className="flex items-center justify-center py-32 text-stone-400 gap-3">
          <Loader2 className="w-6 h-6 animate-spin" /><span>Caricamento…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <HubNavBar />

      <div className="max-w-2xl mx-auto px-4 sm:px-8 pt-5">
        <div className="flex items-center justify-between mb-4">
          <h1 className="font-display text-2xl font-bold text-stone-800">Dashboard</h1>
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

        {/* Schede personalizzabili */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3.5 -mx-4 px-4 sm:mx-0 sm:px-0" style={{ scrollbarWidth: 'none' }}>
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
          <div className="mb-4 p-3.5 rounded-2xl bg-white border border-stone-200 flex items-center gap-2.5">
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

        {/* Widget della scheda */}
        <div className="flex flex-col gap-3 pb-10">
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
    </div>
  )
}
