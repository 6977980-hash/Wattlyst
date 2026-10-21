// Approximate figures for page text (full audit 2026-10-15 WL-150; formulas.md "Market prices and rough times").
// Market prices are dealer and installer quotes, so the text prints them to three significant figures
// (Rs 26,618 -> Rs 26,600, Rs 166.67 -> Rs 167, Rs 45.50 -> Rs 45.5); tariff arithmetic keeps the exact
// format.js "rs" / "rs2". A rough runtime ("about ...") is rounded DOWN to half an hour ("about 3 hours"), or to five
// minutes under an hour, so it is never overstated and never reads like the exact result beside it (21 Oct audit WL-183).
// Build-time only (the {{x|rsm}}, {{x|lakh}} and {{x|hm5}} specs in tools/build.js): no page loads this module.

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function marketRs(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return '';
  const step = 10 ** (Math.floor(Math.log10(v)) - 2);
  return `Rs ${nf.format(Math.round(v / step) * step)}`;
}

// A price in lakh (1 lakh = 100,000), the unit Pakistani buyers and searchers use: Rs 950,000 -> Rs 9.5 lakh,
// one decimal, like a shop quote. Below one lakh it is the plain market price (21 Oct audit WL-190).
export function lakhRs(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return '';
  if (v < 1e5) return marketRs(v);
  return `Rs ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Math.round(v / 1e4) / 10)} lakh`;
}

export function roughHours(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return '';
  if (v >= 1) {
    const h = Math.floor(v * 2 + 1e-9) / 2;
    return `${nf.format(h)} ${h === 1 ? 'hour' : 'hours'}`;
  }
  const m = Math.floor((v * 60) / 5 + 1e-9) * 5;
  return m === 0 ? 'under 5 min' : `${m} min`;
}
