'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Navigation, Trophy } from 'lucide-react'
import { getAllActivities } from '@/lib/blobStore'
import { computeStreaks } from '@/lib/stats'
import { computeBadges } from '@/lib/badges'
import { getSeenBadgeIds, markBadgesSeen } from '@/lib/badgesSeen'

/**
 * UX-AUDIT.md P-O1/P-O2 — al termine della lettura di un Resoconto il ciclo utente si interrompeva:
 * nessun invito a pianificare la prossima uscita, e il sistema di badge (già esistente e ben fatto,
 * vedi components/stats/TabTraguardi.tsx) restava raggiungibile solo scorrendo dentro Statistiche,
 * mai al momento in cui un traguardo si sblocca davvero (subito dopo aver salvato l'attività che lo
 * fa scattare). Stessa logica di "nuovi badge" di TabTraguardi.tsx (calcolo + dedup via
 * lib/badgesSeen.ts, stessa chiave: un badge già festeggiato lì non si ripete qui, e viceversa),
 * spostata qui perché ReportReader non riceve già activities/streaks (ha una sola activity).
 */
export default function NextStepBanner() {
  const [newlyUnlockedCount, setNewlyUnlockedCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    getAllActivities().then(activities => {
      if (cancelled) return
      const streaks = computeStreaks(activities)
      const badges = computeBadges(activities, streaks)
      const seen = getSeenBadgeIds()
      const fresh = badges.filter(b => b.unlocked && !seen.has(b.id))
      if (fresh.length > 0) {
        setNewlyUnlockedCount(fresh.length)
        markBadgesSeen(badges.filter(b => b.unlocked).map(b => b.id))
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <div className="rounded-2xl bg-gradient-to-br from-forest-700 to-forest-800 px-5 py-6 flex flex-col items-center text-center gap-3">
      {newlyUnlockedCount > 0 && (
        <Link
          href="/statistiche?tab=traguardi"
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-400/15 border border-amber-300/30 text-amber-200 text-xs font-semibold"
        >
          <Trophy className="w-3.5 h-3.5" />
          🎉 Hai sbloccato {newlyUnlockedCount} nuov{newlyUnlockedCount > 1 ? 'i' : 'o'} badge!
        </Link>
      )}
      <p className="text-white/85 text-sm">Escursione documentata. Cosa fai la prossima volta?</p>
      <Link
        href="/upload?tab=gpx"
        className="flex items-center gap-2 px-5 py-2.5 bg-white text-forest-800 rounded-full font-semibold text-sm shadow-lg hover:bg-forest-50 transition-colors"
      >
        <Navigation className="w-4 h-4" /> Pianifica la prossima uscita
      </Link>
    </div>
  )
}
