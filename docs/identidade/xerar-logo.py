"""Xera o símbolo Constelación de Galicia Agora a partir dos 313 concellos.

Uso: python3 docs/identidade/xerar-logo.py data-out/perfil-concellos/data.geojson

Escribe en docs/identidade/ e site/public/. Dúas variantes:
- simbolo: un punto por concello (tamaño segundo o número de lugares), para 48 px ou máis.
- grella: os concellos agrupados nunha grella hexagonal, lexible a 16-32 px (favicon, cabeceira).

Tamén escribe site/src/components/BrandMark.astro co símbolo da cabeceira. Despois, o PNG para iOS:
  node -e "require('sharp')('docs/identidade/icona-fondo.svg',{density:300}).resize(180,180).png().toFile('site/public/apple-touch-icon.png')"
En ambas, o punto de Santiago late en laranxa: «agora».
"""

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT_DOC = ROOT / 'docs/identidade'
OUT_PUB = ROOT / 'site/public'

VERDE = '#4a5846'
VERDE_CLARO = '#c9d8bd'
ACENTO = '#e0632a'
SANTIAGO = '15078'
LAT0 = 42.7  # latitude media, para a escala lonxitude/latitude

features = json.load(open(sys.argv[1]))['features']
pts = [
    (f['properties']['lon'] * math.cos(math.radians(LAT0)), f['properties']['lat'],
     f['properties'].get('lugares') or 1, f['properties']['codigo_ine'])
    for f in features
]


def fit(size, pad):
    """Proxecta os puntos a un cadrado de lado `size` con marxe `pad`, centrados."""
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    s = (size - 2 * pad) / max(w, h)
    ox = (size - w * s) / 2
    oy = (size - h * s) / 2
    return [(ox + (x - min(xs)) * s, oy + (max(ys) - y) * s, l, c) for x, y, l, c in pts]


def f1(v):
    return f'{v:.1f}'.rstrip('0').rstrip('.')


def pulso(x, y, r, ring, stroke):
    return (f'<circle cx="{f1(x)}" cy="{f1(y)}" r="{f1(r)}" fill="{ACENTO}"/>'
            f'<circle cx="{f1(x)}" cy="{f1(y)}" r="{f1(ring)}" fill="none" stroke="{ACENTO}" stroke-width="{f1(stroke)}"/>')


def simbolo(size=200):
    """Un punto por concello en tres tamaños; os veciños de Santiago deixan sitio ao pulso."""
    P = fit(size, 10)
    lug = sorted(p[2] for p in P)
    t1, t2 = lug[len(lug) // 3], lug[2 * len(lug) // 3]
    sx, sy = next((x, y) for x, y, _, c in P if c == SANTIAGO)
    ring, gap = 11, 4
    dots = []
    for x, y, l, c in P:
        if c == SANTIAGO or math.hypot(x - sx, y - sy) < ring + gap:
            continue
        r = 1.5 if l < t1 else 2.1 if l < t2 else 2.8
        dots.append(f'<circle cx="{f1(x)}" cy="{f1(y)}" r="{r}"/>')
    return f'<g fill="currentColor">{"".join(dots)}</g>' + pulso(sx, sy, 4.6, ring, 2.2)


def grella(cols, size=64):
    """Agrupa os concellos nunha grella hexagonal de `cols` columnas; un punto por cela ocupada."""
    pad = size * 0.06
    P = fit(size, pad)
    step = (size - 2 * pad) / cols
    rowh = step * math.sqrt(3) / 2
    cells = {}
    for x, y, _, c in P:
        row = round((y - pad) / rowh)
        col = round((x - pad - (step / 2 if row % 2 else 0)) / step)
        cells.setdefault((row, col), []).append(c)
    r = step * 0.3
    dots, acc = [], None
    for (row, col), codes in cells.items():
        cx = pad + col * step + (step / 2 if row % 2 else 0)
        cy = pad + row * rowh
        if SANTIAGO in codes:
            acc = (cx, cy)
        else:
            dots.append(f'<circle cx="{f1(cx)}" cy="{f1(cy)}" r="{f1(r)}"/>')
    return f'<g fill="currentColor">{"".join(dots)}</g>' + f'<circle cx="{f1(acc[0])}" cy="{f1(acc[1])}" r="{f1(r * 1.35)}" fill="{ACENTO}"/>'


def svg(body, size, color=VERDE, extra=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" color="{color}">'
            f'<title>Galicia Agora</title>{extra}{body}</svg>\n')


def write(path, text):
    path.write_text(text)
    print(path.relative_to(ROOT))


sim = simbolo()
gre = grella(9)  # cabeceira do sitio (32 px CSS)
fav = grella(6)  # favicon: a 16 px máis columnas fan unha mancha

write(OUT_DOC / 'simbolo.svg', svg(sim, 200))
write(OUT_DOC / 'simbolo-claro.svg', svg(sim, 200, VERDE_CLARO))
write(OUT_DOC / 'simbolo-grella.svg', svg(gre, 64))
# O favicon cambia de cor co tema do navegador.
dark = f'<style>@media (prefers-color-scheme: dark){{svg{{color:{VERDE_CLARO}}}}}</style>'
write(OUT_PUB / 'favicon.svg', svg(fav, 64, extra=dark))
# Fonte para os PNG (fondo verde nato, símbolo claro): apple-touch-icon e iconas de manifesto.
write(OUT_DOC / 'icona-fondo.svg',
      f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-30 -30 260 260" color="{VERDE_CLARO}">'
      f'<title>Galicia Agora</title><rect x="-30" y="-30" width="260" height="260" fill="{VERDE}"/>{sim}</svg>\n')

FONT = "'Source Sans 3', system-ui, sans-serif"
for name, fg, bg in [('logo', '#1a1a17', None), ('logo-escuro', '#f2f2ec', VERDE)]:
    col = VERDE if bg is None else VERDE_CLARO
    rect = f'<rect width="640" height="200" fill="{bg}"/>' if bg else ''
    write(OUT_DOC / f'{name}.svg',
          f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 200"><title>Galicia Agora</title>{rect}'
          f'<g color="{col}">{sim}</g>'
          f'<text x="216" y="114" font-family="{FONT}" font-size="64" fill="{fg}" letter-spacing="-1">'
          f'<tspan font-weight="400">galicia</tspan><tspan font-weight="700" dx="14">agora</tspan></text>'
          f'<text x="219" y="148" font-family="{FONT}" font-size="16" fill="{fg}" opacity=".72" letter-spacing="2.4">'
          f'DATOS ABERTOS · EN DIRECTO</text></svg>\n')

write(ROOT / 'site/src/components/BrandMark.astro',
      '---\n// Xerado por docs/identidade/xerar-logo.py; non editar a man.\n---\n\n'
      f'<svg class="ga-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">{gre}</svg>\n')
