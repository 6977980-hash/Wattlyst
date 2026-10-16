const ROOT = new URL('../../../', import.meta.url).pathname;
import { readFileSync } from 'node:fs';
const R=ROOT + '';
export const J=(p)=>JSON.parse(readFileSync(R+p,'utf8'));
const { _meta, ...cities } = J('data/cities-pk.json');
export const data = { defaults: J('data/defaults.json'), tariff: J('data/tariff-pk-2026.json'), cities,
  appliances: Object.fromEntries(J('data/appliances.json').items.map(a=>[a.id,a])), cables: J('data/cable-ampacity.json'),
  solar_prices: J('data/solar-prices.json'), generator_fuel: J('data/generator-fuel.json'), component_prices: J('data/component-prices.json'), backup_prices: J('data/backup-prices.json') };
export const manifest = J('generated/manifest.json');
export const gen = (id)=>J(`generated/pages/${id}.json`);
export const E = async (m)=> import(R+`engine/${m}.js`);
