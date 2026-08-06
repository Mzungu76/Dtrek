'use client'

/**
 * components/video/VideoStudio.tsx — il percorso al centro, i comandi attorno.
 *
 * Sostituisce il wizard a cinque passi. Quello chiedeva di ricordare, fra un passo e l'altro, dove
 * cadevano le cose decise prima: si accendeva uno stacco al passo 4 senza vedere che sarebbe finito
 * sopra una foto scelta al passo 3, ed è esattamente così che nascevano le sovrapposizioni. Qui la
 * mappa non si perde mai di vista, e ogni comando ha un effetto visibile nel momento in cui lo si
 * tocca.
 *
 * Due binari, e la divisione non è di comodo: a SINISTRA ciò che si posa in un punto del percorso
 * (stacchi, foto, didascalie), a DESTRA ciò che vale per tutto il video (formato, ritmo, effetti).
 * È la distinzione più difficile da spiegare a parole in questo strumento, quindi la si fa vedere
 * invece di spiegarla — verde per il posizionale, terra per il globale, e la posizione sullo
 * schermo che ripete la stessa cosa.
 *
 * Su telefono i due binari diventano i due sommari di un cassetto che sale dal basso: la logica non
 * cambia, cambia solo quanto se ne vede per volta. Era il motivo per cui questa disposizione è
 * stata scelta fra le tre proposte — le altre due, collassando, perdevano il proprio senso.
 *
 * I controlli arrivano descritti come dati (lib/videoStudio.ts): qui c'è solo il layout e il modo
 * di disegnarli.
 */

import { useState, type ReactNode } from 'react'
import { X, Play, ChevronUp } from 'lucide-react'
import { visibleGroups, type StudioControl, type StudioGroup, type StudioBudgetPart } from '@/lib/videoStudio'

type Rail = 'route' | 'global'

interface Props {
  title: string
  onClose: () => void
  /** La mappa Leaflet col percorso e i pallini trascinabili. */
  mapSlot: ReactNode
  positionalGroups: StudioGroup[]
  globalGroups: StudioGroup[]
  budget: { parts: StudioBudgetPart[]; totalSec: number; totalLabel: string; over: boolean }
  /** Contenuto del cassetto finale: riepilogo e pulsanti di avvio. */
  generatePanel: ReactNode
  error?: string
  onDismissError?: () => void
}

// ── Disegno di un singolo controllo ──────────────────────────────────────────

function ControlView({ c, accent }: { c: StudioControl; accent: 'route' | 'global' }) {
  const onColor = accent === 'route' ? 'bg-forest-500' : 'bg-terra-500'
  const onRing  = accent === 'route' ? 'border-forest-400/60 bg-forest-500/20' : 'border-terra-400/60 bg-terra-500/20'
  const onText  = accent === 'route' ? 'text-forest-300' : 'text-terra-300'

  switch (c.kind) {
    case 'note':
      return (
        <p className={`text-[11px] leading-relaxed ${c.tone === 'warn' ? 'text-amber-300/90' : 'text-white/35'}`}>
          {c.text}
        </p>
      )

    case 'cards':
      return (
        <div>
          {c.label && <p className="text-white/45 text-[10px] font-bold tracking-[0.12em] mb-2">{c.label.toUpperCase()}</p>}
          <div className="space-y-2">
            {c.options.map(o => (
              <button key={o.value} onClick={() => c.onPick(o.value)} disabled={o.disabled}
                className={`w-full text-left rounded-xl px-3 py-2.5 border transition-colors disabled:opacity-40 ${
                  c.value === o.value ? onRing : 'bg-white/7 border-transparent hover:bg-white/10'}`}>
                <p className={`text-[13px] font-bold ${c.value === o.value ? onText : 'text-white'}`}>{o.label}</p>
                {o.sub && <p className="text-white/45 text-[11px] mt-0.5 leading-snug">{o.sub}</p>}
              </button>
            ))}
          </div>
          {c.hint && <p className="text-white/30 text-[11px] mt-1.5 leading-relaxed">{c.hint}</p>}
        </div>
      )

    case 'segmented':
      return (
        <div>
          {c.label && <p className="text-white/45 text-[10px] font-bold tracking-[0.12em] mb-2">{c.label.toUpperCase()}</p>}
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${c.columns ?? Math.min(3, c.options.length)}, minmax(0,1fr))` }}>
            {c.options.map(o => (
              <button key={o.value} onClick={() => c.onPick(o.value)} disabled={o.disabled}
                className={`py-2 px-1.5 rounded-lg flex flex-col items-center gap-0.5 transition-colors disabled:opacity-30 ${
                  c.value === o.value ? `${onColor} text-white` : 'bg-white/10 text-white/70 hover:bg-white/18'}`}>
                {o.color && <span className="w-3.5 h-3.5 rounded-full mb-0.5" style={{ background: o.color }} />}
                <span className="text-[11px] font-bold leading-none">{o.label}</span>
                {o.sub && <span className="text-[9px] opacity-65 leading-none mt-0.5">{o.sub}</span>}
              </button>
            ))}
          </div>
          {c.hint && <p className="text-white/30 text-[11px] mt-1.5 leading-relaxed">{c.hint}</p>}
        </div>
      )

    case 'toggle':
      return (
        <div className={c.disabled ? 'opacity-40' : ''}>
          <label className={`flex items-start gap-2 ${c.disabled ? '' : 'cursor-pointer'}`}>
            <input type="checkbox" checked={c.value} disabled={c.disabled}
              onChange={e => c.onToggle(e.target.checked)}
              className={`w-4 h-4 mt-0.5 shrink-0 ${accent === 'route' ? 'accent-forest-500' : 'accent-terra-500'}`} />
            <span className="min-w-0">
              <span className="text-white text-[12px] font-semibold block leading-snug">{c.label}</span>
              {(c.disabled && c.disabledReason)
                ? <span className="text-white/35 text-[10px] block mt-0.5">{c.disabledReason}</span>
                : c.hint && <span className="text-white/30 text-[11px] block mt-0.5 leading-relaxed">{c.hint}</span>}
            </span>
          </label>
        </div>
      )

    case 'slider':
      return (
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-white/50 text-[11px] shrink-0 min-w-[4.5rem]">{c.label}</span>
            <input type="range" min={c.min} max={c.max} step={c.step} value={c.value}
              onChange={e => c.onChange(+e.target.value)}
              className={`flex-1 h-1 rounded-full cursor-pointer ${accent === 'route' ? 'accent-forest-400' : 'accent-terra-400'}`} />
            <span className="text-white text-[11px] font-bold tabular-nums shrink-0 text-right min-w-[3.4rem]">{c.display}</span>
          </div>
          {c.hint && <p className="text-white/30 text-[11px] mt-1 leading-relaxed">{c.hint}</p>}
        </div>
      )

    case 'chips':
      return (
        <div>
          {c.label && <p className="text-white/45 text-[10px] font-bold tracking-[0.12em] mb-2">{c.label.toUpperCase()}</p>}
          <div className="flex flex-wrap gap-1.5">
            {c.options.map(o => (
              <button key={o.id} onClick={() => o.onToggle(!o.value)} disabled={o.disabled}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-30 ${
                  o.value ? `${onColor} text-white` : 'bg-white/10 text-white/60 hover:bg-white/18'}`}>
                {o.label}
              </button>
            ))}
          </div>
          {c.hint && <p className="text-white/30 text-[11px] mt-1.5 leading-relaxed">{c.hint}</p>}
        </div>
      )

    case 'custom':
      return (
        <div>
          {c.label && <p className="text-white/45 text-[10px] font-bold tracking-[0.12em] mb-2">{c.label.toUpperCase()}</p>}
          {c.render() as ReactNode}
          {c.hint && <p className="text-white/30 text-[11px] mt-1.5 leading-relaxed">{c.hint}</p>}
        </div>
      )
  }
}

function GroupView({ g, accent }: { g: StudioGroup; accent: Rail }) {
  return (
    <div className="space-y-3.5">
      {g.controls.map(c => (
        <ControlView key={c.id} c={c} accent={accent === 'route' ? 'route' : 'global'} />
      ))}
    </div>
  )
}

// ── Studio ───────────────────────────────────────────────────────────────────

export default function VideoStudio({
  title, onClose, mapSlot, positionalGroups, globalGroups, budget, generatePanel, error, onDismissError,
}: Props) {
  const routeGroups = visibleGroups(positionalGroups)
  const settingGroups = visibleGroups(globalGroups)

  // Su schermo largo i binari mostrano tutti i gruppi uno sotto l'altro; su telefono uno per volta.
  const [mobileRail, setMobileRail] = useState<Rail>('route')
  const [mobileGroupId, setMobileGroupId] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(true)
  const [showGenerate, setShowGenerate] = useState(false)

  const mobileGroups = mobileRail === 'route' ? routeGroups : settingGroups
  const activeGroup = mobileGroups.find(g => g.id === mobileGroupId) ?? mobileGroups[0]

  const DurationBar = (
    <div className="flex items-center gap-3 min-w-0">
      <div className="min-w-0 flex-1">
        <div className="flex h-1.5 rounded-full overflow-hidden bg-white/10">
          {budget.parts.map(p => (
            <div key={p.key} title={`${p.label}: ${Math.round(p.sec)}s`}
              style={{ width: `${(p.sec / Math.max(1, budget.totalSec)) * 100}%`, background: p.color }} />
          ))}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5">
          {budget.parts.map(p => (
            <span key={p.key} className="flex items-center gap-1 text-[9.5px] text-white/40">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} />
              {p.label} {Math.round(p.sec)}s
            </span>
          ))}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-white/40 text-[9px] font-bold tracking-[0.12em] leading-none">DURATA</p>
        <p className={`text-lg font-black tabular-nums leading-none mt-0.5 ${budget.over ? 'text-terra-300' : 'text-white'}`}>
          {budget.totalLabel}
        </p>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-30 bg-stone-950 flex flex-col pointer-events-auto">

      {/* Intestazione */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-white/10">
        <div className="min-w-0 flex-1">
          <p className="text-terra-400 text-[9px] font-bold tracking-[0.16em]">STUDIO VIDEO</p>
          <h2 className="text-white font-bold text-sm leading-tight truncate">{title}</h2>
        </div>
        <button onClick={() => setShowGenerate(true)}
          className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-forest-500 hover:bg-forest-400 text-white text-[12px] font-bold transition-colors">
          <Play className="w-3.5 h-3.5" /> Genera
        </button>
        <button onClick={onClose} className="shrink-0 text-white/45 hover:text-white"><X className="w-5 h-5" /></button>
      </div>

      {error && (
        <div className="shrink-0 mx-4 mt-2.5 rounded-xl bg-red-500/12 border border-red-400/40 px-3.5 py-2.5 flex items-start gap-2.5">
          <span className="text-red-300 text-sm leading-none mt-0.5">⚠</span>
          <p className="text-red-100 text-[12px] leading-relaxed flex-1">{error}</p>
          {onDismissError && <button onClick={onDismissError} className="text-red-200/60 hover:text-red-100 shrink-0"><X className="w-4 h-4" /></button>}
        </div>
      )}

      {/* ── Schermo largo: binario · mappa · binario ─────────────────────────── */}
      <div className="hidden lg:grid flex-1 min-h-0" style={{ gridTemplateColumns: '272px minmax(0,1fr) 304px' }}>

        <aside className="min-h-0 overflow-y-auto border-r border-white/10 px-4 py-4 space-y-6">
          <div className="flex items-center gap-2 sticky -top-4 -mt-4 pt-4 pb-2 bg-stone-950 z-10">
            <span className="w-2 h-2 rounded-full bg-forest-500" />
            <p className="text-forest-300 text-[10px] font-bold tracking-[0.14em]">SUL PERCORSO</p>
          </div>
          {routeGroups.map(g => (
            <section key={g.id}>
              <p className="text-white/60 text-[11px] font-bold mb-2.5 flex items-center gap-1.5">
                <span className="text-white/35">{g.glyph}</span>{g.label}
              </p>
              <GroupView g={g} accent="route" />
            </section>
          ))}
        </aside>

        <main className="min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 p-3">{mapSlot}</div>
          <div className="shrink-0 px-4 py-2.5 border-t border-white/10">{DurationBar}</div>
        </main>

        <aside className="min-h-0 overflow-y-auto border-l border-white/10 px-4 py-4 space-y-6">
          <div className="flex items-center gap-2 sticky -top-4 -mt-4 pt-4 pb-2 bg-stone-950 z-10">
            <span className="w-2 h-2 rounded-full bg-terra-500" />
            <p className="text-terra-300 text-[10px] font-bold tracking-[0.14em]">TUTTO IL VIDEO</p>
          </div>
          {settingGroups.map(g => (
            <section key={g.id}>
              <p className="text-white/60 text-[11px] font-bold mb-2.5 flex items-center gap-1.5">
                <span className="text-white/35">{g.glyph}</span>{g.label}
              </p>
              <GroupView g={g} accent="global" />
            </section>
          ))}
        </aside>
      </div>

      {/* ── Telefono: mappa piena, cassetto dal basso ────────────────────────── */}
      <div className="lg:hidden flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 p-2">{mapSlot}</div>

        <div className="shrink-0 bg-stone-900 border-t border-white/10 rounded-t-2xl">
          <div className="px-4 pt-2.5 pb-2">{DurationBar}</div>

          <div className="px-3 pb-2 flex items-center gap-2">
            <div className="flex-1 grid grid-cols-2 gap-1.5">
              {(['route', 'global'] as Rail[]).map(r => (
                <button key={r} onClick={() => { setMobileRail(r); setMobileGroupId(null); setSheetOpen(true) }}
                  className={`py-2 rounded-lg text-[11px] font-bold transition-colors ${
                    mobileRail === r && sheetOpen
                      ? (r === 'route' ? 'bg-forest-500 text-white' : 'bg-terra-500 text-white')
                      : 'bg-white/10 text-white/60 hover:bg-white/18'}`}>
                  {r === 'route' ? 'Sul percorso' : 'Tutto il video'}
                </button>
              ))}
            </div>
            <button onClick={() => setSheetOpen(o => !o)}
              className="shrink-0 w-9 h-9 rounded-lg bg-white/10 text-white/60 hover:bg-white/18 flex items-center justify-center"
              aria-label={sheetOpen ? 'Chiudi i comandi' : 'Apri i comandi'}>
              <ChevronUp className={`w-4 h-4 transition-transform ${sheetOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {sheetOpen && (
            <div className="max-h-[42vh] overflow-y-auto px-4 pb-4">
              <div className="flex gap-1.5 overflow-x-auto pb-2.5 -mx-1 px-1">
                {mobileGroups.map(g => (
                  <button key={g.id} onClick={() => setMobileGroupId(g.id)}
                    className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors ${
                      activeGroup?.id === g.id ? 'bg-white/22 text-white' : 'bg-white/8 text-white/55 hover:bg-white/14'}`}>
                    <span className="opacity-50 mr-1">{g.glyph}</span>{g.label}
                  </button>
                ))}
              </div>
              {activeGroup && <GroupView g={activeGroup} accent={mobileRail} />}
            </div>
          )}
        </div>
      </div>

      {/* ── Cassetto finale: riepilogo e avvio ───────────────────────────────── */}
      {showGenerate && (
        <div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-end sm:items-center sm:justify-center"
          onClick={() => setShowGenerate(false)}>
          <div className="w-full sm:max-w-lg bg-stone-900 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[88vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="shrink-0 flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/10">
              <div>
                <p className="text-terra-400 text-[9px] font-bold tracking-[0.16em]">PRIMA DI GENERARE</p>
                <h3 className="text-white font-bold text-base leading-tight">Riepilogo</h3>
              </div>
              <button onClick={() => setShowGenerate(false)} className="text-white/45 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-5">{generatePanel}</div>
          </div>
        </div>
      )}
    </div>
  )
}
