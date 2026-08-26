// "Piega" del libro — ombra sottile e statica sul bordo sinistro dello schermo che suggerisce la
// rilegatura, richiesta dall'utente per rinforzare l'estetica "rivista di settore" del Diario a
// libro. Scelta deliberata tra le opzioni proposte: un gradiente statico (zero animazioni, zero
// costo di performance) invece di una costa marcata con texture o di un'animazione di svolta
// pagina — quella era la preferenza esplicita.
//
// Scoped alle sole schermate del Diario a libro (BookPage.tsx e lo scaffale /diari) — non
// all'intera app: le altre schermate (GuidaHub/ResocontoHub/RouteHub e il resto) restano fuori
// dal perimetro di questo piano per decisione architetturale esplicita (vedi "Decisione
// architetturale chiave" in docs/diario-a-libro-piano.md), e hanno palette/sfondi propri con cui
// una piega pensata per la pergamena o per lo scaffale scuro non è stata verificata.
//
// `pointer-events: none` — non deve mai intercettare tap/click, anche se visivamente sopra il
// contenuto (serve solo a stare sopra per essere visibile su sfondi chiari e scuri).
export default function BookSpineShadow({ variant }: { variant: 'light' | 'dark' }) {
  const gradient = variant === 'light'
    ? 'linear-gradient(to right, rgba(63,58,34,0.16) 0%, rgba(63,58,34,0.05) 45%, rgba(63,58,34,0) 100%)'
    : 'linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.16) 45%, rgba(0,0,0,0) 100%)'
  return (
    <div
      aria-hidden="true"
      className="fixed inset-y-0 left-0 w-6 z-40"
      style={{ background: gradient, pointerEvents: 'none' }}
    />
  )
}
