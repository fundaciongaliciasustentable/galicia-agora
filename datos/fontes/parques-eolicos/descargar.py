#!/usr/bin/env python3
"""Phase 0 sample for wind farms in Galicia with commissioning date.

Two sources, one request each:
  1. OpenStreetMap through the Overpass API (ODbL): wind plants
     (power=plant + plant:source=wind) and wind turbines
     (power=generator + generator:source=wind) in the Galicia bbox, with
     start_date when mapped. Points are assigned to a concello with the
     polygons of data-out/concellos-parroquias/data.geojson when present
     (drops Asturias, León, Zamora and Portugal).
  2. MITECO Electra, Registro de productores de energía eléctrica: the
     Excel export (sheet "Fases": name, net and gross power in kW,
     commissioning date, deregistration date, phase, autonomous community).
     The register has no technology column and no coordinates: wind farms
     are picked by name (P.E., PE, PARQUE EOLICO...). Only Galicia rows
     are kept; the full 5 MB file is not stored.

Output (in --saida, default mostra/):
  osm_eolica_galicia.csv     one row per OSM plant or turbine
  electra_fases_galicia.csv  Galicia rows of the Electra "Fases" sheet
  rexistro.json              UTC time, URLs, bytes, counts

Usage: python3 -I descargar.py [--saida mostra] [--concellos PATH]
Stdlib only.
"""

import argparse
import csv
import io
import json
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

UA = ("MapasGaliciaSustentable/0.1 (+https://mapas.galiciasustentable.org; "
      "galiciasustentable@galiciasustentable.org)")
OVERPASS = "https://overpass-api.de/api/interpreter"
ELECTRA = "https://energia.serviciosmin.gob.es/Electra/descargarExcelProduccion.aspx"
BBOX = (-9.35, 41.8, -6.7, 43.8)  # lon_min, lat_min, lon_max, lat_max
REPO = Path(__file__).resolve().parents[3]
QUERY = """[out:json][timeout:180];
(
  nwr["power"="plant"]["plant:source"="wind"]({s},{w},{n},{e});
  node["power"="generator"]["generator:source"="wind"]({s},{w},{n},{e});
);
out tags center;""".format(w=BBOX[0], s=BBOX[1], e=BBOX[2], n=BBOX[3])
EOLICO = re.compile(r"\bP\.?\s?E\.?\s|^PE\b|E[OÓ]LIC|AEROXERADOR|AEROGENERADOR", re.I)

log = []
_last = {}


def get(url, data=None, timeout=300):
    host = urllib.parse.urlsplit(url).netloc
    wait = 1.1 - (time.monotonic() - _last.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body, status, hdr = r.read(), r.status, dict(r.headers)
    _last[host] = time.monotonic()
    log.append({"url": url, "method": "POST" if data else "GET", "status": status,
                "bytes": len(body), "content_type": hdr.get("Content-Type"),
                "last_modified": hdr.get("Last-Modified")})
    return body


# --- concellos (same approach as datos/fontes/nasa-firms) -------------------

def load_concellos(path):
    if not path or not Path(path).exists():
        return None
    out = []
    for f in json.loads(Path(path).read_text())["features"]:
        p = f["properties"]
        if p.get("nivel") != "concello":
            continue
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        xs = [x for poly in polys for ring in poly for x, _ in ring]
        ys = [y for poly in polys for ring in poly for _, y in ring]
        out.append((p["codigo_ine"], p["nome"], (min(xs), min(ys), max(xs), max(ys)), polys))
    return out


def inside_ring(x, y, ring):
    c, j = False, len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][:2]
        xj, yj = ring[j][:2]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def locate(x, y, concellos):
    for code, name, (x0, y0, x1, y1), polys in concellos:
        if x0 <= x <= x1 and y0 <= y <= y1:
            for poly in polys:
                if inside_ring(x, y, poly[0]) and not any(inside_ring(x, y, h) for h in poly[1:]):
                    return code, name
    return None


# --- OSM ----------------------------------------------------------------------

OSM_TAGS = ["name", "start_date", "operator", "plant:output:electricity",
            "generator:output:electricity", "manufacturer", "model", "height",
            "rotor:diameter", "ref", "source"]


def osm(concellos):
    body = get(OVERPASS, urllib.parse.urlencode({"data": QUERY}).encode())
    d = json.loads(body)
    rows = []
    for el in d["elements"]:
        t = el.get("tags", {})
        lat = el.get("lat", el.get("center", {}).get("lat"))
        lon = el.get("lon", el.get("center", {}).get("lon"))
        if lat is None:
            continue
        loc = locate(lon, lat, concellos) if concellos else ("", "")
        if loc is None:
            continue
        rows.append({"osm_type": el["type"], "osm_id": el["id"],
                     "kind": "plant" if t.get("power") == "plant" else "generator",
                     "lat": round(lat, 6), "lon": round(lon, 6),
                     "codigo_ine": loc[0], "concello": loc[1],
                     **{k.replace(":", "_"): t.get(k, "") for k in OSM_TAGS}})
    return d.get("osm3s", {}), rows


# --- Electra --------------------------------------------------------------------

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def xlsx_rows(z, sheet, strings):
    for row in ET.fromstring(z.read(sheet)).iter(M + "row"):
        d = {}
        for c in row.findall(M + "c"):
            col = re.match(r"[A-Z]+", c.get("r")).group()
            v = c.find(M + "v")
            if c.get("t") == "s" and v is not None:
                d[col] = strings[int(v.text)]
            elif c.get("t") == "inlineStr":
                d[col] = "".join(x.text or "" for x in c.iter(M + "t"))
            else:
                d[col] = v.text if v is not None else ""
        yield d


def electra():
    body = get(ELECTRA)
    z = zipfile.ZipFile(io.BytesIO(body))
    strings = ["".join(t.text or "" for t in si.iter(M + "t"))
               for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall(M + "si")]
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    names = [s.get("name") for s in wb.iter(M + "sheet")]
    # sheet order in the workbook: Instalaciones, Fases
    sheet = "xl/worksheets/sheet%d.xml" % (names.index("Fases") + 1)
    it = xlsx_rows(z, sheet, strings)
    header = next(it)
    cols = sorted(header, key=lambda c: (len(c), c))
    fields = [header[c] for c in cols]
    total, rows = 0, []
    for d in it:
        total += 1
        if d.get(cols[fields.index("Autonomia")]) != "Galicia":
            continue
        r = {header[c]: d.get(c, "") for c in cols}
        r["nome_eolico"] = "1" if EOLICO.search(r["INSTALACION"] or "") else "0"
        rows.append(r)
    return {"sheets": names, "fases_rows": total, "columns": fields}, rows


def kw(v):
    try:
        return float(v.replace(".", "").replace(",", "."))
    except (AttributeError, ValueError):
        return 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--saida", default=str(Path(__file__).resolve().parent / "mostra"))
    ap.add_argument("--concellos", default=str(REPO / "data-out/concellos-parroquias/data.geojson"))
    a = ap.parse_args()
    out = Path(a.saida)
    out.mkdir(parents=True, exist_ok=True)
    started = datetime.now(timezone.utc).isoformat(timespec="seconds")
    concellos = load_concellos(a.concellos)

    meta_osm, osm_rows = osm(concellos)
    with open(out / "osm_eolica_galicia.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(osm_rows[0]))
        w.writeheader()
        w.writerows(osm_rows)

    meta_el, el_rows = electra()
    with open(out / "electra_fases_galicia.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(el_rows[0]))
        w.writeheader()
        w.writerows(el_rows)

    plants = [r for r in osm_rows if r["kind"] == "plant"]
    gens = [r for r in osm_rows if r["kind"] == "generator"]
    wind = [r for r in el_rows if r["nome_eolico"] == "1"]
    year = lambda s: (s or "")[6:10]
    counts = {
        "osm_timestamp": meta_osm.get("timestamp_osm_base"),
        "osm_plants": len(plants),
        "osm_plants_with_start_date": sum(1 for r in plants if r["start_date"]),
        "osm_plants_with_output": sum(1 for r in plants if r["plant_output_electricity"]),
        "osm_generators": len(gens),
        "osm_generators_with_start_date": sum(1 for r in gens if r["start_date"]),
        "osm_plant_start_years": dict(sorted(Counter(r["start_date"][:4] for r in plants
                                                     if r["start_date"]).items())),
        "electra": meta_el,
        "electra_galicia_rows": len(el_rows),
        "electra_galicia_wind_by_name": len(wind),
        "electra_galicia_wind_by_name_mw": round(sum(kw(r["POTENCIANETA"]) for r in wind) / 1000, 1),
        "electra_wind_without_commissioning_date": sum(1 for r in wind if not r["FECHAPUESTASERVICIO"]),
        "electra_wind_with_deregistration": sum(1 for r in wind if r["FECHABAJA"]),
        "electra_wind_commissioning_years": dict(sorted(Counter(
            year(r["FECHAPUESTASERVICIO"]) for r in wind if r["FECHAPUESTASERVICIO"]).items())),
        "concellos_filter": bool(concellos),
    }
    files = {p.name: p.stat().st_size for p in sorted(out.iterdir()) if p.name != "rexistro.json"}
    (out / "rexistro.json").write_text(json.dumps(
        {"started_utc": started,
         "finished_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
         "overpass_query": QUERY, "requests": log, "files": files, "counts": counts},
        ensure_ascii=False, indent=1))
    print(json.dumps(counts, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
