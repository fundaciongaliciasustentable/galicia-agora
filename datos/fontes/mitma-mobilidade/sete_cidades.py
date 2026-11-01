#!/usr/bin/env python3
"""Hourly trips into and out of the seven cities, mean of several days.

Reads the Galicia-filtered daily files written by descargar.py, the rings in
aneis.json and the MITMA zoning population, and writes:
  - sete_cidades_<etiqueta>.json: per city, ring and day type, 24 hourly
    values (mean over days) of entradas, saidas, saldo and internas, plus
    residents for percentages;
  - sete_cidades_<etiqueta>.csv: the same as a flat table (static equivalent
    of the animation);
  - per-day totals in the JSON, to spot anomalous days.

Entradas: origin outside the ring, destination inside. Saídas: the reverse.
Internas: both ends inside. Saldo: entradas - saídas.

Usage:
  python3 -I sete_cidades.py --mercores 20250507 20250514 20250521 20250528
         --domingos 20250504 20250511 20250518 20250525 [--bruto bruto]
         [--etiqueta maio2025] [--saida mostra]
"""

import argparse
import csv
import gzip
import io
import json
import statistics
import urllib.request
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).parent
UA = "galicia-agora-fase0 (galiciasustentable@galiciasustentable.org)"
POB_URL = "https://movilidad-opendata.mitma.es/zonificacion/poblacion.csv"


def ring_zones(concellos, zone_of, zone_members):
    zones = {zone_of[c] for c in concellos}
    for z in zones:
        stray = zone_members[z] - set(concellos)
        if stray:
            raise SystemExit(f"zone {z} mixes concellos outside the ring: {sorted(stray)}")
    return zones


def day_flows(path, rings):
    """rings: {(city, ring): zones} -> {(city, ring): {measure: [24 floats]}}"""
    res = {k: {m: [0.0] * 24 for m in ("entradas", "saidas", "internas")} for k in rings}
    with gzip.open(path, "rt") as f:
        for r in csv.DictReader(f):
            h, o, d, v = int(r["hora"]), r["orixe"], r["destino"], float(r["viaxes"])
            for k, zs in rings.items():
                oi, di = o in zs, d in zs
                if oi and di:
                    res[k]["internas"][h] += v
                elif di:
                    res[k]["entradas"][h] += v
                elif oi:
                    res[k]["saidas"][h] += v
    return res


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--mercores", nargs="+", required=True)
    p.add_argument("--domingos", nargs="+", required=True)
    p.add_argument("--bruto", default=str(HERE / "bruto"))
    p.add_argument("--etiqueta", default="maio2025")
    p.add_argument("--saida", default=str(HERE / "mostra"))
    a = p.parse_args()

    zone_of, zone_members = {}, defaultdict(set)
    with (HERE / "mostra" / "zonas_municipios_galicia.csv").open() as f:
        for r in csv.DictReader(f):
            for c in r["concellos_ine"].split():
                zone_of[c] = r["zona_mitma"]
                zone_members[r["zona_mitma"]].add(c)
    aneis = json.loads((HERE / "aneis.json").read_text())
    rings = {}
    for c in aneis["cidades"]:
        for ring in ("anel0", "anel1"):
            rings[(c["nome"], ring)] = ring_zones(c[ring], zone_of, zone_members)

    req = urllib.request.Request(POB_URL, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        pob_rows = list(csv.DictReader(io.TextIOWrapper(r, encoding="utf-8"), delimiter="|"))
    pob_zone = defaultdict(float)
    for r in pob_rows:
        if r["poblacion"] == "NA":  # only foreign zones (Portugal, France) carry NA
            continue
        pob_zone[r["municipio"]] += float(r["poblacion"])

    days = {"mercores": a.mercores, "domingo": a.domingos}
    per_day = {}
    acc = defaultdict(lambda: defaultdict(list))  # (city, ring, tipo) -> measure -> [day vectors]
    for tipo, dates in days.items():
        for d in dates:
            flows = day_flows(Path(a.bruto) / f"{d}_viaxes_municipios_galicia.csv.gz", rings)
            for (city, ring), ms in flows.items():
                for m, vec in ms.items():
                    acc[(city, ring, tipo)][m].append(vec)
                per_day.setdefault(f"{city}|{ring}", {})[d] = {m: round(sum(v)) for m, v in ms.items()}

    out = {"fonte": "Basado en datos abiertos MITMA (estudios básicos, viajes por municipios)",
           "unidades": "viaxes por hora, media dos días indicados", "dias": days,
           "aneis": aneis["nota"], "cidades": {}}
    rows = []
    for (city, ring, tipo), ms in sorted(acc.items()):
        mean = {m: [round(statistics.fmean(v[h] for v in vecs)) for h in range(24)] for m, vecs in ms.items()}
        mean["saldo"] = [e - s for e, s in zip(mean["entradas"], mean["saidas"])]
        residentes = round(sum(pob_zone[z] for z in rings[(city, ring)]))
        node = out["cidades"].setdefault(city, {}).setdefault(ring, {"residentes": residentes})
        node[tipo] = mean
        for h in range(24):
            rows.append([city, ring, tipo, h, *(mean[m][h] for m in ("entradas", "saidas", "saldo", "internas")), residentes])
    out["totais_por_dia"] = per_day

    saida = Path(a.saida)
    (saida / f"sete_cidades_{a.etiqueta}.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")
    with (saida / f"sete_cidades_{a.etiqueta}.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["cidade", "anel", "tipo_dia", "hora", "entradas", "saidas", "saldo", "internas", "residentes"])
        w.writerows(rows)


if __name__ == "__main__":
    main()
