// On-grid net over N years as a function of panel count (own net-billing month, D14 price), default home.
import { decide, priceRange, bill } from './indep.mjs';
const DEF = [{ id: 'ceiling-fan-ac', qty: 4 }, { id: 'led-bulb', qty: 10 }, { id: 'ac-split-1-5ton-inverter', qty: 1, hours: 7 }, { id: 'refrigerator-inverter', qty: 1 }, { id: 'led-tv-43', qty: 1 }];
const H = { loads: DEF, city: 'lahore', sanctioned_kw: 4, backup_w: 500, backup_hours: 0, years: 10 };
const R = (x) => Math.round(x).toLocaleString('en-US');
for (const years of [10, 15, 25]) {
  const x = decide({ ...H, years });
  const rows = [];
  for (let P = 1; P <= 6; P++) { const kw = P * 0.585; const solar = kw * 4 * 30; const self = Math.min(solar, x.units * 0.5); const after = Math.max(0, bill(x.units - self, 4).total - (solar - self) * 8.13); const sav = x.before - after; const [lo, hi] = priceRange('on-grid', kw); rows.push(`${P} panels ${kw.toFixed(2)} kW: price ${R((lo + hi) / 2)}, saving ${R(sav)}/month, net ${R((lo + hi) / 2 - years * 12 * sav)}`); }
  console.log(`years ${years} (engine array ${x.ikw} kW):\n  ` + rows.join('\n  '));
}
