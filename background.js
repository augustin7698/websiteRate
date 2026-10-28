// Service worker : affiche la note sous forme de pastille sur l'icône de l'extension
importScripts('shared.js');

function colorFor(rating) {
  if (rating >= 4) return '#1e8e3e';
  if (rating === 3) return '#b06f00';
  if (rating >= 1) return '#c5221f';
  return '#5f6b7a';
}

async function updateBadge(tabId, url) {
  try {
    if (!url || !SN.isTrackable(url)) {
      await chrome.action.setBadgeText({ tabId, text: '' });
      return;
    }
    const map = await SN.getAll();
    const entry = SN.findEntry(map, SN.normalizeHost(url));
    if (!entry || (!entry.rating && !entry.note)) {
      await chrome.action.setBadgeText({ tabId, text: '' });
      return;
    }
    const text = entry.rating ? entry.rating + '★' : '✎';
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: colorFor(entry.rating) });
  } catch (e) {
    // l'onglet a pu être fermé entre-temps
  }
}

async function refreshAllTabs() {
  const tabs = await chrome.tabs.query({});
  tabs.forEach((t) => updateBadge(t.id, t.url));
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') updateBadge(tabId, tab.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    updateBadge(tabId, tab.url);
  } catch (e) {}
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[SN.KEY]) refreshAllTabs();
});

chrome.runtime.onInstalled.addListener(refreshAllTabs);
chrome.runtime.onStartup.addListener(refreshAllTabs);
