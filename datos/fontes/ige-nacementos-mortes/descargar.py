#!/usr/bin/env python3
"""Phase 0 sample for «Nacementos e mortes por concello» (IGE, Movemento natural da poboación).

Downloads, from the IGE API (CSV, ISO-8859-1), the yearly births (table 57) and
deaths (table 30) by place of residence for Galicia, provinces, comarcas and
concellos, sex = total, for every published year (1975 onwards). Writes UTF-8
CSV copies, a joined file with natural change (saldo vexetativo) per concello
and year, and a log. Cross-checks the Galicia totals against the INE monthly
series by autonomous community (tables 6525 births, 6562 deaths).

Usage:
  python3 -I descargar.py [--saida mostra] [--sen-ine]

Stdlib only. About 2 MB per run, 6 requests with a 1.5 s pause.
"""

import argparse
import csv
import io
import json
import time
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

IGE = "https://www.ige.gal/igebdt/igeapi"
INE = "https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/{t}.csv"
UA = "mapas-galicia-sustentable-fase0 (galiciasustentable@galiciasustentable.org)"
TABLES = {"57": "nacementos", "30": "defuncions"}
INE_TABLES = {"6525": "nacementos", "6562": "defuncions"}
PAUSE = 1.5


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        body = r.read()
    time.sleep(PAUSE)
    return body


def years(table):
    meta = json.loads(get(f"{IGE}/json/metadatos/{table}/selector").decode("utf-8"))
    els = [e for blk in meta if isinstance(blk, list) for e in blk if isinstance(e, dict) and e.get("CODELEM") is not None]
    ys = sorted(int(e["CODELEM"]) for e in els if str(e["EJE"]) == "0")
    return ys, meta[0]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    p.add_argument("--sen-ine", action="store_true", help="skip the INE cross-check")
    a = p.parse_args()
    out = Path(a.saida)
    out.mkdir(parents=True, exist_ok=True)
    log, data = [], defaultdict(dict)
    for t, name in TABLES.items():
        ys, meta = years(t)
        # Axis 1 is sex; code 0 = total.
        url = f"{IGE}/csv/datos/{t}/0:" + ":".join(map(str, ys)) + ",1:0"
        raw = get(url)
        text = raw.decode("iso-8859-1")
        f = out / f"ige_{t}_{name}_{ys[0]}-{ys[-1]}.csv"
        f.write_text(text, encoding="utf-8")
        for r in csv.DictReader(io.StringIO(text)):
            data[(r["CodTempo"], r["CodEspazo"])]["nome"] = r["Espazo"].split(" ", 1)[1]
            data[(r["CodTempo"], r["CodEspazo"])][name] = r["DatoN"]
        log.append({
            "fonte": "IGE", "taboa": t, "titulo": meta.get("TITTABLA"), "orixe": meta.get("FUENTE"),
            "url": url, "descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "anos": f"{ys[0]}–{ys[-1]}", "bytes": len(raw), "filas": text.count("\n") - 1,
            "saida": f.name, "notas_ige": str(meta.get("NOTAS", "")).replace("<br>", " ").strip(),
        })
        print(t, name, len(raw), "bytes", ys[0], "→", ys[-1])

    # Joined file: one row per territory and year, empty when the IGE publishes «-».
    joined = out / "saldo_vexetativo.csv"
    with joined.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["ano", "codigo", "nome", "nivel", "nacementos", "defuncions", "saldo"])
        for (y, c), v in sorted(data.items(), key=lambda kv: (kv[0][0], len(kv[0][1]), kv[0][1])):
            n, m = v.get("nacementos", ""), v.get("defuncions", "")
            nivel = {2: "galicia", 4: "comarca", 5: "concello"}.get(len(c), "provincia")
            if c in ("15", "27", "32", "36"):
                nivel = "provincia"
            saldo = int(n) - int(m) if n and m else ""
            w.writerow([y, c, v["nome"], nivel, n, m, saldo])

    if not a.sen_ine:
        for t, name in INE_TABLES.items():
            url = INE.format(t=t)
            raw = get(url)
            sums = defaultdict(int)
            last = ""
            for r in csv.reader(io.StringIO(raw.decode("utf-8-sig")), delimiter=";"):
                if "Galicia" in r[0] and r[2] not in ("", ".."):
                    sums[r[1][:4]] += int(r[2].replace(".", ""))
                    last = max(last, r[1])
            ige = {y: int(v[name]) for (y, c), v in data.items() if c == "12" and v.get(name)}
            diff = {y: ige[y] - sums[y] for y in sorted(sums) if y in ige and ige[y] != sums[y]}
            log.append({
                "fonte": "INE", "taboa": t, "url": url, "bytes": len(raw), "ultimo_periodo": last,
                "comprobacion": f"Galicia, suma dos meses do INE fronte ao total do IGE ({name})",
                "anos_comparados": len([y for y in sums if y in ige]), "diferenzas": diff,
            })
            print("INE", t, "último", last, "diferenzas", diff)

    rex = out / "rexistro.json"
    prev = json.loads(rex.read_text()) if rex.exists() else []
    rex.write_text(json.dumps(prev + log, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
