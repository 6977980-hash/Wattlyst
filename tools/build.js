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
import { errorMessage, noticeCode } from '../engine/messages.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

const ENGINE_MODULES = ['conversions', 'battery', 'sizing', 'solar', 'bill', 'load', 'wiring', 'planner', 'prices', 'forecast', 'fuel', 'solartools'];
/** Data each engine module needs in the browser (keeps page weight down). Appliances are added per page, only the ones its fields use. */
const MODULE_DATA = { bill: ['tariff'], solar: ['cities'], wiring: ['cables'], load: ['cables'], planner: ['tariff', 'cities'], prices: ['solar_prices'], forecast: ['cities'] };
/** Extra data a single calculator needs (shipped only on its page). */
const CALC_DATA = { generator_fuel: ['generator_fuel'] };
/** Appliance fields the browser engine and the loads picker need. */
const APPLIANCE_KEYS = ['name', 'running_w', 'starting_w', 'typical_hours_per_day', 'avg_w', 'load_type'];

export async function loadInputs() {
  const site = readJson('data/site.json');
  const { _meta: citiesMeta, ...cities } = readJson('data/cities-pk.json');
  const appliances = readJson('data/appliances.json');
  const cables = readJson('data/cable-ampacity.json');
  const solarPrices = readJson('data/solar-prices.json');
  const inverterCodes = readJson('data/inverter-codes.json');
  const data = { defaults: readJson('data/defaults.json'), tariff: readJson('data/tariff-pk-2026.json'), cities, appliances: Object.fromEntries(appliances.items.map((a) => [a.id, a])), cables, solar_prices: solarPrices, generator_fuel: readJson('data/generator-fuel.json'), load_profiles: readJson('data/load-profiles.json').profiles,
    bill_index: readJson('data/bill-index.json'), component_prices: readJson('data/component-prices.json'), solar_price_history: readJson('data/solar-price-history.json') };
  // One source for the FPA (audit WL-13): the newest NEPRA-verified month of the Bill Index. Pages that pre-fill
  // an FPA read data.fpa_latest; data/tariff-pk-2026.json keeps no copy.
  data.fpa_latest = data.bill_index.months.find((m) => m.fpa_verified === true) || null;
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

function text(ctx, tpl, scope, what) {
  if (tpl === undefined || tpl === null || tpl === '') return '';
  for (const p of placeholders(tpl)) if (!isSpec(p.spec)) fail(`${ctx.id}: ${what} uses unknown format "${p.spec}" in {{${p.path}|${p.spec}}}`);
  const s = render(tpl, scope);
  if (s === null) fail(`${ctx.id}: ${what} has a placeholder with no value: ${tpl}`);
  return s;
}

/** Build the rendered content of one page. Every number comes from the engine or data/. */
function buildContent(c, ctx) {
  const out = { intro: '', sections: [], faq: [], key_facts: [], mistakes: [], sources: c.sources || [] };
  const scope = { d: ctx.data.defaults, a: ctx.data.appliances, site: ctx.site, appliance: ctx.appliance, data: ctx.data };
  if (c.calc) {
    const module = findModule(ctx.modules, c.calc);
    if (!module) fail(`${c.id}: unknown calc ${c.calc}`);
    Object.assign(ctx, { calc: c.calc, module });
    const fields = (c.fields || []).map((f) => {
      const out = { ...f, default: resolveDefault(f.default, ctx) };
      if (f.hint) out.hint = text(ctx, f.hint, scope, `field ${f.name} hint`); // {{data.…}} / {{d.…}} placeholders in hints
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
    scope.table = (c.table?.rows || []).map((r, n) => {
      const res = runCalc(ctx, { ...inputs, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, resolveDefault(v, ctx)])) }, `table row ${n + 1}`);
      return { in: res, out: res };
    });
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
        if (typeof v !== 'number' && typeof v !== 'string' && typeof v !== 'boolean') fail(`${c.id}: output ${o.key} missing from ${c.calc}`);
        if (typeof v === 'boolean' && o.spec !== 'yesno') fail(`${c.id}: output ${o.key} is a flag and needs the yesno format`);
        // Roman Urdu label: the page's own label_ur, else the shared glossary content/labels-ur.json.
        const label_ur = o.label_ur || ctx.labelsUr[o.label];
        return { ...o, ...(label_ur ? { label_ur } : {}), value: fmt(v, o.spec || '2') };
      }),
      how: c.how ? { tpl: c.how, text: text(ctx, c.how, scope, 'how'), ...(c.how_ur ? { tpl_ur: c.how_ur, text_ur: text(ctx, c.how_ur, scope, 'how_ur') } : {}) } : null,
      submit: c.submit || 'Calculate',
      ...(c.diagram ? { diagram: c.diagram } : {}),
      ...(c.live ? { live: c.live } : {}),
      notice: noticeCode(result) ? errorMessage(noticeCode(result)) : '',
      data_checked: dataChecked(module, { ...ctx, usesAppliances: fields.some((f) => f.type === 'appliance' || f.type === 'loads') }),
    };
    out.examples = (c.examples || []).map((ex, n) => ({
      title: text(ctx, ex.title, { ...scope, ...scope.ex[n] }, `example ${n + 1} title`),
      text: text(ctx, ex.text, { ...scope, ...scope.ex[n] }, `example ${n + 1}`),
    }));
    if (c.table) {
      const rows = scope.table.map((res, n) => c.table.columns.map((col) => text(ctx, col.tpl, { ...scope, ...res }, `table row ${n + 1}`)));
      out.table = { caption: text(ctx, c.table.caption, scope, 'table caption'), head: c.table.columns.map((col) => col.label), rows };
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
  if (c.embeds) out.embeds = embedList(ctx.allRows, ctx.site, ctx.pluginUrl);
  if (c.codes_table) Object.assign(out, codeTables(ctx, out.sources));
  if (c.calc === 'quote_checker' || c.calc === 'solar_price_estimate') out.sources = [...out.sources, ...priceSources(ctx)];
  if (c.calc === 'panel_price') out.sources = [...out.sources, ...priceSources(ctx, { panelsOnly: true })];
  if (c.calc === 'generator_fuel') out.sources = [...out.sources, ...fuelSources(ctx)];
  out.answer = text(ctx, c.answer, scope, 'answer');
  out.intro = text(ctx, c.intro, scope, 'intro');
  out.key_facts = (c.key_facts || []).map((k, n) => text(ctx, k, scope, `key fact ${n + 1}`));
  out.sections = (c.sections || []).map((s, n) => ({
    h2: text(ctx, s.h2, scope, `section ${n + 1} heading`),
    p: (s.p || []).map((p) => text(ctx, p, scope, `section ${n + 1}`)),
  }));
  out.formula = c.formula ? { text: text(ctx, c.formula.text, scope, 'formula'), lines: c.formula.lines || [] } : null;
  out.mistakes = (c.mistakes || []).map((m, n) => text(ctx, m, scope, `mistake ${n + 1}`));
  out.safety = text(ctx, c.safety, scope, 'safety');
  out.faq = (c.faq || []).map((f, n) => ({ q: text(ctx, f.q, scope, `faq ${n + 1} q`), a: text(ctx, f.a, scope, `faq ${n + 1} a`) }));
  return out;
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
    caption: `${b.name} error codes (${b.models})`,
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
  if (module === 'bill') out.push({ label: 'Pakistan electricity tariff (NEPRA notification)', url: ctx.data.tariff._meta.source_url || null, checked: ctx.data.tariff._meta.checked });
  const prices = module === 'prices';
  if (module === 'solar' || module === 'solartools' || module === 'forecast') out.push({ label: 'Peak sun hours by city (Global Solar Atlas)', url: 'https://globalsolaratlas.info/', checked: ctx.citiesMeta.checked });
  if (ctx.calc === 'heating_cost') {
    out.push({ label: 'Pakistan electricity tariff (NEPRA notification)', url: ctx.data.tariff._meta.source_url || null, checked: ctx.data.tariff._meta.checked });
    const g = ctx.data.tariff.gas_domestic;
    out.push({ label: `Domestic gas slab prices (${g.source}; not yet matched to the OGRA notification)`, url: g.source_url, checked: g.checked });
  } else if (module === 'wiring' || module === 'load') out.push({ label: 'Cable ampacity table (IEC 60364-5-52 Table B.52.4, PVC copper)', url: 'https://webstore.iec.ch/publication/1878', checked: ctx.cables._meta.checked });
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
  return { '@type': 'Person', '@id': `${site.url}#/person/${p.id}`, name: p.name, jobTitle: p.roles.join(', '), sameAs: p.same_as, worksFor: { '@id': `${site.url}#organization` } };
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
    contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: site.contact_email, availableLanguage: ['en'] },
  };
}

function schemaFor(page, built, ctx) {
  const { site } = ctx;
  const abs = (u) => site.url.replace(/\/$/, '') + u;
  const graph = [];
  graph.push({
    '@type': 'BreadcrumbList',
    '@id': `${abs(page.url)}#breadcrumb`,
    itemListElement: page.breadcrumb.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: abs(b.url) })),
  });
  const webPage = {
    '@type': page.id === 'about' ? 'AboutPage' : page.id === 'contact' ? 'ContactPage' : page.type === 'pillar' ? 'CollectionPage' : 'WebPage',
    '@id': `${abs(page.url)}#webpage`,
    url: abs(page.url),
    name: page.title,
    description: page.meta,
    inLanguage: 'en',
    isPartOf: { '@id': `${site.url}#website` },
    breadcrumb: { '@id': `${abs(page.url)}#breadcrumb` },
    ...(page.reviewed ? { dateModified: page.reviewed, lastReviewed: page.reviewed } : page.modified ? { dateModified: page.modified } : {}),
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
      ...(page.reviewed ? { dateModified: page.reviewed } : {}),
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
    'people': () => site.people.map((p) => `<li><strong>${esc(p.name)}</strong>, ${esc(p.roles.join(' and '))}${p.same_as.length ? ` (<a href="${esc(p.same_as[0])}" rel="me noopener">LinkedIn</a>)` : ''}</li>`).join(''),
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
  const line = (p) => `- [${p.h1}](${abs(p.url)}): ${p.meta}`;
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
    // A hub changes when a page in it changes: dateModified = newest reviewed date of its live pages (WL-42).
    if (!r.reviewed) r.modified = children.map((x) => x.reviewed).filter(Boolean).sort().at(-1);
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
  const ads = adsConfig(site, fail);
  const leads = leadsConfig(site, inp.leadForm, rows, inp.data.cities, fail);
  const affiliates = affiliatesByPage(inp.affiliates, site, rows, fail);
  for (const r of rows) r.hasTool = Boolean(content[r.id]?.calc) && r.type !== 'home';
  for (const r of rows) {
    const c = content[r.id];
    let built = null;
    let pageCtx = ctxBase;
    if (c) {
      const appliance = c.appliance ? inp.appliances.items.find((a) => a.id === c.appliance) : null;
      pageCtx = { ...ctxBase, id: r.id, appliance, allRows: rows };
      built = buildContent(c, pageCtx);
      if (pageCtx.dataset) files[`generated/data/${pageCtx.dataset.csv_name}`] = pageCtx.dataset.csv;
    }
    if (r.type === 'trust') {
      if (!inp.trustHtml[r.id]) fail(`trust page ${r.id} has no content/trust/${r.id}.html`);
      built = { html: renderTrust(r.id, inp.trustHtml[r.id], { ...ctxBase, flags: { affiliates: Object.keys(affiliates).length > 0 } }) };
    }
    const page = { ...r, content: built };
    // Phase 6: quote form flag and affiliate box (the PHP prints them only from these fields).
    if (built && leads.pages.includes(r.id)) page.lead = true;
    if (built && affiliates[r.id]) page.affiliates = affiliates[r.id];
    page.schema = schemaFor(r, built, pageCtx);
    delete page.hasTool;
    files[`generated/pages/${r.id}.json`] = JSON.stringify(page, null, 1) + '\n';
  }
  const dist = distFiles();
  const manifest = {
    _meta: { note: 'Generated by tools/build.js from specs/, content/ and data/. Do not edit by hand.' },
    assets: dist.assets,
    site: { brand: site.brand, url: site.url, tagline: site.tagline, contact_email: site.contact_email, logo: site.logo, og_image: site.og_image, twitter_image: site.twitter_image, ads, leads, people: site.people, reviewer: site.reviewer.status === 'signed_off'
      ? { status: 'signed_off', name: site.reviewer.name, credential: site.reviewer.credential, same_as: site.reviewer.same_as || [], signed_off: site.reviewer.signed_off }
      : { status: site.reviewer.status } },
    data: { defaults: inp.data.defaults, tariff: inp.data.tariff, cities: inp.data.cities, cables: inp.cables,
      // Browser copy of the price ranges: numbers only (sources and quotes stay on the quote-checker page).
      solar_prices: { checked: inp.solarPrices._meta.checked, panel_rs_per_w: { low: inp.solarPrices.panel_rs_per_w.low, high: inp.solarPrices.panel_rs_per_w.high }, systems: inp.solarPrices.systems.map(({ type, kw, low_rs, high_rs }) => ({ type, kw, low_rs, high_rs })) } },
    pages: rows.map(({ id, type, url, h1, title, meta, status, live, parent, children, related, next, wave }) => ({ id, type, url, h1, title, meta, status, live, parent, children, related, next, wave })),
    nav: rows.filter((r) => r.nav_label).sort((a, b) => a.nav_order - b.nav_order).map((r) => ({ id: r.id, label: r.nav_label, url: r.url })),
    website_schema: websiteSchema(site, pluginUrl),
  };
  files['generated/manifest.json'] = JSON.stringify(manifest, null, 1) + '\n';
  files['generated/llms.txt'] = llmsTxt(rows, ctxBase);
  Object.assign(files, dist.files);
  // Hash of everything a page shows (page JSON, CSV, llms.txt, inlined CSS, shipped JS). The plugin syncs
  // and purges the page cache when the manifest changes, so a data-only deploy must change it too (WL-36).
  const shown = createHash('sha256');
  for (const p of Object.keys(files).filter((x) => x !== 'generated/manifest.json').sort()) shown.update(`${p}\n${files[p]}\n`);
  shown.update(read('assets/css/wattlyst.css'));
  manifest.assets.content = shown.digest('hex').slice(0, 16);
  files['generated/manifest.json'] = JSON.stringify(manifest, null, 1) + '\n';
  return files;
}

/**
 * The browser loads dist/: the same modules with comments and indentation removed (tools/lib/strip.js).
 * Every relative import carries ?ver=<hash of all shipped JS>, the same ver the PHP puts on the script tag
 * and on every modulepreload, so each module is fetched once and a deploy never mixes old and new modules.
 * assets.deps lists each engine module's nested imports so the head can preload the whole chain.
 */
function distFiles() {
  const src = {};
  for (const f of readdirSync(join(root, 'engine')).filter((x) => x.endsWith('.js')).sort()) src[`dist/engine/${f}`] = stripJs(read(`engine/${f}`));
  for (const f of ['wattlyst-tool.js', 'wattlyst-loads.js', 'wattlyst-page.js']) src[`dist/assets/js/${f}`] = stripJs(read(`assets/js/${f}`));
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
