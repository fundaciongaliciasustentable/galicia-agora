#!/usr/bin/env python3
"""Phase 0 sample for «Ocupación hoteleira por mes e por concello».

Checks which monthly territorial units really exist for Galicia:

  1. INE Encuesta de Ocupación Hotelera (EOH): tourist points (tables 2078
     travellers/nights, 2076 places/occupancy) and tourist zones (2039, 2013).
     Bulk CSV for all Spain, filtered to Galicia in memory.
  2. Agencia de Turismo de Galicia (aei.turismo.gal): monthly EOH files by
     tourist point and by «área turística», plus the concello list with areas.
  3. INE experimental «turismo a partir de teléfonos móviles»: monthly tourists
     by destination municipality, domestic interprovincial (53464, origin =
     Total Nacional) and inbound (52048, country = Total), 25 concellos per call.
  4. IGE table 1826: tourist accommodation places per concello (1 January).

Full series are read to measure coverage (logged in rexistro.json); the files
written to --saida keep only periods from --desde (default 2024) so that the
sample stays under 5 MB.

Usage:
  python3 -I descargar.py [--saida mostra] [--desde 2024] [--sen-moviles]

Stdlib only. About 45 MB downloaded, ~40 requests with a 1.2 s pause.
"""

import argparse
import csv
import io
import json
import time
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

UA = "galicia-agora-fase0 (galiciasustentable@galiciasustentable.org)"
PAUSE = 1.2
INE_CSV = "https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/{t}.csv"
TEMPUS = "https://servicios.ine.es/wstempus/js/ES"
TG = "https://descargascdn.xunta.gal/interno/smarxa/{f}"
IGE = "https://www.ige.gal/igebdt/igeapi"
GAL = ("15", "27", "32", "36")
MESES = "Xaneiro Febreiro Marzo Abril Maio Xuño Xullo Agosto Setembro Outubro Novembro Decembro".split()
# Tempus ids: variable 19 = municipality, 96 = origin / country; 16473 = Total Nacional, 16420 = Total.
MOVILES = {
    "53464": {"filtro": "96:16473", "grupo": "111556", "campo": "turistas_residentes_outra_provincia"},
    "52048": {"filtro": "96:16420", "grupo": "111343", "campo": "turistas_estranxeiros"},
}

log = []


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
    with urllib.request.urlopen(req, timeout=300) as r:
        body, headers = r.read(), dict(r.headers)
    time.sleep(PAUSE)
    return body, headers


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def num(v):
    v = v.strip()
    if v in ("", ".", ".."):
        return None
    return float(v.replace(".", "").replace(",", "."))


def ine_eoh(out, desde):
    """INE EOH tables for tourist points and zones, filtered to Galicia."""
    specs = {
        "2078": ("puntos", "viaxeiros e noites"),
        "2076": ("puntos", "establecementos, prazas, grao de ocupación e persoal"),
        "2039": ("zonas", "viaxeiros e noites"),
        "2013": ("zonas", "establecementos, prazas, grao de ocupación e persoal"),
    }
    files = {"puntos": [], "zonas": []}
    for t, (kind, desc) in specs.items():
        url = INE_CSV.format(t=t)
        raw, _ = get(url)
        rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig")), delimiter=";"))
        head, body = rows[0], rows[1:]
        if kind == "puntos":
            gal = [r for r in body if r[0][:2] in GAL and r[0][:5].isdigit()]
        else:
            gal = [r for r in body if r[0].startswith("Galicia")]
        per = [r[-2] for r in gal]
        status = Counter(r[-1] if num(r[-1]) is None else "número" for r in gal)
        units = defaultdict(set)
        for r in gal:
            if num(r[-1]) is not None:
                units[r[0]].add(r[-2])
        log.append({
            "fonte": "INE EOH", "taboa": t, "descricion": f"{kind}: {desc}", "url": url,
            "descargado_utc": now(), "bytes_espana": len(raw), "cabeceira": head,
            "filas_galicia": len(gal), "periodo": f"{min(per)}–{max(per)}", "valores": dict(status),
            "unidades": {u: f"{min(p)}–{max(p)} ({len(p)} períodos con dato)" for u, p in sorted(units.items())},
        })
        files[kind].append((t, head, [r for r in gal if r[-2][:4] >= str(desde)]))
        print("INE", t, kind, len(gal), "filas Galicia", min(per), "→", max(per))
    for kind, parts in files.items():
        f = out / f"ine_eoh_{kind}_galicia_desde{desde}.csv"
        with f.open("w", encoding="utf-8", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["taboa", "unidade", "variable", "residencia", "periodo", "valor"])
            for t, head, rows in parts:
                for r in rows:
                    res = r[2] if len(r) == 5 else ""
                    w.writerow([t, r[0], r[1], res, r[-2], r[-1]])


def turismo_galicia(out, desde):
    """Monthly files published by the Agencia de Turismo de Galicia."""
    for name in ("EOH_Puntos.csv", "EOH_Xeodestinos.csv", "ConcellosGalicia_UTF8.csv"):
        url = TG.format(f=name)
        raw, headers = get(url)
        enc = "utf-8-sig" if "UTF8" in name else "iso-8859-1"
        text = raw.decode(enc)
        rows = list(csv.reader(io.StringIO(text), delimiter=";"))
        entry = {"fonte": "Turismo de Galicia", "url": url, "descargado_utc": now(), "bytes": len(raw),
                 "last_modified": headers.get("Last-Modified"), "filas": len(rows) - 1, "cabeceira": rows[0]}
        if name.startswith("EOH_"):
            h = rows[0]
            key = "PUNTO" if "Puntos" in name else "XEODESTINO"
            i = {k: h.index(k) for k in ("ANO", "MES", "VARIABLE", key, "RESIDENCIA", "TIPO", "VALOR")}
            months = sorted({(int(r[i["ANO"]]), MESES.index(r[i["MES"]]) + 1) for r in rows[1:]})
            entry.update({
                "periodo": f"{months[0][0]}-{months[0][1]:02d}–{months[-1][0]}-{months[-1][1]:02d}",
                "unidades": sorted({r[i[key]] for r in rows[1:]}),
                "variables": sorted({r[i["VARIABLE"]] for r in rows[1:]}),
                "tipo": dict(Counter(r[i["TIPO"]] for r in rows[1:])),
                "baleiros": sum(1 for r in rows[1:] if not r[i["VALOR"]].strip()),
            })
            keep = [rows[0]] + [r for r in rows[1:] if int(r[i["ANO"]]) >= desde and r[i["RESIDENCIA"]] == "Total"]
            f = out / f"turismogalicia_{name[:-4].lower()}_desde{desde}.csv"
        else:
            keep = rows
            f = out / "turismogalicia_concellos_areas.csv"
        with f.open("w", encoding="utf-8", newline="") as fh:
            csv.writer(fh).writerows(keep)
        entry["saida"] = f.name
        log.append(entry)
        print("Turismo de Galicia", name, len(raw), "bytes")


def moviles(out, desde):
    """INE mobile-phone tourism, monthly tourists per Galician concello."""
    series = defaultdict(dict)
    names = {}
    for t, spec in MOVILES.items():
        raw, _ = get(f"{TEMPUS}/VALORES_GRUPOSTABLA/{t}/{spec['grupo']}")
        mun = [v for v in json.loads(raw) if str(v.get("Codigo", ""))[:2] in GAL and len(str(v["Codigo"])) == 5]
        ids = {v["Id"]: v["Codigo"] for v in mun}
        names.update({v["Codigo"]: v["Nombre"] for v in mun})
        by_name = {v["Nombre"]: v["Codigo"] for v in mun}
        assert len(by_name) == len(mun), "duplicated municipality names"
        secret = missing = calls = 0
        idl = sorted(ids)
        for k in range(0, len(idl), 25):
            chunk = idl[k:k + 25]
            url = f"{TEMPUS}/DATOS_TABLA/{t}?" + "&".join(f"tv=19:{i}" for i in chunk) + f"&tv={spec['filtro']}"
            raw, _ = get(url)
            calls += 1
            for s in json.loads(raw):
                # Series name: «Dato base. <municipio>. <orixe>. Turistas.» (order varies by table)
                parts = [x.strip(". ") for x in s["Nombre"].split(". ")]
                code = next(by_name[x] for x in parts if x in by_name)
                for d in s["Data"]:
                    mes = f"{d['Anyo']}-{d['FK_Periodo']:02d}"
                    if d.get("Secreto"):
                        secret += 1
                    if d.get("Valor") is None:
                        missing += 1
                    series[(code, mes)][spec["campo"]] = d.get("Valor")
        months = sorted({m for (c, m), v in series.items() if spec["campo"] in v})
        per_month = Counter(m for (c, m), v in series.items() if v.get(spec["campo"]) is not None)
        never = sorted(c for c in names if not any(series.get((c, m), {}).get(spec["campo"]) for m in months))
        log.append({
            "fonte": "INE turismo móbiles", "taboa": t, "filtro": spec["filtro"], "chamadas": calls,
            "url_exemplo": url, "descargado_utc": now(), "concellos_na_dimension": len(ids),
            "periodo": f"{months[0]}–{months[-1]}" if months else "", "meses": len(months),
            "valores_secreto": secret, "valores_nulos": missing,
            "concellos_con_dato_por_mes_min_max": [min(per_month.values()), max(per_month.values())] if per_month else [],
            "concellos_con_dato": {m: per_month[m] for m in months[-14:]},
            "concellos_sen_ningun_dato": [f"{c} {names[c]}" for c in never],
        })
        print("INE móbiles", t, len(ids), "concellos", calls, "chamadas")
    f = out / f"ine_turismo_moviles_concellos_desde{desde}.csv"
    with f.open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        cols = [s["campo"] for s in MOVILES.values()]
        w.writerow(["codigo", "concello", "mes"] + cols)
        for (c, m), v in sorted(series.items()):
            if m[:4] >= str(desde):
                w.writerow([c, names[c], m] + ["" if v.get(k) is None else int(v[k]) for k in cols])


def ige_aloxamentos(out):
    """IGE 1826: accommodation places by type and concello, latest year."""
    raw, _ = get(f"{IGE}/json/metadatos/1826/selector")
    meta = json.loads(raw.decode("utf-8"))
    els = [e for b in meta if isinstance(b, list) for e in b if isinstance(e, dict) and e.get("CODELEM") is not None]
    last = max(int(e["CODELEM"]) for e in els if str(e["EJE"]) == "0")
    url = f"{IGE}/csv/datos/1826/0:{last}"
    raw, _ = get(url)
    text = raw.decode("iso-8859-1")
    f = out / f"ige_1826_aloxamentos_{last}.csv"
    f.write_text(text, encoding="utf-8")
    log.append({"fonte": "IGE", "taboa": "1826", "titulo": meta[0].get("TITTABLA"), "orixe": meta[0].get("FUENTE"),
                "url": url, "descargado_utc": now(), "bytes": len(raw), "saida": f.name,
                "notas_ige": str(meta[0].get("NOTAS", "")).replace("<br>", " ")[:600]})
    print("IGE 1826", last, len(raw), "bytes")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    p.add_argument("--desde", type=int, default=2024)
    p.add_argument("--sen-moviles", action="store_true")
    a = p.parse_args()
    out = Path(a.saida)
    out.mkdir(parents=True, exist_ok=True)
    ine_eoh(out, a.desde)
    turismo_galicia(out, a.desde)
    if not a.sen_moviles:
        moviles(out, a.desde)
    ige_aloxamentos(out)
    rex = out / "rexistro.json"
    prev = json.loads(rex.read_text()) if rex.exists() else []
    rex.write_text(json.dumps(prev + log, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    main()
