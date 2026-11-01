#!/usr/bin/env python3
"""Phase 0 sample for «Gasto do orzamento da Xunta por concello».

Checks four candidate sources and builds the one series that can be mapped
per concello and per year:

1. Orzamentos da Xunta (orzamentos.xunta.gal): the open-data CSV (planned
   spending by consellería and chapter) and the investment annex (Serie verde,
   PDF). Two annex fragments are scanned to count the territorial codes of
   every project ("TERRITORIALIZACIÓN"): they are provinces, not concellos.
2. Ministerio de Hacienda, CONPREL (liquidations of local budgets, Access
   databases, 2002 onwards). Income received by each concello from the
   autonomous community: article 45 (current) and 75 (capital), with the
   1989 (455/755) or 2010 (450/750, 450.00 = participation in Xunta taxes,
   i.e. the Fondo de Cooperación Local) breakdown. Executed figures
   ("derechos reconocidos"). This is the series written to mostra/.
3. BDNS / SNPSAP API: one month of grants from Galician regional bodies to
   beneficiaries whose NIF is a concello (P + INE code + 00 + letter).
   Only public entities are kept; nothing about persons is written.
4. Licence texts (orzamentos aviso legal, Hacienda aviso legal).

The Access files (13-57 MB zipped, 120-440 MB unzipped) go to a temporary
directory outside the repo and are deleted at the end. They are read with a
minimal stdlib Jet4/ACE page reader (no mdbtools, no pyodbc).

Usage:
  python3 -I descargar.py [--anos 2003 2010 2023] [--bdns-mes 2024-03] [--saida mostra]

Stdlib only. Pauses >= 1 s between requests. Log in <saida>/rexistro.json.
"""

import argparse
import calendar
import collections
import csv
import html
import json
import re
import shutil
import struct
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import zlib
from datetime import datetime, timezone
from pathlib import Path

UA = ("MapasGaliciaSustentable/0.1 (+https://mapas.galiciasustentable.org; "
      "galiciasustentable@galiciasustentable.org)")
PAUSE = 1.2
LOG = []

ORZ = "https://orzamentos.xunta.gal"
ORZ_ANO = 2026
CONPREL = "https://serviciostelematicosext.hacienda.gob.es/SGFAL/CONPREL"
HACIENDA_AVISO = "https://www.hacienda.gob.es/es-ES/Paginas/AvisoLegal.aspx"
BDNS = "https://www.infosubvenciones.es/bdnstrans/api"
GALICIA = ("15", "27", "32", "36")
# Merged concellos: old INE code -> current code (2013 Oza-Cesuras, 2016 Cerdedo-Cotobade)
FUSIONS = {"15026": "15902", "15063": "15902", "36011": "36902", "36012": "36902"}


def req(url, method="GET", data=None, dest=None):
    h = {"User-Agent": UA}
    if data is not None:
        data = urllib.parse.urlencode(data).encode()
        h["Content-Type"] = "application/x-www-form-urlencoded"
    r = urllib.request.Request(url, headers=h, method=method, data=data)
    body, n = b"", 0
    try:
        with urllib.request.urlopen(r, timeout=600) as resp:
            st, hd = resp.status, dict(resp.headers)
            if method != "HEAD":
                if dest:
                    with open(dest, "wb") as fh:
                        shutil.copyfileobj(resp, fh, 1 << 20)
                    n = Path(dest).stat().st_size
                else:
                    body = resp.read()
                    n = len(body)
            else:
                n = int(hd.get("Content-Length", 0) or 0)
    except urllib.error.HTTPError as e:
        st, hd = e.code, dict(e.headers)
    LOG.append({"url": url, "metodo": method, "status": st, "bytes": n,
                "content_type": hd.get("Content-Type"), "last_modified": hd.get("Last-Modified"),
                "utc": datetime.now(timezone.utc).isoformat(timespec="seconds")})
    time.sleep(PAUSE)
    return body, st, hd


def html_text(raw):
    t = raw.decode("utf-8", "replace")
    t = re.sub(r"(?s)<script.*?</script>|<style.*?</style>", " ", t)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    return re.sub(r"\s+", " ", t)


# --- 1. Investment annex (PDF): territorial codes per project -----------------

def pdf_territories(raw):
    """Crude text dump of the iTextSharp PDFs of the annex.
    Glyph id + 29 = ASCII for these subset fonts (accents come out as '?')."""
    def dec(h):
        h = h.decode()
        return "".join(chr(int(h[i:i + 4], 16) + 29) if int(h[i:i + 4], 16) < 0x60 else "?"
                       for i in range(0, len(h) - 3, 4))
    text = []
    for m in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", raw, re.S):
        try:
            d = zlib.decompress(m.group(1))
        except zlib.error:
            continue
        for bt in re.findall(rb"BT(.*?)ET", d, re.S):
            parts = [dec(t.group(1)) if t.group(1) else t.group(2).decode("latin-1")
                     for t in re.finditer(rb"<([0-9A-Fa-f]+)>|\(((?:[^()\\]|\\.)*)\)", bt)]
            text.append("".join(parts))
    text = "\n".join(text)
    proxectos = len(re.findall(r"TERRITORIALIZACI.N", text))
    codigos = collections.Counter()
    for seg in re.findall(r"TERRITORIALIZACI.N(.*)", text):
        # "1500000PROVINCIA DA CORU?A73,512700000PROVINCIA DE LUGO07,57..."
        for code, nome in re.findall(r"(?:^|,\d\d)(\d{7})([A-Z?][A-Z? ']+?)(?=\d|$)", seg):
            codigos[f"{code} {nome.strip()}"] += 1
    return {"proxectos": proxectos, "codigos": dict(codigos),
            "codigos_non_provinciais": sum(v for k, v in codigos.items() if k[2:7] != "00000")}


# --- 2. Minimal Jet4 / ACE (.mdb / .accdb) reader ------------------------------

PG = 4096


class Jet:
    """Read-only. Scans every data page and keeps the rows owned by one table
    definition page, so usage maps and indexes are not needed. Enough for the
    CONPREL tables (text and decimal columns). Overflow rows are counted, not
    followed (none were found in 2003 and 2023)."""

    def __init__(self, path):
        self.f = open(path, "rb")
        self.f.seek(0, 2)
        self.npages = self.f.tell() // PG
        self.overflow = 0

    def page(self, n):
        self.f.seek(n * PG)
        return self.f.read(PG)

    def tdef(self, n):
        buf = self.page(n)
        nxt = struct.unpack_from("<I", buf, 4)[0]
        while nxt:
            p = self.page(nxt)
            buf += p[8:]
            nxt = struct.unpack_from("<I", p, 4)[0]
        ncols = struct.unpack_from("<H", buf, 45)[0]
        pos = 63 + struct.unpack_from("<I", buf, 51)[0] * 12
        cols = []
        for i in range(ncols):
            e = buf[pos + i * 25: pos + (i + 1) * 25]
            cols.append({"type": e[0], "num": struct.unpack_from("<H", e, 5)[0],
                         "var": struct.unpack_from("<H", e, 7)[0], "scale": e[12],
                         "fixed": e[15] & 1, "foff": struct.unpack_from("<H", e, 21)[0],
                         "size": struct.unpack_from("<H", e, 23)[0]})
        pos += ncols * 25
        for c in cols:
            ln = struct.unpack_from("<H", buf, pos)[0]
            c["name"] = buf[pos + 2: pos + 2 + ln].decode("utf-16-le")
            pos += 2 + ln
        return cols

    @staticmethod
    def value(c, b):
        t = c["type"]
        if t == 10:
            if b[:2] == b"\xff\xfe":  # Jet4 compressed unicode
                out, comp, i, b = [], True, 0, b[2:]
                while i < len(b):
                    if b[i] == 0:
                        comp, i = not comp, i + 1
                    elif comp:
                        out.append(chr(b[i])); i += 1
                    else:
                        out.append(b[i:i + 2].decode("utf-16-le", "replace")); i += 2
                return "".join(out).strip()
            return b.decode("utf-16-le", "replace").strip()
        if t == 16:  # decimal: sign byte + four LE uint32, most significant first
            w = struct.unpack("<4I", b[1:17])
            v = (w[3] | (w[2] << 32) | (w[1] << 64) | (w[0] << 96)) / 10 ** c["scale"]
            return -v if b[0] & 0x80 else v
        if t == 4: return struct.unpack("<i", b[:4])[0]
        if t == 3: return struct.unpack("<h", b[:2])[0]
        if t == 7: return struct.unpack("<d", b[:8])[0]
        if t == 5: return struct.unpack("<q", b[:8])[0] / 10000
        return b

    def rows(self, tdef_page, wanted):
        cols = self.tdef(tdef_page)
        pick = [c for c in cols if c["name"].lower() in wanted]
        hasvar = any(not c["fixed"] for c in cols)
        for n in range(1, self.npages):
            p = self.page(n)
            if p[0] != 1 or struct.unpack_from("<I", p, 4)[0] != tdef_page:
                continue
            end = PG
            for r in range(struct.unpack_from("<H", p, 12)[0]):
                raw = struct.unpack_from("<H", p, 14 + r * 2)[0]
                start, rend, end = raw & 0x1FFF, end, raw & 0x1FFF
                if raw & 0x8000:
                    continue
                if raw & 0x4000:
                    self.overflow += 1
                    continue
                row = p[start:rend]
                ncols = struct.unpack_from("<H", row, 0)[0]
                bm = (ncols + 7) // 8
                nullmask = row[len(row) - bm:]
                nvar = struct.unpack_from("<H", row, len(row) - bm - 2)[0] if hasvar else 0
                voff = [struct.unpack_from("<H", row, len(row) - bm - 4 - 2 * i)[0]
                        for i in range(nvar + 1)]
                out = {}
                for c in pick:
                    k, key = c["num"], c["name"].lower()
                    if not (k < ncols and (nullmask[k // 8] >> (k % 8)) & 1):
                        out[key] = None
                    elif c["fixed"]:
                        s = 2 + c["foff"]
                        out[key] = self.value(c, row[s:s + c["size"]])
                    elif c["var"] < nvar:
                        out[key] = self.value(c, row[voff[c["var"]]:voff[c["var"] + 1]])
                    else:
                        out[key] = None
                yield out

    def tables(self):
        return {r["name"].lower(): int(r["id"]) & 0x00FFFFFF
                for r in self.rows(2, {"id", "name", "type"}) if r["type"] == 1}


# CONPREL income accounts kept (article totals and the CCAA breakdown)
CONTAS_1989 = {"45": "art45", "455": "ag45", "75": "art75", "755": "ag75"}
CONTAS_2010 = {"45": "art45", "450": "ag45", "450.00": "fcl", "75": "art75", "750": "ag75"}


def conprel_ano(ano, tmp):
    url = (f"{CONPREL}/Consulta/DescargaFichero?CCAA=&TipoDato=Liquidaciones"
           f"&Ejercicio={ano}&TipoPublicacion=Access")
    zpath = tmp / f"liq{ano}.zip"
    _, st, _ = req(url, dest=zpath)
    if st != 200:
        return None, {"ano": ano, "status": st}
    with zipfile.ZipFile(zpath) as z:
        name = z.namelist()[0]
        z.extract(name, tmp)
    db = Jet(tmp / name)
    t = db.tables()
    db.overflow = 0  # count only rows of the data tables, not of MSysObjects
    inv = {}
    for r in db.rows(t["tb_inventario"], {"id", "idente", "codbdgel", "nombreppal", "poblacion"}):
        cod = r["codbdgel"] or ""
        if cod[:2] in GALICIA and cod[5:7] == "AA":
            inv[r["id"]] = (cod[:5], r["nombreppal"], r["poblacion"])
    cons = "tb_economica_cons" in t
    tabla = "tb_economica_cons" if cons else "tb_economica"
    contas = CONTAS_1989 if ano < 2010 else CONTAS_2010
    val = "importe" if ano < 2009 else "importer"
    agg = collections.defaultdict(float)
    orixe = {}  # id -> table the income rows came from
    for r in db.rows(t[tabla], {"id", "tipreig", "cdcta", val}):
        if r["id"] in inv and r["tipreig"] == "I":
            orixe[r["id"]] = "consolidada" if cons else "entes"
            k = contas.get((r["cdcta"] or "").strip())
            if k:
                agg[(r["id"], k)] += r[val] or 0
    if cons:
        # concellos with estado "E" have no consolidated rows: use their
        # administración xeral (idente == id) from tb_economica
        falta = set(inv) - set(orixe)
        for r in db.rows(t["tb_economica"], {"id", "idente", "tipreig", "cdcta", val}):
            if r["id"] in falta and r["idente"] == r["id"] and r["tipreig"] == "I":
                orixe[r["id"]] = "administracion_xeral"
                k = contas.get((r["cdcta"] or "").strip())
                if k:
                    agg[(r["id"], k)] += r[val] or 0
    out = []
    for i, (cod, nome, pob) in inv.items():
        row = {"ano": ano, "ine": FUSIONS.get(cod, cod), "ine_orixinal": cod,
               "concello_conprel": nome, "poboacion_conprel": int(pob or 0),
               "taboa": orixe.get(i, "sen_ingresos")}
        for k in ("art45", "ag45", "fcl", "art75", "ag75"):
            row[k] = round(agg.get((i, k), 0.0), 2) if (k != "fcl" or ano >= 2010) else None
        out.append(row)
    info = {"ano": ano, "ficheiro": name, "bytes_zip": zpath.stat().st_size,
            "bytes_bd": (tmp / name).stat().st_size, "taboa": tabla, "importe": val,
            "concellos_con_liquidacion": len({r["ine_orixinal"] for r in out}),
            "filas_overflow_sen_ler": db.overflow}
    db.f.close()
    (tmp / name).unlink()
    zpath.unlink()
    return out, info


# --- 3. BDNS: grants from Galician regional bodies to concellos ---------------

def bdns_mes(mes):
    raw, st, _ = req(f"{BDNS}/organos?vpd=GE&idAdmon=A")
    org = json.loads(raw)
    gal = [x for x in org if x["descripcion"].upper() == "GALICIA"][0]
    ids = ",".join(str(c["id"]) for c in gal["children"])
    y, m = map(int, mes.split("-"))
    d1, d2 = f"01/{m:02d}/{y}", f"{calendar.monthrange(y, m)[1]:02d}/{m:02d}/{y}"
    agg = collections.defaultdict(lambda: [0, 0.0])
    total, page, aviso = 0, 0, None
    while True:
        url = (f"{BDNS}/concesiones/busqueda?vpd=GE&page={page}&pageSize=5000"
               f"&organos={ids}&fechaDesde={d1}&fechaHasta={d2}")
        raw, st, _ = req(url)
        d = json.loads(raw)
        aviso = d.get("advertencia")
        total = d["totalElements"]
        for x in d["content"]:
            nif = (x.get("beneficiario") or "")[:9]
            # concello NIF: P + province + municipality (3) + "00" + control letter
            if re.fullmatch(r"P(15|27|32|36)\d{3}00[A-Z]", nif):
                a = agg[(FUSIONS.get(nif[1:6], nif[1:6]), x.get("nivel3"))]
                a[0] += 1
                a[1] += x.get("importe") or 0
        if d.get("last", True):
            break
        page += 1
    rows = [{"mes": mes, "ine": k[0], "organo": k[1], "concesions": v[0], "importe": round(v[1], 2)}
            for k, v in sorted(agg.items())]
    return rows, {"mes": mes, "organos_galicia": len(gal["children"]),
                  "concesions_galicia_mes": total, "concesions_a_concellos": sum(r["concesions"] for r in rows),
                  "importe_a_concellos": round(sum(r["importe"] for r in rows), 2),
                  "concellos_distintos": len({r["ine"] for r in rows}),
                  "advertencia_api": aviso}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--anos", type=int, nargs="+", default=[2003, 2010, 2023])
    ap.add_argument("--bdns-mes", default="2024-03")
    ap.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    a = ap.parse_args()
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    resumo = {}

    # 1. Xunta budget: open data CSV, legal notice and two annex fragments
    raw, st, _ = req(f"{ORZ}/orzamentos/{ORZ_ANO}/DE/DATOS_ABERTOS/gastos.csv")
    lines = raw.decode("latin-1").splitlines()
    resumo["orzamentos_datos_abertos"] = {"ano": ORZ_ANO, "cabeceira": lines[0] if lines else None,
                                          "filas": len(lines) - 1}
    raw, st, _ = req(f"{ORZ}/web/orzamentos{ORZ_ANO}/aviso-legal")
    m = re.search(r"Só está autorizado o uso persoal non comercial\.", html_text(raw))
    resumo["orzamentos_aviso_legal"] = m.group(0) if m else "frase non atopada"
    anexo = {}
    for frag in ("INV_II_V1_FR01", "INV_II_V2_FR04", "INV_I_V1_FR07"):
        raw, st, _ = req(f"{ORZ}/orzamentos/{ORZ_ANO}/DE/LIBROS/{frag}.PDF")
        if st == 200:
            anexo[frag] = pdf_territories(raw)
    resumo["anexo_investimentos_territorializacion"] = anexo

    # 2. CONPREL: size of every year, then the chosen years parsed
    raw, st, _ = req(HACIENDA_AVISO)
    m = re.search(r"Origen de los datos: Ministerio de Hacienda", html_text(raw))
    resumo["hacienda_cita"] = m.group(0) if m else "frase non atopada"
    tamanos = {}
    for y in range(2002, datetime.now().year):
        _, st, h = req(f"{CONPREL}/Consulta/DescargaFichero?CCAA=&TipoDato=Liquidaciones"
                       f"&Ejercicio={y}&TipoPublicacion=Access", "HEAD")
        tamanos[y] = int(h.get("Content-Length", 0) or 0) if st == 200 else st
    raw, st, _ = req(f"{CONPREL}/Consulta/ExisteFichero", "POST",
                     {"CCAA": "", "TipoDato": "Liquidaciones",
                      "Ejercicio": datetime.now().year - 1, "TipoPublicacion": "Access"})
    resumo["conprel_bytes_zip_por_ano"] = tamanos
    resumo["conprel_avance_ano_anterior_access"] = raw.decode("utf-8", "replace")

    tmp = Path(tempfile.mkdtemp(prefix="conprel-"))
    filas, infos = [], []
    try:
        for y in a.anos:
            out, info = conprel_ano(y, tmp)
            infos.append(info)
            filas += out or []
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    # merged concellos: add the old units into the current code
    acc = collections.OrderedDict()
    for r in sorted(filas, key=lambda r: (r["ano"], r["ine"])):
        k = (r["ano"], r["ine"])
        if k not in acc:
            acc[k] = dict(r)
            acc[k]["ine_orixinal"] = r["ine_orixinal"]
        else:
            for f in ("poboacion_conprel", "art45", "ag45", "fcl", "art75", "ag75"):
                if r[f] is not None:
                    acc[k][f] = round((acc[k][f] or 0) + r[f], 2)
            acc[k]["ine_orixinal"] += "+" + r["ine_orixinal"]
            acc[k]["taboa"] += "+" + r["taboa"]
    cols = ["ano", "ine", "ine_orixinal", "concello_conprel", "poboacion_conprel", "taboa",
            "art45", "ag45", "fcl", "art75", "ag75"]
    with (saida / "conprel_ccaa_concellos.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        for r in acc.values():
            w.writerow(r)
    resumo["conprel"] = infos
    por_ano = collections.defaultdict(lambda: collections.Counter())
    for r in acc.values():
        for f in ("art45", "ag45", "fcl", "art75", "ag75"):
            por_ano[r["ano"]][f] += r[f] or 0
        por_ano[r["ano"]]["concellos"] += 1
        por_ano[r["ano"]]["sen_art45_nin_art75"] += (r["art45"] or 0) + (r["art75"] or 0) == 0
    resumo["conprel_galicia_por_ano"] = {
        y: {k: (None if k == "fcl" and y < 2010 else round(v)) for k, v in c.items()}
        for y, c in por_ano.items()}

    # 3. BDNS, one month
    rows, info = bdns_mes(a.bdns_mes)
    with (saida / f"bdns_concellos_{a.bdns_mes}.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["mes", "ine", "organo", "concesions", "importe"])
        w.writeheader()
        w.writerows(rows)
    resumo["bdns"] = info

    rex = {"descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "user_agent": UA, "resumo": resumo, "peticions": LOG}
    (saida / "rexistro.json").write_text(json.dumps(rex, ensure_ascii=False, indent=2) + "\n",
                                         encoding="utf-8")
    print(json.dumps({k: v for k, v in resumo.items() if k != "conprel_bytes_zip_por_ano"},
                     ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
