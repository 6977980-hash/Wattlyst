// Registry of every calculator. UI and tests look calculators up by the `calc` id used in
// specs/calculator-test-cases.json. Each one is (inputs, data) => { ok, ...values } | { ok:false, error }.
// data = { defaults, tariff, cities } loaded from data/*.json.
import * as conversions from './conversions.js';
import * as battery from './battery.js';
import * as sizing from './sizing.js';
import * as solar from './solar.js';
import * as bill from './bill.js';
import * as load from './load.js';
import * as wiring from './wiring.js';
import * as planner from './planner.js';
import * as prices from './prices.js';
import * as forecast from './forecast.js';
import * as fuel from './fuel.js';
import * as solartools from './solartools.js';
import * as acbill from './acbill.js';
import * as sanction from './sanction.js';
import * as seasonal from './seasonal.js';
import * as circuits from './circuits.js';
import * as backup from './backup.js';
import * as decision from './decision.js';

const modules = { conversions, battery, sizing, solar, bill, load, wiring, planner, prices, forecast, fuel, solartools, acbill, sanction, seasonal, circuits, backup, decision };

export const calculators = {};
for (const mod of Object.values(modules)) {
  for (const [name, fn] of Object.entries(mod)) {
    if (typeof fn === 'function' && typeof fn.raw === 'function') calculators[name] = fn;
  }
}

export function run(calc, inputs, data) {
  const fn = calculators[calc];
  if (!fn) return { ok: false, error: 'unknown_calculator' };
  return fn(inputs, data);
}
