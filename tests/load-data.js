import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const citiesRaw = readJson('data/cities-pk.json');
const { _meta, ...cities } = citiesRaw;

export const data = {
  defaults: readJson('data/defaults.json'),
  tariff: readJson('data/tariff-pk-2026.json'),
  cities,
};
export const cases = readJson('specs/calculator-test-cases.json');
export { root };
