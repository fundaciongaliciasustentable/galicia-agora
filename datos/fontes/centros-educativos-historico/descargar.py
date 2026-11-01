#!/usr/bin/env python3
"""Phase 0 sample for «Escolas pechadas e abertas desde 1980».

Looks for opening and closing dates of schools and, failing that, for a
count of schools per concello and year:

1. IGE table 1653 «Ensinanza non universitaria. Centros de réxime xeral en
   funcionamento segundo as ensinanzas que imparten», by concello, 2005-2025
   (whole table through the open IGE API, ~3.7 MB CSV, Latin-1). Written to
   mostra/ harmonised to the 313 current concellos.
2. Xunta directory of centres (abertos.xunta.gal dataset 0257, one CSV per
   province): columns checked for any creation or closure date.
3. Ministerio de Educación, Registro Estatal de Centros Docentes (RCD):
   Excel export of Galicia, compared code by code with the Xunta list.
4. Teaching sites ("lugares de docencia") of every CRA in the Xunta
   directory: the old unitarias that survive as sites of a grouped school.
5. Licence texts (abertos 0257, IGE aviso legal).

Usage:
  python3 -I descargar.py [--saida mostra] [--sen-cra]

Stdlib only. Pauses >= 1 s between requests. Log in <saida>/rexistro.json.
"""

import argparse
import collections
import csv
import html
import io
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

UA = ("GaliciaAgora/0.1 (+https://github.com/fundaciongaliciasustentable/galicia-agora; "
      "galiciasustentable@galiciasustentable.org)")
PAUSE = 1.2
LOG = []

IGE_API = "https://www.ige.gal/igebdt/igeapi/csv/datos/1653"
IGE_AVISO = "https://www.ige.gal/web/avisolegal.jsp"
ABERTOS = "https://abertos.xunta.gal/catalogo/ensino-formacion/-/dataset/0257/centros-educativos-galicia"
PROVINCIAS = {"001": "15", "003": "27", "005": "32", "007": "36"}
RCD = "https://www.educacion.gob.es/centros"
EDU = "https://www.edu.xunta.gal/centroseducativos"
FUSIONS = {"15026": "15902", "15063": "15902", "36011": "36902", "36012": "36902"}


def req(url, method="GET", data=None):
    h = {"User-Agent": UA}
    if data is not None:
        data = urllib.parse.urlencode(data).encode()
        h["Content-Type"] = "application/x-www-form-urlencoded"
    for intento in range(3):
        r = urllib.request.Request(url, headers=h, method=method, data=data)
        try:
            with urllib.request.urlopen(r, timeout=300) as resp:
                body, st, hd = resp.read(), resp.status, dict(resp.headers)
            break
        except urllib.error.HTTPError as e:
            body, st, hd = b"", e.code, dict(e.headers)
            break
        except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
            body, st, hd = b"", f"erro: {e}", {}
            time.sleep(5 * (intento + 1))
    LOG.append({"url": url, "metodo": method, "status": st, "bytes": len(body),
                "content_type": hd.get("Content-Type"), "last_modified": hd.get("Last-Modified"),
                "utc": datetime.now(timezone.utc).isoformat(timespec="seconds")})
    time.sleep(PAUSE)
    return body, st, hd


def text(raw):
    t = raw.decode("utf-8", "replace")
    t = re.sub(r"(?s)<script.*?</script>|<style.*?</style>", " ", t)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    ap.add_argument("--sen-cra", action="store_true", help="skip the CRA teaching-site requests")
    a = ap.parse_args()
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    resumo = {}

    # 1. IGE 1653, whole table
    raw, st, _ = req(IGE_API)
    rows = list(csv.DictReader(io.StringIO(raw.decode("latin-1"))))
    dim = [k for k in rows[0] if k not in ("CodTempo", "Tempo", "CodEspazo", "Espazo", "DatoN", "DatoT")][0]
    nomes, val = {}, collections.defaultdict(int)
    nulos = collections.Counter()
    for r in rows:
        cod = r["CodEspazo"]
        if len(cod) != 5:
            continue
        novo = FUSIONS.get(cod, cod)
        if cod not in FUSIONS:
            nomes[novo] = r["Espazo"].split(" ", 1)[1]
        if r["DatoN"] == "":
            nulos[(r["Tempo"], cod)] += 1
            continue
        val[(int(r["Tempo"]), novo, r[dim])] += int(r["DatoN"])
    nomes.setdefault("15902", "Oza-Cesuras")
    nomes.setdefault("36902", "Cerdedo-Cotobade")
    anos = sorted({k[0] for k in val})
    tipos = sorted({k[2] for k in val})
    # wide: one row per concello and type of teaching, one column per year
    with (saida / "ige1653_centros_concello.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["ine", "concello", "ensinanzas"] + anos)
        for c in sorted(nomes):
            for tp in tipos:
                w.writerow([c, nomes[c], tp] + [val.get((y, c, tp), "") for y in anos])
    galicia = {r["Tempo"]: int(r["DatoN"]) for r in rows if r["CodEspazo"] == "12" and r[dim] == "Total"}
    concellos = sorted(nomes)
    tot = {(y, c): val.get((y, c, "Total")) for y in anos for c in concellos}
    a0, a1 = anos[0], anos[-1]
    dif = [(tot[(a1, c)] - tot[(a0, c)], c) for c in concellos
           if tot[(a0, c)] is not None and tot[(a1, c)] is not None]
    resumo["ige1653"] = {
        "taboa": "1653", "dimension": dim, "anos": f"{a0}–{a1}", "n_anos": len(anos),
        "ensinanzas": tipos, "filas_api": len(rows), "concellos_harmonizados": len(concellos),
        "galicia_total_por_ano": galicia,
        "galicia_por_ensinanza": {t: {y: sum(v for (yy, c, tt), v in val.items() if yy == y and tt == t)
                                      for y in (a0, 2015, a1)} for t in tipos},
        "concellos_con_0_centros": {y: sum(1 for c in concellos if tot[(y, c)] == 0) for y in anos},
        "celas_baleiras_orixinais": len(nulos),
        "concellos_que_perden": sum(1 for d, _ in dif if d < 0),
        "concellos_que_gañan": sum(1 for d, _ in dif if d > 0),
        "concellos_iguais": sum(1 for d, _ in dif if d == 0),
        "maiores_perdas": [(nomes[c], tot[(a0, c)], tot[(a1, c)]) for d, c in sorted(dif)[:10]],
    }
    raw, st, _ = req(IGE_AVISO)
    m = re.search(r"Debe citarse a fonte.{0,120}?Fonte: IGE: https://www\.ige\.gal", text(raw))
    resumo["ige_aviso_legal"] = m.group(0) if m else "frase non atopada"

    # 2. Xunta directory (abertos 0257): columns and dates
    raw, st, _ = req(ABERTOS)
    t = text(raw)
    lic = re.search(r"Creative Commons BY[ -]SA 4\.0", t)
    resumo["abertos_0257_licenza"] = lic.group(0) if lic else "non atopada"
    xunta, cab = {}, None
    for p in PROVINCIAS:
        raw, st, _ = req(f"{ABERTOS}/{p}/descarga-directa-ficheiro.csv")
        rd = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
        cab = list(rd[0].keys()) if rd else cab
        for r in rd:
            xunta[r["Código"]] = r
    resumo["xunta_0257"] = {
        "centros": len(xunta), "columnas": cab,
        "columnas_con_data": [c for c in (cab or []) if re.search(r"data|fecha|ano|alta|baixa|creac", c, re.I)],
        "tipos": collections.Counter(r["Tipo de centro"] for r in xunta.values()).most_common(),
    }

    # 3. RCD (Ministerio): Excel export of Galicia, codes only
    form = {"nivel": "0", "idComunidad": "11", "idProvincia": "", "naturaleza": "0", "concertado": "0",
            "familia": "0", "ensenanza": "0", "modalidad": "0", "tipoCentro": "0", "provincial": "",
            "comarca": "", "pais": "", "localidad": "0", "codCentro": "", "nombreCentro": "",
            "denominacion": "0", "ensenanzaFP": ""}
    raw, st, hd = req(f"{RCD}/exportarListadoCentrosExcel", "POST", form)
    rcd = {c.decode() for c in re.findall(rb"(?<!\d)((?:15|27|32|36)\d{6})(?!\d)", raw)}
    cab_rcd = [s.decode("latin-1") for s in re.findall(rb"[A-Z][A-Z\xc1\xc9\xcd\xd3\xda ]{3,}", raw[:20000])][:10]
    resumo["rcd"] = {"formato": hd.get("Content-Type"), "bytes": len(raw), "centros": len(rcd),
                     "tamen_na_xunta": len(rcd & set(xunta)), "so_rcd": len(rcd - set(xunta)),
                     "so_xunta": len(set(xunta) - rcd), "cabeceira_aprox": cab_rcd}

    # 4. CRA teaching sites today
    if not a.sen_cra:
        cra = []
        for cod, r in sorted(xunta.items()):
            if r["Tipo de centro"] != "CRA":
                continue
            raw, st, _ = req(f"{EDU}/CargarLugaresDocencia.do?codigo={cod}")
            n = len(re.findall(r"Ver xeolocalizaci", raw.decode("utf-8", "replace")))
            cra.append({"codigo": cod, "nome": r["Nome"], "concello": r["Concello"], "lugares_docencia": n})
        with (saida / "cra_lugares_docencia.csv").open("w", encoding="utf-8", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=["codigo", "nome", "concello", "lugares_docencia"])
            w.writeheader()
            w.writerows(cra)
        resumo["cra"] = {"cra": len(cra), "lugares_docencia": sum(c["lugares_docencia"] for c in cra)}

    rex = {"descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "user_agent": UA, "resumo": resumo, "peticions": LOG}
    (saida / "rexistro.json").write_text(json.dumps(rex, ensure_ascii=False, indent=2) + "\n",
                                         encoding="utf-8")
    print(json.dumps(resumo, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
