'use client'
import Navbar from '@/components/Navbar'
import BackLink from '@/app/components/BackLink'
import SectionClaudeKey from '@/components/profilo/SectionClaudeKey'
import SectionAbbonamento from '@/components/profilo/SectionAbbonamento'

export default function AiSettingsPage() {
  return (
    <div className="min-h-screen bg-stone-50 pb-28 md:pb-8">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <BackLink className="inline-flex items-center gap-1 text-sm text-stone-400 hover:text-stone-600 transition mb-1" />
        <div className="mb-2">
          <h1 className="font-display text-2xl font-bold text-forest-900 mb-1">Intelligenza artificiale</h1>
          <p className="text-stone-400 text-sm">Chiave Claude e abbonamento per le funzioni AI dell&#39;app.</p>
        </div>

        <SectionClaudeKey />
        <SectionAbbonamento />
      </div>
    </div>
  )
}
