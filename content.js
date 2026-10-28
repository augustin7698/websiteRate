// Content script :
// Sur une page de résultats de recherche : ajoute une pastille sous chaque résultat noté.
// (La note du site visité s'affiche uniquement sur l'icône de l'extension, voir background.js.)
(() => {
  if (window.top !== window) return;

  const here = SN.normalizeHost(location.href);

  // ---------- Détection des moteurs de recherche ----------
  const ENGINES = [
    /(^|\.)google\.[a-z.]+$/,
    /(^|\.)bing\.com$/,
    /(^|\.)duckduckgo\.com$/,
    /(^|\.)search\.brave\.com$/,
    /(^|\.)ecosia\.org$/,
    /(^|\.)startpage\.com$/,
    /(^|\.)qwant\.com$/,
    /(^|\.)search\.yahoo\.com$/,
    /(^|\.)yandex\.[a-z]+$/,
    /(^|\.)ecosia\.org$/
  ];

  function isSearchPage() {
    const h = location.hostname.toLowerCase();
    if (!ENGINES.some((re) => re.test(h))) return false;
    const p = new URLSearchParams(location.search);
    return p.has('q') || p.has('p') || p.has('text') || /search/.test(location.pathname);
  }

  function stars(n) {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  function hasContent(entry) {
    return entry && (entry.rating || entry.note);
  }

  // ---------- Pastilles dans les résultats de recherche ----------
  let cache = {};

  function resolveUrl(a) {
    let u;
    try { u = new URL(a.href); } catch (e) { return null; }
    const p = u.searchParams;
    // Bing : lien de redirection avec l'URL encodée en base64 dans "u"
    if (/(^|\.)bing\.com$/.test(u.hostname) && u.pathname.startsWith('/ck/')) {
      const v = p.get('u');
      if (v && v.startsWith('a1')) {
        try { return atob(v.slice(2).replace(/-/g, '+').replace(/_/g, '/')); } catch (e) {}
      }
      return null;
    }
    // DuckDuckGo (version HTML)
    if (u.pathname === '/l/' && p.get('uddg')) return p.get('uddg');
    // Google (ancien format)
    if (u.pathname === '/url' && (p.get('q') || p.get('url'))) return p.get('q') || p.get('url');
    return u.href;
  }

  function makeBadge(entry) {
    const host = document.createElement('div');
    host.setAttribute('data-sn-badge', '1');
    host.style.cssText = 'all:initial;display:block;width:fit-content;max-width:100%;margin:4px 0;';
    const root = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      .b {
        display: inline-flex; align-items: baseline; gap: 8px; max-width: 100%; box-sizing: border-box;
        padding: 2px 10px; background: #fff3b0; color: #2a2100;
        border: 1px solid #e6c84a; border-radius: 999px; cursor: pointer;
        font: 12px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      .b.open { border-radius: 10px; }
      .s { color: #b07800; letter-spacing: 1px; flex: none; }
      .t { min-width: 0; max-width: 480px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .b.open .t { white-space: pre-wrap; overflow-wrap: anywhere; max-width: 560px; }
    `;

    const box = document.createElement('div');
    box.className = 'b';
    box.title = entry.note ? entry.note : 'Site noté';

    if (entry.rating) {
      const s = document.createElement('span');
      s.className = 's';
      s.textContent = stars(entry.rating);
      box.append(s);
    }
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = entry.note || (entry.rating ? '' : 'Site noté');
    if (t.textContent) box.append(t);

    root.append(style, box);

    host.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      box.classList.toggle('open');
    });
    return host;
  }

  function annotate() {
    if (!Object.keys(cache).length) return;
    document.querySelectorAll('a[href^="http"]:not([data-sn-done])').forEach((a) => {
      const heading = a.closest('h1,h2,h3,h4');
      const inner = a.querySelector('h1,h2,h3,h4,[role="heading"],.title');
      if (!heading && !inner) return;
      a.setAttribute('data-sn-done', '1');

      const url = resolveUrl(a);
      if (!url) return;
      const h = SN.normalizeHost(url);
      if (!h || h === here) return;
      const entry = SN.findEntry(cache, h);
      if (!hasContent(entry)) return;

      (heading || a).insertAdjacentElement('afterend', makeBadge(entry));
    });
  }

  function clearBadges() {
    document.querySelectorAll('[data-sn-badge]').forEach((el) => el.remove());
    document.querySelectorAll('[data-sn-done]').forEach((el) => el.removeAttribute('data-sn-done'));
  }

  function debounce(fn, ms) {
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  async function initSearch() {
    cache = await SN.getAll();
    annotate();
    new MutationObserver(debounce(annotate, 250)).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[SN.KEY]) {
        cache = changes[SN.KEY].newValue || {};
        clearBadges();
        annotate();
      }
    });
  }

  // ---------- Démarrage ----------
  if (isSearchPage()) initSearch();
})();
