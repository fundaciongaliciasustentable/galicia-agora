// @ts-check
import { defineConfig } from 'astro/config';
import cfg from './site/site.config.json' with { type: 'json' };

export default defineConfig({
  site: cfg.site,
  base: cfg.base,
  srcDir: './site/src',
  publicDir: './site/public',
  outDir: './dist',
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'auto' },
  // No prefetch, no telemetry, nothing loaded from other origins.
  prefetch: false,
  devToolbar: { enabled: false },
});
