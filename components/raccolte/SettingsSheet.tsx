'use client'
// Pannello "impostazioni" per una riga dell'albero /raccolte — un solo punto d'ingresso per
// pubblicazione + "cosa mostrare sul sito" a ognuno dei 3 livelli (Raccolta/Diario/Reportage),
// raggiunto dall'icona a ingranaggio di RaccoltaSection.tsx invece che da pagine separate (il
// pannello del Diario viveva solo dentro app/diario/libro/[id], introvabile da qui).
//
// Cascata delle impostazioni "Mostra sul sito" (le 5 di DiaryPublicSections):
//  - Raccolta: quando impostate, VINCONO su quelle di ogni Diario membro (letto al momento della
//    pubblicazione, non copiato nei Diari — supabase/migrations/add_collections_config.sql). Finché
//    non le si tocca mai, ogni Diario resta autonomo (comportamento di sempre).
//  - Diario: si applicano a tutti i suoi Reportage (comportamento di sempre, mai cambiato).
//  - Reportage: le sue proprie DiaryReportExtras (mappa/statistiche/grafico/cuore/velocità) contano
//    SOLO per lui, in aggiunta (non al posto di) alle impostazioni del Diario/Raccolta — "il più
//    restrittivo vince", vedi components/leggi/PublicReportPage.tsx.
import { useEffect, useState } from 'react'
import { X, Copy, ExternalLink, Link2Off, Loader2, Share2 } from 'lucide-react'
import { PublishPrivacyToggles } from '@/components/PublishPrivacyToggles'
import {
  DEFAULT_DIARY_CONFIG, resolveReportExtras,
  type DiaryConfig, type DiaryPublicSections, type DiaryReportExtras,
} from '@/lib/diaryConfig'

function SheetShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end" onClick={onClose}>
      <div className="w-full bg-white rounded-t-[24px] shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="shrink-0 flex items-center justify-between px-4 pt-4 pb-3 border-b border-stone-100">
          <h2 className="font-display text-base font-bold text-stone-800 truncate pr-3">{title}</h2>
          <button onClick={onClose} aria-label="Chiudi" className="shrink-0 w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-500">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  )
}

/** Blocco pubblica/copia/revoca — stesso contratto UX ovunque nell'app (garantisci un token con
 *  PATCH, ruotalo/rimuovilo con DELETE), qui parametrizzato sulle 3 rotte diverse invece di
 *  duplicare il blocco 3 volte. */
function PublishBlock({ token, publicPathPrefix, publishLabel, publishDescription, onPublish, onRevoke }: {
  token: string | null
  publicPathPrefix: string
  publishLabel: string
  publishDescription: string
  onPublish: () => Promise<void>
  onRevoke: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [copyOk, setCopyOk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const publicUrl = token && typeof window !== 'undefined' ? `${window.location.origin}${publicPathPrefix}${token}` : ''

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null)
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  return (
    <div>
      <p className="font-barlow font-bold uppercase tracking-widest text-[11px] text-stone-400 mb-2">Pubblicazione</p>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      {token ? (
        <div className="flex flex-col gap-2">
          <a href={publicUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-stone-100 text-stone-700 hover:bg-stone-200 transition-colors">
            <ExternalLink className="w-3.5 h-3.5" /> Apri
          </a>
          <button
            onClick={async () => { await navigator.clipboard.writeText(publicUrl); setCopyOk(true); setTimeout(() => setCopyOk(false), 2000) }}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-white bg-forest-600 hover:bg-forest-700 transition-colors">
            <Copy className="w-3.5 h-3.5" /> {copyOk ? 'Copiato!' : 'Copia link'}
          </button>
          <button onClick={() => run(onRevoke)} disabled={busy}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60 transition-colors">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2Off className="w-3.5 h-3.5" />} Rimuovi link
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-stone-500 mb-2.5">{publishDescription}</p>
          <button onClick={() => run(onPublish)} disabled={busy}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wide text-white bg-forest-600 hover:bg-forest-700 disabled:opacity-60 transition-colors">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />} {publishLabel}
          </button>
        </>
      )}
    </div>
  )
}

const PUBLIC_SECTIONS_LABELS: [keyof DiaryPublicSections, string][] = [
  ['racconto', 'Racconti'],
  ['foto', 'Fotografie'],
  ['percorso', 'Mappe dei percorsi'],
  ['statistiche', 'Numeri complessivi'],
  ['grafici', 'Grafici (quota, battito, velocità)'],
]

function PublicSectionsCheckboxes({ value, onChange }: {
  value: DiaryPublicSections
  onChange: (patch: Partial<DiaryPublicSections>) => void
}) {
  return (
    <div className="space-y-1">
      {PUBLIC_SECTIONS_LABELS.map(([key, label]) => (
        <label key={key} className="flex items-center gap-2 py-0.5 text-xs text-stone-600 cursor-pointer">
          <input type="checkbox" checked={value[key]} onChange={e => onChange({ [key]: e.target.checked })} />
          {label}
        </label>
      ))}
    </div>
  )
}

const REPORT_EXTRAS_LABELS: [keyof DiaryReportExtras, string][] = [
  ['mappa', 'Mappa percorso'],
  ['statistiche', 'Statistiche'],
  ['grafico', 'Profilo altimetrico'],
  ['cuore', 'Frequenza cardiaca'],
  ['velocita', 'Velocità'],
]

// ── Raccolta ─────────────────────────────────────────────────────────────────────────────────

export function RaccoltaSettingsSheet({ raccoltaId, title, onClose, onPublishChange }: {
  raccoltaId: string
  title: string
  onClose: () => void
  onPublishChange: (published: boolean) => void
}) {
  const [token, setToken] = useState<string | null>(null)
  // undefined = ancora in caricamento, null = nessuna impostazione a livello di Raccolta.
  const [publicSections, setPublicSections] = useState<DiaryPublicSections | null | undefined>(undefined)

  useEffect(() => {
    fetch(`/api/collections/${raccoltaId}/token`).then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setToken(d.shareToken)).catch(() => {})
    fetch(`/api/collections/${raccoltaId}/config`).then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setPublicSections(d.publicSections)).catch(() => setPublicSections(null))
  }, [raccoltaId])

  async function patchSections(patch: Partial<DiaryPublicSections> | null) {
    setPublicSections(patch === null ? null : { ...(publicSections ?? DEFAULT_DIARY_CONFIG.publicSections), ...patch }) // ottimistico
    const res = await fetch(`/api/collections/${raccoltaId}/config`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ publicSections: patch }),
    })
    if (res.ok) setPublicSections((await res.json()).publicSections)
  }

  return (
    <SheetShell title={title} onClose={onClose}>
      <PublishBlock
        token={token} publicPathPrefix="/leggi/c/" publishLabel="Pubblica online"
        publishDescription="Pubblica una pagina web con tutti i Diari di questa raccolta, leggibile da chiunque abbia il link."
        onPublish={async () => {
          const res = await fetch(`/api/collections/${raccoltaId}/token`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
          if (!res.ok) throw new Error('Pubblicazione non riuscita')
          setToken((await res.json()).shareToken); onPublishChange(true)
        }}
        onRevoke={async () => {
          const res = await fetch(`/api/collections/${raccoltaId}/token`, { method: 'DELETE' })
          if (!res.ok) throw new Error('Operazione non riuscita')
          setToken(null); onPublishChange(false)
        }}
      />

      <div className="pt-4 mt-4 border-t border-stone-100">
        <p className="font-barlow font-bold uppercase tracking-widest text-[11px] text-stone-400 mb-1.5">Mostra sul sito</p>
        {publicSections === undefined ? (
          <p className="text-xs text-stone-400">Caricamento…</p>
        ) : publicSections === null ? (
          <>
            <p className="text-xs text-stone-500 mb-2">Ogni Diario di questa Raccolta decide da sé cosa mostrare sul sito.</p>
            <button onClick={() => patchSections(DEFAULT_DIARY_CONFIG.publicSections)}
              className="text-xs font-bold uppercase tracking-wide text-forest-600 hover:text-forest-700">
              Imposta per tutta la Raccolta
            </button>
          </>
        ) : (
          <>
            <p className="text-[11px] text-stone-400 mb-2 leading-relaxed">
              Valgono per tutti i Diari di questa Raccolta — e quindi per i loro Reportage — al posto delle impostazioni di ciascun Diario.
            </p>
            <PublicSectionsCheckboxes value={publicSections} onChange={patchSections} />
            <button onClick={() => patchSections(null)} className="mt-2.5 text-xs text-stone-400 hover:text-stone-600 underline">
              Lascia decidere a ogni Diario
            </button>
          </>
        )}
      </div>

      <div className="pt-4 mt-4 border-t border-stone-100">
        <p className="font-barlow font-bold uppercase tracking-widest text-[11px] text-stone-400 mb-1.5">Privacy (vale per tutto quello che pubblichi)</p>
        <PublishPrivacyToggles />
      </div>
    </SheetShell>
  )
}

// ── Diario ───────────────────────────────────────────────────────────────────────────────────

export function DiarioSettingsSheet({ diarioId, title, onClose, onPublishChange }: {
  diarioId: string
  title: string
  onClose: () => void
  onPublishChange: (published: boolean) => void
}) {
  const [token, setToken] = useState<string | null>(null)
  const [config, setConfig] = useState<DiaryConfig | null>(null)

  useEffect(() => {
    fetch(`/api/diaries/${diarioId}/token`).then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setToken(d.diary_token)).catch(() => {})
    fetch(`/api/diaries/${diarioId}/config`).then(r => r.ok ? r.json() : Promise.reject())
      .then(setConfig).catch(() => {})
  }, [diarioId])

  async function patchSections(patch: Partial<DiaryPublicSections>) {
    if (!config) return
    const next: DiaryConfig = { ...config, publicSections: { ...config.publicSections, ...patch } }
    setConfig(next) // ottimistico
    await fetch(`/api/diaries/${diarioId}/config`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
  }

  return (
    <SheetShell title={title} onClose={onClose}>
      <PublishBlock
        token={token} publicPathPrefix="/leggi/d/" publishLabel="Pubblica online"
        publishDescription="Crea una pagina pubblica del diario, leggibile da telefono senza scaricare nulla."
        onPublish={async () => {
          const res = await fetch(`/api/diaries/${diarioId}/token`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
          if (!res.ok) throw new Error('Pubblicazione non riuscita')
          setToken((await res.json()).diary_token); onPublishChange(true)
        }}
        onRevoke={async () => {
          const res = await fetch(`/api/diaries/${diarioId}/token`, { method: 'DELETE' })
          if (!res.ok) throw new Error('Operazione non riuscita')
          setToken(null); onPublishChange(false)
        }}
      />

      <div className="pt-4 mt-4 border-t border-stone-100">
        <p className="font-barlow font-bold uppercase tracking-widest text-[11px] text-stone-400 mb-1.5">Mostra sul sito</p>
        {!config ? <p className="text-xs text-stone-400">Caricamento…</p> : (
          <PublicSectionsCheckboxes value={config.publicSections} onChange={patchSections} />
        )}
      </div>

      <div className="pt-4 mt-4 border-t border-stone-100">
        <p className="font-barlow font-bold uppercase tracking-widest text-[11px] text-stone-400 mb-1.5">Privacy (vale per tutto quello che pubblichi)</p>
        <PublishPrivacyToggles />
      </div>
    </SheetShell>
  )
}

// ── Reportage ────────────────────────────────────────────────────────────────────────────────

export function ReportageSettingsSheet({ activityId, diarioId, title, onClose, onPublishChange }: {
  activityId: string
  /** Diario a cui appartiene — le sue DiaryReportExtras vivono lì (reportExtrasByActivity),
   *  esattamente come nel libro privato: nessun concetto nuovo, solo raggiungibile da qui. */
  diarioId: string
  title: string
  onClose: () => void
  onPublishChange: (published: boolean) => void
}) {
  const [token, setToken] = useState<string | null>(null)
  const [config, setConfig] = useState<DiaryConfig | null>(null)

  useEffect(() => {
    fetch(`/api/share-report?activityId=${encodeURIComponent(activityId)}`).then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setToken(d.share_token)).catch(() => {})
    fetch(`/api/diaries/${diarioId}/config`).then(r => r.ok ? r.json() : Promise.reject())
      .then(setConfig).catch(() => {})
  }, [activityId, diarioId])

  const extras: DiaryReportExtras = config ? resolveReportExtras(config, activityId) : DEFAULT_DIARY_CONFIG.reportExtrasDefault
  const excluded = config?.excludedActivityIds.includes(activityId) ?? false

  async function patchExtras(patch: Partial<DiaryReportExtras>) {
    if (!config) return
    const next: DiaryConfig = {
      ...config,
      reportExtrasByActivity: { ...config.reportExtrasByActivity, [activityId]: { ...config.reportExtrasByActivity[activityId], ...patch } },
    }
    setConfig(next)
    await fetch(`/api/diaries/${diarioId}/config`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
  }

  async function toggleExcluded() {
    if (!config) return
    const set = new Set(config.excludedActivityIds)
    excluded ? set.delete(activityId) : set.add(activityId)
    const next: DiaryConfig = { ...config, excludedActivityIds: Array.from(set) }
    setConfig(next)
    await fetch(`/api/diaries/${diarioId}/config`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
  }

  return (
    <SheetShell title={title} onClose={onClose}>
      <PublishBlock
        token={token} publicPathPrefix="/leggi/p/" publishLabel="Pubblica online"
        publishDescription="Pubblica questo Reportage come pagina a sé, leggibile da chiunque abbia il link."
        onPublish={async () => {
          const res = await fetch('/api/share-report', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ activityId }) })
          if (!res.ok) throw new Error('Pubblicazione non riuscita')
          setToken((await res.json()).share_token); onPublishChange(true)
        }}
        onRevoke={async () => {
          const res = await fetch(`/api/share-report?activityId=${encodeURIComponent(activityId)}`, { method: 'DELETE' })
          if (!res.ok) throw new Error('Operazione non riuscita')
          setToken(null); onPublishChange(false)
        }}
      />

      <div className="pt-4 mt-4 border-t border-stone-100">
        <label className="flex items-center gap-2 py-0.5 text-xs text-stone-600 cursor-pointer">
          <input type="checkbox" checked={!excluded} disabled={!config} onChange={toggleExcluded} />
          Mostra questo Reportage nel Diario pubblico
        </label>
      </div>

      <div className="pt-4 mt-4 border-t border-stone-100">
        <p className="font-barlow font-bold uppercase tracking-widest text-[11px] text-stone-400 mb-1.5">Mostra per questo Reportage</p>
        {!config ? <p className="text-xs text-stone-400">Caricamento…</p> : (
          <div className="space-y-1">
            {REPORT_EXTRAS_LABELS.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 py-0.5 text-xs text-stone-600 cursor-pointer">
                <input type="checkbox" checked={extras[key]} onChange={e => patchExtras({ [key]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>
        )}
      </div>
    </SheetShell>
  )
}
