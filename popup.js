const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const isFull = params.has('full');
if (isFull) document.body.classList.add('full');

const current = { host: null, rating: 0, exists: false };

function starsText(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function faviconUrl(pageUrl) {
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl);
  u.searchParams.set('size', '32');
  return u.toString();
}

function flash(el, msg, kind) {
  el.textContent = msg;
  el.className = 'status' + (kind ? ' ' + kind : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.textContent = ''; el.className = 'status'; }, 2500);
}

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/* ---------- Onglets ---------- */
function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', String(on));
  });
  $('#panel-current').hidden = name !== 'current';
  $('#panel-list').hidden = name !== 'list';
  if (name === 'list') renderList();
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchTab(t.dataset.tab)));

/* ---------- Étoiles ---------- */
function buildStars() {
  const box = $('#stars');
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'star';
    b.dataset.v = i;
    b.textContent = '★';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', i + (i > 1 ? ' étoiles' : ' étoile'));
    b.addEventListener('click', () => setRating(current.rating === i ? 0 : i));
    box.append(b);
  }
}

function setRating(n) {
  current.rating = n;
  document.querySelectorAll('.star').forEach((b) => {
    const v = Number(b.dataset.v);
    b.classList.toggle('on', v <= n);
    b.setAttribute('aria-checked', String(v === n));
  });
  $('#ratingText').textContent = n ? n + ' sur 5' : 'Pas de note';
}

/* ---------- Site courant ---------- */
async function initCurrent() {
  buildStars();
  setRating(0);

  if (isFull) {
    $('#tab-current').hidden = true;
    switchTab('list');
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !SN.isTrackable(tab.url)) {
    $('#unsupported').hidden = false;
    return;
  }

  const tabHost = SN.normalizeHost(tab.url);
  const map = await SN.getAll();
  const found = SN.findEntry(map, tabHost);

  current.host = found ? found.host : tabHost;
  current.exists = !!found;

  $('#editor').hidden = false;
  $('#host').textContent = current.host;
  $('#favicon').src = faviconUrl(tab.url);

  if (found) {
    setRating(found.rating || 0);
    $('#note').value = found.note || '';
    const inherited = found.host !== tabHost ? ' · s\'applique aussi à ' + tabHost : '';
    $('#hint').textContent = 'Modifié le ' + formatDate(found.updatedAt) + inherited;
    $('#btnDelete').hidden = false;
  } else {
    $('#hint').textContent = 'Pas encore noté';
  }
  $('#note').focus();
}

async function saveCurrent() {
  const note = $('#note').value.trim();
  if (!current.rating && !note) {
    flash($('#status'), 'Ajoutez une note ou un commentaire.', 'err');
    return;
  }
  await SN.save(current.host, current.rating, note);
  current.exists = true;
  $('#btnDelete').hidden = false;
  $('#hint').textContent = 'Modifié le ' + formatDate(Date.now());
  flash($('#status'), 'Enregistré ✓', 'ok');
}

async function deleteCurrent() {
  if (!confirm('Supprimer la note de ' + current.host + ' ?')) return;
  await SN.remove(current.host);
  current.exists = false;
  setRating(0);
  $('#note').value = '';
  $('#btnDelete').hidden = true;
  $('#hint').textContent = 'Pas encore noté';
  flash($('#status'), 'Supprimé', 'ok');
}

$('#btnSave').addEventListener('click', saveCurrent);
$('#btnDelete').addEventListener('click', deleteCurrent);
$('#note').addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') saveCurrent();
});

/* ---------- Liste ---------- */
async function renderList() {
  const map = await SN.getAll();
  const q = $('#search').value.trim().toLowerCase();
  const sort = $('#sort').value;

  let items = Object.entries(map).map(([host, v]) => Object.assign({ host }, v));
  $('#count').textContent = items.length;

  items = items.filter((i) => !q || i.host.includes(q) || (i.note || '').toLowerCase().includes(q));
  items.sort((a, b) => {
    if (sort === 'rating') return (b.rating || 0) - (a.rating || 0) || (b.updatedAt || 0) - (a.updatedAt || 0);
    if (sort === 'alpha') return a.host.localeCompare(b.host);
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  const ul = $('#list');
  ul.replaceChildren();
  $('#emptyList').hidden = items.length > 0;
  if (!items.length && q) {
    $('#emptyList').querySelector('.empty-title').textContent = 'Aucun résultat';
    $('#emptyList').querySelector('p:last-child').textContent = 'Essayez un autre mot.';
  } else {
    $('#emptyList').querySelector('.empty-title').textContent = 'Aucun site noté';
    $('#emptyList').querySelector('p:last-child').textContent = 'Les sites que vous notez apparaissent ici.';
  }

  for (const i of items) {
    const li = document.createElement('li');
    li.className = 'item';
    li.tabIndex = 0;

    const img = document.createElement('img');
    img.className = 'favicon';
    img.alt = '';
    img.src = faviconUrl('https://' + i.host);

    const body = document.createElement('div');
    body.className = 'item-body';
    const top = document.createElement('div');
    top.className = 'item-top';
    const host = document.createElement('span');
    host.className = 'item-host';
    host.textContent = i.host;
    top.append(host);
    if (i.rating) {
      const s = document.createElement('span');
      s.className = 'item-stars';
      s.textContent = starsText(i.rating);
      s.setAttribute('aria-label', i.rating + ' sur 5');
      top.append(s);
    }
    body.append(top);
    if (i.note) {
      const n = document.createElement('div');
      n.className = 'item-note';
      n.textContent = i.note;
      body.append(n);
    }

    const del = document.createElement('button');
    del.className = 'item-del';
    del.type = 'button';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Supprimer ' + i.host);
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Supprimer la note de ' + i.host + ' ?')) return;
      await SN.remove(i.host);
      if (i.host === current.host) {
        current.exists = false;
        setRating(0);
        $('#note').value = '';
        $('#btnDelete').hidden = true;
        $('#hint').textContent = 'Pas encore noté';
      }
      renderList();
    });

    const open = () => chrome.tabs.create({ url: 'https://' + i.host });
    li.addEventListener('click', open);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });

    li.append(img, body, del);
    ul.append(li);
  }
}

$('#search').addEventListener('input', renderList);
$('#sort').addEventListener('change', renderList);

/* ---------- Export / import ---------- */
$('#btnExport').addEventListener('click', async () => {
  const sites = await SN.getAll();
  const payload = { version: 1, exportedAt: new Date().toISOString(), sites };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'notes-de-sites-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// Le sélecteur de fichier ferme le popup sur certains systèmes : on passe par une page complète.
$('#btnImport').addEventListener('click', () => {
  if (isFull) $('#file').click();
  else chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?full=1&import=1') });
});

function sanitizeEntry(v) {
  if (!v || typeof v !== 'object') return null;
  const rating = Math.max(0, Math.min(5, Math.round(Number(v.rating) || 0)));
  const note = typeof v.note === 'string' ? v.note.slice(0, 5000) : '';
  if (!rating && !note) return null;
  const now = Date.now();
  return {
    rating,
    note,
    createdAt: Number(v.createdAt) || now,
    updatedAt: Number(v.updatedAt) || now
  };
}

$('#file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = data && data.sites ? data.sites : data;
    const map = await SN.getAll();
    let n = 0;
    for (const [rawHost, v] of Object.entries(incoming || {})) {
      const host = SN.normalizeHost(rawHost);
      const entry = sanitizeEntry(v);
      if (!host || !entry) continue;
      if (!map[host] || (map[host].updatedAt || 0) < entry.updatedAt) {
        map[host] = entry;
        n++;
      }
    }
    await SN.setAll(map);
    flash($('#listStatus'), n + ' site' + (n > 1 ? 's' : '') + ' importé' + (n > 1 ? 's' : ''), 'ok');
    renderList();
  } catch (err) {
    flash($('#listStatus'), 'Fichier invalide.', 'err');
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[SN.KEY] && !$('#panel-list').hidden) renderList();
});

/* ---------- Démarrage ---------- */
SN.getAll().then((m) => { $('#count').textContent = Object.keys(m).length; });
initCurrent();
if (params.has('import')) flash($('#listStatus'), 'Cliquez sur « Importer » pour choisir votre fichier.');
