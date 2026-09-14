// Selezione pura per POST /api/collections/publish-batch ("Pubblica tutto" della pagina di
// pre-pubblicazione, /raccolte/pubblica): quali Raccolte marcate hanno bisogno di un nuovo
// share_token e quali erano già online — testabile senza un database, come aggregateCollections.ts.
export interface MarkedCollectionRow {
  id: string
  share_token: string | null
  marked_for_publish: boolean
}

export interface PublishBatchPlan {
  /** Marcate e senza token: la route deve generarne uno. */
  toPublish: string[]
  /** Marcate e già online: nessuna scrittura, ma tornano comunque nel risultato — la pagina di
   *  pre-pubblicazione mostra un rigo di link per OGNI Raccolta marcata, non solo per quelle
   *  appena pubblicate. */
  alreadyPublished: string[]
}

export function planPublishBatch(rows: MarkedCollectionRow[]): PublishBatchPlan {
  const marked = rows.filter(r => r.marked_for_publish)
  return {
    toPublish: marked.filter(r => r.share_token === null).map(r => r.id),
    alreadyPublished: marked.filter(r => r.share_token !== null).map(r => r.id),
  }
}
