// Independent re-implementation of the H1 Home Power Decision Engine and N7 backup_compare from
// specs/formulas.md and data/*.json. Imports NO engine module. Used to cross-check engine/decision.js.
import { data as D0 } from './lib.mjs';

const mid = (lo, hi) => (lo + hi) / 2;
const ceil = (x) => Math.ceil(x - 1e-9);

export function bill(units, kw, d = D0) {
  const bands = d.tariff.unprotected;
  const b = bands.find((x) => x.upto === null || units <= x.upto);
  const a = d.tariff.addons_secondary;
  const energy = units * b.rate;
  const fixed = b.fixed_per_kw * kw;
  const fc = a.fc_surcharge_per_unit.value * units;
  const sub = energy + fixed + fc; // QTA 0 (no period), FPA 0
  return { energy, fixed, rate: b.rate, total: sub * (1 + a.gst_pct.value / 100) };
}

export function loadsOf(loads, d = D0) {
  let run = 0, step = 0, kwh = 0;
  for (const r of loads) {
    const it = r.id && r.id !== 'custom' ? d.appliances[r.id] : null;
    const w = r.watts ?? it.running_w;
    const st = it ? (it.starting_w * w) / it.running_w : w;
    const ew = it?.avg_w ? (it.avg_w * w) / it.running_w : w;
    const q = r.qty ?? 1;
    const h = r.hours ?? it?.typical_hours_per_day ?? 0;
    run += w * q;
    if (q > 0) step = Math.max(step, st - w);
    kwh += (ew * q * h) / 1000;
  }
  return { run, surge: run + step, kwh };
}

export function priceRange(type, kw, d = D0) {
  const rows = d.solar_prices.systems.filter((r) => r.type === type).sort((a, b) => a.kw - b.kw);
  const at = (r) => [r.low_rs / r.kw, r.high_rs / r.kw]; // per kW
  if (kw <= rows[0].kw) return at(rows[0]).map((x) => x * kw);
  const last = rows.at(-1);
  if (kw >= last.kw) return at(last).map((x) => x * kw);
  const e = rows.find((r) => Math.abs(r.kw - kw) < 1e-9);
  if (e) return [e.low_rs, e.high_rs];
  const a = rows.filter((r) => r.kw < kw).pop(), b = rows.find((r) => r.kw > kw);
  const t = (kw - a.kw) / (b.kw - a.kw);
  return [a.low_rs + (b.low_rs - a.low_rs) * t, a.high_rs + (b.high_rs - a.high_rs) * t];
}

function invAt(cat, kw, d) {
  const rows = d.component_prices.items.filter((x) => x.category === cat && x.export_capable !== false)
    .map((x) => ({ kw: parseFloat(x.size), rs: mid(x.low, x.high) })).sort((a, b) => a.kw - b.kw);
  if (kw <= rows[0].kw) return (rows[0].rs / rows[0].kw) * kw;
  const last = rows.at(-1);
  if (kw >= last.kw) return (last.rs / last.kw) * kw;
  const a = rows.filter((r) => r.kw <= kw).pop(), b = rows.find((r) => r.kw > kw);
  return a.rs + ((b.rs - a.rs) * (kw - a.kw)) / (b.kw - a.kw);
}

export function n7(inp, d = D0) {
  const df = d.defaults, bp = d.backup_prices, cp = d.component_prices.items;
  const { load_w, hours, years, tariff } = inp;
  const days = inp.days ?? df.days_per_month;
  const city = d.cities[inp.city ?? 'lahore'];
  const panel_w = inp.panel_w ?? df.panel_w;
  const need = load_w * df.margin;
  const E = (load_w * hours) / 1000;
  const bh = hours * days * 12 * years;
  const tubM = (() => { const t = cp.find((x) => x.category === 'tubular_battery'); return mid(t.low, t.high); })();
  const upsL = [...bp.ups].sort((a, b) => a.rated_w - b.rated_w);
  const ups = upsL.find((u) => u.rated_w >= need - 1e-9);
  const out = { E, bh };
  if (ups) {
    const wh = (E * 1000) / (df.dod_lead_acid * df.inverter_eff_ups);
    const bats = ceil(wh / (ups.battery_v * bp.tubular_unit.ah)) * (ups.battery_v / bp.tubular_unit.v);
    const buy = mid(ups.low, ups.high) + bats * tubM;
    const rech = (E / (df.charge_eff_lead_acid * df.inverter_eff_ups)) * days * 12;
    const repl = Math.floor((years - 1e-9) / bp.battery_life_years.tubular) * bats * tubM;
    const ok = ((24 - hours) * ups.charger_a * ups.battery_v) / 1000 >= E / (df.charge_eff_lead_acid * df.inverter_eff_ups);
    Object.assign(out, { ups: { kva: ups.kva, bats, buy, rech, repl, run_year: rech * tariff, total: buy + years * rech * tariff + repl, ok } });
  }
  const g = [...bp.generators].sort((a, b) => a.kva - b.kva).find((x) => x.kva * df.pf_generator * 1000 >= need - 1e-9);
  if (!g) return { error: 'load_w_too_large' };
  const c = d.generator_fuel.fuels.petrol;
  const lph = c.intercept_l_per_h_per_kw_rated * g.kva * df.pf_generator + c.slope_l_per_kwh * (load_w / 1000);
  const rh = hours * days * 12;
  const fp = inp.fuel_price ?? d.generator_fuel.prices.petrol.rs_per_litre;
  const up = bp.generator_upkeep;
  const run_year = lph * rh * fp + (rh / up.oil_change_hours) * up.oil_l * mid(up.oil_rs_per_l_low, up.oil_rs_per_l_high);
  out.gen = { kva: g.kva, buy: mid(g.low, g.high), run_year, total: mid(g.low, g.high) + years * run_year };
  const invs = cp.filter((x) => x.category === 'hybrid_inverter').map((x) => ({ kw: parseFloat(x.size), rs: mid(x.low, x.high) })).sort((a, b) => a.kw - b.kw);
  const inv = invs.find((x) => x.kw * 1000 >= need - 1e-9);
  if (!inv) return { error: 'load_w_too_large' };
  const li = cp.find((x) => x.category === 'lithium_battery' && x.size === bp.lithium_pack.size);
  const packs = ceil(E / (df.dod_lifepo4 * df.inverter_eff_hybrid) / bp.lithium_pack.kwh);
  const panels = ceil(((E / df.inverter_eff_hybrid / df.charge_eff_lifepo4) / city.yield) * 1000 / panel_w);
  const pw = mid(d.solar_prices.panel_rs_per_w.low, d.solar_prices.panel_rs_per_w.high);
  const sbuy = inv.rs + packs * mid(li.low, li.high) + panels * panel_w * pw;
  const srepl = Math.floor((years - 1e-9) / bp.battery_life_years.lifepo4) * packs * mid(li.low, li.high);
  out.solar = { inv_kw: inv.kw, packs, panels, buy: sbuy, total: sbuy + srepl };
  const opts = [out.ups && out.ups.ok && ['UPS', out.ups.total], ['petrol generator', out.gen.total], ['hybrid solar', out.solar.total]].filter(Boolean);
  out.cheapest = opts.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
  return out;
}

/** Returns each setup's mid price, net and the pick, per formulas.md "Home Power Decision Engine". */
export function decide(inp, d = D0) {
  const df = d.defaults;
  const margin = inp.margin ?? df.margin;
  const L = loadsOf(inp.loads, d);
  const y = d.cities[inp.city ?? 'lahore'].yield;
  const panel_w = inp.panel_w ?? df.panel_w;
  const pr = df.pr;
  const kw = Math.max(L.kwh / y, L.run / 1000 / pr);
  const panels = ceil((kw * 1000) / panel_w);
  const ikw = (panels * panel_w) / 1000;
  const inverter_kw = Math.max(L.run * margin, (ikw * 1000) / df.dc_ac_ratio_max) / 1000;
  const units = L.kwh * df.days_per_month;
  const skw = inp.sanctioned_kw ?? df.default_sanctioned_kw;
  const nbp = ikw > skw + 1e-9 ? Math.floor((skw * 1000) / panel_w + 1e-9) : panels;
  const nbkwh = ((nbp * panel_w) / 1000) * y * df.days_per_month;
  const ds = inp.day_share ?? df.planner_day_share;
  const self = Math.min(nbkwh, units * ds);
  const exp = nbkwh - self, imp = units - self;
  const bb = inp.buyback_rs ?? d.tariff.net_billing.buyback_rs_per_unit_default;
  const before = bill(units, skw, d);
  const credit = exp * bb;
  const after = Math.max(0, bill(imp, skw, d).total - credit);
  const saving = Math.max(0, before.total - after);
  const years = inp.years ?? df.decision_years;
  const M = years * 12;
  const budget = inp.budget_rs ?? 0;
  const og = priceRange('on-grid', ikw, d);
  const S = {};
  const add = (k, lo, hi, repl, sav, run) => { S[k] = { lo, hi, buy: mid(lo, hi), repl, sav, run, net: mid(lo, hi) + repl + M * (run - sav) }; };
  add('ongrid', og[0], og[1], 0, saving, 0);
  const bw = inp.backup_w, bhrs = inp.backup_hours;
  const need = bhrs > 0;
  if (need) {
    const lifo = (inp.chemistry ?? 'lifepo4') === 'lifepo4';
    const bkwh = (bw * bhrs) / 1000 / ((lifo ? df.dod_lifepo4 : df.dod_lead_acid) * df.inverter_eff_hybrid);
    const bp = d.backup_prices, cp = d.component_prices.items;
    const t = bp.tubular_unit;
    const units_b = lifo ? ceil(bkwh / bp.lithium_pack.kwh) : ceil((bkwh * 1000) / (df.hybrid_bank_v * t.ah)) * ceil(df.hybrid_bank_v / t.v);
    const it = cp.find((x) => (lifo ? x.category === 'lithium_battery' && x.size === bp.lithium_pack.size : x.category === 'tubular_battery'));
    const hkw = Math.max(inverter_kw, (bw * margin) / 1000);
    const prem = Math.max(0, invAt('hybrid_inverter', hkw, d) - invAt('ongrid_inverter', inverter_kw, d));
    const reps = Math.floor((years - 1e-9) / bp.battery_life_years[inp.chemistry ?? 'lifepo4']);
    add('hybrid', og[0] + prem + units_b * it.low, og[1] + prem + units_b * it.high, reps * units_b * mid(it.low, it.high), saving, 0);
    S.hybrid.units = units_b; S.hybrid.prem = prem;
    const n = n7({ load_w: bw, hours: bhrs, years, tariff: before.rate, city: inp.city ?? 'lahore', panel_w }, d);
    if (!n.error) {
      const r = n.ups ? Math.max(0, n.ups.rech / 12 - n.E * df.days_per_month) : 0;
      const upsRun = bill(units + r, skw, d).total - before.total;
      const useUps = n.ups && n.ups.ok && n.ups.buy + n.ups.repl + M * upsRun <= n.gen.total;
      // low/high: same option with every equipment range at an end
      const endBuy = (e) => {
        const dd = structuredClone(d);
        const one = (o) => { o.low = o[e]; o.high = o[e]; };
        dd.component_prices.items.forEach(one); dd.backup_prices.ups.forEach(one); dd.backup_prices.generators.forEach(one);
        const nn = n7({ load_w: bw, hours: bhrs, years, tariff: before.rate, city: inp.city ?? 'lahore', panel_w }, dd);
        return useUps ? nn.ups.buy : nn.gen.buy;
      };
      const [slo, shi] = [endBuy('low'), endBuy('high')];
      if (useUps) add('standby', slo, shi, n.ups.repl, 0, upsRun);
      else add('standby', slo, shi, 0, 0, n.gen.run_year / 12);
      S.standby.kind = useUps ? 'ups' : 'gen';
      let cs, crun;
      if (useUps) { const c = before.total - Math.max(0, bill(imp + r, skw, d).total - credit); cs = Math.max(0, c); crun = Math.max(0, -c); } else { cs = saving; crun = n.gen.run_year / 12; }
      add('combo', og[0] + slo, og[1] + shi, useUps ? n.ups.repl : 0, cs, crun);
      S._n7 = n; S._r = r;
    }
  }
  S.grid = { buy: 0, net: 0, lo: 0, hi: 0 };
  const pool = need ? ['hybrid', 'standby', 'combo'].filter((k) => S[k]) : ['ongrid', 'grid'];
  const fits = pool.filter((k) => !budget || S[k].buy <= budget + 1e-9);
  let pick, over = false;
  if (fits.length) pick = fits.reduce((a, b) => (S[b].net < S[a].net - 1e-9 || (Math.abs(S[b].net - S[a].net) <= 1e-9 && S[b].buy < S[a].buy) ? b : a));
  else if (pool.length) { pick = pool.reduce((a, b) => (S[b].buy < S[a].buy ? b : a)); over = true; } else pick = 'none';
  return { S, pick, over, units, ikw, saving, before: before.total, rate: before.rate, inverter_kw, nb_kw: (nbp * panel_w) / 1000, above: ikw > skw + 1e-9, L };
}
