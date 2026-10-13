// Live calculator runner (progressive enhancement: the default result is already in the HTML).
// It only reads the form, calls the engine and prints the engine's numbers. No formula lives here.
import { fmt, render } from '../../engine/format.js';
import { errorMessage } from '../../engine/messages.js';

const ver = new URL(import.meta.url).searchParams.get('ver') || '';

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

  const read = () => {
    const inputs = { ...cfg.fixed };
    for (const f of cfg.fields) {
      const input = el(f.name);
      if (!input) continue;
      if (f.type === 'checkbox') inputs[f.name] = input.checked;
      else if (input.value.trim() !== '') inputs[f.name] = input.value.trim();
    }
    return inputs;
  };

  const show = (pushState) => {
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
      const bad = out.field && el(out.field);
      if (bad && bad.setAttribute) {
        bad.setAttribute('aria-invalid', 'true');
        bad.setAttribute('aria-describedby', `${bad.getAttribute('aria-describedby') || ''} ${errorEl.id}`.trim());
        if (pushState) bad.focus();
      }
      return;
    }
    errorEl.hidden = true;
    results.hidden = false;
    for (const o of cfg.outputs) {
      const node = results.querySelector(`[data-out="${o.key}"] .wl-val`);
      if (node) node.textContent = fmt(out[o.key], o.spec);
    }
    if (howEl && cfg.how) {
      const text = render(cfg.how, { in: out, out, d: cfg.data.defaults });
      howEl.hidden = text === null;
      if (text !== null) howEl.textContent = text;
    }
    if (pushState) {
      const load = cfg.fields
        .filter((f) => f.type !== 'checkbox' ? el(f.name)?.value.trim() : el(f.name)?.checked)
        .map((f) => `${f.name}:${encodeURIComponent(f.type === 'checkbox' ? '1' : el(f.name).value.trim())}`)
        .join(',');
      const url = new URL(window.location.href);
      url.search = load ? `?load=${load}` : '';
      history.replaceState(null, '', url);
    }
  };

  // ?load=name:value,name:value restores a shared result. Only known fields and listed options are used.
  const load = new URLSearchParams(window.location.search).get('load');
  if (load) {
    let changed = false;
    for (const pair of load.split(',')) {
      const i = pair.indexOf(':');
      if (i < 1) continue;
      const name = pair.slice(0, i);
      const value = decodeURIComponent(pair.slice(i + 1)).slice(0, 40);
      const f = cfg.fields.find((x) => x.name === name);
      const input = f && el(name);
      if (!input) continue;
      if (f.type === 'checkbox') input.checked = value === '1';
      else if (f.type === 'select') { if (f.options.includes(value)) input.value = value; else continue; }
      else input.value = value;
      changed = true;
    }
    if (changed) show(false);
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); show(true); });
  form.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT' || e.target.type === 'checkbox') show(true); });
}

document.querySelectorAll('form[data-wl-tool]').forEach((form) => { init(form).catch(() => {}); });
