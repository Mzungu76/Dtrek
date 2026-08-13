'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Trash2 } from 'lucide-react'
import GpxUploader from '@/components/upload/GpxUploader'
import { openMainApp } from '@/lib/native/mainAppLinks'
import { getNavigatorSlotStatus, NAVIGATOR_SLOT_LIMIT, type NavigatorSlotStatus } from '@/lib/navigatorSlot'
import { deletePlanned } from '@/lib/plannedStore'
import { deleteActivity } from '@/lib/blobStore'

/**
 * Importa un GPX/KML/KMZ/GeoJSON restando dentro l'app Navigator, a costo zero (Overpass +
 * Wikipedia, arricchimento già gestito da GpxUploader/lib/plannedStore al salvataggio — nessuna
 * chiamata AI qui). Prima di questa schermata l'unica via per importare un percorso era uscire
 * verso l'app principale (openMainApp), pur essendo il backend già pronto a farlo da qui — vedi
 * lib/navigatorSlot.ts, che già prevedeva "un file/URL importato" come una delle due sole azioni
 * che riempiono lo slot di Navigator.
 *
 * Stesso pattern di stato/limite di app/navigatore/traccia/page.tsx: NAVIGATOR_SLOT_LIMIT percorsi
 * import/registrazione alla volta, un percorso pianificato nell'app principale non conta.
 */
export default function ImportaPage() {
  const router = useRouter()
  const [slotStatus, setSlotStatus] = useState<NavigatorSlotStatus | undefined>(undefined)
  const [removingSlotId, setRemovingSlotId] = useState<string | null>(null)

  useEffect(() => {
    getNavigatorSlotStatus().then(setSlotStatus).catch(() => setSlotStatus({ items: [], atLimit: false }))
  }, [])

  const handleRemoveSlotItem = async (item: { kind: 'planned' | 'activity'; id: string }) => {
    setRemovingSlotId(item.id)
    try {
      if (item.kind === 'planned') await deletePlanned(item.id)
      else await deleteActivity(item.id)
      setSlotStatus((prev) => prev && { items: prev.items.filter((i) => i.id !== item.id), atLimit: false })
    } finally {
      setRemovingSlotId(null)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col">
      <div className="bg-gradient-to-br from-sky-800 to-sky-900 px-5 pt-[calc(env(safe-area-inset-top)+20px)] pb-5 flex items-center gap-3">
        <button onClick={() => router.push('/navigatore')} className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/15 text-white hover:bg-white/25">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="font-display text-lg font-bold text-white">Importa un percorso</h1>
      </div>

      {slotStatus?.atLimit ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12 gap-4">
          <p className="font-display text-xl font-semibold text-stone-800">Hai già {NAVIGATOR_SLOT_LIMIT} percorsi in Navigator</p>
          <p className="text-stone-500 text-sm max-w-xs">
            Navigator tiene fino a {NAVIGATOR_SLOT_LIMIT} percorsi/tracce alla volta. Rimuovine uno per importarne un altro, oppure usa l&apos;app DTrek principale per pianificarne quanti vuoi.
          </p>
          <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
            {slotStatus.items.map((item) => (
              <button
                key={item.id}
                onClick={() => handleRemoveSlotItem(item)}
                disabled={removingSlotId === item.id}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 font-semibold text-sm hover:bg-red-100 disabled:opacity-60"
              >
                <Trash2 className="w-4 h-4" /> {removingSlotId === item.id ? 'Rimozione…' : `Rimuovi "${item.title}"`}
              </button>
            ))}
            <button
              onClick={() => openMainApp('/guida')}
              className="w-full py-2.5 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700"
            >
              Apri DTrek per pianificare
            </button>
          </div>
        </div>
      ) : (
        <main className="flex-1 max-w-lg w-full mx-auto px-4 py-6">
          <p className="text-stone-500 text-sm mb-4">
            Carica un file GPX, KML, KMZ o GeoJSON — resta subito pronto per la navigazione, qui in Navigator.
          </p>
          <GpxUploader
            sourceApp="navigator"
            afterSaveHref={(id) => `/guida/${encodeURIComponent(id)}/naviga`}
          />
        </main>
      )}
    </div>
  )
}
