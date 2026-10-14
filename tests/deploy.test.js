// Audit Phase 2 guardrails (deploy safety and page speed): versioned browser modules fetched once,
// WordPress emoji script removed, catalog shipped once, CI actions pinned to a commit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { root } from './load-data.js';
import { build } from '../tools/build.js';
import { stripJs, staticImports, stampImports } from '../tools/lib/strip.js';

const files = await build();
const manifest = JSON.parse(files['generated/manifest.json']);
const dist = Object.entries(files).filter(([p]) => p.startsWith('dist/') && p.endsWith('.js'));
const php = (f) => readFileSync(join(root, 'includes', f), 'utf8');

test('stampImports versions static relative imports only', () => {
  const src = "import{a}from './core.js';import * as b from \"../x/y.js\";const u=import.meta.url;import('./z.js');import('https://cdn.example/m.js');const s='from';";
  const out = stampImports(src, 'abc');
  assert.match(out, /'\.\/core\.js\?ver=abc'/);
  assert.match(out, /"\.\.\/x\/y\.js\?ver=abc"/);
  assert.match(out, /import\('\.\/z\.js\?ver=abc'\)/);
  assert.match(out, /https:\/\/cdn\.example\/m\.js'/, 'absolute URLs untouched');
  assert.match(out, /import\.meta\.url/);
  assert.deepEqual(staticImports(stampImports(src, 'abc')), [], 'already stamped paths are not stamped twice');
});

test('every relative import in dist/ carries the manifest asset version (WL-56)', () => {
  const { ver } = manifest.assets;
  assert.match(ver, /^[0-9a-f]{10}$/);
  let seen = 0;
  for (const [p, code] of dist) {
    assert.deepEqual(staticImports(code), [], `${p} has an unversioned import`);
    for (const m of code.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      seen += 1;
      assert.ok(m[1].endsWith(`.js?ver=${ver}`), `${p}: ${m[1]}`);
    }
  }
  assert.ok(seen > 10, 'imports found');
  // The dynamic calculator import reuses the ver of the tool script's own URL.
  assert.match(files['dist/assets/js/wattlyst-tool.js'], /searchParams\.get\('ver'\)/);
});

test('asset version is the hash of the shipped JavaScript, so any JS change gives a new URL', () => {
  const hash = createHash('sha256');
  for (const [p, code] of dist) hash.update(`${p}\n${code.replaceAll(`?ver=${manifest.assets.ver}`, '')}\n`);
  assert.equal(hash.digest('hex').slice(0, 10), manifest.assets.ver);
});

test('assets.deps lists each engine module\'s whole import chain (for modulepreload)', () => {
  const { deps } = manifest.assets;
  for (const [p, code] of dist.filter(([q]) => q.startsWith('dist/engine/') && !q.endsWith('/index.js'))) {
    const f = p.slice('dist/engine/'.length);
    assert.ok(Array.isArray(deps[f]), `${f} missing from assets.deps`);
    const direct = stripJs(readFileSync(join(root, 'engine', f), 'utf8')).match(/from\s*'\.\/([\w-]+\.js)'/g) || [];
    for (const d of direct) {
      const name = d.match(/\.\/([\w-]+\.js)/)[1];
      assert.ok(deps[f].includes(name), `${f} imports ${name}`);
      for (const n of deps[name]) assert.ok(deps[f].includes(n), `${f} needs ${n} through ${name}`);
    }
    assert.ok(code.length > 0);
  }
});

test('PHP prints every script and modulepreload through script_url (one URL per module, WL-55)', () => {
  for (const f of ['class-wattlyst-head.php', 'class-wattlyst-pages.php', 'class-wattlyst-endpoints.php', 'class-wattlyst-render.php']) {
    const src = php(f);
    assert.doesNotMatch(src, /asset\(\s*'dist\//, `${f}: dist/ URL without the asset version`);
    assert.doesNotMatch(src, /'dist\/[^']*\?ver=/, `${f}: hand-built ?ver on a dist/ URL`);
  }
  const head = php('class-wattlyst-head.php');
  assert.match(head, /modulepreload[\s\S]*script_url/);
  assert.match(head, /module_deps\(/, 'preload includes the nested engine imports');
  assert.match(php('class-wattlyst-tools.php'), /\['assets'\]\['ver'\]/);
});

test('WordPress emoji script and styles are removed (WL-57)', () => {
  const head = php('class-wattlyst-head.php');
  assert.match(head, /add_action\( 'init', array\( \$this, 'no_emoji' \) \)/);
  for (const hook of ["'wp_head', 'print_emoji_detection_script', 7", "'wp_enqueue_scripts', 'wp_enqueue_emoji_styles'", "'wp_print_styles', 'print_emoji_styles'"]) {
    assert.ok(head.includes(`remove_action( ${hook} )`), hook);
  }
});

test('the appliance picker catalog ships ids only; names come from the appliance data (WL-58)', () => {
  const render = php('class-wattlyst-render.php');
  assert.match(render, /'catalog' => isset\( \$f\['catalog'\] \) \? self::catalog_groups\(/);
  const js = readFileSync(join(root, 'assets/js/wattlyst-tool.js'), 'utf8');
  assert.match(js, /for \(const \[cat, ids\] of f\.catalog/);
  assert.match(js, /cfg\.data\.appliances\[id\]\.name/);
  // Every catalog id must be in the page's appliance data, or the picker would throw.
  for (const [p, body] of Object.entries(files).filter(([q]) => q.startsWith('generated/pages/'))) {
    const tool = JSON.parse(body).content?.tool;
    for (const f of tool?.fields || []) {
      for (const a of f.catalog || []) assert.ok(tool.appliances?.[a.id], `${p}: ${a.id} missing from appliances`);
    }
  }
});

test('CI actions are pinned to a full commit SHA with the version in a comment (WL-68)', () => {
  const yml = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  const uses = [...yml.matchAll(/uses:\s*(\S+)(.*)/g)];
  assert.ok(uses.length >= 3);
  for (const [, ref, rest] of uses) {
    assert.match(ref, /^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/, `${ref} is not pinned to a SHA`);
    assert.match(rest, /#\s*v?\d+\.\d+\.\d+/, `${ref} needs its version as a comment`);
  }
  assert.match(yml, /permissions:\s*\n\s*contents: read/, 'workflow token is read-only');
  assert.match(yml, /lighthouse-check\.js[^\n]*http:\/\/127\.0\.0\.1:8080\/ /, 'homepage stays in the Lighthouse gate');
});

test('Lighthouse gate takes the median of three runs and needs 95 in every category (WL-02)', () => {
  const src = readFileSync(join(root, 'tools/lighthouse-check.js'), 'utf8');
  assert.match(src, /const MIN = 0\.95;/);
  assert.match(src, /i < 3/);
  assert.match(src, /\[1\]/, 'median of three');
  for (const c of ['performance', 'accessibility', 'best-practices', 'seo']) assert.ok(src.includes(c), c);
});
