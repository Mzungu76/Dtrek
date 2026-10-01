import { describe, it, expect, vi, beforeEach } from 'vitest'
import { canCompleteWithoutTrack, markMetaVisited, evaluateCheckIn, SITE_CHECKIN_RADIUS_M } from '../visitCompletion'

const saveActivityWithEnrichment = vi.fn()
vi.mock('../activitySave', () => ({
  saveActivityWithEnrichment: (...args: unknown[]) => saveActivityWithEnrichment(...args),
}))

beforeEach(() => {
  saveActivityWithEnrichment.mockReset()
  saveActivityWithEnrichment.mockResolvedValue(undefined)
})

describe('canCompleteWithoutTrack', () => {
  it('un sentiero non si completa mai senza traccia', () => {
    expect(canCompleteWithoutTrack('sentiero')).toBe(false)
  })

  it('assente → trattato come sentiero (default di colonna), mai completabile senza traccia', () => {
    expect(canCompleteWithoutTrack(undefined)).toBe(false)
  })

  it('un borgo_citta NON si completa senza traccia — trattato come un sentiero (decisione di sessione: il suo itinerario a piedi si può camminare per davvero)', () => {
    expect(canCompleteWithoutTrack('borgo_citta')).toBe(false)
  })

  it('solo un sito si completa senza traccia — nessun percorso da percorrere, solo un punto', () => {
    expect(canCompleteWithoutTrack('sito')).toBe(true)
  })
})

describe('evaluateCheckIn', () => {
  const roma = { latitude: 41.9028, longitude: 12.4964 }

  it('nessun fix GPS → no_gps', () => {
    expect(evaluateCheckIn(null, roma).outcome).toBe('no_gps')
  })

  it('sito senza coordinate note → no_gps anche con un fix valido', () => {
    expect(evaluateCheckIn({ lat: 41.9, lon: 12.5 }, {}).outcome).toBe('no_gps')
  })

  it('fix entro il raggio → verified', () => {
    const result = evaluateCheckIn({ lat: 41.9029, lon: 12.4965 }, roma)
    expect(result.outcome).toBe('verified')
    expect(result.distanceM).toBeLessThan(SITE_CHECKIN_RADIUS_M)
  })

  it('fix oltre il raggio → out_of_range', () => {
    // ~1.1° di latitudine, ben oltre i 300m del raggio di check-in.
    const result = evaluateCheckIn({ lat: 43.0, lon: 12.4964 }, roma)
    expect(result.outcome).toBe('out_of_range')
    expect(result.distanceM).toBeGreaterThan(SITE_CHECKIN_RADIUS_M)
  })
})

describe('evaluateCheckIn — casi che non devono mai risultare verificati', () => {
  const roma = { latitude: 41.9028, longitude: 12.4964 }

  it('fix troppo incerto (cella/IP) anche se il punto stimato cade vicino → low_accuracy, non verified', () => {
    const r = evaluateCheckIn({ lat: 41.9029, lon: 12.4965, accuracyM: 4000 }, roma)
    expect(r.outcome).toBe('low_accuracy')
  })

  it('fix preciso entro il raggio resta verified', () => {
    expect(evaluateCheckIn({ lat: 41.9029, lon: 12.4965, accuracyM: 15 }, roma).outcome).toBe('verified')
  })

  it('coordinate del Sito approssimate (centro del Comune) → approximate, mai verified', () => {
    const r = evaluateCheckIn({ lat: 41.9029, lon: 12.4965, accuracyM: 10 }, { ...roma, coordinatesApproximate: true })
    expect(r.outcome).toBe('approximate')
  })
})

describe('markMetaVisited', () => {
  it('rifiuta un sentiero — nessuno shortcut rispetto a un\'attività reale', async () => {
    await expect(markMetaVisited({ id: '1', title: 'Test', metaType: 'sentiero' }, null, false)).rejects.toThrow()
    expect(saveActivityWithEnrichment).not.toHaveBeenCalled()
  })

  it('rifiuta un borgo_citta — passa sempre da un\'attività registrata o importata, come un sentiero', async () => {
    await expect(markMetaVisited({ id: '1', title: 'Calcata', metaType: 'borgo_citta' }, null, false)).rejects.toThrow()
    expect(saveActivityWithEnrichment).not.toHaveBeenCalled()
  })

  it('crea un\'Attività verificata con un trackPoint per un check-in confermato in zona', async () => {
    const fix = { lat: 41.9029, lon: 12.4965 }
    await markMetaVisited({ id: '1', title: 'Colosseo', metaType: 'sito', siteType: 'sito_archeologico' }, fix, true)
    expect(saveActivityWithEnrichment).toHaveBeenCalledTimes(1)
    const [activity, opts] = saveActivityWithEnrichment.mock.calls[0]
    expect(activity.distanceMeters).toBe(0)
    expect(activity.trackPoints).toEqual([{ time: activity.startTime, lat: fix.lat, lon: fix.lon }])
    expect(opts.linkedPlannedId).toBe('1')
    expect(opts.title).toBe('Colosseo')
    expect(opts.metaType).toBe('sito')
    expect(opts.siteType).toBe('sito_archeologico')
    expect(opts.verified).toBe(true)
  })

  it('ripiego "registra comunque" senza fix GPS: traccia vuota, non verificata', async () => {
    await markMetaVisited({ id: '1', title: 'Museo chiuso', metaType: 'sito' }, null, false)
    const [activity, opts] = saveActivityWithEnrichment.mock.calls[0]
    expect(activity.trackPoints).toEqual([])
    expect(opts.verified).toBe(false)
  })

  it('un fix fuori raggio non diventa verificato solo perché esiste — la decisione resta del chiamante', async () => {
    const fix = { lat: 43.0, lon: 12.4964 }
    await markMetaVisited({ id: '1', title: 'Lontano', metaType: 'sito' }, fix, false)
    const [activity, opts] = saveActivityWithEnrichment.mock.calls[0]
    expect(activity.trackPoints).toEqual([{ time: activity.startTime, lat: fix.lat, lon: fix.lon }])
    expect(opts.verified).toBe(false)
  })

  it('idempotente: non crea una seconda Attività se firstCompletedAt è già presente', async () => {
    await markMetaVisited({ id: '1', title: 'Test', metaType: 'sito', firstCompletedAt: '2026-01-01T00:00:00.000Z' }, null, false)
    expect(saveActivityWithEnrichment).not.toHaveBeenCalled()
  })

  it('repeat: registra un\'altra visita anche se la Meta è già stata visitata', async () => {
    await markMetaVisited({ id: '1', title: 'Test', metaType: 'sito', firstCompletedAt: '2026-01-01T00:00:00.000Z' }, null, false, { repeat: true })
    expect(saveActivityWithEnrichment).toHaveBeenCalledTimes(1)
  })

  it('passa il Diario scelto a saveActivityWithEnrichment', async () => {
    await markMetaVisited({ id: '1', title: 'Test', metaType: 'sito' }, null, false, { diaryId: 'd-42' })
    expect(saveActivityWithEnrichment.mock.calls[0][1].diaryId).toBe('d-42')
  })
})
