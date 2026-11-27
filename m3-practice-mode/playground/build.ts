/** Bundles the playground and the team's engine into one offline HTML file: demo/practice-playground.html */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const res = await build({
  entryPoints: [join(here, 'main.ts')], bundle: true, write: false, format: 'iife',
  platform: 'browser', target: 'es2020', minify: true, legalComments: 'none',
});
const reportPath = join(root, 'reports', 'validation-report.json');
const report = existsSync(reportPath) ? readFileSync(reportPath, 'utf8') : 'null';
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync(join(here, 'template.html'), 'utf8')
  .replace('/*REPORT*/null', () => report.replace(/<\//g, '<\\/'))
  .replace('/*BUNDLE*/', () => js);
mkdirSync(join(root, 'demo'), { recursive: true });
writeFileSync(join(root, 'demo', 'practice-playground.html'), html);
console.log(`demo/practice-playground.html  ${(html.length / 1024).toFixed(0)} KB`);
