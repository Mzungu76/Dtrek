// Side-effect module: registers proj4 defs needed by Italian WFS/WCS endpoints
// beyond the EPSG:23033 (ED50) already registered ad hoc in scripts/import-ptpr.ts.
// Import this module (for its side effects) before reprojecting coordinates from
// any new geo client.
import proj4 from 'proj4'

// WGS84 / UTM zone 32N — covers northern/central Italy, used by some PST DTM tiles.
proj4.defs('EPSG:32632', '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs')
// WGS84 / UTM zone 33N — covers southern/eastern Italy.
proj4.defs('EPSG:32633', '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs')

// Gauss-Boaga (Roma40/Monte Mario datum) fuso Ovest/Est — legacy CRS still exposed by
// some regional WFS/WMS (CARG sheets, older Autorità di Bacino layers). towgs84 is the
// commonly published 7-parameter Roma40->WGS84 shift; re-verify against each endpoint's
// declared datum before relying on sub-10m accuracy from it.
proj4.defs('EPSG:3003', '+proj=tmerc +lat_0=0 +lon_0=9 +k=0.9996 +x_0=1500000 +y_0=0 +ellps=intl +towgs84=-104.1,-49.1,-9.9,0.971,-2.917,0.714,-11.68 +units=m +no_defs')
proj4.defs('EPSG:3004', '+proj=tmerc +lat_0=0 +lon_0=15 +k=0.9996 +x_0=2520000 +y_0=0 +ellps=intl +towgs84=-104.1,-49.1,-9.9,0.971,-2.917,0.714,-11.68 +units=m +no_defs')

// ETRS89-extended / LAEA Europe — CRS nativa delle tile GeoTIFF del dataset EU_DTM di
// OpenTopography (lib/dtm/openTopographyClient.ts). Senza questa registrazione, proj4(proj,
// WGS84_PROJ4) in lib/dtm/slopeAspect.ts riceveva solo l'etichetta "EPSG:3035" (nessuna
// definizione nota) e falliva con un errore fuorviante ("Could not parse to valid json:
// EPSG:3035") — ogni tile DTM per l'Italia veniva quindi scartata come "non decodificabile",
// anche quando la risposta di OpenTopography era un GeoTIFF valido.
proj4.defs('EPSG:3035', '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs')

export { proj4 }
