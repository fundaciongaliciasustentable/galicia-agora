#!/usr/bin/env python3
"""Phase 0 sample for «Notas de primeira venda de pesca fresca» (Consellería do Mar).

The annual files at pescadegalicia.gal/gl/descargas carry one row per
day x lonxa x species (CSV ';', decimal comma, UTF-8 with BOM, date dd/mm/yyyy):
  data; grupo biolóxico; código FAO; especie; provincia; zona; lonxa; kg; euros; €/kg

Default: downloads the whole year (2025 = 17.8 MB, kept in memory only), writes
one month to mostra/ and records the size of every annual file with HEAD.
Also reads the abertos.xunta.gal page of dataset 0154 to record the licence.

Usage:
  python3 -I descargar.py [--ano 2025] [--mes 8] [--saida mostra]

Stdlib only. Pauses >= 1 s between requests. Log in <saida>/rexistro.json.
"""

import argparse
import json
import re
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

UA = ("MapasGaliciaSustentable/0.1 (+https://mapas.galiciasustentable.org; "
      "galiciasustentable@galiciasustentable.org)")
BASE = "https://www.pescadegalicia.gal"
ABERTOS = ("https://abertos.xunta.gal/catalogo/economia-empresa-emprego/-/dataset/0154/"
           "principais-indicadores-vendas-produtos-pesqueiros")
PAUSE = 1.2
COLS = ["data", "grupo_biologico", "fao", "especie", "provincia", "zona", "lonxa",
        "cantidade_kg", "importe_eur", "prezo_medio_eur_kg"]
LOG = []


def req(url, method="GET"):
    r = urllib.request.Request(url, headers={"User-Agent": UA}, method=method)
    try:
        with urllib.request.urlopen(r, timeout=300) as resp:
            body = resp.read() if method == "GET" else b""
            st, h = resp.status, dict(resp.headers)
    except urllib.error.HTTPError as e:
        body, st, h = b"", e.code, dict(e.headers)
    LOG.append({"url": url, "metodo": method, "status": st,
                "bytes": len(body) if method == "GET" else int(h.get("Content-Length", 0) or 0),
                "last_modified": h.get("Last-Modified"),
                "utc": datetime.now(timezone.utc).isoformat(timespec="seconds")})
    time.sleep(PAUSE)
    return body, st, h


def num(s):
    return float(s.replace(".", "").replace(",", ".")) if s else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ano", type=int, default=2025)
    ap.add_argument("--mes", type=int, default=8)
    ap.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    a = ap.parse_args()
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)

    # 1. Licence as declared on abertos.xunta.gal
    raw, st, _ = req(ABERTOS)
    t = raw.decode("utf-8", "replace")
    lic = re.search(r"Creative Commons BY[ -]SA 4\.0", t)
    act = re.search(r"Data de actualización:\s*(?:<[^>]+>\s*)*([0-9-]+)", t)
    freq = re.search(r"Frecuencia de actualización:\s*(?:<[^>]+>\s*)*([^<\s]+)", t)

    # 2. Annual files listed on the downloads page, sized with HEAD
    raw, st, _ = req(BASE + "/gl/descargas")
    anos = sorted(set(re.findall(r'/descargas/pescafresca/pescafresca(\d{4})\.csv', raw.decode("utf-8", "replace"))))
    tamanos = {}
    for y in anos:
        _, st, h = req(f"{BASE}/descargas/pescafresca/pescafresca{y}.csv", "HEAD")
        tamanos[y] = int(h.get("Content-Length", 0) or 0)

    # 3. One year in memory, one month to disk
    url = f"{BASE}/descargas/pescafresca/pescafresca{a.ano}.csv"
    raw, st, _ = req(url)
    lines = raw.decode("utf-8-sig").splitlines()
    rows = [l.split(";") for l in lines if l.strip()]
    mm = f"{a.mes:02d}"
    month = [r for r in rows if len(r) == 10 and r[0][3:5] == mm]
    out = saida / f"pescafresca_{a.ano}-{mm}.csv"
    with out.open("w", encoding="utf-8") as fh:
        fh.write(";".join(COLS) + "\n")
        for r in month:
            fh.write(";".join(r) + "\n")

    resumo = {
        "licenza_abertos_0154": lic.group(0) if lic else "non atopada",
        "abertos_data_actualizacion": act.group(1) if act else None,
        "abertos_frecuencia": freq.group(1) if freq else None,
        "anos_dispoñibles": f"{anos[0]}–{anos[-1]}" if anos else None,
        "bytes_por_ano": tamanos,
        "ano": a.ano, "filas_ano": len(rows), "columnas": sorted(set(len(r) for r in rows)),
        "dias_con_vendas_ano": len({r[0] for r in rows}),
        "lonxas_ano": len({r[6] for r in rows if len(r) == 10}),
        "especies_ano": len({r[3] for r in rows if len(r) == 10}),
        "kg_ano": round(sum(num(r[7]) for r in rows if len(r) == 10)),
        "eur_ano": round(sum(num(r[8]) for r in rows if len(r) == 10)),
        "mostra": out.name, "filas_mostra": len(month),
        "dias_mostra": len({r[0] for r in month}),
        "lonxas_mostra": len({r[6] for r in month}),
    }
    rex = {"descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "user_agent": UA, "resumo": resumo, "peticions": LOG}
    (saida / "rexistro.json").write_text(json.dumps(rex, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(resumo, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
