import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LayerDef } from '../../lib/adapter.ts';
import { loadYaml, validateWithSchema } from '../../lib/schemas.ts';
import { fixtureContext } from '../../lib/testing.ts';
import adapter, { sentido } from './adapter.ts';
import schema from './properties.schema.json' with { type: 'json' };
import {
  clearSituationsCache,
  fetchSituations,
  MEMO_TTL_MS,
  parseSituation,
  readRecords,
} from './situations.ts';

const dir = import.meta.dirname;
const fixture = join(dir, 'fixtures', 'datex2_v37.xml');
const layer = await loadYaml<LayerDef>(join(dir, 'layer.yaml'));
const routes = [{ match: 'datex2_v37.xml', file: fixture }];

async function run() {
  const ctx = fixtureContext(layer, routes);
  const raw = await adapter.fetch(ctx);
  return { ctx, out: await adapter.normalize(raw, ctx) };
}

const doc = (situations: string) =>
  Buffer.from(
    `<?xml version="1.0"?><d2:payload xsi:type="sit:SituationPublication"><com:publicationTime>2026-10-25T10:42:15.924+01:00</com:publicationTime>${situations}</d2:payload>`,
  );
const pt = (tag: string, ccaa: string, lat: number, lon: number, km: number) =>
  `<loc:${tag} xsi:type="loc:TpegNonJunctionPoint"><loc:pointCoordinates><loc:latitude>${lat}</loc:latitude><loc:longitude>${lon}</loc:longitude></loc:pointCoordinates><loc:_tpegNonJunctionPointExtension><loc:extendedTpegNonJunctionPoint><lse:autonomousCommunity>${ccaa}</lse:autonomousCommunity><lse:kilometerPoint>${km}</lse:kilometerPoint><lse:municipality>M</lse:municipality><lse:province>P</lse:province></loc:extendedTpegNonJunctionPoint></loc:_tpegNonJunctionPointExtension></loc:${tag}>`;
const linear = (id: string, from: string, to: string) =>
  `<sit:situation id="${id}"><sit:situationRecord xsi:type="sit:RoadOrCarriagewayOrLaneManagement" id="${id}0" version="1"><sit:source><com:sourceIdentification>DGT</com:sourceIdentification></sit:source><sit:cause><sit:causeType>roadMaintenance</sit:causeType><sit:detailedCauseType><sit:roadMaintenanceType>roadworks</sit:roadMaintenanceType></sit:detailedCauseType></sit:cause><sit:locationReference xsi:type="loc:SingleRoadLinearLocation"><loc:supplementaryPositionalDescription><loc:roadInformation><loc:roadName>A-8</loc:roadName></loc:roadInformation></loc:supplementaryPositionalDescription><loc:tpegLinearLocation>${to}${from}</loc:tpegLinearLocation></sit:locationReference><sit:roadOrCarriagewayOrLaneManagementType>laneClosures</sit:roadOrCarriagewayOrLaneManagementType></sit:situationRecord></sit:situation>`;

beforeEach(() => clearSituationsCache());

describe('trafico-incidencias adapter', () => {
  it('makes one request and normalizes the recorded response', async () => {
    const { ctx, out } = await run();
    expect(ctx.requested).toHaveLength(1);
    expect(out.publishedAt).toBe('2026-10-25T09:42:15.924Z');
    const fs = out.collection.features;
    // 8 Galician situations; 21745653 has two records on the same stretch → one feature.
    expect(fs).toHaveLength(8);
    for (const f of fs) {
      expect(f.geometry?.type).toBe('Point');
      expect(validateWithSchema(schema, f.properties)).toEqual([]);
    }
  });

  it('keeps Galicia by autonomousCommunity and excludes V16 beacons', async () => {
    const { out } = await run();
    const ids = out.collection.features.map((f) => String(f.id).split('-')[0]);
    expect(ids).not.toContain('13054089'); // outside Galicia
    expect(ids).not.toContain('24975971'); // V16 beacon in Galicia (Ordes)
    expect(JSON.stringify(out)).not.toMatch(/V16/);
  });

  it('translates types and reads a linear location from its "from" point', async () => {
    const { out } = await run();
    const f = out.collection.features.find((x) => x.id === '21745653-25943697');
    expect(f?.geometry).toEqual({ type: 'Point', coordinates: [-7.58251, 42.01098] });
    expect(f?.properties).toMatchObject({
      tipo: 'Danos na estrada',
      causa: 'Firme danado',
      estrada: 'A-52',
      pk: 178.5,
      pk_fin: 170,
      sentido: 'decrecente (cara ao leste)',
      concello: 'Trasmiras',
      provincia: 'Ourense',
      inicio: '2026-07-26T16:43:49.000Z',
      fonte: 'DGT',
      descricion: 'Firme en mal estado. Circule con precaución (todos os carrís)',
    });
    const wind = out.collection.features.find((x) => String(x.id).startsWith('24997179-'));
    expect(wind?.properties).toMatchObject({ causa: 'Vento forte', gravidade: 'baixa' });
    const s112 = out.collection.features.filter((x) => x.properties.fonte === '112');
    expect(s112.length).toBe(2);
    expect(out.collection.features.some((x) => x.properties.fonte === 'DGT 3.0')).toBe(true);
  });

  it('reads gzip bodies and tiny chunks the same way', async () => {
    const plain = await readFile(fixture);
    const a = await adapter.normalize(plain, fixtureContext(layer, []));
    const b = await adapter.normalize(gzipSync(plain), fixtureContext(layer, []));
    expect(b).toEqual(a);
    const small = await readRecords(plain, 7);
    expect(small.situations).toBe(11);
    expect(small.records.filter((r) => r.v16)).toHaveLength(2);
  });

  it('places a record by its Galician end when "from" is outside Galicia', () => {
    const [r] = parseSituation(
      linear(
        '1',
        pt('from', 'Principado de Asturias', 43.54, -7.02, 505),
        pt('to', 'Galicia', 43.54, -7.04, 506),
      ),
    );
    expect(r?.from?.galicia).toBe(false);
    expect(r?.to?.galicia).toBe(true);
  });

  it('builds the direction label', () => {
    expect(sentido({ direction: 'westBound', directionRoad: 'positive' })).toBe(
      'crecente (cara ao oeste)',
    );
    expect(sentido({ direction: 'unknown', directionRoad: 'both' })).toBe('ambos sentidos');
    expect(sentido({ direction: null, directionRoad: null })).toBeNull();
  });

  it('returns 0 features when nothing is active in Galicia and throws on bad responses', async () => {
    const ctx = fixtureContext(layer, []);
    const out = await adapter.normalize(
      doc(
        linear(
          '2',
          pt('from', 'Castilla y León', 42.5, -6.6, 1),
          pt('to', 'Castilla y León', 42.5, -6.5, 2),
        ),
      ),
      ctx,
    );
    expect(out.collection.features).toHaveLength(0);
    expect(out.publishedAt).toBe('2026-10-25T09:42:15.924Z');
    await expect(adapter.normalize(Buffer.alloc(0), ctx)).rejects.toThrow();
    await expect(adapter.normalize(Buffer.from('<html>Error</html>'), ctx)).rejects.toThrow();
  });

  it('shares one download between the two DGT layers within the memo window', async () => {
    const ctx = fixtureContext(layer, routes);
    let t = 1_000_000;
    const clock = () => t;
    const a = await fetchSituations(ctx, clock);
    t += MEMO_TTL_MS - 1;
    const b = await fetchSituations(ctx, clock);
    expect(b).toBe(a);
    expect(ctx.requested).toHaveLength(1);
    t += 2;
    await fetchSituations(ctx, clock);
    expect(ctx.requested).toHaveLength(2);
  });

  it('does not memoise a failed download', async () => {
    const bad = fixtureContext(layer, []);
    await expect(fetchSituations(bad)).rejects.toThrow();
    const good = fixtureContext(layer, routes);
    await expect(fetchSituations(good)).resolves.toBeInstanceOf(Buffer);
  });
});
