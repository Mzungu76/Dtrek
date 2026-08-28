// "Piega" del libro — ombra statica sul bordo dello schermo che suggerisce la rilegatura,
// richiesta dall'utente per rinforzare l'estetica "rivista di settore" del Diario a libro. Scelta
// deliberata tra le opzioni proposte: un gradiente statico (zero animazioni, zero costo di
// performance) invece di una costa marcata con texture — quella era la preferenza esplicita
// all'epoca (Fase 10). L'animazione di svolta pagina, scartata allora, è arrivata comunque in
// Fase 35 ma altrove (`BookPage.tsx`, sul contenuto) — questa ombra resta un gradiente statico.
//
// Scoped alle sole schermate del Diario a libro (BookPage.tsx e lo scaffale /diari) — non
// all'intera app: le altre schermate (GuidaHub/ResocontoHub/RouteHub e il resto) restano fuori
// dal perimetro di questo piano per decisione architetturale esplicita (vedi "Decisione
// architetturale chiave" in docs/diario-a-libro-piano.md), e hanno palette/sfondi propri con cui
// una piega pensata per la pergamena o per lo scaffale scuro non è stata verificata.
//
// Fase 35 — rinforzata (più larga, più scura ai due estremi) sulla scia dello stesso ritocco
// fatto su `TaccuinoSpineShadow`, e `side` alternabile: Guida/Resoconto (`BookPage.tsx`) la
// alternano sinistra/destra pagina per pagina per simulare un libro vero che si sfoglia; lo
// scaffale (`DiariPageLibro`) e ogni altro chiamante che non passa `side` restano a sinistra.
//
// `pointer-events: none` — non deve mai intercettare tap/click, anche se visivamente sopra il
// contenuto (serve solo a stare sopra per essere visibile su sfondi chiari e scuri).
export default function BookSpineShadow({ variant, side = 'left' }: { variant: 'light' | 'dark'; side?: 'left' | 'right' }) {
  const gradient = variant === 'light'
    ? 'linear-gradient(to right, rgba(63,58,34,0.34) 0%, rgba(63,58,34,0.16) 28%, rgba(63,58,34,0.06) 55%, rgba(63,58,34,0) 85%)'
    : 'linear-gradient(to right, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.28) 28%, rgba(0,0,0,0.09) 55%, rgba(0,0,0,0) 85%)'
  return (
    <div
      aria-hidden="true"
      className={`fixed inset-y-0 z-40 ${side === 'left' ? 'left-0' : 'right-0'}`}
      style={{
        width: 34,
        background: side === 'left' ? gradient : gradient.replace('to right', 'to left'),
        pointerEvents: 'none',
      }}
    />
  )
}
