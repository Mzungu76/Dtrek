/**
 * Testi estesi dei punti di interesse di un percorso, scritti al momento dello scarico del pacchetto
 * offline (lib/offline/packageManager.ts) così la scheda del luogo ha sempre qualcosa da leggere
 * anche senza rete. Per ogni POI mette insieme, in quest'ordine di preferenza: i paragrafi della
 * guida del percorso che lo citano (lib/navigation/poiGuideText.ts) e il testo esteso
 * dell'articolo Wikipedia/Wikivoyage già associato al POI. Nessun testo inventato: se né la guida né
 * una pagina enciclopedica parlano del luogo, non viene salvato niente.
 * Chiave separata da poi-notes (note curate dall'IA) perché origine e garanzie sono diverse.
 */
import { lsGet, lsSet, lsDel } from '@/lib/localStore'
import { findGuideTextForPoi } from '@/lib/navigation/poiGuideText'
import { fetchWikiFullDetails, type WikiPage } from '@/lib/wikipedia'
import { runWithConcurrency } from '@/lib/promisePool'

const KEY = (hikeId: string) => `poi-texts:${hikeId}`

interface StoredPoiTexts {
  hikeId: string
  fetchedAt: number
  entries: [number, string][]
}

export async function loadPoiTexts(hikeId: string): Promise<Map<number, string> | null> {
  const stored = await lsGet<StoredPoiTexts>(KEY(hikeId))
  return stored ? new Map(stored.entries) : null
}

export async function deletePoiTexts(hikeId: string): Promise<void> {
  await lsDel(KEY(hikeId))
}

interface PoiLike { id: number; name?: string }

/** Sotto questa lunghezza il testo della guida viene affiancato dall'articolo enciclopedico. */
const GUIDE_TEXT_SUFFICIENT_CHARS = 500
const WIKI_CONCURRENCY = 4

export async function buildAndSavePoiTexts(
  hikeId: string,
  pois: PoiLike[],
  wikiEntries: { poi: PoiLike; wiki: WikiPage }[],
  guide: string,
): Promise<number> {
  const wikiByPoiId = new Map<number, WikiPage>()
  for (const e of wikiEntries) if (e?.poi?.id != null && e.wiki) wikiByPoiId.set(Number(e.poi.id), e.wiki)

  const texts = new Map<number, string>()
  await runWithConcurrency(pois, WIKI_CONCURRENCY, async (poi) => {
    const id = Number(poi.id)
    const guideText = findGuideTextForPoi(guide, poi.name)
    const wiki = wikiByPoiId.get(id)
    let wikiText: string | null = null
    if (wiki && (!guideText || guideText.length < GUIDE_TEXT_SUFFICIENT_CHARS)) {
      // Best-effort: un errore di rete su un singolo articolo non deve costare gli altri luoghi.
      wikiText = await fetchWikiFullDetails(wiki).then((d) => d.extract).catch(() => wiki.extract) || wiki.extract
    }
    const parts = [guideText, wikiText].filter((t): t is string => !!t && t.trim().length > 0)
    if (parts.length > 0) texts.set(id, parts.join('\n\n'))
  }, () => {})

  await lsSet(KEY(hikeId), { hikeId, fetchedAt: Date.now(), entries: Array.from(texts.entries()) } satisfies StoredPoiTexts)
  return texts.size
}
