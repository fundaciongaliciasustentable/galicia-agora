#!/usr/bin/env python3
"""Phase 0 sample for MITMA big-data mobility (estudios básicos, viajes).

Streams one or more national daily files, keeps only the flows that start or
end in Galicia and aggregates them to hour x origin x destination. External
zones are collapsed to their province code so the sample stays small.

Usage:
  python3 -I descargar.py 20250514 20250518 [--nivel municipios|distritos|GAU]
         [--saida mostra]

Stdlib only. Every fetch is logged in <saida>/rexistro.json (UTC time, URL,
bytes, Last-Modified) so the sample can be reproduced.
"""

import argparse
import csv
import gzip
import io
import json
import sys
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://movilidad-opendata.mitma.es"
UA = "mapas-galicia-sustentable-fase0 (galiciasustentable@galiciasustentable.org)"
GALICIA = ("15", "27", "32", "36")
NIVEL_COL = {"municipios": "municipio_mitma", "distritos": "distrito_mitma", "GAU": "gau_mitma"}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=120)


def galician_zones(nivel, saida):
    """Zone ids at this level whose INE municipalities are Galician."""
    url = f"{BASE}/zonificacion/relacion_ine_zonificacionMitma.csv"
    with get(url) as r:
        text = r.read().decode("utf-8")
    zones = defaultdict(set)
    for row in csv.DictReader(io.StringIO(text), delimiter="|"):
        if row["municipio_ine"][:2] in GALICIA:
            zones[row[NIVEL_COL[nivel]]].add(row["municipio_ine"])
    # Zone -> INE concellos table, needed later to map zones onto the concellos layer.
    out = saida / f"zonas_{nivel}_galicia.csv"
    with out.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["zona_mitma", "n_concellos", "concellos_ine"])
        for z in sorted(zones):
            w.writerow([z, len(zones[z]), " ".join(sorted(zones[z]))])
    return set(zones), url


def fold(zone, gal):
    return zone if zone in gal else f"fora_{zone[:2]}"


def process_day(fecha, nivel, gal, saida, log):
    ym = f"{fecha[:4]}-{fecha[4:6]}"
    url = f"{BASE}/estudios_basicos/por-{nivel}/viajes/ficheros-diarios/{ym}/{fecha}_Viajes_{nivel}.csv.gz"
    agg = defaultdict(lambda: [0.0, 0.0, 0])
    stats = {"filas_total": 0, "filas_galicia": 0, "viaxes_min": None, "tamaño_gz": None}
    with get(url) as r:
        stats["tamaño_gz"] = int(r.headers.get("Content-Length", 0))
        stats["last_modified"] = r.headers.get("Last-Modified")
        reader = csv.DictReader(io.TextIOWrapper(gzip.GzipFile(fileobj=r), encoding="utf-8"), delimiter="|")
        for row in reader:
            stats["filas_total"] += 1
            o, d = row["origen"], row["destino"]
            if o not in gal and d not in gal:
                continue
            stats["filas_galicia"] += 1
            v = float(row["viajes"])
            if stats["viaxes_min"] is None or v < stats["viaxes_min"]:
                stats["viaxes_min"] = v
            key = (row["periodo"], fold(o, gal), fold(d, gal))
            a = agg[key]
            a[0] += v
            a[1] += float(row["viajes_km"] or 0)
            a[2] += 1
    out = saida / f"{fecha}_viaxes_{nivel}_galicia.csv.gz"
    with gzip.open(out, "wt", newline="") as f:
        w = csv.writer(f)
        w.writerow(["hora", "orixe", "destino", "viaxes", "viaxes_km", "filas_fonte"])
        for (h, o, d), (v, km, n) in sorted(agg.items()):
            w.writerow([h, o, d, round(v, 1), round(km, 1), n])
    stats["pares_hora_od"] = len(agg)
    stats["viaxes_total_galicia"] = round(sum(a[0] for a in agg.values()))
    log.append({"url": url, "descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "saida": out.name, **stats})
    print(fecha, json.dumps(stats, ensure_ascii=False), file=sys.stderr)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("datas", nargs="+", help="YYYYMMDD")
    p.add_argument("--nivel", default="municipios", choices=list(NIVEL_COL))
    p.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    a = p.parse_args()
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    gal, zurl = galician_zones(a.nivel, saida)
    log = [{"url": zurl, "descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "zonas_galicia": len(gal)}]
    for fecha in a.datas:
        process_day(fecha, a.nivel, gal, saida, log)
    rex = saida / "rexistro.json"
    prev = json.loads(rex.read_text()) if rex.exists() else []
    rex.write_text(json.dumps(prev + log, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
