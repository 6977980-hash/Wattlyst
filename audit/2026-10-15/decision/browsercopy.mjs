// Differential: engine on full data/ vs the browser copy (manifest.data[data_keys] + page appliances) over many inputs.
import { data, manifest, gen, E } from './lib.mjs';
import { SCEN } from './scenarios.mjs';
const { calculators: C } = await E('index');
const browserOf = (id) => { const t = gen(id).content.tool; return { t, d: { defaults: manifest.data.defaults, ...Object.fromEntries(t.data_keys.filter((k) => manifest.data[k]).map((k) => [k, manifest.data[k]])), ...(t.appliances ? { appliances: t.appliances } : {}) } }; };
let n = 0, bad = [];
const H1 = browserOf('H1');
console.log('H1 data_keys', H1.t.data_keys, 'appliances shipped', Object.keys(H1.t.appliances || {}).length, 'of', Object.keys(data.appliances).length);
const base = Object.fromEntries(H1.t.fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default]));
for (const [name, ov] of SCEN) { const inp = { ...base, ...ov }; const a = C.home_decision(structuredClone(inp), data), b = C.home_decision(structuredClone(inp), H1.d); n++; if (JSON.stringify(a) !== JSON.stringify(b)) bad.push(name); }
// every appliance id in the catalog as a one-row list
for (const id of Object.keys(data.appliances)) { const inp = { ...base, loads: [{ id, qty: 1, hours: 2 }] }; const a = C.home_decision(structuredClone(inp), data), b = C.home_decision(structuredClone(inp), H1.d); n++; if (JSON.stringify(a) !== JSON.stringify(b)) bad.push('appliance ' + id); }
const N7 = browserOf('N7');
for (const load_w of [100, 300, 600, 1000, 1500, 3000, 5000, 7000, 9000]) for (const hours of [0.5, 2, 4, 8, 16, 24]) for (const years of [1, 5, 10, 30]) {
  const inp = { load_w, hours, years, tariff: 36.46, city: 'quetta' };
  const a = C.backup_compare(inp, data), b = C.backup_compare(inp, N7.d); n++; if (JSON.stringify(a) !== JSON.stringify(b)) bad.push(`N7 ${JSON.stringify(inp)}`);
}
console.log('compared', n, 'input sets; differing:', bad.length, bad.slice(0, 10));
