// Browser smoke test for CI (audit WL-74: no browser test besides Lighthouse). Opens each URL in headless
// Chrome at phone width and fails on: a JavaScript error, any script fetched twice (WL-55), the WordPress
// emoji script (WL-57), or a calculator whose result after Calculate is blank, an error, or shows NaN / Infinity / undefined.
// On pages with an appliance list it also picks an appliance from the picker and adds a row. A tool page must show its
// Next step within 400 px under the result (WL-198) and an embed its result above the inputs (WL-238). Every page must
// fit the phone width with no sideways scroll (audit WL-05), and no result table may scroll sideways (WL-135).
// On the homepage it also checks a shared ?load= link round trip (WL-89) and, at 1366 and 1920 px, that an
// input error keeps the inputs in place and the first click on the button still submits (WL-90).
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
    // WL-198: a "Next step" right under the result (after its table, diagram and share bar), not at the page bottom;
    // WL-238: an embed prints the result above the inputs, so a short iframe still shows it.
    const layout = await page.evaluate(() => {
      const nx = document.querySelector('.wl-next-inline');
      const end = Math.max(...[...document.querySelectorAll('.wl-results, .wl-rtable, .wl-diagram')].filter((e) => !e.hidden).map((e) => e.getBoundingClientRect().bottom));
      return { embed: document.body.hasAttribute('data-wl-embed'), home: !!document.querySelector('.wl-tool-split'), gap: nx ? Math.round(nx.getBoundingClientRect().top - end) : null, first: document.querySelector('.wl-results').getBoundingClientRect().top < document.querySelector('form[data-wl-tool] .wl-btn').getBoundingClientRect().top };
    });
    if (layout.embed && !layout.first) fail('embed prints the inputs above the result');
    if (!layout.embed && !layout.home && (layout.gap === null || layout.gap > 400)) fail(`Next step is ${layout.gap === null ? 'missing' : `${layout.gap} px`} below the result at phone width`);
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
    const rt = await page.$$eval('.wl-rtable .wl-table-wrap', (ws) => ws.map((w) => w.scrollWidth - w.clientWidth).filter((d) => d > 0));
    if (rt.length) fail(`result table scrolls sideways by ${rt.join(', ')} px at phone width`);
  }
  const bare = scripts.map((u) => u.split('?')[0]);
  const twice = [...new Set(bare.filter((u, i) => bare.indexOf(u) !== i))];
  if (twice.length) fail(`fetched more than once: ${twice.join(', ')}`);
  if (scripts.some((u) => u.includes('wp-emoji'))) fail('WordPress emoji script loaded');
  console.log(url, `${scripts.length} scripts`, problems.length === before ? 'ok' : 'FAILED');
  await page.close();
}
const home = urls.find((u) => new URL(u).pathname === '/');
if (home) await homeChecks(home);
await browser.close();
for (const p of problems) console.error(p);
process.exit(problems.length ? 1 : 0);

async function homeChecks(url) {
  const fail = (msg) => problems.push(`${url}: ${msg}`);
  const wait = () => new Promise((r) => setTimeout(r, 400));
  // Share round trip: change row 1's quantity, Calculate (the URL now carries ?load=), open that URL in a new page.
  let page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await page.goto(url, { waitUntil: 'networkidle0' });
  const qty = await page.$eval('.wl-load-row [data-k="qty"]', (q) => { q.value = String(Number(q.value) + 2); q.dispatchEvent(new Event('input', { bubbles: true })); return q.value; });
  await page.$eval('form[data-wl-tool] button[type="submit"]', (b) => b.click());
  await wait();
  const shared = page.url();
  const want = await page.$eval('.wl-results', (el) => el.innerText.trim());
  await page.close();
  page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  const res = await page.goto(shared, { waitUntil: 'networkidle0' });
  if (!shared.includes('?load=')) fail('Calculate did not put ?load= in the address');
  if (res.request().redirectChain().length) fail(`share link ${shared} redirects`);
  const got = await page.$eval('.wl-load-row [data-k="qty"]', (q) => q.value);
  if (got !== qty || (await page.$eval('.wl-results', (el) => el.innerText.trim())) !== want) fail(`share link did not restore the plan (qty ${got}, want ${qty})`);
  await page.close();
  // Error layout on desktop: the inputs keep their box and a real mouse click on the button submits.
  for (const [width, height] of [[1366, 768], [1920, 1080]]) {
    page = await browser.newPage();
    await page.setViewport({ width, height });
    await page.goto(url, { waitUntil: 'networkidle0' });
    const box = () => page.$eval('.wl-tool-split > .wl-in', (el) => { const r = el.getBoundingClientRect(); return `${Math.round(r.x)}/${Math.round(r.width)}`; });
    const before = await box();
    const field = await page.$('.wl-load-row [data-k="watts"]');
    await field.click({ clickCount: 3 });
    await field.type('abc');
    await page.keyboard.press('Tab');
    await wait();
    const after = await box();
    if (after !== before) fail(`at ${width} px an error moves the inputs (${before} -> ${after})`);
    await page.$eval('form[data-wl-tool]', (f) => f.addEventListener('submit', () => { f.dataset.sent = '1'; }));
    await page.click('form[data-wl-tool] button[type="submit"]');
    await wait();
    if (!(await page.$eval('form[data-wl-tool]', (f) => f.dataset.sent))) fail(`at ${width} px the first click on the button after an error does not submit`);
    if ((await page.evaluate(() => document.activeElement?.dataset.k)) !== 'watts') fail(`at ${width} px the error does not focus the field`);
    await page.close();
  }
  console.log(url, 'home share + error layout', 'checked');
}
