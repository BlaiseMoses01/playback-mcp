import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

mkdirSync('dist', { recursive: true });

await esbuild.build({
  entryPoints: ['src/background.ts', 'src/content.ts'],
  bundle: true,
  format: 'iife',
  target: 'chrome116',
  outdir: 'dist',
  logLevel: 'info',
  define: { __WS_PORT__: JSON.stringify(process.env.YT_BRIDGE_PORT ?? '8765') },
});

cpSync('manifest.json', 'dist/manifest.json');
