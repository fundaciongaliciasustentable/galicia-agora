// Active traffic incidents in Galicia from the DGT DATEX II v3.7 feed (NAP).
// Records are kept by their autonomousCommunity (Galicia), not by bounding box, so
// regional and provincial roads are in and Asturias or León near the border are out.
// Connected V16 beacons (situationRecordCreationReference V16_…) are excluded here:
// they are a separate, privacy-reviewed layer (trafico-balizas-v16).
//
// Geometry: one Point per incident, at the "from" point of linear locations (the
// single point otherwise); the other end is kept as pk_fin. A straight from→to line
// would cut across curves on long stretches (some exceed 10 km), so no LineString is
// published.

import { type Adapter, type Feature, inGalicia, point, round } from '../../lib/adapter.ts';
import {
  fetchSituations,
  galicianAnchor,
  readRecords,
  type SituationRecord,
} from './situations.ts';

export { SITUATIONS_URL as URL } from './situations.ts';

/** Sanity guard against bad coordinates; the filter itself is autonomousCommunity. */
export const PAD = 0.3;

export type Raw = Buffer;

/** causeType → tipo. */
export const TIPO: Record<string, string> = {
  roadMaintenance: 'Obras',
  accident: 'Accidente',
  vehicleObstruction: 'Vehículo na calzada',
  obstruction: 'Obstáculo na calzada',
  environmentalObstruction: 'Obstáculo natural',
  infrastructureDamageObstruction: 'Danos na estrada',
  roadOrCarriagewayOrLaneManagement: 'Restrición de tráfico',
  poorEnvironment: 'Condicións meteorolóxicas adversas',
  abnormalTraffic: 'Tráfico irregular',
  publicEvent: 'Evento público',
};

/** Detailed cause (accidentType, roadMaintenanceType, …) → causa. */
export const CAUSA: Record<string, string> = {
  accident: 'Accidente',
  roadworks: 'Obras na estrada',
  damagedRoadSurface: 'Firme danado',
  vehicleStuck: 'Vehículo avariado',
  vehicleOnFire: 'Vehículo en chamas',
  vehicleWithOverwideLoad: 'Vehículo con carga ancha',
  objectOnTheRoad: 'Obxecto na calzada',
  obstructionOnTheRoad: 'Obstáculo na calzada',
  spillageOnTheRoad: 'Vertido na calzada',
  rockfalls: 'Desprendemento de rochas',
  flooding: 'Inundación',
  forestFire: 'Incendio forestal',
  avalanches: 'Alude',
  badWeather: 'Mal tempo',
  visibilityReduced: 'Visibilidade reducida',
  strongWinds: 'Vento forte',
  smokeHazard: 'Fume',
  fog: 'Néboa',
  slowTraffic: 'Tráfico lento',
  sportsMeeting: 'Proba deportiva',
};

/** Record-level measures → descricion. Codes without a label (other) are left out. */
export const MEDIDA: Record<string, string> = {
  laneClosures: 'Carrís pechados',
  carriagewayClosures: 'Calzada pechada',
  singleAlternateLineTraffic: 'Paso alternativo',
  newRoadworksLayout: 'Novo trazado por obras',
  useOfSpecifiedLanesOrCarriagewaysAllowed: 'Circulación por carrís habilitados',
  narrowLanes: 'Carrís estreitos',
  intermittentShortTermClosures: 'Cortes intermitentes',
  roadClosed: 'Estrada cortada',
  doNotUseSpecifiedLanesOrCarriageways: 'Carrís sinalados fóra de uso',
  lanesDeviated: 'Carrís desviados',
  weightRestrictionInOperation: 'Restrición de peso',
  speedRestrictionInOperation: 'Limitación de velocidade',
  driveCarefully: 'Circule con precaución',
  roadSurfaceInPoorCondition: 'Firme en mal estado',
  slowTraffic: 'Tráfico lento',
};

export const CARRIL: Record<string, string> = {
  allLanesCompleteCarriageway: 'todos os carrís',
  rightLane: 'carril dereito',
  leftLane: 'carril esquerdo',
  tidalFlowLane: 'carril reversible',
  centralReservation: 'mediana',
  carPoolLane: 'carril VAO',
};

export const CALZADA: Record<string, string> = {
  exitSlipRoad: 'ramal de saída',
  entrySlipRoad: 'ramal de entrada',
  serviceRoad: 'vía de servizo',
};

export const GRAVIDADE: Record<string, string> = {
  highest: 'máxima',
  high: 'alta',
  medium: 'media',
  low: 'baixa',
  lowest: 'mínima',
};

const SENTIDO: Record<string, string> = {
  positive: 'crecente',
  negative: 'decrecente',
  both: 'ambos sentidos',
};

const RUMBO: Record<string, string> = {
  northBound: 'cara ao norte',
  southBound: 'cara ao sur',
  eastBound: 'cara ao leste',
  westBound: 'cara ao oeste',
  northEastBound: 'cara ao nordés',
  northWestBound: 'cara ao noroeste',
  southEastBound: 'cara ao sueste',
  southWestBound: 'cara ao suroeste',
};

const FONTE: Record<string, string> = { 'DGT3.0': 'DGT 3.0' };

export function sentido(r: Pick<SituationRecord, 'direction' | 'directionRoad'>): string | null {
  const road = r.directionRoad ? SENTIDO[r.directionRoad] : undefined;
  const compass = r.direction ? RUMBO[r.direction] : undefined;
  if (road === 'ambos sentidos') return road;
  if (road && compass) return `${road} (${compass})`;
  return road ?? compass ?? null;
}

/** Short description from the record measures, lane and carriageway. */
export function descricion(records: SituationRecord[]): string {
  const parts: string[] = [];
  for (const r of records) {
    for (const m of r.measures) {
      const label = MEDIDA[m];
      if (label && !parts.includes(label)) parts.push(label);
    }
  }
  const r = records[0] as SituationRecord;
  const where = [
    r.laneUsage ? CARRIL[r.laneUsage] : undefined,
    r.carriageway ? CALZADA[r.carriageway] : undefined,
  ].filter((x): x is string => !!x);
  const main =
    parts.join('. ') ||
    (r.detailedCause ? CAUSA[r.detailedCause] : undefined) ||
    (r.causeType ? TIPO[r.causeType] : undefined) ||
    'Incidencia';
  return where.length ? `${main} (${where.join(', ')})` : main;
}

function rank(sev: string | null): number {
  return sev ? ['lowest', 'low', 'medium', 'high', 'highest'].indexOf(sev) : -1;
}

/**
 * One feature per situation and location. A situation often carries several records for
 * the same stretch (e.g. "drive carefully" plus "road surface in poor condition"); these
 * become one feature. Records on different stretches stay separate.
 */
export function toFeatures(records: SituationRecord[]): Feature[] {
  const groups = new Map<string, SituationRecord[]>();
  for (const r of records) {
    if (r.v16) continue;
    const a = galicianAnchor(r);
    if (!a || !inGalicia(a.lon, a.lat, PAD)) continue;
    const key = `${r.situationId}|${r.from?.lat},${r.from?.lon}|${r.to?.lat},${r.to?.lon}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  const features: Feature[] = [];
  for (const group of groups.values()) {
    // Prefer a record that says what happens on the road over a generic instruction.
    const main =
      group.find((r) => r.recordType !== 'GeneralInstructionOrMessageToRoadUsers') ??
      (group[0] as SituationRecord);
    const anchor = galicianAnchor(main) as NonNullable<ReturnType<typeof galicianAnchor>>;
    const other = anchor === main.from ? main.to : main.from;
    const starts = group.map((r) => r.start).filter((s): s is string => !!s);
    const ends = group.map((r) => r.end).filter((s): s is string => !!s);
    const sev = group.map((r) => r.severity).sort((a, b) => rank(b) - rank(a))[0] ?? null;
    const id = `${main.situationId}-${main.id}`;
    features.push({
      type: 'Feature',
      id,
      geometry: point(anchor.lon, anchor.lat),
      properties: {
        id,
        tipo: (main.causeType && TIPO[main.causeType]) || 'Outra incidencia',
        causa: (main.detailedCause && CAUSA[main.detailedCause]) || null,
        estrada: main.road,
        pk: anchor.pk === null ? null : round(anchor.pk, 3),
        pk_fin: other?.pk == null ? null : round(other.pk, 3),
        sentido: sentido(main),
        concello: anchor.concello,
        provincia: anchor.provincia,
        inicio: starts.sort()[0] ?? null,
        fin: ends.sort().at(-1) ?? null,
        gravidade: (sev && GRAVIDADE[sev]) || null,
        fonte: main.source ? (FONTE[main.source] ?? main.source) : null,
        descricion: descricion([main, ...group.filter((r) => r !== main)]),
      },
    });
  }
  // Stable order: newest first, then id.
  return features.sort(
    (a, b) =>
      String(b.properties.inicio ?? '').localeCompare(String(a.properties.inicio ?? '')) ||
      String(a.id).localeCompare(String(b.id)),
  );
}

const adapter = {
  fetch: (ctx) => fetchSituations(ctx),
  async normalize(raw, _ctx) {
    const { records, publishedAt } = await readRecords(raw);
    return {
      collection: { type: 'FeatureCollection', features: toFeatures(records) },
      publishedAt,
    };
  },
} satisfies Adapter<Raw>;

export default adapter;
