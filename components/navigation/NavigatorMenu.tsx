'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { List, MapPinned, Upload, ExternalLink, LogOut } from 'lucide-react'
import Sheet from '@/components/ui/Sheet'
import { getBrowserSupabase } from '@/lib/supabaseBrowser'
import { lsClearAll } from '@/lib/localStore'
import { clearProfile } from '@/lib/userProfile'
import { openMainApp } from '@/lib/native/mainAppLinks'

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * The standalone Navigator app's menu — everything that isn't "navigate right now" lives behind
 * this, reached from the map-first home (app/navigatore/page.tsx). Kept as one small, shared
 * component rather than duplicating this list per screen.
 */
export default function NavigatorMenu({ open, onClose }: Props) {
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await getBrowserSupabase().auth.signOut()
    await lsClearAll()
    clearProfile()
    router.push('/login')
    router.refresh()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Menu">
      <div className="space-y-2">
        <button
          onClick={() => { onClose(); router.push('/navigatore/percorsi') }}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-stone-50 hover:bg-stone-100 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
            <List className="w-4.5 h-4.5" />
          </div>
          <span className="font-semibold text-sm text-stone-800">Percorsi pianificati</span>
        </button>

        <button
          onClick={() => { onClose(); router.push('/navigatore/importa') }}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-stone-50 hover:bg-stone-100 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
            <Upload className="w-4.5 h-4.5" />
          </div>
          <span className="font-semibold text-sm text-stone-800">Importa un percorso</span>
        </button>

        <button
          onClick={() => { onClose(); router.push('/navigatore/traccia') }}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-stone-50 hover:bg-stone-100 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-forest-100 text-forest-700 flex items-center justify-center shrink-0">
            <MapPinned className="w-4.5 h-4.5" />
          </div>
          <span className="font-semibold text-sm text-stone-800">Registra senza pianificazione</span>
        </button>

        <button
          onClick={() => openMainApp()}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-stone-50 hover:bg-stone-100 transition-colors text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <ExternalLink className="w-4.5 h-4.5" />
          </div>
          <span className="font-semibold text-sm text-stone-800">Apri DTrek — Diario, statistiche, nuovi percorsi</span>
        </button>

        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-stone-50 hover:bg-stone-100 transition-colors text-left disabled:opacity-50"
        >
          <div className="w-9 h-9 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
            <LogOut className="w-4.5 h-4.5" />
          </div>
          <span className="font-semibold text-sm text-stone-800">Esci</span>
        </button>
      </div>
    </Sheet>
  )
}
