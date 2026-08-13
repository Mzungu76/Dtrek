'use client'
import { useEffect, useState } from 'react'
import { Gift, ChevronUp, ChevronDown, Loader2, Check } from 'lucide-react'
import { ITALIAN_REGIONS } from '@/lib/italianRegions'

interface Props {
  hikeId: string
}

/**
 * Strumento owner-only per marcare un percorso come "master" del percorso omaggio di una regione
 * (docs/navigator-dtrek-boundary.md) — un pulsante fluttuante indipendente invece di un pezzo dentro
 * GuidaHub.tsx (già molto composto): lo vede solo l'account owner, non fa parte del disegno che
 * vede chiunque altro, quindi non deve integrarsi nel layout della pagina.
 */
export default function GiftRouteAdminToggle({ hikeId }: Props) {
  const [isOwner, setIsOwner] = useState(false)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isSample, setIsSample] = useState(false)
  const [region, setRegion] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const ent = await fetch('/api/dtrek-entitlement').then(r => r.ok ? r.json() : null)
        if (!ent?.isOwner) { setLoading(false); return }
        setIsOwner(true)
        const status = await fetch(`/api/gift-route/mark?hikeId=${encodeURIComponent(hikeId)}`).then(r => r.ok ? r.json() : null)
        if (status) {
          setIsSample(!!status.isSample)
          setRegion(status.sampleRegion ?? '')
        }
      } catch {}
      setLoading(false)
    }
    load()
  }, [hikeId])

  async function save(nextIsSample: boolean) {
    if (nextIsSample && !region) return
    setSaving(true)
    try {
      const res = await fetch('/api/gift-route/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hikeId, isSample: nextIsSample, region: nextIsSample ? region : undefined }),
      })
      if (res.ok) setIsSample(nextIsSample)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !isOwner) return null

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <div className="bg-white rounded-2xl shadow-lg border border-amber-200 overflow-hidden">
        <button
          onClick={() => setOpen(v => !v)}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-50 transition-colors"
        >
          <Gift className="w-4 h-4" />
          {isSample ? `Omaggio · ${ITALIAN_REGIONS.find(r => r.slug === region)?.name ?? region}` : 'Percorso omaggio'}
          {open ? <ChevronDown className="w-3.5 h-3.5 ml-auto" /> : <ChevronUp className="w-3.5 h-3.5 ml-auto" />}
        </button>

        {open && (
          <div className="px-4 pb-4 pt-1 border-t border-amber-100 space-y-2.5 w-64">
            <select
              value={region}
              onChange={e => setRegion(e.target.value)}
              disabled={saving}
              className="w-full text-sm border border-stone-300 rounded-lg px-2.5 py-2 bg-white"
            >
              <option value="">Scegli una regione…</option>
              {ITALIAN_REGIONS.map(r => (
                <option key={r.slug} value={r.slug}>{r.name}</option>
              ))}
            </select>

            {isSample ? (
              <button
                onClick={() => save(false)}
                disabled={saving}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-700 text-sm font-medium transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Rimuovi come omaggio
              </button>
            ) : (
              <button
                onClick={() => save(true)}
                disabled={saving || !region}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Imposta come omaggio
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
