'use client'
import { MobileNavBar } from '@/components/Navbar'

/**
 * La stessa barra della navbar principale (components/Navbar.tsx), non una copia: prima del
 * redesign edge-to-edge questa era una pillola fluttuante indipendente (bg-forest-900/90,
 * rounded-full) e finiva fuori sincrono col resto dell'app. Riusare il componente garantisce che
 * Bacheca, Diario e le pagine "magazine" di Guide/Resoconto mostrino sempre la stessa barra —
 * niente da tenere allineato a mano. La posizione (fixed/absolute/sticky) resta decisa dal
 * chiamante, che qui la monta dentro il proprio overlay o header.
 */
export default function HubNavBar() {
  return <MobileNavBar />
}
