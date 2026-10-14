// Non-calculator pages: the error-code lookup filter and the embed page's copy buttons (loaded by wattlyst-tool.js only
// where those elements exist).

// Embed page: copy buttons next to each code box.
document.querySelectorAll('[data-wl-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const box = document.getElementById(btn.dataset.wlCopy);
    box.select();
    try { await navigator.clipboard.writeText(box.value); btn.textContent = 'Copied'; } catch { document.execCommand('copy'); }
  });
});

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
