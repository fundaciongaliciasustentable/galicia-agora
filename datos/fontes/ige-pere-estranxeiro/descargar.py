#!/usr/bin/env python3
"""Phase 0 sample for the PERE (Padrón de Españoles Residentes en el Extranjero) in Galicia.

Fetches from the IGE API (tables republished by the IGE from INE's PERE):
  - 2291: residents abroad by concello of registration and sex, every year 2009-2026
  - 2292: by country of residence and province of registration (sex and age = total)
  - 2293: by country of residence, province of registration and place of birth (sex = total)
Year codes are read first from each table's metadata.

Usage:
  python3 -I descargar.py [--saida mostra]

Stdlib only. Log in <saida>/rexistro.json.
"""

import argparse
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

UA = ("GaliciaAgora/0.1 (+https://github.com/fundaciongaliciasustentable/galicia-agora; "
      "galiciasustentable@galiciasustentable.org)")
IGE = "https://www.ige.gal/igebdt/igeapi"
# table -> (extra axis filter, description)
TAXOAS = {
    "2291": ("", "residentes no estranxeiro por concello de inscrición e sexo"),
    "2292": (",2:0,3:0", "por país de residencia e provincia de inscrición (idade e sexo = total)"),
    "2293": (",4:0", "por país de residencia, provincia de inscrición e lugar de nacemento (sexo = total)"),
}
_last = [0.0]


def get(url):
    wait = 1.0 - (time.monotonic() - _last[0])
    if wait > 0:
        time.sleep(wait)
    _last[0] = time.monotonic()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read(), r.status


def years(taboa):
    raw, _ = get(f"{IGE}/json/metadatos/{taboa}/selector")
    meta = json.loads(raw.decode("utf-8"))
    els = [e for blk in meta if isinstance(blk, list) for e in blk if isinstance(e, dict) and "CODELEM" in e]
    return sorted(str(e["CODELEM"]) for e in els if str(e["EJE"]) == "0"), meta[0].get("NOTAS", ""), meta[0].get("FUENTE", "")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    a = p.parse_args()
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    log = []
    for t, (extra, desc) in TAXOAS.items():
        anos, notas, fonte = years(t)
        url = f"{IGE}/csv/datos/{t}/0:" + ":".join(anos) + extra
        raw, status = get(url)
        text = raw.decode("iso-8859-1")
        out = saida / f"ige_{t}_{anos[0]}-{anos[-1]}.csv"
        out.write_text(text, encoding="utf-8")
        log.append({"taboa": t, "descricion": desc, "url": url, "http": status,
                    "descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "anos": f"{anos[0]}-{anos[-1]}", "bytes": len(raw), "filas": text.count("\n") - 1,
                    "saida": out.name, "fonte_ige": fonte, "notas_ige": notas})
        print(t, len(raw), "bytes", anos[0], "-", anos[-1])
    (saida / "rexistro.json").write_text(json.dumps(log, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
