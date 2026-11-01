#!/usr/bin/env python3
"""Phase 0 sample for NASA FIRMS active fire detections in Galicia.

Uses the yearly per-country archives (no MAP_KEY needed), which exist for
VIIRS S-NPP and MODIS. Keeps detections inside the Galicia bounding box for
the requested month and, when the concellos layer is available locally,
assigns each one to a concello (point in polygon) and drops points outside
Galicia (Asturias, León, Zamora).

NOAA-20 and NOAA-21 have no country archive; they need the area API with a
MAP_KEY (FIRMS_MAP_KEY secret), see README.

Usage:
  python3 -I descargar.py [--ano 2025] [--mes 8] [--saida mostra]
         [--concellos ../../../data-out/concellos-parroquias/data.geojson]

Stdlib only. Each fetch is logged in <saida>/rexistro.json.
"""

import argparse
import csv
import io
import json
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

UA = "mapas-galicia-sustentable-fase0 (galiciasustentable@galiciasustentable.org)"
BASE = "https://firms.modaps.eosdis.nasa.gov/data/country"
PRODUTOS = {"viirs-snpp": "VIIRS S-NPP (375 m)", "modis": "MODIS Aqua/Terra (1 km)"}
BBOX = (-9.35, 41.8, -6.7, 43.8)  # lon_min, lat_min, lon_max, lat_max
REPO = Path(__file__).resolve().parents[3]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read(), dict(r.headers)


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
        rings = [ring for poly in polys for ring in poly]
        xs = [x for r in rings for x, _ in r]
        ys = [y for r in rings for _, y in r]
        out.append((p["codigo_ine"], p["nome"], (min(xs), min(ys), max(xs), max(ys)), polys))
    return out


def inside_ring(x, y, ring):
    c = False
    j = len(ring) - 1
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


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--ano", type=int, default=2025)
    p.add_argument("--mes", type=int, default=8)
    p.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    p.add_argument("--concellos", default=str(REPO / "data-out/concellos-parroquias/data.geojson"))
    a = p.parse_args()
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    concellos = load_concellos(a.concellos)
    prefix = f"{a.ano}-{a.mes:02d}"
    log, rows_out = [], []
    for prod, desc in PRODUTOS.items():
        url = f"{BASE}/{prod}/{a.ano}/{prod}_{a.ano}_Spain.csv"
        raw, headers = get(url)
        reader = csv.DictReader(io.StringIO(raw.decode("utf-8")))
        fields = reader.fieldnames
        n_total = n_bbox = n_gal = 0
        for r in reader:
            n_total += 1
            if not r["acq_date"].startswith(prefix):
                continue
            x, y = float(r["longitude"]), float(r["latitude"])
            if not (BBOX[0] <= x <= BBOX[2] and BBOX[1] <= y <= BBOX[3]):
                continue
            n_bbox += 1
            hit = locate(x, y, concellos) if concellos else ("", "")
            if hit is None:
                continue
            n_gal += 1
            rows_out.append({"produto": prod, **{k: r[k] for k in fields}, "codigo_ine": hit[0], "concello": hit[1]})
        log.append({"produto": desc, "url": url, "bytes": len(raw), "last_modified": headers.get("Last-Modified"),
                    "descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "deteccions_espana_ano": n_total, f"deteccions_bbox_{prefix}": n_bbox,
                    f"deteccions_galicia_{prefix}": n_gal if concellos else None})
        print(prod, n_total, n_bbox, n_gal)
    out = saida / f"firms_galicia_{prefix}.csv"
    keys = list(dict.fromkeys(k for r in rows_out for k in r))
    with out.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(sorted(rows_out, key=lambda r: (r["acq_date"], r["acq_time"])))
    passes = Counter((r["produto"], r["acq_date"], r["acq_time"][:2]) for r in rows_out)
    log.append({"saida": out.name, "filas": len(rows_out), "pasadas_distintas_dia_hora": len(passes),
                "recorte": "polígono dos concellos" if concellos else f"só bbox {BBOX}"})
    rex = saida / "rexistro.json"
    prev = json.loads(rex.read_text()) if rex.exists() else []
    rex.write_text(json.dumps(prev + log, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
