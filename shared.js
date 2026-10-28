// Fonctions communes (popup, service worker, content script)
(function (root) {
  const KEY = 'sites';

  const SN = {
    KEY,

    // "https://www.exemple.com/page" -> "exemple.com"
    normalizeHost(input) {
      try {
        const u = input.includes('://') ? new URL(input) : new URL('https://' + input);
        return u.hostname.toLowerCase().replace(/^www\./, '');
      } catch (e) {
        return null;
      }
    },

    isTrackable(url) {
      return /^https?:\/\//i.test(url || '');
    },

    async getAll() {
      const data = await chrome.storage.local.get(KEY);
      return data[KEY] || {};
    },

    async setAll(map) {
      await chrome.storage.local.set({ [KEY]: map });
    },

    // Cherche une note pour "blog.exemple.com", puis "exemple.com"
    findEntry(map, host) {
      if (!host) return null;
      const parts = host.split('.');
      while (parts.length >= 2) {
        const h = parts.join('.');
        if (map[h]) return Object.assign({ host: h }, map[h]);
        parts.shift();
      }
      return null;
    },

    async save(host, rating, note) {
      const map = await SN.getAll();
      const now = Date.now();
      const prev = map[host];
      map[host] = {
        rating: rating || 0,
        note: note || '',
        createdAt: (prev && prev.createdAt) || now,
        updatedAt: now
      };
      await SN.setAll(map);
    },

    async remove(host) {
      const map = await SN.getAll();
      delete map[host];
      await SN.setAll(map);
    }
  };

  root.SN = SN;
})(typeof self !== 'undefined' ? self : window);
