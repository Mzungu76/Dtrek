import Navbar, { MOBILE_TOPBAR_SPACER } from '@/components/Navbar'

interface CreditSource {
  name: string
  url: string
  license: string
  note: string
}

const SOURCES: CreditSource[] = [
  {
    name: 'GBIF.org',
    url: 'https://www.gbif.org',
    license: 'CC0 / CC BY 4.0',
    note: 'Global Biodiversity Information Facility — occorrenze e immagini di flora e fauna, filtrate per licenza commerciale-compatibile. Attribution per singola immagine mostrata nella scheda specie.',
  },
  {
    name: 'iNaturalist',
    url: 'https://www.inaturalist.org',
    license: 'CC0 / CC BY',
    note: 'Osservazioni e foto della community, filtrate per licenza commerciale-compatibile. Attribution dell’osservatore mostrata nella scheda specie.',
  },
  {
    name: 'Wikidata / Wikimedia Commons',
    url: 'https://www.wikidata.org',
    license: 'CC0',
    note: 'Immagine di riserva per specie note ma senza foto propria da GBIF o iNaturalist.',
  },
  {
    name: 'European Environment Agency (EEA) — Natura 2000',
    url: 'https://www.eea.europa.eu/data-and-maps/data/natura-14',
    license: 'CC BY 4.0',
    note: 'Elenco specie tipiche dei siti della Rete Natura 2000 (SIC/ZSC/ZPS), mostrato quando un’escursione non ha osservazioni dirette o nei dintorni — badge "specie tipiche dell’area protetta".',
  },
]

export default function FontiECreditiPage() {
  return (
    <div className={`min-h-screen bg-stone-50 ${MOBILE_TOPBAR_SPACER}`}>
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="font-lora text-2xl text-stone-800 mb-2">Fonti e crediti</h1>
        <p className="text-sm text-stone-500 mb-8">
          Le Gallerie Verde e Selvatica di DTrek mostrano dati di biodiversità raccolti da fonti
          aperte. Di seguito l’attribuzione richiesta da ciascuna licenza.
        </p>
        <div className="space-y-6">
          {SOURCES.map(s => (
            <div key={s.name} className="bg-white rounded-xl border border-stone-200 p-4">
              <h2 className="font-lora text-lg text-stone-800">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {s.name} ↗
                </a>
              </h2>
              <p className="text-xs uppercase tracking-wide text-stone-400 mt-1">{s.license}</p>
              <p className="text-sm text-stone-600 mt-2">{s.note}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
