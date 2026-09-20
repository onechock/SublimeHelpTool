// service-worker.js – Sublime help tool
// Gråar ut ikonen om ingen kund matchar, färgar den blå om match finns.

import { getCustomers } from '../shared/storage.js';

const UI_KEY = 'sublimeHelp_ui';

// Returnerar host inkl. port (t.ex. "localhost:5001") för korrekt matchning
function getHostname(url) {
  try { return new URL(url).host.toLowerCase(); } catch { return null; }
}

// Tillåter bara http(s)-URL:er – blockerar javascript:, data: m.m.
function sanitizeUrl(url) {
  const s = String(url ?? '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function getIconImageData(size, grayscale) {
  const response = await fetch(chrome.runtime.getURL(`icons/icon${size}.png`));
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, size, size);

  if (grayscale) {
    const imgData = ctx.getImageData(0, 0, size, size);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const grey = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      d[i] = d[i + 1] = d[i + 2] = grey;
      d[i + 3] = Math.round(d[i + 3] * 0.45);
    }
    ctx.putImageData(imgData, 0, 0);
  }

  return ctx.getImageData(0, 0, size, size);
}

async function updateIcon(tabId, tabUrl) {
  if (!tabUrl || tabUrl.startsWith('chrome://') || tabUrl.startsWith('edge://')) {
    chrome.action.setBadgeText({ tabId, text: '' });
    chrome.action.setIcon({ tabId, path: { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' } });
    return;
  }

  const customers = await getCustomers();
  const tabHost = getHostname(tabUrl);

  // Hitta matchande kund och räkna övriga domäner
  let otherCount = 0;
  let matched = false;
  for (const customer of customers) {
    const match = customer.domains.find(d => getHostname(d.baseUrl) === tabHost);
    if (match) {
      matched = true;
      otherCount = customer.domains.length - 1;
      break;
    }
  }

  chrome.action.setIcon({ tabId, path: { 16: 'icons/icon16.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' } });

  if (matched && otherCount > 0) {
    chrome.action.setBadgeText({ tabId, text: String(otherCount) });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#2c3956' });
  } else {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
}

// Byt flik
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  updateIcon(tabId, tab.url);
});

// Navigera till ny sida
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    updateIcon(tabId, tab.url);
  }
});

// Första start
chrome.runtime.onInstalled.addListener(() => {
  console.log('Sublime help tool installerat!');
});

// Kunddata har synkats in (t.ex. från en annan profil/dator) – uppdatera
// badge/ikon på alla öppna flikar så det syns direkt utan att öppna popupen.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync') return;
  chrome.tabs.query({}, tabs => {
    for (const tab of tabs) {
      if (tab.id !== undefined) updateIcon(tab.id, tab.url);
    }
  });
});

// Stänger sidopanelen för en flik (anropas via meddelande, eftersom panelens
// egen skript avslutas så fort panelen stängs och inte hinner köra klart).
const SIDE_PANEL_PATH = 'popup/popup.html?mode=panel';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'closeSidePanel' || !message.tabId) return false;

  (async () => {
    await chrome.sidePanel.setOptions({ tabId: message.tabId, enabled: false });
    await chrome.sidePanel.setOptions({ tabId: message.tabId, path: SIDE_PANEL_PATH, enabled: true });
    sendResponse({ ok: true });
  })();

  return true;
});

// ---- Omnibox: skriv "sh kundnamn" i adressfältet för att öppna en miljö ----
const MAX_OMNIBOX_SUGGESTIONS = 8;

async function getOmniboxData() {
  const [customers, r] = await Promise.all([
    getCustomers(),
    chrome.storage.local.get(UI_KEY),
  ]);
  return { customers, devMode: !!(r[UI_KEY]?.devMode) };
}

function eligibleDomains(customer, devMode) {
  return customer.domains.filter(d => d.baseUrl && (devMode || !d.devOnly));
}

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const query = text.trim().toLowerCase();
  const { customers, devMode } = await getOmniboxData();

  if (!query) {
    chrome.omnibox.setDefaultSuggestion({ description: 'Skriv ett kundnamn för att öppna en miljö' });
    suggest([]);
    return;
  }

  const matches = customers.filter(c => c.name.toLowerCase().includes(query));
  if (matches.length === 0) {
    chrome.omnibox.setDefaultSuggestion({ description: `Ingen kund matchar "${escapeXml(text)}"` });
    suggest([]);
    return;
  }

  chrome.omnibox.setDefaultSuggestion({
    description: matches.length === 1
      ? `Öppna miljö för <match>${escapeXml(matches[0].name)}</match>`
      : `${matches.length} kunder matchar <match>${escapeXml(text)}</match> – välj en miljö nedan`
  });

  const suggestions = [];
  outer:
  for (const customer of matches) {
    for (const domain of eligibleDomains(customer, devMode)) {
      if (suggestions.length >= MAX_OMNIBOX_SUGGESTIONS) break outer;
      suggestions.push({
        content: `${customer.id}|${domain.id}`,
        description: `<match>${escapeXml(customer.name)}</match> – ${escapeXml(domain.label || domain.baseUrl)} <dim>${escapeXml(domain.baseUrl.replace(/^https?:\/\//, ''))}</dim>`,
      });
    }
  }

  suggest(suggestions);
});

chrome.omnibox.onInputEntered.addListener(async (content, disposition) => {
  const { customers, devMode } = await getOmniboxData();

  let targetUrl = null;

  const idMatch = content.match(/^([a-z0-9]+)\|([a-z0-9]+)$/i);
  if (idMatch) {
    const [, customerId, domainId] = idMatch;
    const customer = customers.find(c => c.id === customerId);
    const domain = customer?.domains.find(d => d.id === domainId);
    if (domain?.baseUrl) targetUrl = domain.baseUrl;
  }

  if (!targetUrl) {
    const query = content.trim().toLowerCase();
    const customer = query ? customers.find(c => c.name.toLowerCase().includes(query)) : null;
    const domain = customer ? eligibleDomains(customer, devMode)[0] : null;
    if (domain) targetUrl = domain.baseUrl;
  }

  const safeUrl = sanitizeUrl(targetUrl);
  if (!safeUrl) return;

  if (disposition === 'currentTab') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.tabs.update(tab.id, { url: safeUrl });
    else chrome.tabs.create({ url: safeUrl });
  } else {
    chrome.tabs.create({ url: safeUrl, active: disposition === 'newForegroundTab' });
  }
});


