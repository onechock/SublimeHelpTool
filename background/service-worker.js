// service-worker.js – Sublime help tool
// Gråar ut ikonen om ingen kund matchar, färgar den blå om match finns.

const STORAGE_KEY = 'sublimeHelp_customers';

// Returnerar host inkl. port (t.ex. "localhost:5001") för korrekt matchning
function getHostname(url) {
  try { return new URL(url).host.toLowerCase(); } catch { return null; }
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

  const r = await chrome.storage.local.get(STORAGE_KEY);
  const customers = r[STORAGE_KEY] ?? [];
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


