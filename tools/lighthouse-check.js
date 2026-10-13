// Lighthouse mobile gate (build-plan rule 4): every category >= 95 on each URL.
// Usage: node tools/lighthouse-check.js <lighthouse-bin> <url>...   Runs 3 times per URL, uses the median.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const [bin, ...urls] = process.argv.slice(2);
const MIN = 0.95;
const dir = mkdtempSync(join(tmpdir(), 'lh-'));
let failed = false;
for (const url of urls) {
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const out = join(dir, `r${i}.json`);
    execFileSync(bin, [url, '--quiet', '--chrome-flags=--headless=new --no-sandbox', '--output=json', `--output-path=${out}`,
      '--only-categories=performance,accessibility,best-practices,seo'], { stdio: 'inherit' });
    runs.push(JSON.parse(readFileSync(out, 'utf8')).categories);
  }
  const med = {};
  for (const k of Object.keys(runs[0])) med[k] = runs.map((r) => r[k].score).sort((a, b) => a - b)[1];
  console.log(url, Object.fromEntries(Object.entries(med).map(([k, v]) => [k, Math.round(v * 100)])));
  for (const [k, v] of Object.entries(med)) if (v < MIN) { failed = true; console.error(`  ${k} ${Math.round(v * 100)} < 95`); }
}
process.exit(failed ? 1 : 0);
