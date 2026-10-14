// Monetisation (build-plan Phase 6): AdSense slot settings, the solar quote request form and affiliate
// links. Everything is checked here so a bad value in data/ fails the build instead of reaching the site.
// The rules come from specs/seo-rules.md 7-8: max three labelled ad units per page, affiliate links carry
// rel="sponsored" and a visible disclosure, no claim the page cannot prove.
import { render } from '../../engine/format.js';

/** The three manual ad units a tool page may carry (seo-rules.md 8). */
export const AD_SLOTS = ['content-1', 'content-2', 'content-3'];

function fill(text, site, where, fail) {
  const s = render(text, { site });
  if (s === null) fail(`${where}: placeholder has no value`);
  return s;
}

/** ads block for the manifest: validated pub id and slot numbers. */
export function adsConfig(site, fail) {
  const a = site.ads || {};
  if (a.adsense_pub_id !== null && !/^pub-\d{10,20}$/.test(String(a.adsense_pub_id))) fail('data/site.json ads.adsense_pub_id must be null or pub-<digits>');
  const slots = a.slots || {};
  const keys = Object.keys(slots);
  if (keys.join() !== AD_SLOTS.join()) fail(`data/site.json ads.slots must have exactly ${AD_SLOTS.join(', ')}`);
  for (const k of keys) if (slots[k] !== null && !/^\d{6,20}$/.test(String(slots[k]))) fail(`data/site.json ads.slots.${k} must be null or the AdSense ad unit number`);
  if (a.enabled && !a.adsense_pub_id) fail('data/site.json ads.enabled needs adsense_pub_id');
  return { enabled: Boolean(a.enabled), adsense_pub_id: a.adsense_pub_id, slots };
}

/** leads block for the manifest: settings, the page ids that show the form, city options and rendered text. */
export function leadsConfig(site, form, rows, cities, fail) {
  const l = site.leads || {};
  for (const k of ['retention_days', 'rate_limit_per_hour', 'token_max_age_days']) if (!(Number.isInteger(l[k]) && l[k] > 0)) fail(`data/site.json leads.${k} must be a positive whole number`);
  for (const id of l.pages || []) if (!rows.some((r) => r.id === id)) fail(`data/site.json leads.pages: unknown page ${id}`);
  if (l.client_ip_header != null && !/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(l.client_ip_header)) fail('data/site.json leads.client_ip_header must be a header name (e.g. X-Forwarded-For) or null');
  const success = rows.find((r) => r.id === form.success_link);
  if (!success) fail('content/lead-form.json success_link: unknown page');
  const text = (v, where) => (typeof v === 'string' ? fill(v, site, `content/lead-form.json ${where}`, fail) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, text(x, `${where}.${k}`)])));
  const copy = {};
  for (const [k, v] of Object.entries(form)) if (!k.startsWith('_') && k !== 'success_link') copy[k] = text(v, k);
  return {
    enabled: Boolean(l.enabled),
    pages: l.pages || [],
    retention_days: l.retention_days,
    rate_limit_per_hour: l.rate_limit_per_hour,
    token_max_age_days: l.token_max_age_days,
    client_ip_header: l.client_ip_header || '',
    cities: Object.keys(cities).map((id) => ({ id, name: id.replace(/\b\w/g, (m) => m.toUpperCase()) })),
    success_url: success.url,
    copy,
  };
}

/** Affiliate links per page id: { id: { disclosure, links: [{label, url, note}] } } for live pages only. */
export function affiliatesByPage(affiliates, site, rows, fail) {
  const out = {};
  const disclosure = fill(affiliates.disclosure || '', site, 'data/affiliates.json disclosure', fail);
  if (affiliates.links.length && !disclosure) fail('data/affiliates.json needs a disclosure');
  for (const [i, a] of affiliates.links.entries()) {
    const where = `data/affiliates.json links[${i}]`;
    if (!a.label || !a.id) fail(`${where}: id and label are required`);
    if (!/^https:\/\/[^\s"<>]+$/.test(a.url || '')) fail(`${where}: url must be https`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.checked || '')) fail(`${where}: checked date (YYYY-MM-DD) is required`);
    for (const id of a.pages || []) {
      const r = rows.find((x) => x.id === id);
      if (!r) fail(`${where}: unknown page ${id}`);
      if (!r.live) continue;
      out[id] = out[id] || { disclosure, links: [] };
      out[id].links.push({ label: a.label, url: a.url, ...(a.note ? { note: a.note } : {}) });
    }
  }
  return out;
}
