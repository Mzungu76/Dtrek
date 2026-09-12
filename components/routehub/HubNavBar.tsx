'use client'
import { MobileNavBar } from '@/components/Navbar'

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
 */
export default function HubNavBar() {
  return <MobileNavBar showAvatar={false} safeAreaTop={false} safeAreaBottom />
}

/** Solo l'icona profilo, in alto a destra — quel che resta in cima alle pagine "magazine" ora che
 *  i link di navigazione sono scesi in fondo (HubNavBar sopra). */
export function HubProfileButton() {
  return <MobileNavBar showLinks={false} />
}
