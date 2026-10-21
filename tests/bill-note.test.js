// Owner, 21 Oct 2026: bill results are estimates, not official bills or evidence; Terms and disclaimer say so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './load-data.js';
import { build } from '../tools/build.js';

const files = await build();
const pages = Object.entries(files).filter(([p]) => p.startsWith('generated/pages/')).map(([, b]) => JSON.parse(b));
const byId = new Map(pages.map((p) => [p.id, p]));
const read = (f) => readFileSync(join(root, f), 'utf8');
const note = JSON.parse(read('content/bill-note.json'));

test('every bill calculator prints the legal note with its outside complaint links', () => {
  const bill = pages.filter((p) => note.calcs.includes(p.content.tool?.calc));
  for (const id of ['F1', 'F2', 'F12', 'F13', 'F14', 'N1', 'N16', 'E1', 'D10', 'N4']) assert.ok(bill.some((p) => p.id === id), `${id} is a bill calculator`);
  for (const p of bill) {
    const l = p.content.tool.legal;
    assert.ok(l, `${p.id} has the note`);
    assert.match(l.t, /not an official bill/);
    assert.match(l.t, /evidence/);
    for (const k of l.l) assert.ok(l.t.includes(k.t) && /^https:\/\//.test(k.u), `${p.id}: ${k.t}`);
  }
  for (const p of pages.filter((x) => x.content.tool && !note.calcs.includes(x.content.tool.calc))) assert.equal(p.content.tool.legal, undefined, `${p.id} is not a bill page`);
});

test('the note is server-rendered under the result, also in embeds, with no typed digits', () => {
  const php = read('includes/class-wattlyst-render.php');
  assert.match(php, /\$this->credit\( \$t \) \. \$this->legal\( \$t \)/);
  assert.match(php, /class="wl-hint wl-legal"/);
  assert.doesNotMatch(note.text, /\d/);
});

test('Terms cover information only, not evidence, data age, liability and no affiliation; disclaimer links them', () => {
  const terms = byId.get('terms').content.html;
  for (const h of ['Not an official bill or evidence', 'No affiliation', 'Limitation of liability']) assert.ok(terms.includes(`<h2>${h}</h2>`), h);
  assert.match(terms, /information and education only/);
  assert.match(terms, /wrong or out of date/);
  assert.match(terms, /legal action/);
  assert.match(terms, /nepra\.org\.pk\/CAD-Database\/CMS-CAD\/cregister\.php/);
  assert.match(byId.get('disclaimer').content.html, /not evidence/);
});
