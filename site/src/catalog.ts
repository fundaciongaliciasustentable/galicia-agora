// Build-time access to the layer catalogue produced by `npm run catalog`.

import { readFileSync } from 'node:fs';

export interface Bilingual {
  gl: string;
  es: string;
}

export interface CatalogMeta {
  published_at: string | null;
  fetched_at: string;
  last_success_at: string | null;
  status: 'fresh' | 'stale' | 'failed';
  alert: boolean;
  feature_count: number;
  last_error: string | null;
  history: Array<{ at: string; ok: boolean; error?: string }>;
}

export interface CatalogLayer {
  id: string;
  title: Bilingual;
  theme: string;
  operator: { name: string; url: string };
  source_url: string;
  licence: {
    spdx?: string;
    text_url: string;
    quote?: string;
    verified_at: string;
    odbl_compatible: boolean | 'doubt';
    collection: 'odbl' | 'cc-by-sa-4.0';
    notes?: string;
  };
  attribution: string;
  update_frequency: { declared: string; measured?: string };
  geometry: string;
  privacy_notes: string;
  style: { kind: string; color_token?: string; label_field?: string };
  table: { fields: string[] };
  context?: Array<{
    label: Bilingual;
    value: string;
    source: string;
    source_url: string;
    note?: Bilingual;
  }>;
  delay?: { minutes: number; reason: string };
  meta: CatalogMeta | null;
}

export interface Catalog {
  generated_at: string;
  layers: CatalogLayer[];
}

const PATH = process.env.DATA_OUT_DIR
  ? `${process.env.DATA_OUT_DIR}/catalog.json`
  : 'data-out/catalog.json';

export function loadCatalog(): Catalog {
  try {
    return JSON.parse(readFileSync(PATH, 'utf8')) as Catalog;
  } catch {
    return { generated_at: new Date().toISOString(), layers: [] };
  }
}

export function displayStatus(layer: CatalogLayer): 'fresh' | 'stale' | 'failed' | 'none' {
  return layer.meta?.status ?? 'none';
}
