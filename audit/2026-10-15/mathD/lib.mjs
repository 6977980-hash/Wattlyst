const ROOT = new URL('../../../', import.meta.url).pathname;
import { readFileSync } from 'node:fs';
export const R = ROOT.replace(/\/$/, '');
export const J = (p) => JSON.parse(readFileSync(`${R}/${p}`, 'utf8'));
const { _meta, ...cities } = J('data/cities-pk.json');
export const data = {
  defaults: J('data/defaults.json'), tariff: J('data/tariff-pk-2026.json'), cities,
  appliances: Object.fromEntries(J('data/appliances.json').items.map((a) => [a.id, a])),
  cables: J('data/cable-ampacity.json'), solar_prices: J('data/solar-prices.json'),
  generator_fuel: J('data/generator-fuel.json'), component_prices: J('data/component-prices.json'),
  backup_prices: J('data/backup-prices.json'), load_profiles: J('data/load-profiles.json').profiles,
};
export const E = async (m) => import(`${R}/engine/${m}.js`);
export const msgs = (await import(`${R}/engine/messages.js`));
const lookup = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
export function pageInputs(id) {
  const c = J(`content/pages/${id}.json`);
  const inp = {};
  for (const f of c.fields) {
    let v = f.default;
    if (typeof v === 'string' && v.startsWith('@')) { const p = v.slice(1); v = p.startsWith('data.') ? lookup(data, p.slice(5)) : data.defaults[p]; }
    if (v !== undefined) inp[f.name] = v;
  }
  Object.assign(inp, c.fixed_inputs || {});
  return { calc: c.calc, inputs: inp, content: c };
}
