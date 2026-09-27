import { describe, it, expect } from 'vitest'
import { siteTypeToPoiType } from '../overpass'
import { SITE_TYPES } from '../metaTypes'

describe('siteTypeToPoiType', () => {
  it('mappa ogni SiteType a un PoiType esistente, o undefined solo per "altro"', () => {
    for (const siteType of SITE_TYPES) {
      const mapped = siteTypeToPoiType(siteType)
      if (siteType === 'altro') expect(mapped).toBeUndefined()
      else expect(mapped).toBeDefined()
    }
  })

  it('castello → castle, cascata → waterfall, belvedere → viewpoint', () => {
    expect(siteTypeToPoiType('castello')).toBe('castle')
    expect(siteTypeToPoiType('cascata')).toBe('waterfall')
    expect(siteTypeToPoiType('belvedere')).toBe('viewpoint')
  })
})
