#!/usr/bin/env python3
"""Phase 0 sample for «Os ríos crecen» (river flow and level, MeteoGalicia / Augas de Galicia).

Sources checked:
  1. Our own archive: every snapshot of the caudais-rios layer kept in the repo's `data`
     branch (git). Flow and level per station, one reading per CI run.
  2. MeteoGalicia datos10min.action (documented in JSON_Aforos_10min_es.pdf): 10-minute
     history of the last 30 days, needs the personal key METEOGALICIA_AFOROS_KEY. Without
     the key the script only records the error answer. With the key (environment variable)
     it downloads 96 h for a few stations around a chosen episode. The key is never
     written to disk or printed.
  3. MeteoGalicia daily rain of every station for the last 12 months (open service), to
     pick a storm episode.
  4. Anuario de aforos (CEDEX, ROEA): daily flow per station for Galicia-Costa (Augas de
     Galicia) and Miño-Sil, last hydrological year published 2021-22. Coverage only; the
     sample keeps Galicia-Costa 2021-22.
  5. Licence texts: MITECO anuario page and CEDEX legal notice.

Usage:
  python3 -I descargar.py [--episodio 2026-10-05] [--saida mostra] [--repo ../../..]

Stdlib only. Pauses >= 1.5 s between requests. Log in <saida>/rexistro.json.
"""

import argparse
import csv
import html
import io
import json
import os
import re
import ssl
import statistics
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

UA = ("GaliciaAgora/0.1 (+https://github.com/fundaciongaliciasustentable/galicia-agora; "
      "galiciasustentable@galiciasustentable.org)")
MG = "https://servizos.meteogalicia.gal"
D10 = MG + "/mgafos/json/datos10min.action"
DIARIO = MG + "/mgrss/observacion/datosDiariosEstacionsMeteo.action"
CEDEX = "https://ceh.cedex.es/anuarioaforos/anuario-2021-2022/"
CEDEX_LEGAL = "https://ceh.cedex.es/web/aviso_legal.htm"
MITECO = "https://www.miteco.gob.es/es/cartografia-y-sig/ide/descargas/agua/anuario-de-aforos.html"
KEY_ENV = "METEOGALICIA_AFOROS_KEY"
PAUSE = 1.5
LOG = []
KEY = os.environ.get(KEY_ENV, "").strip()


def redact(s):
    if KEY:
        s = s.replace(KEY, f"[{KEY_ENV}]").replace(urllib.parse.quote(KEY), f"[{KEY_ENV}]")
    return s


def req(url, tries=3):
    r = urllib.request.Request(url, headers={"User-Agent": UA})
    # ceh.cedex.es resets the handshake under OpenSSL 3 default security level 2
    # (checked 2026-11-01); level 1 works. Only for that host.
    ctx = None
    if urllib.parse.urlparse(url).hostname == "ceh.cedex.es":
        ctx = ssl.create_default_context()
        ctx.set_ciphers("DEFAULT:@SECLEVEL=1")
    for n in range(tries):
        try:
            with urllib.request.urlopen(r, timeout=300, context=ctx) as resp:
                body, st, h = resp.read(), resp.status, dict(resp.headers)
            break
        except urllib.error.HTTPError as e:
            body, st, h = e.read(), e.code, dict(e.headers)
            break
        except (urllib.error.URLError, ConnectionError, TimeoutError) as e:
            body, st, h = b"", f"erro: {redact(str(e))}", {}
            time.sleep(15 * (n + 1))
    LOG.append({"url": redact(url), "status": st, "bytes": len(body),
                "last_modified": h.get("Last-Modified"),
                "utc": datetime.now(timezone.utc).isoformat(timespec="seconds")})
    time.sleep(PAUSE)
    return body, st


def text(page):
    t = html.unescape(re.sub(r"<[^>]+>", " ", page))
    return re.sub(r"\s+", " ", t)


def data_branch(repo):
    def git(*a):
        return subprocess.run(["git", "-C", str(repo), *a], capture_output=True, text=True).stdout
    rows, stations = [], {}
    for line in git("log", "origin/data", "--format=%H %cI", "--", "caudais-rios/data.geojson").split("\n"):
        if not line:
            continue
        h, t = line.split()
        try:
            fc = json.loads(git("show", f"{h}:caudais-rios/data.geojson"))
        except json.JSONDecodeError:
            continue
        for f in fc["features"]:
            p = f["properties"]
            stations[p["id"]] = (p["nome"], p.get("concello"), p.get("provincia"), *f["geometry"]["coordinates"])
            rows.append((t, p["id"], p["data_medida"], p.get("caudal_m3s"), p.get("nivel_m")))
    return sorted(set(rows)), stations


def rain_year(fin):
    """Galicia mean daily rain (PP_SUM_1.5m) for 12 months, one request per month."""
    days = {}
    m0 = date(fin.year - 1, fin.month, 1) + timedelta(days=32)
    m0 = m0.replace(day=1)
    while m0 <= fin:
        m1 = min((m0 + timedelta(days=32)).replace(day=1) - timedelta(days=1), fin)
        q = urllib.parse.urlencode({"dataIni": m0.isoformat(), "dataFin": m1.isoformat(),
                                    "idParam": "PP_SUM_1.5m"})
        body, st = req(f"{DIARIO}?{q}")
        if st == 200:
            for d in json.loads(body).get("listDatosDiarios", []):
                v = [m["valor"] for e in d["listaEstacions"] for m in e["listaMedidas"]
                     if m.get("valor") is not None and m["valor"] >= 0 and m.get("lnCodigoValidacion") != 9]
                if v:
                    days[d["data"][:10]] = (round(statistics.mean(v), 1), max(v), len(v))
        m0 = m1 + timedelta(days=1)
    return days


def cedex(conca):
    body, st = req(CEDEX + urllib.parse.quote(f"{conca}/afliq.csv"))
    if st != 200:
        return None, []
    rows = list(csv.reader(io.StringIO(body.decode("latin-1")), delimiter=";"))[1:]
    return len(body), rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--episodio", default="2026-10-05", help="first day of the 96 h window (needs the key)")
    ap.add_argument("--estacions", default="", help="comma-separated idEstacion for the 96 h window")
    ap.add_argument("--fin", default="2026-10-31")
    ap.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    ap.add_argument("--repo", default=str(Path(__file__).resolve().parents[3]))
    a = ap.parse_args()
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    resumo = {}

    # 1. data branch
    rows, stations = data_branch(a.repo)
    with (saida / "rama_data_caudais.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["commit_utc", "id", "data_medida", "caudal_m3s", "nivel_m"])
        w.writerows(rows)
    with (saida / "estacions_meteogalicia.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["id", "nome", "concello", "provincia", "lon", "lat"])
        for k in sorted(stations):
            w.writerow([k, *stations[k]])
    snaps = sorted({r[0] for r in rows})
    gaps = [(datetime.fromisoformat(b) - datetime.fromisoformat(x)).total_seconds() / 3600
            for x, b in zip(snaps, snaps[1:])]
    by_st = defaultdict(list)
    for r in rows:
        if r[3] is not None:
            by_st[r[1]].append(r[3])
    rise = sorted(((max(v) / min(v), k, min(v), max(v)) for k, v in by_st.items() if min(v) > 0.05), reverse=True)[:5]
    resumo["rama_data"] = {
        "instantaneas": len(snaps), "primeira": snaps[0] if snaps else None, "ultima": snaps[-1] if snaps else None,
        "estacions": len(stations), "lecturas": len(rows),
        "oco_horas_mediana": round(statistics.median(gaps), 1) if gaps else None,
        "oco_horas_max": round(max(gaps), 1) if gaps else None,
        "maior_subida_max_entre_min": [(stations[k][0], round(q, 2), mn, mx) for q, k, mn, mx in rise],
    }

    # 2. 10-minute history (needs the key)
    if KEY:
        ini = date.fromisoformat(a.episodio)
        fin = ini + timedelta(days=4)
        out = []
        for sid in [s for s in a.estacions.split(",") if s]:
            q = urllib.parse.urlencode({"cod": KEY, "idEstacion": sid,
                                        "dataIni": f"{ini:%d/%m/%Y} 00:00", "dataFin": f"{fin:%d/%m/%Y} 00:00"})
            body, st = req(f"{D10}?{q}")
            if st == 200:
                for t in json.loads(body).get("list10Min", []):
                    for e in t.get("listaEstacions", []):
                        for m in e.get("listaMedidas", []):
                            out.append((t["instanteLecturaUTC"], e["idEstacion"], m["codParametro"], m["valor"], m.get("codigoValidacion")))
        with (saida / f"datos10min_{ini}.csv").open("w", encoding="utf-8", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["instante_utc", "id", "parametro", "valor", "validacion"])
            w.writerows(out)
        resumo["datos10min"] = {"lecturas": len(out)}
    else:
        body, st = req(f"{D10}?" + urllib.parse.urlencode({"dataIni": "05/10/2026 00:00", "dataFin": "05/10/2026 01:00"}))
        resumo["datos10min"] = {"sen_chave_status": st, "sen_chave_corpo": text(body.decode("utf-8", "replace"))[:200]}

    # 3. Rain, 12 months, to pick an episode
    fin = date.fromisoformat(a.fin)
    rain = rain_year(fin)
    with (saida / "chuvia_media_galicia_diaria.csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["data", "chuvia_media_mm", "chuvia_max_mm", "estacions"])
        for k in sorted(rain):
            w.writerow([k, *rain[k]])
    three = []
    ks = sorted(rain)
    for i in range(len(ks) - 2):
        three.append((round(sum(rain[k][0] for k in ks[i:i + 3]), 1), ks[i]))
    three.sort(reverse=True)
    picked = []
    for s, k in three:
        if all(abs((date.fromisoformat(k) - date.fromisoformat(p)).days) > 5 for _, p in picked):
            picked.append((s, k))
        if len(picked) == 8:
            break
    resumo["chuvia"] = {"dias": len(rain), "episodios_3_dias_mm_media": [(k, s) for s, k in picked]}

    # 4. Anuario de aforos (CEDEX): coverage and Galicia-Costa 2021-22 sample
    an = {}
    for conca in ("GALICIA COSTA", "MIÑO-SIL"):
        size, rr = cedex(conca)
        st_dates = defaultdict(list)
        for x in rr:
            if len(x) >= 4 and x[3]:
                st_dates[x[0]].append(x[1][-4:] + "-" + x[1][3:5] + "-" + x[1][:2])
        an[conca] = {"bytes": size, "filas": len(rr), "estacions_con_caudal": len(st_dates),
                     "primeira_data": min((min(v) for v in st_dates.values()), default=None),
                     "ultima_data": max((max(v) for v in st_dates.values()), default=None),
                     "estacions_ata_2022": sum(1 for v in st_dates.values() if max(v) >= "2022-09-30")}
        if conca == "GALICIA COSTA":
            keep = [(x[0], x[1][-4:] + "-" + x[1][3:5] + "-" + x[1][:2], x[2], x[3]) for x in rr
                    if len(x) >= 4 and x[3] and "2021-10-01" <= x[1][-4:] + "-" + x[1][3:5] + "-" + x[1][:2] <= "2022-09-30"]
            with (saida / "anuario_galicia_costa_2021-22.csv").open("w", encoding="utf-8", newline="") as fh:
                w = csv.writer(fh)
                w.writerow(["indroea", "data", "altura_m", "caudal_m3s"])
                w.writerows(sorted(keep))
            body, st = req(CEDEX + urllib.parse.quote(f"{conca}/estaf.csv"))
            (saida / "anuario_galicia_costa_estaf.csv").write_bytes(body.decode("latin-1").encode("utf-8"))
            byday = defaultdict(float)
            for x in keep:
                byday[x[1]] += float(x[3])
            an[conca]["dias_maior_caudal_suma_2021-22"] = sorted(byday.items(), key=lambda kv: -kv[1])[:5]
    resumo["anuario"] = an

    # 5. Licence texts
    body, st = req(MITECO)
    t = text(body.decode("utf-8", "replace"))
    m = re.search(r"Esta información se puede usar de modo libre y gratuito[^»]*»", t)
    resumo["licenza_miteco"] = m.group(0) if m else "non atopada"
    body, st = req(CEDEX_LEGAL)
    try:
        t = text(body.decode("utf-8"))
    except UnicodeDecodeError:
        t = text(body.decode("latin-1"))
    m = re.search(r"Todos los contenidos del sitio web[^.]*\.", t)
    resumo["aviso_legal_cedex"] = m.group(0) if m else "non atopado"

    rex = {"descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "user_agent": UA, "chave_usada": bool(KEY), "resumo": resumo, "peticions": LOG}
    (saida / "rexistro.json").write_text(json.dumps(rex, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(resumo, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
