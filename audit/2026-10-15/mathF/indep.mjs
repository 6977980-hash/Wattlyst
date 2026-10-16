const ROOT = new URL('../../../', import.meta.url).pathname;
// Independent bill model, written from data/tariff-pk-2026.json and the rules stated in its _meta / formulas.md F.
// Does NOT import engine/bill.js.
import { readFileSync } from 'node:fs';
const J = (p) => JSON.parse(readFileSync(ROOT + '' + p, 'utf8'));
export const T = J('data/tariff-pk-2026.json');
export const D = J('data/defaults.json');
export const BI = J('data/bill-index.json');

// Reached band: smallest upto >= units (upto null = open).
function reached(bands, u) { for (let k = 0; k < bands.length; k++) if (bands[k].upto === null || u <= bands[k].upto) return k; return bands.length - 1; }

export function indepBill({ units, kw = 1, cat = 'unprotected', period = '2026-09..2026-11', fc, qta, fpa = 0, gst } = {}) {
  const bands = T[cat];
  if (cat !== 'unprotected' && units > bands[bands.length - 1].upto) return { err: `${cat}_max` };
  const k = reached(bands, units);
  let energy;
  if (cat === 'protected') {
    // one-previous-slab benefit: 1-100 at slab-1 rate, 101-200 at slab-2 rate
    energy = Math.min(units, 100) * bands[0].rate + Math.max(0, units - 100) * bands[1].rate;
  } else energy = units * bands[k].rate;
  const fixed = bands[k].fixed_per_kw * kw;
  const life = cat === 'lifeline';
  const fcR = fc ?? (life ? 0 : T.addons_secondary.fc_surcharge_per_unit.value);
  const qtaR = qta ?? (T.addons_secondary.qta_per_unit[period] ?? 0);
  const gstP = gst ?? (life ? 0 : T.addons_secondary.gst_pct.value);
  const fcRs = fcR * units;
  const qtaRs = life ? 0 : qtaR * units;
  const fpaRs = cat === 'unprotected' ? fpa * units : 0;
  const sub = Math.max(0, energy + fixed + fcRs + qtaRs + fpaRs);
  const gstRs = sub * gstP / 100;
  return { rate: bands[k].rate, energy, fixed, fcRs, qtaRs, fpaRs, sub, gstRs, total: sub + gstRs };
}
