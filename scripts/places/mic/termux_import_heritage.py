#!/usr/bin/env python3
"""Import MiC ICCD (Catalogo Generale, arco:ArchitecturalOrLandscapeHeritage) -> dtrek_places.

Porta di fetch.ts --source heritage + normalize.ts/deduplicate.ts/import.ts in Python puro
(solo libreria standard: urllib, niente pip/npm) per girare in Termux, dove la Edge Function
Supabase equivalente si e' rivelata inutilizzabile: dati.cultura.gov.it rifiuta l'handshake TLS
dagli IP cloud/datacenter di Supabase ("tls handshake eof", riprodotto due volte identico),
verosimilmente un blocco anti-bot sul lato Ministero verso IP non residenziali/mobili come questo.

Uso:
  export SUPABASE_URL=https://sdxlcpxgbkagbxhukehd.supabase.co
  export SUPABASE_SERVICE_ROLE_KEY=...   # dalla Dashboard Supabase, MAI condivisa con Claude
  python termux_import_heritage.py --region Veneto --limit 5 --dry-run
  python termux_import_heritage.py --region Veneto --limit 5   # scrittura vera

--region va scritta con la stessa capitalizzazione usata da ArCo (es. "Veneto"), come nello
script TypeScript originale. Senza --region interroga senza filtro (piu' lento, valido comunque
entro --limit).
"""
import argparse
import json
import os
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

SPARQL_ENDPOINT = "https://dati.cultura.gov.it/sparql"
USER_AGENT = "DTrek/1.0 (places catalog batch import; mzulpt@gmail.com)"
ARCHITECTURAL_HERITAGE_CLASS = "https://w3id.org/arco/ontology/arco/ArchitecturalOrLandscapeHeritage"
CANDIDATE_POOL_CAP = 2000

MIC_TYPE_MAP = [
    ("area archeologic", "sito_archeologico"), ("scavi", "sito_archeologico"),
    ("necropoli", "sito_archeologico"), ("parco archeologic", "sito_archeologico"),
    ("castello", "castello"), ("rocca", "castello"), ("fortezza", "castello"),
    ("fortificazione", "castello"), ("forte", "castello"),
    ("abbazia", "abbazia"), ("monastero", "abbazia"), ("convento", "abbazia"), ("eremo", "abbazia"),
    ("chiesa", "chiesa"), ("basilica", "chiesa"), ("cattedrale", "chiesa"), ("santuario", "chiesa"),
    ("duomo", "chiesa"), ("battistero", "chiesa"),
    ("palazzo", "palazzo"), ("villa", "palazzo"), ("dimora storica", "palazzo"),
    ("teatro", "teatro"), ("anfiteatro", "teatro"),
    ("museo", "museo"), ("pinacoteca", "museo"), ("galleria", "museo"), ("collezione", "museo"),
    ("monumento", "monumento"), ("mausoleo", "monumento"), ("obelisco", "monumento"),
]


def mic_type_label_to_site_type(label):
    if not label:
        return "altro"
    lower = label.lower()
    for needle, site_type in MIC_TYPE_MAP:
        if needle in lower:
            return site_type
    return "altro"


def parse_heritage_address_label(label):
    if not label:
        return {}, {}
    parts = [p.strip() for p in label.split(",")]
    if len(parts) < 4:
        return None, None
    return (parts[1] or None), (parts[3] or None)


def build_heritage_query(region_label, limit):
    candidate_pool = min(CANDIDATE_POOL_CAP, max(limit * 4, 50))
    region_filter = ""
    if region_label:
        escaped = region_label.replace('"', "")
        region_filter = f'FILTER(CONTAINS(?addressLabel, "{escaped}"))'

    return f"""
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX clvapit: <https://w3id.org/italia/onto/CLV/>
PREFIX loc: <https://w3id.org/arco/ontology/location/>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

SELECT DISTINCT ?heritage ?name ?dcType ?addressLabel ?fullAddress ?depiction ?lat ?long WHERE {{
  {{
    SELECT DISTINCT ?heritage ?name ?addressLabel ?lat ?long WHERE {{
      ?heritage a <{ARCHITECTURAL_HERITAGE_CLASS}> ;
                rdfs:label ?name ;
                dcterms:spatial ?addr ;
                clvapit:hasGeometry ?geom .
      ?addr rdfs:label ?addressLabel .
      ?geom clvapit:hasGeometryType clvapit:Point .
      ?geom ?hasCoordPred ?coord .
      ?coord loc:lat ?lat ; loc:long ?long .
      {region_filter}
    }}
    LIMIT {candidate_pool}
  }}
  OPTIONAL {{ ?heritage dcterms:spatial ?addr2 . ?addr2 clvapit:fullAddress ?fullAddress . }}
  OPTIONAL {{ ?heritage dc:type ?dcType . }}
  OPTIONAL {{ ?heritage foaf:depiction ?depiction . }}
}}
LIMIT {limit}"""


TRANSIENT_STATUS = {429, 500, 502, 503, 504}
MAX_RETRIES = 4


def fetch_sparql_json(query):
    last_error = None
    for attempt in range(MAX_RETRIES + 1):
        if attempt > 0:
            time.sleep(2 ** (attempt - 1))
        req = urllib.request.Request(
            SPARQL_ENDPOINT,
            data=urllib.parse.urlencode({"query": query}).encode("utf-8"),
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/sparql-results+json",
                "User-Agent": USER_AGENT,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:500]
            if e.code not in TRANSIENT_STATUS:
                raise RuntimeError(f"MiC SPARQL {e.code}: {body}")
            last_error = RuntimeError(f"MiC SPARQL {e.code}: {body}")
        except (urllib.error.URLError, TimeoutError) as e:
            last_error = e
    raise last_error or RuntimeError("MiC SPARQL: troppi tentativi falliti")


def query_heritage_sparql(query):
    data = fetch_sparql_json(query)
    seen = set()
    out = []
    for row in data["results"]["bindings"]:
        iri = row.get("heritage", {}).get("value")
        if not iri:
            continue
        item_id = iri.rstrip("/").split("/")[-1]
        if not item_id:
            continue
        try:
            lat = float(row["lat"]["value"]) if "lat" in row else None
            lon = float(row["long"]["value"]) if "long" in row else None
        except (KeyError, ValueError):
            lat = lon = None
        if lat is None or lon is None:
            continue
        depiction = row.get("depiction", {}).get("value", "")
        dedup_key = f"{item_id}|{depiction}"
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        out.append({
            "id": item_id,
            "name": (row.get("name", {}).get("value") or "").strip() or "Bene architettonico o paesaggistico",
            "dc_type": row.get("dcType", {}).get("value"),
            "address_label": row.get("addressLabel", {}).get("value"),
            "full_address": row.get("fullAddress", {}).get("value"),
            "depiction": row.get("depiction", {}).get("value"),
            "lat": lat,
            "long": lon,
        })
    return out


def heritage_binding_to_candidate(b):
    region, municipality = parse_heritage_address_label(b["address_label"])
    source_url = f"https://catalogo.beniculturali.it/detail/ArchitecturalOrLandscapeHeritage/{b['id']}"
    return {
        "name": b["name"],
        "meta_type": "sito",
        "subtype": mic_type_label_to_site_type(b["name"]),
        "latitude": b["lat"],
        "longitude": b["long"],
        "region": region,
        "municipality": municipality,
        "address": b["full_address"],
        "image_url": b["depiction"],
        "source": "mic_iccd",
        "source_id": b["id"],
        "source_url": source_url,
        "raw_type": b["dc_type"],
        "confidence": 0.75,
        "metadata": {"iccdDcType": b["dc_type"]},
    }


# ── normalize.ts ─────────────────────────────────────────────────────────────────────────────────
ITALY_BBOX = {"min_lat": 35, "max_lat": 48, "min_lon": 6, "max_lon": 19}


def is_plausible_italian_coordinate(lat, lon):
    return (ITALY_BBOX["min_lat"] <= lat <= ITALY_BBOX["max_lat"]
            and ITALY_BBOX["min_lon"] <= lon <= ITALY_BBOX["max_lon"])


def normalize_for_comparison(s):
    stripped = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
    out = []
    for c in stripped.lower():
        out.append(c if c.isalnum() else " ")
    return " ".join("".join(out).split())


def name_token_similarity(a, b):
    tokens_a = set(normalize_for_comparison(a).split())
    tokens_b = set(normalize_for_comparison(b).split())
    if not tokens_a or not tokens_b:
        return 0
    intersection = len(tokens_a & tokens_b)
    union = len(tokens_a) + len(tokens_b) - intersection
    return intersection / union if union else 0


def same_municipality(a, b):
    if not a or not b:
        return False
    return normalize_for_comparison(a) == normalize_for_comparison(b)


# ── lib/geoUtils.ts ──────────────────────────────────────────────────────────────────────────────
def haversine_m(lat1, lon1, lat2, lon2):
    import math
    r = 6371000
    f1, f2 = math.radians(lat1), math.radians(lat2)
    df = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(df / 2) ** 2 + math.cos(f1) * math.cos(f2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── deduplicate.ts ───────────────────────────────────────────────────────────────────────────────
AUTO_MERGE_THRESHOLD = 0.9
REVIEW_THRESHOLD = 0.6
MAX_MATCH_DISTANCE_M = 2000


def distance_score(distance_m):
    if distance_m > MAX_MATCH_DISTANCE_M:
        return 0
    if distance_m <= 30:
        return 1
    return 1 - (distance_m - 30) / (MAX_MATCH_DISTANCE_M - 30)


def score_candidate_against_place(candidate, existing):
    dist_m = haversine_m(candidate["latitude"], candidate["longitude"], existing["latitude"], existing["longitude"])
    dist_score = distance_score(dist_m)
    if dist_score == 0:
        return {"place": existing, "confidence": 0}

    name_score = name_token_similarity(candidate["name"], existing["name"])
    municipality_score = 1 if same_municipality(candidate.get("municipality"), existing.get("municipality")) else 0
    type_score = 1 if (
        candidate["meta_type"] == existing["meta_type"]
        and (not candidate.get("subtype") or not existing.get("subtype") or candidate["subtype"] == existing["subtype"])
    ) else 0

    confidence = dist_score * 0.5 + name_score * 0.3 + municipality_score * 0.1 + type_score * 0.1
    return {"place": existing, "confidence": confidence}


def find_best_match(candidate, nearby_existing):
    best = None
    for existing in nearby_existing:
        result = score_candidate_against_place(candidate, existing)
        if best is None or result["confidence"] > best["confidence"]:
            best = result
    return best


# ── import.ts (via REST/PostgREST invece di supabase-js) ────────────────────────────────────────
NEARBY_DEGREES = 0.03
EXISTING_PLACE_COLS = "id,name,meta_type,subtype,latitude,longitude,municipality,municipality_istat_code,wikidata_id,source,source_id,metadata"


class SupabaseRest:
    def __init__(self, url, service_key):
        self.base = url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        }

    def _request(self, method, path, params=None, body=None, extra_headers=None):
        query = f"?{urllib.parse.urlencode(params)}" if params else ""
        headers = dict(self.headers)
        if extra_headers:
            headers.update(extra_headers)
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(f"{self.base}/{path}{query}", data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                raw = res.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            body_text = e.read().decode("utf-8", "replace")
            raise RuntimeError(f"Supabase REST {method} {path} -> {e.code}: {body_text}")

    def select(self, table, params):
        return self._request("GET", table, params=params)

    def patch(self, table, params, body):
        return self._request("PATCH", table, params=params, body=body, extra_headers={"Prefer": "return=minimal"})

    def upsert(self, table, on_conflict, body):
        return self._request(
            "POST", table, params={"on_conflict": on_conflict}, body=body,
            extra_headers={"Prefer": "resolution=merge-duplicates,return=representation"},
        )


def merge_metadata(existing, incoming):
    base = dict(existing or {})
    if not incoming:
        return base
    merged = {**base, **incoming}
    existing_prov = base.get("fieldProvenance") or {}
    incoming_prov = incoming.get("fieldProvenance") or {}
    if existing_prov or incoming_prov:
        merged["fieldProvenance"] = {**existing_prov, **incoming_prov}
    return merged


def find_existing_by_source_id(db, candidate):
    rows = db.select("dtrek_places", {
        "select": EXISTING_PLACE_COLS,
        "source": f"eq.{candidate['source']}",
        "source_id": f"eq.{candidate['source_id']}",
    })
    return rows[0] if rows else None


def find_nearby_existing(db, candidate):
    # PostgREST non accetta due condizioni (gte/lte) sulla stessa colonna come due query-param
    # separati (l'ultimo sovrascriverebbe il primo) — serve il combinatore and=(...) esplicito.
    and_filter = (
        f"(latitude.gte.{candidate['latitude'] - NEARBY_DEGREES},"
        f"latitude.lte.{candidate['latitude'] + NEARBY_DEGREES},"
        f"longitude.gte.{candidate['longitude'] - NEARBY_DEGREES},"
        f"longitude.lte.{candidate['longitude'] + NEARBY_DEGREES})"
    )
    return db.select("dtrek_places", {
        "select": EXISTING_PLACE_COLS,
        "meta_type": f"eq.{candidate['meta_type']}",
        "and": and_filter,
    }) or []


def link_source_to_place(db, place_id, candidate):
    db.upsert("dtrek_place_sources", "source,source_id", [{
        "place_id": place_id,
        "source": candidate["source"],
        "source_id": candidate["source_id"],
        "source_url": candidate.get("source_url"),
        "raw_type": candidate.get("raw_type"),
        "confidence": candidate["confidence"],
        "last_synced_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }])


def candidate_to_partial_update(candidate, existing_metadata):
    updates = {
        "name": candidate["name"],
        "latitude": candidate["latitude"],
        "longitude": candidate["longitude"],
        "confidence": candidate["confidence"],
    }
    for key in ("subtype", "region", "municipality", "address", "image_url"):
        if candidate.get(key) is not None:
            updates[key] = candidate[key]
    if candidate.get("metadata") is not None:
        updates["metadata"] = merge_metadata(existing_metadata, candidate["metadata"])
    return updates


def refresh_existing_place(db, place_id, candidate, existing_metadata):
    db.patch("dtrek_places", {"id": f"eq.{place_id}"}, candidate_to_partial_update(candidate, existing_metadata))


def insert_new_place(db, candidate, review):
    existing_rows = db.select("dtrek_places", {
        "select": "metadata",
        "source": f"eq.{candidate['source']}",
        "source_id": f"eq.{candidate['source_id']}",
    })
    existing_metadata = existing_rows[0]["metadata"] if existing_rows else None
    metadata = merge_metadata(existing_metadata, candidate.get("metadata"))
    if review:
        metadata["needsReview"] = True
        metadata["reviewCandidateOf"] = review["matched_place_id"]
        metadata["reviewConfidence"] = review["confidence"]

    row = {
        "name": candidate["name"],
        "meta_type": candidate["meta_type"],
        "subtype": candidate.get("subtype"),
        "latitude": candidate["latitude"],
        "longitude": candidate["longitude"],
        "region": candidate.get("region"),
        "municipality": candidate.get("municipality"),
        "address": candidate.get("address"),
        "image_url": candidate.get("image_url"),
        "source": candidate["source"],
        "source_id": candidate["source_id"],
        "confidence": candidate["confidence"],
        "metadata": metadata,
    }
    result = db.upsert("dtrek_places", "source,source_id", [row])
    return result[0]["id"]


def import_place_candidates(db, candidates):
    stats = {
        "processed": 0, "linked_to_existing": 0, "refreshed_existing": 0,
        "created_new": 0, "flagged_for_review": 0, "skipped_invalid_coordinates": 0,
        "errors": [],
    }

    for candidate in candidates:
        stats["processed"] += 1

        if not is_plausible_italian_coordinate(candidate["latitude"], candidate["longitude"]):
            stats["skipped_invalid_coordinates"] += 1
            continue

        try:
            exact = find_existing_by_source_id(db, candidate)
            if exact:
                refresh_existing_place(db, exact["id"], candidate, exact.get("metadata"))
                link_source_to_place(db, exact["id"], candidate)
                stats["refreshed_existing"] += 1
                stats["linked_to_existing"] += 1
                continue

            nearby = find_nearby_existing(db, candidate)
            match = find_best_match(candidate, nearby)

            if match and match["confidence"] >= AUTO_MERGE_THRESHOLD:
                place = match["place"]
                if place["source"] == candidate["source"] and place["source_id"] == candidate["source_id"]:
                    refresh_existing_place(db, place["id"], candidate, place.get("metadata"))
                    stats["refreshed_existing"] += 1
                link_source_to_place(db, place["id"], candidate)
                stats["linked_to_existing"] += 1
                continue

            review = None
            if match and match["confidence"] >= REVIEW_THRESHOLD:
                review = {"confidence": match["confidence"], "matched_place_id": match["place"]["id"]}
            place_id = insert_new_place(db, candidate, review)
            link_source_to_place(db, place_id, candidate)
            stats["created_new"] += 1
            if review:
                stats["flagged_for_review"] += 1
        except Exception as e:  # noqa: BLE001 — best-effort batch import, un errore non deve fermare gli altri
            stats["errors"].append({"candidate_name": candidate["name"], "message": str(e)})

    return stats


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--region", default=None)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print(f"Interrogo {SPARQL_ENDPOINT} [arco:ArchitecturalOrLandscapeHeritage] "
          f"(regione: {args.region or 'tutta Italia'}, limit {args.limit})…")
    bindings = query_heritage_sparql(build_heritage_query(args.region, args.limit))
    print(f"{len(bindings)} risultati con coordinate dirette.")
    candidates = [heritage_binding_to_candidate(b) for b in bindings]

    if args.dry_run:
        print("[DRY RUN] Esempio candidato:", json.dumps(candidates[0] if candidates else None, indent=2, ensure_ascii=False))
        print(f"[DRY RUN] {len(candidates)} candidati totali pronti, nessuna scrittura.")
        return

    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        print("Imposta SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY come variabili d'ambiente, oppure usa --dry-run.", file=sys.stderr)
        sys.exit(1)

    db = SupabaseRest(supabase_url, service_key)
    stats = import_place_candidates(db, candidates)
    print(json.dumps(stats, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
