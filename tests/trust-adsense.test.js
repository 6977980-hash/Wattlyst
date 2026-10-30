// 21 Oct 2026 audit, fix Phase 8 (trust and AdSense readiness): WL-215 to WL-219, WL-240, WL-243, WL-244.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, data } from './load-data.js';
import { build } from '../tools/build.js';
import { adsConfig, AD_SLOTS } from '../tools/lib/monetize.js';
import { calculators } from '../engine/index.js';

const files = await build();
const pages = Object.entries(files).filter(([p]) => p.startsWith('generated/pages/')).map(([, b]) => JSON.parse(b));
const byId = new Map(pages.map((p) => [p.id, p]));
const read = (f) => readFileSync(join(root, f), 'utf8');
const readJson = (f) => JSON.parse(read(f));
const fail = (m) => { throw new Error(m); };
const slots = Object.fromEntries(AD_SLOTS.map((k) => [k, '1234567890']));
const graph = (id) => {
  const s = byId.get(id).schema;
  return (Array.isArray(s) ? s : [s]).flatMap((x) => x['@graph'] || [x]);
};

test('WL-243: protected bills carry no FC surcharge by default (data), lifeline none either', () => {
  const fc = readJson('data/tariff-pk-2026.json').addons_secondary.fc_surcharge_per_unit;
  assert.equal(fc.by_category.protected, 0);
  // A bill is evidence, not the source (owner rule 21 Oct 2026): protected stays [VERIFY] until NEPRA's rate is found.
  assert.equal(fc.by_category_verified.protected, false);
  assert.match(fc.by_category_note, /VERIFY/);
  const q = readJson('data/tariff-pk-2026.json').addons_secondary.qta_per_unit;
  for (const k of Object.keys(q).filter((x) => /^\d{4}-\d{2}\.\.\d{4}-\d{2}$/.test(x))) assert.ok(q.sources?.[k]?.source, `QTA ${k} has a source`);
  assert.equal(q.sources['2026-09..2026-11'].verified, true);
  const r = calculators.bill_total({ units: 150, protected: true, sanctioned_kw: 2 }, data);
  assert.equal(r.fc_rs, 0);
  assert.ok(calculators.bill_total({ units: 150, sanctioned_kw: 2 }, data).fc_rs > 0, 'unprotected still pays it');
});

test('WL-244: the FPA is charged on the FPA month units; blank = this month; every bill page offers the box', () => {
  const owner = calculators.bill_total({ units: 29, protected: true, sanctioned_kw: 2, period: '2026-09..2026-11', fpa_per_unit: 2.0581, fpa_units: 185 }, data);
  assert.equal(owner.total_rs, 1300, "reconciles to the owner's real LESCO bill");
  const blank = calculators.bill_total({ units: 29, protected: true, sanctioned_kw: 2, fpa_per_unit: 2.0581 }, data);
  assert.equal(blank.fpa_units, 29);
  // Only the FPA line moves: every other line uses this month's units.
  const a = calculators.bill_total({ units: 300, sanctioned_kw: 2, fpa_per_unit: 2, fpa_units: 100 }, data);
  const b = calculators.bill_total({ units: 300, sanctioned_kw: 2, fpa_per_unit: 2 }, data);
  for (const k of ['energy_rs', 'fixed_rs', 'fc_rs', 'qta_rs']) assert.equal(a[k], b[k], k);
  assert.equal(a.fpa_rs, 200);
  for (const id of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'F13', 'F14']) {
    const f = readJson(`content/pages/${id}.json`).fields.find((x) => x.name === 'fpa_units');
    assert.ok(f && f.default === undefined, `${id}: optional FPA-month units box`);
  }
  assert.match(read('specs/formulas.md'), /FPA units \(audit 2026-10-21 Phase 8, WL-244\)/);
  assert.doesNotMatch(read('specs/formulas.md'), /lifeline and protected consumers get `fpa_rs = 0`/, 'stale exemption rule removed');
});

test('WL-217: ads cannot be switched on without a consent tool; the PHP gate checks it too', () => {
  const site = (cmp) => ({ ads: { enabled: true, adsense_pub_id: 'pub-1234567890123456', slots, no_ads_pages: [] }, consent: { cmp } });
  assert.throws(() => adsConfig(site(null), fail), /consent\.cmp/);
  assert.throws(() => adsConfig(site('  '), fail), /consent\.cmp/);
  assert.equal(adsConfig(site('Google CMP'), fail).cmp, 'Google CMP');
  const php = read('includes/class-wattlyst-ads.php');
  assert.match(php, /empty\( \$ads\['cmp'\] \)/);
});

test('WL-240: N6 never shows ads and credits Open-Meteo under CC BY 4.0', () => {
  const ads = readJson('data/site.json').ads;
  assert.ok(ads.no_ads_pages.includes('N6'));
  const content = { N6: { live: 'open_meteo' } };
  assert.throws(() => adsConfig({ ads: { ...ads, no_ads_pages: [] }, consent: {} }, fail, [], content), /no_ads_pages must list N6/);
  assert.match(read('includes/class-wattlyst-ads.php'), /no_ads_pages/);
  const t = byId.get('N6').content.tool;
  assert.equal(t.credit.licence, 'CC BY 4.0');
  assert.match(t.credit.by_url, /^https:\/\/open-meteo\.com/);
  assert.match(read('includes/class-wattlyst-render.php'), /Weather data by <a href="%1\$s">%2\$s<\/a>, licensed under/);
});

test('WL-215: the author bio comes from data/site.json and reaches About, the author box and the Person schema', () => {
  const p = readJson('data/site.json').people[0];
  assert.ok(p.bio.length >= 2 && p.short_bio && p.bio_source);
  const about = byId.get('about').content.html;
  for (const line of p.bio) assert.ok(about.includes(line.replace(/'/g, '&#39;')) || about.includes(line), 'bio on About');
  const person = graph('F1').find((x) => x['@type'] === 'Person');
  assert.equal(person.description, p.short_bio);
  assert.deepEqual(person.knowsAbout, p.knows_about);
  assert.match(read('includes/class-wattlyst-render.php'), /\$author\['short_bio'\]/);
});

test('WL-216: error-code rows are our own summaries, not quoted manual text', () => {
  const raw = read('data/inverter-codes.json');
  assert.doesNotMatch(raw, /(Manual|Article)( \([^)]*\))?: '/);
  assert.doesNotMatch(raw, /Owner: |Warning table|Fault table/);
  assert.doesNotMatch(JSON.stringify(readJson('content/pages/N2.json')), /quotes? the (manufacturer's )?manual/i);
});

test('WL-218: appliance data no longer cites retailer blogs, news or a foreign shop listing', () => {
  const raw = read('data/appliances.json');
  assert.doesNotMatch(raw, /powerhouseexpress|arynews|startech\.com\.bd|toolsfluent/);
  for (const a of readJson('data/appliances.json').items) {
    assert.ok(a.source, `${a.id}: source`);
    if (a.source_url) assert.match(a.source_url, /^https:\/\//, a.id);
    if (a.load_type === 'inverter_compressor' && a.starting_w_basis === 'source') assert.equal(a.starting_w, a.running_w_range[1], `${a.id}: starting = maker's maximum input`);
  }
});

test('WL-219: privacy policy names the operator and country, Terms carry governing law, DISCO pages shorten the tax FAQ', () => {
  const site = readJson('data/site.json');
  const privacy = byId.get('privacy-policy').content.html;
  const terms = byId.get('terms').content.html;
  assert.match(privacy, new RegExp(`run by ${site.operator.name} in ${site.operator.country}`));
  assert.match(privacy, /data controller/);
  assert.match(terms, /<h2>Governing law<\/h2>/);
  assert.match(terms, new RegExp(`governed by the laws of ${site.operator.country}`));
  const faq = (id) => readJson(`content/pages/${id}.json`).faq.find((q) => q.q.startsWith('Why is my real bill higher')).a;
  const long = faq('F14'); // the full answer stays on F14 (and F1 has its own income-tax FAQ)
  for (const id of ['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'F13']) {
    assert.match(faq(id), /\[\[F1\|/, `${id}: links F1`);
    assert.ok(faq(id).length < long.length, `${id}: shorter than the full answer`);
  }
});
