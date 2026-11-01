#!/usr/bin/env python3
"""Phase 0 sample for MeteoGalicia station observations.

Hourly: datosHorariosEstacions.action needs one station per request and at
most 12 hours, so a full day is 2 requests per station (about 310 in all).
Daily: datosDiariosEstacionsMeteo.action returns every station in one call
for a date range, filtered by idParam.

Usage:
  python3 -I descargar.py [--dia 2025-05-21] [--diario 2025-05-01:2025-05-31]
         [--params-diario TA_AVG_1.5m,PP_SUM_1.5m] [--pausa 0.5] [--saida mostra]

Times in the hourly service are UTC (dataIni is read as UTC, instants are
instanteLecturaUTC). Values of -9999 mean «no data»; lnCodigoValidacion is
kept so the next phase can drop unvalidated readings.

Stdlib only. Each run is logged in <saida>/rexistro.json.
"""

import argparse
import csv
import json
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

BASE = "https://servizos.meteogalicia.gal/mgrss/observacion"
UA = "mapas-galicia-sustentable-fase0 (galiciasustentable@galiciasustentable.org)"


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    if raw.lstrip().startswith(b"<"):
        raise ValueError(f"HTML error page from {url}")
    return json.loads(raw.decode("utf-8")), len(raw)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dia", default="2025-05-21")
    p.add_argument("--diario", default="2025-05-01:2025-05-31")
    p.add_argument("--params-diario", default="TA_AVG_1.5m,TA_MAX_1.5m,TA_MIN_1.5m,PP_SUM_1.5m")
    p.add_argument("--pausa", type=float, default=0.5)
    p.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    a = p.parse_args()
    saida = Path(a.saida)
    saida.mkdir(parents=True, exist_ok=True)
    now = lambda: datetime.now(timezone.utc).isoformat(timespec="seconds")
    log = []

    stations, _ = get_json(f"{BASE}/listaEstacionsMeteo.action")
    stations = stations["listaEstacionsMeteo"]
    with (saida / "estacions.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["idEstacion", "estacion", "concello", "provincia", "lat", "lon", "altitude"])
        for s in stations:
            w.writerow([s["idEstacion"], s["estacion"], s["concello"], s["provincia"], s["lat"], s["lon"], s["altitude"]])
    log.append({"url": f"{BASE}/listaEstacionsMeteo.action", "descargado_utc": now(), "estacions": len(stations)})

    # Hourly: one reference day, every station, two 12-hour windows.
    d = date.fromisoformat(a.dia)
    out = saida / f"horario_{a.dia}.csv"
    n_req = n_err = n_bytes = n_rows = 0
    with out.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["instante_utc", "idEstacion", "parametro", "valor", "validacion"])
        for s in stations:
            for start in ("00:00", "12:00"):
                q = urllib.parse.urlencode({"dataIni": f"{d:%d/%m/%Y} {start}", "numHoras": 12, "idEst": s["idEstacion"]})
                n_req += 1
                try:
                    data, size = get_json(f"{BASE}/datosHorariosEstacions.action?{q}")
                except Exception as e:  # noqa: BLE001 - log and continue with the next station
                    n_err += 1
                    print("erro", s["idEstacion"], start, e)
                    continue
                n_bytes += size
                for h in data.get("listHorarios", []):
                    for inst in h["listaInstantes"]:
                        for m in inst["listaMedidas"]:
                            w.writerow([inst["instanteLecturaUTC"], h["idEstacion"], m["codigoParametro"], m["valor"], m["lnCodigoValidacion"]])
                            n_rows += 1
                time.sleep(a.pausa)
    log.append({"url": f"{BASE}/datosHorariosEstacions.action?dataIni=DD/MM/YYYY%20HH:MM&numHoras=12&idEst=ID",
                "descargado_utc": now(), "dia": a.dia, "peticions": n_req, "erros": n_err,
                "bytes_json": n_bytes, "filas": n_rows, "saida": out.name})

    # Daily: one call for the whole range and selected parameters.
    ini, fin = a.diario.split(":")
    q = urllib.parse.urlencode({"dataIni": ini, "dataFin": fin, "idParam": a.params_diario})
    url = f"{BASE}/datosDiariosEstacionsMeteo.action?{q}"
    data, size = get_json(url)
    out = saida / f"diario_{ini}_{fin}.csv"
    n_rows = 0
    with out.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["data", "idEstacion", "parametro", "valor", "validacion"])
        for day in data["listDatosDiarios"]:
            for s in day["listaEstacions"]:
                for m in s["listaMedidas"]:
                    w.writerow([day["data"][:10], s["idEstacion"], m["codigoParametro"], m["valor"], m["lnCodigoValidacion"]])
                    n_rows += 1
    log.append({"url": url, "descargado_utc": now(), "bytes_json": size, "filas": n_rows, "saida": out.name})

    rex = saida / "rexistro.json"
    prev = json.loads(rex.read_text()) if rex.exists() else []
    rex.write_text(json.dumps(prev + log, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(log, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
