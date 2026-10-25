// Incremental FTPS deploy: every build rewrites all files, so timestamps say
// nothing. Compare sha256 per file with the manifest left on the server by the
// last successful deploy and stage only changed files for lftp to upload.
//
//   tsx site/scripts/deploy-plan.ts <dist> <remote-manifest.json|-> <staging>
//
// Writes <staging>/<changed files> and <staging-manifest> = <staging>.manifest.json
// (uploaded last, only after the files went up).

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

export const MANIFEST = '.deploy-manifest.json';

export type Manifest = Record<string, string>;

export function hashTree(root: string): Manifest {
  const out: Manifest = {};
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name !== MANIFEST && !e.name.startsWith('.git')) {
        out[relative(root, p).split('\\').join('/')] = createHash('sha256')
          .update(readFileSync(p))
          .digest('hex');
      }
    }
  };
  walk(root);
  return out;
}

/** Files that are new or whose content differs from the remote manifest. */
export function changedFiles(local: Manifest, remote: Manifest | null): string[] {
  return Object.keys(local)
    .filter((f) => !remote || remote[f] !== local[f])
    .sort();
}

function readRemote(path: string): Manifest | null {
  if (path === '-' || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
  } catch {
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dist, remotePath, staging] = process.argv.slice(2);
  if (!dist || !remotePath || !staging) {
    console.error('usage: deploy-plan.ts <dist> <remote-manifest|-> <staging>');
    process.exit(2);
  }
  const local = hashTree(dist);
  const remote = readRemote(remotePath);
  const changed = changedFiles(local, remote);
  mkdirSync(staging, { recursive: true });
  for (const f of changed) {
    mkdirSync(dirname(join(staging, f)), { recursive: true });
    copyFileSync(join(dist, f), join(staging, f));
  }
  writeFileSync(join(dirname(staging), MANIFEST), JSON.stringify(local));
  console.log(
    `deploy-plan: ${changed.length} of ${Object.keys(local).length} files changed${remote ? '' : ' (no remote manifest: full upload)'}`,
  );
}
