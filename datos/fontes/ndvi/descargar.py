#!/usr/bin/env python3
"""Phase 0 sample for NDVI over Galicia (MODIS MOD13Q1 v6.1, 250 m, 16 days).

Keyless path: the Microsoft Planetary Computer mirror of NASA LP DAAC.
  1. STAC search on collection modis-13Q1-061 (tile h17v04 covers Galicia).
  2. Anonymous SAS token from the Planetary Computer token endpoint
     (no account, no key; the token lasts about one hour).
  3. HTTP range reads on the Cloud-Optimized GeoTIFF of the NDVI band:
     only the 512x512 internal tiles that touch the Galicia bounding box
     are fetched and inflated with zlib. Everything is stdlib.

Output (in --saida, default mostra/):
  ndvi_<ano>_nivel<N>.i16      stacked crops, int16 little endian, one per
                               composite, rows x cols given in the JSON
  ndvi_<ano>_nivel<N>.json     dates, shape, sinusoidal geotransform, scale
  ndvi_ultimo_nivel<M>.i16/.json the latest composite (level 1, ~463 m, by
                               default; --nivel-ultimo 0 for full 250 m)
  rexistro.json                UTC time, URLs (without the SAS token), bytes

NDVI = value * 0.0001; -3000 is the fill value. Projection: MODIS
sinusoidal (sphere R = 6371007.181 m).

Usage:
  python3 -I descargar.py [--ano 2024] [--nivel 2] [--satelite MOD13Q1]
                          [--nivel-ultimo 1] [--sen-ultimo] [--saida mostra]

2024 is the default year because the Planetary Computer mirror misses the
MOD13Q1/MYD13Q1 composites of 2025 from 12 July to 1 November (they exist
in NASA CMR, but LP DAAC downloads need an Earthdata login).
"""

import argparse
import json
import math
import struct
import time
import urllib.parse
import urllib.request
import zlib
from datetime import datetime, timezone
from pathlib import Path

UA = ("MapasGaliciaSustentable/0.1 (+https://mapas.galiciasustentable.org; "
      "galiciasustentable@galiciasustentable.org)")
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
TOKEN = "https://planetarycomputer.microsoft.com/api/sas/v1/token/modiseuwest/modis-061-cogs"
COLLECTION = "modis-13Q1-061"
ASSET = "250m_16_days_NDVI"
BBOX = (-9.35, 41.8, -6.7, 43.8)  # lon_min, lat_min, lon_max, lat_max
R = 6371007.181
PAUSE = 1.1

_last = {}
log = []


def get(url, headers=None, label=None):
    host = urllib.parse.urlsplit(url).netloc
    wait = PAUSE - (time.monotonic() - _last.get(host, 0))
    if wait > 0:
        time.sleep(wait)
    h = {"User-Agent": UA}
    h.update(headers or {})
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=120) as r:
        body = r.read()
        status = r.status
    _last[host] = time.monotonic()
    log.append({"url": label or url, "status": status, "bytes": len(body),
                "range": h.get("Range")})
    return body


def sinusoidal(lon, lat):
    return R * math.radians(lon) * math.cos(math.radians(lat)), R * math.radians(lat)


def parse_ifds(buf):
    bo = "<" if buf[:2] == b"II" else ">"
    assert struct.unpack(bo + "H", buf[2:4])[0] == 42, "not a classic TIFF"
    size = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8, 16: 8}
    fmt = {3: "H", 4: "I", 12: "d", 16: "Q"}
    off = struct.unpack(bo + "I", buf[4:8])[0]
    ifds = []
    while off:
        n = struct.unpack(bo + "H", buf[off:off + 2])[0]
        tags = {}
        for i in range(n):
            e = buf[off + 2 + 12 * i: off + 14 + 12 * i]
            tag, typ, cnt = struct.unpack(bo + "HHI", e[:8])
            nbytes = size.get(typ, 1) * cnt
            if nbytes <= 4:
                data = e[8:8 + nbytes]
            else:
                p = struct.unpack(bo + "I", e[8:12])[0]
                if p + nbytes > len(buf):
                    raise ValueError("header range too short, raise HEAD_BYTES")
                data = buf[p:p + nbytes]
            if typ in fmt:
                tags[tag] = struct.unpack(bo + fmt[typ] * cnt, data)
            elif typ == 2:
                tags[tag] = data.decode("latin1")
        ifds.append(tags)
        off = struct.unpack(bo + "I", buf[off + 2 + 12 * n: off + 6 + 12 * n])[0]
    return bo, ifds


HEAD_BYTES = 65536


def crop(url_signed, url_label, level):
    head = get(url_signed, {"Range": f"bytes=0-{HEAD_BYTES - 1}"}, url_label + " [cabeceira]")
    bo, ifds = parse_ifds(head)
    base, ifd = ifds[0], ifds[level]
    assert ifd[259][0] == 8 and ifd[258][0] == 16 and ifd.get(317, (1,))[0] == 1, \
        "expected deflate, int16, no predictor"
    width, height = ifd[256][0], ifd[257][0]
    tw, th = ifd[322][0], ifd[323][0]
    factor = base[256][0] / width
    px = base[33550][0] * factor
    x0, y0 = base[33922][3], base[33922][4]
    corners = [sinusoidal(lon, lat) for lon in BBOX[0::2] for lat in BBOX[1::2]]
    xs, ys = [c[0] for c in corners], [c[1] for c in corners]
    c0 = max(0, int((min(xs) - x0) / px))
    c1 = min(width, int(math.ceil((max(xs) - x0) / px)))
    r0 = max(0, int((y0 - max(ys)) / px))
    r1 = min(height, int(math.ceil((y0 - min(ys)) / px)))
    cols, rows = c1 - c0, r1 - r0
    out = bytearray(b"\x00\x00" * cols * rows)
    tiles_across = (width + tw - 1) // tw
    for ty in range(r0 // th, (r1 - 1) // th + 1):
        for tx in range(c0 // tw, (c1 - 1) // tw + 1):
            k = ty * tiles_across + tx
            o, n = ifd[324][k], ifd[325][k]
            raw = zlib.decompress(get(url_signed, {"Range": f"bytes={o}-{o + n - 1}"},
                                      f"{url_label} [tesela {k}]"))
            for rr in range(max(r0, ty * th), min(r1, (ty + 1) * th)):
                a = max(c0, tx * tw)
                b = min(c1, (tx + 1) * tw)
                src = ((rr - ty * th) * tw + (a - tx * tw)) * 2
                dst = ((rr - r0) * cols + (a - c0)) * 2
                out[dst:dst + (b - a) * 2] = raw[src:src + (b - a) * 2]
    if bo == ">":
        vals = struct.unpack(">%dh" % (cols * rows), out)
        out = bytearray(struct.pack("<%dh" % (cols * rows), *vals))
    meta = {"rows": rows, "cols": cols, "pixel_m": px,
            "x0": x0 + c0 * px, "y0": y0 - r0 * px,
            "nodata": int(ifd.get(42113, "-3000").strip("\x00 ")), "scale": 0.0001}
    return bytes(out), meta


def stats(data, nodata):
    v = struct.unpack("<%dh" % (len(data) // 2), data)
    ok = [x for x in v if x != nodata and x > 0]  # >0 drops sea and water
    return {"pixels": len(v), "valid_positive": len(ok),
            "ndvi_mean": round(sum(ok) / len(ok) * 1e-4, 4) if ok else None}


def search(year, prefix):
    q = {"collections": COLLECTION, "bbox": ",".join(map(str, BBOX)),
         "datetime": f"{year}-01-01T00:00:00Z/{year}-12-31T23:59:59Z", "limit": "100"}
    url = STAC + "?" + urllib.parse.urlencode(q)
    items = []
    while url:
        d = json.loads(get(url))
        items += d["features"]
        url = next((l["href"] for l in d.get("links", []) if l.get("rel") == "next"), None)
    # keep one item per composite: same start date may appear twice when
    # LP DAAC reprocessed it; the id ends with the production timestamp
    best = {}
    for i in items:
        start = i["properties"]["start_datetime"][:10]
        if i["id"].startswith(prefix) and start.startswith(str(year)):
            if start not in best or i["id"] > best[start]["id"]:
                best[start] = i
    return [best[k] for k in sorted(best)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ano", type=int, default=2024)
    ap.add_argument("--nivel", type=int, default=2, help="0=250 m, 1=~463 m, 2=~927 m")
    ap.add_argument("--satelite", default="MOD13Q1", choices=["MOD13Q1", "MYD13Q1"])
    ap.add_argument("--nivel-ultimo", type=int, default=1,
                    help="overview level for the latest composite (0 = full 250 m)")
    ap.add_argument("--sen-ultimo", action="store_true", help="skip latest composite")
    ap.add_argument("--saida", default=str(Path(__file__).resolve().parent / "mostra"))
    a = ap.parse_args()
    out = Path(a.saida)
    out.mkdir(parents=True, exist_ok=True)
    started = datetime.now(timezone.utc).isoformat(timespec="seconds")

    token = json.loads(get(TOKEN))
    sas = token["token"]

    items = search(a.ano, a.satelite)
    print(f"{len(items)} composites {a.satelite} {a.ano} (tile h17v04)")
    stack, dates, meta = bytearray(), [], None
    for it in items:
        href = it["assets"][ASSET]["href"]
        data, meta = crop(href + "?" + sas, href, a.nivel)
        stack += data
        s = stats(data, meta["nodata"])
        dates.append({"id": it["id"], "start": it["properties"]["start_datetime"][:10],
                      "end": it["properties"]["end_datetime"][:10], "href": href, **s})
        print(dates[-1]["start"], s["ndvi_mean"])
    base = f"ndvi_{a.ano}_nivel{a.nivel}"
    (out / f"{base}.i16").write_bytes(stack)
    (out / f"{base}.json").write_text(json.dumps(
        {"source": "MODIS MOD13Q1 v6.1 via Microsoft Planetary Computer", "asset": ASSET,
         "projection": "MODIS sinusoidal, sphere R=6371007.181 m", "bbox_lonlat": BBOX,
         "layout": "composites stacked in date order, row-major, int16 little endian",
         **(meta or {}), "composites": dates}, ensure_ascii=False, indent=1))

    latest = None
    if not a.sen_ultimo:
        recent = search(datetime.now(timezone.utc).year, a.satelite) or items
        it = recent[-1]
        href = it["assets"][ASSET]["href"]
        data, m = crop(href + "?" + sas, href, a.nivel_ultimo)
        (out / f"ndvi_ultimo_nivel{a.nivel_ultimo}.i16").write_bytes(data)
        latest = {"id": it["id"], "start": it["properties"]["start_datetime"][:10],
                  "end": it["properties"]["end_datetime"][:10], "href": href,
                  **m, **stats(data, m["nodata"])}
        (out / f"ndvi_ultimo_nivel{a.nivel_ultimo}.json").write_text(json.dumps(latest, indent=1))
        print("latest", latest["start"], latest["ndvi_mean"])

    files = {p.name: p.stat().st_size for p in sorted(out.iterdir()) if p.name != "rexistro.json"}
    (out / "rexistro.json").write_text(json.dumps(
        {"started_utc": started,
         "finished_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
         "token_endpoint": TOKEN, "token_expiry": token.get("msft:expiry"),
         "note": "URLs logged without the SAS query string",
         "requests": log, "files": files, "latest": latest}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
