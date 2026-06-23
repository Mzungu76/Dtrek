export const CTS_PARAM_DESCRIPTIONS: Record<string, string> = {
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
