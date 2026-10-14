// Live calculator runner (progressive enhancement: the default result is already in the HTML).
// It only reads the form, calls the engine and prints the engine's numbers. No formula lives here.
import { fmt, render } from '../../engine/format.js';
import { errorMessage, noticeCode } from '../../engine/messages.js';

const ver = new URL(import.meta.url).searchParams.get('ver') || '';

async function init(form) {
  const cfgEl = form.querySelector('.wl-config');
  if (!cfgEl) return;
  const cfg = JSON.parse(cfgEl.textContent);
  const q = ver ? `?ver=${ver}` : '';
  const hasList = cfg.fields.some((f) => f.type === 'loads');
  // The appliance list, the N6 live forecast and the N11 diagram live in their own modules, loaded only where used.
  const [mod, list, extra] = await Promise.all([import(`../../engine/${cfg.module}${q}`), hasList && import(`./wattlyst-loads.js${q}`), (cfg.live || cfg.diagram) && import(`./wattlyst-extra.js${q}`)]);
  const calc = mod[cfg.calc];
  if (typeof calc !== 'function') return;
  const labels = Object.fromEntries(cfg.fields.map((f) => [f.name, f.label.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())]));
  const choices = cfg.fields.filter((f) => f.options).map((f) => f.name);
  const errorEl = form.querySelector('.wl-error');
  const results = form.querySelector('.wl-results');
  const howEl = form.parentElement.querySelector('[data-wl-how]');
  const el = (name) => form.elements.namedItem(name);
  const lists = {};
  let show;
  for (const f of cfg.fields) if (f.type === 'loads') lists[f.name] = list.loadsField(form, f, cfg, (focus) => show && show(focus));

  let live = null;
  let liveFailed = false;
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

  const fieldEl = (name, code) => {
    // Errors on a list row come back as loads with the row in the code (load_<row>_<column>_...); point at that cell.
    if (lists[name]) {
      const box = form.querySelector(`[data-wl-loads="${name}"]`);
      const m = /^load_(\d+)_([a-z]+)_/.exec(code);
      const tr = m && box.querySelectorAll('tbody tr')[m[1]];
      return (tr && (tr.querySelector(`[data-k="${m[2]}"]`) || tr.querySelector('[data-k="watts"]'))) || box.querySelector('select');
    }
    return el(name);
  };
  const share = form.querySelector('.wl-share');
  const diagram = form.querySelector('[data-wl-diagram]');

  // One element carries an error (red, role=alert) or a notice on a valid result (amber, role=status) (audit WL-54, WL-61).
  const say = (text, isError) => {
    errorEl.textContent = text;
    errorEl.hidden = !text;
    errorEl.classList.toggle('wl-notice', !isError);
    errorEl.setAttribute('role', isError ? 'alert' : 'status');
  };
  show = (pushState) => {
    const out = calc(read(), cfg.data);
    form.querySelectorAll('[aria-invalid]').forEach((n) => {
      n.removeAttribute('aria-invalid');
      const ids = (n.getAttribute('aria-describedby') || '').split(' ').filter((x) => x && x !== errorEl.id);
      if (ids.length) n.setAttribute('aria-describedby', ids.join(' ')); else n.removeAttribute('aria-describedby');
    });
    if (!out.ok) {
      say(errorMessage(out.error, labels, choices), true);
      results.hidden = true;
      if (howEl) howEl.hidden = true;
      // Nothing from the last good result stays on screen or in a shared link (audit WL-30).
      if (share) share.hidden = true;
      if (diagram) diagram.hidden = true;
      // Tie the message to the wrong field and move focus there (WCAG 3.3.1, build-plan Phase 2).
      const bad = out.field && fieldEl(out.field, out.error);
      if (bad && bad.setAttribute) {
        const adv = bad.closest('details');
        if (adv) adv.open = true; // a field under "Advanced settings" must be visible before it takes focus
        bad.setAttribute('aria-invalid', 'true');
        bad.setAttribute('aria-describedby', `${bad.getAttribute('aria-describedby') || ''} ${errorEl.id}`.trim());
        if (pushState) bad.focus();
      }
      return;
    }
    results.hidden = false;
    if (share) share.hidden = false;
    if (diagram) diagram.hidden = false;
    // Warning flags (size above the standard list, solar above the sanctioned load) print a notice, not a blank.
    const notice = noticeCode(out) || (liveFailed && out.source === 'typical' ? 'forecast_unavailable' : '');
    say(notice ? errorMessage(notice) : '');
    for (const o of cfg.outputs) {
      const node = results.querySelector(`[data-out="${o.key}"] .wl-val`);
      if (!node) continue;
      // An optional result the inputs leave out (N6 value with no tariff) hides its card instead of printing n/a (WL-31).
      node.textContent = fmt(out[o.key], o.spec);
      node.closest('.wl-result').hidden = !node.textContent;
    }
    if (diagram && cfg.diagram === 'battery_grid') extra.drawGrid(diagram, Math.round(out.n_series), Math.round(out.n_parallel));
    if (howEl && cfg.how) {
      const text = render(form.dataset.lang === 'ur' && cfg.how_ur ? cfg.how_ur : cfg.how, { in: out, out, d: cfg.data.defaults, data: cfg.data });
      howEl.hidden = text === null;
      if (text !== null) howEl.textContent = text;
    }
    if (pushState) history.replaceState(null, '', shareUrl(window.location.href));
  };

  // The ?load= link that reproduces the current inputs (only filled fields; the canonical stays clean). Inside an
  // embed it points at the full tool page (the canonical), not the noindex /embed/ URL (audit WL-32).
  const home = (document.body.hasAttribute('data-wl-embed') && document.querySelector('link[rel="canonical"]')?.href) || '';
  const shareUrl = (href = home || window.location.href) => {
    const load = cfg.fields
      .map((f) => {
        if (lists[f.name]) return `${f.name}:${encodeURIComponent(lists[f.name].encode())}`;
        const v = f.type === 'checkbox' ? (el(f.name)?.checked ? '1' : '') : el(f.name)?.value.trim();
        return v ? `${f.name}:${encodeURIComponent(v)}` : '';
      })
      .filter(Boolean)
      .join(',');
    const url = new URL(href);
    url.search = load ? `?load=${load}` : '';
    return url.href;
  };

  // Share bar: Save as PDF (the browser's print dialog, with a print stylesheet), WhatsApp (results + link), Copy link.
  if (share) {
    share.hidden = false;
    const note = share.querySelector('.wl-share-note');
    const summary = () => [...results.querySelectorAll('.wl-result:not([hidden])')].map((r) => `${r.querySelector('.wl-result-label').textContent}: ${r.querySelector('output').textContent.trim()}`).join('\n');
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

  // ?load=name:value,name:value restores a shared result. Only known fields and listed options are used. Read from the
  // raw query: each value is encoded once, so a typed "18%" or "1,500" survives; a broken pair is skipped (audit WL-06).
  const load = /[?&]load=([^&#]*)/.exec(window.location.search)?.[1];
  if (load) {
    let changed = false;
    for (const pair of load.split(',')) {
      const i = pair.indexOf(':');
      if (i < 1) continue;
      const name = pair.slice(0, i);
      const f = cfg.fields.find((x) => x.name === name);
      if (!f) continue;
      let value;
      try { value = decodeURIComponent(pair.slice(i + 1)); } catch { continue; }
      if (lists[name]) {
        const rows = lists[name].decode(value.slice(0, 2000));
        if (rows.length) { lists[name].set(rows); changed = true; }
        continue;
      }
      value = value.slice(0, 40);
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
      const f = await extra.forecastFor(c, cfg.data.defaults.forecast_tilt_deg);
      liveFailed = !f;
      if (el('city').value !== city) return;
      if (f) live = { ...f, city };
      show(false);
    };
    el('city')?.addEventListener('change', getLive);
    getLive();
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); show(true); });
  // Every committed change recalculates, typed or picked, in a list row or not (audit WL-35); only a pick moves
  // focus to an error, so leaving a typed field never pulls the cursor back.
  form.addEventListener('change', (e) => { if (!e.target.closest('.wl-loads')) show(e.target.tagName === 'SELECT' || e.target.type === 'checkbox'); });
}

// A calculator that fails to start says so instead of failing silently (audit WL-06).
document.querySelectorAll('form[data-wl-tool]').forEach((form) => {
  init(form).catch((e) => {
    console.error(e);
    const box = form.querySelector('.wl-error');
    if (box) { box.textContent = errorMessage('calculator_failed'); box.hidden = false; }
  });
});

// Inside an embed iframe: tell the host page our height so the script embed can fit it (wattlyst-embed.js).
if (document.body.hasAttribute('data-wl-embed') && window.parent !== window && 'ResizeObserver' in window) {
  new ResizeObserver(() => window.parent.postMessage({ wattlyst: 'height', h: document.documentElement.scrollHeight }, '*')).observe(document.body);
}

// Lookup filter and embed code boxes live in their own small module, so tool pages do not download them.
if (document.querySelector('[data-wl-lookup], [data-wl-copy]')) import(`./wattlyst-page.js${ver ? `?ver=${ver}` : ''}`);
