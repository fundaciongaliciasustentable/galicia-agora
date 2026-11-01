#!/usr/bin/env python3
"""Phase 0 sample for sea level at Galician tide gauges (Copernicus Marine
In Situ TAC, product INSITU_IBI_PHYBGCWAV_DISCRETE_MYNRT_013_033).

Anonymous S3 (no account, no key) on the Copernicus Marine native store:
  index_platform.txt  every platform, last position and parameters
  index_latest.txt    daily files of the last ~30 days (1-minute data,
                      refreshed hourly)
  index_history.txt   one file per station with the whole hourly series
                      (delayed mode, closed at the end of the previous month)

What it does:
  1. Downloads the three indexes and keeps the Galician rows with SLEV
     (sea level) inside the bbox. The full indexes (16 MB) are not stored.
  2. Downloads the daily NetCDF of one day (default: yesterday UTC) for
     every Galician tide gauge that has it.
  3. With --historico, also downloads the full hourly history of one
     station (default Vigo, ~0.9 MB): the series to derive harmonic
     constants and compute astronomical tide predictions.

The NetCDF files are NetCDF4/HDF5: the Python stdlib cannot read them.
The pipeline will need h5py or netCDF4 (see README).

Usage:
  python3 -I descargar.py [--dia 2026-10-31] [--historico VigoTG] [--saida mostra]
"""

import argparse
import csv
import io
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

UA = ("MapasGaliciaSustentable/0.1 (+https://mapas.galiciasustentable.org; "
      "galiciasustentable@galiciasustentable.org)")
ROOT = "https://s3.waw3-1.cloudferro.com/mdl-native-03/native/"
DATASET = ("INSITU_IBI_PHYBGCWAV_DISCRETE_MYNRT_013_033/"
           "cmems_obs-ins_ibi_phybgcwav_mynrt_na_irr_202311")
BBOX = (-9.35, 41.8, -6.7, 43.8)  # lon_min, lat_min, lon_max, lat_max

log = []
_last = {}


def get(url):
    host = urllib.parse.urlsplit(url).netloc
    wait = 1.1 - (time.monotonic() - _last.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        body, status, hdr = r.read(), r.status, dict(r.headers)
    _last[host] = time.monotonic()
    log.append({"url": url, "status": status, "bytes": len(body),
                "last_modified": hdr.get("Last-Modified")})
    return body


def read_index(text):
    """Return (comment lines, header, rows) of a Copernicus in-situ index."""
    comments, header, rows = [], None, []
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("#"):
            comments.append(line)
            continue
        header = [h.strip() for h in comments[-1].lstrip("# ").split(",")]
        rows = list(csv.reader(lines[i:]))
        break
    return comments, header, rows


def inside(lat, lon):
    return BBOX[1] <= lat <= BBOX[3] and BBOX[0] <= lon <= BBOX[2]


def write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def main():
    ap = argparse.ArgumentParser()
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    ap.add_argument("--dia", default=yesterday)
    ap.add_argument("--historico", default="VigoTG",
                    help="platform code for the full hourly history ('' to skip)")
    ap.add_argument("--saida", default=str(Path(__file__).resolve().parent / "mostra"))
    a = ap.parse_args()
    out = Path(a.saida)
    out.mkdir(parents=True, exist_ok=True)
    started = datetime.now(timezone.utc).isoformat(timespec="seconds")
    base = ROOT + DATASET + "/"

    # 1. platforms
    c, h, rows = read_index(get(base + "index_platform.txt").decode("utf-8", "replace"))
    plat = []
    for r in rows:
        try:
            lat, lon = float(r[h.index("last_latitude_observation")]), \
                float(r[h.index("last_longitude_observation")])
        except (ValueError, IndexError):
            continue
        if inside(lat, lon) and "SLEV" in r[h.index("parameters")].split():
            plat.append(r)
    write_csv(out / "plataformas_galicia_slev.csv", h, plat)
    codes = {r[0] for r in plat}
    platform_update = next((x for x in c if "Date of update" in x), "")

    def keep(rows, h):
        fn = h.index("file_name")
        return [r for r in rows if any(f"_TG_{code}" in r[fn] or f"_{code}_" in r[fn]
                                       or r[fn].endswith(f"_{code}.nc") for code in codes)]

    # 2. latest (daily files) and history
    c_lat, h_lat, rows_lat = read_index(get(base + "index_latest.txt").decode("utf-8", "replace"))
    lat_rows = keep(rows_lat, h_lat)
    write_csv(out / "index_latest_galicia.csv", h_lat, lat_rows)
    c_his, h_his, rows_his = read_index(get(base + "index_history.txt").decode("utf-8", "replace"))
    his_rows = keep(rows_his, h_his)
    write_csv(out / "index_history_galicia.csv", h_his, his_rows)

    # 3. one day of 1-minute data per station
    day = a.dia.replace("-", "")
    fn = h_lat.index("file_name")
    daily = [r for r in lat_rows if f"/latest/{day}/" in r[fn]]
    nc_dir = out / f"dia_{day}"
    nc_dir.mkdir(exist_ok=True)
    got = []
    for r in daily:
        url = ROOT + r[fn]
        body = get(url)
        name = r[fn].rsplit("/", 1)[1]
        (nc_dir / name).write_bytes(body)
        got.append({"file": name, "bytes": len(body),
                    "time_coverage_end": r[h_lat.index("time_coverage_end")],
                    "date_update": r[h_lat.index("date_update")],
                    "institution": r[h_lat.index("institution")]})
        print(name, len(body))

    hist = None
    if a.historico:
        fnh = h_his.index("file_name")
        match = [r for r in his_rows if r[fnh].endswith(f"_{a.historico}.nc")]
        if match:
            r = match[0]
            body = get(ROOT + r[fnh])
            name = r[fnh].rsplit("/", 1)[1]
            (out / name).write_bytes(body)
            hist = {"file": name, "bytes": len(body),
                    "time_coverage_start": r[h_his.index("time_coverage_start")],
                    "time_coverage_end": r[h_his.index("time_coverage_end")]}
            print(name, len(body))

    files = {str(p.relative_to(out)): p.stat().st_size for p in sorted(out.rglob("*"))
             if p.is_file() and p.name != "rexistro.json"}
    (out / "rexistro.json").write_text(json.dumps(
        {"started_utc": started,
         "finished_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
         "dataset": DATASET, "doi": "https://doi.org/10.48670/moi-00043",
         "index_platform_update": platform_update.strip("# "),
         "galician_slev_platforms": sorted(codes),
         "day": a.dia, "daily_files": got, "history": hist,
         "requests": log, "files": files}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
