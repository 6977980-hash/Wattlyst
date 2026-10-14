// Appliance-list field for the live calculator (assets/js/wattlyst-tool.js imports it only on pages that have a list).
// It only reads and writes the rows; no formula lives here.

const MAX_ROWS = 40; // the add button and a shared link stop at the same count (audit WL-34)

/** Appliance-list field: rows of { id, watts, qty, hours } (+ start where the field has the start flag) with add/remove and auto-filled watts and hours. */
export function loadsField(form, f, cfg, onChange) {
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
  const addBtn = box.querySelector('.wl-add-row');
  const cap = () => { addBtn.disabled = body.children.length >= MAX_ROWS; };
  addBtn.addEventListener('click', () => { if (body.children.length < MAX_ROWS) add().querySelector('select').focus(); cap(); });
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('.wl-remove-row');
    if (!btn || body.children.length <= 1) return;
    btn.closest('tr').remove();
    cap();
    onChange();
  });
  box.addEventListener('change', (e) => {
    if (e.target.matches('[data-k="id"]')) { fill(e.target.closest('tr')); onChange(); }
  });
  const rows = () => [...body.querySelectorAll('tr')].map((tr) => Object.fromEntries(['id', ...keys].map((k) => [k, tr.querySelector(`[data-k="${k}"]`).value.trim()])));
  const set = (list) => { body.innerHTML = ''; list.slice(0, MAX_ROWS).forEach(add); cap(); };
  // ?load= rows: id~watts~qty~hours[~start] (start last, so links made before the column still read).
  const order = ['id', 'watts', 'qty', 'hours', 'start'];
  return { rows, set, encode: () => rows().map((r) => order.filter((k) => k in r).map((k) => r[k]).join('~')).join(';'), decode: (s) => s.split(';').map((p) => { const v = p.split('~'); return Object.fromEntries(order.map((k, i) => [k, v[i]])); }) };
}
