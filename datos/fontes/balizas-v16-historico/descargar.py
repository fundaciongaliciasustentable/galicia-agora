#!/usr/bin/env python3
"""Phase 0 sample for «Uso das balizas V16 desde que temos datos» (DGT, NAP DATEX II v3.7).

The DGT feed only carries the beacons active now. This script measures what history
exists:
  1. our own archive: every snapshot of the trafico-balizas-v16 layer kept in the repo's
     `data` branch (git), aggregated per snapshot (count, province, road class, minutes
     since activation). No coordinates, road, km point or id are written;
  2. one live call to the DATEX II feed: active V16 in Spain and in Galicia now (counts
     only; the V16_ reference is read to filter and then dropped);
  3. the NAP catalogue (37 datasets) and its search for «histórico»;
  4. the licence line of the NAP dataset page.

Usage:
  python3 -I descargar.py [--saida mostra] [--repo ../../..]

Stdlib only. Pauses >= 1.5 s between requests. Log in <saida>/rexistro.json.
"""

import argparse
import csv
import gzip
import html
import json
import re
import statistics
import subprocess
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

UA = ("GaliciaAgora/0.1 (+https://github.com/fundaciongaliciasustentable/galicia-agora; "
      "galiciasustentable@galiciasustentable.org)")
FEED = "https://nap.dgt.es/datex2/v3/dgt/SituationPublication/datex2_v37.xml"
NAP = "https://nap.dgt.es/es/dataset"
DATASET = "https://nap.dgt.es/es/dataset/incidencias-dgt-datex2-v3-7"
PAUSE = 1.5
LOG = []
NS = {"s": "http://levelC/schema/3/situation", "c": "http://levelC/schema/3/common",
      "l": "http://levelC/schema/3/locationReferencing",
      "e": "http://levelC/schema/3/locationReferencingSpanishExtension"}


def req(url):
    r = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            body, st, h = resp.read(), resp.status, dict(resp.headers)
    except urllib.error.HTTPError as e:
        body, st, h = e.read(), e.code, dict(e.headers)
    wire = len(body)
    if h.get("Content-Encoding") == "gzip":
        body = gzip.decompress(body)
    LOG.append({"url": url, "status": st, "bytes_rede": wire, "bytes": len(body),
                "utc": datetime.now(timezone.utc).isoformat(timespec="seconds")})
    time.sleep(PAUSE)
    return body, st


def road_class(r):
    r = (r or "").upper()
    if r.startswith("AP-"):
        return "autopista de peaxe"
    if re.match(r"^A-\d", r):
        return "autovía estatal"
    if r.startswith("N-"):
        return "nacional"
    if r.startswith(("AG-", "CG-", "VG-", "EP-", "AC-", "LU-", "OU-", "PO-")):
        return "autonómica"
    if r.startswith(("DP-", "CP-")):
        return "provincial"
    return "outra"


def data_branch(repo):
    def git(*a):
        return subprocess.run(["git", "-C", str(repo), *a], capture_output=True, text=True).stdout
    snaps, keys = [], set()
    for line in git("log", "origin/data", "--format=%H", "--", "trafico-balizas-v16/meta.json").split("\n"):
        if not line:
            continue
        try:
            m = json.loads(git("show", f"{line}:trafico-balizas-v16/meta.json"))
            fc = json.loads(git("show", f"{line}:trafico-balizas-v16/data.geojson"))
        except json.JSONDecodeError:
            continue
        t = datetime.fromisoformat(m["fetched_at"].replace("Z", "+00:00"))
        ages, prov, cls = [], Counter(), Counter()
        for f in fc["features"]:
            p = f["properties"]
            prov[p.get("provincia") or "?"] += 1
            cls[road_class(p.get("estrada"))] += 1
            if p.get("desde"):
                ages.append((t - datetime.fromisoformat(p["desde"].replace("Z", "+00:00"))).total_seconds() / 60)
                # Activation key, kept in memory only to count distinct activations.
                keys.add((p["desde"], p.get("estrada"), p.get("pk")))
        snaps.append({"fetched_utc": m["fetched_at"], "status": m.get("status"),
                      "activas": len(fc["features"]),
                      "a_coruna": prov.get("A Coruña", 0), "lugo": prov.get("Lugo", 0),
                      "ourense": prov.get("Ourense", 0), "pontevedra": prov.get("Pontevedra", 0),
                      **{f"vias_{k.replace(' ', '_')}": v for k, v in cls.items()},
                      "minutos_activa_mediana": round(statistics.median(ages)) if ages else None})
    snaps.sort(key=lambda s: s["fetched_utc"])
    return snaps, len(keys)


def live():
    body, st = req(FEED)
    root = ET.fromstring(body)
    pub = root.find("c:publicationTime", NS)
    spain, gal, ages = 0, 0, []
    now = datetime.now(timezone.utc)
    for rec in root.iter(f"{{{NS['s']}}}situationRecord"):
        ref = rec.find("s:situationRecordCreationReference", NS)
        if ref is None or not (ref.text or "").startswith("V16_"):
            continue
        spain += 1
        ca = rec.find(".//e:autonomousCommunity", NS)
        if ca is not None and ca.text == "Galicia":
            gal += 1
        s = rec.find(".//c:overallStartTime", NS)
        if s is not None:
            ages.append((now - datetime.fromisoformat(s.text)).total_seconds() / 60)
    return {"status": st, "publicationTime": pub.text if pub is not None else None,
            "v16_espana": spain, "v16_galicia": gal,
            "minutos_activa_mediana_espana": round(statistics.median(ages)) if ages else None}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    ap.add_argument("--repo", default=str(Path(__file__).resolve().parents[3]))
    a = ap.parse_args()
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)

    snaps, activations = data_branch(a.repo)
    cols = ["fetched_utc", "status", "activas", "a_coruna", "lugo", "ourense", "pontevedra"]
    extra = sorted({k for s in snaps for k in s if k.startswith("vias_")}) + ["minutos_activa_mediana"]
    with (saida / "instantaneas_rama_data.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols + extra, restval=0)
        w.writeheader()
        w.writerows(snaps)

    times = [datetime.fromisoformat(s["fetched_utc"].replace("Z", "+00:00")) for s in snaps]
    gaps = [(b - x).total_seconds() / 3600 for x, b in zip(times, times[1:])]
    hours = Counter(t.hour for t in times)
    vivo = live()

    cat = []
    for page in (1, 2):
        body, _ = req(f"{NAP}?page={page}")
        cat += re.findall(r'href="/es/dataset/([A-Za-z0-9_-]+)"', body.decode("utf-8", "replace"))
    cat = sorted(set(cat))
    body, _ = req(f"{NAP}?q=hist%C3%B3rico")
    hist = sorted(set(re.findall(r'href="/es/dataset/([A-Za-z0-9_-]+)"', body.decode("utf-8", "replace"))))
    body, _ = req(DATASET)
    t = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", body.decode("utf-8", "replace"))))
    lic = re.search(r"Licencia[^A-Za-z]{0,20}(Creative Commons Attribution(?: Share-Alike)?)", t)

    resumo = {
        "instantaneas": len(snaps),
        "primeira": snaps[0]["fetched_utc"] if snaps else None,
        "ultima": snaps[-1]["fetched_utc"] if snaps else None,
        "oco_horas_mediana": round(statistics.median(gaps), 1) if gaps else None,
        "oco_horas_max": round(max(gaps), 1) if gaps else None,
        "instantaneas_por_hora_utc": dict(sorted(hours.items())),
        "observacions_baliza": sum(s["activas"] for s in snaps),
        "activacions_distintas_aprox": activations,
        "instantaneas_sen_balizas": sum(1 for s in snaps if s["activas"] == 0),
        "activas_max": max((s["activas"] for s in snaps), default=None),
        "activas_media": round(statistics.mean(s["activas"] for s in snaps), 1) if snaps else None,
        "vivo": vivo,
        "nap_conxuntos": len(cat), "nap_busca_historico": hist,
        "nap_licenza": lic.group(1).strip() if lic else "non atopada",
    }
    rex = {"descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "user_agent": UA, "resumo": resumo, "nap_lista": cat, "peticions": LOG}
    (saida / "rexistro.json").write_text(json.dumps(rex, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(resumo, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
