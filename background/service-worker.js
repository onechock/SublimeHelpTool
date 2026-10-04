// service-worker.js – Sublime help tool
// Gråar ut ikonen om ingen kund matchar, färgar den blå om match finns.

import { getCustomers, HUB_CACHE_KEY } from '../shared/storage.js';
import { refreshHub } from '../shared/hub.js';

const UI_KEY = 'sublimeHelp_ui';
const HUB_REFRESH_ALARM = 'hubRefresh';
const HUB_REFRESH_MINUTES = 30;

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

  // Hitta matchande applikation och räkna dess övriga domäner
  let otherCount = 0;
  let matched = false;
  for (const customer of customers) {
    const app = customer.applications.find(a => a.domains.some(d => getHostname(d.baseUrl) === tabHost));
    if (app) {
      matched = true;
      otherCount = app.domains.length - 1;
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

// Hämtar kunder från hubben regelbundet, så att listan är färsk även när
// popupen inte har öppnats.
function scheduleHubRefresh() {
  chrome.alarms.create(HUB_REFRESH_ALARM, { periodInMinutes: HUB_REFRESH_MINUTES });
  refreshHub();
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Sublime help tool installerat!');
  scheduleHubRefresh();
});

chrome.runtime.onStartup.addListener(scheduleHubRefresh);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HUB_REFRESH_ALARM) refreshHub();
});

// Kunddata har ändrats (egna URL:er synkade från en annan profil/dator, eller
// ny lista från hubben) – uppdatera badge/ikon på alla öppna flikar så det
// syns direkt utan att öppna popupen.
chrome.storage.onChanged.addListener((changes, areaName) => {
  const hubListChanged = areaName === 'local' && HUB_CACHE_KEY in changes;
  if (areaName !== 'sync' && !hubListChanged) return;
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

function eligibleDomains(app, devMode) {
  return app.domains.filter(d => d.baseUrl && (devMode || !d.devOnly));
}

// Träff på kundnamn ger alla kundens applikationer; träff på applikationsnamn
// ger bara de applikationerna.
function matchingApplications(customer, query) {
  if (customer.name.toLowerCase().includes(query)) return customer.applications;
  return customer.applications.filter(a => a.name.toLowerCase().includes(query));
}

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const query = text.trim().toLowerCase();
  const { customers, devMode } = await getOmniboxData();

  if (!query) {
    chrome.omnibox.setDefaultSuggestion({ description: 'Skriv ett kundnamn för att öppna en miljö' });
    suggest([]);
    return;
  }

  const matches = customers.filter(c => matchingApplications(c, query).length > 0);
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
    for (const app of matchingApplications(customer, query)) {
      const appLabel = customer.applications.length > 1 ? ` – ${escapeXml(app.name)}` : '';
      for (const domain of eligibleDomains(app, devMode)) {
        if (suggestions.length >= MAX_OMNIBOX_SUGGESTIONS) break outer;
        suggestions.push({
          content: `${customer.id}|${app.slug}|${domain.id}`,
          description: `<match>${escapeXml(customer.name)}</match>${appLabel} – ${escapeXml(domain.label || domain.baseUrl)} <dim>${escapeXml(domain.baseUrl.replace(/^https?:\/\//, ''))}</dim>`,
        });
      }
    }
  }

  suggest(suggestions);
});

chrome.omnibox.onInputEntered.addListener(async (content, disposition) => {
  const { customers, devMode } = await getOmniboxData();

  let targetUrl = null;

  const idMatch = content.match(/^([^|]+)\|([^|]+)\|([^|]+)$/);
  if (idMatch) {
    const [, customerId, slug, domainId] = idMatch;
    const customer = customers.find(c => c.id === customerId);
    const app = customer?.applications.find(a => a.slug === slug);
    const domain = app?.domains.find(d => d.id === domainId);
    if (domain?.baseUrl) targetUrl = domain.baseUrl;
  }

  if (!targetUrl) {
    const query = content.trim().toLowerCase();
    for (const customer of query ? customers : []) {
      const domain = matchingApplications(customer, query)
        .flatMap(app => eligibleDomains(app, devMode))[0];
      if (domain) {
        targetUrl = domain.baseUrl;
        break;
      }
    }
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


