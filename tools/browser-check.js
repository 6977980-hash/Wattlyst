// Browser smoke test for CI (audit WL-74: no browser test besides Lighthouse). Opens each URL in headless
// Chrome at phone width and fails on: a JavaScript error, any script fetched twice (WL-55), the WordPress
// emoji script (WL-57), or a calculator whose result after Calculate is blank, an error, or shows NaN / Infinity / undefined.
// On pages with an appliance list it also picks an appliance from the picker and adds a row. Every page must
// fit the phone width with no sideways scroll (audit WL-05).
// Usage: node tools/browser-check.js <node_modules dir with puppeteer-core + chrome-launcher> <url>... | --all=<base url>
// (--all checks every live page in generated/manifest.json plus /embed/<id>/ of one tool.)
// (both come with the lighthouse install in CI; set CHROME_PATH to use a specific Chrome.)
import { createRequire } from 'node:module';
import { resolve, join, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [modules, ...args] = process.argv.slice(2);
const urls = args.flatMap((a) => {
  if (!a.startsWith('--all=')) return [a];
  const base = a.slice(6).replace(/\/$/, '');
  const manifest = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../generated/manifest.json'), 'utf8'));
  return [...manifest.pages.filter((p) => p.live).map((p) => base + p.url), `${base}/embed/e1/`];
});
const req = createRequire(resolve(modules) + '/');
const puppeteer = req('puppeteer-core');
const { Launcher } = req('chrome-launcher');

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || Launcher.getInstallations()[0], headless: true, args: ['--no-sandbox'] });
const problems = [];
for (const url of urls) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  const scripts = [];
  const before = problems.length;
  const fail = (msg) => problems.push(`${url}: ${msg}`);
  page.on('pageerror', (e) => fail(`page error: ${e.message}`));
  // A failed request is judged by its URL below (an outside API such as the N6 forecast may rate-limit CI).
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) fail(`console error: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400 && new URL(r.url()).origin === new URL(url).origin) fail(`HTTP ${r.status()} ${r.url()}`); });
  page.on('request', (r) => { if (r.resourceType() === 'script' || r.url().endsWith('.js') || r.url().includes('.js?')) scripts.push(r.url()); });
  const res = await page.goto(url, { waitUntil: 'networkidle0' });
  if (!res || res.status() !== 200) fail(`HTTP ${res && res.status()}`);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (wide > 0) fail(`page scrolls sideways by ${wide} px at phone width`);
  if (await page.$('form[data-wl-tool]')) {
    await page.$eval('form[data-wl-tool] button[type="submit"]', (b) => b.click());
    await new Promise((r) => setTimeout(r, 400));
    // The default inputs must give a result, not an error (C8 once said "Fuel data could not be loaded"); an amber
    // notice on a valid result is fine. Checked before the picker step below adds an empty row, and on the state
    // itself, since innerText also reads hidden results.
    const state = await page.$eval('form[data-wl-tool]', (f) => ({ hidden: f.querySelector('.wl-results').hidden, error: (() => { const e = f.querySelector('.wl-error'); return e && !e.hidden && !e.classList.contains('wl-notice') ? e.textContent : ''; })() }));
    if (state.hidden || state.error) fail(`default inputs give an error: ${state.error || 'results hidden'}`);
    const picker = await page.$('.wl-load-row select');
    if (picker) {
      await picker.focus();
      const n = await page.$eval('.wl-load-row select', (s) => s.options.length);
      if (n < 2) fail(`appliance picker has ${n} options`);
      await page.evaluate(() => {
        const s = document.querySelector('.wl-load-row select');
        s.selectedIndex = Math.min(5, s.options.length - 1);
        s.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.$eval('.wl-add-row', (b) => b.click());
    }
    await page.$eval('form[data-wl-tool] button[type="submit"]', (b) => b.click()); // DOM click: layout is not tested here
    await new Promise((r) => setTimeout(r, 400));
    const text = await page.$eval('.wl-results', (el) => el.innerText.trim());
    if (!text) fail('result is blank after Calculate');
    if (/NaN|Infinity|undefined/.test(text)) fail(`bad result text: ${text.slice(0, 120)}`);
  }
  const bare = scripts.map((u) => u.split('?')[0]);
  const twice = [...new Set(bare.filter((u, i) => bare.indexOf(u) !== i))];
  if (twice.length) fail(`fetched more than once: ${twice.join(', ')}`);
  if (scripts.some((u) => u.includes('wp-emoji'))) fail('WordPress emoji script loaded');
  console.log(url, `${scripts.length} scripts`, problems.length === before ? 'ok' : 'FAILED');
  await page.close();
}
await browser.close();
for (const p of problems) console.error(p);
process.exit(problems.length ? 1 : 0);
