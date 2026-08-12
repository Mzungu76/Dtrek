/**
 * Standard Web Mercator tile math (256px tiles, EPSG:3857) — shared by anything that needs to
 * place real map tiles (app/api/tile/route.ts's CartoDB/OSM proxy) and geographic points in the
 * exact same pixel space, so a line drawn "by hand" (not through a mapping library like Leaflet)
 * lines up with the actual tile imagery instead of an independently-fitted approximation.
 */

const TILE_SIZE = 256

export function lonToWorldX(lon: number, zoom: number): number {
  return (lon + 180) / 360 * TILE_SIZE * 2 ** zoom
}

export function latToWorldY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * TILE_SIZE * 2 ** zoom
}

export interface GeoBounds {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

export function boundsFromPolyline(polyline: [number, number][]): GeoBounds {
  const lats = polyline.map((p) => p[0])
  const lons = polyline.map((p) => p[1])
  return { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLon: Math.min(...lons), maxLon: Math.max(...lons) }
}

export interface TileProjection {
  zoom: number
  /** World pixel coordinates (at `zoom`) of the container's top-left corner — subtract this from any lonToWorldX/latToWorldY result to get a container-relative pixel. */
  originX: number
  originY: number
}

/**
 * Picks the highest integer zoom (most detail) at which `bounds`, padded, still fits inside a
 * `containerWidth` × `containerHeight` box, then centers it — the same "fit bounds" a mapping
 * library does internally, computed by hand since nothing here is loading a JS map library (this
 * is meant for the potentially-many-at-once route-list thumbnails, where mounting a full Leaflet
 * instance per card would be its own performance problem).
 */
export function fitTileProjection(bounds: GeoBounds, containerWidth: number, containerHeight: number, paddingPx = 12, minZoom = 3, maxZoom = 18): TileProjection {
  let zoom = maxZoom
  for (let z = maxZoom; z >= minZoom; z--) {
    const worldWidth = lonToWorldX(bounds.maxLon, z) - lonToWorldX(bounds.minLon, z)
    // latToWorldY decreases as latitude increases, so the *smaller* lat gives the larger Y.
    const worldHeight = latToWorldY(bounds.minLat, z) - latToWorldY(bounds.maxLat, z)
    if (worldWidth <= containerWidth - 2 * paddingPx && worldHeight <= containerHeight - 2 * paddingPx) { zoom = z; break }
    zoom = z // if even minZoom doesn't fit (e.g. a very long linear route), fall through with the smallest zoom tried
  }

  const centerX = (lonToWorldX(bounds.minLon, zoom) + lonToWorldX(bounds.maxLon, zoom)) / 2
  const centerY = (latToWorldY(bounds.minLat, zoom) + latToWorldY(bounds.maxLat, zoom)) / 2
  return { zoom, originX: centerX - containerWidth / 2, originY: centerY - containerHeight / 2 }
}

export function projectPoint(lat: number, lon: number, projection: TileProjection): [number, number] {
  return [lonToWorldX(lon, projection.zoom) - projection.originX, latToWorldY(lat, projection.zoom) - projection.originY]
}

export interface TilePlacement {
  z: number
  x: number
  y: number
  left: number
  top: number
}

/** Every tile needed to cover a `containerWidth` × `containerHeight` box at `projection`, with its pixel placement relative to the container's top-left. */
export function tilesForProjection(projection: TileProjection, containerWidth: number, containerHeight: number): TilePlacement[] {
  const { zoom, originX, originY } = projection
  const maxIndex = 2 ** zoom - 1
  const txMin = Math.max(0, Math.floor(originX / TILE_SIZE))
  const txMax = Math.min(maxIndex, Math.floor((originX + containerWidth) / TILE_SIZE))
  const tyMin = Math.max(0, Math.floor(originY / TILE_SIZE))
  const tyMax = Math.min(maxIndex, Math.floor((originY + containerHeight) / TILE_SIZE))

  const tiles: TilePlacement[] = []
  for (let tx = txMin; tx <= txMax; tx++) {
    for (let ty = tyMin; ty <= tyMax; ty++) {
      tiles.push({ z: zoom, x: tx, y: ty, left: tx * TILE_SIZE - originX, top: ty * TILE_SIZE - originY })
    }
  }
  return tiles
}
