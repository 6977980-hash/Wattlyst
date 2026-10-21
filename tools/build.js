// Build step: turns specs/keyword-map.csv, specs/site-pages.csv, content/ and data/ into generated/,
// running the engine for every number. PHP only reads generated/ and never computes anything, so the
// server-rendered page, the live calculator, meta, schema and llms.txt cannot disagree.
//
//   node tools/build.js          write generated/
//   node tools/build.js --check  exit 1 if generated/ is out of date (CI and npm test)
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseCsv } from './lib/csv.js';
import { stripJs, stampImports, staticImports } from './lib/strip.js';
import { createHash } from 'node:crypto';
import { billIndex, solarTracker, embedList } from './lib/datasets.js';
import { adsConfig, leadsConfig, affiliatesByPage } from './lib/monetize.js';
import { render, fmt, placeholders, isSpec, lookup } from '../engine/format.js';
import { errorMessage, noticeCode, EXACT, NOTICES } from '../engine/message-text.js';
import { lakhRs, marketRs, roughHours } from '../engine/approx.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

const ENGINE_MODULES = ['conversions', 'battery', 'sizing', 'solar', 'bill', 'load', 'wiring', 'planner', 'prices', 'forecast', 'fuel', 'solartools', 'acbill', 'sanction', 'seasonal', 'circuits', 'backup', 'decision', 'offgrid'];
/** Data each engine module needs in the browser (keeps page weight down). Appliances are added per page, only the ones its fields use. */
const MODULE_DATA = { bill: ['tariff'], solar: ['cities'], wiring: ['cables'], planner: ['tariff', 'cities'], prices: ['solar_prices'], forecast: ['cities'], acbill: ['tariff'], sanction: ['cables'], seasonal: ['cities'], offgrid: ['cities'], circuits: ['cables'], backup: ['cities', 'solar_prices', 'generator_fuel', 'component_prices', 'backup_prices'], decision: ['tariff', 'cities', 'solar_prices', 'generator_fuel', 'component_prices', 'backup_prices'] };
/** Extra data a single calculator needs (shipped only on its page). */
const CALC_DATA = { generator_fuel: ['generator_fuel'], quote_checker: ['component_prices', 'backup_prices'] };

// WL-226: the browser gets only the exact-code message texts its page can show. A code is kept when its name appears
// in the page module's import chain or the tool script (a literal code or a notice flag), or when it is a generic
// code (<input>_required ...) for an input name that chain reads. A superset is harmless; a missing text would fall
// back to the generic message, which tests/messages.test.js rules out for every error the calculators produce.
const GENERIC_CODE = /^(\w+?)_(required|invalid|must_be_positive|too_small|too_large|out_of_range)$/;
/** Credit line for a page with a live data feed: content `credit` {by, by_url, licence, licence_url} (WL-240). */
function creditOf(c, fail) {
  const k = c.credit || {};
  for (const f of ['by', 'licence']) if (!k[f]) fail(`${c.id}: live data needs credit.${f} (data licence attribution)`);
  for (const f of ['by_url', 'licence_url']) if (!/^https:\/\//.test(k[f] || '')) fail(`${c.id}: credit.${f} must be an https URL`);
  return { by: k.by, by_url: k.by_url, licence: k.licence, licence_url: k.licence_url };
}

function pageTexts(module) {
  const seen = new Set();
  const walk = (f) => { if (seen.has(f)) return; seen.add(f); for (const d of staticImports(read(`engine/${f}`))) walk(d.replace('./', '')); };
  walk(`${module}.js`);
  const src = [...seen].map((f) => read(`engine/${f}`)).join('\n') + read('assets/js/wattlyst-tool.js');
  const mapped = Object.entries(NOTICES).filter(([k, v]) => v !== 1 && src.includes(k)).map(([, v]) => v);
  if (src.includes('above_standard_sizes')) mapped.push('above_standard_sizes', 'generator_above_standard_sizes'); // noticeCode picks one
  return Object.fromEntries(Object.entries(EXACT).filter(([code]) => {
    const g = GENERIC_CODE.exec(code);
    return src.includes(code) || mapped.includes(code) || (g && [`'${g[1]}'`, `"${g[1]}"`].some((q) => src.includes(q)));
  }));
}
/** Appliance fields the browser engine and the loads picker need. */
const APPLIANCE_KEYS = ['name', 'running_w', 'starting_w', 'typical_hours_per_day', 'avg_w', 'avg_w_range', 'load_type'];

export async function loadInputs() {
  const site = readJson('data/site.json');
  const { _meta: citiesMeta, ...cities } = readJson('data/cities-pk.json');
  const appliances = readJson('data/appliances.json');
  const cables = readJson('data/cable-ampacity.json');
  const solarPrices = readJson('data/solar-prices.json');
  const inverterCodes = readJson('data/inverter-codes.json');
  const data = { defaults: readJson('data/defaults.json'), tariff: readJson('data/tariff-pk-2026.json'), cities, appliances: Object.fromEntries(appliances.items.map((a) => [a.id, a])), cables, solar_prices: solarPrices, generator_fuel: readJson('data/generator-fuel.json'), load_profiles: readJson('data/load-profiles.json').profiles,
    bill_index: readJson('data/bill-index.json'), component_prices: readJson('data/component-prices.json'), backup_prices: readJson('data/backup-prices.json'), solar_price_history: readJson('data/solar-price-history.json') };
  // One source for the FPA (audit WL-13): the newest NEPRA-verified month of the Bill Index. Pages that pre-fill
  // an FPA read data.fpa_latest; data/tariff-pk-2026.json keeps no copy.
  data.fpa_latest = data.bill_index.months.find((m) => m.fpa_verified === true) || null;
  // The newest Bill Index month, when its FPA is only reported in the news, is named next to the verified rate (WL-115).
  const newest = data.bill_index.months[0];
  // lead: the newest month first, so F14 opens with this month's bills, not the verified month (WL-158).
  data.fpa_newest = { ...newest, lead: `${newest.label} bills carry ${fmt(newest.fpa_per_unit, 'rs2')} per unit for ${newest.fpa_for}${newest.fpa_verified ? ', as NEPRA decided' : ', reported in the news'}.`, note: newest === data.fpa_latest ? `${newest.label} bills use this rate.` : `${newest.label} bills carry ${fmt(newest.fpa_per_unit, "rs2")} per unit for ${newest.fpa_for}, reported in the news; this page keeps the latest NEPRA-verified rate until that decision is published.` };
  // Fuel price day as page text ("21 October 2026"), from the ISO date in data (WL-159).
  for (const k of ['petrol', 'diesel']) { const pr = data.generator_fuel.prices[k]; pr.effective_text = longDate(pr.effective); }
  // One source for the 1.5 ton AC figures (audit WL-107): the planning defaults N10 and the page text read are
  // copied from the appliance records in data/appliances.json, not kept a second time in data/defaults.json.
  data.defaults.ac_inverter_avg_kw_1_5_ton = data.appliances['ac-split-1-5ton-inverter'].avg_w / 1000;
  data.defaults.ac_noninverter_kw_1_5_ton = data.appliances['ac-split-1-5ton-non-inverter'].running_w / 1000;
  const modules = {};
  for (const m of ENGINE_MODULES) modules[m] = await import(pathToFileURL(join(root, 'engine', `${m}.js`)).href);
  const keywordRows = parseCsv(read('specs/keyword-map.csv'));
  const siteRows = parseCsv(read('specs/site-pages.csv'));
  const content = {};
  for (const f of readdirSync(join(root, 'content/pages')).filter((x) => x.endsWith('.json')).sort()) {
    const c = readJson(`content/pages/${f}`);
    content[c.id] = c;
  }
  const labelsUr = readJson('content/labels-ur.json');
  const trustHtml = {};
  for (const f of readdirSync(join(root, 'content/trust')).filter((x) => x.endsWith('.html')).sort()) {
    trustHtml[f.replace(/\.html$/, '')] = read(`content/trust/${f}`);
  }
  const affiliates = readJson('data/affiliates.json');
  const leadForm = readJson('content/lead-form.json');
  return { site, data, citiesMeta, appliances, cables, solarPrices, inverterCodes, labelsUr, modules, keywordRows, siteRows, content, trustHtml, affiliates, leadForm };
}

// Page dates (audit WL-206): generated/page-dates.json keeps, per page, a hash of what the page shows and the day
// that hash last changed. The build reuses the stored day while the hash is unchanged, so build.js --check stays
// deterministic; a page whose text or numbers change gets the build day. A page with no entry yet starts from
// its own review date. WATTLYST_TODAY (YYYY-MM-DD) pins the build day for tests.
export const PAGE_DATES = 'generated/page-dates.json';
export function changedOn(prev, hash, baseline, today) {
  if (prev && prev.hash === hash) return prev.date;
  return prev ? today : baseline || today;
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const buildDay = () => process.env.WATTLYST_TODAY || new Date().toISOString().slice(0, 10);
const newest = (...d) => d.filter(Boolean).sort().at(-1);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function typeOf(row) {
  if (row.type) return row.type;
  if (row.url === '/') return 'home';
  if (row.url === '/appliances/') return 'pillar';
  if (row.url.startsWith('/appliances/')) return 'appliance';
  if (row.url.startsWith('/guides/')) return 'guide';
  return 'tool';
}

function fail(msg) {
  throw new Error(`build: ${msg}`);
}

/** Resolve "@key" (data/defaults.json), "@appliance.key" and "@data.tariff.unprotected.3.rate" in field defaults and example inputs. */
function resolveDefault(v, ctx) {
  if (typeof v !== 'string' || !v.startsWith('@')) return v;
  const path = v.slice(1);
  const val = path.startsWith('appliance.') ? ctx.appliance?.[path.slice(10)]
    : path.startsWith('data.') ? lookup(ctx.data, path.slice(5))
    : ctx.data.defaults[path];
  if (val === undefined) fail(`${ctx.id}: default ${v} not found`);
  return val;
}

const title = (s) => String(s).replace(/\b\w/g, (m) => m.toUpperCase());

/** Expand a field's option list: literal [[value, label]], or options_from "cities" | "qta_periods" | "appliances". */
function fieldOptions(f, ctx) {
  if (f.options_from === 'cities') return Object.keys(ctx.data.cities).map((c) => [c, title(c)]);
  if (f.options_from === 'qta_periods') {
    return Object.keys(ctx.data.tariff.addons_secondary?.qta_per_unit || {}).filter((k) => /^\d{4}-\d{2}\.\.\d{4}-\d{2}$/.test(k)).map((k) => [k, `${k.replace('..', ' to ')}`]);
  }
  if (f.type === 'appliance') {
    const ids = f.options || [];
    const opts = ids.map((id) => {
      const a = ctx.data.appliances[id];
      if (!a) fail(`${ctx.id}: field ${f.name} lists unknown appliance ${id}`);
      return [id, a.name];
    });
    if (f.custom) opts.push(['custom', f.custom === true ? 'Custom (enter watts)' : f.custom]);
    return opts;
  }
  return (f.options || []).map(([v, l]) => [resolveDefault(v, ctx), l]);
}

/** Trimmed appliance records the page needs in the browser (its selects and loads picker). */
function pageAppliances(fields, ctx) {
  const ids = new Set();
  for (const f of fields) {
    if (f.type === 'appliance') for (const [v] of f.options) if (v !== 'custom') ids.add(v);
    if (f.type === 'loads') for (const a of f.catalog) ids.add(a.id);
    if (f.name === 'idle_w') ids.add('ups-idle'); // battery_runtime/battery_bank default (formulas.md B, WL-120)
  }
  const out = {};
  for (const id of ids) out[id] = Object.fromEntries(APPLIANCE_KEYS.filter((k) => ctx.data.appliances[id][k] !== undefined).map((k) => [k, ctx.data.appliances[id][k]]));
  return out;
}

function findModule(modules, calc) {
  for (const [name, mod] of Object.entries(modules)) if (typeof mod[calc] === 'function') return name;
  return null;
}

function runCalc(ctx, inputs, what) {
  const fn = ctx.modules[ctx.module][ctx.calc];
  const out = fn(inputs, ctx.data);
  if (!out.ok) fail(`${ctx.id}: ${what} gives error ${out.error} (${errorMessage(out.error)})`);
  return out;
}

/** Build-only formats for page text (engine/approx.js, WL-150): market prices and rough runtimes. The browser never sees them. */
const APPROX = { rsm: marketRs, lakh: lakhRs, hm5: roughHours };
const APPROX_RE = /\{\{\s*([\w.-]+)\s*\|\s*(rsm|lakh|hm5)\s*\}\}/g;

function text(ctx, tpl, scope, what, { links = false } = {}) {
  if (tpl === undefined || tpl === null || tpl === '') return '';
  if (!links && /\[\[/.test(tpl)) fail(`${ctx.id}: ${what} cannot carry a [[ID|anchor]] link (only section paragraphs, worked examples and FAQ answers can)`);
  tpl = String(tpl).replace(APPROX_RE, (_, path, spec) => {
    const s = APPROX[spec](lookup(scope, path));
    if (s === '') fail(`${ctx.id}: ${what} has no usable value for {{${path}|${spec}}}`);
    return s;
  });
  for (const p of placeholders(tpl)) if (!isSpec(p.spec)) fail(`${ctx.id}: ${what} uses unknown format "${p.spec}" in {{${p.path}|${p.spec}}}`);
  const s = render(tpl, scope);
  if (s === null) fail(`${ctx.id}: ${what} has a placeholder with no value: ${tpl}`);
  return s;
}

const LINK = /\[\[([\w-]+)\|([^\]|]+)\]\]/g;

/**
 * In-text links (WL-140): "[[D11|net billing guide]]" in a paragraph, worked example or FAQ answer. The build keeps
 * the text the reader sees (the anchor alone, also used in FAQ schema) and lists each link as { t: anchor, u: URL };
 * the PHP links the first unlinked match of each anchor in order (Wattlyst_Render::linked, wp_kses with <a href> only).
 * The build fails on an unknown ID, a page that is not live, or a link to the page itself.
 */
function linked(ctx, s, what) {
  const l = [];
  const t = s.replace(LINK, (_, id, anchor) => {
    const row = ctx.allRows.find((r) => r.id === id);
    if (!row) fail(`${ctx.id}: ${what} links to unknown page ${id}`);
    if (!row.live) fail(`${ctx.id}: ${what} links to ${id}, which is not live`);
    if (id === ctx.id) fail(`${ctx.id}: ${what} links to itself`);
    l.push({ t: anchor, u: row.url });
    return anchor;
  });
  if (/\[\[|\]\]/.test(t)) fail(`${ctx.id}: ${what} has a broken [[ID|anchor]] link: ${s}`);
  return { t, l };
}

/** Rendered text plus its links: { [key]: text, l: [...] } (no l when the text has no link). */
function withLinks(ctx, tpl, scope, what, key) {
  const { t, l } = linked(ctx, text(ctx, tpl, scope, what, { links: true }), what);
  return { [key]: t, ...(l.length ? { l } : {}) };
}

/** Build the rendered content of one page. Every number comes from the engine or data/. */
function buildContent(c, ctx) {
  const out = { intro: '', sections: [], faq: [], key_facts: [], mistakes: [], sources: c.sources || [] };
  // pg.<ID>.out: another page's default result, for hub text (built before the hubs, WL-142).
  const scope = { d: ctx.data.defaults, a: ctx.data.appliances, site: ctx.site, appliance: ctx.appliance, data: ctx.data, pg: ctx.results || {} };
  if (c.calc) {
    const module = findModule(ctx.modules, c.calc);
    if (!module) fail(`${c.id}: unknown calc ${c.calc}`);
    Object.assign(ctx, { calc: c.calc, module });
    const fields = (c.fields || []).map((f) => {
      const out = { ...f, default: resolveDefault(f.default, ctx) };
      // {{data.…}} / {{d.…}} placeholders in hints and placeholders; a hint may carry [[ID|anchor]] links (WL-162: the ToU bill).
      if (f.hint) Object.assign(out, withLinks(ctx, f.hint, scope, `field ${f.name} hint`, 'hint'));
      if (f.placeholder) out.placeholder = text(ctx, f.placeholder, scope, `field ${f.name} placeholder`);
      if (f.options || f.options_from || f.type === 'appliance') out.options = fieldOptions(f, ctx);
      if (f.type === 'loads') {
        const ids = f.catalog === 'all' ? ctx.appliances.items.map((a) => a.id) : f.catalog || [];
        out.catalog = ids.map((id) => {
          const a = ctx.data.appliances[id];
          if (!a) fail(`${ctx.id}: loads catalog lists unknown appliance ${id}`);
          return { id, name: a.name, category: a.category };
        });
        for (const row of out.default || []) if (row.id && row.id !== 'custom' && !ctx.data.appliances[row.id]) fail(`${ctx.id}: default row uses unknown appliance ${row.id}`);
      }
      if (out.options && out.default !== undefined && !out.options.some(([v]) => String(v) === String(out.default))) fail(`${ctx.id}: field ${f.name} default ${out.default} is not one of its options`);
      return out;
    });
    // The live templates are rendered again in the browser, which has no build-only format.
    if (APPROX_RE.test([c.how, c.how_ur, c.result_table?.caption].join(' '))) fail(`${c.id}: the how text or result table caption uses a build-only format (rsm, lakh, hm5)`);
    APPROX_RE.lastIndex = 0;
    const defaults = Object.fromEntries(fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default]));
    const fixed = c.fixed_inputs || {};
    const inputs = { ...fixed, ...defaults };
    const result = runCalc(ctx, inputs, 'default inputs');
    scope.in = result;
    scope.out = result;
    scope.ex = (c.examples || []).map((ex, n) => {
      const exIn = { ...inputs, ...Object.fromEntries(Object.entries(ex.inputs || {}).map(([k, v]) => [k, resolveDefault(v, ctx)])) };
      const r = runCalc(ctx, exIn, `example ${n + 1}`);
      return { in: r, out: r };
    });
    // Table rows run once; captions and page text can name a row's inputs as {{table.N.in.x}} (audit WL-23).
    // A row's `label` names it in the table's first column (WL-239); it is page text, not an input.
    scope.table = (c.table?.rows || []).map(({ label, ...r }, n) => {
      const res = runCalc(ctx, { ...inputs, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, resolveDefault(v, ctx)])) }, `table row ${n + 1}`);
      return { in: res, out: res };
    });
    // WL-182: a sizing page names the dated price range of its default system, built here ({{px.out.price_low_rs|rsm}}) by the
    // D14 calculator on the page's own result; the browser never re-renders it.
    if (c.price_of) {
      const r = ctx.modules.prices.solar_price_estimate({ kwp: result[c.price_of.kwp], type: c.price_of.type }, ctx.data);
      if (!r.ok) fail(`${c.id}: price_of gives error ${r.error}`);
      scope.px = { out: r, checked: longDate(ctx.solarPrices._meta.checked) };
    }
    out.tool = {
      calc: c.calc,
      module: `${module}.js`,
      data_keys: [...(MODULE_DATA[module] || []), ...(CALC_DATA[c.calc] || [])],
      appliances: pageAppliances(fields, ctx),
      fields,
      fixed_inputs: fixed,
      outputs: (c.outputs || []).map((o) => {
        if (o.spec && !isSpec(o.spec)) fail(`${c.id}: output ${o.key} uses unknown format ${o.spec}`);
        const v = result[o.key];
        // Roman Urdu label: the page's own label_ur, else the shared glossary content/labels-ur.json.
        const label_ur = o.label_ur || ctx.labelsUr[o.label];
        const ur = label_ur ? { label_ur } : {};
        // An optional result (N1 spike without last year's units, the next slab above the top band) may be absent: its card starts hidden.
        if (o.optional && v === undefined) return { ...o, ...ur, value: '' };
        if (typeof v !== 'number' && typeof v !== 'string' && typeof v !== 'boolean') fail(`${c.id}: output ${o.key} missing from ${c.calc}`);
        if (typeof v === 'boolean' && o.spec !== 'yesno') fail(`${c.id}: output ${o.key} is a flag and needs the yesno format`);
        return { ...o, ...ur, value: fmt(v, o.spec || '2') };
      }),
      how: c.how ? { tpl: c.how, text: text(ctx, c.how, scope, 'how'), ...(c.how_ur ? { tpl_ur: c.how_ur, text_ur: text(ctx, c.how_ur, scope, 'how_ur') } : {}) } : null,
      submit: c.submit || 'Calculate',
      ...(c.diagram ? { diagram: c.diagram } : {}),
      ...(c.result_table ? { rtable: resultTable(ctx, c, result, scope) } : {}),
      ...(c.live ? { live: c.live } : {}),
      // A live data feed under an attribution licence prints its credit next to the result (Open-Meteo CC BY 4.0, WL-240).
      ...(c.live ? { credit: creditOf(c, fail) } : {}),
      notice: noticeCode(result) ? errorMessage(noticeCode(result)) : '',
      msg: pageTexts(module),
      data_checked: dataChecked(module, { ...ctx, usesAppliances: fields.some((f) => f.type === 'appliance' || f.type === 'loads') }),
    };
    out.examples = (c.examples || []).map((ex, n) => ({
      title: text(ctx, ex.title, { ...scope, ...scope.ex[n] }, `example ${n + 1} title`),
      ...withLinks(ctx, ex.text, { ...scope, ...scope.ex[n] }, `example ${n + 1}`, 'text'),
    }));
    if (c.table) {
      const rows = scope.table.map((res, n) => c.table.columns.map((col) => text(ctx, col.tpl, { ...scope, ...res }, `table row ${n + 1}`)));
      out.table = { caption: text(ctx, c.table.caption, scope, 'table caption'), head: c.table.columns.map((col) => col.label), rows };
      if (c.table.row_head) {
        if (c.table.rows.some((r) => typeof r.label !== 'string' || !r.label)) fail(`${c.id}: table has row_head, so every row needs a label`);
        Object.assign(out.table, { head: [c.table.row_head, ...out.table.head], rows: rows.map((r, n) => [c.table.rows[n].label, ...r]), row_head: true });
      }
    }
  }
  if (c.appliance_table) out.tables = applianceTables(ctx);
  if (c.dataset) {
    const make = { bill_index: billIndex, solar_tracker: solarTracker }[c.dataset];
    if (!make) fail(`${c.id}: unknown dataset ${c.dataset}`);
    const ds = make(ctx, fail);
    scope.ds = ds.scope;
    out.tables = ds.tables;
    out.chart = ds.chart;
    out.download = { url: `/data/${ds.csv_name}`, label: 'Download the data (CSV)', checked: ds.checked, license: ds.license };
    out.sources = [...out.sources, ...ds.sources];
    ctx.dataset = { csv: ds.csv, csv_name: ds.csv_name, temporal: ds.temporal, measured: ds.measured, license: ds.license, checked: ds.checked };
  }
  if (c.embeds) out.embeds = embedList(ctx.allRows, ctx.site, ctx.pluginUrl, fail);
  if (c.codes_table) Object.assign(out, codeTables(ctx, out.sources));
  if (c.calc === 'quote_checker' || c.calc === 'solar_price_estimate' || c.price_of) out.sources = [...out.sources, ...priceSources(ctx)];
  if (c.calc === 'panel_price') out.sources = [...out.sources, ...priceSources(ctx, { panelsOnly: true })];
  if (c.calc === 'generator_fuel') out.sources = [...out.sources, ...fuelSources(ctx)];
  if (c.calc === 'backup_compare') out.sources = [...out.sources, ...backupSources(ctx)];
  out.answer = text(ctx, c.answer, scope, 'answer');
  out.intro = text(ctx, c.intro, scope, 'intro');
  // A hub may repeat a key fact of one of its pages ({ "from": "B1", "n": 0 }), so the number is that page's engine result (WL-142).
  out.key_facts = (c.key_facts || []).map((k, n) => {
    if (typeof k === 'string') return text(ctx, k, scope, `key fact ${n + 1}`);
    const src = ctx.built?.[k.from]?.key_facts?.[k.n];
    if (!src) fail(`${c.id}: key fact ${n + 1} takes key fact ${k.n} of ${k.from}, which has none (pages are built before hubs)`);
    return src;
  });
  out.sections = (c.sections || []).map((s, n) => {
    const ps = (s.p || []).map((p) => withLinks(ctx, p, scope, `section ${n + 1}`, 't'));
    return { h2: text(ctx, s.h2, scope, `section ${n + 1} heading`), p: ps.map((x) => x.t), ...(ps.some((x) => x.l) ? { l: ps.map((x) => x.l || []) } : {}) };
  });
  out.formula = c.formula ? { text: text(ctx, c.formula.text, scope, 'formula'), lines: c.formula.lines || [] } : null;
  out.mistakes = (c.mistakes || []).map((m, n) => text(ctx, m, scope, `mistake ${n + 1}`));
  out.safety = text(ctx, c.safety, scope, 'safety');
  out.faq = (c.faq || []).map((f, n) => ({ q: text(ctx, f.q, scope, `faq ${n + 1} q`), ...withLinks(ctx, f.a, scope, `faq ${n + 1} a`, 'a') }));
  if (scope.out && ctx.results) ctx.results[c.id] = { out: scope.out };
  ctx.scope = scope; // the page's title/meta may carry the same placeholders (SERP idea 4, seo-rules.md 2)
  return out;
}

/**
 * Result table (N17 months, N18 circuits): one row per item of an array the engine returns, columns formatted with
 * the same specs as the result cards; the browser redraws it from the engine on every calculation (wattlyst-extra.js drawTable).
 */
function resultTable(ctx, c, result, scope) {
  const t = c.result_table;
  const list = result[t.key];
  if (!Array.isArray(list) || !list.length) fail(`${c.id}: result_table key ${t.key} is not a list in ${c.calc}`);
  for (const col of t.columns) {
    if (col.spec && !isSpec(col.spec)) fail(`${c.id}: result_table column ${col.key} uses unknown format ${col.spec}`);
    if (!(col.key in list[0])) fail(`${c.id}: result_table column ${col.key} missing from ${c.calc} rows`);
  }
  const columns = t.columns.map((col) => ({ key: col.key, label: col.label, spec: col.spec || '2', ...(col.suffix ? { suffix: col.suffix } : {}) }));
  return { key: t.key, caption: text(ctx, t.caption, scope, 'result table caption'), cap: t.caption, columns, rows: list.map((r) => columns.map((col) => `${fmt(r[col.key], col.spec)}${col.suffix || ''}`)) };
}

/** H2: one table per category of data/appliances.json, units per hour and per typical day from the engine (conversions.units). */
function applianceTables(ctx) {
  const units = ctx.modules.conversions.units;
  const cats = [...new Set(ctx.appliances.items.map((a) => a.category))];
  return cats.map((cat) => {
    const rows = ctx.appliances.items.filter((a) => a.category === cat).map((a) => {
      const perHour = units({ watts: a.running_w, hours: 1 }, ctx.data);
      const perDay = units({ watts: a.running_w, hours: a.typical_hours_per_day }, ctx.data);
      if (!perHour.ok || !perDay.ok) fail(`appliance table: ${a.id} gives ${perHour.error || perDay.error}`);
      return [a.name, `${fmt(a.running_w, 'int')} W`, `${fmt(a.starting_w, 'int')} W`, fmt(perHour.units, '3'), `${fmt(a.typical_hours_per_day, '1')} h`, fmt(perDay.units, '2')];
    });
    return { caption: `${title(cat.replace(/-/g, ' '))} appliances: watts and units`, head: ['Appliance', 'Running watts', 'Starting watts', 'Units per hour', 'Typical hours a day', 'Units per day'], rows };
  });
}

/** N2: one table per brand from data/inverter-codes.json (manufacturer manuals), filtered in the browser by brand and code text. */
function codeTables(ctx, sources) {
  const brands = ctx.inverterCodes.brands;
  const tables = brands.map((b) => ({
    key: b.id,
    label: b.name,
    // Short H2; the full name and the model scope go in the line under it (WL-210).
    caption: `${b.heading} error codes`,
    note: `${b.name}. Models: ${b.models}`,
    head: ['Code', 'Meaning', 'Likely cause', 'What to do', 'Call installer?'],
    rows: b.codes.map((x) => [x.code, x.meaning, x.causes, x.action, x.call_installer ? 'Yes' : 'Usually not']),
  }));
  for (const b of brands) sources.push({ label: `${b.name}: ${b.codes[0]?.source_ref?.split(',')[0] || 'manufacturer manual'}`, url: b.manual_url });
  return { tables, lookup: { label: 'Brand', text_label: 'Error code or word', checked: ctx.inverterCodes._meta.checked, count: brands.reduce((n, b) => n + b.codes.length, 0) } };
}

/** N3 / D14: every price source behind data/solar-prices.json (systems in use and panel prices), once per URL. */
function priceSources(ctx, { panelsOnly = false } = {}) {
  const seen = new Map();
  const add = (s) => {
    if (s.url && !seen.has(s.url)) seen.set(s.url, { label: `${s.publisher}, ${String(s.date).split(/ \(|;/)[0]} (price data)`, url: s.url });
  };
  if (!panelsOnly) for (const r of ctx.solarPrices.systems) for (const s of r.sources || []) add(s);
  for (const s of ctx.solarPrices.panel_rs_per_w.sources || []) add(s);
  return [...seen.values()];
}

/** Browser copy of data/generator-fuel.json: the curve and price per fuel, which is all engine/fuel.js reads. */
function browserFuel(f) {
  const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
  return {
    fuels: Object.fromEntries(Object.entries(f.fuels).map(([k, v]) => [k, pick(v, ['intercept_l_per_h_per_kw_rated', 'slope_l_per_kwh'])])),
    prices: Object.fromEntries(Object.entries(f.prices).filter(([, v]) => v && typeof v === 'object' && 'rs_per_litre' in v).map(([k, v]) => [k, { rs_per_litre: v.rs_per_litre }])),
  };
}

/** Browser copy of data/backup-prices.json: every number engine/backup.js reads, no sources or notes. */
// Data the engine never reads: notes, sources (incl. *_note, *_source) and verification flags (data/ keeps them for the pages and reviewers).
const LEAN_DROP = new Set(['_meta', 'note', 'notes', 'source', 'sources', 'source_url', 'verified', 'excludes']);
function lean(o) {
  if (Array.isArray(o)) return o.map(lean);
  if (!o || typeof o !== 'object') return o;
  return Object.fromEntries(Object.entries(o).filter(([k]) => !LEAN_DROP.has(k) && !/_(note|source)$/.test(k)).map(([k, v]) => [k, lean(v)]));
}

function browserBackup(b) {
  const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !['label', 'sources', 'note', 'charger_sources'].includes(k) && !/_note$/.test(k)));
  return { ups: b.ups.map(strip), generators: b.generators.map(strip), generator_upkeep: strip(b.generator_upkeep), tubular_unit: strip(b.tubular_unit), lithium_pack: strip(b.lithium_pack), battery_life_years: strip(b.battery_life_years) };
}

/** N7: the retailer pages and manuals behind the UPS, generator and battery figures, once per URL. */
function backupSources(ctx) {
  const b = ctx.data.backup_prices;
  const seen = new Map();
  // Each source names what it supports and its date, so two pages from one shop read differently (WL-151).
  const add = (s, what) => {
    if (!s.url) return;
    if (!seen.has(s.url)) seen.set(s.url, { s, what: [] });
    if (!seen.get(s.url).what.includes(what)) seen.get(s.url).what.push(what);
  };
  const name = (it) => it.label.replace(/ \([^()]*\)$/, '');
  for (const it of [...b.ups, ...b.generators]) for (const s of it.sources || []) add(s, name(it));
  for (const s of b.generator_upkeep.sources || []) add(s, 'generator oil and service interval');
  for (const s of b.battery_life_years.sources || []) add(s, 'battery life');
  for (const it of ctx.data.component_prices.items.filter((x) => ['tubular_battery', 'lithium_battery', 'hybrid_inverter'].includes(x.category))) for (const s of it.sources || []) add(s, name(it));
  const when = (d) => String(d || 'undated').split(/;| \(/)[0];
  // A product page quotes one model ("Knox Krypton 4kW PV5600: Rs. 97,000"): name the model, not the price row.
  const product = (s, what) => (what.length === 1 && /^[^:]{3,60}:\s*Rs/.test(s.quote || '') ? s.quote.split(':')[0].trim() : what.join('; '));
  return [...seen.values()].map(({ s, what }) => ({ label: `${s.publisher}: ${product(s, what)} (${when(s.date)})`, url: s.url }));
}

/** C8: the generator data behind the fuel curve and the fuel price, once per URL. */
function fuelSources(ctx) {
  const f = ctx.data.generator_fuel;
  const seen = new Map();
  for (const fuel of Object.values(f.fuels)) for (const p of fuel.points) if (!seen.has(p.source_url)) seen.set(p.source_url, { label: `${p.source}: ${p.model}`, url: p.source_url });
  return [...seen.values()];
}

/** "Last checked" lines for the data a tool depends on, so a data refresh re-dates the page. */
function dataChecked(module, ctx) {
  const out = [];
  if (module === 'bill' || module === 'acbill') out.push({ label: 'Pakistan electricity tariff (NEPRA notification)', url: ctx.data.tariff._meta.source_url || null, checked: ctx.data.tariff._meta.checked });
  const prices = module === 'prices';
  if (module === 'solar' || module === 'solartools' || module === 'forecast') out.push({ label: 'Peak sun hours by city (Global Solar Atlas)', url: 'https://globalsolaratlas.info/', checked: ctx.citiesMeta.checked });
  if (module === 'seasonal') out.push({ label: 'Monthly solar output by city (Global Solar Atlas PVOUT)', url: 'https://globalsolaratlas.info/', checked: ctx.citiesMeta.pvout_month_checked });
  if (ctx.calc === 'heating_cost') {
    out.push({ label: 'Pakistan electricity tariff (NEPRA notification)', url: ctx.data.tariff._meta.source_url || null, checked: ctx.data.tariff._meta.checked });
    const g = ctx.data.tariff.gas_domestic;
    out.push({ label: `Domestic gas slab prices (${g.source}; not yet matched to the OGRA notification)`, url: g.source_url, checked: g.checked });
  } else if (module === 'wiring' || module === 'load' || module === 'circuits') out.push({ label: 'Cable ampacity table (IEC 60364-5-52 Table B.52.4, PVC copper)', url: 'https://webstore.iec.ch/en/publication/1878', checked: ctx.cables._meta.checked });
  if (module === 'decision') {
    // The home page has no Sources list: each price set links to the page that lists its sources.
    const at = (id) => `${ctx.site.url.replace(/\/$/, '')}${ctx.allRows.find((r) => r.id === id).url}`;
    const f = ctx.data.generator_fuel;
    out.push({ label: 'Pakistan electricity tariff (NEPRA notification)', url: ctx.data.tariff._meta.source_url || null, checked: ctx.data.tariff._meta.checked });
    out.push({ label: 'Peak sun hours by city (Global Solar Atlas)', url: 'https://globalsolaratlas.info/', checked: ctx.citiesMeta.checked });
    out.push({ label: 'Installed solar system prices (Pakistan solar price tracker)', url: at('solar-price-tracker'), checked: ctx.solarPrices._meta.checked });
    out.push({ label: 'Battery and inverter prices (Pakistan solar price tracker)', url: at('solar-price-tracker'), checked: ctx.data.component_prices._meta.checked });
    out.push({ label: 'UPS and generator prices and upkeep (sources on the UPS vs solar vs generator cost page)', url: at('N7'), checked: ctx.data.backup_prices._meta.checked });
    out.push({ label: `Petrol price (${f.prices.source})`, url: f.prices.source_url, checked: f.prices.checked });
  }
  if (module === 'backup') {
    const f = ctx.data.generator_fuel;
    out.push({ label: 'UPS, generator and battery prices in Pakistan (retailer listings, each listed under Sources on this page)', url: null, checked: ctx.data.backup_prices._meta.checked });
    out.push({ label: 'Hybrid inverter, battery and panel prices (Wattlyst solar price tracker)', url: null, checked: ctx.data.component_prices._meta.checked });
    out.push({ label: `Petrol price (${f.prices.source})`, url: f.prices.source_url, checked: f.prices.checked });
    out.push({ label: 'Pakistan electricity tariff (NEPRA notification)', url: ctx.data.tariff._meta.source_url || null, checked: ctx.data.tariff._meta.checked });
  }
  if (ctx.calc === 'generator_fuel') {
    const f = ctx.data.generator_fuel;
    out.push({ label: 'Generator fuel curve (fitted from manufacturer run-time data, listed under Sources)', url: null, checked: f._meta.checked });
    out.push({ label: `Petrol and diesel price (${f.prices.source})`, url: f.prices.source_url, checked: f.prices.checked });
  }
  if (prices && ctx.calc === 'panel_price') out.push({ label: 'Solar panel prices in Pakistan (dealer price lists and news reports, each listed under Sources on this page)', url: null, checked: ctx.solarPrices._meta.checked });
  else if (prices) out.push({ label: 'Typical solar system prices in Pakistan (installer price lists and news reports, each listed under Sources on this page)', url: null, checked: ctx.solarPrices._meta.checked });
  if (ctx.usesAppliances) out.push({ label: 'Appliance running and starting watts (Wattlyst appliance data, sources listed on the appliance list page)', url: `${ctx.site.url.replace(/\/$/, '')}/appliances/`, checked: ctx.appliances._meta.checked });
  if (ctx.appliance) out.push({ label: `Typical wattage of ${ctx.appliance.name} (${ctx.appliance.source})`, url: ctx.appliance.source_url || null, checked: ctx.appliances._meta.checked });
  return out;
}

function person(site, id) {
  const p = site.people.find((x) => x.id === id) || site.people[0];
  // url = the person's entry on the About page (WL-209); the About people block prints the same id.
  return { '@type': 'Person', '@id': `${site.url}#/person/${p.id}`, name: p.name, url: personUrl(site, p.id), jobTitle: p.roles.join(', '), sameAs: p.same_as, worksFor: { '@id': `${site.url}#organization` } };
}

export function personUrl(site, id) {
  return `${site.url}about/#${id}`;
}

export function organizationSchema(site, pluginUrl) {
  const founder = site.people.find((p) => p.roles.includes('Founder'));
  return {
    '@type': 'Organization',
    '@id': `${site.url}#organization`,
    name: site.brand,
    url: site.url,
    slogan: site.tagline,
    logo: { '@type': 'ImageObject', url: pluginUrl + site.logo, width: 512, height: 512 },
    email: site.contact_email,
    foundingDate: String(site.founded),
    ...(founder ? { founder: { '@id': `${site.url}#/person/${founder.id}` } } : {}),
    ...(site.organization_same_as.length ? { sameAs: site.organization_same_as } : {}),
    ...(site.area_served ? { areaServed: { '@type': 'Country', name: site.area_served } } : {}),
    ...(site.languages ? { knowsLanguage: site.languages } : {}),
    contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: site.contact_email, availableLanguage: ['en'] },
  };
}

function schemaFor(page, built, ctx) {
  const { site } = ctx;
  const abs = (u) => site.url.replace(/\/$/, '') + u;
  const graph = [];
  // The home page shows no breadcrumb (WL-81), so it has no BreadcrumbList either (WL-143).
  const crumbs = page.type !== 'home';
  if (crumbs) {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': `${abs(page.url)}#breadcrumb`,
      itemListElement: page.breadcrumb.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: abs(b.url) })),
    });
  }
  const webPage = {
    '@type': page.id === 'about' ? 'AboutPage' : page.id === 'contact' ? 'ContactPage' : page.type === 'pillar' ? 'CollectionPage' : 'WebPage',
    '@id': `${abs(page.url)}#webpage`,
    url: abs(page.url),
    name: page.title,
    description: page.meta,
    inLanguage: 'en',
    isPartOf: { '@id': `${site.url}#website` },
    ...(crumbs ? { breadcrumb: { '@id': `${abs(page.url)}#breadcrumb` } } : {}),
    // lastReviewed only once the engineer has signed off (WL-214); until then the page was updated, not reviewed.
    ...(page.modified ? { dateModified: page.modified } : {}),
    ...(page.reviewed && site.reviewer.status === 'signed_off' ? { lastReviewed: page.reviewed } : {}),
    ...(site.reviewer.status === 'signed_off' && page.type !== 'trust' ? { reviewedBy: { '@id': `${site.url}#/person/reviewer` } } : {}),
    // The author box is visible on every content page, so the page names its author too (audit WL-50).
    ...(page.author && page.type !== 'trust' ? { author: { '@id': `${site.url}#/person/${page.author}` } } : {}),
  };
  graph.push(webPage);
  if (page.type === 'tool' || page.type === 'appliance' || page.type === 'lookup') {
    graph.push({
      '@type': 'WebApplication',
      '@id': `${abs(page.url)}#app`,
      name: page.h1,
      url: abs(page.url),
      description: page.meta,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Any',
      browserRequirements: 'Requires JavaScript for live results',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'PKR' },
      publisher: { '@id': `${site.url}#organization` },
    });
  }
  const needsPerson = true; // Organization.founder and Article.author point at this Person
  if (page.type === 'guide') {
    graph.push({
      '@type': 'Article',
      '@id': `${abs(page.url)}#article`,
      headline: page.h1,
      description: page.meta,
      mainEntityOfPage: { '@id': `${abs(page.url)}#webpage` },
      author: { '@id': `${site.url}#/person/${page.author}` },
      publisher: { '@id': `${site.url}#organization` },
      ...(page.published ? { datePublished: page.published } : {}),
      ...(page.modified ? { dateModified: page.modified } : {}),
      ...(site.reviewer.status === 'signed_off' ? { reviewedBy: { '@id': `${site.url}#/person/reviewer` } } : {}),
    });
  }
  if (page.type === 'data' && ctx.dataset) {
    graph.push({
      '@type': 'Dataset',
      '@id': `${abs(page.url)}#dataset`,
      name: page.h1,
      description: page.meta,
      url: abs(page.url),
      creator: { '@id': `${site.url}#organization` },
      publisher: { '@id': `${site.url}#organization` },
      license: 'https://creativecommons.org/licenses/by/4.0/',
      isAccessibleForFree: true,
      inLanguage: 'en',
      spatialCoverage: { '@type': 'Place', name: 'Pakistan' },
      temporalCoverage: ctx.dataset.temporal,
      dateModified: ctx.dataset.checked,
      variableMeasured: ctx.dataset.measured,
      distribution: [{ '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: abs(`/data/${ctx.dataset.csv_name}`) }],
    });
  }
  if (page.type === 'home') graph.push({ '@type': 'WebSite', '@id': `${site.url}#website`, url: site.url, name: site.brand, description: site.tagline, inLanguage: 'en', publisher: { '@id': `${site.url}#organization` } });
  if (needsPerson) graph.push(person(site, page.author));
  if (site.reviewer.status === 'signed_off') {
    graph.push({ '@type': 'Person', '@id': `${site.url}#/person/reviewer`, name: site.reviewer.name, jobTitle: site.reviewer.credential, sameAs: site.reviewer.same_as || [] });
  }
  if (built?.faq?.length) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${abs(page.url)}#faq`,
      mainEntity: built.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    });
  }
  graph.push(organizationSchema(site, ctx.pluginUrl));
  return { '@context': 'https://schema.org', '@graph': graph };
}

function websiteSchema(site, pluginUrl) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${site.url}#website`, url: site.url, name: site.brand, description: site.tagline, inLanguage: 'en', publisher: { '@id': `${site.url}#organization` } },
      organizationSchema(site, pluginUrl),
      person(site, site.people[0].id),
    ],
  };
}

function renderTrust(id, html, ctx) {
  const { site, data } = ctx;
  const flags = ctx.flags || {};
  const scope = { site, d: data.defaults, tariff_checked: data.tariff._meta?.checked || data.tariff.checked, year: String(site.founded) };
  const blocks = {
    'defaults-table': () => defaultsTable(data.defaults),
    'data-sources': () => dataSources(ctx),
    'people': () => site.people.map((p) => `<li id="${esc(p.id)}"><strong>${esc(p.name)}</strong>, ${esc(p.roles.join(' and '))}${p.same_as.length ? ` (<a href="${esc(p.same_as[0])}" rel="me noopener">LinkedIn</a>)` : ''}</li>`).join(''),
    'reviewer': () => site.reviewer.status === 'signed_off'
      ? `<p>Technical review: <strong>${esc(site.reviewer.name)}</strong>, ${esc(site.reviewer.credential)}.</p>`
      : '<p>Technical review by a PEC-registered electrical engineer is in progress. Until it is complete, no page claims an engineer sign-off.</p>',
  };
  let out = html.replace(/<!--\s*block:([\w-]+)\s*-->/g, (_, b) => {
    if (!blocks[b]) fail(`${id}: unknown block ${b}`);
    return blocks[b]();
  });
  // Conditional sections: <!--if:analytics.enabled--> ... <!--endif--> and <!--ifnot:...-->
  out = out.replace(/<!--(if|ifnot):([\w.]+)-->([\s\S]*?)<!--endif-->/g, (_, kind, path, body) => {
    const v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), { ...site, flags });
    return (kind === 'if') === Boolean(v) ? body : '';
  });
  const filled = out.replace(/\{\{\s*([\w.]+)\s*(?:\|\s*(\w+)\s*)?\}\}/g, (m, path, spec) => {
    const s = render(m, scope);
    if (s === null) fail(`${id}: no value for ${path}`);
    return esc(s);
  });
  return filled.trim();
}

function defaultsTable(d) {
  const rows = [
    ['Single-phase voltage (Pakistan)', `${fmt(d.v_1ph)} V`],
    ['Three-phase voltage (Pakistan)', `${fmt(d.v_3ph)} V`],
    ['Single-phase voltage (US option)', `${fmt(d.v_1ph_us)} V`],
    ['Power factor, mixed home loads', fmt(d.pf_mixed)],
    ['Power factor, resistive loads (heaters, irons, kettles)', fmt(d.pf_resistive)],
    ['Power factor, generators', fmt(d.pf_generator)],
    ['Power factor, line-interactive UPS (VA to W)', fmt(d.pf_ups_line_interactive)],
    ['UPS inverter efficiency', fmt(d.inverter_eff_ups, 'pct')],
    ['Hybrid solar inverter efficiency', fmt(d.inverter_eff_hybrid, 'pct')],
    ['Usable depth of discharge, lead-acid and tubular', fmt(d.dod_lead_acid, 'pct')],
    ['Usable depth of discharge, lithium (LiFePO4)', fmt(d.dod_lifepo4, 'pct')],
    ['Sizing safety margin', `${fmt(d.margin)} ×`],
    ['Solar performance ratio', fmt(d.pr, 'pct')],
    ['Days per billing month', fmt(d.days_per_month)],
    ['Default solar panel size', `${fmt(d.panel_w)} W`],
    ['Largest panel-to-inverter (DC/AC) ratio', `${fmt(d.dc_ac_ratio_max)} ×`],
    ['Panel cell temperature, hot and cold design days', `${fmt(d.cell_temp_hot_c)} °C and ${fmt(d.cell_temp_cold_c)} °C`],
    ['Hybrid inverter solar start voltage', `${fmt(d.hybrid_pv_start_v)} V`],
    ['Watts per horsepower', `${fmt(d.w_per_hp)} W`],
    ['Copper resistivity at working temperature', `${fmt(d.rho_copper, '4')} Ω·mm²/m`],
    ['Aluminium resistivity at working temperature', `${fmt(d.rho_aluminium, '4')} Ω·mm²/m`],
    ['Voltage drop limit, lighting', `${fmt(d.vdrop_limit_lighting_pct)}%`],
    ['Voltage drop limit, other circuits', `${fmt(d.vdrop_limit_other_pct)}%`],
  ];
  return `<table class="wl-table"><caption>Default values used when you leave a field blank. Most can be changed in the calculator's advanced settings; physical constants and code limits are fixed.</caption><thead><tr><th scope="col">Assumption</th><th scope="col">Default</th></tr></thead><tbody>${rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody></table>`;
}

function dataSources(ctx) {
  const items = [
    ['Engineering defaults', { source: 'Standard electrical practice (IEC 60364, NEPRA performance standards for 230/400 V, 50 Hz supply), listed in the table above', checked: ctx.data.defaults._meta.checked }],
    ['Pakistan electricity tariff', ctx.data.tariff._meta],
    ['Peak sun hours by city', ctx.citiesMeta],
    ['Appliance wattages', ctx.appliances._meta],
  ];
  return `<ul>${items.filter(([, m]) => m).map(([label, m]) => `<li><strong>${esc(label)}</strong>: ${esc(m.source)}. Last checked ${esc(m.checked)}.</li>`).join('')}</ul>`;
}

function llmsTxt(pages, ctx) {
  const { site } = ctx;
  const abs = (u) => site.url.replace(/\/$/, '') + u;
  const live = pages.filter((p) => p.live);
  // The engine-built answer of each page follows its meta, so an assistant can quote a number with its page (21 Oct audit WL-195).
  const answer = (p) => { const a = ctx.built?.[p.id]?.answer; return a && p.type !== 'trust' ? ` Answer: ${a}` : ''; };
  const line = (p) => `- [${p.h1}](${abs(p.url)}): ${p.meta}${answer(p)}`;
  const out = [`# ${site.brand}`, '', `> ${site.brand} (${site.url}) makes free electricity calculators for homes: watts and amps conversions, battery and UPS backup, generator sizing, solar systems, home load and Pakistan electricity bills. ${site.tagline} Every result shows its formula and assumptions; all calculators run in the browser.`, ''];
  const pillars = live.filter((p) => p.type === 'pillar');
  if (pillars.length) out.push('## Sections', '', ...pillars.map(line), '');
  const home = live.find((p) => p.type === 'home');
  if (home) out.push(`## Start here`, '', line(home), '');
  const tools = live.filter((p) => p.type === 'tool' || p.type === 'appliance' || p.type === 'lookup');
  if (tools.length) out.push('## Calculators', '', ...tools.map(line), '');
  const guides = live.filter((p) => p.type === 'guide');
  if (guides.length) out.push('## Guides', '', ...guides.map(line), '');
  const datasets = live.filter((p) => p.type === 'data');
  if (datasets.length) out.push('## Data (CC BY 4.0, CSV download on each page)', '', ...datasets.map(line), '');
  const embed = live.filter((p) => p.type === 'embed');
  if (embed.length) out.push('## For publishers', '', ...embed.map(line), '');
  const trust = live.filter((p) => p.type === 'trust');
  out.push('## Method, data and policies', '', ...trust.map(line), '');
  out.push('## Notes for AI assistants', '');
  out.push(`- Results are planning estimates, not official bills or engineering sign-off. Defaults are listed at ${abs('/methodology/')}.`);
  out.push(`- Pakistan defaults: ${fmt(ctx.data.defaults.v_1ph)} V single phase, ${fmt(ctx.data.defaults.v_3ph)} V three phase, 50 Hz, prices in PKR. Tariff data last checked ${ctx.data.tariff._meta?.checked}.`);
  out.push(`- Contact for corrections: ${site.contact_email}.`);
  return out.join('\n') + '\n';
}

export async function build() {
  const inp = await loadInputs();
  const { site, keywordRows, siteRows, content } = inp;
  const pluginUrl = `${site.url}wp-content/plugins/wattlyst-tools/`;
  const ctxBase = { site, data: inp.data, modules: inp.modules, appliances: inp.appliances, cables: inp.cables, solarPrices: inp.solarPrices, inverterCodes: inp.inverterCodes, labelsUr: inp.labelsUr, citiesMeta: inp.citiesMeta, pluginUrl };

  const rows = [
    ...keywordRows.map((r) => ({ id: r.id, type: typeOf(r), silo: r.silo, url: r.url, h1: '', title: r.title, meta: r.meta_description, primary_keyword: r.primary_keyword, wave: Number(r.wave), status: 'planned' })),
    ...siteRows.map((r) => ({ id: r.id, type: r.type, silo: r.silo, url: r.url, h1: r.h1, title: r.title, meta: r.meta_description, primary_keyword: '', wave: 0, status: r.status, reviewed: r.reviewed || undefined, nav_label: r.nav_label || undefined, nav_order: r.nav_order ? Number(r.nav_order) : undefined })),
  ];
  const byUrl = new Map(rows.map((r) => [r.url, r]));
  for (const id of Object.keys(content)) if (!rows.some((r) => r.id === id)) fail(`content/pages/${id}.json has no row in keyword-map.csv or site-pages.csv`);

  for (const r of rows) {
    const c = content[r.id];
    if (c) {
      if (!['draft', 'publish'].includes(c.status)) fail(`${r.id}: status must be draft or publish`);
      r.status = c.status;
      if (c.template === 'lookup') r.type = 'lookup'; // data lookup (N2 error codes): tables + filter, no calculator
      r.h1 = c.h1 || r.h1;
      r.reviewed = c.reviewed || r.reviewed;
      r.published = c.published;
      r.author = c.author || site.people[0].id;
      r.related = c.related || [];
      r.next = c.next || null;
      // Anchor for this page in other pages' Related lists, so not every inbound link repeats the H1 (WL-211).
      if (c.anchor !== undefined) {
        if (typeof c.anchor !== 'string' || !c.anchor.trim() || c.anchor.length > 60 || c.anchor.toLowerCase() === r.h1.toLowerCase()) fail(`${r.id}: anchor must be a short phrase (up to 60 characters) that differs from the H1`);
        r.anchor = c.anchor;
      }
      if (c.appliance && !inp.appliances.items.find((a) => a.id === c.appliance)) fail(`${r.id}: appliance ${c.appliance} not in data/appliances.json`);
    } else {
      r.author = site.people[0].id;
    }
    if (!r.h1) r.h1 = r.primary_keyword ? r.primary_keyword.replace(/\b\w/g, (m) => m.toUpperCase()) : r.title.replace(/ \| .*$/, '');
    // Parent = the pillar at the first path segment (e.g. /battery/ for /battery/x/).
    const seg = r.url.split('/').filter(Boolean);
    r.parent = seg.length > 1 && byUrl.has(`/${seg[0]}/`) ? byUrl.get(`/${seg[0]}/`).id : null;
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const r of rows) {
    if (r.type === 'trust') r.live = r.status === 'publish';
    else if (r.type !== 'pillar') r.live = r.status === 'publish';
  }
  for (const r of rows.filter((x) => x.type === 'pillar')) {
    const children = rows.filter((x) => x.parent === r.id && x.live);
    r.children = children.map((x) => x.id);
    r.live = r.status === 'publish' || (r.status === 'auto' && children.length > 0) || (content[r.id]?.status === 'publish');
  }
  for (const r of rows) {
    r.breadcrumb = [{ name: 'Home', url: '/' }];
    if (r.parent && byId.get(r.parent).live) r.breadcrumb.push({ name: byId.get(r.parent).h1, url: byId.get(r.parent).url });
    if (r.url !== '/') r.breadcrumb.push({ name: r.h1, url: r.url });
  }

  for (const r of rows.filter((x) => x.type === 'home')) {
    r.cards = rows.filter((x) => x.type === 'pillar' && x.live).sort((a, b) => (a.nav_order ?? 99) - (b.nav_order ?? 99)).map((p) => ({ id: p.id, url: p.url, h1: p.h1, label: p.nav_label || (p.primary_keyword ? title(p.primary_keyword) : p.h1), meta: p.meta, children: p.children.map((cid) => ({ id: cid, url: byId.get(cid).url, h1: byId.get(cid).h1 })) }));
  }
  const files = {};
  const ads = adsConfig(site, fail, rows, content);
  const leads = leadsConfig(site, inp.leadForm, rows, inp.data.cities, fail);
  const affiliates = affiliatesByPage(inp.affiliates, site, rows, fail);
  for (const r of rows) {
    r.hasTool = Boolean(content[r.id]?.calc) && r.type !== 'home';
    r.hasList = (content[r.id]?.fields || []).some((f) => f.type === 'loads'); // embed iframe height (WL-238)
  }
  // Hubs last: their text can repeat a key fact or a default result of their pages (WL-142).
  const builtById = {};
  const results = {};
  const prevDates = existsSync(join(root, PAGE_DATES)) ? readJson(PAGE_DATES) : {};
  const pageDates = {};
  const today = buildDay();
  for (const r of [...rows.filter((x) => x.type !== 'pillar'), ...rows.filter((x) => x.type === 'pillar')]) {
    const c = content[r.id];
    let built = null;
    let pageCtx = ctxBase;
    if (c) {
      const appliance = c.appliance ? inp.appliances.items.find((a) => a.id === c.appliance) : null;
      pageCtx = { ...ctxBase, id: r.id, appliance, allRows: rows, built: builtById, results };
      built = buildContent(c, pageCtx);
      builtById[r.id] = built;
      // Title or meta with an engine number (seo-rules.md 2): rendered from the page's own default result or dataset.
      if (/\{\{/.test(r.title)) r.title = text(pageCtx, r.title, pageCtx.scope, 'title');
      if (/\{\{/.test(r.meta)) r.meta = text(pageCtx, r.meta, pageCtx.scope, 'meta description');
      if (pageCtx.dataset) files[`generated/data/${pageCtx.dataset.csv_name}`] = pageCtx.dataset.csv;
    }
    if (r.type === 'trust') {
      if (!inp.trustHtml[r.id]) fail(`trust page ${r.id} has no content/trust/${r.id}.html`);
      built = { html: renderTrust(r.id, inp.trustHtml[r.id], { ...ctxBase, flags: { affiliates: Object.keys(affiliates).length > 0 } }) };
    }
    // modified = newest of the review date and the day the shown page last changed (WL-206); a hub also
    // changes when a page in it changes (WL-42). Sitemap lastmod, schema dateModified and IndexNow follow it.
    const { reviewed, modified, ...shown } = r;
    // The error texts a page ships (tool.msg) are not page content, so new wording does not move every page's date.
    const sig = createHash('sha256').update(JSON.stringify({ ...shown, content: built?.tool ? { ...built, tool: { ...built.tool, msg: undefined } } : built, csv: pageCtx.dataset?.csv })).digest('hex').slice(0, 16);
    const kids = r.type === 'pillar' ? newest(...r.children.map((cid) => byId.get(cid).modified)) : undefined;
    const changed = changedOn(prevDates[r.id], sig, r.reviewed || kids, today);
    pageDates[r.id] = { hash: sig, date: changed };
    r.modified = newest(r.reviewed, changed, kids);
    const page = { ...r, content: built };
    // Phase 6: quote form flag and affiliate box (the PHP prints them only from these fields).
    if (built && leads.pages.includes(r.id)) page.lead = true;
    if (built && affiliates[r.id]) page.affiliates = affiliates[r.id];
    page.schema = schemaFor(r, built, pageCtx);
    delete page.hasTool;
    delete page.hasList;
    files[`generated/pages/${r.id}.json`] = JSON.stringify(page, null, 1) + '\n';
  }
  const dist = distFiles();
  const manifest = {
    _meta: { note: 'Generated by tools/build.js from specs/, content/ and data/. Do not edit by hand.' },
    assets: dist.assets,
    site: { brand: site.brand, url: site.url, tagline: site.tagline, contact_email: site.contact_email, logo: site.logo, og_image: site.og_image, twitter_image: site.twitter_image, verification: site.verification || {}, ads, leads, people: site.people, reviewer: site.reviewer.status === 'signed_off'
      ? { status: 'signed_off', name: site.reviewer.name, credential: site.reviewer.credential, same_as: site.reviewer.same_as || [], signed_off: site.reviewer.signed_off }
      : { status: site.reviewer.status } },
    // Browser copy: notes and sources stay in data/ (they are shipped on every calculator page, Lighthouse budget).
    data: { defaults: lean(inp.data.defaults), tariff: lean({ ...inp.data.tariff, gas_domestic: undefined }), cities: lean(inp.data.cities), cables: lean(inp.cables),
      // Browser copy of the price ranges: numbers only (sources and quotes stay on the quote-checker page).
      solar_prices: { checked: inp.solarPrices._meta.checked, panel_rs_per_w: { low: inp.solarPrices.panel_rs_per_w.low, high: inp.solarPrices.panel_rs_per_w.high }, systems: inp.solarPrices.systems.map(({ type, kw, low_rs, high_rs, n_sources }) => ({ type, kw, low_rs, high_rs, n_sources })) },
      // C8 fuel curve and fuel prices, numbers only (the generator test points stay in data/, the page lists them).
      generator_fuel: browserFuel(inp.data.generator_fuel),
      // N7 backup comparison: equipment price ranges and upkeep, numbers only (sources stay in data/ and on the page).
      component_prices: { items: inp.data.component_prices.items.map(({ category, size, low, high, n_sources, export_capable, bank_v }) => ({ category, size, low, high, n_sources, ...(export_capable === false ? { export_capable } : {}), ...(bank_v ? { bank_v } : {}) })) },
      backup_prices: browserBackup(inp.data.backup_prices) },
    // lastmod: the same date as the page's schema dateModified, used for the sitemap <lastmod> (WL-84, WL-206).
    pages: rows.map(({ id, type, url, h1, anchor, title, meta, status, live, parent, children, related, next, wave, modified }) => ({ id, type, url, h1, anchor, title, meta, status, live, parent, children, related, next, wave, lastmod: modified })),
    nav: rows.filter((r) => r.nav_label).sort((a, b) => a.nav_order - b.nav_order).map((r) => ({ id: r.id, label: r.nav_label, url: r.url })),
    website_schema: websiteSchema(site, pluginUrl),
  };
  files[PAGE_DATES] = JSON.stringify(pageDates, null, 1) + '\n';
  files['generated/manifest.json'] = JSON.stringify(manifest, null, 1) + '\n';
  files['generated/llms.txt'] = llmsTxt(rows, { ...ctxBase, built: builtById });
  Object.assign(files, dist.files);
  // Hash of everything a page shows (page JSON, CSV, llms.txt, inlined CSS, shipped JS). The plugin syncs
  // and purges the page cache when the manifest changes, so a data-only deploy must change it too (WL-36).
  const shown = createHash('sha256');
  for (const p of Object.keys(files).filter((x) => x !== 'generated/manifest.json').sort()) shown.update(`${p}\n${files[p]}\n`);
  shown.update(read('assets/css/wattlyst.css'));
  shown.update(read('assets/css/wattlyst-home.css'));
  manifest.assets.content = shown.digest('hex').slice(0, 16);
  files['generated/manifest.json'] = JSON.stringify(manifest, null, 1) + '\n';
  return files;
}

// Every dist/ file is requested with ?ver=<hash>, so a new build means a new URL: browsers may keep each one a
// year (audit WL-138). HTML and unversioned files (the embed script other sites load) keep the server default.
const DIST_HTACCESS = `# Built by tools/build.js (audit WL-138). Every file here is loaded with ?ver=<build hash>.
<IfModule mod_headers.c>
Header set Cache-Control "public, max-age=31536000, immutable"
</IfModule>
<IfModule mod_expires.c>
ExpiresActive On
ExpiresDefault "access plus 1 year"
</IfModule>
`;

/**
 * The browser loads dist/: the same modules with comments and indentation removed (tools/lib/strip.js).
 * Every relative import carries ?ver=<hash of all shipped JS>, the same ver the PHP puts on the script tag
 * and on every modulepreload, so each module is fetched once and a deploy never mixes old and new modules.
 * assets.deps lists each engine module's nested imports so the head can preload the whole chain.
 */
function distFiles() {
  const src = {};
  for (const f of readdirSync(join(root, 'engine')).filter((x) => x.endsWith('.js')).sort()) src[`dist/engine/${f}`] = stripJs(read(`engine/${f}`));
  for (const f of ['wattlyst-tool.js', 'wattlyst-loads.js', 'wattlyst-extra.js', 'wattlyst-page.js']) src[`dist/assets/js/${f}`] = stripJs(read(`assets/js/${f}`));
  const hash = createHash('sha256');
  for (const [p, code] of Object.entries(src)) hash.update(`${p}\n${code}\n`);
  const ver = hash.digest('hex').slice(0, 10);
  const deps = {};
  const direct = (f) => staticImports(src[`dist/engine/${f}`]).map((p) => p.replace('./', ''));
  for (const f of Object.keys(src).filter((p) => p.startsWith('dist/engine/') && p !== 'dist/engine/index.js').map((p) => p.slice('dist/engine/'.length))) {
    const seen = new Set();
    const walk = (m) => { for (const d of direct(m)) if (!seen.has(d)) { seen.add(d); walk(d); } };
    walk(f);
    deps[f] = [...seen].sort();
  }
  const files = Object.fromEntries(Object.entries(src).map(([p, code]) => [p, stampImports(code, ver)]));
  files['dist/.htaccess'] = DIST_HTACCESS;
  return { files, assets: { ver, deps } };
}

async function main() {
  const files = await build();
  const check = process.argv.includes('--check');
  const stale = [];
  for (const [p, body] of Object.entries(files)) {
    const full = join(root, p);
    const cur = existsSync(full) ? readFileSync(full, 'utf8') : null;
    if (cur !== body) stale.push(p);
  }
  const pagesDir = join(root, 'generated/pages');
  const extra = existsSync(pagesDir) ? readdirSync(pagesDir).map((f) => `generated/pages/${f}`).filter((p) => !(p in files)) : [];
  if (check) {
    if (stale.length || extra.length) {
      console.error(`generated/ is out of date (${[...stale, ...extra].join(', ')}). Run: node tools/build.js`);
      process.exit(1);
    }
    console.log('generated/ is up to date');
    return;
  }
  for (const p of extra) rmSync(join(root, p));
  for (const p of stale) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), files[p]);
  }
  console.log(`generated/: ${stale.length} written, ${extra.length} removed, ${Object.keys(files).length} total`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e.message); process.exit(1); });
