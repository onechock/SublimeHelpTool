// shared/hub.js – Sublime help tool
// Hämtar kunder och länkar från Sublime Hub med medarbetarens vanliga
// Hub-inloggning (cookien __Host-SublimeHub skickas med tack vare
// host_permissions). Vid fel behålls den senast sparade listan.

import { setHubCache, setHubStatus } from './storage.js';

export const HUB_PROD_URL = 'https://hub.sublime.se';
export const HUB_DEV_URL = 'https://hub.dev.sublime.se';
const LINKS_PATH = '/api/v1/browser-links';
const HUB_URL_OVERRIDE_KEY = 'sublimeHelp_hubUrl';

// Prod-adressen, utom när tillägget körs lokalt (installerat som "unpacked"):
// då används hub.dev.sublime.se, eller en egen adress om en sådan sparats
// (t.ex. Aspire-adressen på localhost).
export async function getHubBaseUrl() {
  try {
    const self = await chrome.management.getSelf();
    if (self.installType === 'development') {
      const r = await chrome.storage.local.get(HUB_URL_OVERRIDE_KEY);
      const override = String(r[HUB_URL_OVERRIDE_KEY] ?? '').trim().replace(/\/+$/, '');
      return /^https?:\/\//i.test(override) ? override : HUB_DEV_URL;
    }
  } catch {
    // management otillgängligt – använd prod
  }
  return HUB_PROD_URL;
}

// Matchmönster för behörigheten till en Hub-adress (porten ignoreras).
export function hubOriginPattern(baseUrl) {
  const u = new URL(baseUrl);
  return `${u.protocol}//${u.hostname}/*`;
}

// Prod ligger i host_permissions; dev och localhost är valfria och måste
// godkännas en gång av användaren (kräver ett klick i popupen).
export async function hasHubPermission() {
  try {
    return await chrome.permissions.contains({ origins: [hubOriginPattern(await getHubBaseUrl())] });
  } catch {
    return false;
  }
}

export async function getHubUrlOverride() {
  const r = await chrome.storage.local.get(HUB_URL_OVERRIDE_KEY);
  return r[HUB_URL_OVERRIDE_KEY] ?? '';
}

export async function setHubUrlOverride(url) {
  const clean = String(url ?? '').trim().replace(/\/+$/, '');
  if (clean) await chrome.storage.local.set({ [HUB_URL_OVERRIDE_KEY]: clean });
  else await chrome.storage.local.remove(HUB_URL_OVERRIDE_KEY);
}

export async function openHubLogin() {
  await chrome.tabs.create({ url: await getHubBaseUrl() });
}

let inFlight = null;

// Hämtar listan från hubben och uppdaterar cache + status. Returnerar status-
// strängen. Anrop som sker medan en hämtning pågår delar samma anrop.
export function refreshHub() {
  inFlight ??= doRefresh().finally(() => { inFlight = null; });
  return inFlight;
}

async function doRefresh() {
  try {
    const base = await getHubBaseUrl();
    const res = await fetch(base + LINKS_PATH, {
      credentials: 'include',
      redirect: 'manual',
      headers: { Accept: 'application/json' },
    });

    // En omdirigering till inloggningen betyder att sessionen saknas.
    if (res.type === 'opaqueredirect' || res.status === 401) {
      await setHubStatus('needsLogin');
      return 'needsLogin';
    }
    if (res.status === 403) {
      await setHubStatus('forbidden');
      return 'forbidden';
    }
    if (!res.ok) {
      await setHubStatus('error', `Hub svarade ${res.status}`);
      return 'error';
    }

    const data = await res.json();
    if (!Array.isArray(data?.customers)) {
      await setHubStatus('error', 'Oväntat svar från Hub');
      return 'error';
    }
    await setHubCache(data.customers, 'hub');
    await setHubStatus('ok');
    return 'ok';
  } catch {
    // Offline eller Hub nere – den sparade listan används.
    await setHubStatus('offline');
    return 'offline';
  }
}
