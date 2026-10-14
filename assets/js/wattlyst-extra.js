// Page-specific parts of the live calculator, imported by assets/js/wattlyst-tool.js only on the pages that use them
// (N11 battery diagram, N6 live forecast), so other tool pages do not download them. No formula lives here.

/** N11 battery diagram: same markup as Wattlyst_Render::battery_grid() (one row per parallel string, minus bus left, fused plus lead right). */
export function drawGrid(box, series, parallel) {
  const max = 8;
  const L = '<span class="wl-wire"></span>';
  let rows = '';
  for (let p = 1; p <= Math.min(parallel, max); p++) {
    rows += `<div class="wl-string"><span class="wl-string-label">String ${p}</span><div class="wl-row">${L}${'<span class="wl-cell">&minus; +</span>'.repeat(Math.min(series, max))}${series > max ? `<span class="wl-more">+${series - max}</span>` : ''}${L}<span class="wl-fuse">fuse</span>${L}</div></div>`;
  }
  box.innerHTML = `<div class="wl-grid"><span class="wl-bus wl-bus-neg">Negative bus</span><div class="wl-strings">${rows}${parallel > max ? `<div class="wl-more">+${parallel - max} more strings</div>` : ''}</div><span class="wl-bus wl-bus-pos">Positive bus</span></div>`;
}

/**
 * N6: tomorrow's hourly plane-of-array irradiance for the chosen city from Open-Meteo (free, no key; only the
 * city's coordinates are sent). Returns { gti, date } or null; the page keeps the typical day when it fails.
 */
const forecasts = {};
export async function forecastFor(c, tilt) {
  const key = `${c.lat},${c.lon},${tilt}`;
  if (!forecasts[key]) {
    forecasts[key] = fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&hourly=global_tilted_irradiance&tilt=${tilt}&azimuth=0&timezone=Asia%2FKarachi&forecast_days=2`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const v = j?.hourly?.global_tilted_irradiance?.slice(24, 48);
        const date = j?.hourly?.time?.[24]?.slice(0, 10);
        return v && v.length === 24 && v.every((x) => typeof x === 'number') && date ? { gti: v, date } : null;
      })
      .catch(() => null);
  }
  return forecasts[key];
}
