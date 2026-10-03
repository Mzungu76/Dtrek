
with c as (select id from dtrek_places where source = 'gpx' and source_id in ('cammino/cammino-della-pace','cammino/cammino-della-magna-grecia','cammino/via-dellasceta','cammino/percorso-santa-spina','cammino/cammino-della-madonna-nera','cammino/cammino-del-salento-via-dei-borghi','cammino/cammino-del-salento-via-del-mare','cammino/cammino-dellacqua','cammino/cammino-del-perdono','cammino/cammino-del-santo-marino','cammino/cammino-del-beato-enrico','cammino/cammino-della-pace-varianti','cammino/cammino-della-magna-grecia-varianti','cammino/cammino-dellacqua-varianti')),
ends as (
  select t.id tid, t.polyline->0 p0, t.polyline->-1 p1, t.from_name, t.to_name
  from dtrek_cammino_tappe t join c on c.id = t.cammino_id
),
pick as (
  select e.tid,
    (select jsonb_build_object('id', b.id, 'name', b.name) from dtrek_places b where b.meta_type = 'borgo_citta'
       and st_dwithin(b.geometry::geography, st_setsrid(st_makepoint((e.p0->>1)::float, (e.p0->>0)::float), 4326)::geography, 1500)
       order by b.geometry <-> st_setsrid(st_makepoint((e.p0->>1)::float, (e.p0->>0)::float), 4326) limit 1) f,
    (select jsonb_build_object('id', b.id, 'name', b.name) from dtrek_places b where b.meta_type = 'borgo_citta'
       and st_dwithin(b.geometry::geography, st_setsrid(st_makepoint((e.p1->>1)::float, (e.p1->>0)::float), 4326)::geography, 1500)
       order by b.geometry <-> st_setsrid(st_makepoint((e.p1->>1)::float, (e.p1->>0)::float), 4326) limit 1) t
  from ends e
)
update dtrek_cammino_tappe x set
  from_place_id = case when (p.f->>'id') is not null and (x.from_name is null or lower(x.from_name) = lower(p.f->>'name')) then (p.f->>'id')::uuid else x.from_place_id end,
  to_place_id   = case when (p.t->>'id') is not null and (x.to_name is null or lower(x.to_name) = lower(p.t->>'name')) then (p.t->>'id')::uuid else x.to_place_id end,
  from_name = coalesce(x.from_name, p.f->>'name'),
  to_name = coalesce(x.to_name, p.t->>'name')
from pick p where p.tid = x.id;

insert into dtrek_place_relations (from_place_id, to_place_id, relation_type, metadata)
select t.cammino_id, a.pid, 'near', jsonb_build_object('tappe', jsonb_agg(distinct a.ord order by a.ord))
from dtrek_cammino_tappe t
join dtrek_places c on c.id = t.cammino_id and c.source = 'gpx' and c.source_id in ('cammino/cammino-della-pace','cammino/cammino-della-magna-grecia','cammino/via-dellasceta','cammino/percorso-santa-spina','cammino/cammino-della-madonna-nera','cammino/cammino-del-salento-via-dei-borghi','cammino/cammino-del-salento-via-del-mare','cammino/cammino-dellacqua','cammino/cammino-del-perdono','cammino/cammino-del-santo-marino','cammino/cammino-del-beato-enrico','cammino/cammino-della-pace-varianti','cammino/cammino-della-magna-grecia-varianti','cammino/cammino-dellacqua-varianti')
cross join lateral (values (t.from_place_id, t.ordinal), (t.to_place_id, t.ordinal)) a(pid, ord)
where a.pid is not null
group by t.cammino_id, a.pid
on conflict (from_place_id, to_place_id, relation_type) do update set metadata = excluded.metadata;