'use client'
import HubSkeleton from '@/components/routehub/HubSkeleton'
import { useDashboardData } from '@/components/dashboard/useDashboardData'
import DashboardHero from '@/components/dashboard/DashboardHero'
import DashboardSheet from '@/components/dashboard/DashboardSheet'

// Bacheca come Dashboard-hero (Direzione E, docs/mockup-dashboard-hero/README.md): non più la
// pagina scorrevole a card chiare di prima (Direzione C), ma la stessa identità "hero a schermo
// intero" di Guida/Resoconto/Diario — una mappa (di tutti i percorsi, o delle posizioni di Guide e
// Resoconti) a piena pagina, coi widget raggiungibili trascinando verso l'alto lo stesso gesto già
// usato altrove nell'app (RouteCarousel → RoutePage). Il catalogo di schede/widget personalizzabili
// costruito per Direzione C non cambia — vive dentro DashboardSheet, solo il contenitore è nuovo.
export default function BachecaPage() {
  const { data, loading } = useDashboardData()
  const heroReady = !loading && !data.nextOutingLoading && data.percorsiPerTe.status !== 'loading'

  if (!heroReady) return <HubSkeleton />

  // Il pannello a scomparsa coi widget ha senso solo per chi ha già qualcosa da riassumere: per un
  // utente nuovo (senza nemmeno una Guida pianificata) l'hero mostra solo la mappa e, se disponibile,
  // il suggerimento di "Percorsi per te" — vedi i due stati corrispondenti in DashboardHero.tsx.
  const hasAnyData = data.activities.length > 0 || data.plannedHikes.length > 0

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b1a24] select-none">
      <DashboardHero data={data} />
      {hasAnyData && <DashboardSheet data={data} />}
    </div>
  )
}
