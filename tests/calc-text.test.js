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
