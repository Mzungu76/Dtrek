'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Globe2, Layers, Loader2, Lock, Plus } from 'lucide-react'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import type { CollectionSummary } from '@/app/api/collections/route'

// Elenco delle Raccolte — ogni Diario ne appartiene sempre a una (il suo scaffale, vedi
// supabase/migrations/merge_shelves_into_collections.sql), quindi questa pagina non è mai
// realmente vuota una volta che l'utente ha almeno un Diario. Composizione (rinomina, Diari
// contenuti, eliminazione) in /raccolte/[id].
export default function RaccolteListPage() {
  const router = useRouter()
  const [collections, setCollections] = useState<CollectionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  function load() {
    fetch('/api/collections')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setCollections)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
  }

  useEffect(() => { load() }, [])

  async function createCollection() {
    setCreating(true); setError(null)
    try {
      const res = await fetch('/api/collections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`)
      router.push(`/raccolte/${encodeURIComponent(data.id)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setCreating(false)
    }
  }

  return (
    <div className={`min-h-screen bg-stone-50 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 sm:px-8 pb-16">
        <Link href="/diario" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-700 mt-2 mb-4 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Diari
        </Link>

        <div className="flex items-center justify-between mb-5">
          <h1 className="font-display text-2xl font-bold text-stone-800">Raccolte</h1>
          <button onClick={createCollection} disabled={creating}
            className="inline-flex items-center gap-1.5 bg-forest-600 hover:bg-forest-700 text-white text-sm font-medium px-3.5 py-2 rounded-xl transition-colors disabled:opacity-60">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Nuova raccolta
          </button>
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        {collections === null ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-stone-400" /></div>
        ) : collections.length === 0 ? (
          <p className="text-sm text-stone-400 italic py-6 text-center">Nessuna raccolta ancora.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {collections.map(c => (
              <Link key={c.id} href={`/raccolte/${encodeURIComponent(c.id)}`}
                className="flex items-center gap-3 bg-white border border-stone-200 hover:border-stone-300 rounded-2xl px-4 py-3.5 transition-colors">
                <div className="flex shrink-0">
                  {Array.from({ length: Math.min(3, Math.max(1, c.volumeCount)) }).map((_, i) => (
                    <div key={i} className="w-6 h-8 rounded-[4px] -mr-2.5 last:mr-0"
                      style={{
                        background: i % 2 === 0 ? 'linear-gradient(160deg,#8cc894,#277134)' : 'linear-gradient(160deg,#e9ab64,#9f4315)',
                        transform: `rotate(${i % 2 === 0 ? -6 : 4}deg)`,
                      }} />
                  ))}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold text-stone-800 truncate">{c.title}</p>
                  <p className="text-xs text-stone-400 mt-0.5 flex items-center gap-1.5">
                    <span>{c.volumeCount} diari</span> · <span>{c.reportageCount} resoconti</span>
                    {c.isPublished
                      ? <span className="inline-flex items-center gap-1 text-forest-600"><Globe2 className="w-3 h-3" /> pubblicata</span>
                      : <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> bozza</span>}
                  </p>
                </div>
                <Layers className="w-4 h-4 text-stone-300 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
