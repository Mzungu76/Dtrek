export async function fetchWikipediaImage(
  query: string,
  lang: 'it' | 'en' = 'it',
): Promise<string | null> {
  try {
    const base = `https://${lang}.wikipedia.org/w/api.php`

    const searchRes = await fetch(
      `${base}?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`,
      { signal: AbortSignal.timeout(5000) },
    )
    const searchData = await searchRes.json()
    if (!searchData.query?.search?.length) return null

    const title = searchData.query.search[0].title

    const imgRes = await fetch(
      `${base}?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=800&format=json&origin=*`,
      { signal: AbortSignal.timeout(5000) },
    )
    const imgData = await imgRes.json()
    const pages = Object.values(imgData.query.pages) as { thumbnail?: { source: string } }[]

    return pages[0]?.thumbnail?.source ?? null
  } catch {
    return null
  }
}

export async function fetchGuideSectionPhotos(locationName: string) {
  const [percorso, natura, sapori] = await Promise.allSettled([
    fetchWikipediaImage(`${locationName} centro storico`),
    fetchWikipediaImage(`${locationName} lago natura`),
    fetchWikipediaImage(`${locationName} cucina tradizionale`),
  ])
  return {
    percorso: percorso.status === 'fulfilled' ? percorso.value : null,
    natura:   natura.status   === 'fulfilled' ? natura.value   : null,
    sapori:   sapori.status   === 'fulfilled' ? sapori.value   : null,
  }
}
