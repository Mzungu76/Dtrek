// Copertina "in miniatura" — usata ovunque un Diario compare in un elenco (scaffale, drawer,
// cima del Sommario) invece di ripetere tre volte la stessa logica foto/placeholder. Quando il
// Diario non ha ancora una foto propria, mostra lo stesso trattamento (gradiente verde + profilo
// di montagne) della copertina di default vera e propria (components/diario/DiarioCover.tsx,
// usata su /pubblica e nel PDF) — richiesto esplicitamente dall'utente: prima ogni elenco aveva un
// placeholder diverso (icona su sfondo panna, gradienti ciclici), mentre "quella di default" per
// l'utente è una sola, quella che vede sulla copertina stampabile.
//
// Volutamente non l'intera <DiarioCover>: a queste dimensioni (una miniatura, non una pagina A4)
// i dettagli fini (texture topografica, watermark "II", testi) sarebbero solo rumore — qui resta
// solo ciò che si riconosce anche piccolo: il gradiente, il profilo di montagne, il filo terra.
export function DiarioCoverThumb({ coverUrl, className }: { coverUrl: string | null; className?: string }) {
  if (coverUrl) {
    return <img src={coverUrl} alt="" className={`w-full h-full object-cover ${className ?? ''}`} />
  }
  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className ?? ''}`}
      style={{ background: 'linear-gradient(158deg,#193b20 0%,#1c4724 45%,#20592b 100%)' }}
    >
      <svg
        className="absolute bottom-0 left-0 w-full"
        style={{ opacity: 0.16 }}
        viewBox="0 0 794 320"
        preserveAspectRatio="none"
      >
        <path d="M0,320 L70,215 L130,255 L225,125 L305,178 L385,58 L450,125 L520,72 L595,128 L660,82 L730,118 L794,88 L794,320 Z" fill="white" />
      </svg>
      <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: '#e08d3c' }} />
    </div>
  )
}
