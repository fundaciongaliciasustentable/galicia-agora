#!/usr/bin/env python3
"""Phase 0 sample for Intecmar «estado das zonas de produción».

Downloads:
  1. The two JSON resources of the Intecmar REST API (current state only):
     EstadoZonasBiotoxinas and ClasificacionMicrobioloxicaZonas.
  2. The «Días de peche» HTML tables (raft cultures and infaunal molluscs) for
     the year the page shows by default (the current one), converted to CSV.
     Other years need an ASP.NET postback: not done here.
  3. The list of historical «Informe de estado» PDFs (last 6 months for rafts,
     last year for infaunal) and the latest PDF of each list, to document
     their format (raster image, no text layer).

Usage:
  python3 -I descargar.py [--saida mostra]

Stdlib only. Pauses >= 1 s between requests. Log in <saida>/rexistro.json.
"""

import argparse
import csv
import html
import json
import re
import time
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

UA = ("GaliciaAgora/0.1 (+https://github.com/fundaciongaliciasustentable/galicia-agora; "
      "galiciasustentable@galiciasustentable.org)")
BASE = "https://www.intecmar.gal"
API = BASE + "/Api/EstadoZonasProducion/"
PAUSE = 1.2

LOG = []


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body, status, ctype = r.read(), r.status, r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        body, status, ctype = b"", e.code, e.headers.get("Content-Type", "")
    LOG.append({"url": url, "status": status, "content_type": ctype, "bytes": len(body),
                "utc": datetime.now(timezone.utc).isoformat(timespec="seconds")})
    time.sleep(PAUSE)
    return body, status


class Tables(HTMLParser):
    """Collects every <tr> as a list of cell texts."""

    def __init__(self):
        super().__init__()
        self.rows, self.row, self.cell = [], None, None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = []

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None and self.row is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)


def dias_peche(page, saida, nome):
    raw, st = get(f"{BASE}/Informacion/biotoxinas/Evolucion/{page}")
    if st != 200:
        return None
    text = raw.decode("utf-8", "replace")
    m = re.search(r'<option selected="selected" value="(\d{4})"', text)
    ano = m.group(1) if m else "descoñecido"
    p = Tables()
    p.feed(text)
    head = ["Xan", "Feb", "Mar", "Abr", "Mai", "Xun", "Xull", "Ago", "Set", "Out", "Nov", "Dec", "Total"]
    out = []
    for r in p.rows:
        if len(r) == 14 and r[0] and r[1:] != head and r[0] != "Polígono":
            out.append(r)
    f = saida / f"{nome}_{ano}.csv"
    with f.open("w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["poligono_ou_zona"] + head)
        w.writerows(out)
    return {"ficheiro": f.name, "ano": ano, "filas": len(out)}


def historico(page, saida, nome):
    raw, st = get(f"{BASE}/Informacion/biotoxinas/EstadoZonas/{page}")
    text = raw.decode("utf-8", "replace")
    links = re.findall(r'href="(?:\.\./)+(PDFs/EstadoZonas/[^"]+\.PDF)"', text, re.I)
    informes = re.findall(r"Informe N[ºo]:\s*(\d+)\s*-\s*\((\d\d/\d\d/\d{4} \d\d:\d\d)\)", html.unescape(text))
    info = {"paxina": page, "informes_na_primeira_paxina": len(links),
            "ultimo": informes[0] if informes else None,
            "primeira_paxina": [{"n": n, "data": d} for n, d in informes]}
    if links:
        url = f"{BASE}/{links[0]}"
        pdf, st = get(url)
        if st == 200:
            f = saida / f"{nome}_{Path(links[0]).name}"
            f.write_bytes(pdf)
            info["pdf_descargado"] = f.name
            info["pdf_e_imaxe_raster"] = b"/Subtype /Image" in pdf and b"/Font" not in pdf
    return info


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    a = ap.parse_args()
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    resumo = {}

    for res in ("EstadoZonasBiotoxinas", "ClasificacionMicrobioloxicaZonas"):
        raw, st = get(API + res)
        if st == 200:
            d = json.loads(raw.decode("utf-8"))
            (saida / f"{res}.json").write_bytes(raw)
            lista = d.get("estadoZonas") or d.get("clasificacionZonas") or []
            cont = {}
            for z in lista:
                cont[z.get("estado")] = cont.get(z.get("estado"), 0) + 1
            resumo[res] = {"dataActualizacion": d.get("dataActualizacion"), "zonas": len(lista), "por_estado": cont}

    resumo["dias_peche_batea"] = dias_peche("CierresBatea.aspx", saida, "dias_peche_batea")
    resumo["dias_peche_infaunais"] = dias_peche("CierresInfaunais.aspx", saida, "dias_peche_infaunais")
    resumo["historico_batea"] = historico("Historico_Batea.aspx", saida, "informe_batea")
    resumo["historico_infaunais"] = historico("Historico_Infaunais.aspx", saida, "informe_infaunais")

    # Legal page and the (down) map viewer: only the status is recorded.
    get(BASE + "/Informacion/CondicionsLegais.aspx")
    get("http://sig.intecmar.gal/EstadoZonas")

    rex = {"descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "user_agent": UA, "resumo": resumo, "peticions": LOG}
    (saida / "rexistro.json").write_text(json.dumps(rex, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(resumo, ensure_ascii=False, indent=1)[:1500])


if __name__ == "__main__":
    main()
