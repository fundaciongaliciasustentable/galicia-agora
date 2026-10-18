// Delay rule for small vessels (brief §6): inshore fishing and leisure craft are
// shown 15–30 min late. Anything we cannot classify gets the protective default.
//
// AIS ship types (ITU-R M.1371): 30 fishing, 36 sailing, 37 pleasure craft.
// Length comes from ShipStaticData.Dimension (A + B, metres).

export const SMALL_VESSEL_TYPES = new Set([30, 36, 37]);
/** Vessels shorter than this are treated as small regardless of type. */
export const SMALL_LENGTH_M = 24;
export const SMALL_VESSEL_DELAY_MIN = 30;

export interface VesselInfo {
  /** AIS ship type, if a ShipStaticData message has been seen. */
  type?: number | null;
  /** Dimension A + B in metres, if known and non-zero. */
  lengthM?: number | null;
  /** Class B transponders are almost always small craft. */
  classB?: boolean;
}

export function delayMinutes(v: VesselInfo): number {
  if (v.classB) return SMALL_VESSEL_DELAY_MIN;
  if (v.type === undefined || v.type === null || v.type === 0) return SMALL_VESSEL_DELAY_MIN;
  if (SMALL_VESSEL_TYPES.has(v.type)) return SMALL_VESSEL_DELAY_MIN;
  if (!v.lengthM || v.lengthM < SMALL_LENGTH_M) return SMALL_VESSEL_DELAY_MIN;
  return 0;
}
