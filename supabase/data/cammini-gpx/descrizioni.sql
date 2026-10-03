-- Descrizioni brevi dal file del catalogo (sintesi informative, da verificare sui siti ufficiali). Idempotente; non tocca altri campi.
update dtrek_places p set description = v.d
from (values
  ('cammino/cammino-santuari-del-mare', $q$Cammino ligure tra santuari e borghi del territorio costiero e dell’entroterra, con panorami sul mare e percorsi devozionali.$q$),
  ('cammino/cammino-dei-picentini', $q$Percorso nell’area dei Monti Picentini, tra Campania interna, borghi, santuari, natura e testimonianze della tradizione religiosa.$q$),
  ('cammino/cammino-dei-francescani-abruzzo', $q$Itinerario abruzzese legato alla presenza e alla tradizione francescana, tra luoghi di culto, borghi e paesaggi dell’Appennino.$q$),
  ('cammino/cammino-dei-florensi', $q$Percorso calabrese legato alla figura di Gioacchino da Fiore e all’eredità florense, tra Sila, borghi, abbazie e paesaggi montani.$q$),
  ('cammino/cammino-dei-florensi-variante-prato-piano', $q$Percorso calabrese legato alla figura di Gioacchino da Fiore e all’eredità florense, tra Sila, borghi, abbazie e paesaggi montani.$q$),
  ('cammino/cammino-dei-cappuccini', $q$Itinerario francescano nelle Marche legato alla storia dei Cappuccini, attraverso conventi, santuari, borghi e paesaggi appenninici.$q$),
  ('cammino/cammino-delle-sette-sorelle', $q$Nuovo itinerario abruzzese dedicato a una rete di luoghi religiosi e comunità locali, attraverso paesaggi e borghi dell’Appennino.$q$),
  ('cammino/cammini-madonna-del-monticino', $q$Sistema di percorsi ad anello nell’area di Brisighella, tra santuario, borghi medievali, Vena del Gesso, calanchi e luoghi storici.$q$),
  ('cammino/anello-cimino-santi-patroni', $q$Percorso ad anello nell’area dei Monti Cimini, tra luoghi di culto, borghi, boschi e paesaggio vulcanico.$q$),
  ('cammino/alta-via-delle-grazie', $q$Cammino alpino lombardo che collega Bergamo con la Val Seriana e l’Alto Sebino, unendo santuari, borghi, natura, arte e tradizioni locali.$q$),
  ('cammino/cammino-basiliano-tratto-calabro', $q$Grande itinerario dell’Italia meridionale che attraversa Calabria e Basilicata seguendo antiche vie legate alla presenza monastica basiliana, tra montagne, borghi e luoghi di culto.$q$),
  ('cammino/cammino-basiliano-tratto-lucano', $q$Grande itinerario dell’Italia meridionale che attraversa Calabria e Basilicata seguendo antiche vie legate alla presenza monastica basiliana, tra montagne, borghi e luoghi di culto.$q$),
  ('cammino/cammino-della-pace', $q$Percorso attraverso Abruzzo, Molise e Puglia che collega luoghi religiosi, memoria, paesaggio e tradizioni dei territori attraversati.$q$),
  ('cammino/cammino-della-magna-grecia', $q$Grande itinerario calabrese che unisce storia della Magna Grecia, antiche vie, luoghi religiosi, borghi e paesaggi montani e costieri.$q$),
  ('cammino/via-dellasceta', $q$Grande itinerario calabrese che unisce storia della Magna Grecia, antiche vie, luoghi religiosi, borghi e paesaggi montani e costieri.$q$),
  ('cammino/percorso-santa-spina', $q$Breve itinerario calabrese dedicato alla devozione della Santa Spina e ai luoghi di culto collegati alla tradizione locale.$q$),
  ('cammino/cammino-della-madonna-nera', $q$Itinerario lucano dedicato alla devozione mariana della Madonna Nera, tra santuari, borghi e paesaggi dell’Appennino meridionale.$q$),
  ('cammino/cammino-del-salento-via-dei-borghi', $q$Percorso pugliese che attraversa il Salento da nord a sud tra piccoli centri, campagne, coste, masserie, chiese e luoghi della tradizione religiosa.$q$),
  ('cammino/cammino-del-salento-via-del-mare', $q$Percorso pugliese che attraversa il Salento da nord a sud tra piccoli centri, campagne, coste, masserie, chiese e luoghi della tradizione religiosa.$q$),
  ('cammino/cammino-dellacqua', $q$Cammino molisano dedicato al rapporto tra acqua, territorio e comunità, attraverso sorgenti, borghi, chiese e paesaggi dell’Appennino.$q$),
  ('cammino/cammino-del-perdono', $q$Itinerario tra Abruzzo e Molise dedicato a Celestino V, con borghi, eremi, luoghi della sua vita e paesaggi dell’Appennino.$q$),
  ('cammino/cammino-del-santo-marino', $q$Percorso tra Emilia-Romagna e San Marino legato alla figura di San Marino e alla storia religiosa del territorio, tra borghi e paesaggi collinari.$q$),
  ('cammino/cammino-del-beato-enrico', $q$Percorso tra Veneto e Trentino-Alto Adige legato alla figura del beato Enrico, tra luoghi di culto, borghi e paesaggi alpini.$q$),
  ('cammino/cammino-di-oropa', $q$Itinerario piemontese verso il Santuario di Oropa, tra Biellese, montagne, borghi, santuari e paesaggi alpini.$q$),
  ('cammino/cammino-di-san-michele', $q$Grande itinerario dedicato all’Arcangelo Michele che attraversa diverse regioni italiane collegando luoghi micaelici, santuari e territori storici.$q$),
  ('cammino/cammino-di-hasekura', $q$Percorso nel Lazio legato alla storia della missione giapponese di Hasekura Tsunenaga e dei martiri cristiani giapponesi, tra Roma e luoghi religiosi.$q$),
  ('cammino/cammino-di-don-tonino', $q$Itinerario pugliese dedicato a don Tonino Bello, ai suoi luoghi di vita e alla sua testimonianza, tra borghi, campagne e luoghi di culto.$q$),
  ('cammino/cammino-delle-44-chiesette-votive', $q$Percorso friulano tra le Valli del Natisone che collega 44 chiesette votive, borghi, boschi e testimonianze della cultura locale.$q$),
  ('cammino/via-di-francesco-nel-lazio', $q$Percorso laziale sulle tracce di San Francesco, tra Rieti, valle reatina, eremi, conventi e paesaggi appenninici.$q$),
  ('cammino/cammino-di-assisi', $q$Cammino tra Emilia-Romagna, Toscana e Umbria che conduce verso Assisi attraverso borghi, santuari, monasteri e paesaggi appenninici.$q$)
) v(source_id, d)
where p.source = 'gpx' and p.source_id = v.source_id;

-- Via Francigena (importata da OpenStreetMap): solo se manca il testo o il sito.
update dtrek_places set description = coalesce(description, $q$Grande itinerario europeo di pellegrinaggio verso Roma, attraversando il territorio italiano dalla Valle d’Aosta al Sud attraverso borghi, città, pievi e paesaggi molto diversi.$q$),
  official_url = coalesce(official_url, $q$https://www.viefrancigene.org/$q$)
where source = 'osm' and source_id = 'cammino/via-francigena';