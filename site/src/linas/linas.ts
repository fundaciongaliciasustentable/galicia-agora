// /linas/: the "Galicia en liñas" posters (galicia-linas layer). A gallery of light thumbnails;
// opening one shows it full and offers it as SVG or as a 3000 × 3750 PNG, both made here.

import { asset } from '../paths.ts';
import { decodeHeights, HEIGHT, type PosterData, posterSvg, WIDTH } from './poster.ts';

type Dict = Record<string, string>;

const UNITS: Record<string, Record<'gl' | 'es', string>> = {
  persoas: { gl: 'persoas', es: 'personas' },
  'miles de euros': { gl: 'millóns de euros', es: 'millones de euros' },
  raios: { gl: 'raios', es: 'rayos' },
  hectáreas: { gl: 'hectáreas queimadas', es: 'hectáreas quemadas' },
};

export async function start(): Promise<void> {
  const found = document.querySelector<HTMLElement>('.li-app');
  if (!found) return;
  const app: HTMLElement = found;
  const lang = (app.dataset.lang ?? 'gl') as 'gl' | 'es';
  const dict = JSON.parse(app.dataset.dict ?? '{}') as Dict;
  const loc = lang === 'gl' ? 'gl-ES' : 'es-ES';
  const nf = new Intl.NumberFormat(loc, { maximumFractionDigits: 0 });
  const tr = (key: string, vars: Record<string, string | number> = {}) => {
    let s = dict[key] ?? key;
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };
  const q = <T extends Element>(sel: string) => app.querySelector<T>(sel) as T;
  const grid = q<HTMLElement>('.li-grid');
  const status = q<HTMLElement>('.li-status');
  const dialog = q<HTMLDialogElement>('.li-dialog');
  const sources = q<HTMLElement>('.li-sources');

  const LAYER = 'galicia-linas';
  let posters: Array<PosterData & { text: string; file: string }> = [];
  try {
    const catalog = (await (await fetch(asset('data/catalog.json'))).json()) as {
      layers: Array<{ id: string; attribution: string; meta: unknown }>;
    };
    const layer = catalog.layers.find((l) => l.id === LAYER);
    if (layer?.meta) {
      sources.textContent = layer.attribution;
      const fc = (await (await fetch(asset(`data/${LAYER}/data.geojson`))).json()) as {
        features: Array<{ properties: Record<string, unknown> }>;
      };
      posters = fc.features
        .map(({ properties: p }) => p)
        .sort((a, b) => Number(a.orde) - Number(b.orde))
        .map((p) => {
          const id = String(p.id);
          const rows = Number(p.filas);
          const periodo = String(p.periodo ?? '');
          const year = periodo.includes('/') ? periodo.slice(0, 4) : periodo;
          const km = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }).format(
            ((43.82 - 41.78) * 111.19) / rows,
          );
          const unit = UNITS[String(p.unidade)]?.[lang];
          const total = p.total === null ? null : Number(p.total);
          const amount =
            total === null || !unit ? null : p.unidade === 'miles de euros' ? total / 1000 : total;
          const detail = [
            amount === null ? null : `${nf.format(amount)} ${unit}`,
            tr('lines_step', { km }),
          ]
            .filter(Boolean)
            .join(' · ');
          return {
            id,
            rows,
            cols: Number(p.columnas),
            heights: decodeHeights(String(p.perfis)),
            scale: p.escala === 'lineal' ? 'lineal' : 'raiz',
            title: tr(`lines_${id}_title`, { p: year }),
            text: tr(`lines_${id}_text`),
            detail,
            credit: `mapas.galiciasustentable.org · ${String(p.fonte)} · CC BY-SA 4.0`,
            file: `galicia-linas-${id}`,
          };
        });
    }
  } catch {
    // Handled below.
  }
  if (posters.length === 0) {
    status.textContent = dict.lines_missing ?? '';
    return;
  }
  status.textContent = '';

  for (const p of posters) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'li-card';
    button.setAttribute('aria-label', tr('lines_open', { title: p.title }));
    button.innerHTML = posterSvg(p, 4);
    const caption = document.createElement('span');
    caption.className = 'li-caption';
    caption.textContent = p.title;
    button.append(caption);
    button.addEventListener('click', () => open(p));
    item.append(button);
    grid.append(item);
  }

  let current: (typeof posters)[number] | null = null;
  function open(p: (typeof posters)[number]) {
    current = p;
    q<HTMLElement>('.li-big').innerHTML = posterSvg(p);
    q<HTMLElement>('.li-big-title').textContent = p.title;
    q<HTMLElement>('.li-big-text').textContent = p.text;
    dialog.showModal();
    history.replaceState(null, '', `#${p.id}`);
  }
  dialog.addEventListener('close', () => history.replaceState(null, '', location.pathname));
  q<HTMLButtonElement>('.li-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  const save = (blob: Blob, name: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  q<HTMLButtonElement>('.li-svg').addEventListener('click', () => {
    if (current)
      save(new Blob([posterSvg(current)], { type: 'image/svg+xml' }), `${current.file}.svg`);
  });
  q<HTMLButtonElement>('.li-png').addEventListener('click', async () => {
    if (!current) return;
    const url = URL.createObjectURL(new Blob([posterSvg(current)], { type: 'image/svg+xml' }));
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = 2.5;
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH * k;
    canvas.height = HEIGHT * k;
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const name = `${current.file}.png`;
    canvas.toBlob((blob) => blob && save(blob, name), 'image/png');
  });

  const fromHash = posters.find((p) => p.id === location.hash.slice(1));
  if (fromHash) open(fromHash);
}
