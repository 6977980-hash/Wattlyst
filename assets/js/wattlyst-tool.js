// Live calculator runner (progressive enhancement: the default result is already in the HTML).
// It only reads the form, calls the engine and prints the engine's numbers. No formula lives here.
import { fmt, render } from '../../engine/format.js';
import { errorMessage, noticeCode } from '../../engine/messages.js';

const ver = new URL(import.meta.url).searchParams.get('ver') || '';

/** N11 battery diagram: same markup as Wattlyst_Render::battery_grid() (one row per parallel string, minus bus left, fused plus lead right). */
function drawGrid(box, series, parallel) {
  const max = 8;
  const L = '<span class="wl-lead"></span>';
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
async function forecastFor(c, tilt) {
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

/** Appliance-list field: rows of { id, watts, qty, hours } (+ start where the field has the start flag) with add/remove and auto-filled watts and hours. */
function loadsField(form, f, cfg, onChange) {
  const box = form.querySelector(`[data-wl-loads="${f.name}"]`);
  if (!box) return null;
  const body = box.querySelector('tbody');
  const keys = f.start ? ['watts', 'start', 'qty', 'hours'] : ['watts', 'qty', 'hours'];
  const tmpl = box.querySelector('.wl-loads-template');
  let n = body.children.length;
  // The server renders only the chosen option per row; build the full grouped list once and copy it into every select.
  const full = document.createElement('select');
  full.append(new Option('Custom (enter watts)', 'custom'));
  // catalog: [[category, [id, ...]], ...]; names come from cfg.data.appliances (shipped once).
  for (const [cat, ids] of f.catalog || []) {
    const group = document.createElement('optgroup');
    group.label = cat.replace(/-/g, ' ').replace(/^\w/, (m) => m.toUpperCase());
    for (const id of ids) group.append(new Option(cfg.data.appliances[id].name, id));
    full.append(group);
  }
  // Filled lazily on first focus, so a page with several rows does not carry hundreds of <option>s in the DOM.
  const populate = (sel) => {
    if (sel.dataset.full) return;
    const cur = sel.value;
    sel.innerHTML = full.innerHTML;
    sel.value = cur;
    if (sel.value !== cur) sel.value = 'custom';
    sel.dataset.full = '1';
  };
  box.addEventListener('focusin', (e) => { if (e.target.matches('[data-k="id"]')) populate(e.target); });
  box.addEventListener('pointerdown', (e) => { if (e.target.matches('[data-k="id"]')) populate(e.target); });
  const fill = (tr) => {
    const id = tr.querySelector('[data-k="id"]').value;
    const a = cfg.data.appliances?.[id];
    if (!a) return;
    tr.querySelector('[data-k="watts"]').value = a.running_w;
    tr.querySelector('[data-k="hours"]').value = a.typical_hours_per_day ?? '';
    const st = tr.querySelector('[data-k="start"]');
    if (st) st.value = ''; // a listed appliance starts at its own starting watts unless the user types one
  };
  const add = (row) => {
    const tr = tmpl.content.firstElementChild.cloneNode(true);
    tr.querySelectorAll('[id]').forEach((el) => { el.id = el.id.replace('-x-', `-${n}-`); });
    tr.querySelectorAll('label[for]').forEach((el) => { el.htmlFor = el.htmlFor.replace('-x-', `-${n}-`); });
    n += 1;
    if (row) {
      const sel = tr.querySelector('[data-k="id"]');
      populate(sel);
      sel.value = row.id || 'custom';
      if (sel.value !== (row.id || 'custom')) sel.value = 'custom';
      fill(tr);
      for (const k of keys) if (row[k] !== undefined && row[k] !== '') tr.querySelector(`[data-k="${k}"]`).value = row[k];
    }
    body.appendChild(tr);
    return tr;
  };
  box.querySelector('.wl-add-row').addEventListener('click', () => { add().querySelector('select').focus(); });
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('.wl-remove-row');
    if (!btn || body.children.length <= 1) return;
    btn.closest('tr').remove();
    onChange();
  });
  box.addEventListener('change', (e) => {
    if (e.target.matches('[data-k="id"]')) { fill(e.target.closest('tr')); onChange(); }
  });
  const rows = () => [...body.querySelectorAll('tr')].map((tr) => Object.fromEntries(['id', ...keys].map((k) => [k, tr.querySelector(`[data-k="${k}"]`).value.trim()])));
  const set = (list) => { body.innerHTML = ''; list.forEach(add); };
  // ?load= rows: id~watts~qty~hours[~start] (start last, so links made before the column still read).
  const order = ['id', 'watts', 'qty', 'hours', 'start'];
  return { rows, set, encode: () => rows().map((r) => order.filter((k) => k in r).map((k) => r[k]).join('~')).join(';'), decode: (s) => s.split(';').map((p) => { const v = p.split('~'); return Object.fromEntries(order.map((k, i) => [k, v[i]])); }) };
}

async function init(form) {
  const cfgEl = form.querySelector('.wl-config');
  if (!cfgEl) return;
  const cfg = JSON.parse(cfgEl.textContent);
  const mod = await import(`../../engine/${cfg.module}${ver ? `?ver=${ver}` : ''}`);
  const calc = mod[cfg.calc];
  if (typeof calc !== 'function') return;
  const labels = Object.fromEntries(cfg.fields.map((f) => [f.name, f.label.toLowerCase()]));
  const errorEl = form.querySelector('.wl-error');
  const results = form.querySelector('.wl-results');
  const howEl = form.parentElement.querySelector('[data-wl-how]');
  const el = (name) => form.elements.namedItem(name);
  const lists = {};
  let show;
  for (const f of cfg.fields) if (f.type === 'loads') lists[f.name] = loadsField(form, f, cfg, () => show && show(true));

  let live = null;
  const read = () => {
    const inputs = { ...cfg.fixed };
    if (live && live.city === el('city')?.value) Object.assign(inputs, { gti_wm2: live.gti, forecast_date: live.date });
    for (const f of cfg.fields) {
      if (lists[f.name]) { inputs[f.name] = lists[f.name].rows(); continue; }
      const input = el(f.name);
      if (!input) continue;
      if (f.type === 'checkbox') inputs[f.name] = input.checked;
      else if (input.value.trim() !== '') inputs[f.name] = input.value.trim();
    }
    return inputs;
  };

  const fieldEl = (name) => {
    // Errors on a list row come back as loads; point at the first row's select.
    if (lists[name]) return form.querySelector(`[data-wl-loads="${name}"] select`);
    return el(name);
  };

  show = (pushState) => {
    const out = calc(read(), cfg.data);
    form.querySelectorAll('[aria-invalid]').forEach((n) => {
      n.removeAttribute('aria-invalid');
      const ids = (n.getAttribute('aria-describedby') || '').split(' ').filter((x) => x && x !== errorEl.id);
      if (ids.length) n.setAttribute('aria-describedby', ids.join(' ')); else n.removeAttribute('aria-describedby');
    });
    if (!out.ok) {
      errorEl.textContent = errorMessage(out.error, labels);
      errorEl.hidden = false;
      results.hidden = true;
      if (howEl) howEl.hidden = true;
      // Tie the message to the wrong field and move focus there (WCAG 3.3.1, build-plan Phase 2).
      const bad = out.field && fieldEl(out.field);
      if (bad && bad.setAttribute) {
        bad.setAttribute('aria-invalid', 'true');
        bad.setAttribute('aria-describedby', `${bad.getAttribute('aria-describedby') || ''} ${errorEl.id}`.trim());
        if (pushState) bad.focus();
      }
      return;
    }
    results.hidden = false;
    // Warning flags (size above the standard list, solar above the sanctioned load) print a notice, not a blank.
    const notice = noticeCode(out);
    errorEl.textContent = notice ? errorMessage(notice) : '';
    errorEl.hidden = !notice;
    for (const o of cfg.outputs) {
      const node = results.querySelector(`[data-out="${o.key}"] .wl-val`);
      if (node) node.textContent = fmt(out[o.key], o.spec) || 'n/a';
    }
    const grid = cfg.diagram === 'battery_grid' && form.querySelector('[data-wl-diagram]');
    if (grid) drawGrid(grid, Math.round(out.n_series), Math.round(out.n_parallel));
    if (howEl && cfg.how) {
      const text = render(form.dataset.lang === 'ur' && cfg.how_ur ? cfg.how_ur : cfg.how, { in: out, out, d: cfg.data.defaults });
      howEl.hidden = text === null;
      if (text !== null) howEl.textContent = text;
    }
    if (pushState) history.replaceState(null, '', shareUrl());
  };

  // The ?load= link that reproduces the current inputs (only filled fields; the canonical stays clean).
  const shareUrl = () => {
    const load = cfg.fields
      .map((f) => {
        if (lists[f.name]) return `${f.name}:${encodeURIComponent(lists[f.name].encode())}`;
        const v = f.type === 'checkbox' ? (el(f.name)?.checked ? '1' : '') : el(f.name)?.value.trim();
        return v ? `${f.name}:${encodeURIComponent(v)}` : '';
      })
      .filter(Boolean)
      .join(',');
    const url = new URL(window.location.href);
    url.search = load ? `?load=${load}` : '';
    return url.href;
  };

  // Share bar: Save as PDF (the browser's print dialog, with a print stylesheet), WhatsApp (results + link), Copy link.
  const share = form.querySelector('.wl-share');
  if (share) {
    share.hidden = false;
    const note = share.querySelector('.wl-share-note');
    const summary = () => [...results.querySelectorAll('.wl-result')].map((r) => `${r.querySelector('.wl-result-label').textContent}: ${r.querySelector('output').textContent.trim()}`).join('\n');
    share.querySelector('[data-wl-share="print"]').addEventListener('click', () => { show(true); window.print(); });
    const wa = share.querySelector('[data-wl-share="whatsapp"]');
    const setWa = () => { wa.href = `https://wa.me/?text=${encodeURIComponent(`${cfg.h1} (Wattlyst)\n${summary()}\n${shareUrl()}`)}`; };
    wa.addEventListener('pointerdown', setWa);
    wa.addEventListener('focus', setWa);
    setWa();
    share.querySelector('[data-wl-share="copy"]').addEventListener('click', async () => {
      show(true);
      try { await navigator.clipboard.writeText(shareUrl()); note.textContent = 'Link copied.'; } catch { note.textContent = shareUrl(); }
    });
    // Roman Urdu result labels (and the "how" text when the page has one); the choice is remembered on this device.
    const lang = share.querySelector('[data-wl-lang]');
    if (lang) {
      const apply = (ur) => {
        lang.setAttribute('aria-pressed', String(ur));
        lang.textContent = ur ? 'English' : 'Roman Urdu';
        results.querySelectorAll('.wl-result-label[data-ur]').forEach((l) => { l.textContent = ur ? l.dataset.ur : l.dataset.en; });
        form.dataset.lang = ur ? 'ur' : 'en';
        show(false);
      };
      lang.addEventListener('click', () => {
        const ur = form.dataset.lang !== 'ur';
        try { localStorage.setItem('wl-lang', ur ? 'ur' : 'en'); } catch {}
        apply(ur);
      });
      let saved = null;
      try { saved = localStorage.getItem('wl-lang'); } catch {}
      if (saved === 'ur') apply(true);
    }
  }

  // ?load=name:value,name:value restores a shared result. Only known fields and listed options are used.
  const load = new URLSearchParams(window.location.search).get('load');
  if (load) {
    let changed = false;
    for (const pair of load.split(',')) {
      const i = pair.indexOf(':');
      if (i < 1) continue;
      const name = pair.slice(0, i);
      const f = cfg.fields.find((x) => x.name === name);
      if (!f) continue;
      if (lists[name]) {
        const rows = lists[name].decode(decodeURIComponent(pair.slice(i + 1)).slice(0, 2000)).slice(0, 40);
        if (rows.length) { lists[name].set(rows); changed = true; }
        continue;
      }
      const value = decodeURIComponent(pair.slice(i + 1)).slice(0, 40);
      const input = el(name);
      if (!input) continue;
      if (f.type === 'checkbox') input.checked = value === '1';
      else if (f.options) { if (f.options.includes(value)) input.value = value; else continue; }
      else input.value = value;
      changed = true;
    }
    if (changed) show(false);
  }

  if (cfg.live === 'open_meteo') {
    const getLive = async () => {
      const city = el('city')?.value;
      const c = cfg.data.cities?.[city];
      if (!c?.lat) return;
      const f = await forecastFor(c, cfg.data.defaults.forecast_tilt_deg);
      if (f && el('city').value === city) { live = { ...f, city }; show(false); }
    };
    el('city')?.addEventListener('change', getLive);
    getLive();
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); show(true); });
  form.addEventListener('change', (e) => { if (!e.target.closest('.wl-loads') && (e.target.tagName === 'SELECT' || e.target.type === 'checkbox')) show(true); });
}

document.querySelectorAll('form[data-wl-tool]').forEach((form) => { init(form).catch(() => {}); });

// Embed page: copy buttons next to each code box.
document.querySelectorAll('[data-wl-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const box = document.getElementById(btn.dataset.wlCopy);
    box.select();
    try { await navigator.clipboard.writeText(box.value); btn.textContent = 'Copied'; } catch { document.execCommand('copy'); }
  });
});

// Inside an embed iframe: tell the host page our height so the script embed can fit it (wattlyst-embed.js).
if (document.body.hasAttribute('data-wl-embed') && window.parent !== window && 'ResizeObserver' in window) {
  new ResizeObserver(() => window.parent.postMessage({ wattlyst: 'height', h: document.documentElement.scrollHeight }, '*')).observe(document.body);
}

// Lookup pages (error codes): the tables are already in the HTML; this only hides rows and brands that do not match.
document.querySelectorAll('form[data-wl-lookup]').forEach((form) => {
  const page = form.closest('.wl-page');
  const groups = [...page.querySelectorAll('[data-wl-group]')];
  const select = form.querySelector('[data-wl-group-select]');
  const box = form.querySelector('[data-wl-filter]');
  const nomatch = form.querySelector('[data-wl-nomatch]');
  const apply = () => {
    const q = box.value.trim().toLowerCase();
    let shown = 0;
    for (const g of groups) {
      const on = !select.value || g.dataset.wlGroup === select.value;
      let rows = 0;
      for (const tr of g.querySelectorAll('tbody tr')) {
        const hit = on && (!q || tr.textContent.toLowerCase().includes(q));
        tr.hidden = !hit;
        if (hit) rows += 1;
      }
      g.hidden = !on || rows === 0;
      shown += rows;
    }
    nomatch.hidden = shown > 0;
  };
  select.addEventListener('change', apply);
  box.addEventListener('input', apply);
  if (select.value || box.value) apply();
});
