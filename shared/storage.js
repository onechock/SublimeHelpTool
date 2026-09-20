// shared/storage.js – Sublime help tool
// Delad datalagring för kunder/domäner. Använder chrome.storage.sync så att
// samma person får samma kunduppsättning på alla sina Chrome-profiler/datorer
// (kräver att man är inloggad i Chrome med synk påslaget – annars fungerar
// lagringen precis som lokal lagring, bara utan synk mellan profiler).
//
// Varje kund lagras som en egen post ("cust_<id>") istället för en enda stor
// array, eftersom chrome.storage.sync har en gräns på 8 KB PER POST (men
// 100 KB totalt och upp till 512 poster) – med en post per kund kan listan
// växa sig stor utan att träffa den gränsen.

const CUSTOMERS_INDEX_KEY = 'sublimeHelp_customerIds';
const LEGACY_LOCAL_KEY = 'sublimeHelp_customers';
const MIGRATED_FLAG_KEY = 'sublimeHelp_migratedToSync';

function customerItemKey(id) {
  return `cust_${id}`;
}

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// Körs en gång: flyttar ev. äldre data (allt i en lokal array) till den
// synkade, uppdelade lagringen. Rör inte den gamla nyckeln, så den finns kvar
// som extra säkerhetskopia även efter migreringen.
let migrationChecked = false;
async function migrateLegacyLocalDataIfNeeded() {
  if (migrationChecked) return;

  const flag = await chrome.storage.local.get(MIGRATED_FLAG_KEY);
  if (flag[MIGRATED_FLAG_KEY]) {
    migrationChecked = true;
    return;
  }

  const existingIndex = await chrome.storage.sync.get(CUSTOMERS_INDEX_KEY);
  if (!Array.isArray(existingIndex[CUSTOMERS_INDEX_KEY])) {
    const localData = await chrome.storage.local.get(LEGACY_LOCAL_KEY);
    const legacyCustomers = localData[LEGACY_LOCAL_KEY];

    if (Array.isArray(legacyCustomers) && legacyCustomers.length > 0) {
      for (const customer of legacyCustomers) {
        if (!customer.id) customer.id = genId();
        for (const domain of customer.domains ?? []) {
          if (!domain.id) domain.id = genId();
        }
      }
      await writeCustomers(legacyCustomers);
    }
  }

  await chrome.storage.local.set({ [MIGRATED_FLAG_KEY]: true });
  migrationChecked = true;
}

export async function getCustomers() {
  await migrateLegacyLocalDataIfNeeded();

  const { [CUSTOMERS_INDEX_KEY]: ids } = await chrome.storage.sync.get(CUSTOMERS_INDEX_KEY);
  if (!Array.isArray(ids) || ids.length === 0) return [];

  const items = await chrome.storage.sync.get(ids.map(customerItemKey));
  // Filtrera bort ev. poster som saknas (t.ex. om synken inte hunnit klart).
  return ids.map(id => items[customerItemKey(id)]).filter(Boolean);
}

export async function saveCustomers(customers) {
  await writeCustomers(customers);
  // Bästa-möjliga-ansträngning: håll den gamla lokala nyckeln uppdaterad som
  // extra säkerhetskopia (t.ex. om chrome.storage.sync skulle vara otillgänglig).
  try {
    await chrome.storage.local.set({ [LEGACY_LOCAL_KEY]: customers });
  } catch {
    // Inte kritiskt – synkad lagring är källan till sanning.
  }
}

export async function clearAllCustomers() {
  const { [CUSTOMERS_INDEX_KEY]: ids } = await chrome.storage.sync.get(CUSTOMERS_INDEX_KEY);
  const keysToRemove = [CUSTOMERS_INDEX_KEY, ...(Array.isArray(ids) ? ids.map(customerItemKey) : [])];
  await chrome.storage.sync.remove(keysToRemove);
  await chrome.storage.local.remove(LEGACY_LOCAL_KEY);
}

async function writeCustomers(customers) {
  const ids = customers.map(c => c.id);

  const { [CUSTOMERS_INDEX_KEY]: oldIds } = await chrome.storage.sync.get(CUSTOMERS_INDEX_KEY);
  const removedIds = (Array.isArray(oldIds) ? oldIds : []).filter(id => !ids.includes(id));

  const toSet = { [CUSTOMERS_INDEX_KEY]: ids };
  for (const customer of customers) {
    toSet[customerItemKey(customer.id)] = customer;
  }

  await chrome.storage.sync.set(toSet);
  if (removedIds.length > 0) {
    await chrome.storage.sync.remove(removedIds.map(customerItemKey));
  }
}
