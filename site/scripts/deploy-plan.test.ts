import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { changedFiles, hashTree, MANIFEST } from './deploy-plan.ts';

describe('deploy-plan', () => {
  it('stages only new or changed files, by content', () => {
    const root = mkdtempSync(join(tmpdir(), 'ga-deploy-'));
    mkdirSync(join(root, 'data/a'), { recursive: true });
    writeFileSync(join(root, 'index.html'), '<p>hola</p>');
    writeFileSync(join(root, 'data/a/data.geojson'), '{}');
    writeFileSync(join(root, MANIFEST), '{}');
    const local = hashTree(root);
    expect(Object.keys(local).sort()).toEqual(['data/a/data.geojson', 'index.html']);

    expect(changedFiles(local, null)).toHaveLength(2);
    expect(changedFiles(local, local)).toEqual([]);
    expect(changedFiles(local, { ...local, 'index.html': 'old' })).toEqual(['index.html']);
  });
});
