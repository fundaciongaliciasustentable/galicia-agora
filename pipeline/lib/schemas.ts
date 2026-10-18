import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse as parseYaml } from 'yaml';

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
// ajv-formats ships CJS; its default export is the plugin function.
(addFormats as unknown as (a: Ajv2020) => void)(ajv);

// Cache the promise, not the function, so concurrent first calls compile once.
const cache = new Map<string, Promise<ValidateFunction>>();

function validator(name: 'layer' | 'meta' | 'sources'): Promise<ValidateFunction> {
  let hit = cache.get(name);
  if (!hit) {
    const path = fileURLToPath(new URL(`../schema/${name}.schema.json`, import.meta.url));
    hit = readFile(path, 'utf8').then((txt) => ajv.compile(JSON.parse(txt)));
    cache.set(name, hit);
  }
  return hit;
}

export async function validate(
  name: 'layer' | 'meta' | 'sources',
  data: unknown,
): Promise<string[]> {
  const fn = await validator(name);
  if (fn(data)) return [];
  return (fn.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`);
}

export async function loadYaml<T = unknown>(path: string): Promise<T> {
  return parseYaml(await readFile(path, 'utf8')) as T;
}
