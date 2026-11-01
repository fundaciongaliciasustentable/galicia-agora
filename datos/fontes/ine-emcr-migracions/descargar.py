#!/usr/bin/env python3
"""Phase 0 sample for INE «Estadística de Migraciones y Cambios de Residencia» (EMCR).

What it fetches (all into <saida>/, log in <saida>/rexistro.json):

1. IGE API tables built by the IGE from the EMCR files supplied by INE:
   - 10616: internal migrations, comarca of origin x comarca of destination, 2021-2024
   - 563:   same matrix from the old EVR (1992-2021); only 2019-2021 here, to see the break
   - 10628 / 10629: emigrations / immigrations by type, every concello, 2021-2024
2. INE microdata (EMCR, one ZIP per year, ~276 MB). The ZIP is NOT downloaded whole:
   the script reads its central directory with an HTTP Range request, then streams only
   the compressed tab-separated member CSV/EMCR_<year>.tab (~38 MB transferred),
   decompresses it on the fly and keeps only migrations with origin or destination in
   Galicia. It writes an aggregated origin-destination table by quarter (no row-level
   records). Municipal codes of concellos under 10,000 inhabitants are blanked by INE;
   those ends are kept as province + size class.
   Skip it with --sen-microdatos.

Usage:
  python3 -I descargar.py [--ano 2024] [--sen-microdatos] [--saida mostra]

Stdlib only.
"""

import argparse
import collections
import csv
import io
import json
import struct
import time
import urllib.parse
import urllib.request
import zlib
from datetime import datetime, timezone
from pathlib import Path

UA = ("GaliciaAgora/0.1 (+https://github.com/fundaciongaliciasustentable/galicia-agora; "
      "galiciasustentable@galiciasustentable.org)")
IGE = "https://www.ige.gal/igebdt/igeapi"
INE_ZIP = "https://www.ine.es/ftp/microdatos/emcr/datos_{ano}.zip"
INE_DR = "https://www.ine.es/ftp/microdatos/emcr/dr_emcr_Desde2021.xlsx"
GALICIA = {"15", "27", "32", "36"}
TAMANO = {"1": "non capital ata 10.000 hab.", "2": "non capital 10.001-20.000",
          "3": "non capital 20.001-50.000", "4": "non capital 50.001-100.000",
          "5": "non capital > 100.000", "6": "capital de provincia"}

IGE_TAXOAS = [
    ("10616", "0:2021:2022:2023:2024", "EMCR: migracións internas comarca orixe x comarca destino"),
    ("563", "0:2019:2020:2021", "EVR (serie 1992-2021): mesma matriz, para ver a quebra 2021"),
    ("10628", "0:2021:2022:2023:2024", "EMCR: emigracións segundo tipo, por concello"),
    ("10629", "0:2021:2022:2023:2024", "EMCR: inmigracións segundo tipo, por concello"),
]

_last = {}


def polite(host):
    """At least 1 s between requests to the same host."""
    t = _last.get(host)
    if t is not None:
        wait = 1.0 - (time.monotonic() - t)
        if wait > 0:
            time.sleep(wait)
    _last[host] = time.monotonic()


def request(url, rng=None):
    polite(urllib.parse.urlsplit(url).hostname)
    headers = {"User-Agent": UA}
    if rng:
        headers["Range"] = f"bytes={rng}"
    return urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=180)


def get(url, rng=None):
    with request(url, rng) as r:
        return r.read(), r.status, dict(r.headers)


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ige_tables(saida, log):
    for taboa, filtro, desc in IGE_TAXOAS:
        url = f"{IGE}/csv/datos/{taboa}/{filtro}"
        raw, status, _ = get(url)
        text = raw.decode("iso-8859-1")
        out = saida / f"ige_{taboa}.csv"
        out.write_text(text, encoding="utf-8")
        log.append({"fonte": "IGE API", "taboa": taboa, "descricion": desc, "url": url,
                    "descargado_utc": now(), "http": status, "bytes": len(raw),
                    "filas": text.count("\n") - 1, "saida": out.name})
        print("IGE", taboa, len(raw), "bytes")


def zip_index(url):
    """Read the ZIP central directory with one Range request."""
    raw, status, headers = get(url, "-65536")
    total = int(headers.get("Content-Range", "/0").split("/")[-1])
    eocd = raw.rfind(b"PK\x05\x06")
    entries = []
    j = raw.find(b"PK\x01\x02")
    while 0 <= j < eocd:
        method = struct.unpack("<H", raw[j + 10:j + 12])[0]
        csz, usz = struct.unpack("<II", raw[j + 20:j + 28])
        fl, el, cl = struct.unpack("<HHH", raw[j + 28:j + 34])
        off = struct.unpack("<I", raw[j + 42:j + 46])[0]
        name = raw[j + 46:j + 46 + fl].decode("cp437")
        entries.append({"nome": name, "metodo": method, "comprimido": csz, "descomprimido": usz, "offset": off})
        j = raw.find(b"PK\x01\x02", j + 46 + fl + el + cl)
    return entries, total, status, headers.get("Last-Modified")


def stream_member(url, entry):
    """Yield decoded text lines of one deflated ZIP member, fetched with a Range request."""
    head, _, _ = get(url, f"{entry['offset']}-{entry['offset'] + 29}")
    fl, el = struct.unpack("<HH", head[26:30])
    start = entry["offset"] + 30 + fl + el
    end = start + entry["comprimido"] - 1
    dec = zlib.decompressobj(-15)
    buf = b""
    with request(url, f"{start}-{end}") as r:
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            buf += dec.decompress(chunk)
            *lines, buf = buf.split(b"\n")
            for ln in lines:
                yield ln.decode("latin-1").rstrip("\r")
        buf += dec.flush()
    if buf:
        yield buf.decode("latin-1").rstrip("\r")


def concello_names(saida):
    names = {}
    f = saida / "ige_10628.csv"
    if f.exists():
        for r in csv.DictReader(io.StringIO(f.read_text(encoding="utf-8"))):
            if len(r["CodEspazo"]) == 5:
                names[r["CodEspazo"]] = r["Espazo"].split(" ", 1)[-1]
    return names


def end_code(prov, muni, tam):
    muni = muni.strip()
    if prov in GALICIA:
        return (prov + muni, "") if muni else (f"{prov}-T{tam}", f"resto prov. {prov}, {TAMANO.get(tam, '?')}")
    return ("ext", "") if not prov.strip() else ("ESP-" + prov, "outra CCAA, prov. " + prov)


def microdata(ano, saida, log):
    url = INE_ZIP.format(ano=ano)
    entries, total, status, lastmod = zip_index(url)
    member = next(e for e in entries if e["nome"].endswith(".tab"))
    log.append({"fonte": "INE microdatos EMCR", "url": url, "descargado_utc": now(), "http": status,
                "bytes_zip": total, "last_modified": lastmod, "indice_zip": entries,
                "nota": "Só se le o directorio central (Range) e o membro " + member["nome"]})
    names = concello_names(saida)
    od = collections.Counter()
    tipos = collections.Counter()
    persoas = set()
    header = None
    for line in stream_member(url, member):
        if header is None:
            header = {k.strip('"'): i for i, k in enumerate(line.split("\t"))}
            continue
        r = line.split("\t")
        if len(r) < len(header):
            continue
        g = lambda k: r[header[k]].strip()
        tipo, pp, pd = g("TIPO_MIGR"), g("PROVPROC"), g("PROVDEST")
        if pp not in GALICIA and pd not in GALICIA:
            continue
        o, on = end_code(pp, g("MUNIPROC"), g("TAMUPROC"))
        d, dn = end_code(pd, g("MUNIDEST"), g("TAMUDEST"))
        if tipo == "IE":
            o, on = "estranxeiro", "estranxeiro"
        if tipo == "EE":
            d, dn = "estranxeiro", "estranxeiro"
        od[(g("TRIM"), tipo, o, on or names.get(o, ""), d, dn or names.get(d, ""))] += 1
        tipos[tipo + (" galicia-galicia" if tipo == "MI" and pp in GALICIA and pd in GALICIA else "")] += 1
        if tipo == "MI" and pp in GALICIA and pd in GALICIA:
            persoas.add(g("SECU_PER"))
    out = saida / f"emcr_{ano}_od_galicia_trimestre.csv"
    with out.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["ano", "trimestre", "tipo", "orixe", "orixe_nome", "destino", "destino_nome", "migracions"])
        for (tri, tipo, o, on, d, dn), n in sorted(od.items()):
            w.writerow([ano, tri, tipo, o, on, d, dn, n])
    log.append({"fonte": "INE microdatos EMCR (agregado)", "saida": out.name, "filas": len(od),
                "bytes_transferidos_aprox": member["comprimido"], "migracions_por_tipo": dict(tipos),
                "persoas_distintas_galicia_galicia": len(persoas), "descargado_utc": now()})
    print("INE microdatos", ano, dict(tipos), "persoas MI Galicia-Galicia:", len(persoas))
    raw, status, _ = get(INE_DR)
    (saida / "dr_emcr_Desde2021.xlsx").write_bytes(raw)
    log.append({"fonte": "INE deseño de rexistro", "url": INE_DR, "http": status, "bytes": len(raw),
                "saida": "dr_emcr_Desde2021.xlsx", "descargado_utc": now()})


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--ano", default="2024", help="year of the EMCR microdata (2021-2024)")
    p.add_argument("--sen-microdatos", action="store_true", help="only the IGE API tables")
    p.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    a = p.parse_args()
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    log = []
    ige_tables(saida, log)
    if not a.sen_microdatos:
        microdata(a.ano, saida, log)
    (saida / "rexistro.json").write_text(json.dumps(log, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
