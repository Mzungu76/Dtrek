// Attribuzione delle tile di base (proxy app/api/tile). CARTO e OpenStreetMap richiedono che
// l'attribuzione sia visibile o raggiungibile da chi guarda la mappa; i dati sono © OpenStreetMap
// contributors (ODbL). Un solo posto per il testo, usato dalle mappe che hanno spazio per mostrarlo e
// dalla pagina /fonti-e-crediti.
export const OSM_ATTRIBUTION_HTML =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'

export const CARTO_ATTRIBUTION_HTML =
  `${OSM_ATTRIBUTION_HTML} · © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>`
