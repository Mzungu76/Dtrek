'use client'
import { MobileNavBar, DesktopNav } from '@/components/Navbar'

/**
 * La stessa barra della navbar principale (components/Navbar.tsx), non una copia — garantisce che
 * Bacheca, Diario e le pagine "magazine" di Guide/Reportage mostrino sempre gli stessi link. La
 * barra dei link vive ora in fondo a queste pagine (sotto la galleria/il pannello widget e la
 * freccetta che invita a scorrere verso l'alto), non più in cima: in cima resta solo l'icona
 * profilo (HubProfileButton sotto). La posizione (fixed/absolute/sticky) resta decisa dal
 * chiamante, che qui la monta dentro il proprio overlay o header/footer.
 * safeAreaBottom=true: il rientro per l'home indicator vive dentro la barra stessa (ne allunga lo
 * sfondo) — così il chiamante può ancorarla proprio al bordo inferiore reale senza lasciarvi sotto
 * uno spazio vuoto residuo, qualunque cosa la precede nel proprio contenitore.
 *
 * Da md: in su, la barra mobile in fondo (pensata per il pollice, icone+etichette in fila) non va
 * bene su tablet/desktop — qui compare invece la stessa testata "normale" del resto dell'app
 * (logo, link testuali a destra, avatar), fissa in cima. `md:hidden` sulla barra mobile evita che
 * le due convivano.
 */
export default function HubNavBar() {
  return (
    <>
      <MobileNavBar className="md:hidden" showAvatar={false} safeAreaTop={false} safeAreaBottom />
      <DesktopNav position="fixed" />
    </>
  )
}

/** Solo l'icona profilo, in alto a destra — quel che resta in cima alle pagine "magazine" ora che
 *  i link di navigazione sono scesi in fondo (HubNavBar sopra). Da md: in su non serve: l'avatar
 *  vive già nella testata desktop che HubNavBar monta. */
export function HubProfileButton() {
  return <MobileNavBar className="md:hidden" showLinks={false} />
}
