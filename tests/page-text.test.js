// 21 Oct 2026 audit, fix Phase 5 (page text: contradictions, claims and SEO content): WL-183 to WL-196, WL-220, WL-233 to WL-237.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './load-data.js';
import { build } from '../tools/build.js';
import { lakhRs, roughHours } from '../engine/approx.js';

const files = await build();
const pages = Object.entries(files).filter(([p]) => p.startsWith('generated/pages/')).map(([, b]) => JSON.parse(b));
const byId = new Map(pages.map((p) => [p.id, p]));
const live = pages.filter((p) => p.live);
const read = (f) => readFileSync(join(root, f), 'utf8');
const content = Object.fromEntries(readdirSync(join(root, 'content/pages')).map((f) => [f.replace(/\.json$/, ''), read(`content/pages/${f}`)]));
const text = (id) => JSON.stringify(byId.get(id).content || {});
const links = (p) => {
  const c = p.content || {};
  const out = [];
  for (const s of c.sections || []) for (const l of s.l || []) out.push(...l);
  for (const e of [...(c.examples || []), ...(c.faq || [])]) out.push(...(e.l || []));
  return out.map((l) => l.u);
};

test('WL-183: a rough runtime is rounded down to half an hour, so it never reads like the exact result beside it', () => {
  assert.equal(roughHours(3.13), '3 hours');
  assert.equal(roughHours(3.6), '3.5 hours');
  assert.equal(roughHours(1.2), '1 hour');
  assert.equal(roughHours(0.4), '20 min');
  for (const id of ['B1', 'P-B']) {
    const c = byId.get(id).content;
    const prose = JSON.stringify([c.answer, c.key_facts, c.faq, c.sections]); // the how text and examples keep the exact hm
    assert.doesNotMatch(prose, /about \d+ h \d+ min/, id);
  }
});

test('WL-184: a month is the average calendar month in every text; only real day counts print whole days', () => {
  const whole = new Set(['N1', 'N8', 'N12', 'N14']); // a typed reading cycle, one charge a day, dry days, cloudy days
  for (const [id, s] of Object.entries(content)) {
    if (whole.has(id)) continue;
    assert.doesNotMatch(s, /\{\{(ex\.\d+\.)?(out\.days|d\.days_per_month)\|int\}\}/, id);
  }
  assert.doesNotMatch(content.E6, /"days": 30\b/);
  for (const p of live) if (!whole.has(p.id) && p.type !== 'trust') assert.doesNotMatch(text(p.id), /\b30[- ]days?\b/, p.id);
  assert.doesNotMatch(read('specs/formulas.md'), /L\/day × days` \(30\)/);
});

test('WL-185: the home answer prints the recommended setup saving, and each saving card says which setup it is', () => {
  const h = byId.get('H1').content;
  const out = Object.fromEntries(h.tool.outputs.map((o) => [o.key, o]));
  assert.ok(h.answer.includes(out.decision_saving_rs.value), h.answer);
  assert.doesNotMatch(h.answer, new RegExp(out.full_saving_rs.value));
  assert.match(out.decision_saving_rs.label, /best fit.*power cuts/);
  assert.match(out.full_saving_rs.label, /no power cuts/);
});

test('WL-233: the lithium guide quotes the cited datasheet and does not call LiFePO4 fireproof', () => {
  const s = text('H8');
  assert.doesNotMatch(s, /no such penalty|does not catch fire|can sit in a cupboard|eight years or more/);
  assert.match(s, /2,500 cycles at 80% depth of discharge/);
  assert.match(s, /vent flammable/);
  assert.ok(byId.get('H8').content.sources.some((x) => /victronenergy/.test(x.url)));
});

test('WL-234: every live calculator, guide and hub page cites at least one outside source', () => {
  for (const p of live) {
    if (!['tool', 'appliance', 'guide', 'lookup', 'pillar', 'data', 'home'].includes(p.type)) continue;
    assert.ok((p.content.sources || []).some((x) => /^https:\/\//.test(x.url)), `${p.id}: only internal sources`);
  }
});

test('WL-235: metas promise only what the page has', () => {
  const meta = (id) => byId.get(id).meta;
  assert.doesNotMatch(meta('D16'), /Voc/);
  assert.doesNotMatch(meta('N1'), /reading dates|FPA|detection/i);
  assert.doesNotMatch(meta('E3'), /diversity/i);
  assert.doesNotMatch(meta('E4'), /wire size/i);
  assert.doesNotMatch(meta('A10'), /see usable energy/);
});

test('WL-189: the size, price and bill pages link where their readers go next', () => {
  const want = { D8: ['D12', 'D13', 'D14', 'solar-price-tracker'], F2: ['bill-index', 'N1', 'N4', 'N16'], 'P-B': ['N7', 'H9'] };
  for (const [id, to] of Object.entries(want)) {
    const urls = links(byId.get(id));
    for (const t of to) assert.ok(urls.includes(byId.get(t).url), `${id} -> ${t}`);
  }
  assert.ok(!byId.get('D8').related.includes('D6'));
});

test('WL-188 / WL-190: the tracker title is the dated page, prices also print in lakh', () => {
  assert.equal(lakhRs(950000), 'Rs 9.5 lakh');
  assert.equal(lakhRs(1200000), 'Rs 12 lakh');
  assert.equal(lakhRs(45000), 'Rs 45,000');
  assert.doesNotMatch(byId.get('solar-price-tracker').title, /\/W/);
  assert.match(byId.get('solar-price-tracker').title, /[A-Z][a-z]+ \d{4}/);
  assert.match(byId.get('D14').title, /Rs [\d.]+ lakh/);
  for (const id of ['D8', 'D12', 'D13', 'D14', 'solar-price-tracker']) assert.match(text(id), /Rs [\d.]+ lakh to Rs [\d.]+ lakh/, id);
});

test('WL-236: wrong or reversed statements stay fixed', () => {
  assert.doesNotMatch(text('H9'), /line-interactive \(offline|offline \(line-interactive/);
  assert.match(text('H9'), /IEC 62040-3/);
  assert.doesNotMatch(text('H3'), /copper-wound motors run at the top/);
  assert.doesNotMatch(text('P-W'), /suits lights and sockets/);
  assert.doesNotMatch(read('data/inverter-codes.json'), /even in daylight/);
  const iec = byId.get('W3').content.sources.find((x) => /60898/.test(x.label));
  assert.match(iec.url, /publication\/21972$/);
  assert.doesNotMatch(text('N17'), /because of haze, fog or monsoon/);
  assert.equal(JSON.parse(content.D6).examples[3].inputs.volts, 12.8);
  assert.match(text('B5'), /home UPS/);
});

test('WL-192 / WL-193 / WL-194: slab rate named as a slab, the index date printed, no 2026 claim in the peak-hours title', () => {
  for (const id of ['H3', 'N12']) assert.doesNotMatch(text(id), /unprotected rate of Rs/, id);
  assert.match(text('bill-index'), /last checked on \d+ [A-Z][a-z]+ \d{4}/);
  assert.doesNotMatch(byId.get('F13').title, /2026/);
});

test('WL-195: llms.txt carries each page answer; the home title names a searched keyword', () => {
  const llms = files['generated/llms.txt'];
  assert.ok(llms.includes(`Answer: ${byId.get('D14').content.answer}`));
  assert.match(byId.get('H1').title, /^Wattlyst: Electricity Calculators Pakistan/);
});

test('WL-196 / WL-220 / WL-237: one installer term, the breaker margin on the hub, honest N2 meta, E3 label, 404 rule', () => {
  for (const p of live) assert.doesNotMatch(text(p.id), /DISCO-approved installer/, p.id);
  assert.match(text('D11'), /AEDB-certified installer/);
  assert.match(byId.get('P-W').content.key_facts.join(' '), /× [\d.]+ for motors and compressors/);
  assert.doesNotMatch(byId.get('N2').meta, /Crown|Fronus/);
  const e3 = byId.get('E3').content.tool;
  assert.match(e3.fields.find((f) => f.name === 'total_w').label, /running at the same time/);
  assert.doesNotMatch(read('specs/seo-rules.md'), /404 page with search/);
  assert.doesNotMatch(read('CLAUDE.md'), /E3 `load_check` and E4/);
});
