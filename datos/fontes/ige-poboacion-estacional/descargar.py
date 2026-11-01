#!/usr/bin/env python3
"""Phase 0 sample for IGE «Carga de poboación estacional dos concellos».

Downloads quarterly tables from the IGE API (CSV, ISO-8859-1) and stores them
as UTF-8 CSV. Default: the last 6 quarters of tables 9043 (load and in/out
flows) and 9046 (load by component). Use --trimestres all for the whole
series since 2011 (about 6.6 MB per table uncompressed).

Usage:
  python3 -I descargar.py [--taboas 9043 9046] [--trimestres 6|all] [--saida mostra]

Stdlib only. Each fetch is logged in <saida>/rexistro.json.
"""

import argparse
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://www.ige.gal/igebdt/igeapi"
UA = "galicia-agora-fase0 (galiciasustentable@galiciasustentable.org)"
# 9041/9042: overnight and daytime load with flows; 9044/9045: their components.
TAXOAS = {
    "9043": "carga e fluxos de entrada e saída",
    "9046": "carga segundo compoñentes",
    "9041": "carga que pernoita e fluxos",
    "9042": "carga diúrna e fluxos",
    "9044": "carga que pernoita segundo compoñentes",
    "9045": "carga diúrna segundo compoñentes",
}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read(), dict(r.headers)


def quarters(taboa):
    """Time codes of a table, newest first (e.g. 202514 = 2025/II)."""
    raw, _ = get(f"{BASE}/json/metadatos/{taboa}/selector")
    meta = json.loads(raw.decode("utf-8"))
    els = [e for blk in meta if isinstance(blk, list) for e in blk if isinstance(e, dict) and "CODELEM" in e]
    return [str(e["CODELEM"]) for e in els if str(e["EJE"]) == "0"], meta[0].get("NOTAS", "")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--taboas", nargs="+", default=["9043", "9046"], choices=list(TAXOAS))
    p.add_argument("--trimestres", default="6", help="number of latest quarters, or 'all'")
    p.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    a = p.parse_args()
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    log = []
    for t in a.taboas:
        codes, notas = quarters(t)
        sel = codes if a.trimestres == "all" else codes[: int(a.trimestres)]
        url = f"{BASE}/csv/datos/{t}/0:" + ":".join(sorted(sel))
        raw, headers = get(url)
        text = raw.decode("iso-8859-1")
        out = saida / f"ige_{t}_{sel[-1]}-{sel[0]}.csv"
        out.write_text(text, encoding="utf-8")
        log.append({
            "taboa": t, "descricion": TAXOAS[t], "url": url,
            "descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "trimestres": f"{sel[-1]}–{sel[0]}", "ultimo_publicado": codes[0],
            "filas": text.count("\n") - 1, "bytes": len(raw), "saida": out.name,
            "notas_ige": notas.replace("<br>", " ").strip(),
        })
        print(t, len(raw), "bytes", sel[-1], "→", sel[0])
    rex = saida / "rexistro.json"
    prev = json.loads(rex.read_text()) if rex.exists() else []
    rex.write_text(json.dumps(prev + log, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
