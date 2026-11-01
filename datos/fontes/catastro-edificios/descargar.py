#!/usr/bin/env python3
"""Phase 0 sample for «Como se construíu Galicia» (Catastro, INSPIRE Buildings).

The Dirección General del Catastro publishes one ZIP per municipality through
an INSPIRE ATOM feed. Galicia is served by five territorial offices:
15 Coruña, 27 Lugo, 32 Ourense, 36 Pontevedra and 54 Vigo (Baiona, Gondomar,
Nigrán, Vigo). Each ZIP holds building.gml, buildingpart.gml,
otherconstruction.gml (pools) and metadata; GML 3.2, ISO-8859-1, EPSG:25829.

What this script does:
  1. reads the top feed and the five Galician feeds (list of ZIPs);
  2. sizes every Galician ZIP with HEAD (unless --sen-head);
  3. downloads two ZIPs (a small concello and a city) into --tmp, outside
     the repo, and reads building.gml with iterparse;
  4. writes to mostra/ only derived data: one row per building of the small
     concello (centroid, years, use, condition, floor area, dwellings) and a
     100 m grid for the city. No cadastral reference, no address, no owner.

Usage:
  python3 -I descargar.py --tmp /path/outside/repo [--pequeno 32035] \
      [--cidade 27900] [--sen-head] [--saida mostra]

Stdlib only. Pauses >= 1 s between requests. Log in <saida>/rexistro.json.
"""

import argparse
import io
import json
import math
import re
import statistics
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

UA = ("GaliciaAgora/0.1 (+https://github.com/fundaciongaliciasustentable/galicia-agora; "
      "galiciasustentable@galiciasustentable.org)")
BASE = "https://www.catastro.hacienda.gob.es/INSPIRE/buildings"
TOP = f"{BASE}/ES.SDGC.BU.atom.xml"
OFFICES = ["15", "27", "32", "36", "54"]
LICENCE_PDF = "https://www.catastro.hacienda.gob.es/webinspire/documentos/Licencia.pdf"
PAUSE = 1.2
LOG = []

NS = {
    "gml": "http://www.opengis.net/gml/3.2",
    "bu-core2d": "http://inspire.jrc.ec.europa.eu/schemas/bu-core2d/2.0",
    "bu-ext2d": "http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0",
}
BUILDING = "{%s}Building" % NS["bu-ext2d"]


def req(url, method="GET"):
    # Feed links contain spaces and Ñ: quote the path, keep the scheme/host.
    p = urllib.parse.urlsplit(url)
    url_q = urllib.parse.urlunsplit((p.scheme, p.netloc, urllib.parse.quote(p.path), p.query, ""))
    r = urllib.request.Request(url_q, headers={"User-Agent": UA}, method=method)
    try:
        with urllib.request.urlopen(r, timeout=600) as resp:
            body = resp.read() if method == "GET" else b""
            st, h = resp.status, dict(resp.headers)
    except urllib.error.HTTPError as e:
        body, st, h = b"", e.code, dict(e.headers)
    LOG.append({"url": url, "metodo": method, "status": st,
                "bytes": len(body) if method == "GET" else int(h.get("Content-Length", 0) or 0),
                "last_modified": h.get("Last-Modified"),
                "utc": datetime.now(timezone.utc).isoformat(timespec="seconds")})
    time.sleep(PAUSE)
    return body, st, h


def utm29_to_lonlat(x, y):
    """ETRS89 / UTM 29N (EPSG:25829) to lon/lat, GRS80 (Snyder inverse TM)."""
    a, f, k0 = 6378137.0, 1 / 298.257222101, 0.9996
    e2 = f * (2 - f)
    ep2 = e2 / (1 - e2)
    x -= 500000.0
    m = y / k0
    mu = m / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    p1 = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu)
          + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
          + (151 * e1 ** 3 / 96) * math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    c1 = ep2 * math.cos(p1) ** 2
    t1 = math.tan(p1) ** 2
    n1 = a / math.sqrt(1 - e2 * math.sin(p1) ** 2)
    r1 = a * (1 - e2) / (1 - e2 * math.sin(p1) ** 2) ** 1.5
    d = x / (n1 * k0)
    lat = p1 - (n1 * math.tan(p1) / r1) * (
        d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6 / 720)
    lon = (d - (1 + 2 * t1 + c1) * d ** 3 / 6
           + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5 / 120) / math.cos(p1)
    return math.degrees(lon) - 9.0, math.degrees(lat)


def ring_area_centroid(coords):
    """Shoelace area (m2, absolute) and centroid of a closed ring."""
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(coords, coords[1:]):
        c = x0 * y1 - x1 * y0
        a += c
        cx += (x0 + x1) * c
        cy += (y0 + y1) * c
    if abs(a) < 1e-9:
        xs, ys = zip(*coords)
        return 0.0, sum(xs) / len(xs), sum(ys) / len(ys)
    return abs(a) / 2, cx / (3 * a), cy / (3 * a)


def year(s):
    m = re.match(r"(\d{4})-", s or "")
    return int(m.group(1)) if m else None


def parse_buildings(gml_bytes):
    """Yield one dict per Building; the cadastral reference is not kept."""
    for _, el in ET.iterparse(io.BytesIO(gml_bytes), events=("end",)):
        if el.tag != BUILDING:
            continue
        g = lambda path: el.findtext(path, namespaces=NS)
        tot_a = sx = sy = 0.0
        for patch in el.iterfind(".//gml:PolygonPatch", NS):
            pl = patch.find("gml:exterior//gml:posList", NS)
            v = [float(t) for t in pl.text.split()]
            ring = list(zip(v[0::2], v[1::2]))
            ar, cx, cy = ring_area_centroid(ring)
            w = ar if ar > 0 else 1e-6
            tot_a += ar
            sx += cx * w
            sy += cy * w
        wsum = tot_a if tot_a > 0 else 1e-6 * len(el.findall(".//gml:PolygonPatch", NS))
        x, y = sx / wsum, sy / wsum
        area = g("bu-ext2d:officialArea/bu-ext2d:OfficialArea/bu-ext2d:value")
        yield {
            "x": x, "y": y,
            "ano": year(g("bu-core2d:dateOfConstruction/bu-core2d:DateOfEvent/bu-core2d:beginning")),
            "ano_ultimo": year(g("bu-core2d:dateOfConstruction/bu-core2d:DateOfEvent/bu-core2d:end")),
            "alta_bd": year(g("bu-core2d:beginLifespanVersion")),
            "estado": g("bu-core2d:conditionOfConstruction"),
            "uso": g("bu-ext2d:currentUse"),
            "vivendas": int(g("bu-ext2d:numberOfDwellings") or 0),
            "m2_construidos": int(float(area)) if area else None,
            "m2_planta": round(tot_a),
        }
        el.clear()


def stats(rows):
    anos = [r["ano"] for r in rows if r["ano"]]
    dec = Counter((a // 10) * 10 for a in anos)
    return {
        "edificios": len(rows),
        "con_ano": len(anos),
        "pct_con_ano": round(100 * len(anos) / len(rows), 1) if rows else None,
        "ano_min": min(anos) if anos else None,
        "ano_max": max(anos) if anos else None,
        "ano_mediana": statistics.median(anos) if anos else None,
        "pct_antes_1900": round(100 * sum(a < 1900 for a in anos) / len(anos), 1) if anos else None,
        "pct_1900_xusto": round(100 * sum(a == 1900 for a in anos) / len(anos), 1) if anos else None,
        "pct_ano_redondo_x0": round(100 * sum(a % 10 == 0 for a in anos) / len(anos), 1) if anos else None,
        "pct_varias_datas": round(100 * sum(1 for r in rows if r["ano"] and r["ano_ultimo"]
                                            and r["ano_ultimo"] != r["ano"]) / len(anos), 1) if anos else None,
        "por_decada": dict(sorted(dec.items())),
        "uso": dict(Counter(r["uso"] for r in rows).most_common()),
        "estado": dict(Counter(r["estado"] for r in rows).most_common()),
        "alta_bd_por_ano": dict(sorted(Counter(r["alta_bd"] for r in rows if r["alta_bd"]).items())),
        "vivendas": sum(r["vivendas"] for r in rows),
        "m2_construidos": sum(r["m2_construidos"] or 0 for r in rows),
    }


def fetch_zip(entry, tmp):
    raw, st, _ = req(entry["url"])
    (tmp / Path(urllib.parse.urlsplit(entry["url"]).path).name).write_bytes(raw)
    z = zipfile.ZipFile(io.BytesIO(raw))
    names = {n: z.getinfo(n).file_size for n in z.namelist()}
    gml = next(n for n in names if n.endswith(".building.gml"))
    return raw, names, z.read(gml)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tmp", required=True, help="scratch dir outside the repo for the ZIPs")
    ap.add_argument("--pequeno", default="32035", help="Catastro code of the small concello")
    ap.add_argument("--cidade", default="27900", help="Catastro code of the city")
    ap.add_argument("--sen-head", action="store_true")
    ap.add_argument("--saida", default=str(Path(__file__).parent / "mostra"))
    a = ap.parse_args()
    saida, tmp = Path(a.saida), Path(a.tmp)
    saida.mkdir(parents=True, exist_ok=True)
    tmp.mkdir(parents=True, exist_ok=True)

    # 1. Feeds
    raw, _, _ = req(TOP)
    top = raw.decode("iso-8859-1")
    feeds_top = re.findall(r'href="([^"]+/buildings/(\d\d)/[^"]+\.xml)"', top)
    rights_top = Counter(r.strip() for r in re.findall(r"<rights>([^<]*)</rights>", top))
    rights_off = Counter()
    entries = []
    for off in OFFICES:
        raw, _, _ = req(f"{BASE}/{off}/ES.SDGC.bu.atom_{off}.xml")
        t = raw.decode("iso-8859-1")
        upd = re.search(r"<updated>([^<]+)</updated>", t)
        rights_off.update(r.strip() for r in re.findall(r"<rights>([^<]*)</rights>", t))
        for title, url in re.findall(r"<title>\s*([^<]+?) buildings</title>.*?href=\"([^\"]+\.zip)\"", t, re.S):
            code, name = title.split("-", 1)
            entries.append({"oficina": off, "codigo": code, "nome": name.strip(), "url": url,
                            "feed_updated": upd.group(1) if upd else None})

    # 2. Sizes
    if not a.sen_head:
        for e in entries:
            _, st, h = req(e["url"], "HEAD")
            e["bytes"] = int(h.get("Content-Length", 0) or 0) if st == 200 else None
            e["last_modified"] = h.get("Last-Modified")
    sizes = [e.get("bytes") or 0 for e in entries]

    # 3. Licence document (size only; text quoted in README)
    _, st_lic, h_lic = req(LICENCE_PDF, "HEAD")

    # 4. Two concellos
    by_code = {e["codigo"]: e for e in entries}
    out = {}
    for role, code in (("pequeno", a.pequeno), ("cidade", a.cidade)):
        e = by_code[code]
        zraw, names, gml = fetch_zip(e, tmp)
        rows = list(parse_buildings(gml))
        out[role] = {"codigo": code, "nome": e["nome"], "zip_bytes": len(zraw),
                     "ficheiros_zip": names, "resumo": stats(rows)}
        if role == "pequeno":
            f = saida / f"edificios_{code}.csv"
            with f.open("w", encoding="utf-8") as fh:
                fh.write("lon,lat,ano,ano_ultimo,uso,estado,m2_construidos,m2_planta,vivendas\n")
                for r in rows:
                    lon, lat = utm29_to_lonlat(r["x"], r["y"])
                    fh.write(f"{lon:.5f},{lat:.5f},{r['ano'] or ''},{r['ano_ultimo'] or ''},"
                             f"{r['uso'] or ''},{r['estado'] or ''},{r['m2_construidos'] or ''},"
                             f"{r['m2_planta']},{r['vivendas']}\n")
            out[role]["mostra"] = f.name
            out[role]["mostra_bytes"] = f.stat().st_size
        else:
            cells = {}
            for r in rows:
                k = (int(r["x"] // 100), int(r["y"] // 100))
                cells.setdefault(k, []).append(r["ano"])
            f = saida / f"grella100m_{code}.csv"
            with f.open("w", encoding="utf-8") as fh:
                fh.write("lon,lat,edificios,con_ano,ano_primeiro,ano_mediana\n")
                for (cx, cy), ys in sorted(cells.items()):
                    lon, lat = utm29_to_lonlat(cx * 100 + 50, cy * 100 + 50)
                    v = [y for y in ys if y]
                    fh.write(f"{lon:.5f},{lat:.5f},{len(ys)},{len(v)},{min(v) if v else ''},"
                             f"{int(statistics.median(v)) if v else ''}\n")
            out[role]["mostra"] = f.name
            out[role]["mostra_bytes"] = f.stat().st_size
            out[role]["celas_100m"] = len(cells)

    # 5. Extrapolation to the 315 ZIPs (buildings per ZIP byte, two samples)
    rates = [out[r]["resumo"]["edificios"] / out[r]["zip_bytes"] for r in ("pequeno", "cidade")]
    total = sum(sizes)
    est = [round(total * r) for r in rates]

    resumo = {
        "oficinas_feed_superior": len(feeds_top),
        "rights_feed_superior": dict(rights_top.most_common()),
        "rights_feeds_galicia": dict(rights_off.most_common()),
        "entradas_galicia": len(entries),
        "entradas_por_oficina": dict(Counter(e["oficina"] for e in entries)),
        "feed_updated": sorted({e["feed_updated"] for e in entries}),
        "zip_bytes_total": total,
        "zip_maior": (lambda e: {"codigo": e["codigo"], "nome": e["nome"], "bytes": e.get("bytes")})(
            max(entries, key=lambda e: e.get("bytes") or 0)) if not a.sen_head else None,
        "zip_bytes_mediana": statistics.median(sizes) if not a.sen_head else None,
        "licenza_pdf": {"url": LICENCE_PDF, "status": st_lic, "last_modified": h_lic.get("Last-Modified")},
        "edificios_galicia_estimados": sorted(est),
        "mostras": out,
    }
    rex = {"descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
           "user_agent": UA, "resumo": resumo,
           "entradas": [{k: e.get(k) for k in ("oficina", "codigo", "nome", "bytes", "last_modified")}
                        for e in entries],
           "peticions": LOG}
    (saida / "rexistro.json").write_text(json.dumps(rex, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(json.dumps({k: v for k, v in resumo.items() if k != "mostras"}, ensure_ascii=False, indent=1))
    for r, v in out.items():
        print(r, v["nome"], v["zip_bytes"], json.dumps(v["resumo"], ensure_ascii=False))


if __name__ == "__main__":
    main()
