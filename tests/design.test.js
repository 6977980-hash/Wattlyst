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

test('re-audit design follow-ups stay in place (WL-77 to WL-81)', () => {
  const head = read('includes/class-wattlyst-head.php');
  assert.match(head, /if \( ! \$page \) \{\s*\/\/[^\n]*\n\s*\$this->styles\(\);/, 'brand CSS also on WordPress 404 and search pages, which share the footer (WL-77)');
  const pages = read('includes/class-wattlyst-pages.php');
  for (const f of ['generate_404_title', 'generate_404_text', 'get_search_form']) assert.ok(pages.includes(`'${f}'`), `404 filter ${f}`);
  assert.match(pages, /is_404\(\) \? 'no-sidebar'/);
  const render = read('includes/class-wattlyst-render.php');
  assert.match(render, /<details class="wl-more"><summary>/, 'home hub cards fold extra tools; links stay in the HTML (WL-78)');
  assert.match(css, /@media \(max-width:600px\)\{[\s\S]*?\.wl-loads tr\.wl-load-row\{display:grid/, 'appliance rows stack on phones (WL-79)');
  assert.match(css, /@media print\{[^@]*\.wl-result:first-child \.wl-result-label[^{]*\{color:#000\}/, 'headline label readable in Save as PDF (WL-80)');
  assert.match(css, /@media print\{[^@]*print-color-adjust:exact/, 'chart bars print (WL-80)');
  assert.match(render, /'Rs&nbsp;'/, 'money values do not break after Rs (WL-81)');
});

test('home redesign (15 Oct 2026): own stylesheet on the home page only, hubs in the hero, planner in two columns', () => {
  const home = read('assets/css/wattlyst-home.css');
  assert.ok(!home.includes('<'), 'home CSS is inlined through wp_strip_all_tags too');
  assert.ok(Buffer.byteLength(home) < 20 * 1024, `home CSS is ${Buffer.byteLength(home)} bytes; keep it under 20 KB`);
  assert.ok(!/@import|@font-face|url\((?!"data:)/.test(home), 'no web fonts, imports or external images');
  for (const m of home.matchAll(/min-height:(\d+)px/g)) assert.ok(Number(m[1]) >= 44, `touch target ${m[0]}`);
  assert.match(home, /prefers-reduced-motion/);
  assert.ok(!/\.wl-card/.test(css.replace(/\.wl-cards/g, '')), 'task card styles live in the home stylesheet only');
  const head = read('includes/class-wattlyst-head.php');
  assert.match(head, /\$this->styles\( 'home' === \$page\['type'\] \)/, 'home stylesheet only on the home page');
  assert.match(read('tools/build.js'), /shown\.update\(read\('assets\/css\/wattlyst-home\.css'\)\)/, 'a home CSS deploy purges the page cache');
  const render = read('includes/class-wattlyst-render.php');
  assert.match(render, /function home_hero\([\s\S]*?\$this->page\['cards'\]/, 'hero chips: the same live hubs as the task cards');
  assert.match(render, /\$this->tool\( true \)/, 'planner: inputs and plan in two columns');
  assert.match(render, /<details class="wl-qa"/, 'home FAQ folds; schema still matches the visible questions');
  // Labels of different lengths no longer push their inputs up or down (owner screenshot, 15 Oct 2026).
  assert.match(css, /@supports \(grid-template-rows:subgrid\)\{[^@]*grid-template-rows:subgrid/);
  // GeneratePress sets .screen-reader-text to position:absolute!important; the phone list captions must override it.
  assert.match(css, /\.wl-loads tr\.wl-load-row td \.screen-reader-text\{position:static!important/);
});

test('design cross-check fixes (15 Oct 2026)', () => {
  const css = read('assets/css/wattlyst.css');
  const home = read('assets/css/wattlyst-home.css');
  // A checkbox field beside subgrid fields spans the same three rows; on one row it stretched the label row
  // and pushed every input of the bill calculators down.
  assert.match(css, /@supports \(grid-template-rows:subgrid\)\{[^@]*\.wl-fields>\.wl-check\{grid-row:span 3/);
  // The sticky header is 101 px tall on the live site; anchor jumps and the home plan column clear it.
  const stick = css.match(/--wl-stick:calc\(var\(--wp-admin--admin-bar--height,0px\) \+ (\d+)px\)/);
  assert.ok(stick && Number(stick[1]) > 101, 'sticky offset clears the header');
  assert.match(css, /scroll-padding-top:var\(--wl-stick\)/);
  assert.match(home, /\.wl-out\{position:sticky;top:var\(--wl-stick\)/);
  assert.ok(!/scroll-padding-top:\d|sticky;top:\d/.test(css + home), 'no fixed offsets left');
  // Phone appliance cards: the remove button shares the picker row (one row less per appliance).
  assert.match(css, /\.wl-loads tr\.wl-load-row td:last-child\{position:absolute/);
  assert.match(css, /tr\.wl-load-row:not\(:has\(\[data-k=start\]\)\)\{grid-template-columns:repeat\(3,/);
});

test('full audit Phase 1 (15 Oct 2026): home columns, phone headings, focus ring, result table cards, phone button', () => {
  const home = read('assets/css/wattlyst-home.css');
  const desk = home.slice(home.indexOf('@media (min-width:1200px)'));
  assert.match(desk, /\.wl-tool-split>\.wl-in\{grid-column:1;grid-row:1\}/, 'inputs pinned to column 1, so an error cannot swap the columns (WL-90)');
  assert.match(desk, /\.wl-tool-split>\.wl-out\{grid-column:2;/, 'plan pinned to column 2 (WL-90)');
  assert.match(home, /#wl-h1 \.wl-loads thead th\{[^}]*color:var\(--wl-muted\)/, 'phone list headings are not white on white (WL-133)');
  assert.match(css, /\.wl-loads input:focus,[^{]*\.wl-btn-secondary:focus\{outline:3px solid var\(--wl-ink\);[^}]*box-shadow:0 0 0 \d+px var\(--wl-focus\)/, 'dark ring plus amber halo (WL-134)');
  const cards = css.slice(css.indexOf('@media (max-width:768px){\n.wl-rtable'));
  assert.match(cards, /^@media \(max-width:768px\)\{\n\.wl-rtable \.wl-table-wrap\{overflow:visible/, 'every result table is cards below 769 px (WL-135)');
  assert.ok(!/\.wl-tool-split \.wl-rtable/.test(css), 'the card view is not limited to the home planner (WL-135)');
  assert.match(css, /\.wl-how-steps:has\(>ol\[hidden\]\)>\.wl-tg\{display:none\}/, 'hidden steps toggle leaves the tab order (WL-137)');
  assert.match(css, /\.wl-remove-row\{min-width:44px;min-height:44px;padding:0;/, 'remove button stays 44 px and clear of the picker (WL-137)');
  assert.match(css, /@media \(max-width:768px\)\{html\{scroll-padding-bottom:[^}]+\}\.wl-tool>\.wl-btn,\.wl-in>\.wl-btn\{position:sticky;bottom:/, 'Calculate button in view on phones (WL-139)');
  assert.match(read('assets/js/wattlyst-extra.js'), /\.replace\(\/Rs \/g, 'Rs\\u00a0'\)/, 'redrawn tables keep Rs with a no-break space (WL-137)');
});
