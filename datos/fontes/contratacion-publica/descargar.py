#!/usr/bin/env python3
"""Phase 0 sample for the Plataforma de Contratación del Sector Público (PLACSP).

Three Atom feeds (CODICE XML, 500 entries max per page, chained by rel="next"):
  perfiles   sindicacion_643   bodies with their buyer profile on PLACSP (no minor contracts)
  agregadas  sindicacion_1044  regional platforms aggregated into PLACSP (Xunta de Galicia among them)
  menores    sindicacion_1143  minor contracts of buyer profiles on PLACSP

Default: the first N pages (--paxinas, default 1) of each live feed, read in
memory. With --mes AAAAMM it instead downloads the monthly zips into a temp
dir outside the repo (perfiles ≈ 300 MB per month) and deletes them after.

Only entries linked to Galicia are kept (contracting body with a Galician
postcode, NIF of a Galician public body, aggregated by the Xunta, or place of
execution in NUTS ES11). One row per contract folder (latest update wins).

Privacy: winners may be natural persons (self-employed). Winner names and
NIF are never written; only counts by where the winner's postcode is
(same province / rest of Galicia / rest of Spain / abroad / no data).
Contract titles are not written either (they can carry personal names).

Usage:
  python3 -I descargar.py [--paxinas 1] [--mes 202609] [--saida mostra]

Stdlib only. Each run is appended to <saida>/rexistro.json (one item per output file).
"""

import argparse
import csv
import io
import json
import re
import tempfile
import time
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

UA = ("GaliciaAgora/0.1 (+https://github.com/fundaciongaliciasustentable/galicia-agora; "
      "galiciasustentable@galiciasustentable.org)")
HOST = "https://contrataciondelsectorpublico.gob.es"
FEEDS = {
    "perfiles": "/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3",
    "agregadas": "/sindicacion/sindicacion_1044/PlataformasAgregadasSinMenores",
    "menores": "/sindicacion/sindicacion_1143/contratosMenoresPerfilesContratantes",
}
NS = {
    "a": "http://www.w3.org/2005/Atom",
    "cbc": "urn:dgpe:names:draft:codice:schema:xsd:CommonBasicComponents-2",
    "cac": "urn:dgpe:names:draft:codice:schema:xsd:CommonAggregateComponents-2",
    "cpe": "urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonAggregateComponents-2",
    "cbe": "urn:dgpe:names:draft:codice-place-ext:schema:xsd:CommonBasicComponents-2",
}
A = "{%s}" % NS["a"]
TOMB = "{http://purl.org/atompub/tombstones/1.0}deleted-entry"
GAL = ("15", "27", "32", "36")
NUTS_PROV = {"ES111": "15", "ES112": "27", "ES113": "32", "ES114": "36"}
NIF_PERSOA = re.compile(r"^(\d{8}[A-Z]|[XYZ]\d{7}[A-Z])$")
_last = [0.0]


def get(url):
    wait = 1.0 - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    url = url.replace("https://contrataciondelestado.es", HOST)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    r = urllib.request.urlopen(req, timeout=300)
    _last[0] = time.time()
    return r, url


def t(el, path):
    return (el.findtext(path, default="", namespaces=NS) or "").strip()


def num(s):
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_entry(el, feed):
    lcp = el.find(".//cpe:LocatedContractingParty", NS)
    if lcp is None:
        return None
    ids = [(x.get("schemeName", ""), (x.text or "").strip())
           for x in lcp.findall("cac:Party/cac:PartyIdentification/cbc:ID", NS)]
    nif = next((v for s, v in ids if s == "NIF"), "")
    dir3 = next((v for s, v in ids if s == "DIR3"), "")
    org_cp = t(lcp, "cac:Party/cac:PostalAddress/cbc:PostalZone")
    agente = t(lcp, "cac:Party/cac:AgentParty/cac:PartyName/cbc:Name")
    nuts = t(el, ".//cac:ProcurementProject/cac:RealizedLocation/cbc:CountrySubentityCode")
    org_gal = (org_cp[:2] in GAL or agente == "Xunta de Galicia"
               or (nif[:1] in "PSQ" and nif[1:3] in GAL))
    exec_gal = nuts.startswith("ES11")
    if not (org_gal or exec_gal):
        return None
    chain = []
    p = lcp.find("cpe:ParentLocatedParty", NS)
    while p is not None:
        n = t(p, "cac:PartyName/cbc:Name")
        if n:
            chain.append(n)
        p = p.find("cpe:ParentLocatedParty", NS)
    # Province of the contracting body: postcode, else DIR3 of a concello (L01+INE)
    # or diputación (L02...PP), else the NUTS3 of the place of execution.
    if org_cp[:2] in GAL:
        org_prov, prov_fonte = org_cp[:2], "cp"
    elif dir3.startswith("L01") and dir3[3:5] in GAL:
        org_prov, prov_fonte = dir3[3:5], "dir3"
    elif dir3.startswith("L02") and dir3[-2:] in GAL:
        org_prov, prov_fonte = dir3[-2:], "dir3"
    elif nuts in NUTS_PROV:
        org_prov, prov_fonte = NUTS_PROV[nuts], "nuts_execucion"
    else:
        org_prov, prov_fonte = "", ""
    w = {"n": 0, "cp": 0, "mesma_prov": 0, "resto_galicia": 0, "resto_espana": 0,
         "estranxeiro": 0, "sen_dato": 0, "persoa_fisica": 0}
    award_total = 0.0
    award_dates = []
    results = el.findall(".//cac:TenderResult", NS)
    for tr in results:
        award_total += num(t(tr, "cac:AwardedTenderedProject/cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount"))
        d = t(tr, "cbc:AwardDate")
        if d:
            award_dates.append(d)
        for wp in tr.findall("cac:WinningParty", NS):
            w["n"] += 1
            wid = t(wp, "cac:PartyIdentification/cbc:ID").upper().replace("-", "")
            if NIF_PERSOA.match(wid):
                w["persoa_fisica"] += 1
            cp = t(wp, "cac:PhysicalLocation/cac:Address/cbc:PostalZone")
            pais = t(wp, "cac:PhysicalLocation/cac:Address/cac:Country/cbc:IdentificationCode")
            if pais and pais != "ES":
                w["estranxeiro"] += 1
            elif len(cp) == 5 and cp.isdigit():
                w["cp"] += 1
                if org_prov and cp[:2] == org_prov:
                    w["mesma_prov"] += 1
                elif cp[:2] in GAL:
                    w["resto_galicia"] += 1
                else:
                    w["resto_espana"] += 1
            else:
                w["sen_dato"] += 1
    return {
        "fonte": feed,
        "expediente": t(el, ".//cbc:ContractFolderID"),
        "entrada_id": t(el, A + "id"),
        "actualizado": t(el, A + "updated"),
        "estado": t(el, ".//cbe:ContractFolderStatusCode"),
        "organo": t(lcp, "cac:Party/cac:PartyName/cbc:Name"),
        "organo_superior": chain[0] if chain else "",
        "organo_dir3": dir3,
        "organo_provincia": org_prov,
        "organo_provincia_fonte": prov_fonte,
        "plataforma_agregadora": agente,
        "organo_galego": int(org_gal),
        "execucion_nuts": nuts,
        "execucion_galicia": int(exec_gal),
        "tipo_contrato": t(el, ".//cac:ProcurementProject/cbc:TypeCode"),
        "cpv": t(el, ".//cac:ProcurementProject/cac:RequiredCommodityClassification/cbc:ItemClassificationCode"),
        "procedemento": t(el, ".//cac:TenderingProcess/cbc:ProcedureCode"),
        "orzamento_sen_ive": t(el, ".//cac:ProcurementProject/cac:BudgetAmount/cbc:TaxExclusiveAmount"),
        "resultados": len(results),
        "data_adxudicacion": min(award_dates) if award_dates else "",
        "adxudicado_sen_ive": f"{award_total:.2f}" if results else "",
        "adxudicatarias": w["n"],
        "adx_con_cp": w["cp"],
        "adx_mesma_provincia": w["mesma_prov"],
        "adx_resto_galicia": w["resto_galicia"],
        "adx_resto_espana": w["resto_espana"],
        "adx_estranxeiro": w["estranxeiro"],
        "adx_sen_localizacion": w["sen_dato"],
        "adx_nif_persoa_fisica": w["persoa_fisica"],
    }


def scan(stream, feed, rows, st):
    nxt = None
    for _ev, el in ET.iterparse(stream):
        if el.tag == A + "link" and el.get("rel") == "next":
            nxt = el.get("href")
        elif el.tag == TOMB:
            st["borradas"] += 1
        elif el.tag == A + "entry":
            st["entradas"] += 1
            r = parse_entry(el, feed)
            if r:
                st["galicia"] += 1
                k = (feed, r["entrada_id"])
                if k not in rows or rows[k]["actualizado"] < r["actualizado"]:
                    rows[k] = r
            el.clear()
    return nxt


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--paxinas", type=int, default=1, help="pages of 500 entries per live feed")
    p.add_argument("--mes", help="AAAAMM: process the monthly zips instead (large downloads)")
    p.add_argument("--fontes", nargs="+", default=list(FEEDS), choices=list(FEEDS))
    p.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    a = p.parse_args()
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    rows, log = {}, []
    for feed in a.fontes:
        st = {"entradas": 0, "galicia": 0, "borradas": 0}
        if a.mes:
            url = HOST + FEEDS[feed] + f"_{a.mes}.zip"
            with tempfile.TemporaryDirectory(prefix="placsp-") as tmp:
                zp = Path(tmp) / "f.zip"
                r, url = get(url)
                with open(zp, "wb") as f:
                    while True:
                        b = r.read(1 << 20)
                        if not b:
                            break
                        f.write(b)
                size = zp.stat().st_size
                with zipfile.ZipFile(zp) as z:
                    names = sorted(z.namelist())
                    usize = sum(z.getinfo(n).file_size for n in names)
                    for n in names:
                        with z.open(n) as s:
                            scan(s, feed, rows, st)
            log.append({"fonte": feed, "url": url, "bytes": size, "bytes_descomprimido": usize,
                        "ficheiros_atom": len(names), "last_modified": r.headers.get("Last-Modified"),
                        "descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), **st})
        else:
            url = HOST + FEEDS[feed] + ".atom"
            for _ in range(a.paxinas):
                r, url = get(url)
                data = r.read()
                nxt = scan(io.BytesIO(data), feed, rows, st)
                log.append({"fonte": feed, "url": url, "bytes": len(data),
                            "descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"), **st})
                st = {"entradas": 0, "galicia": 0, "borradas": 0}
                if not nxt:
                    break
                url = nxt
    tag = a.mes or datetime.now(timezone.utc).strftime("%Y%m%d")
    fn = saida / f"placsp_galicia_{tag}.csv"
    out = sorted(rows.values(), key=lambda r: (r["fonte"], r["actualizado"]))
    with open(fn, "w", newline="", encoding="utf-8") as f:
        if out:
            w = csv.DictWriter(f, fieldnames=list(out[0]))
            w.writeheader()
            w.writerows(out)
    resumo = {}
    for r in out:
        s = resumo.setdefault(r["fonte"], {"contratos": 0, "adxudicatarias": 0, "adx_con_cp": 0,
                                           "adx_mesma_provincia": 0, "adx_resto_galicia": 0,
                                           "adx_resto_espana": 0, "adx_estranxeiro": 0,
                                           "adx_sen_localizacion": 0, "adx_nif_persoa_fisica": 0})
        s["contratos"] += 1
        for k in list(s)[1:]:
            s[k] += r[k]
    rex = {"descargas": log, "saida": fn.name, "filas": len(out), "resumo_adxudicatarias": resumo,
           "privacidade": "sen nomes nin NIF de adxudicatarias; sen títulos de contrato"}
    rp = saida / "rexistro.json"
    prev = json.loads(rp.read_text(encoding="utf-8")) if rp.exists() else []
    prev = [x for x in (prev if isinstance(prev, list) else [prev]) if x.get("saida") != fn.name]
    rp.write_text(json.dumps(prev + [rex], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(resumo, ensure_ascii=False))


if __name__ == "__main__":
    main()
