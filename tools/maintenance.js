// Upkeep report for the monthly and quarterly routine (build-plan Phase 6). Read-only: it lists what is
// due and never changes data/ or fails a build, so an old date can never block an urgent fix.
//
//   node tools/maintenance.js                       monthly report (Markdown)
//   node tools/maintenance.js --gsc=pages.csv       add the quarterly list: pages at Google position 8-20
//                                                   (Search Console > Performance > Pages > Export CSV)
//   node tools/maintenance.js --links               add the quarterly outbound-link check (network, one
//                                                   request a second): redirects, errors, host changes
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

/**
 * Every outside link the site prints or keeps as a source: URLs in the built pages and in data/*.json, each with
 * the pages or files that hold it (WL-212). Own-site links are left out.
 */
export function outboundLinks() {
  const site = readJson('data/site.json');
  const own = new URL(site.url).host;
  const map = new Map();
  const add = (u, where) => {
    let host;
    try { host = new URL(u).host; } catch { return; }
    if (host === own) return;
    if (!map.has(u)) map.set(u, new Set());
    map.get(u).add(where);
  };
  const walk = (x, where) => {
    // A whole-string URL is taken as it is (manual names carry spaces and brackets); text is scanned for links.
    if (typeof x === 'string' && /^https?:\/\/\S/.test(x) && !/[\n<>"]/.test(x)) add(x.trim(), where);
    else if (typeof x === 'string') { for (const m of x.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)) add(m[0].replace(/[.,;]$/, ''), where); }
    else if (Array.isArray(x)) x.forEach((y) => walk(y, where));
    else if (x && typeof x === 'object') Object.values(x).forEach((v) => walk(v, where));
  };
  for (const p of readJson('generated/manifest.json').pages.filter((r) => r.live)) walk(readJson(`generated/pages/${p.id}.json`).content, p.id);
  for (const f of readdirSync(join(root, 'data')).filter((x) => x.endsWith('.json')).sort()) walk(readJson(`data/${f}`), `data/${f}`);
  return [...map].map(([url, w]) => ({ url, where: [...w].sort() })).sort((a, b) => a.url.localeCompare(b.url));
}

/** Links that need no network to flag: plain http, and hosts data/maintenance.json lists as hijacked or retired. */
export function linkFlags(links, cfg) {
  const watch = cfg.link_watch_hosts || [];
  return links.flatMap((l) => {
    const host = new URL(l.url).host.replace(/^www\./, '');
    if (watch.some((h) => host === h || host.endsWith(`.${h}`))) return [{ ...l, flag: `host on the watch list (${host})` }];
    if (l.url.startsWith('http://')) return [{ ...l, flag: 'plain http: link the https address' }];
    return [];
  });
}

/**
 * The quarterly network pass: one HEAD per URL (GET when a host refuses HEAD), redirects not followed, so each
 * moved link is reported with its new address. 401/403/429 and timeouts are "check by hand" (bot walls and
 * Pakistani hosts that reset foreign connections), never "broken".
 */
export async function checkLinks(links, { fetchImpl = fetch, delayMs = 1000, timeoutMs = 15000 } = {}) {
  const out = [];
  for (const [i, l] of links.entries()) {
    if (i && delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const get = async (method) => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      try { return await fetchImpl(new URL(l.url).href, { method, redirect: 'manual', signal: ctl.signal, headers: { 'user-agent': 'Wattlyst link check (+https://wattlyst.com/)' } }); } finally { clearTimeout(t); }
    };
    let res;
    try {
      res = await get('HEAD');
      if ([403, 405, 501].includes(res.status)) res = await get('GET');
    } catch (e) {
      out.push({ ...l, status: 0, kind: 'check by hand', note: e.name === 'AbortError' ? 'timeout' : String(e.cause?.code || e.message) });
      continue;
    }
    const s = res.status;
    if (s >= 200 && s < 300) continue;
    if (s >= 300 && s < 400) {
      const to = new URL(res.headers.get('location') || '', l.url).href;
      const moved = new URL(to).host !== new URL(l.url).host;
      out.push({ ...l, status: s, kind: moved ? 'redirect to another host' : 'redirect', to });
    } else out.push({ ...l, status: s, kind: [401, 403, 429].includes(s) ? 'check by hand' : 'broken' });
  }
  return out;
}

export function report({ today = new Date().toISOString().slice(0, 10), gscCsv = null } = {}) {
  const cfg = readJson('data/maintenance.json');
  const site = readJson('data/site.json');
  const out = { today, stale_data: [], stale_points: [], bill_index: null, buyback: null, fuel: null, pages_to_review: [], thin_pages: [], refresh_candidates: null, link_flags: linkFlags(outboundLinks(), cfg), link_check: null, owner: [] };

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
  // Outbound links (WL-212): the no-network flags every month, the network pass quarterly with --links.
  const where = (l) => l.where.slice(0, 4).join(', ') + (l.where.length > 4 ? ` and ${l.where.length - 4} more` : '');
  L.push('## Outbound links', '');
  L.push(...(r.link_flags?.length ? r.link_flags.map((l) => `- ${l.url}: ${l.flag} (${where(l)})`) : ['- no http or watch-list links']));
  L.push(...(r.link_check == null ? ['- quarterly: run with --links to check every outside link (one request a second)'] : r.link_check.length
    ? r.link_check.map((l) => `- ${l.url}: ${l.kind}${l.status ? ` ${l.status}` : ''}${l.to ? ` -> ${l.to} (replace with the final address)` : ''}${l.note ? ` (${l.note})` : ''} (${where(l)})`)
    : ['- every outside link answered 200']), '');
  L.push('## Owner items', '', ...r.owner.map((o) => `- ${o}`), '');
  return L.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=');
  const gsc = arg('gsc');
  const r = report({ today: arg('today') || undefined, gscCsv: gsc ? readFileSync(gsc, 'utf8') : null });
  if (process.argv.includes('--links')) r.link_check = await checkLinks(outboundLinks());
  process.stdout.write(process.argv.includes('--json') ? JSON.stringify(r, null, 1) + '\n' : markdown(r, readJson('data/maintenance.json')));
}
