// Script embed for other sites: turns <div class="wattlyst-embed" data-tool="b1"><a href="...">Calculator by
// Wattlyst</a></div> into the calculator iframe above the (kept, visible) credit link, and fits its height.
(function () {
  var base = new URL(document.currentScript ? document.currentScript.src : 'https://wattlyst.com/', location.href);
  var origin = base.origin;
  var site = base.href.split('/wp-content/')[0];
  var frames = [];
  document.querySelectorAll('.wattlyst-embed[data-tool]:not([data-done])').forEach(function (box) {
    var tool = String(box.getAttribute('data-tool')).toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!tool) return;
    var f = document.createElement('iframe');
    f.src = site + '/embed/' + tool + '/';
    f.title = 'Wattlyst calculator';
    f.loading = 'lazy';
    f.style.cssText = 'width:100%;max-width:720px;height:720px;border:0;display:block';
    box.insertBefore(f, box.firstChild);
    box.setAttribute('data-done', '1');
    frames.push(f);
  });
  window.addEventListener('message', function (e) {
    if (e.origin !== origin || !e.data || e.data.wattlyst !== 'height') return;
    frames.forEach(function (f) { if (f.contentWindow === e.source) f.style.height = Math.min(4000, Math.max(200, e.data.h + 4)) + 'px'; });
  });
})();
