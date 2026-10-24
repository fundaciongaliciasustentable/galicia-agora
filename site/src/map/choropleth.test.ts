import { describe, expect, it } from 'vitest';
import {
  breaksFor,
  classIndex,
  classifyIndicator,
  classifyWarnings,
  DIVERGING,
  deviation,
  type Indicator,
} from './choropleth.ts';

const idx: Indicator = {
  id: 'envellecemento',
  label: { gl: 'Envellecemento', es: 'Envejecimiento' },
  unit: 'índice',
  comparison: 'index',
  source: 'IGE',
};
const pts: Indicator = { ...idx, id: 'maiores_65_pct', comparison: 'points' };

const rows = [
  { codigo_ine: '15001', envellecemento_rel: 122, maiores_65_pct_rel: 4.1 },
  { codigo_ine: '27034', envellecemento_rel: 581, maiores_65_pct_rel: 23.9 },
  { codigo_ine: '15030', envellecemento_rel: 70, maiores_65_pct_rel: -6 },
  { codigo_ine: '36057', envellecemento_rel: 99, maiores_65_pct_rel: 0.2 },
  { codigo_ine: '15078', envellecemento_rel: null, maiores_65_pct_rel: null },
];

describe('choropleth', () => {
  it('measures distance from Galicia for index and points', () => {
    expect(deviation(rows[0] as never, idx)).toBe(22);
    expect(deviation(rows[2] as never, pts)).toBe(-6);
    expect(deviation(rows[4] as never, idx)).toBeNull();
  });

  it('puts values close to Galicia in the middle class', () => {
    const b = breaksFor(rows, idx);
    expect(classIndex(-1, b)).toBe(2);
    expect(classIndex(b.strong + 1, b)).toBe(4);
    expect(classIndex(-(b.strong + 1), b)).toBe(0);
  });

  it('builds a match expression that skips rows without data', () => {
    const c = classifyIndicator(rows, idx, 'codigo_ine', DIVERGING.light, 'gl');
    const expr = c.fillColor as unknown[];
    expect(expr[0]).toBe('match');
    expect(expr).not.toContain('15078');
    expect(c.legend).toHaveLength(5);
  });

  it('colours warning levels and leaves level 0 transparent', () => {
    const c = classifyWarnings(
      [
        { codigo_ine: '15001', nivel: 0 },
        { codigo_ine: '27034', nivel: 2 },
      ],
      'codigo_ine',
      'gl',
    );
    expect(c.fillColor).toEqual([
      'match',
      ['get', 'codigo_ine'],
      '27034',
      '#f2994a',
      'rgba(0,0,0,0)',
    ]);
  });
});
