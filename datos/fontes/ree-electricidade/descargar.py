#!/usr/bin/env python3
"""Phase 0 sample for «Electricidade hora a hora» (Red Eléctrica, REData API).

REData (https://apidatos.ree.es) answers JSON:API without a key:
  /{lang}/datos/{category}/{widget}?start_date&end_date&time_trunc
      [&geo_trunc=electric_system&geo_limit=ccaa&geo_ids=N]
Galicia is geo_ids=17 (checked against Navarra 14 and La Rioja 20 by their
2024 balance). This script:
  1. records which granularities answer for Galicia (hour, day, month, year)
     on three widgets: demanda/evolucion, generacion/estructura-generacion,
     balance/balance-electrico;
  2. downloads the monthly Galicia balance (generation by technology,
     pumping, net exchange, demand) from the first year that answers to the
     last month available, and writes it to mostra/ as a long CSV;
  3. checks the national hourly widgets that do exist (real-time demand);
  4. checks ESIOS without a token (no token is requested) and lists the
     ESIOS indicators that mention CCAA (metadata is open, data is not);
  5. reads the REE legal notice to record the reuse clause.

Usage:
  python3 -I descargar.py [--desde 2008] [--saida mostra]

Stdlib only. Pauses >= 1 s between requests. Log in <saida>/rexistro.json.
"""

import argparse
import html
import json
import re
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

UA = ("GaliciaAgora/0.1 (+https://github.com/fundaciongaliciasustentable/galicia-agora; "
      "galiciasustentable@galiciasustentable.org)")
API = "https://apidatos.ree.es/es/datos"
GAL = "geo_trunc=electric_system&geo_limit=ccaa&geo_ids=17"
ESIOS = "https://api.esios.ree.es"
AVISO = "https://www.ree.es/es/aviso-legal"
PAUSE = 1.2
LOG = []


def req(url):
    r = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            body, st = resp.read(), resp.status
    except urllib.error.HTTPError as e:
        body, st = e.read(), e.code
    LOG.append({"url": url, "status": st, "bytes": len(body),
                "utc": datetime.now(timezone.utc).isoformat(timespec="seconds")})
    time.sleep(PAUSE)
    return body, st


def get_json(url):
    body, st = req(url)
    try:
        return json.loads(body), st
    except ValueError:
        return None, st


def series(doc):
    """Flatten a REData answer to [(group, concept, datetime, value)]."""
    out = []
    for g in doc.get("included", []):
        a = g["attributes"]
        items = [(g["type"], c["type"], c["attributes"]["values"]) for c in a["content"]] \
            if "content" in a else [(None, g["type"], a["values"])]
        for grp, concept, vals in items:
            for v in vals:
                out.append((grp, concept, v["datetime"], v["value"]))
    return out


def probe(widget, start, end, trunc, geo=True):
    url = f"{API}/{widget}?start_date={start}&end_date={end}&time_trunc={trunc}" + (f"&{GAL}" if geo else "")
    doc, st = get_json(url)
    res = {"widget": widget, "time_trunc": trunc, "galicia": geo, "status": st}
    if st == 200 and doc and "included" in doc:
        s = series(doc)
        dts = sorted({d for _, _, d, _ in s})
        res.update(valores_por_serie=len(dts), primeira_data=dts[0] if dts else None,
                   last_update=doc["data"]["attributes"].get("last-update"))
    elif doc and "errors" in doc:
        res["erro"] = doc["errors"][0].get("detail")
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--desde", type=int, default=2008)
    ap.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    a = ap.parse_args()
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    this_year = datetime.now(timezone.utc).year

    # 1. Granularity per widget for Galicia (21 May 2025 and May 2025)
    probes = []
    for w in ("demanda/evolucion", "generacion/estructura-generacion", "balance/balance-electrico"):
        probes.append(probe(w, "2025-05-21T00:00", "2025-05-21T23:59", "hour"))
        probes.append(probe(w, "2025-05-01T00:00", "2025-05-31T23:59", "day"))
        probes.append(probe(w, "2025-01-01T00:00", "2025-12-31T23:59", "month"))
    # National hourly widgets, for comparison
    probes.append(probe("demanda/demanda-tiempo-real", "2025-05-21T00:00", "2025-05-21T23:59", "hour", geo=False))
    probes.append(probe("generacion/estructura-generacion", "2025-05-21T00:00", "2025-05-21T23:59", "hour", geo=False))
    probes.append(probe("demanda/evolucion", "2025-05-01T00:00", "2025-05-31T23:59", "day", geo=False))

    # 2. Monthly balance for Galicia, year by year
    rows, anos = [], {}
    for y in range(a.desde, this_year + 1):
        doc, st = get_json(f"{API}/balance/balance-electrico?start_date={y}-01-01T00:00"
                           f"&end_date={y}-12-31T23:59&time_trunc=month&{GAL}")
        anos[y] = st
        if st == 200 and doc and "included" in doc:
            rows += [(d[:7], grp, c, round(v, 3)) for grp, c, d, v in series(doc)]
    rows.sort()
    out = saida / "balance_galicia_mensual.csv"
    with out.open("w", encoding="utf-8") as fh:
        fh.write("mes;grupo;concepto;mwh\n")
        for r in rows:
            fh.write(";".join(str(x) for x in r) + "\n")

    # 3. ESIOS without token
    _, st_esios_data = req(f"{ESIOS}/indicators/1293?start_date=2025-05-21T00:00&end_date=2025-05-21T23:59")
    _, st_esios_arch = req(f"{ESIOS}/archives")
    meta, st_esios_list = get_json(f"{ESIOS}/indicators")
    ccaa = []
    if meta:
        for i in meta.get("indicators", []):
            if re.search(r"(?i)por CCAA|comunidad aut", i["name"] + " " + (i.get("description") or "")):
                ccaa.append({"id": i["id"], "name": i["name"]})

    # 4. REE legal notice, reuse clause
    body, st_aviso = req(AVISO)
    t = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ",
                      re.sub(r"(?s)<(script|style).*?</\1>", "", body.decode("utf-8", "replace")))))
    i = t.find("No obstante, el usuario podrá visualizar")
    clausula = t[i:i + 1500] if i >= 0 else None

    months = sorted({r[0] for r in rows})
    resumo = {
        "geo_id_galicia": 17,
        "sondas_granularidade": probes,
        "balance_mensual_status_por_ano": anos,
        "meses": len(months), "primeiro_mes": months[0] if months else None,
        "ultimo_mes": months[-1] if months else None,
        "conceptos": sorted({r[2] for r in rows}),
        "mostra": out.name, "filas_mostra": len(rows),
        "esios": {"datos_sen_token_status": st_esios_data, "archives_sen_token_status": st_esios_arch,
                  "lista_indicadores_status": st_esios_list,
                  "indicadores": len(meta.get("indicators", [])) if meta else None,
                  "indicadores_por_ccaa": ccaa},
        "aviso_legal": {"url": AVISO, "status": st_aviso, "clausula": clausula},
    }
    rex = {"descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "user_agent": UA, "resumo": resumo, "peticions": LOG}
    (saida / "rexistro.json").write_text(json.dumps(rex, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in resumo.items() if k not in ("esios", "aviso_legal")},
                     ensure_ascii=False, indent=1))
    print("esios:", st_esios_data, st_esios_arch, st_esios_list, len(ccaa))


if __name__ == "__main__":
    main()
