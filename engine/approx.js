// Approximate figures for page text (full audit 2026-10-15 WL-150; formulas.md "Market prices and rough times").
// Market prices are dealer and installer quotes, so the text prints them to three significant figures
// (Rs 26,618 -> Rs 26,600, Rs 166.67 -> Rs 167, Rs 45.50 -> Rs 45.5); tariff arithmetic keeps the exact
// format.js "rs" / "rs2". A rough runtime ("about ...") is rounded DOWN to five minutes, so it is never overstated.
// Build-time only (the {{x|rsm}} and {{x|hm5}} specs in tools/build.js): no page loads this module.

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function marketRs(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return '';
  const step = 10 ** (Math.floor(Math.log10(v)) - 2);
  return `Rs ${nf.format(Math.round(v / step) * step)}`;
}

export function roughHours(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return '';
  const m = Math.floor((v * 60) / 5 + 1e-9) * 5;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return r === 0 ? 'under 5 min' : `${r} min`;
  return r === 0 ? `${nf.format(h)} h` : `${nf.format(h)} h ${r} min`;
}
