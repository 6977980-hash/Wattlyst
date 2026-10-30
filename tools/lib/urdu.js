// Urdu version (OW-8, plan in the project folder urdu/urdu-version-plan.md). An Urdu page is a row of
// specs/keyword-map-ur.csv: its own URL under /ur/, Urdu title and meta, and `en_id`, the English page it translates.
// Its words come from content/ur/pages/<en_id>.json, laid over the English page's content: the calculator, its
// defaults and the inputs of every example and table row stay the English page's, so both languages print the
// same engine numbers (rule 8). content/ur/ also holds the UI words the PHP prints (ui.json), the Urdu error and
// notice texts (messages.json), the bill legal note (bill-note.json) and the trust pages (trust/<id>.html).
// The csv `status` column is the one switch: draft until an Urdu reader has checked the page.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from './csv.js';

export const UR_PREFIX = 'ur-';
const UR_HOME = '/ur/';

export function loadUr(root) {
  const dir = join(root, 'content/ur');
  const json = (p) => JSON.parse(readFileSync(join(dir, p), 'utf8'));
  const pages = {};
  for (const f of readdirSync(join(dir, 'pages')).filter((x) => x.endsWith('.json')).sort()) pages[f.replace(/\.json$/, '')] = json(`pages/${f}`);
  const trust = {};
  for (const f of readdirSync(join(dir, 'trust')).filter((x) => x.endsWith('.html')).sort()) trust[f.replace(/\.html$/, '')] = readFileSync(join(dir, 'trust', f), 'utf8');
  return { rows: parseCsv(readFileSync(join(root, 'specs/keyword-map-ur.csv'), 'utf8')), pages, trust, ui: json('ui.json'), messages: json('messages.json'), billNote: json('bill-note.json') };
}

/** Manifest rows for the Urdu pages: same shape as the English rows, plus lang and en (the English twin). */
export function urRows(ur, enRows, fail) {
  const byId = new Map(enRows.map((r) => [r.id, r]));
  return ur.rows.map((u) => {
    const en = byId.get(u.en_id);
    if (!en) fail(`specs/keyword-map-ur.csv ${u.id}: en_id ${u.en_id} is not a page`);
    if (u.id !== UR_PREFIX + u.en_id) fail(`specs/keyword-map-ur.csv ${u.id}: id must be ${UR_PREFIX}${u.en_id}`);
    if (!u.url.startsWith(UR_HOME)) fail(`${u.id}: an Urdu URL starts with ${UR_HOME}`);
    // Same slug as the English page (plan section 2), so a link is the English URL with /ur in front.
    if (u.url !== UR_HOME && u.url !== `/ur${en.url}`) fail(`${u.id}: URL must be /ur${en.url}`);
    if (!['draft', 'publish'].includes(u.status)) fail(`${u.id}: status must be draft or publish`);
    const type = u.type || en.type;
    return { id: u.id, lang: 'ur', en: u.en_id, type, silo: en.silo, url: u.url, h1: u.h1 || '', title: u.title, meta: u.meta_description, primary_keyword: u.primary_keyword, wave: 0, status: u.status };
  });
}

/** The Urdu row a page links to instead of the English one: its Urdu twin when that exists and is live, or when the linking page is not live yet either (drafts link to drafts). */
export function urTarget(rows, id, fromLive) {
  const t = rows.find((r) => r.id === (id.startsWith(UR_PREFIX) ? id : UR_PREFIX + id));
  return t && (t.live || !fromLive) ? t : null;
}

/** Urdu content: the English page with the Urdu words of content/ur/pages/<ID>.json. */
export function urContent(en, ur, id, fail) {
  const need = (k) => { if (ur[k] === undefined) fail(`content/ur/pages/${id}.json: missing ${k}`); return ur[k]; };
  if (!en) return { ...ur, id, status: 'publish' };
  const out = { ...en, id, status: 'publish', h1: need('h1'), anchor: ur.anchor, answer: ur.answer ?? '', intro: ur.intro ?? '', key_facts: ur.key_facts || [], formula: ur.formula, sections: ur.sections || [], mistakes: ur.mistakes || [], safety: ur.safety ?? '', faq: ur.faq || [], literal_numbers: [...(en.literal_numbers || []), ...(ur.literal_numbers || [])] };
  delete out.how_ur; // the Roman Urdu toggle belongs to the English page
  if (en.calc) {
    out.submit = need('submit');
    if (en.how) out.how = need('how');
    out.fields = (en.fields || []).map((f) => {
      const w = ur.fields?.[f.name];
      if (!w?.label) fail(`content/ur/pages/${id}.json: field ${f.name} needs an Urdu label`);
      for (const k of ['hint', 'placeholder']) if (f[k] && !w[k]) fail(`content/ur/pages/${id}.json: field ${f.name} needs an Urdu ${k}`);
      const o = { ...f, ...w };
      if (f.options && !f.options_from) {
        if (!Array.isArray(w.options) || w.options.length !== f.options.length) fail(`content/ur/pages/${id}.json: field ${f.name} needs one Urdu label per option`);
        o.options = f.options.map(([v], n) => [v, w.options[n]]);
      }
      return o;
    });
    out.outputs = (en.outputs || []).map((o) => {
      const label = ur.outputs?.[o.key];
      if (!label) fail(`content/ur/pages/${id}.json: output ${o.key} needs an Urdu label`);
      const { label_ur, ...rest } = o;
      return { ...rest, label };
    });
  }
  if (en.examples) {
    if ((ur.examples || []).length !== en.examples.length) fail(`content/ur/pages/${id}.json: needs ${en.examples.length} examples (same inputs as the English page)`);
    out.examples = en.examples.map((ex, n) => ({ ...ex, title: ur.examples[n].title, text: ur.examples[n].text }));
  }
  if (en.table) {
    const t = need('table');
    if ((t.columns || []).length !== en.table.columns.length) fail(`content/ur/pages/${id}.json: table needs ${en.table.columns.length} columns`);
    out.table = { ...en.table, caption: t.caption, columns: en.table.columns.map((c, n) => ({ label: t.columns[n].label, tpl: t.columns[n].tpl ?? c.tpl })) };
    if (t.row_head) {
      if ((t.labels || []).length !== en.table.rows.length) fail(`content/ur/pages/${id}.json: table row_head needs one label per row`);
      Object.assign(out.table, { row_head: t.row_head, rows: en.table.rows.map(({ label, ...r }, n) => ({ ...r, label: t.labels[n] })) });
    } else {
      delete out.table.row_head;
      out.table.rows = en.table.rows.map(({ label, ...r }) => r);
    }
  }
  return out;
}

/**
 * Urdu error and notice texts for one page (tool `msg`): every exact code the English page ships, plus the generic
 * codes of its own fields, written out with the Urdu field label (engine/messages.js uses a page text before its
 * English patterns, so no Urdu reaches the shared script).
 */
export function urMessages(codes, fields, ur, id, fail, tariff) {
  const out = {};
  // Codes the English script words from a pattern or a fallback: the slab caps carry their limit from data/ (WL-107).
  for (const cat of ['protected', 'lifeline']) {
    const max = tariff?.[cat]?.at(-1)?.upto;
    if (max && codes.includes('tariff_data_missing')) out[`${cat}_max_${max}_units`] = ur.messages.slab_cap[cat].replace('{n}', max);
  }
  for (const code of ['internal_error', 'internal_negative']) out[code] = ur.messages.fallback;
  for (const code of codes) {
    const t = ur.messages.exact[code];
    if (!t) fail(`${id}: content/ur/messages.json has no Urdu text for ${code}`);
    out[code] = t;
  }
  const g = ur.messages.generic;
  for (const f of fields) {
    if (f.type === 'loads' || f.type === 'checkbox') continue;
    const name = f.label + (f.unit ? ` (${f.unit})` : '');
    const eg = f.default != null && typeof f.default !== 'object' && !f.options ? g.example.replace('{d}', f.default) : '';
    const fill = (s) => s.replace('{f}', name).replace('{eg}', eg);
    out[`${f.name}_required`] = fill(g.required);
    out[`${f.name}_invalid`] = fill(f.options ? g.choose : g.invalid);
    out[`${f.name}_must_be_positive`] = fill(g.must_be_positive);
    out[`${f.name}_too_small`] = fill(g.too_small);
    out[`${f.name}_too_large`] = fill(g.too_large);
  }
  return out;
}

/** hreflang pairs: both pages live, so neither points at a URL that does not exist. */
export function pairUp(rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const u of rows.filter((r) => r.lang === 'ur')) {
    const en = byId.get(u.en);
    if (u.live && en.live) {
      u.alt = { en: en.url, ur: u.url };
      en.alt = { en: en.url, ur: u.url };
    }
  }
}

export { UR_HOME };
