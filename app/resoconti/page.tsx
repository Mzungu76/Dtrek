'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import { formatDuration } from '@/lib/tcxParser'
import {
  ScrollText, Share2, Copy, Link2Off, FileDown, Loader2, ArrowRight, Mountain, Clock, Route,
} from 'lucide-react'

interface DiaryReport {
  id: string
  activity_id: string
  title: string
  content: string
  created_at: string
  share_token: string | null
  activity: {
    id: string
    title: string
    start_time: string
    distance_meters: number
    total_time_seconds: number
    elevation_gain: number
  } | null
}

function excerpt(content: string, maxLen = 280): string {
  const plain = content
    .replace(/^## .+$/gm, '')
    .replace(/\[curiosita\][\s\S]*?\[\/curiosita\]/g, '')
    .replace(/\n+/g, ' ')
    .trim()
  return plain.length > maxLen ? plain.slice(0, maxLen).trimEnd() + '…' : plain
}

export default function ResocontiPage() {
  const router = useRouter()
  const [reports,    setReports]    = useState<DiaryReport[]>([])
  const [loading,    setLoading]    = useState(true)
  const [diaryToken, setDiaryToken] = useState<string | null>(null)
  const [copyOk,     setCopyOk]     = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/resoconto?all=true').then(r => r.ok ? r.json() : []),
      fetch('/api/diary-token').then(r => r.ok ? r.json() : { diary_token: null }),
    ]).then(([reps, dt]) => {
      setReports(Array.isArray(reps) ? reps : [])
      setDiaryToken((dt as { diary_token?: string | null }).diary_token ?? null)
    }).finally(() => setLoading(false))
  }, [])

  async function generateDiaryToken() {
    const r = await fetch('/api/diary-token', { method: 'POST' })
    const d = await r.json()
    if (d.diary_token) setDiaryToken(d.diary_token)
  }

  async function revokeDiaryToken() {
    await fetch('/api/diary-token', { method: 'DELETE' })
    setDiaryToken(null)
  }

  async function copyLink() {
    if (!diaryToken) return
    await navigator.clipboard.writeText(`${window.location.origin}/resoconti/${diaryToken}`)
    setCopyOk(true)
    setTimeout(() => setCopyOk(false), 2000)
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24 md:pb-8">
      <Navbar />

      {/* Header */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ScrollText className="w-5 h-5 text-forest-600" />
              <h1 className="font-barlow text-2xl font-black uppercase tracking-tight text-stone-800">
                I tuoi resoconti
              </h1>
            </div>
            <p className="font-lora text-sm italic text-stone-400">
              {loading ? '…' : `${reports.length} resocont${reports.length === 1 ? 'o' : 'i'}`}
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-600 text-sm font-medium transition-colors print:hidden">
            <FileDown className="w-4 h-4" /> Stampa PDF
          </button>
        </div>

        {/* Diary link sharing */}
        <div className="mt-4 bg-white rounded-2xl border border-stone-200 shadow-sm p-4 print:hidden">
          <p className="font-barlow text-xs font-bold uppercase tracking-wide text-stone-500 mb-3">
            Link pubblico del diario
          </p>
          {diaryToken ? (
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs bg-stone-100 px-2.5 py-1.5 rounded-lg font-mono text-stone-600 truncate max-w-[240px]">
                {`${typeof window !== 'undefined' ? window.location.origin : ''}/resoconti/${diaryToken}`}
              </code>
              <button onClick={copyLink}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-barlow font-bold uppercase tracking-wide hover:bg-forest-700 transition-colors">
                <Copy className="w-3.5 h-3.5" /> {copyOk ? 'Copiato!' : 'Copia'}
              </button>
              <button onClick={revokeDiaryToken}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-500 text-xs font-barlow font-bold uppercase tracking-wide hover:bg-red-50 transition-colors">
                <Link2Off className="w-3.5 h-3.5" /> Disattiva
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="font-lora text-xs italic text-stone-400">Il diario non è ancora condiviso pubblicamente.</p>
              <button onClick={generateDiaryToken}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-forest-600 text-white text-xs font-barlow font-bold uppercase tracking-wide hover:bg-forest-700 transition-colors">
                <Share2 className="w-3.5 h-3.5" /> Crea link
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Report list */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-4 space-y-4">
        {loading && (
          <div className="flex items-center gap-3 py-12 text-stone-400 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="font-lora italic text-sm">Caricamento…</span>
          </div>
        )}

        {!loading && reports.length === 0 && (
          <div className="flex flex-col items-center py-20 text-stone-400 gap-3">
            <ScrollText className="w-12 h-12 opacity-30" />
            <p className="font-barlow uppercase tracking-wide text-sm">Nessun resoconto ancora</p>
            <p className="font-lora text-sm italic">Genera il tuo primo resoconto da una escursione</p>
          </div>
        )}

        {reports.map(rep => {
          const act = rep.activity
          const dateStr = act?.start_time
            ? format(new Date(act.start_time), 'd MMMM yyyy', { locale: it })
            : rep.created_at ? format(new Date(rep.created_at), 'd MMMM yyyy', { locale: it }) : ''
          const ex = excerpt(rep.content)

          return (
            <article key={rep.id}
              className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden group print:rounded-none print:shadow-none print:border-0 print:border-t print:border-stone-200">
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {dateStr && (
                      <p className="font-barlow text-[10px] font-bold uppercase tracking-[2px] text-stone-400 mb-1">
                        {dateStr}
                      </p>
                    )}
                    <h2 className="font-barlow text-xl font-black uppercase tracking-tight text-stone-800 leading-tight mb-2">
                      {rep.title || act?.title || 'Escursione'}
                    </h2>
                    {act && (
                      <div className="flex flex-wrap gap-3 mb-3">
                        {act.distance_meters > 0 && (
                          <span className="flex items-center gap-1 text-xs text-stone-500 font-barlow">
                            <Route className="w-3 h-3" /> {(act.distance_meters / 1000).toFixed(1)} km
                          </span>
                        )}
                        {act.elevation_gain > 0 && (
                          <span className="flex items-center gap-1 text-xs text-stone-500 font-barlow">
                            <Mountain className="w-3 h-3" /> {Math.round(act.elevation_gain)} m D+
                          </span>
                        )}
                        {act.total_time_seconds > 0 && (
                          <span className="flex items-center gap-1 text-xs text-stone-500 font-barlow">
                            <Clock className="w-3 h-3" /> {formatDuration(act.total_time_seconds)}
                          </span>
                        )}
                      </div>
                    )}
                    {ex && (
                      <p className="font-lora text-sm text-stone-600 leading-relaxed line-clamp-3">
                        {ex}
                      </p>
                    )}
                  </div>
                  <Link
                    href={`/resoconto/${encodeURIComponent(rep.activity_id)}`}
                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl bg-forest-50 text-forest-700 text-xs font-barlow font-bold uppercase tracking-wide hover:bg-forest-100 transition-colors print:hidden">
                    Apri <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </article>
          )
        })}
      </main>
    </div>
  )
}
