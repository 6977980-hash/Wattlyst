// Page text vs the engine (audit WL-12, WL-23): numbers written in words must not repeat a figure the page
// prints from the engine (they would go stale when a default or example changes), and the live "how"
// text must stay true when the user edits the inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './load-data.js';
import { build } from '../tools/build.js';

const files = await build();
const pages = Object.entries(files).filter(([p]) => p.startsWith('generated/pages/')).map(([, b]) => JSON.parse(b));

const SMALL = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const WORD = `(?:${Object.keys(SMALL).join('|')}|hundred|thousand)`;
const PHRASE = new RegExp(`\\b(?:an? )?${WORD}(?:[- ]${WORD})*(?: and a half)?\\b`, 'gi');

/** "fifteen hundred" -> 1500, "a thousand" -> 1000, "three and a half thousand" is read as 3.5 thousand. */
export function wordsToNumber(phrase) {
  const words = phrase.toLowerCase().replace(/^an? (?=hundred|thousand)/, 'one ').replace(/^an? /, '').split(/[- ]/);
  let total = 0;
  let cur = 0;
  let last = 1;
  for (let k = 0; k < words.length; k++) {
    const w = words[k];
    if (w in SMALL) cur += SMALL[w];
    else if (w === 'hundred') { cur = (cur || 1) * 100; last = 100; }
    else if (w === 'thousand') { total += (cur || 1) * 1000; cur = 0; last = 1000; }
    else if (w === 'and' && words[k + 1] === 'a' && words[k + 2] === 'half') { cur += 0.5; k += 2; last = 1; }
  }
  return total + cur;
}

// Small counts (two panels, three-phase, twelve-volt blocks) are ordinary words; figures from twenty up are checked.
const MIN = 20;
const TEXT_KEYS = (c) => [c.answer, c.intro, c.how, c.how_ur, c.safety, ...(c.key_facts || []), ...(c.mistakes || []),
  ...(c.faq || []).flatMap((x) => [x.q, x.a]), ...(c.examples || []).flatMap((x) => [x.title, x.text]),
  c.table?.caption, ...(c.sections || []).flatMap((s) => [s.h2, ...(s.p || [])])].filter(Boolean);

test('wordsToNumber reads the phrases used on the site', () => {
  assert.equal(wordsToNumber('a thousand'), 1000);
  assert.equal(wordsToNumber('fifteen hundred'), 1500);
  assert.equal(wordsToNumber('twenty-four'), 24);
  assert.equal(wordsToNumber('seven hundred'), 700);
  assert.equal(wordsToNumber('two thousand'), 2000);
  assert.equal(wordsToNumber('a one hundred'), 100);
});

test('no number in words repeats a figure the page prints from the engine or data (WL-23)', () => {
  const dir = join(root, 'content/pages');
  const bad = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const c = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const page = pages.find((p) => p.id === c.id);
    if (!page?.content) continue;
    const g = page.content;
    // Every figure the built page prints in digits (results, examples, tables, text).
    const printed = new Set([...JSON.stringify({ ...g, tool: { outputs: g.tool?.outputs?.map((o) => o.value) } }).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, ''))));
    const allowed = c.literal_numbers || [];
    for (const t of TEXT_KEYS(c)) {
      let s = t.replace(/\{\{[^}]*\}\}/g, '#');
      for (const a of allowed) s = s.split(a).join('');
      for (const m of s.matchAll(PHRASE)) {
        // A bare "hundred" ("a few hundred watts") is not a figure, and "a thousand" / "one thousand" is the
        // watts-to-kilowatts factor, not a value that can go stale.
        if (/^(?:hundred|thousand|(?:a|one) thousand)$/i.test(m[0])) continue;
        const v = wordsToNumber(m[0]);
        if (v >= MIN && printed.has(v)) bad.push(`${c.id}: "${m[0]}" (= ${v}) in "${t.slice(0, 90)}"`);
      }
    }
  }
  assert.deepEqual(bad, [], 'write the figure as a {{placeholder}}, or list the phrase in literal_numbers if it is a fixed fact');
});

// ---- Live "how" text (WL-12) ----
const { data } = await (await import('../tools/build.js')).loadInputs();
const { run } = await import('../engine/index.js');
const { render } = await import('../engine/format.js');

const NUM = String.raw`(-?\d[\d,]*(?:\.\d+)?%?)`;
const UNIT = String.raw`(?:\s*[A-Za-z%²³°/·()]+){0,3}`;
// "a × b = c" and "a ÷ b = c" written as a pair (not the tail of a longer chain or a "to" range).
const PAIR = new RegExp(String.raw`(?<![×÷(+−\d.,]\s*(?:Rs\s*)?)(?<![×÷(+−]\s*[\d,.]*)(?<!\b(?:to|by)\s+(?:Rs\s*)?)(?:Rs\s*)?${NUM}${UNIT}\s*([×÷])\s*(?:Rs\s*)?${NUM}${UNIT}\s*=\s*(?:Rs\s*)?${NUM}`, 'g');
const value = (s) => Number(s.replace(/[,%]/g, '')) / (s.endsWith('%') ? 100 : 1);
const decimals = (s) => (s.replace('%', '').split('.')[1] || '').length + (s.endsWith('%') ? 2 : 0);

/** Pairs whose printed result does not follow from the printed figures (display rounding allowed; W/kW scale allowed). */
export function wrongArithmetic(text) {
  const bad = [];
  for (const m of text.matchAll(PAIR)) {
    if (/^\s*[×÷]/.test(text.slice(m.index + m[0].length))) continue; // part of a longer chain
    const [a, op, b, c] = [value(m[1]), m[2], value(m[3]), value(m[4])];
    const exp = op === '×' ? a * b : a / b;
    // A small whole number is a count and exact; any other figure may be off by half its last shown digit.
    const half = (t, v) => (decimals(t) === 0 && Math.abs(v) < 10 ? 0 : 0.5 * 10 ** -decimals(t));
    const ea = half(m[1], a);
    const eb = half(m[3], b);
    const err = (op === '×' ? Math.abs(a) * eb + Math.abs(b) * ea + ea * eb : (Math.abs(a) * eb + Math.abs(b) * ea) / (b * b)) + 0.5 * 10 ** -decimals(m[4]);
    const ok = (v) => Math.abs(exp - v) <= err * Math.max(1, Math.abs(v / c || 1)) + Math.abs(v) * 0.005 + 1e-9;
    if (!ok(c) && !ok(c * 1000) && !ok(c / 1000)) bad.push(`${m[0]} (should be ${+exp.toPrecision(6)})`);
  }
  return bad;
}

test('wrongArithmetic catches the audit examples and passes good text', () => {
  assert.equal(wrongArithmetic('Rs 124.38 per watt × 6,000 W = Rs 684,063').length, 1);
  assert.equal(wrongArithmetic('2 motor × 1,000 W = 1,600 W').length, 1);
  assert.equal(wrongArithmetic('1,000 W ÷ 24 V × 1.25 = 52.1 A').length, 0);
  assert.equal(wrongArithmetic('Rs 120.00 per watt × 10,000 W = Rs 1,200,000').length, 0);
  assert.equal(wrongArithmetic('5,540 W × 1.25 = 6.93 kW').length, 0);
});

const tools = pages.filter((p) => p.content?.tool?.how);

test('"how" templates print what the engine used, not a default or a rounded input (WL-12)', () => {
  const bad = [];
  for (const p of tools) {
    const t = p.content.tool;
    const names = new Set(t.fields.map((f) => f.name));
    const src = JSON.parse(readFileSync(join(root, `content/pages/${p.id}.json`), 'utf8'));
    const editable = new Set(src.fields.flatMap((f) => [f.name, typeof f.default === 'string' && f.default.startsWith('@') ? f.default.slice(1) : null]).filter(Boolean));
    for (const tpl of [t.how.tpl, t.how.tpl_ur].filter(Boolean)) {
      for (const [, path, spec] of tpl.matchAll(/\{\{\s*([\w.-]+)\s*(?:\|\s*(\w+))?\s*\}\}/g)) {
        const [scope, key] = path.split('.');
        if (scope === 'd' && editable.has(key)) bad.push(`${p.id}: {{${path}}} is a default the user can change; print the engine's out value`);
        if (spec === 'int' && (scope === 'in' || (scope === 'out' && names.has(key)))) bad.push(`${p.id}: {{${path}|int}} rounds what the user typed`);
      }
      if (/\}\}[,.]?\d/.test(tpl)) bad.push(`${p.id}: digits glued to a placeholder`);
    }
  }
  assert.deepEqual(bad, []);
});

test('"how" text renders and its arithmetic holds with edited inputs (WL-12)', () => {
  const bad = [];
  for (const p of tools) {
    const t = p.content.tool;
    const browserData = { defaults: data.defaults, appliances: t.appliances, ...Object.fromEntries(t.data_keys.map((k) => [k, data[k]])) };
    const base = { ...t.fixed_inputs, ...Object.fromEntries(t.fields.filter((f) => f.default !== undefined && f.default !== null).map((f) => [f.name, f.default])) };
    const variants = [['default', base]];
    for (const f of t.fields) {
      if (typeof f.default !== 'number') continue; // shared links can carry any number, also for a select
      for (const k of [1.37, 0.73]) variants.push([`${f.name} × ${k}`, { ...base, [f.name]: Math.round(f.default * k * 100) / 100 }]);
    }
    for (const [name, inputs] of variants) {
      const r = run(t.calc, inputs, browserData);
      if (!r.ok) continue;
      for (const tpl of [t.how.tpl, t.how.tpl_ur].filter(Boolean)) {
        const s = render(tpl, { in: r, out: r, d: browserData.defaults, data: browserData });
        if (s === null) { bad.push(`${p.id} (${name}): a placeholder has no value in the browser`); continue; }
        for (const w of wrongArithmetic(s)) bad.push(`${p.id} (${name}): ${w}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

// ---- Price and FPA data (WL-11, WL-13, WL-15) ----
const { solar_price_estimate } = await import('../engine/prices.js');

test('solar prices never fall as the system size rises, in data and between listed sizes (WL-11)', () => {
  for (const type of ['on-grid', 'hybrid']) {
    const rows = data.solar_prices.systems.filter((r) => r.type === type).sort((a, b) => a.kw - b.kw);
    for (let n = 1; n < rows.length; n++) {
      for (const k of ['low_rs', 'high_rs']) assert.ok(rows[n][k] >= rows[n - 1][k], `${type} ${rows[n].kw} kW ${k} below ${rows[n - 1].kw} kW`);
    }
    let prev = null;
    for (let kw = 1; kw <= 25.0001; kw += 0.1) {
      const r = solar_price_estimate({ kwp: kw, type }, data);
      if (prev) for (const k of ['price_low_rs', 'price_high_rs']) assert.ok(r[k] >= prev[k] - 1e-6, `${type} ${kw.toFixed(1)} kW ${k} ${r[k]} < ${prev[k]}`);
      prev = r;
    }
  }
});

test('solar price points in use are dated, re-checked and not older than the limit; one publisher counts once (WL-15)', () => {
  const sp = data.solar_prices;
  const cfg = JSON.parse(readFileSync(join(root, 'data/maintenance.json'), 'utf8'));
  const days = (a, b) => (Date.parse(b) - Date.parse(a)) / 864e5;
  const used = [...sp.panel_rs_per_w.sources.filter((s) => !s.excluded), ...sp.systems.flatMap((s) => s.sources)];
  for (const s of used) {
    assert.match(s.price_date || '', /^\d{4}-\d{2}-\d{2}$/, `${s.url}: price_date`);
    assert.ok(days(s.price_date, sp._meta.checked) <= cfg.price_point_max_age_days, `${s.url}: price date ${s.price_date} too old`);
    assert.ok(days(s.checked, sp._meta.checked) <= cfg.data_max_age_days, `${s.url}: not re-checked`);
  }
  for (const r of sp.systems) {
    const pubs = new Set(r.sources.map((s) => s.publisher.split(' (')[0]));
    assert.equal(r.n_sources, pubs.size, `${r.type} ${r.kw} kW: n_sources counts publishers`);
  }
});

test('one FPA source: the Bill Index; F14 pre-fills its newest NEPRA-verified month (WL-13)', () => {
  assert.equal(data.tariff.addons_secondary.fpa_per_unit.latest, undefined, 'no FPA copy in the tariff file');
  const newest = data.bill_index.months.find((m) => m.fpa_verified === true);
  const f14 = pages.find((p) => p.id === 'F14').content.tool.fields.find((f) => f.name === 'fpa_per_unit');
  assert.equal(f14.default, newest.fpa_per_unit);
});
