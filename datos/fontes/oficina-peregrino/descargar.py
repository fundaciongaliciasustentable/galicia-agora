#!/usr/bin/env python3
"""Phase 0 check for Oficina del Peregrino (Santiago de Compostela) statistics.

There is nothing we may reuse: the statistics are a Power BI «publish to web»
report embedded in oficinadelperegrino.com, with no file download and a legal
notice that forbids reproduction without authorisation. This script only
records the check: status codes, the Power BI iframe found on the statistics
page, robots.txt, and whether the legal notice keeps the prohibition clause.
It does NOT query the Power BI data API.

Usage:
  python3 -I descargar.py [--saida mostra]

Stdlib only. Pauses >= 1.5 s between requests. Writes <saida>/rexistro.json.
"""

import argparse
import json
import re
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

UA = ("MapasGaliciaSustentable/0.1 (+https://mapas.galiciasustentable.org; "
      "galiciasustentable@galiciasustentable.org)")
BASE = "https://oficinadelperegrino.com"
PAGES = ["/robots.txt", "/estadisticas2/", "/estadisticas-nueva/", "/aviso-legal/"]
PAUSE = 1.5


def get(url):
    r = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            return resp.read(), resp.status, resp.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        return b"", e.code, ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    a = ap.parse_args()
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    log, found = [], {}
    for p in PAGES:
        url = BASE + p
        body, st, ct = get(url)
        text = body.decode("utf-8", "replace")
        entry = {"url": url, "status": st, "content_type": ct, "bytes": len(body),
                 "utc": datetime.now(timezone.utc).isoformat(timespec="seconds")}
        if p.startswith("/estadisticas"):
            m = re.search(r'<iframe[^>]+src="(https://app\.powerbi\.com/view\?r=[^"]+)"', text)
            entry["iframe_powerbi"] = m.group(1) if m else None
            entry["ligazons_descarga"] = sorted(set(re.findall(r'href="([^"]+\.(?:csv|xlsx?|json|zip))"', text, re.I)))
            if m:
                found["powerbi"] = m.group(1)
        if p == "/robots.txt":
            entry["contido"] = text.strip()
        if p == "/aviso-legal/":
            entry["titular"] = "SAMI CATEDRAL DE SANTIAGO DE COMPOSTELA" if "SAMI CATEDRAL" in text else None
            entry["clausula_prohibicion_presente"] = "quedando expresamente prohibidas su reproducción" in text
            entry["menciona_reutilizacion_ou_licenza"] = bool(re.search(r"reutiliza|creative commons|licencia de uso", text, re.I))
        log.append(entry)
        time.sleep(PAUSE)
    rex = {"descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "user_agent": UA,
           "conclusion": "Sen descarga nin licenza de reutilización; só visor Power BI. Pedir permiso.",
           "powerbi": found.get("powerbi"), "peticions": log}
    (saida / "rexistro.json").write_text(json.dumps(rex, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(rex, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
