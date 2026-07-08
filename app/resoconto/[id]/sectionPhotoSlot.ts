// Photo slot is keyed by section title (not array position) so that omitting
// "Cronaca" (no questionnaire answered) doesn't shift the photos bound to the
// sections that follow it.
const SECTION_PHOTO_SLOT: Record<string, number> = {
  'Il percorso':     0,
  'Cronaca':         1,
  'Natura e storia': 2,
  'In sintesi':      3,
}

export function slotFor(title: string, fallbackIndex: number): number {
  return SECTION_PHOTO_SLOT[title] ?? fallbackIndex
}
