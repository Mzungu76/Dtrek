import { describe, it, expect } from 'vitest'
import { bucketPhotosInOrder } from '../photoBuckets'

describe('bucketPhotosInOrder', () => {
  it('distribuisce per ordine a fette uguali, non tutte nello stesso capitolo', () => {
    const photos = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(bucketPhotosInOrder(photos, 3)).toEqual([['a', 'b'], ['c', 'd'], ['e', 'f']])
  })

  it('meno foto che capitoli: le prime capitoli ne prendono una, il resto resta vuoto', () => {
    const b = bucketPhotosInOrder(['a', 'b'], 4)
    expect(b.flat()).toEqual(['a', 'b'])
    expect(b).toHaveLength(4)
  })

  it('nessun capitolo: vuoto', () => {
    expect(bucketPhotosInOrder(['a'], 0)).toEqual([])
  })
})
