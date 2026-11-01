#!/usr/bin/env python3
"""Phase 0 sample for «Pisos turísticos» (tourist dwellings per concello over time).

Sources checked:
  1. Turismo de Galicia, REAT monthly series (REAT_Serie_Mensual.csv, linked from the AEI
     page of the REAT): establishments, rooms and places per month x concello x type,
     2017M01 onwards. Keeps the «Vivendas de uso turístico» rows for the sample.
  2. REAT directory (reat_directorio-alojamientos_esp.csv, the source of vut-concello):
     columns, and how many VUT signature numbers were issued vs still alive (no names,
     addresses or contacts are written).
  3. Internet Archive copies of the directory (CDX listing), to check that the monthly
     series matches an old snapshot.
  4. INE experimental statistic «Viviendas turísticas en España» (VTE), table 39363,
     municipalities, all periods; Galician rows only.
  5. Licence texts: abertos.xunta.gal dataset 0022 and the INE legal notice.

Usage:
  python3 -I descargar.py [--saida mostra]

Stdlib only. Pauses >= 1.5 s between requests. Log in <saida>/rexistro.json.
"""

import argparse
import csv
import gzip
import io
import json
import re
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

UA = ("MapasGaliciaSustentable/0.1 (+https://mapas.galiciasustentable.org; "
      "galiciasustentable@galiciasustentable.org)")
CDN = "https://descargascdn.xunta.gal/interno/smarxa/"
SERIE = CDN + "REAT_Serie_Mensual.csv"
DIRECTORIO = CDN + "reat_directorio-alojamientos_esp.csv"
AEI = "https://aei.turismo.gal/es/rexistro-de-empresas-e-actividades-turisticas"
ABERTOS = ("https://abertos.xunta.gal/catalogo/cultura-ocio-deporte/-/dataset/0022/"
           "rexistro-empresas-actividades-turisticas")
CDX = ("https://web.archive.org/cdx/search/cdx?url=descargascdn.xunta.gal/interno/smarxa/"
       "reat_directorio-alojamientos_esp.csv&output=json&fl=timestamp,statuscode")
INE = ("https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/39363"
       "?tv=433:382508&tv=433:382510&tv=3:72&nult=30&tip=AM")
INE_LEGAL = "https://www.ine.es/dyngs/AYU/index.htm?cid=125"
VUT = "Vivendas de uso turístico"
PAUSE = 1.5
LOG = []


def req(url):
    r = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(r, timeout=300) as resp:
            body, st, h = resp.read(), resp.status, dict(resp.headers)
    except urllib.error.HTTPError as e:
        body, st, h = e.read(), e.code, dict(e.headers)
    LOG.append({"url": url, "status": st, "bytes": len(body), "last_modified": h.get("Last-Modified"),
                "utc": datetime.now(timezone.utc).isoformat(timespec="seconds")})
    time.sleep(PAUSE)
    if body[:2] == b"\x1f\x8b":
        body = gzip.decompress(body)
    return body, st


def directory(raw):
    """VUT signatures of a REAT directory CSV (header lines before the column row)."""
    t = raw.decode("utf-8-sig", "replace").splitlines()
    ref = next((l.split(":", 1)[1].strip() for l in t[:6] if "Fecha de referencia" in l), None)
    i = next(k for k, l in enumerate(t) if l.startswith('"signatura"'))
    rows = list(csv.DictReader(io.StringIO("\n".join(t[i:])), delimiter=";"))
    vut = {r["signatura"] for r in rows if r["signatura"].upper().startswith("VUT-")}
    return ref, list(rows[0].keys()), vut


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    a = ap.parse_args()
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    resumo = {}

    # 1. Monthly series
    raw, st = req(SERIE)
    rows = list(csv.DictReader(io.StringIO(raw.decode("latin-1")), delimiter=";"))
    vut = [r for r in rows if r["TIPO"] == VUT]
    with (saida / "reat_serie_mensual_vut.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["mes", "codigo_ine", "concello", "vut", "habitacions", "prazas"])
        for r in vut:
            w.writerow([r["TEMPO"], r["CODCON"], r["CONCELLO"], r["ESTABLECEMENTOS"], r["HABITACIONS"], r["PRAZAS"]])
    total = defaultdict(int)
    for r in vut:
        total[r["TEMPO"]] += int(r["ESTABLECEMENTOS"])
    meses = sorted({r["TEMPO"] for r in rows})
    by_c = defaultdict(dict)
    for r in vut:
        by_c[(r["CODCON"], r["CONCELLO"])][r["TEMPO"]] = int(r["ESTABLECEMENTOS"])
    last = meses[-1]
    grow = sorted(((d.get(last, 0) - d.get("2019M10", 0), c[1], d.get("2019M10", 0), d.get(last, 0))
                   for c, d in by_c.items()), reverse=True)[:8]
    falls = sum(1 for a_, b_ in zip(sorted(total), sorted(total)[1:]) if total[b_] < total[a_])
    resumo["serie_mensual"] = {
        "bytes": len(raw), "filas": len(rows), "meses": f"{meses[0]}–{meses[-1]} ({len(meses)})",
        "tipos": dict(Counter(r["TIPO"] for r in rows)),
        "primeiro_mes_vut": min(total), "concellos_con_vut_ultimo_mes": sum(1 for d in by_c.values() if d.get(last)),
        "vut_galicia": {k: total[k] for k in sorted(total) if k.endswith("M10") or k == min(total)},
        "meses_con_baixada": falls,
        "maior_suba_2019M10_ultimo": [(n, v0, v1) for _, n, v0, v1 in grow],
    }

    # 2. Current directory
    raw, st = req(DIRECTORIO)
    ref, cols, now = directory(raw)
    issued = {}
    for s in now:
        _, p, n = s.split("-")
        issued[p] = max(issued.get(p, 0), int(n))
    resumo["directorio"] = {"data_referencia": ref, "columnas": cols, "vut": len(now),
                            "ten_data_de_alta": any("fecha" in c.lower() or "alta" in c.lower() for c in cols),
                            "numero_maximo_por_provincia": issued,
                            "vivas_por_provincia": dict(Counter(s.split("-")[1] for s in now))}
    # Alive share by block of 1,000 signature numbers (order of registration)
    with (saida / "reat_sinaturas_vivas_por_bloque.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["provincia", "bloque_desde", "bloque_ata", "vivas"])
        cnt = Counter((s.split("-")[1], int(s.split("-")[2]) // 1000) for s in now)
        for (p, b), v in sorted(cnt.items()):
            w.writerow([p, b * 1000, b * 1000 + 999, v])

    # 3. Internet Archive copies: compare with the monthly series
    raw, st = req(CDX)
    snaps = [x for x in json.loads(raw)[1:] if x[1] == "200"] if st == 200 else []
    arch = []
    for ts, _ in snaps:
        body, st2 = req(f"https://web.archive.org/web/{ts}id_/{DIRECTORIO}")
        if st2 != 200:
            continue
        r_ref, _, old = directory(body)
        mes = f"{r_ref[:4]}M{r_ref[5:7]}" if r_ref else None
        arch.append({"captura": ts, "data_referencia": r_ref, "vut": len(old),
                     "serie_mensual_mesmo_mes": total.get(mes),
                     "baixas_ata_hoxe": len(old - now), "altas_ata_hoxe": len(now - old)})
    resumo["internet_archive"] = arch

    # 4. INE VTE
    raw, st = req(INE)
    ine = json.loads(raw) if st == 200 else []
    out = []
    for s in ine:
        mun = next((m for m in s["MetaData"] if m.get("T3_Variable") == "Municipios"), None)
        con = next((m["Nombre"] for m in s["MetaData"] if m.get("T3_Variable") == "Concepto turístico"), None)
        if not mun or mun["Codigo"][:2] not in ("15", "27", "32", "36"):
            continue
        for d in s["Data"]:
            out.append((mun["Codigo"], mun["Nombre"], f"{d['Anyo']}{d['T3_Periodo']}", con, d["Valor"]))
    with (saida / "ine_vte_galicia.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["codigo_ine", "concello", "periodo", "concepto", "valor"])
        w.writerows(sorted(out))
    per = sorted({o[2] for o in out})
    gal = defaultdict(float)
    for o in out:
        if o[3] == "Viviendas turísticas" and o[4] is not None:
            gal[o[2]] += o[4]
    resumo["ine_vte"] = {"bytes": len(raw), "series_espana": len(ine), "concellos_galicia": len({o[0] for o in out}),
                         "periodos": per, "vivendas_galicia_suma_concellos": {k: round(v) for k, v in sorted(gal.items())}}

    # 5. Licences
    raw, st = req(ABERTOS)
    t = raw.decode("utf-8", "replace")
    m = re.search(r"Creative Commons BY[ -]SA 4\.0", t)
    resumo["licenza_abertos_0022"] = m.group(0) if m else "non atopada"
    raw, st = req(AEI)
    resumo["aei_ligazon_serie_mensual"] = "REAT_Serie_Mensual.csv" in raw.decode("utf-8", "replace")
    raw, st = req(INE_LEGAL)
    t = raw.decode("utf-8", "replace")
    m = re.search(r"Creative Commons Reconocimiento 4\.0</a>\s*\(CC BY 4\.0\)", t)
    resumo["licenza_ine"] = "Creative Commons Reconocimiento 4.0 (CC BY 4.0)" if m else "non atopada"

    rex = {"descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "user_agent": UA, "resumo": resumo, "peticions": LOG}
    (saida / "rexistro.json").write_text(json.dumps(rex, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(resumo, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
