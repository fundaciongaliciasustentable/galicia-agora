#!/usr/bin/env python3
"""Phase 0 sample for «Lóstregos do último ano» (MeteoGalicia lightning network).

jsonRaios.action (documented in JSON_RaiosHistorico_gl.pdf) returns, for each day of a
window of at most 7 days, every strike of the network (UTC time, lat, lon, peakCurrent)
plus numRaiosGalicia (strikes over Galician land) and numRaiosTotal.

This script:
  1. walks the last 12 months in 7-day windows (53 requests), keeps the strikes inside
     the Galicia bbox of pipeline/lib/adapter.ts padded by 0.1 deg (same rule as the
     raios layer) and writes them to mostra/ with a daily count table;
  2. probes a summer week of earlier years to find where the archive starts;
  3. counts the snapshots of the raios layer kept in the repo's `data` branch (git);
  4. calls the AEMET OpenData lightning endpoint without a key to record what it asks.

Usage:
  python3 -I descargar.py [--fin 2026-10-31] [--dias 365] [--saida mostra] [--repo ../../..]

Stdlib only. Pauses >= 1.5 s between requests. Log in <saida>/rexistro.json.
"""

import argparse
import csv
import json
import subprocess
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

UA = ("GaliciaAgora/0.1 (+https://github.com/fundaciongaliciasustentable/galicia-agora; "
      "galiciasustentable@galiciasustentable.org)")
BASE = "https://servizos.meteogalicia.gal/mgrss/observacion/jsonRaios.action"
DOC = "https://meteo-estaticos.xunta.gal/datosred/infoweb/meteo/docs/rss/JSON_RaiosHistorico_gl.pdf"
AEMET = "https://opendata.aemet.es/opendata/api/red/rayos/mapa"
BBOX = (-9.35 - 0.1, 41.8 - 0.1, -6.7 + 0.1, 43.8 + 0.1)  # W, S, E, N
PAUSE = 1.5
LOG = []


def req(url, method="GET"):
    r = urllib.request.Request(url, headers={"User-Agent": UA}, method=method)
    try:
        with urllib.request.urlopen(r, timeout=120) as resp:
            body, st, h = resp.read(), resp.status, dict(resp.headers)
    except urllib.error.HTTPError as e:
        body, st, h = e.read(), e.code, dict(e.headers)
    LOG.append({"url": url, "metodo": method, "status": st, "bytes": len(body),
                "utc": datetime.now(timezone.utc).isoformat(timespec="seconds")})
    time.sleep(PAUSE)
    return body, st, h


def window(d0, d1):
    # dataFin must be later than dataIni (documentation); a single day goes with "data".
    q = f"data={d0:%d/%m/%Y}" if d0 == d1 else f"dataIni={d0:%d/%m/%Y}&dataFin={d1:%d/%m/%Y}"
    body, st, _ = req(f"{BASE}?{q}")
    return json.loads(body) if st == 200 else None


def inside(lon, lat):
    return BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]


def data_branch(repo):
    """Snapshots of raios/meta.json in origin/data: time and feature_count."""
    def git(*a):
        return subprocess.run(["git", "-C", str(repo), *a], capture_output=True, text=True).stdout
    out = []
    for line in git("log", "origin/data", "--format=%H %cI", "--", "raios/meta.json").split("\n"):
        if not line:
            continue
        h, t = line.split()
        try:
            m = json.loads(git("show", f"{h}:raios/meta.json"))
        except json.JSONDecodeError:
            continue
        out.append({"commit": h[:7], "fetched_at": m.get("fetched_at"),
                    "feature_count": m.get("feature_count"), "status": m.get("status")})
    return sorted(out, key=lambda x: x["fetched_at"] or "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fin", default="2026-10-31")
    ap.add_argument("--dias", type=int, default=365)
    ap.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    ap.add_argument("--repo", default=str(Path(__file__).resolve().parents[3]))
    a = ap.parse_args()
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    fin = date.fromisoformat(a.fin)
    ini = fin - timedelta(days=a.dias - 1)

    # 1. Last 12 months, 7-day windows
    strikes, days = [], {}
    d = ini
    while d <= fin:
        e = min(d + timedelta(days=6), fin)
        js = window(d, e)
        for day in (js or {}).get("raios", []):
            k = day["data"][:10]
            n_bbox = 0
            for r in day.get("listaRaios", []):
                if inside(r["lon"], r["lat"]):
                    n_bbox += 1
                    strikes.append((r["fecha"], r["lat"], r["lon"], r.get("peakCurrent")))
            days[k] = {"data": k, "num_raios_galicia": day.get("numRaiosGalicia"),
                       "num_raios_total": day.get("numRaiosTotal"), "raios_caixa_galicia": n_bbox}
        d = e + timedelta(days=1)
    strikes = sorted(set(strikes))
    with (saida / f"raios_galicia_{ini}_{fin}.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["data_utc", "lat", "lon", "intensidade_ka"])
        w.writerows(strikes)
    with (saida / f"raios_por_dia_{ini}_{fin}.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["data", "num_raios_galicia", "num_raios_total", "raios_caixa_galicia"])
        w.writeheader()
        for k in sorted(days):
            w.writerow(days[k])

    # 2. Where does the archive start? One summer week per year.
    probas = {}
    for y in range(2005, 2013):
        js = window(date(y, 7, 1), date(y, 7, 7))
        probas[str(y)] = sum(x.get("numRaiosTotal") or 0 for x in (js or {}).get("raios", []))

    # 3. Our own archive: the data branch
    snaps = data_branch(a.repo)

    # 4. AEMET without key
    body, st, _ = req(AEMET)

    mes = Counter(s[0][:7] for s in strikes)
    top = sorted(days.values(), key=lambda x: -x["raios_caixa_galicia"])[:10]
    resumo = {
        "periodo": f"{ini}–{fin}", "dias": len(days),
        "raios_caixa_galicia": len(strikes),
        "raios_terra_galicia_suma_numRaiosGalicia": sum(x["num_raios_galicia"] or 0 for x in days.values()),
        "dias_con_raios_caixa": sum(1 for x in days.values() if x["raios_caixa_galicia"]),
        "raios_por_mes": dict(sorted(mes.items())),
        "dez_dias_con_mais_raios": [(x["data"], x["raios_caixa_galicia"]) for x in top],
        "positivos": sum(1 for s in strikes if (s[3] or 0) > 0),
        "negativos": sum(1 for s in strikes if (s[3] or 0) < 0),
        "proba_primeira_semana_xullo_numRaiosTotal": probas,
        "rama_data_instantaneas_raios": len(snaps),
        "rama_data_primeira": snaps[0]["fetched_at"] if snaps else None,
        "rama_data_ultima": snaps[-1]["fetched_at"] if snaps else None,
        "rama_data_con_raios": sum(1 for s in snaps if s["feature_count"]),
        "aemet_sen_chave": {"status": st, "corpo": body[:200].decode("utf-8", "replace")},
        "documentacion": DOC,
    }
    rex = {"descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "user_agent": UA, "resumo": resumo, "peticions": LOG}
    (saida / "rexistro.json").write_text(json.dumps(rex, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(resumo, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
