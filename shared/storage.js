// shared/storage.js – Sublime help tool
// Delad datalagring. Hubben äger kunderna; användaren kan bara lägga till egna
// URL:er på befintliga kunder.
//
//  - chrome.storage.local: hubbens kundlista (cache) + senaste hämtningsstatus.
//    Läses bara av pluginet, aldrig redigerad av användaren.
//  - chrome.storage.sync: användarens egna URL:er (en post per applikation, nyckel
//    "urls_<slug>", slug = applikationens id – chrome.storage.sync har en gräns på 8 KB per post) samt
//    favoriter i ordning. Synkas mellan användarens Chrome-profiler.
//
// getCustomers() slår ihop de två lagren till en lista där varje domän har
// source: 'hub' | 'local'. Hubbdomäner är skrivskyddade i gränssnittet.

import { numberToColor } from './colors.js';

const HUB_CACHE_KEY = 'sublimeHelp_hubCache';
const HUB_STATUS_KEY = 'sublimeHelp_hubStatus';
const FAVORITES_KEY = 'sublimeHelp_favorites';
const LOCAL_URLS_PREFIX = 'urls_';
const DOMAIN_ORDER_PREFIX = 'order_';
const RESET_FLAG_KEY = 'sublimeHelp_resetV3';

// Nycklar som äldre versioner (2.x) använde för egna kunder.
const LEGACY_LOCAL_KEYS = ['sublimeHelp_customers', 'sublimeHelp_migratedToSync'];

export { HUB_CACHE_KEY, HUB_STATUS_KEY };

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Tillåter bara http(s)-URL:er – blockerar javascript:, data: m.m.
export function sanitizeUrl(url) {
  const s = String(url ?? '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

// Enkel deterministisk hash → stabilt id för hubbdomäner (som saknar eget id).
function hashId(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// ---- Ny kula (v3) ----
// Version 3 slutar lagra egna kunder. Gamla kunder/domäner rensas en gång.
let resetChecked = false;
async function resetLegacyDataIfNeeded() {
  if (resetChecked) return;
  const flag = await chrome.storage.local.get(RESET_FLAG_KEY);
  if (!flag[RESET_FLAG_KEY]) {
    await chrome.storage.sync.clear();
    await chrome.storage.local.remove(LEGACY_LOCAL_KEYS);
    await chrome.storage.local.set({ [RESET_FLAG_KEY]: true });
  }
  resetChecked = true;
}

// ---- Hubbdata (cache) ----

// En applikation (sajt) under en kund: egen cms, egna länkar och egna domäner
// (miljöer). Länkar som saknas på applikationen ärvs från kunden. Returnerar
// null om slug saknas. Tomma fält saknas i JSON:en.
function normalizeApplication(raw, customerRaw) {
  const slug = String(raw?.slug ?? '').trim();
  if (!slug) return null;

  const domains = (Array.isArray(raw.domains) ? raw.domains : [])
    .map(d => ({
      id: 'h' + hashId(slug + '|' + String(d?.url ?? d?.baseUrl ?? '')),
      label: String(d?.label ?? '').trim(),
      baseUrl: sanitizeUrl(d?.url ?? d?.baseUrl),
      color: numberToColor(d?.color),
      ...(d?.devOnly ? { devOnly: true } : {}),
      source: 'hub',
    }))
    .filter(d => d.baseUrl);

  const pick = field => raw[field] ?? customerRaw[field];
  const cms = pick('cms') === 'episerver' ? 'optimizely' : pick('cms');
  return {
    slug,
    name: String(raw.name ?? '').trim() || slug,
    azureUrl: sanitizeUrl(pick('azureUrl')),
    storybookUrl: sanitizeUrl(pick('storybookUrl')),
    clickUpUrl: sanitizeUrl(pick('clickUpUrl')),
    figmaUrl: sanitizeUrl(pick('figmaUrl')),
    // impersonateUrl får vara en sökväg (/...) eller en full adress
    impersonateUrl: String(pick('impersonateUrl') ?? '').trim(),
    ...(['umbraco', 'optimizely'].includes(cms) ? { cms } : {}),
    ...(pick('cmsLoginUrl') ? { cmsLoginUrl: String(pick('cmsLoginUrl')).trim() } : {}),
    domains,
  };
}

// Gör om en kund från hubben/importfilen till internt format. Returnerar null
// för poster som saknar code eller name. En kund har applications[]; en äldre
// post med domains direkt på kunden tolkas som en enda applikation.
export function normalizeHubCustomer(raw) {
  const code = String(raw?.code ?? raw?.slug ?? '').trim();
  const name = String(raw?.name ?? '').trim();
  if (!code || !name) return null;

  const rawApps = Array.isArray(raw.applications)
    ? raw.applications
    : (Array.isArray(raw.domains) ? [{ ...raw, slug: code }] : []);

  return {
    id: code,
    code,
    name,
    applications: rawApps.map(a => normalizeApplication(a, raw)).filter(Boolean),
  };
}

// origin: 'hub' (hämtad från API:t) eller 'import' (inläst reservfil)
export async function setHubCache(rawCustomers, origin = 'hub') {
  const customers = rawCustomers.map(normalizeHubCustomer).filter(Boolean);
  await chrome.storage.local.set({
    [HUB_CACHE_KEY]: { customers, fetchedAt: Date.now(), origin },
  });
  return customers.length;
}

export async function getHubCache() {
  const r = await chrome.storage.local.get(HUB_CACHE_KEY);
  return r[HUB_CACHE_KEY] ?? null;
}

// state: 'ok' | 'needsLogin' | 'forbidden' | 'offline' | 'error'
export async function setHubStatus(state, detail) {
  await chrome.storage.local.set({
    [HUB_STATUS_KEY]: { state, detail: detail ?? null, checkedAt: Date.now() },
  });
}

export async function getHubStatus() {
  const r = await chrome.storage.local.get(HUB_STATUS_KEY);
  return r[HUB_STATUS_KEY] ?? null;
}

// ---- Egna URL:er och favoriter (sync) ----

async function getAllLocalDomains() {
  const all = await chrome.storage.sync.get(null);
  const byCode = {};
  const orders = {};
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith(LOCAL_URLS_PREFIX) && Array.isArray(value)) {
      byCode[key.slice(LOCAL_URLS_PREFIX.length)] = value;
    } else if (key.startsWith(DOMAIN_ORDER_PREFIX) && Array.isArray(value)) {
      orders[key.slice(DOMAIN_ORDER_PREFIX.length)] = value;
    }
  }
  return { byCode, orders, favorites: Array.isArray(all[FAVORITES_KEY]) ? all[FAVORITES_KEY] : [] };
}

// Lägger domänerna i användarens sparade ordning (id-lista). Domäner som
// saknas i listan, t.ex. nya från Hub, hamnar sist i sin ursprungliga ordning.
function applyDomainOrder(domains, order) {
  if (!order?.length) return domains;
  const rank = new Map(order.map((id, i) => [id, i]));
  const known = domains.filter(d => rank.has(d.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
  return [...known, ...domains.filter(d => !rank.has(d.id))];
}

// Hubbkunder med egna domäner inlagda på applikationerna (nyckel: slug) och
// favoritflagga. Favoriter först, i den ordning användaren valt; övriga i
// hubbens ordning.
export async function getCustomers() {
  await resetLegacyDataIfNeeded();

  const [cache, { byCode: bySlug, orders, favorites }] = await Promise.all([getHubCache(), getAllLocalDomains()]);
  const hubCustomers = cache?.customers ?? [];

  const merged = hubCustomers.map(c => ({
    ...c,
    favorite: favorites.includes(c.code),
    applications: (c.applications ?? []).map(app => ({
      ...app,
      domains: applyDomainOrder([
        ...app.domains,
        ...(bySlug[app.slug] ?? []).map(d => ({ ...d, source: 'local' })),
      ], orders[app.slug]),
    })),
  }));

  const favs = favorites.map(code => merged.find(c => c.code === code)).filter(Boolean);
  return [...favs, ...merged.filter(c => !c.favorite)];
}

// Sparar en applikations egna domäner (domäner med source 'hub' ignoreras)
// samt ordningen på alla domäner, så att egna URL:er kan ligga bland Hubs.
export async function saveLocalDomains(slug, domains) {
  const own = domains
    .filter(d => d.source !== 'hub')
    .map(({ id, label, baseUrl, color, devOnly }) => ({
      id, label, baseUrl, color, ...(devOnly ? { devOnly: true } : {}),
    }));
  const key = LOCAL_URLS_PREFIX + slug;
  const orderKey = DOMAIN_ORDER_PREFIX + slug;
  if (own.length === 0) await chrome.storage.sync.remove(key);
  else await chrome.storage.sync.set({ [key]: own });
  if (domains.length === 0) await chrome.storage.sync.remove(orderKey);
  else await chrome.storage.sync.set({ [orderKey]: domains.map(d => d.id) });
}

export async function setFavoriteOrder(codes) {
  await chrome.storage.sync.set({ [FAVORITES_KEY]: codes });
}

export async function setFavorite(code, isFavorite) {
  const { favorites } = await getAllLocalDomains();
  const without = favorites.filter(c => c !== code);
  await setFavoriteOrder(isFavorite ? [...without, code] : without);
}

// ---- Export / import av egna URL:er ----

export async function exportLocalUrls() {
  const { byCode } = await getAllLocalDomains();
  return byCode;
}

// Slår ihop inlästa egna URL:er med befintliga (dubbletter på url hoppas över).
// Returnerar antal tillagda domäner.
export async function importLocalUrls(byCode) {
  const { byCode: existing } = await getAllLocalDomains();
  let added = 0;
  const toSet = {};
  for (const [code, domains] of Object.entries(byCode ?? {})) {
    if (!Array.isArray(domains)) continue;
    const current = existing[code] ?? [];
    const known = new Set(current.map(d => d.baseUrl));
    const incoming = [];
    for (const d of domains) {
      const baseUrl = sanitizeUrl(d?.url ?? d?.baseUrl);
      if (!baseUrl || known.has(baseUrl)) continue;
      known.add(baseUrl);
      incoming.push({
        id: genId(),
        label: String(d.label ?? '').trim(),
        baseUrl,
        color: numberToColor(d.color),
        ...(d.devOnly ? { devOnly: true } : {}),
      });
    }
    if (incoming.length > 0) {
      toSet[LOCAL_URLS_PREFIX + code] = [...current, ...incoming];
      added += incoming.length;
    }
  }
  if (added > 0) await chrome.storage.sync.set(toSet);
  return added;
}

// Rensar egna URL:er och favoriter (används av "Återställ appen" i utvecklarläge).
export async function clearLocalData() {
  await chrome.storage.sync.clear();
}
