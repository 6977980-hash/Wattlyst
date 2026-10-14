// Design Phase 7 guardrails: the look is CSS only, inlined safely, and keeps the audit fixes it restyled.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './load-data.js';

const read = (f) => readFileSync(join(root, f), 'utf8');
const css = read('assets/css/wattlyst.css');

test('inlined CSS survives wp_strip_all_tags and stays small', () => {
  assert.ok(!css.includes('<'), 'a "<" (for example an unencoded SVG data URI) would be stripped by wp_strip_all_tags');
  assert.ok(Buffer.byteLength(css) < 40 * 1024, `CSS is ${Buffer.byteLength(css)} bytes; keep the inlined styles under 40 KB`);
  assert.ok(!/@import|@font-face|url\((?!"data:)/.test(css), 'no web fonts, imports or external images');
});

test('restyle keeps the audit fixes: focus ring, notice colours, touch targets, phone layout, table scroll box', () => {
  assert.match(css, /\.wl-btn:focus-visible[^{]*\{outline:3px solid var\(--wl-ink\)/, 'dark focus ring (WL-59)');
  assert.match(css, /\.wl-notice\{border-left-color:#b25e00;background:#fff8e6/, 'amber notice distinct from the red error (WL-54)');
  assert.match(css, /\.wl-error\{[^}]*#b00020/);
  assert.match(css, /\.wl-table-wrap\{overflow-x:auto;position:relative/, 'table scroll box (WL-05)');
  assert.match(css, /@media \(max-width:768px\)\{[\s\S]*?\.wl-breadcrumb ol\{flex-wrap:nowrap/, 'one-line breadcrumb on phones (WL-51)');
  assert.match(css, /\.wl-page \[hidden\]\{display:none!important\}/, 'hidden result cards stay hidden');
  for (const m of css.matchAll(/min-height:(\d+)px/g)) assert.ok(Number(m[1]) >= 44, `touch target ${m[0]}`);
  assert.match(css, /prefers-reduced-motion/);
});

test('page header, byline and footer hub links come from the same data as the rest of the page', () => {
  const render = read('includes/class-wattlyst-render.php');
  assert.match(render, /<header class="wl-hero">/);
  assert.match(render, /function byline\(\)[\s\S]*?\$this->page\['reviewed'\][\s\S]*?self::date\(/, 'byline date = Last reviewed date');
  assert.match(render, /function author_box\(\)[\s\S]*?\$this->author\(\)/, 'author box and byline share one lookup');
  const pages = read('includes/class-wattlyst-pages.php');
  assert.match(pages, /function footer\([\s\S]*?manifest\(\)\['nav'\][\s\S]*?! empty\( \$row\['live'\] \)/, 'footer hub links: live nav hubs only');
});
