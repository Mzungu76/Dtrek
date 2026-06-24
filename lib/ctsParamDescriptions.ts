export const CTS_PARAM_DESCRIPTIONS: Record<string, string> = {
  // TEI v2 categories (percorsi calcolati con la versione attuale)
  v_cult: 'Valore culturale: presenza e vicinanza di siti archeologici, ruderi, castelli o cappelle lungo il percorso.',
  v_topo: 'Valore topografico: quanto il profilo altimetrico (pendenze, dislivello per km) rende il percorso vario e interessante da camminare.',
  v_idro: 'Valore idrografico: presenza di torrenti, cascate, sorgenti o sponde di laghi lungo il tracciato.',
  v_fond: 'Valore del fondo: quanto il sentiero è su terreno naturale (sterrato, roccia) piuttosto che su asfalto o cemento.',
  v_geo: 'Valore di geodiversità: varietà di formazioni geologiche e morfologie del terreno (stima standard, non ancora calcolata dal modello digitale del terreno).',
  // BeautyScore v1 categories (percorsi storici salvati prima della v2)
  natura: 'Elementi naturalistici di pregio: cime, cascate, grotte, sorgenti, ghiacciai o aree protette presenti lungo il percorso.',
  paesaggio: 'Qualità panoramica: punti panoramici, laghi, fiumi, coste o tratti di terreno aperto con vista ampia.',
  archeologia: 'Siti archeologici e rovine rilevati lungo il percorso.',
  architettura: 'Castelli, cappelle, ponti e altri elementi architettonici/storici lungo il percorso.',
  interesse: 'Varietà di punti di interesse e presenza di articoli Wikipedia collegati alla zona.',
  // Fallback generico per chiavi non mappate sopra
  beautyCategory: 'Punteggio della singola componente paesaggistica/ambientale che contribuisce al voto di bellezza complessivo.',
  anthropicRaw: 'Punteggio di bellezza prima di applicare la penalità per la presenza di elementi antropici (strade, edifici, infrastrutture) lungo il percorso.',
  anthropicPenalty: 'Penalità applicata al punteggio di bellezza in base alla quantità di elementi antropici rilevati nei dintorni del percorso.',
  effortDistance: 'Tempo di marcia stimato in base alla sola distanza percorsa (metodo Naismith).',
  effortGain: 'Tempo aggiuntivo stimato per il dislivello positivo da superare.',
  effortAltitude: 'Maggiorazione del tempo di marcia per la fatica fisiologica aggiuntiva alle quote elevate.',
  effortTerrain: 'Maggiorazione del tempo di marcia in base alla difficoltà del terreno attraversato.',
  effortStandard: 'Livello di fatica stimato in modo standardizzato, senza considerare il profilo personale dell\'utente.',
  effortDelta: 'Correzione della fatica standard in base ai dati personali dell\'utente (frequenza cardiaca rilevata o storico delle attività).',
  effortFinal: 'Livello di fatica finale, dopo aver applicato eventuali correzioni personali.',
  bonusSfida: 'Bonus o malus applicato in base a quanto il livello di sfida del percorso si allinea alle preferenze dell\'utente.',
  bonusDurata: 'Bonus o malus applicato in base a quanto la durata del percorso si allinea alle preferenze dell\'utente.',
}
