// Upkeep report for the monthly and quarterly routine (build-plan Phase 6). Read-only: it lists what is
// due and never changes data/ or fails a build, so an old date can never block an urgent fix.
//
//   node tools/maintenance.js                       monthly report (Markdown)
//   node tools/maintenance.js --gsc=pages.csv       add the quarterly list: pages at Google position 8-20
//                                                   (Search Console > Performance > Pages > Export CSV)
//   node tools/maintenance.js --json --today=2026-11-20
//
// Thresholds live in data/maintenance.json.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './lib/csv.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const DAY = 86400000;
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const age = (ymd, today) => Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${ymd}T00:00:00Z`)) / DAY);

/** Every "checked" / "*_checked" date and every dated price point ("date") in one data file. */
function dates(obj, path = '') {
  const out = [];
  if (Array.isArray(obj)) obj.forEach((v, i) => out.push(...dates(v, `${path}[${i}]`)));
  else if (obj && typeof obj === 'object') {
    if (obj.excluded) return out; // a point kept for reference only is not in use
    for (const [k, v] of Object.entries(obj)) {
      const p = path ? `${path}.${k}` : k;
      if (k === 'excluded_points') continue;
      if (isDate(v) && (k === 'checked' || k.endsWith('_checked'))) out.push({ kind: 'checked', path: p, date: v });
      // A price point's age is its price_date (when its prices are from); older files only have "date".
      else if (isDate(v) && (k === 'price_date' || (k === 'date' && !isDate(obj.price_date)))) out.push({ kind: 'point', path: p, date: v });
      else out.push(...dates(v, p));
    }
  }
  return out;
}

/** Visible words of a generated page (text fields only, markup removed). */
function words(content) {
  const parts = [];
  const walk = (x, k) => {
    if (typeof x === 'string') { if (!/^(url|id|module|calc|name|type|spec|checked|csv|csv_name)$/.test(k)) parts.push(x); }
    else if (Array.isArray(x)) x.forEach((y) => walk(y, k));
    else if (x && typeof x === 'object') for (const [kk, v] of Object.entries(x)) walk(v, kk);
  };
  walk(content, '');
  return parts.join(' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter((s) => /[a-z]/i.test(s)).length;
}

export function report({ today = new Date().toISOString().slice(0, 10), gscCsv = null } = {}) {
  const cfg = readJson('data/maintenance.json');
  const site = readJson('data/site.json');
  const out = { today, stale_data: [], stale_points: [], bill_index: null, buyback: null, fuel: null, pages_to_review: [], thin_pages: [], refresh_candidates: null, owner: [] };

  for (const f of readdirSync(join(root, 'data')).filter((x) => x.endsWith('.json')).sort()) {
    const all = dates(readJson(`data/${f}`));
    for (const d of all.filter((x) => x.kind === 'checked' && age(x.date, today) > cfg.data_max_age_days)) out.stale_data.push({ file: `data/${f}`, path: d.path, checked: d.date, days: age(d.date, today) });
    const pts = all.filter((x) => x.kind === 'point');
    const old = pts.filter((x) => age(x.date, today) > cfg.data_max_age_days);
    if (old.length) out.stale_points.push({ file: `data/${f}`, old: old.length, of: pts.length, oldest: old.map((x) => x.date).sort()[0] });
  }

  // Bill Index: one release per calendar month, so the newest month should be this month.
  const latest = readJson('data/bill-index.json').months[0]?.month;
  out.bill_index = { latest, due: !latest || latest < today.slice(0, 7) };

  // Fuel prices change every few days: flag the price once its effective date is older than the limit (WL-159).
  const fp = readJson('data/generator-fuel.json').prices;
  const fuelDay = [fp.petrol.effective, fp.diesel.effective].sort()[0];
  out.fuel = { effective: fuelDay, days: age(fuelDay, today), due: age(fuelDay, today) > cfg.fuel_price_max_age_days };

  const nb = readJson('data/tariff-pk-2026.json').net_billing || {};
  out.buyback = { verified: Boolean(nb.buyback_verified), checked: nb.buyback_checked || null };

  const manifest = readJson('generated/manifest.json');
  const live = manifest.pages.filter((p) => p.live);
  for (const p of live) {
    const g = readJson(`generated/pages/${p.id}.json`);
    if (g.reviewed && age(g.reviewed, today) > cfg.page_review_days) out.pages_to_review.push({ id: p.id, url: p.url, reviewed: g.reviewed, days: age(g.reviewed, today) });
    if (['tool', 'appliance', 'guide', 'lookup', 'data'].includes(p.type)) {
      const n = words(g.content);
      if (n < cfg.thin_page_words) out.thin_pages.push({ id: p.id, url: p.url, words: n });
    }
  }
  out.pages_to_review.sort((a, b) => b.days - a.days);

  if (gscCsv) {
    // Search Console "Pages" export: columns "Top pages", "Clicks", "Impressions", "CTR", "Position".
    const rows = parseCsv(gscCsv);
    const byUrl = new Map(live.map((p) => [p.url, p]));
    out.refresh_candidates = rows
      .map((r) => ({ url: (r['Top pages'] || r.Page || '').replace(/^https?:\/\/[^/]+/, '') || '/', position: Number(r.Position), impressions: Number(r.Impressions), clicks: Number(r.Clicks) }))
      .filter((r) => r.position >= cfg.refresh_position_min && r.position <= cfg.refresh_position_max)
      .map((r) => ({ ...r, id: byUrl.get(r.url)?.id || null }))
      .sort((a, b) => b.impressions - a.impressions);
  }

  if (!site.ads.enabled) out.owner.push('AdSense not switched on (data/site.json ads): after approval add pub id and the three ad unit numbers.');
  if (!site.consent.cmp) out.owner.push('No consent platform named (data/site.json consent.cmp).');
  if (site.reviewer.status !== 'signed_off') out.owner.push('Engineer review pending (data/site.json reviewer).');
  if (!site.organization_same_as.length) out.owner.push('No brand profiles in data/site.json organization_same_as.');
  if (!site.leads.enabled) out.owner.push('Solar quote form is off (data/site.json leads.enabled).');
  out.owner.push('Check Google Search Console and Bing Webmaster Tools: coverage errors, Core Web Vitals, manual actions.');
  return out;
}

export function markdown(r, cfg) {
  const L = [`# Wattlyst upkeep report, ${r.today}`, ''];
  L.push(`## Data older than ${cfg.data_max_age_days} days`, '');
  // "- none" only when neither list has a line (full audit 2026-10-15 WL-155).
  const stale = [...r.stale_data.map((d) => `- ${d.file} \`${d.path}\`: checked ${d.checked} (${d.days} days)`), ...r.stale_points.map((p) => `- ${p.file}: ${p.old} of ${p.of} price points in use are older than the limit (oldest ${p.oldest}); look for fresher sources`)];
  L.push(...(stale.length ? stale : ['- none']), '');
  L.push('## Monthly releases', '');
  L.push(`- Bill Index newest month: ${r.bill_index.latest}${r.bill_index.due ? ' (DUE: add the new month at the top of data/bill-index.json)' : ' (up to date)'}`);
  if (r.fuel) L.push(`- Fuel prices (data/generator-fuel.json): in force from ${r.fuel.effective}, ${r.fuel.days} days${r.fuel.due ? ` (DUE: older than ${cfg.fuel_price_max_age_days} days, refresh from the latest OGRA / Petroleum Division notification)` : ' (up to date)'}`);
  L.push(`- Net-billing buyback: ${r.buyback.verified ? 'verified' : `not verified on a NEPRA page (last checked ${r.buyback.checked})`}`, '');
  L.push(`## Pages not reviewed for ${cfg.page_review_days} days`, '');
  L.push(...(r.pages_to_review.length ? r.pages_to_review.map((p) => `- ${p.id} ${p.url}: ${p.reviewed} (${p.days} days)`) : ['- none']), '');
  L.push(`## Thin pages (under ${cfg.thin_page_words} words)`, '');
  L.push(...(r.thin_pages.length ? r.thin_pages.map((p) => `- ${p.id} ${p.url}: ${p.words} words (improve, merge or prune)`) : ['- none']), '');
  L.push(`## Quarterly: pages at position ${cfg.refresh_position_min}-${cfg.refresh_position_max}`, '');
  L.push(...(r.refresh_candidates === null ? ['- run with --gsc=<Search Console pages export.csv>'] : r.refresh_candidates.length ? r.refresh_candidates.map((p) => `- ${p.id || '(not a Wattlyst page)'} ${p.url}: position ${p.position}, ${p.impressions} impressions`) : ['- none']), '');
  L.push('## Owner items', '', ...r.owner.map((o) => `- ${o}`), '');
  return L.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
  const gsc = arg('gsc');
  const r = report({ today: arg('today') || undefined, gscCsv: gsc ? readFileSync(gsc, 'utf8') : null });
  process.stdout.write(process.argv.includes('--json') ? JSON.stringify(r, null, 1) + '\n' : markdown(r, readJson('data/maintenance.json')));
}
