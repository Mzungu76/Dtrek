'use client'
import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'
import BackLink from '@/app/components/BackLink'
import SectionCronologiaNavigazione from '@/components/profilo/SectionCronologiaNavigazione'

export default function CronologiaNavigazionePage() {
  return (
    <div className={`min-h-screen bg-stone-50 md:pb-8 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <BackLink className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-stone-600 transition mb-1" />
        <div className="mb-2">
          <h1 className="font-display text-2xl font-bold text-forest-900 mb-1">Cronologia navigazione</h1>
          <p className="text-stone-400 text-sm">Le tue uscite guidate dal navigatore GPS.</p>
        </div>

        <SectionCronologiaNavigazione />
      </div>
    </div>
  )
}
