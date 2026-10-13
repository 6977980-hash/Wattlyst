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
import { render, fmt, placeholders, isSpec } from '../engine/format.js';
import { errorMessage } from '../engine/messages.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

const ENGINE_MODULES = ['conversions', 'battery', 'sizing', 'solar', 'bill', 'load', 'wiring'];
/** Data each engine module needs in the browser (keeps page weight down). */
const MODULE_DATA = { bill: ['tariff'], solar: ['cities'] };

export async function loadInputs() {
  const site = readJson('data/site.json');
  const { _meta: citiesMeta, ...cities } = readJson('data/cities-pk.json');
  const data = { defaults: readJson('data/defaults.json'), tariff: readJson('data/tariff-pk-2026.json'), cities };
  const appliances = readJson('data/appliances.json');
  const modules = {};
  for (const m of ENGINE_MODULES) modules[m] = await import(pathToFileURL(join(root, 'engine', `${m}.js`)).href);
  const keywordRows = parseCsv(read('specs/keyword-map.csv'));
  const siteRows = parseCsv(read('specs/site-pages.csv'));
  const content = {};
  for (const f of readdirSync(join(root, 'content/pages')).filter((x) => x.endsWith('.json')).sort()) {
    const c = readJson(`content/pages/${f}`);
    content[c.id] = c;
  }
  const trustHtml = {};
  for (const f of readdirSync(join(root, 'content/trust')).filter((x) => x.endsWith('.html')).sort()) {
    trustHtml[f.replace(/\.html$/, '')] = read(`content/trust/${f}`);
  }
  return { site, data, citiesMeta, appliances, modules, keywordRows, siteRows, content, trustHtml };
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

/** Resolve "@key" (data/defaults.json) and "@appliance.key" in field defaults. */
function resolveDefault(v, ctx) {
  if (typeof v !== 'string' || !v.startsWith('@')) return v;
  const path = v.slice(1);
  const val = path.startsWith('appliance.') ? ctx.appliance?.[path.slice(10)] : ctx.data.defaults[path];
  if (val === undefined) fail(`${ctx.id}: default ${v} not found`);
  return val;
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
  const scope = { d: ctx.data.defaults, site: ctx.site, appliance: ctx.appliance };
  if (c.calc) {
    const module = findModule(ctx.modules, c.calc);
    if (!module) fail(`${c.id}: unknown calc ${c.calc}`);
    Object.assign(ctx, { calc: c.calc, module });
    const fields = (c.fields || []).map((f) => ({ ...f, default: resolveDefault(f.default, ctx) }));
    const defaults = Object.fromEntries(fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default]));
    const fixed = c.fixed_inputs || {};
    const inputs = { ...fixed, ...defaults };
    const result = runCalc(ctx, inputs, 'default inputs');
    scope.in = result;
    scope.out = result;
    scope.ex = (c.examples || []).map((ex, n) => {
      const exIn = { ...inputs, ...ex.inputs };
      const r = runCalc(ctx, exIn, `example ${n + 1}`);
      return { in: r, out: r };
    });
    out.tool = {
      calc: c.calc,
      module: `${module}.js`,
      data_keys: MODULE_DATA[module] || [],
      fields,
      fixed_inputs: fixed,
      outputs: (c.outputs || []).map((o) => {
        if (o.spec && !isSpec(o.spec)) fail(`${c.id}: output ${o.key} uses unknown format ${o.spec}`);
        const v = result[o.key];
        if (typeof v !== 'number' && typeof v !== 'string') fail(`${c.id}: output ${o.key} missing from ${c.calc}`);
        return { ...o, value: fmt(v, o.spec || '2') };
      }),
      how: c.how ? { tpl: c.how, text: text(ctx, c.how, scope, 'how') } : null,
      submit: c.submit || 'Calculate',
      data_checked: dataChecked(module, ctx),
    };
    out.examples = (c.examples || []).map((ex, n) => ({
      title: text(ctx, ex.title, { ...scope, ...scope.ex[n] }, `example ${n + 1} title`),
      text: text(ctx, ex.text, { ...scope, ...scope.ex[n] }, `example ${n + 1}`),
    }));
    if (c.table) {
      const rows = c.table.rows.map((r, n) => {
        const res = runCalc(ctx, { ...inputs, ...r }, `table row ${n + 1}`);
        return c.table.columns.map((col) => text(ctx, col.tpl, { ...scope, in: res, out: res }, `table row ${n + 1}`));
      });
      out.table = { caption: text(ctx, c.table.caption, scope, 'table caption'), head: c.table.columns.map((col) => col.label), rows };
    }
  }
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

/** "Last checked" lines for the data a tool depends on, so a data refresh re-dates the page. */
function dataChecked(module, ctx) {
  const out = [];
  if (module === 'bill') out.push({ label: 'Pakistan electricity tariff (NEPRA notification)', url: ctx.data.tariff._meta.source_url || null, checked: ctx.data.tariff._meta.checked });
  if (module === 'solar') out.push({ label: 'Peak sun hours by city (Global Solar Atlas)', url: 'https://globalsolaratlas.info/', checked: ctx.citiesMeta.checked });
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
    ...(page.reviewed ? { dateModified: page.reviewed, lastReviewed: page.reviewed } : {}),
    ...(site.reviewer.status === 'signed_off' && page.type !== 'trust' ? { reviewedBy: { '@id': `${site.url}#/person/reviewer` } } : {}),
  };
  graph.push(webPage);
  if (page.type === 'tool' || page.type === 'appliance') {
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
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
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
    const v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), site);
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
  const tools = live.filter((p) => p.type === 'tool' || p.type === 'appliance');
  if (tools.length) out.push('## Calculators', '', ...tools.map(line), '');
  const guides = live.filter((p) => p.type === 'guide');
  if (guides.length) out.push('## Guides', '', ...guides.map(line), '');
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
  const ctxBase = { site, data: inp.data, modules: inp.modules, appliances: inp.appliances, citiesMeta: inp.citiesMeta, pluginUrl };

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
    r.live = r.status === 'publish' || (r.status === 'auto' && children.length > 0) || (content[r.id]?.status === 'publish');
  }
  for (const r of rows) {
    r.breadcrumb = [{ name: 'Home', url: '/' }];
    if (r.parent && byId.get(r.parent).live) r.breadcrumb.push({ name: byId.get(r.parent).h1, url: byId.get(r.parent).url });
    if (r.url !== '/') r.breadcrumb.push({ name: r.h1, url: r.url });
  }

  const files = {};
  for (const r of rows) {
    const c = content[r.id];
    let built = null;
    if (c) {
      const appliance = c.appliance ? inp.appliances.items.find((a) => a.id === c.appliance) : null;
      built = buildContent(c, { ...ctxBase, id: r.id, appliance });
    }
    if (r.type === 'trust') {
      if (!inp.trustHtml[r.id]) fail(`trust page ${r.id} has no content/trust/${r.id}.html`);
      built = { html: renderTrust(r.id, inp.trustHtml[r.id], { ...ctxBase }) };
    }
    const page = { ...r, content: built };
    page.schema = schemaFor(r, built, ctxBase);
    files[`generated/pages/${r.id}.json`] = JSON.stringify(page, null, 1) + '\n';
  }
  const manifest = {
    _meta: { note: 'Generated by tools/build.js from specs/, content/ and data/. Do not edit by hand.' },
    site: { brand: site.brand, url: site.url, tagline: site.tagline, contact_email: site.contact_email, logo: site.logo, og_image: site.og_image, twitter_image: site.twitter_image, ads: site.ads, people: site.people, reviewer: site.reviewer.status === 'signed_off'
      ? { status: 'signed_off', name: site.reviewer.name, credential: site.reviewer.credential, same_as: site.reviewer.same_as || [], signed_off: site.reviewer.signed_off }
      : { status: site.reviewer.status } },
    data: { defaults: inp.data.defaults, tariff: inp.data.tariff, cities: inp.data.cities },
    pages: rows.map(({ id, type, url, h1, title, meta, status, live, parent, children, related, next, wave }) => ({ id, type, url, h1, title, meta, status, live, parent, children, related, next, wave })),
    nav: rows.filter((r) => r.nav_label).sort((a, b) => a.nav_order - b.nav_order).map((r) => ({ id: r.id, label: r.nav_label, url: r.url })),
    website_schema: websiteSchema(site, pluginUrl),
  };
  files['generated/manifest.json'] = JSON.stringify(manifest, null, 1) + '\n';
  files['generated/llms.txt'] = llmsTxt(rows, ctxBase);
  return files;
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
