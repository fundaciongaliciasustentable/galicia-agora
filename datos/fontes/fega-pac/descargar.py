#!/usr/bin/env python3
"""Phase 0 sample for FEGA «Beneficiarios de ayudas de la PAC» (FEAGA + Feader).

Downloads the yearly «Beneficiarios por municipio» zip for one financial year
(16 Oct n-1 to 15 Oct n) into a temporary directory OUTSIDE the repo, reads it
in memory and writes ONLY aggregated rows for Galicia:

  concello x medida  ->  number of distinct beneficiaries, rows, euros

Privacy: the raw file has names of natural persons. Names and identifiers are
never written. Cells with fewer than MIN_CELA beneficiaries are pooled
(per concello into «outras medidas», with secondary suppression so the pooled
cell can not be recovered by subtraction; concellos with fewer than MIN_CELA
beneficiaries go to «resto da provincia»). Any final cell still under
MIN_CELA keeps its count but has its euros blanked. The temp dir is deleted.

Usage:
  python3 -I descargar.py [--ano 2025] [--min-cela 10] [--saida mostra]

Stdlib only. Log in <saida>/rexistro.json.
"""

import argparse
import csv
import io
import json
import re
import tempfile
import time
import unicodedata
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

UA = ("MapasGaliciaSustentable/0.1 (+https://mapas.galiciasustentable.org; "
      "galiciasustentable@galiciasustentable.org)")
BASE = "https://www.fega.gob.es"
PAXINA = BASE + "/es/datos-abiertos/consulta-de-beneficiarios-pac/descarga-de-ficheros/datos-{ano}-por-municipio"
REPO = Path(__file__).resolve().parents[3]
INE_JSON = REPO / "pipeline/layers/centros-saude/concellos-ine.json"
PROV = {"A Coruña": "15", "Lugo": "27", "Ourense": "32", "Pontevedra": "36"}
# FEGA names that do not match the current INE name (merged or renamed concellos).
# Keys are norm() without a leading article.
ALIAS = {
    ("27", "alfoz"): "27002", ("32", "castrocaldelas"): "32023", ("36", "cangas"): "36008",
    ("15", "cesuras"): "15902", ("15", "ozadosrios"): "15902",      # Oza-Cesuras since 2013
    ("36", "cerdedo"): "36902", ("36", "cotobade"): "36902",        # Cerdedo-Cotobade since 2016
}
_last = [0.0]


def get(url):
    wait = 1.0 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    r = urllib.request.urlopen(req, timeout=300)
    _last[0] = time.time()
    return r


def norm(s):
    s = s.strip()
    m = re.match(r"^(.*) \((A|O|As|Os)\)$", s)
    if m:
        s = m.group(2) + " " + m.group(1)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"^(a|o|as|os) ", "", s)   # «A Pastoriza» = «Pastoriza»
    return re.sub(r"[^a-z]", "", s)


def euros(x):
    x = x.strip().replace(",", ".")
    return float(x) if x else 0.0


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--ano", default="2025", help="financial year (16 Oct n-1 to 15 Oct n)")
    p.add_argument("--min-cela", type=int, default=10)
    p.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    a = p.parse_args()
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    MIN = a.min_cela

    ine = json.loads(INE_JSON.read_text(encoding="utf-8")) if INE_JSON.exists() else {}
    idx = {(k[:2], norm(v)): k for k, v in ine.items()}
    idx.update(ALIAS)

    page_url = PAXINA.format(ano=a.ano)
    html = get(page_url).read().decode("utf-8", "replace")
    m = re.search(r'href="(/sites/default/files/[^"]+\.zip)"', html)
    if not m:
        raise SystemExit("no zip link in " + page_url)
    zip_url = BASE + m.group(1)
    fpub = re.search(r"Fec\.Pub\.:\s*(?:<[^>]+>\s*)*([^<]+)", html)
    fact = re.search(r"Fec\.Act\.:\s*(?:<[^>]+>\s*)*([^<]+)", html)

    # cell key: (prov, ine_or_pool, medida_code) -> [set(benef hashes), rows, feaga, feader, total]
    cells = defaultdict(lambda: [set(), 0, 0.0, 0.0, 0.0, 0.0])
    medida_nome = {}
    nomes = {}
    stats = {"filas_total": 0, "filas_galicia": 0, "filas_14_campos": 0, "sen_codigo_ine": defaultdict(int)}
    with tempfile.TemporaryDirectory(prefix="fega-") as tmp:
        zpath = Path(tmp) / "fega.zip"
        r = get(zip_url)
        last_mod = r.headers.get("Last-Modified")
        with open(zpath, "wb") as f:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                f.write(b)
        zbytes = zpath.stat().st_size
        with zipfile.ZipFile(zpath) as z:
            member = z.namelist()[0]
            usize = z.getinfo(member).file_size
            with z.open(member) as raw:
                f = io.TextIOWrapper(raw, encoding="latin-1", newline="")
                header = f.readline().rstrip("\r\n").split(";")
                for line in f:
                    c = line.rstrip("\r\n").split(";")
                    stats["filas_total"] += 1
                    if len(c) < 13:
                        continue
                    if len(c) > 13:
                        stats["filas_14_campos"] += 1
                    benef = c[0] if len(c) == 13 else ";".join(c[: len(c) - 12])
                    provincia, municipio, medida = c[-11], c[-10], c[-9]
                    if provincia not in PROV:
                        continue
                    stats["filas_galicia"] += 1
                    pc = PROV[provincia]
                    _cp, _, nome = municipio.partition(" - ")
                    code = idx.get((pc, norm(nome)))
                    if code is None:
                        stats["sen_codigo_ine"][municipio[:2] + "XXX" if "XXX" in municipio else nome] += 1
                        code = pc + "_resto"
                    else:
                        nomes[code] = ine.get(code, nome)
                    mcode, _, mname = medida.strip().partition(" ")
                    medida_nome.setdefault(mcode, mname.strip())
                    cell = cells[(pc, code, mcode)]
                    cell[0].add(hash(benef))
                    cell[1] += 1
                    cell[2] += euros(c[-5])   # FEAGA
                    cell[3] += euros(c[-4])   # FEADER
                    cell[4] += euros(c[-1])   # IMPORTE_EUROS
                    cell[5] += euros(c[-3])   # IMPORTECOFIN
    # temp dir and raw file are gone here

    def merge(dst, src):
        dst[0] |= src[0]
        dst[1] += src[1]
        for i in (2, 3, 4, 5):
            dst[i] += src[i]

    def new():
        return [set(), 0, 0.0, 0.0, 0.0, 0.0]

    by_conc = defaultdict(dict)
    for (pc, code, mc), v in cells.items():
        by_conc[(pc, code)][mc] = v
    out = []          # (pc, code, medida_code, cell)
    pool = defaultdict(new)   # province pool
    for (pc, code), meds in by_conc.items():
        if code.endswith("_resto"):
            for v in meds.values():
                merge(pool[pc], v)
            continue
        allb = set().union(*(v[0] for v in meds.values()))
        if len(allb) < MIN:
            for v in meds.values():
                merge(pool[pc], v)
            continue
        visible = {k: v for k, v in meds.items() if len(v[0]) >= MIN}
        outras = new()
        for k, v in meds.items():
            if k not in visible:
                merge(outras, v)
        # secondary suppression: a non-empty «outras» under MIN absorbs the smallest visible cells
        while 0 < len(outras[0]) < MIN and visible:
            k = min(visible, key=lambda k: (len(visible[k][0]), k))
            merge(outras, visible.pop(k))
        for k, v in visible.items():
            out.append((pc, code, k, v))
        if outras[1]:
            out.append((pc, code, "OUTRAS", outras))
    for pc, v in pool.items():
        out.append((pc, pc + "_resto", "TODAS", v))

    fn = saida / f"fega_pac_{a.ano}_concello_medida.csv"
    suprimidas = 0
    with open(fn, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["exercicio_financeiro", "provincia_codigo", "codigo_ine", "concello", "medida_codigo",
                    "medida", "beneficiarios", "filas", "feaga_eur", "feader_eur", "cofinanciamento_eur",
                    "importe_eur", "nota"])
        for pc, code, mc, v in sorted(out, key=lambda r: (r[0], r[1], r[2])):
            nb = len(v[0])
            nota = ""
            if code.endswith("_resto"):
                conc, ci = "Resto da provincia (concellos agrupados)", ""
                nota = "inclúe as filas que FEGA xa agrupa por provincia (≤10 beneficiarios no municipio)"
            else:
                conc, ci = nomes.get(code, ""), code
            mnome = {"OUTRAS": f"Outras medidas (celas con menos de {MIN} beneficiarios)",
                     "TODAS": "Todas as medidas"}.get(mc, medida_nome.get(mc, ""))
            amounts = [f"{v[2]:.2f}", f"{v[3]:.2f}", f"{v[5]:.2f}", f"{v[4]:.2f}"]
            if nb < MIN:
                amounts = ["", "", "", ""]
                nota = (nota + "; " if nota else "") + f"importes suprimidos (<{MIN} beneficiarios)"
                suprimidas += 1
            w.writerow([a.ano, pc, ci, conc, mc, mnome, nb, v[1], *amounts, nota])

    concellos_con_datos = sorted({c for (_p, c, _m) in cells if not c.endswith("_resto")})
    concellos = sorted({c for (_pc, c, _m, _v) in out if not c.endswith("_resto")})
    total = sum(v[4] for v in cells.values())
    rex = {
        "fonte": "FEGA · Beneficiarios de ayudas de la PAC (FEAGA e Feader) por municipio",
        "exercicio_financeiro": a.ano,
        "periodo": f"{int(a.ano) - 1}-10-16 a {a.ano}-10-15",
        "descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "paxina": page_url,
        "url": zip_url,
        "bytes_zip": zbytes,
        "bytes_txt_descomprimido": usize,
        "last_modified": last_mod,
        "fec_pub": fpub.group(1).strip() if fpub else None,
        "fec_act": fact.group(1).strip() if fact else None,
        "cabeceira_orixinal": header,
        "filas_total_espana": stats["filas_total"],
        "filas_galicia": stats["filas_galicia"],
        "filas_con_punto_e_coma_extra": stats["filas_14_campos"],
        "importe_galicia_eur": round(total, 2),
        "concellos_ine_con_beneficiarios": len(concellos_con_datos),
        "concellos_ine_con_fila_propia": len(concellos),
        "concellos_ine_total": len(ine),
        "filas_sen_codigo_ine": dict(stats["sen_codigo_ine"]),
        "min_cela": MIN,
        "celas_con_importe_suprimido": suprimidas,
        "saida": fn.name,
        "filas_saida": len(out),
        "privacidade": "sen nomes nin identificadores; agregado en memoria; ficheiro bruto borrado",
    }
    (saida / "rexistro.json").write_text(json.dumps(rex, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: rex[k] for k in ("bytes_zip", "filas_galicia", "importe_galicia_eur",
                                          "concellos_ine_con_fila_propia", "filas_saida",
                                          "celas_con_importe_suprimido")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
