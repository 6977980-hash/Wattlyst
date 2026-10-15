// Data pages (Phase 5): the Pakistan Electricity Bill Index and the Pakistan Solar Price Tracker.
// Every bill comes from the engine (bill_total) and every price from data/; this file only arranges them
// into a template scope, tables, a bar chart, a CSV download and the Dataset schema facts.
import { fmt } from '../../engine/format.js';

const csvCell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const toCsv = (head, rows) => [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** "up Rs 120 (2.1%)", "down Rs 80 (0.5%)" or "unchanged". */
function changeText(diff, pct) {
  if (Math.abs(diff) < 0.5) return 'unchanged';
  return `${diff > 0 ? 'up' : 'down'} ${fmt(Math.abs(diff), 'rs')} (${fmt(Math.abs(pct), '1')}%)`;
}

/** Bar chart rows: one group per label, bars scaled to the largest value in the chart. */
function chart(caption, groups, unit) {
  const max = Math.max(...groups.flatMap((g) => g.bars.map((b) => b.value)));
  return {
    caption,
    unit,
    groups: groups.map((g) => ({ label: g.label, bars: g.bars.map((b) => ({ name: b.name, text: b.text, pct: round((b.value / max) * 100, 1), ...(b.low !== undefined ? { from_pct: round((b.low / max) * 100, 1) } : {}) })) })),
  };
}

export function billIndex(ctx, fail) {
  const ix = ctx.data.bill_index;
  const bill = ctx.modules.bill.bill_total;
  const [cur, prev] = ix.months;
  if (!cur || !prev) fail('bill-index: data/bill-index.json needs at least two months');
  const run = (m, l) => {
    const r = bill({ units: l.units, sanctioned_kw: ix.sanctioned_kw, protected: l.category === 'protected', fpa_per_unit: m.fpa_per_unit, period: m.qta_period }, ctx.data);
    if (!r.ok) fail(`bill-index: ${m.month} ${l.units} ${l.category} gives ${r.error}`);
    return r;
  };
  const levels = ix.levels.map((l) => {
    const a = run(cur, l);
    const b = run(prev, l);
    // Bills are paid in whole rupees, so the change is taken between the rounded totals the table shows.
    const diff = Math.round(a.total_rs) - Math.round(b.total_rs);
    const pct = (diff / b.total_rs) * 100;
    return { ...l, key: `${l.category === 'protected' ? 'p' : 'u'}${l.units}`, label: `${fmt(l.units, 'int')} units, ${l.category}`, cur: a, prev: b, diff, pct };
  });
  const scope = {
    cur: { label: cur.label, fpa: cur.fpa_per_unit, fpa_for: cur.fpa_for, qta_period: cur.qta_period.replace('..', ' to ') },
    prev: { label: prev.label, fpa: prev.fpa_per_unit, fpa_for: prev.fpa_for },
    sanctioned_kw: ix.sanctioned_kw,
    discos: ix.discos.length,
    months: ix.months.length,
  };
  for (const l of levels) {
    scope[l.key] = { units: l.units, total_rs: l.cur.total_rs, prev_rs: l.prev.total_rs, change: changeText(l.diff, l.pct), per_unit_rs: l.cur.total_rs / l.units, energy_rs: l.cur.energy_rs, fixed_rs: l.cur.fixed_rs, fpa_rs: l.cur.fpa_rs, gst_rs: l.cur.gst_rs, rate: l.cur.rate };
  }
  // Units ladder (owner, 2026-10-15): the current month's bill at every step of data/bill-index.json ladder.
  const lad = ix.ladder;
  const limit = ctx.data.defaults.protected_max_units;
  if (!lad || !(lad.step > 0) || !(lad.from > 0) || !(lad.to >= lad.from)) fail('bill-index: data/bill-index.json ladder needs from > 0, step > 0 and to >= from');
  const ladUnits = [];
  for (let u = lad.from; u <= lad.to; u += lad.step) ladUnits.push(u);
  const ladder = ladUnits.map((units) => ({
    units,
    u: run(cur, { units, category: 'unprotected' }),
    p: units <= limit ? run(cur, { units, category: 'protected' }) : null,
  }));
  const top = ladder[ladder.length - 1];
  // A lifeline home at the first step pays lifeline rates with no fixed charge (Engineer Reviewer): one line next to the table.
  const life = bill({ units: lad.from, sanctioned_kw: ix.sanctioned_kw, lifeline: true, period: cur.qta_period }, ctx.data);
  if (!life.ok) fail(`bill-index: lifeline bill at ${lad.from} units gives ${life.error}`);
  scope.ladder = { from: lad.from, to: lad.to, step: lad.step, count: ladder.length, limit, top_units: top.units, top_rs: top.u.total_rs, top_per_unit_rs: top.u.total_rs / top.units, lifeline_rs: life.total_rs, lifeline_rate: life.rate };
  const tables = [
    {
      caption: `Electricity bill for every ${fmt(lad.step, 'int')} units, ${fmt(lad.from, 'int')} to ${fmt(lad.to, 'int')}, ${cur.label} (${fmt(ix.sanctioned_kw, 'int')} kW sanctioned load)`,
      head: ['Units a month', 'Unprotected bill', 'Per unit (unprotected)', 'Protected bill'],
      rows: ladder.map((r) => [fmt(r.units, 'int'), fmt(r.u.total_rs, 'rs'), fmt(r.u.total_rs / r.units, 'rs2'), r.p ? fmt(r.p.total_rs, 'rs') : `Not protected above ${fmt(limit, 'int')} units`]),
    },
    {
      caption: `Electricity bill by units, ${cur.label} vs ${prev.label} (${fmt(ix.sanctioned_kw, 'int')} kW sanctioned load)`,
      head: ['Units a month', 'Consumer', `${cur.label} bill`, `${prev.label} bill`, 'Change', 'Per unit'],
      rows: levels.map((l) => [fmt(l.units, 'int'), l.category === 'protected' ? 'Protected' : 'Unprotected', fmt(l.cur.total_rs, 'rs'), fmt(l.prev.total_rs, 'rs'), changeText(l.diff, l.pct), fmt(l.cur.total_rs / l.units, 'rs2')]),
    },
    {
      caption: `What makes up the ${cur.label} bill`,
      head: ['Units', 'Consumer', 'Energy', 'Fixed', 'FC surcharge', 'QTA', 'FPA', 'GST', 'Total'],
      rows: levels.map((l) => [fmt(l.units, 'int'), l.category === 'protected' ? 'Protected' : 'Unprotected', fmt(l.cur.energy_rs, 'rs'), fmt(l.cur.fixed_rs, 'rs'), fmt(l.cur.fc_rs, 'rs'), fmt(l.cur.qta_rs, 'rs'), fmt(l.cur.fpa_rs, 'rs'), fmt(l.cur.gst_rs, 'rs'), fmt(l.cur.total_rs, 'rs')]),
    },
    {
      caption: `${cur.label} unprotected bill in every distribution company`,
      head: ['Company', ...levels.filter((l) => l.category === 'unprotected').map((l) => `${fmt(l.units, 'int')} units`)],
      rows: ix.discos.map((d) => [d.name, ...levels.filter((l) => l.category === 'unprotected').map((l) => fmt(l.cur.total_rs, 'rs'))]),
    },
  ];
  const ch = chart(`Monthly bill, ${prev.label} and ${cur.label}`, levels.map((l) => ({ label: l.label, bars: [
    { name: prev.label, value: l.prev.total_rs, text: fmt(l.prev.total_rs, 'rs') },
    { name: cur.label, value: l.cur.total_rs, text: fmt(l.cur.total_rs, 'rs') },
  ] })), 'Rs');
  const csvRows = [];
  const csvLevels = [...ix.levels];
  for (const units of ladUnits) {
    for (const category of units <= limit ? ['protected', 'unprotected'] : ['unprotected']) {
      if (!csvLevels.some((l) => l.units === units && l.category === category)) csvLevels.push({ units, category });
    }
  }
  csvLevels.sort((a, b) => a.units - b.units || (a.category < b.category ? -1 : 1));
  for (const m of ix.months) {
    for (const l of csvLevels) {
      const r = run(m, l);
      csvRows.push([m.month, l.units, l.category, ix.sanctioned_kw, round(r.rate), round(r.energy_rs), round(r.fixed_rs), round(r.fc_rs), round(r.qta_rs), round(r.fpa_rs), round(r.gst_rs), round(r.total_rs), m.fpa_per_unit, m.fpa_for, m.fpa_verified ? 'notified (NEPRA)' : 'news report']);
    }
  }
  const csv = toCsv(['billing_month', 'units', 'consumer', 'sanctioned_kw', 'rate_rs_per_unit', 'energy_rs', 'fixed_rs', 'fc_surcharge_rs', 'qta_rs', 'fpa_rs', 'gst_rs', 'total_rs', 'fpa_rs_per_unit', 'fpa_fuel_month', 'fpa_source_type'], csvRows);
  const sources = [
    { label: 'NEPRA tariff decision and SRO 279(I)/2026 for A-1 domestic consumers (tariff PDF)', url: ctx.data.tariff._meta.source_url },
    ...ix.months.map((m) => ({ label: `${m.label} bills: ${m.fpa_source}`, url: m.fpa_url })),
    { label: 'Wattlyst methodology and default values', url: '/methodology/' },
  ];
  return {
    scope, tables, chart: ch, csv, csv_name: 'pakistan-electricity-bill-index.csv', sources,
    checked: ix._meta.checked, license: ix._meta.license,
    temporal: `${ix.months[ix.months.length - 1].month}/${cur.month}`,
    measured: ['Monthly electricity bill (PKR)', 'Energy charge', 'Fixed charge', 'Fuel price adjustment', 'GST'],
  };
}

export function solarTracker(ctx) {
  const sp = ctx.data.solar_prices;
  const cp = ctx.data.component_prices;
  const hist = ctx.data.solar_price_history;
  const panelW = ctx.data.defaults.panel_w;
  const systems = [...sp.systems].sort((a, b) => (a.type === b.type ? a.kw - b.kw : a.type < b.type ? 1 : -1));
  const perW = (r) => ({ lo: r.low_rs / (r.kw * 1000), hi: r.high_rs / (r.kw * 1000) });
  const sys = (type, kw) => systems.find((r) => r.type === type && r.kw === kw);
  const scope = {
    checked: sp._meta.checked,
    panel: { low: sp.panel_rs_per_w.low, high: sp.panel_rs_per_w.high, w: panelW, each_low: panelW * sp.panel_rs_per_w.low, each_high: panelW * sp.panel_rs_per_w.high, sources: sp.panel_rs_per_w.n_sources },
    sizes: systems.length,
    components: cp.items.length,
    history_months: hist.months.length,
  };
  for (const r of systems) {
    const p = perW(r);
    scope[`${r.type === 'on-grid' ? 'og' : 'hy'}${r.kw}`] = { kw: r.kw, low_rs: r.low_rs, high_rs: r.high_rs, w_low: p.lo, w_high: p.hi, sources: r.n_sources };
  }
  for (const it of cp.items) scope[`${it.category}_${it.size.split(' ')[0].replace(/\W/g, '')}`] = { low: it.low, high: it.high, sources: it.n_sources };
  const tables = [
    {
      caption: `Installed solar system prices in Pakistan, checked ${sp._meta.checked}`,
      head: ['System', 'Typical price', 'Per watt', 'Sources'],
      rows: systems.map((r) => [`${fmt(r.kw, 'int')} kW ${r.type}`, `${fmt(r.low_rs, 'rs')} to ${fmt(r.high_rs, 'rs')}`, `${fmt(perW(r).lo, 'rs2')} to ${fmt(perW(r).hi, 'rs2')}`, fmt(r.n_sources, 'int')]),
    },
    {
      caption: `Solar panels, inverters and batteries: equipment prices, checked ${cp._meta.checked}`,
      head: ['Item', 'Price from', 'to', 'Unit', 'Sources'],
      rows: [
        [`Solar panel (Tier-1 N-type), per watt`, fmt(sp.panel_rs_per_w.low, 'rs2'), fmt(sp.panel_rs_per_w.high, 'rs2'), 'per watt', fmt(sp.panel_rs_per_w.n_sources, 'int')],
        [`Solar panel, ${fmt(panelW, 'int')} W`, fmt(panelW * sp.panel_rs_per_w.low, 'rs'), fmt(panelW * sp.panel_rs_per_w.high, 'rs'), 'per panel', fmt(sp.panel_rs_per_w.n_sources, 'int')],
        ...cp.items.map((it) => [it.label, fmt(it.low, 'rs'), fmt(it.high, 'rs'), it.unit.replace(/^PKR /, ''), fmt(it.n_sources, 'int')]),
      ],
    },
  ];
  if (hist.months.length) {
    tables.push({ caption: 'Earlier months', head: ['Month', 'Panel per watt', '10 kW on-grid'], rows: hist.months.map((m) => [m.month, `${fmt(m.panel_low, 'rs2')} to ${fmt(m.panel_high, 'rs2')}`, `${fmt(m.og10_low, 'rs')} to ${fmt(m.og10_high, 'rs')}`]) });
  }
  const ch = chart('Installed price per watt by system size (low to high end of the typical range)', systems.map((r) => ({ label: `${fmt(r.kw, 'int')} kW ${r.type}`, bars: [
    { name: 'Rs per watt', value: perW(r).hi, low: perW(r).lo, text: `${fmt(perW(r).lo, 'rs2')} to ${fmt(perW(r).hi, 'rs2')}` },
  ] })), 'Rs per watt');
  const csvRows = [
    ['panel', 'per watt', '', round(sp.panel_rs_per_w.low), round(sp.panel_rs_per_w.high), round(sp.panel_rs_per_w.low), round(sp.panel_rs_per_w.high), sp.panel_rs_per_w.n_sources, sp._meta.checked],
    ...systems.map((r) => [`system ${r.type}`, `${r.kw} kW`, r.kw, r.low_rs, r.high_rs, round(perW(r).lo), round(perW(r).hi), r.n_sources, sp._meta.checked]),
    ...cp.items.map((it) => [it.category, it.size, '', it.low, it.high, '', '', it.n_sources, cp._meta.checked]),
  ];
  const csv = toCsv(['item', 'size', 'kw', 'low_rs', 'high_rs', 'low_rs_per_w', 'high_rs_per_w', 'n_sources', 'checked'], csvRows);
  const seen = new Map();
  const add = (s) => { if (s.url && !seen.has(s.url)) seen.set(s.url, { label: `${s.publisher}, ${String(s.date).split(/ \(|;/)[0]} (price data)`, url: s.url }); };
  for (const s of sp.panel_rs_per_w.sources) add(s);
  for (const r of sp.systems) for (const s of r.sources || []) add(s);
  for (const it of cp.items) for (const s of it.sources) add(s);
  return {
    scope, tables, chart: ch, csv, csv_name: 'pakistan-solar-price-tracker.csv',
    sources: [...seen.values(), { label: 'Wattlyst methodology and default values', url: '/methodology/' }],
    checked: sp._meta.checked, license: 'CC BY 4.0: free to reuse with a link to the tracker page',
    temporal: sp._meta.checked.slice(0, 7),
    measured: ['Installed solar system price (PKR)', 'Solar panel price per watt (PKR)', 'Inverter price (PKR)', 'Battery price (PKR)'],
  };
}

/** Embed codes for every live calculator: an iframe snippet and a script snippet, both with a visible credit link. */
export function embedList(rows, site, pluginUrl) {
  const abs = (u) => site.url.replace(/\/$/, '') + u;
  return rows.filter((r) => r.live && r.hasTool).map((r) => {
    const slug = r.id.toLowerCase();
    const src = abs(`/embed/${slug}/`);
    const credit = `<a href="${abs(r.url)}">Calculator by ${site.brand}</a>`;
    return {
      id: r.id,
      h1: r.h1,
      url: r.url,
      iframe: `<iframe src="${src}" title="${r.h1.replace(/"/g, '&quot;')} (${site.brand})" width="100%" height="720" style="border:0;max-width:720px" loading="lazy"></iframe>\n<p>${credit}</p>`,
      script: `<div class="wattlyst-embed" data-tool="${slug}">${credit}</div>\n<script async src="${pluginUrl}assets/js/wattlyst-embed.js"></script>`,
    };
  });
}
