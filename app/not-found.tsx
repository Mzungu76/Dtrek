// 404 con l'identità DTrek — prima non esisteva, quindi un link condiviso revocato (o un URL
// digitato male ovunque nell'app) mostrava la pagina 404 nuda di Next: sfondo bianco, nessun
// logo, nessuna indicazione su cosa fare.
export default function NotFound() {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="inline-flex items-center gap-2 font-display font-bold text-xl text-forest-700 mb-6">
          <span className="text-forest-500">▲</span> DTrek
        </div>
        <h1 className="font-display text-2xl font-bold text-stone-800 mb-2">Pagina non trovata</h1>
        <p className="text-sm text-stone-500 mb-6">
          Il link potrebbe essere stato rimosso, oppure l&apos;indirizzo non è corretto.
        </p>
        <a href="/"
          className="inline-block bg-forest-600 hover:bg-forest-700 transition text-white font-display font-semibold text-sm rounded-full px-6 py-2.5">
          Vai alla home
        </a>
      </div>
    </div>
  )
}
