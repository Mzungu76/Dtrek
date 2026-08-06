'use client'

/**
 * components/video/VideoStudio.tsx — il percorso sotto tutto, gli strumenti al bordo.
 *
 * Sostituisce il wizard a cinque passi, e poi la sua prima disposizione (mappa in una fascia, due
 * linguette e un cassetto sotto). Quella disposizione aveva un difetto misurabile: sul telefono la
 * mappa stava a un quarto dello schermo e il resto era prosa — istruzioni, avviso di affollamento,
 * descrizione del gruppo — con DUE livelli di linguette da attraversare prima di arrivare a un
 * comando. Si regolava un video guardando tutto tranne il video.
 *
 * Qui la mappa è il fondo, a pieno schermo, e non viene MAI ridimensionata: tutto il resto le
 * galleggia sopra e al più la copre in parte. Gli strumenti sono una colonnina di icone sul bordo
 * destro — dove il pollice arriva senza spostare la presa — e la scheda di ciascuno si apre
 * accanto, stretta e alta al massimo tre quinti, così che la fascia bassa del percorso resti
 * sempre visibile mentre si regola. Le spiegazioni non stanno più nel flusso: ogni comando che ne
 * ha una porta un «?», e il testo compare solo se lo si chiede.
 *
 * Le icone sono vere (GROUP_ICON, lucide) e non più i caratteri unicode di prima: su Android quei
 * caratteri cadevano spesso su un ripiego generico del font, illeggibile come simbolo. Otto gruppi
 * in tutto (erano fino a tredici — vedi i commenti di merge in RouteMap3D.tsx), ordinati SETUP
 * prima e CONTENUTI dopo: si decide prima il contenitore del video (formato, ritmo, mappa,
 * schermo, effetti), poi cosa ci si mette sopra (momenti, foto, contenuti aggiuntivi) — nella
 * colonnina dall'alto in basso, sullo schermo largo nei due binari.
 *
 * Su schermo largo la colonnina si apre da sola nei due binari già in uso: a SINISTRA ciò che si
 * posa in un punto del percorso, a DESTRA ciò che vale per tutto il video. Verde per il posizionale,
 * terra per il globale — la distinzione più difficile da spiegare a parole, quindi la si fa vedere.
 *
 * I controlli arrivano descritti come dati (lib/videoStudio.ts): qui c'è solo il layout e il modo
 * di disegnarli.
 */

import { useState, type ReactNode } from 'react'
import {
  X, Play, HelpCircle, Circle,
  Milestone, Image, BookOpen, Clapperboard, Gauge, Map, LayoutDashboard, Wand2,
} from 'lucide-react'
import { visibleGroups, type StudioControl, type StudioGroup, type StudioBudgetPart } from '@/lib/videoStudio'

type Rail = 'route' | 'global'

// Un'icona vera per gruppo, non più il carattere unicode di prima (◎ ▭ ⛰ …): su Android quei
// caratteri cadevano spesso su un ripiego generico del font — un rombo, un triangolo indistinto —
// che non diceva nulla di cosa il gruppo facesse. Chiave = id del gruppo (vedi RouteMap3D.tsx),
// non `glyph`: `glyph` resta nei dati solo come slug stabile, il disegno vive tutto qui.
const GROUP_ICON: Record<string, typeof Circle> = {
  momenti: Milestone, foto: Image, contenuti: BookOpen,
  video: Clapperboard, ritmo: Gauge, mappa: Map, schermo: LayoutDashboard, effetti: Wand2,
}
function GroupIcon({ id, className }: { id: string; className?: string }) {
  const Icon = GROUP_ICON[id] ?? Circle
  return <Icon className={className} />
}

interface Props {
  title: string
  onClose: () => void
  /** La mappa Leaflet col percorso e i pallini trascinabili: sta sotto tutto, a pieno schermo. */
  mapSlot: ReactNode
  positionalGroups: StudioGroup[]
  globalGroups: StudioGroup[]
  budget: { parts: StudioBudgetPart[]; totalSec: number; totalLabel: string; over: boolean }
  /** Contenuto del cassetto finale: riepilogo e pulsanti di avvio. */
  generatePanel: ReactNode
  error?: string
  onDismissError?: () => void
}

// ── Spiegazione a richiesta ──────────────────────────────────────────────────
// Il «?» esiste perché ogni riga di aiuto sempre visibile costa due righe di schermo a un comando
// che ne occupa una: sommate, erano più alte della mappa.

function Hint({ text, accent }: { text: string; accent: Rail }) {
  const [open, setOpen] = useState(false)
  const tint = accent === 'route' ? 'text-forest-600' : 'text-terra-600'
  return (
    <>
      <button onClick={() => setOpen(o => !o)} aria-label="Spiegazione" aria-expanded={open}
        className={`shrink-0 align-middle transition-colors ${open ? tint : 'text-stone-400 hover:text-stone-600'}`}>
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {open && (
        <p className="basis-full mt-1 text-stone-600 text-[11px] leading-relaxed bg-stone-100 rounded-lg px-2.5 py-1.5">
          {text}
        </p>
      )}
    </>
  )
}

/** Riga «etichetta + eventuale ?»: il ? sta sempre in fondo al titolo, mai in mezzo al comando. */
function LabelRow({ label, hint, accent }: { label: string; hint?: string; accent: Rail }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-2">
      <p className="text-stone-500 text-[10px] font-bold tracking-[0.12em]">{label.toUpperCase()}</p>
      {hint && <Hint text={hint} accent={accent} />}
    </div>
  )
}

// ── Disegno di un singolo controllo ──────────────────────────────────────────

function ControlView({ c, accent }: { c: StudioControl; accent: Rail }) {
  const onColor = accent === 'route' ? 'bg-forest-600' : 'bg-terra-600'
  const onRing  = accent === 'route' ? 'border-forest-500 bg-forest-50' : 'border-terra-500 bg-terra-50'
  const onText  = accent === 'route' ? 'text-forest-700' : 'text-terra-700'

  switch (c.kind) {
    case 'note':
      return (
        <p className={`text-[11px] leading-relaxed ${
          c.tone === 'warn'
            ? 'text-terra-800 bg-terra-50 border border-terra-200 rounded-lg px-2.5 py-1.5'
            : 'text-stone-500'}`}>
          {c.text}
        </p>
      )

    case 'cards':
      return (
        <div>
          {c.label && <LabelRow label={c.label} hint={c.hint} accent={accent} />}
          <div className="space-y-1.5">
            {c.options.map(o => (
              <button key={o.value} onClick={() => c.onPick(o.value)} disabled={o.disabled}
                className={`w-full text-left rounded-xl px-3 py-2.5 border transition-colors disabled:opacity-40 ${
                  c.value === o.value ? onRing : 'bg-stone-100 border-transparent hover:bg-stone-200'}`}>
                <p className={`text-[13px] font-bold ${c.value === o.value ? onText : 'text-stone-900'}`}>{o.label}</p>
                {o.sub && <p className="text-stone-500 text-[11px] mt-0.5 leading-snug">{o.sub}</p>}
              </button>
            ))}
          </div>
          {!c.label && c.hint && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5"><Hint text={c.hint} accent={accent} /></div>
          )}
        </div>
      )

    case 'segmented':
      return (
        <div>
          {c.label && <LabelRow label={c.label} hint={c.hint} accent={accent} />}
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${c.columns ?? Math.min(3, c.options.length)}, minmax(0,1fr))` }}>
            {c.options.map(o => (
              <button key={o.value} onClick={() => c.onPick(o.value)} disabled={o.disabled}
                className={`py-2 px-1.5 rounded-lg flex flex-col items-center gap-0.5 transition-colors disabled:opacity-30 ${
                  c.value === o.value ? `${onColor} text-white` : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}>
                {o.color && <span className="w-3.5 h-3.5 rounded-full mb-0.5 ring-1 ring-black/10" style={{ background: o.color }} />}
                <span className="text-[11px] font-bold leading-none">{o.label}</span>
                {o.sub && <span className="text-[9px] opacity-70 leading-none mt-0.5">{o.sub}</span>}
              </button>
            ))}
          </div>
          {!c.label && c.hint && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5"><Hint text={c.hint} accent={accent} /></div>
          )}
        </div>
      )

    case 'toggle':
      return (
        <div className={c.disabled ? 'opacity-45' : ''}>
          <div className="flex flex-wrap items-start gap-x-1.5">
            <label className={`flex items-start gap-2 flex-1 min-w-0 ${c.disabled ? '' : 'cursor-pointer'}`}>
              <input type="checkbox" checked={c.value} disabled={c.disabled}
                onChange={e => c.onToggle(e.target.checked)}
                className={`w-4 h-4 mt-0.5 shrink-0 ${accent === 'route' ? 'accent-forest-600' : 'accent-terra-600'}`} />
              <span className="text-stone-900 text-[12px] font-semibold leading-snug min-w-0">{c.label}</span>
            </label>
            {(c.disabled && c.disabledReason)
              ? <span className="basis-full text-stone-500 text-[10px] pl-6 mt-0.5">{c.disabledReason}</span>
              : c.hint && <Hint text={c.hint} accent={accent} />}
          </div>
        </div>
      )

    case 'slider':
      return (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-stone-500 text-[11px] shrink-0 min-w-[4.5rem]">{c.label}</span>
          <input type="range" min={c.min} max={c.max} step={c.step} value={c.value}
            onChange={e => c.onChange(+e.target.value)}
            className={`flex-1 min-w-[6rem] h-1 rounded-full cursor-pointer ${accent === 'route' ? 'accent-forest-600' : 'accent-terra-600'}`} />
          <span className="text-stone-900 text-[11px] font-bold font-mono tabular-nums shrink-0 text-right min-w-[3.4rem]">{c.display}</span>
          {c.hint && <Hint text={c.hint} accent={accent} />}
        </div>
      )

    case 'chips':
      return (
        <div>
          {c.label && <LabelRow label={c.label} hint={c.hint} accent={accent} />}
          <div className="flex flex-wrap items-center gap-1.5">
            {c.options.map(o => (
              <button key={o.id} onClick={() => o.onToggle(!o.value)} disabled={o.disabled}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-35 ${
                  o.value ? `${onColor} text-white` : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
                {o.label}
              </button>
            ))}
            {!c.label && c.hint && <Hint text={c.hint} accent={accent} />}
          </div>
        </div>
      )

    case 'custom':
      return (
        <div>
          {c.label && <LabelRow label={c.label} hint={c.hint} accent={accent} />}
          {c.render() as ReactNode}
          {!c.label && c.hint && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5"><Hint text={c.hint} accent={accent} /></div>
          )}
        </div>
      )
  }
}

function GroupView({ g, accent }: { g: StudioGroup; accent: Rail }) {
  return (
    <div className="space-y-3.5">
      {g.controls.map(c => <ControlView key={c.id} c={c} accent={accent} />)}
    </div>
  )
}

// ── Studio ───────────────────────────────────────────────────────────────────

export default function VideoStudio({
  title, onClose, mapSlot, positionalGroups, globalGroups, budget, generatePanel, error, onDismissError,
}: Props) {
  const routeGroups = visibleGroups(positionalGroups)
  const settingGroups = visibleGroups(globalGroups)

  // Una sola colonnina: prima le funzioni di SETUP del video (formato, ritmo, mappa, schermo,
  // effetti — terra), poi quelle che riguardano i CONTENUTI che ci si posano sopra (momenti, foto,
  // contenuti — verde), separati da una riga. Si decide prima il contenitore, poi cosa ci va
  // dentro: è l'ordine in cui le scelte dipendono l'una dall'altra, non un'abitudine visiva.
  // `null` = nessuna scheda aperta, cioè mappa intera.
  const railTools: { group: StudioGroup; rail: Rail }[] = [
    ...settingGroups.map(g => ({ group: g, rail: 'global' as Rail })),
    ...routeGroups.map(g => ({ group: g, rail: 'route' as Rail })),
  ]
  const [openToolId, setOpenToolId] = useState<string | null>(null)
  const [showGenerate, setShowGenerate] = useState(false)

  const openTool = railTools.find(t => t.group.id === openToolId) ?? null

  const DurationBar = (
    <div className="flex items-center gap-3 min-w-0">
      <div className="min-w-0 flex-1">
        <div className="flex h-1.5 rounded-full overflow-hidden bg-stone-200">
          {budget.parts.map(p => (
            <div key={p.key} title={`${p.label}: ${Math.round(p.sec)}s`}
              style={{ width: `${(p.sec / Math.max(1, budget.totalSec)) * 100}%`, background: p.color }} />
          ))}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5">
          {budget.parts.map(p => (
            <span key={p.key} className="flex items-center gap-1 text-[9.5px] text-stone-500">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} />
              {p.label} <span className="font-mono tabular-nums">{Math.round(p.sec)}s</span>
            </span>
          ))}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-stone-500 text-[9px] font-bold tracking-[0.12em] leading-none">DURATA</p>
        <p className={`text-lg font-black font-mono tabular-nums leading-none mt-0.5 ${budget.over ? 'text-terra-600' : 'text-stone-900'}`}>
          {budget.totalLabel}
        </p>
      </div>
    </div>
  )

  const RailHeader = ({ rail }: { rail: Rail }) => (
    <div className="flex items-center gap-2 mb-3">
      <span className={`w-2 h-2 rounded-full ${rail === 'route' ? 'bg-forest-600' : 'bg-terra-600'}`} />
      <p className={`text-[10px] font-bold tracking-[0.14em] ${rail === 'route' ? 'text-forest-700' : 'text-terra-700'}`}>
        {rail === 'route' ? 'SUL PERCORSO' : 'TUTTO IL VIDEO'}
      </p>
    </div>
  )

  return (
    <div className="fixed inset-0 z-30 bg-stone-50 flex flex-col pointer-events-auto">

      {/* Intestazione */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-stone-200 bg-white">
        <div className="min-w-0 flex-1">
          <p className="text-terra-600 text-[9px] font-bold tracking-[0.16em]">STUDIO VIDEO</p>
          <h2 className="text-stone-900 font-display font-bold text-sm leading-tight truncate">{title}</h2>
        </div>
        <button onClick={() => setShowGenerate(true)}
          className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-forest-600 hover:bg-forest-700 text-white text-[12px] font-bold transition-colors">
          <Play className="w-3.5 h-3.5" /> Genera
        </button>
        <button onClick={onClose} className="shrink-0 text-stone-500 hover:text-stone-900" aria-label="Chiudi lo studio">
          <X className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="shrink-0 mx-4 mt-2.5 rounded-xl bg-red-50 border border-red-300 px-3.5 py-2.5 flex items-start gap-2.5">
          <span className="text-red-600 text-sm leading-none mt-0.5">⚠</span>
          <p className="text-red-800 text-[12px] leading-relaxed flex-1">{error}</p>
          {onDismissError && <button onClick={onDismissError} className="text-red-400 hover:text-red-700 shrink-0"><X className="w-4 h-4" /></button>}
        </div>
      )}

      {/* ── Schermo largo: binario · mappa · binario ─────────────────────────── */}
      <div className="hidden lg:grid flex-1 min-h-0" style={{ gridTemplateColumns: '272px minmax(0,1fr) 304px' }}>

        <aside className="min-h-0 overflow-y-auto border-r border-stone-200 bg-white px-4 py-4 space-y-6">
          <div className="sticky -top-4 -mt-4 pt-4 pb-1 bg-white z-10"><RailHeader rail="route" /></div>
          {routeGroups.map(g => (
            <section key={g.id}>
              <p className="text-stone-700 text-[11px] font-bold mb-2.5 flex items-center gap-1.5">
                <GroupIcon id={g.id} className="w-3.5 h-3.5 text-stone-400" />{g.label}
              </p>
              <GroupView g={g} accent="route" />
            </section>
          ))}
        </aside>

        <main className="min-h-0 flex flex-col bg-stone-100">
          <div className="flex-1 min-h-0">{mapSlot}</div>
          <div className="shrink-0 px-4 py-2.5 border-t border-stone-200 bg-white">{DurationBar}</div>
        </main>

        <aside className="min-h-0 overflow-y-auto border-l border-stone-200 bg-white px-4 py-4 space-y-6">
          <div className="sticky -top-4 -mt-4 pt-4 pb-1 bg-white z-10"><RailHeader rail="global" /></div>
          {settingGroups.map(g => (
            <section key={g.id}>
              <p className="text-stone-700 text-[11px] font-bold mb-2.5 flex items-center gap-1.5">
                <GroupIcon id={g.id} className="w-3.5 h-3.5 text-stone-400" />{g.label}
              </p>
              <GroupView g={g} accent="global" />
            </section>
          ))}
        </aside>
      </div>

      {/* ── Telefono e tablet: mappa piena, strumenti al bordo ───────────────── */}
      <div className="lg:hidden relative flex-1 min-h-0">
        {/* La mappa non viene mai ridimensionata: sta sotto, intera, e le schede la coprono in parte. */}
        <div className="absolute inset-0 z-0">{mapSlot}</div>

        {/* Colonnina degli strumenti, sul bordo destro */}
        <div className="absolute right-2 top-2 bottom-2 z-20 flex flex-col items-end justify-start gap-1.5 overflow-y-auto">
          {railTools.map(({ group, rail }, i) => {
            const active = openToolId === group.id
            const prevRail = railTools[i - 1]?.rail
            return (
              <div key={group.id} className="flex flex-col items-end gap-1.5">
                {prevRail && prevRail !== rail && <span className="w-6 h-px bg-stone-300 my-0.5" />}
                <button onClick={() => setOpenToolId(active ? null : group.id)}
                  title={group.label} aria-label={group.label} aria-pressed={active}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-sm border transition-colors ${
                    active
                      ? (rail === 'route' ? 'bg-forest-600 border-forest-700 text-white' : 'bg-terra-600 border-terra-700 text-white')
                      : 'bg-white/95 border-stone-200 text-stone-600 hover:bg-white'}`}>
                  <GroupIcon id={group.id} className="w-[18px] h-[18px]" />
                </button>
              </div>
            )
          })}
        </div>

        {/* Scheda dello strumento aperto: stretta, accanto alla colonnina */}
        {openTool && (
          <div className="absolute right-16 top-2 z-20 w-[min(20rem,calc(100vw-5.5rem))] max-h-[60%] flex flex-col
                          bg-white rounded-2xl border border-stone-200 shadow-xl overflow-hidden">
            <div className="shrink-0 flex items-center gap-2 px-3.5 py-2.5 border-b border-stone-200">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${openTool.rail === 'route' ? 'bg-forest-600' : 'bg-terra-600'}`} />
              <p className="text-stone-900 text-[12px] font-bold flex-1 min-w-0 truncate">{openTool.group.label}</p>
              <button onClick={() => setOpenToolId(null)} className="text-stone-400 hover:text-stone-800 shrink-0" aria-label="Chiudi la scheda">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-3.5 py-3">
              <GroupView g={openTool.group} accent={openTool.rail} />
            </div>
          </div>
        )}

        {/* Durata: fascia sottile in fondo, sopra la mappa */}
        {/* left-14 lascia libero l'angolo dove la mappa tiene i pulsanti dello zoom. */}
        <div className="absolute left-14 right-16 bottom-2 z-10 rounded-2xl bg-white/92 backdrop-blur-sm border border-stone-200 shadow-sm px-3.5 py-2">
          {DurationBar}
        </div>
      </div>

      {/* ── Cassetto finale: riepilogo e avvio ───────────────────────────────── */}
      {showGenerate && (
        <div className="absolute inset-0 z-40 bg-stone-900/40 backdrop-blur-sm flex items-end sm:items-center sm:justify-center"
          onClick={() => setShowGenerate(false)}>
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[88vh] flex flex-col"
            onClick={e => e.stopPropagation()}>
            <div className="shrink-0 flex items-center justify-between px-5 pt-4 pb-3 border-b border-stone-200">
              <div>
                <p className="text-terra-600 text-[9px] font-bold tracking-[0.16em]">PRIMA DI GENERARE</p>
                <h3 className="text-stone-900 font-display font-bold text-base leading-tight">Riepilogo</h3>
              </div>
              <button onClick={() => setShowGenerate(false)} className="text-stone-400 hover:text-stone-900"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-5">{generatePanel}</div>
          </div>
        </div>
      )}
    </div>
  )
}
