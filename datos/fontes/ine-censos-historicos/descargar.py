#!/usr/bin/env python3
"""Phase 0 sample for INE «Alteraciones de los municipios en los Censos de Población desde 1842».

The INE tool has no bulk download; each municipality is one GET by code
(intercensal.do?search=3). This script asks for every Galician code: current
municipalities (001–099 and 901–999, created after 1970) and the ones that
disappeared between 1857 and 1970 (500–599), one request per second, and
writes one row per municipality and census with the population «de derecho»
(«residente» from 2001) and «de hecho», plus the INE note on each alteration.

Usage: python3 -I descargar.py [--saida mostra] [--pausa 1.0]
Stdlib only. The run is logged in <saida>/rexistro.json.
"""

import argparse
import csv
import html
import http.cookiejar
import json
import re
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

UA = "MapasGaliciaSustentable/0.1 (+https://mapas.galiciasustentable.org; galiciasustentable@galiciasustentable.org)"
BASE = "https://www.ine.es/intercensal/"
PROVINCES = ("15", "27", "32", "36")


def text_of(page: str) -> str:
    s = re.sub(r"<script.*?</script>|<style.*?</style>", "", page, flags=re.S)
    s = html.unescape(re.sub(r"<[^>]+>", " ", s)).replace("\xa0", " ")
    return re.sub(r"\s+", " ", s)


def parse(s: str):
    m = re.search(r"Municipio: (\d{5}) (.*?) Censo (.*?) Población de Hecho (.*?) Población de Derecho (.*?) Hogares (.*?) (?:\[1\]|Entre|NOTAS)", s)
    if not m:
        return None
    code, name, years, hecho, derecho = m.group(1), m.group(2).strip(), m.group(3), m.group(4), m.group(5)
    # Year headers can carry footnote marks ("1900 [1]") and repeat (1920 twice in some files).
    years = re.findall(r"\b(1[89]\d\d|20\d\d)\b", years)
    def vals(t):
        return [None if v == ".." else int(v) for v in re.findall(r"\.\.|\d+", t)]
    notes = s[s.find("Hogares"):s.find("NOTAS")]
    notes = re.sub(r"^Hogares[\d .]*", "", notes).strip()
    return code, name, years, vals(hecho), vals(derecho), notes


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    p.add_argument("--pausa", type=float, default=1.0)
    a = p.parse_args()
    out = Path(a.saida)
    out.mkdir(parents=True, exist_ok=True)
    cj = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    op.addheaders = [("User-Agent", UA)]
    op.open(BASE).read()
    rows, alterations, requests = [], [], 0
    for prov in PROVINCES:
        for block, stop_after in ((range(1, 100), 99), (range(500, 600), 6), (range(901, 1000), 6)):
            misses = 0
            for code in block:
                url = f"{BASE}intercensal.do?search=3&codigoProvincia={prov}&codigoMunicipio={code:03d}&btnBuscarCod=Consultar+selecci%C3%B3n"
                requests += 1
                parsed = parse(text_of(op.open(url, timeout=60).read().decode("utf-8", "replace")))
                time.sleep(a.pausa)
                if not parsed:
                    misses += 1
                    if misses >= stop_after:
                        break
                    continue
                misses = 0
                c, name, years, hecho, derecho, notes = parsed
                seen = set()
                for i, y in enumerate(years):
                    if y in seen:  # duplicated 1920 column: keep the first
                        continue
                    seen.add(y)
                    rows.append([c, name, y, derecho[i] if i < len(derecho) else None, hecho[i] if i < len(hecho) else None])
                if notes:
                    alterations.append([c, name, notes])
    with (out / "censos_galicia.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["codigo", "nome", "censo", "poboacion_dereito", "poboacion_feito"])
        w.writerows(rows)
    with (out / "alteracions_galicia.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["codigo", "nome", "nota_ine"])
        w.writerows(alterations)
    (out / "rexistro.json").write_text(json.dumps({
        "url": f"{BASE}intercensal.do?search=3&codigoProvincia=PP&codigoMunicipio=MMM",
        "descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "peticions": requests, "municipios": len({r[0] for r in rows}), "filas": len(rows),
        "alteracions": len(alterations),
    }, ensure_ascii=False, indent=2) + "\n")
    print(requests, "peticións,", len({r[0] for r in rows}), "municipios")


if __name__ == "__main__":
    main()
