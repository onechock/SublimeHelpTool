// popup.js – Sublime help tool
// Visar kunder och miljölänkar från Hub, och låter användaren lägga till egna
// URL:er på kunderna.

import {
  getCustomers, saveLocalDomains, setFavorite, setFavoriteOrder, genId,
  getHubCache, getHubStatus, setHubCache, exportLocalUrls, importLocalUrls,
  clearLocalData, HUB_CACHE_KEY, HUB_STATUS_KEY,
} from '../shared/storage.js';
import {
  refreshHub, openHubLogin, getHubUrlOverride, setHubUrlOverride, getHubBaseUrl,
  hasHubPermission, hubOriginPattern,
} from '../shared/hub.js';
import { COLORS, colorToNumber } from '../shared/colors.js';

(() => {
  const UI_KEY = 'sublimeHelp_ui';

  const AZURE_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path fill="#0078d4" d="M6.73 2.17h4.54L6.57 16.16H2.04z"/><path fill="#50b5f5" d="M11.27 2.17l-4.7 13.99h10.37z"/></svg>`;

  const STORYBOOK_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4785" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`;

  const CLICKUP_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#7b68ee" d="M3 17.2l3.1-2.4c1.6 2.1 3.3 3.1 5.4 3.1s3.8-1 5.4-3.1l3.1 2.4C17.7 20 15.1 21.5 11.5 21.5S5.3 20 3 17.2z"/><path fill="#49ccf9" d="M11.5 6.9l-5.4 4.7-2.5-2.9L11.5 2l7.9 6.7-2.5 2.9z"/></svg>`;

  const FIGMA_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#f24e1e" d="M8 2h4v6H8a3 3 0 0 1 0-6z"/><path fill="#ff7262" d="M12 2h4a3 3 0 0 1 0 6h-4z"/><path fill="#a259ff" d="M8 8h4v6H8a3 3 0 0 1 0-6z"/><circle fill="#1abcfe" cx="15" cy="11" r="3"/><path fill="#0acf83" d="M8 14h4v3a3 3 0 1 1-4-2.8z"/></svg>`;

  const IMPERSONATE_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

  const LOCK_ICON_SVG = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

  const UMBRACO_ICON_SVG = `<img src="images/umbraco.png" width="16" height="16" alt="Umbraco">`;
  const OPTIMIZELY_ICON_SVG = `<img src="images/optimizely.png" width="16" height="16" alt="Optimizely">`;

  function getCmsIcon(cms) {
    if (cms === 'umbraco') return UMBRACO_ICON_SVG;
    if (cms === 'optimizely') return OPTIMIZELY_ICON_SVG;
    return '';
  }

  // Länkar på kundnivå som visas i utvecklarläge (ikon i hemvyn, rad i listan)
  const EXTERNAL_LINKS = [
    { field: 'azureUrl', title: 'Öppna Azure-portalen', label: 'Azure', color: '#0078d4', icon: AZURE_ICON_SVG, cls: '' },
    { field: 'storybookUrl', title: 'Öppna Storybook', label: 'Storybook', color: '#FF4785', icon: STORYBOOK_ICON_SVG, cls: 'btn-storybook-header' },
    { field: 'clickUpUrl', title: 'Öppna ClickUp', label: 'ClickUp', color: '#7b68ee', icon: CLICKUP_ICON_SVG, cls: 'btn-clickup-header' },
    { field: 'figmaUrl', title: 'Öppna Figma', label: 'Figma', color: '#f24e1e', icon: FIGMA_ICON_SVG, cls: 'btn-figma-header' },
  ];

  // En sökväg (börjar med /) läggs på miljön man står i, annars används
  // adressen som den är.
  function resolveLink(pathOrUrl, baseUrl) {
    const v = String(pathOrUrl ?? '').trim();
    if (!v) return '';
    try { return sanitizeUrl(v.startsWith('/') ? new URL(v, baseUrl).href : v); } catch { return ''; }
  }

  // CMS-inloggning och impersonate som knappar på en domänrad
  function appendLoginButtons(link, app, domain) {
    if (app.cms === 'umbraco' || app.cms === 'optimizely') {
      const loginPath = app.cmsLoginUrl || (app.cms === 'umbraco' ? '/umbraco' : '/episerver/cms');
      const loginUrl = resolveLink(loginPath.startsWith('/') ? loginPath : '/' + loginPath, domain.baseUrl);
      if (loginUrl) {
        const loginBtn = document.createElement('button');
        loginBtn.className = 'btn-cms-login';
        loginBtn.title = `Logga in (${loginPath})`;
        loginBtn.innerHTML = getCmsIcon(app.cms);
        loginBtn.addEventListener('click', e => { e.stopPropagation(); chrome.tabs.create({ url: loginUrl }); });
        link.appendChild(loginBtn);
      }
    }
    const impersonateUrl = resolveLink(app.impersonateUrl, domain.baseUrl);
    if (impersonateUrl) {
      const impBtn = document.createElement('button');
      impBtn.className = 'btn-cms-login btn-impersonate';
      impBtn.title = 'Impersonate';
      impBtn.innerHTML = IMPERSONATE_ICON_SVG;
      impBtn.addEventListener('click', e => { e.stopPropagation(); chrome.tabs.create({ url: impersonateUrl }); });
      link.appendChild(impBtn);
    }
  }

  // ---- Datalagring ----
  // Kunderna kommer från Hub (cachas av shared/storage.js). Egna URL:er och
  // favoriter synkas via chrome.storage.sync så att samma person får dem på
  // alla sina Chrome-profiler/datorer.

  async function getUiState() {
    const r = await chrome.storage.local.get(UI_KEY);
    return r[UI_KEY] ?? {};
  }

  async function saveUiState(state) {
    await chrome.storage.local.set({ [UI_KEY]: state });
  }

  // ---- URL-hjälpfunktioner ----
  // Returnerar host inkl. port (t.ex. "localhost:5001") för korrekt matchning
  function getHostname(url) {
    try { return new URL(url).host.toLowerCase(); } catch { return null; }
  }

  // Bygger en länk till måldomänens motsvarighet av nuvarande path
  function buildEquivalentUrl(currentUrl, targetBaseUrl) {
    try {
      const cur = new URL(currentUrl);
      const tgt = new URL(targetBaseUrl);
      return tgt.origin + cur.pathname + cur.search + cur.hash;
    } catch {
      return targetBaseUrl;
    }
  }

  // Hittar vilken kund, applikation och domän som matchar nuvarande flik
  function findMatch(customers, tabUrl) {
    const tabHost = getHostname(tabUrl);
    if (!tabHost) return null;

    for (const customer of customers) {
      for (const application of customer.applications) {
        for (const domain of application.domains) {
          if (getHostname(domain.baseUrl) === tabHost) {
            return { customer, application, matchedDomain: domain };
          }
        }
      }
    }
    return null;
  }

  // ---- URL-tillgänglighetstest ----
  async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
    } finally {
      clearTimeout(timer);
    }
  }

  async function isReachable(url) {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return false;

    try {
      const headRes = await fetchWithTimeout(safeUrl, { method: 'HEAD' });
      if (headRes.status < 400) return true;
      if (headRes.status === 405 || headRes.status === 501) {
        const getRes = await fetchWithTimeout(safeUrl, { method: 'GET' });
        return getRes.status < 400;
      }
      return false;
    } catch {
      try {
        await fetchWithTimeout(safeUrl, { method: 'GET', mode: 'no-cors' });
        return true;
      } catch {
        return false;
      }
    }
  }

  async function checkUrl(primaryUrl, fallbackUrl = '') {
    if (await isReachable(primaryUrl)) return true;
    if (!fallbackUrl || fallbackUrl === primaryUrl) return false;
    return isReachable(fallbackUrl);
  }

  // ---- Startsida ----
  function renderHome(match, tabUrl, uiState = {}) {
    const result = document.getElementById('match-result');
    const noMatch = document.getElementById('no-match');
    result.innerHTML = '';

    if (!match) {
      noMatch.classList.remove('hidden');
      return;
    }
    noMatch.classList.add('hidden');

    const { customer, application, matchedDomain } = match;

    // Kund / applikation + badge för aktuell miljö. Applikationsnamnet visas
    // bara när det skiljer sig från kundnamnet.
    const header = document.createElement('div');
    header.className = 'customer-header';
    const badgeColor = sanitizeColor(matchedDomain.color) || '#4b6584';
    const homeCmsIcon = getCmsIcon(application.cms);
    const showAppName = application.name !== customer.name;
    header.innerHTML = `
      <span class="customer-name">${escHtml(customer.name)}</span>
      ${showAppName ? `<span class="app-sub" title="${escHtml(application.name)}">${escHtml(application.name)}</span>` : ''}
      ${homeCmsIcon ? `<span class="customer-cms-icon" title="${application.cms === 'umbraco' ? 'Umbraco' : 'Optimizely'}">${homeCmsIcon}</span>` : ''}
      <span class="badge" style="background:${badgeColor};color:white">${escHtml(matchedDomain.label)}</span>`;
    if (uiState.devMode) {
      for (const ext of EXTERNAL_LINKS) {
        const safeUrl = sanitizeUrl(application[ext.field]);
        if (!safeUrl) continue;
        const extLink = document.createElement('a');
        extLink.href = '#';
        extLink.className = 'btn-azure-header' + (ext.cls ? ' ' + ext.cls : '');
        extLink.title = ext.title;
        extLink.innerHTML = ext.icon;
        extLink.addEventListener('click', e => {
          e.preventDefault();
          chrome.tabs.create({ url: safeUrl });
        });
        header.appendChild(extLink);
      }
    }
    result.appendChild(header);

    // Lista med ALLA miljöer – aktuell markerad, övriga klickbara
    const list = document.createElement('div');
    list.className = 'domain-links';

    const allDomains = application.domains;
    if (allDomains.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Inga domäner konfigurerade för den här applikationen.';
      list.appendChild(empty);
    } else {
      for (const domain of allDomains) {
        if (domain.devOnly && !uiState.devMode) continue;
        const isCurrent = domain.id === matchedDomain.id;
        const href = buildEquivalentUrl(tabUrl, domain.baseUrl);
        const link = document.createElement('div');
        link.className = 'domain-link' + (isCurrent ? ' domain-link-current' : '');
        const safeColor = sanitizeColor(domain.color);
        if (safeColor) {
          link.style.setProperty('--domain-color', safeColor);
        }
        if (!isCurrent) link.setAttribute('tabindex', '0');

        const dot = document.createElement('span');

        if (isCurrent) {
          dot.className = 'status-dot current';
          dot.title = 'Du är här';
        } else {
          dot.className = 'status-dot checking';
          dot.title = 'Kontrollerar...';
        }

        link.innerHTML = `
          <div class="domain-link-info">
            <span class="domain-label">${escHtml(domain.label)}</span>
            <span class="domain-url">${escHtml(href)}</span>
          </div>
          `;
        link.insertBefore(dot, link.firstChild);

        appendLoginButtons(link, application, domain);

        if (!isCurrent) {
          const openLink = () => {
            const safeHref = sanitizeUrl(href);
            if (safeHref) chrome.tabs.create({ url: safeHref });
          };
          link.addEventListener('click', openLink);
          link.addEventListener('keydown', e => { if (e.key === 'Enter') openLink(); });

          // Kolla om sidan finns asynkront
          checkUrl(href, domain.baseUrl).then(ok => {
            dot.className = `status-dot ${ok ? 'ok' : 'unavailable'}`;
            dot.title = ok ? 'Sidan finns' : 'Sidan hittades inte – öppnar startsidan';
            if (!ok) {
              link.classList.add('domain-link-unavailable');
              link.removeEventListener('click', openLink);
              const fallback = sanitizeUrl(domain.baseUrl);
              link.addEventListener('click', () => { if (fallback) chrome.tabs.create({ url: fallback }); });
            }
          });
        }

        list.appendChild(link);
      }
    }
    result.appendChild(list);
  }

  // ---- Inställningssida: kompakt lista ----
  function showSettingsList() {
    document.getElementById('settings-list-panel').classList.remove('hidden');
    document.getElementById('customer-edit-panel').classList.add('hidden');
  }

  function showCustomerEdit(customer) {
    document.getElementById('settings-list-panel').classList.add('hidden');
    const panel = document.getElementById('customer-edit-panel');
    panel.classList.remove('hidden');
    const editContent = document.getElementById('customer-edit-content');
    editContent.innerHTML = '';
    editContent.appendChild(buildCustomerCard(customer));
  }

  function renderSettings(customers, uiState = {}) {
    const list = document.getElementById('customers-list');
    list.innerHTML = '';
    showSettingsList();

    const searchEl = document.getElementById('customers-search');
    const query = (searchEl?.value ?? '').trim().toLowerCase();
    const isSearching = query.length > 0;

    const allFiltered = isSearching
      ? customers.filter(c => c.name.toLowerCase().includes(query)
        || c.applications.some(a => a.name.toLowerCase().includes(query)))
      : customers;

    if (customers.length === 0) {
      list.innerHTML = '<p class="muted">Inga kunder att visa ännu. Logga in i Hub för att hämta kunderna.</p>';
      return;
    }

    if (isSearching && allFiltered.length === 0) {
      list.innerHTML = '<p class="muted">Inga kunder matchar sökningen.</p>';
      return;
    }

    const favorites = isSearching ? allFiltered.filter(c => c.favorite) : customers.filter(c => c.favorite);
    const others = isSearching
      ? allFiltered.filter(c => !c.favorite).sort((a, b) => a.name.localeCompare(b.name, 'sv'))
      : customers.filter(c => !c.favorite).sort((a, b) => a.name.localeCompare(b.name, 'sv'));
    const othersHidden = isSearching ? false : (uiState.othersHidden ?? false);

    // Drag-and-drop state för favoriter
    let dragSrc = null;

    // Rendera en grupp kunder
    function renderGroup(group, draggable = false) {
      for (const customer of group) {
        const wrapper = document.createElement('div');
        wrapper.className = 'customer-list-wrapper';
        if (draggable) wrapper.setAttribute('data-id', customer.id);

        const row = document.createElement('div');
        row.className = 'customer-list-row';

        const chevron = document.createElement('span');
        chevron.className = 'customer-chevron';
        chevron.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 4.5l3 3 3-3"/></svg>`;

        const starBtn = document.createElement('button');
        starBtn.className = 'btn-star' + (customer.favorite ? ' active' : '');
        starBtn.title = customer.favorite ? 'Ta bort favorit' : 'Markera som favorit';
        starBtn.innerHTML = customer.favorite
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
        starBtn.addEventListener('click', async e => {
          e.stopPropagation();
          const makeFavorite = !customer.favorite;
          await setFavorite(customer.code, makeFavorite);
          const [ui, updated] = await Promise.all([getUiState(), getCustomers()]);
          // Om detta är den första favoriten som läggs till, återställ dolda-tillståndet
          const favoriteCount = updated.filter(c => c.favorite).length;
          if (makeFavorite && favoriteCount === 1 && ui.othersHidden) {
            ui.othersHidden = false;
            await saveUiState(ui);
          }
          renderSettings(updated, ui);
        });

        const nameSpan = document.createElement('span');
        nameSpan.className = 'customer-list-name';
        nameSpan.textContent = customer.name;
        nameSpan.title = customer.name;

        const cmsIconSpan = document.createElement('span');
        cmsIconSpan.className = 'customer-cms-icon';
        const cmsKinds = [...new Set(customer.applications.map(a => a.cms).filter(Boolean))];
        cmsIconSpan.innerHTML = cmsKinds.map(getCmsIcon).join('');
        if (cmsKinds.length > 0) {
          cmsIconSpan.title = cmsKinds.map(k => (k === 'umbraco' ? 'Umbraco' : 'Optimizely')).join(', ');
        }

        const appCount = customer.applications.length;
        const domainCount = document.createElement('span');
        domainCount.className = 'customer-list-count';
        domainCount.textContent = `${appCount} applikation${appCount !== 1 ? 'er' : ''}`;

        const editBtn = document.createElement('button');
        editBtn.className = 'btn-edit';
        editBtn.title = 'Egna URL:er';
        editBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
        editBtn.addEventListener('click', e => { e.stopPropagation(); showCustomerEdit(customer); });

        const expandPanel = document.createElement('div');
        expandPanel.className = 'customer-expand hidden';

        for (const app of customer.applications) {
          // Ett block per applikation, med en tunn linje längst ner
          const appBlock = document.createElement('div');
          appBlock.className = 'expand-app';
          // Applikationsnamn (rubrik) med cms-ikon
          const appHeader = document.createElement('div');
          appHeader.className = 'expand-app-header';
          const appCms = getCmsIcon(app.cms);
          appHeader.innerHTML = `<span class="expand-app-name">${escHtml(app.name)}</span>${appCms ? `<span class="customer-cms-icon">${appCms}</span>` : ''}`;
          appBlock.appendChild(appHeader);

          // Azure-, Storybook-, ClickUp- och Figma-rader (utvecklarläge)
          if (uiState.devMode) {
            for (const ext of EXTERNAL_LINKS) {
              const safeUrl = sanitizeUrl(app[ext.field]);
              if (!safeUrl) continue;
              const extRow = document.createElement('div');
              extRow.className = 'expand-domain-link expand-azure-link';
              extRow.title = safeUrl;
              extRow.innerHTML = `
                <span class="expand-azure-icon">${ext.icon}</span>
                <span class="expand-domain-label" style="color:${ext.color}">${ext.label}</span>
                <span class="expand-domain-url">${escHtml(safeUrl.replace(/^https?:\/\//, ''))}</span>`;
              extRow.addEventListener('click', e => { e.stopPropagation(); chrome.tabs.create({ url: safeUrl }); });
              appBlock.appendChild(extRow);
            }
          }

          for (const domain of app.domains) {
            if (domain.devOnly && !uiState.devMode) continue;
            const link = document.createElement('div');
            link.className = 'expand-domain-link';
            const domainSafeColor = sanitizeColor(domain.color);
            if (domainSafeColor) link.style.setProperty('--domain-color', domainSafeColor);
            link.innerHTML = `
              <span class="expand-domain-label" style="${domainSafeColor ? `color:${domainSafeColor}` : ''}">${escHtml(domain.label)}</span>
              <span class="expand-domain-url">${escHtml(domain.baseUrl.replace(/^https?:\/\//, ''))}</span>`;
            const safeDomainUrl = sanitizeUrl(domain.baseUrl);
            if (safeDomainUrl) link.addEventListener('click', () => chrome.tabs.create({ url: safeDomainUrl }));

            appendLoginButtons(link, app, domain);

            appBlock.appendChild(link);
          }
          expandPanel.appendChild(appBlock);
        }

        row.addEventListener('click', () => {
          const isOpen = !expandPanel.classList.contains('hidden');
          expandPanel.classList.toggle('hidden', isOpen);
          chevron.classList.toggle('open', !isOpen);
        });

        if (draggable) {
          const handle = document.createElement('span');
          handle.className = 'drag-handle customer-drag-handle';
          handle.title = 'Dra för att ändra ordning';
          handle.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="4" cy="2.5" r="1"/><circle cx="8" cy="2.5" r="1"/><circle cx="4" cy="6" r="1"/><circle cx="8" cy="6" r="1"/><circle cx="4" cy="9.5" r="1"/><circle cx="8" cy="9.5" r="1"/></svg>`;
          handle.addEventListener('mousedown', () => { wrapper.draggable = true; });
          handle.addEventListener('mouseup', () => { wrapper.draggable = false; });

          wrapper.addEventListener('dragstart', e => {
            dragSrc = wrapper;
            e.dataTransfer.effectAllowed = 'move';
            wrapper.classList.add('dragging');
          });
          wrapper.addEventListener('dragend', () => {
            wrapper.draggable = false;
            wrapper.classList.remove('dragging');
            list.querySelectorAll('.customer-list-wrapper').forEach(w => w.classList.remove('drag-over'));
          });
          wrapper.addEventListener('dragover', e => {
            e.preventDefault();
            if (dragSrc && dragSrc !== wrapper) wrapper.classList.add('drag-over');
          });
          wrapper.addEventListener('dragleave', () => wrapper.classList.remove('drag-over'));
          wrapper.addEventListener('drop', async e => {
            e.preventDefault();
            wrapper.classList.remove('drag-over');
            if (!dragSrc || dragSrc === wrapper) return;
            const allWrappers = [...list.querySelectorAll('.customer-list-wrapper[data-id]')];
            const srcIdx = allWrappers.indexOf(dragSrc);
            const tgtIdx = allWrappers.indexOf(wrapper);
            // Ordna om de synliga favoriterna; favoriter som är dolda av en sökning behåller sin plats
            const visible = allWrappers.map(w => w.getAttribute('data-id'));
            const [moved] = visible.splice(srcIdx, 1);
            visible.splice(tgtIdx, 0, moved);
            const shown = new Set(visible);
            let next = 0;
            const order = customers.filter(c => c.favorite)
              .map(c => (shown.has(c.code) ? visible[next++] : c.code));
            await setFavoriteOrder(order);
            const [updated, ui] = await Promise.all([getCustomers(), getUiState()]);
            renderSettings(updated, ui);
          });

          row.appendChild(chevron);
          row.appendChild(starBtn);
          row.appendChild(nameSpan);
          row.appendChild(domainCount);
          row.appendChild(cmsIconSpan);
          row.appendChild(editBtn);
          row.appendChild(handle);
        } else {
          row.appendChild(chevron);
          row.appendChild(starBtn);
          row.appendChild(nameSpan);
          row.appendChild(domainCount);
          row.appendChild(cmsIconSpan);
          row.appendChild(editBtn);
        }

        wrapper.appendChild(row);
        wrapper.appendChild(expandPanel);
        list.appendChild(wrapper);
      }
    }

    // Favoriter (med drag-and-drop)
    renderGroup(favorites, true);

    // Separator + toggle för övriga (visas bara om det finns favoriter)
    if (favorites.length > 0 && others.length > 0) {
      const sep = document.createElement('div');
      sep.className = 'customers-section-sep';
      sep.title = othersHidden ? 'Visa alla kunder' : 'Göm alla kunder';

      const sepLabel = document.createElement('span');
      sepLabel.className = 'customers-section-label';
      sepLabel.textContent = 'Alla kunder';

      const toggleBtn = document.createElement('span');
      toggleBtn.className = 'btn-section-toggle';
      toggleBtn.innerHTML = othersHidden
        ? `<svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 4.5l3 3 3-3"/></svg>`
        : `<svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 7.5L6 4.5 3 7.5"/></svg>`;

      sep.addEventListener('click', async () => {
        const ui = await getUiState();
        ui.othersHidden = !ui.othersHidden;
        await saveUiState(ui);
        renderSettings(customers, ui);
      });

      sep.appendChild(sepLabel);
      sep.appendChild(toggleBtn);
      list.appendChild(sep);
    }

    // Övriga kunder (döljs om togglead)
    if (!othersHidden || favorites.length === 0) {
      renderGroup(others);
    }
  }

  // Detaljvy för en hubbkund: en sektion per applikation. Hubbens domäner är
  // låsta, egna URL:er går att lägga till, ändra och ta bort per applikation.
  function buildCustomerCard(customer) {
    const card = document.createElement('div');
    card.className = 'customer-card';

    const nameRow = document.createElement('div');
    nameRow.className = 'card-name-row';

    const nameEl = document.createElement('span');
    nameEl.className = 'card-customer-name';
    nameEl.textContent = customer.name;
    nameRow.appendChild(nameEl);

    const hubTag = document.createElement('span');
    hubTag.className = 'hub-tag';
    hubTag.title = 'Kunden, applikationerna och deras Hub-länkar hanteras i Hub och går inte att ändra här';
    hubTag.innerHTML = `${LOCK_ICON_SVG}<span>Hub</span>`;
    nameRow.appendChild(hubTag);
    card.appendChild(nameRow);

    if (customer.applications.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Kunden har inga applikationer i Hub.';
      card.appendChild(empty);
    }

    for (const app of customer.applications) {
      const section = document.createElement('div');
      section.className = 'app-section';

      const appRow = document.createElement('div');
      appRow.className = 'app-section-title';
      const appName = document.createElement('span');
      appName.textContent = app.name;
      appRow.appendChild(appName);
      const cmsIcon = getCmsIcon(app.cms);
      if (cmsIcon) {
        const cmsSpan = document.createElement('span');
        cmsSpan.className = 'customer-cms-icon';
        cmsSpan.title = app.cms === 'umbraco' ? 'Umbraco' : 'Optimizely';
        cmsSpan.innerHTML = cmsIcon;
        appRow.appendChild(cmsSpan);
      }
      section.appendChild(appRow);

      const domainList = document.createElement('div');
      domainList.className = 'domain-edit-list';
      for (const domain of app.domains) {
        domainList.appendChild(buildDomainRow(domain, app, domainList));
      }
      section.appendChild(domainList);

      const addDomainBtn = document.createElement('button');
      addDomainBtn.textContent = '+ Lägg till egen URL';
      addDomainBtn.className = 'btn-secondary';
      addDomainBtn.addEventListener('click', async () => {
        const newDomain = { id: genId(), label: '', baseUrl: '', color: COLORS[0].value, source: 'local' };
        app.domains.push(newDomain);
        const row = buildDomainRow(newDomain, app, domainList);
        domainList.appendChild(row);
        row.querySelector('input').focus();
        await saveLocalDomains(app.slug, app.domains);
      });
      section.appendChild(addDomainBtn);

      card.appendChild(section);
    }

    return card;
  }

  // Dra och släpp för att ändra ordning. Gäller alla domäner i applikationen,
  // även Hubs låsta – på så sätt kan egna URL:er läggas bland Hubs eller över/under.
  function makeDraggable(row, domain, app, domainList) {
    row.draggable = true;
    row.dataset.domainId = domain.id;

    row.addEventListener('dragstart', e => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', domain.id);
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      domainList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      domainList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      row.classList.add('drag-over');
    });
    row.addEventListener('drop', async e => {
      e.preventDefault();
      const fromId = e.dataTransfer.getData('text/plain');
      const toId = domain.id;
      if (fromId === toId) return;

      const fromIdx = app.domains.findIndex(d => d.id === fromId);
      const toIdx = app.domains.findIndex(d => d.id === toId);
      if (fromIdx === -1 || toIdx === -1) return;

      // Flytta i datan
      const [moved] = app.domains.splice(fromIdx, 1);
      app.domains.splice(toIdx, 0, moved);
      await saveLocalDomains(app.slug, app.domains);

      // Rita om listan
      domainList.innerHTML = '';
      for (const d of app.domains) {
        domainList.appendChild(buildDomainRow(d, app, domainList));
      }
    });
  }

  const DRAG_HANDLE_SVG = `<svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor"><circle cx="4" cy="3" r="1.5"/><circle cx="8" cy="3" r="1.5"/><circle cx="4" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="4" cy="13" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>`;

  // Rad för en domän från Hub: går att flytta, men inte att ändra eller ta bort.
  function buildHubDomainRow(domain, app, domainList) {
    const row = document.createElement('div');
    row.className = 'domain-edit-row readonly';

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.title = 'Dra för att ändra ordning';
    handle.innerHTML = DRAG_HANDLE_SVG;

    const lock = document.createElement('span');
    lock.className = 'hub-lock';
    lock.title = 'Hanteras i Hub';
    lock.innerHTML = LOCK_ICON_SVG;

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = domain.label;
    labelInput.className = 'input-label';
    labelInput.readOnly = true;
    labelInput.tabIndex = -1;

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.value = domain.baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    urlInput.className = 'input-url';
    urlInput.readOnly = true;
    urlInput.tabIndex = -1;

    const swatch = document.createElement('span');
    swatch.className = 'color-btn color-btn-static';
    swatch.style.background = sanitizeColor(domain.color) || COLORS[0].value;

    row.appendChild(handle);
    row.appendChild(lock);
    row.appendChild(labelInput);
    row.appendChild(urlInput);
    row.appendChild(swatch);
    makeDraggable(row, domain, app, domainList);
    return row;
  }

  function buildDomainRow(domain, app, domainList) {
    if (domain.source === 'hub') return buildHubDomainRow(domain, app, domainList);

    const save = () => saveLocalDomains(app.slug, app.domains);

    const row = document.createElement('div');
    row.className = 'domain-edit-row';

    // Drag-handtag
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.title = 'Dra för att ändra ordning';
    handle.innerHTML = DRAG_HANDLE_SVG;
    handle.addEventListener('mousedown', () => { row.draggable = true; });

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = domain.label;
    labelInput.className = 'input-label';
    labelInput.placeholder = 'Name';
    labelInput.addEventListener('mousedown', () => { row.draggable = false; });
    labelInput.addEventListener('change', async () => {
      domain.label = labelInput.value.trim();
      await save();
    });

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    // Visa bara domänen utan https:// i fältet
    urlInput.value = domain.baseUrl ? domain.baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : '';
    urlInput.className = 'input-url';
    urlInput.placeholder = 'example.com';
    urlInput.addEventListener('mousedown', () => { row.draggable = false; });
    urlInput.addEventListener('input', () => {
      urlInput.classList.remove('input-error');
      urlInput.title = '';
    });
    urlInput.addEventListener('change', async () => {
      const val = urlInput.value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (!val) {
        domain.baseUrl = '';
        urlInput.value = '';
        await save();
        return;
      }
      // Validera: bara domän (tillåter subdomäner och port, inga sökvägar)
      const domainPattern = /^(localhost|([a-z0-9-]+\.)+[a-z]{2,})(:\d+)?$/i;
      if (!domainPattern.test(val)) {
        urlInput.classList.add('input-error');
        urlInput.title = 'Ange bara domänen, t.ex. dev.example.com eller localhost:5001';
        return;
      }
      domain.baseUrl = 'https://' + val;
      urlInput.value = val;
      urlInput.classList.remove('input-error');
      await save();
    });

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.className = 'btn-remove';
    removeBtn.title = 'Ta bort egen URL';
    removeBtn.addEventListener('click', async () => {
      const idx = app.domains.indexOf(domain);
      if (idx > -1) app.domains.splice(idx, 1);
      await save();
      row.remove();
    });

    makeDraggable(row, domain, app, domainList);

    // Dev-only-knapp
    const devOnlyBtn = document.createElement('button');
    devOnlyBtn.className = 'btn-dev-only' + (domain.devOnly ? ' active' : '');
    devOnlyBtn.title = domain.devOnly ? 'Visa för alla' : 'Dölj för icke-utvecklare';
    devOnlyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
    devOnlyBtn.addEventListener('click', async e => {
      e.stopPropagation();
      domain.devOnly = !domain.devOnly;
      devOnlyBtn.classList.toggle('active', domain.devOnly);
      devOnlyBtn.title = domain.devOnly ? 'Visa för alla' : 'Dölj för icke-utvecklare';
      await save();
    });

    row.appendChild(handle);
    row.appendChild(labelInput);
    row.appendChild(urlInput);
    row.appendChild(devOnlyBtn);

    // Färgknapp med popup
    const colorWrap = document.createElement('div');
    colorWrap.className = 'color-wrap';

    const colorBtn = document.createElement('button');
    colorBtn.className = 'color-btn';
    colorBtn.title = 'Välj färg';
    colorBtn.style.background = domain.color || COLORS[0].value;
    colorBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.37 2.63 14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 1 0-3-3Z"/><path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7"/></svg>`;

    const colorPopup = document.createElement('div');
    colorPopup.className = 'color-popup hidden';
    for (const c of COLORS) {
      const swatch = document.createElement('button');
      swatch.className = 'color-swatch' + ((domain.color ?? COLORS[0].value) === c.value ? ' selected' : '');
      swatch.title = c.label;
      swatch.style.background = c.value || 'transparent';
      swatch.addEventListener('click', async e => {
        e.stopPropagation();
        domain.color = c.value || undefined;
        colorBtn.style.background = c.value || '#e2e8f0';
        colorPopup.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        colorPopup.classList.add('hidden');
        await save();
      });
      colorPopup.appendChild(swatch);
    }

    colorBtn.addEventListener('click', e => {
      e.stopPropagation();
      // Stäng alla andra öppna popups
      document.querySelectorAll('.color-popup:not(.hidden)').forEach(p => {
        if (p !== colorPopup) p.classList.add('hidden');
      });
      colorPopup.classList.toggle('hidden');
    });

    // Stäng popup vid klick utanför
    document.addEventListener('click', () => colorPopup.classList.add('hidden'));

    colorWrap.appendChild(colorBtn);
    colorWrap.appendChild(colorPopup);
    row.appendChild(colorWrap);

    row.appendChild(removeBtn);
    return row;
  }

  // ---- Export / Import ----
  // Export: bara användarens egna URL:er (Hub-datat hämtas ju från Hub).
  // Import: antingen en export av egna URL:er (slås ihop med befintliga) eller
  // en Hub-fil (version + customers), som läses in som låst reservlista som
  // används tills Hub går att nå igen.
  async function exportOwnUrls() {
    const byCode = await exportLocalUrls();
    const urls = {};
    for (const [code, domains] of Object.entries(byCode)) {
      urls[code] = domains.map(d => ({
        label: d.label,
        url: d.baseUrl,
        color: colorToNumber(d.color),
        ...(d.devOnly ? { devOnly: true } : {}),
      }));
    }
    const json = JSON.stringify({ version: 1, type: 'sublime-help-own-urls', urls }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = 'sublime-help-egna-urler.json';
    a.click();
    URL.revokeObjectURL(objUrl);
  }

  function importFile(onDone) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          // Strippa eventuell BOM
          const text = reader.result.replace(/^﻿/, '');
          const parsed = JSON.parse(text);

          if (parsed?.type === 'sublime-help-own-urls' && parsed.urls && typeof parsed.urls === 'object') {
            const added = await importLocalUrls(parsed.urls);
            onDone(`Import klar! ${added} egen${added !== 1 ? 'a' : ''} URL${added !== 1 ? ':er' : ''} lades till.`);
            return;
          }

          if (parsed?.version && Array.isArray(parsed.customers)) {
            const hubStatus = await getHubStatus();
            if (hubStatus?.state === 'ok') {
              const proceed = await showConfirm(
                'Du är inloggad i Hub och har redan en aktuell lista. Filen används bara som reserv och skrivs över nästa gång Hub hämtas.\n\nLäs in filen ändå?',
                'Läs in'
              );
              if (!proceed) return;
            }
            const count = await setHubCache(parsed.customers, 'import');
            onDone(`Reservlistan lästes in med ${count} kund${count !== 1 ? 'er' : ''}.`);
            return;
          }

          await showAlert('Ogiltig fil – förväntas en Hub-export eller en export av egna URL:er.');
        } catch (e) {
          await showAlert('Kunde inte läsa filen. Kontrollera att det är en giltig JSON-fil.\n\nFel: ' + e.message);
        }
      };
      reader.onerror = async () => { await showAlert('Kunde inte öppna filen.'); };
      reader.readAsText(file, 'UTF-8');
    });
    input.click();
  }

  // ---- Hub-status ----
  function formatTime(ts) {
    try { return new Date(ts).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' }); } catch { return ''; }
  }

  // Visas i "unpacked"-läge tills användaren godkänt åtkomst till dev-hubben.
  async function renderPermissionBanner() {
    const banner = document.getElementById('hub-banner');
    const base = await getHubBaseUrl();
    banner.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = `Hub (${new URL(base).host}) kunde inte läsas. Chrome behöver ditt godkännande en gång – klicka på Tillåt.`;
    const btn = document.createElement('button');
    btn.className = 'btn-hub-login';
    btn.textContent = 'Tillåt';
    const pattern = hubOriginPattern(base);
    btn.addEventListener('click', () => {
      // Ska anropas direkt i klickhanteraren, utan await före, annars anser
      // Chrome att användargesten gått förlorad och nekar tyst.
      chrome.permissions.request({ origins: [pattern] }).then(async (granted) => {
        if (!granted) {
          await showAlert(`Chrome gav inte tillåtelse för ${pattern}.`);
          return;
        }
        await refreshHub();
        await refreshViews();
      }).catch(err => showAlert(`Kunde inte be om tillåtelse för ${pattern}:\n${err.message}`));
    });
    banner.appendChild(span);
    banner.appendChild(btn);
    banner.classList.remove('hidden');
  }

  function renderHubBanner(status, cache) {
    const banner = document.getElementById('hub-banner');
    banner.innerHTML = '';
    const state = status?.state;
    const hasList = (cache?.customers?.length ?? 0) > 0;
    const savedNote = hasList
      ? ` Visar ${cache.origin === 'import' ? 'importerad reservlista' : 'sparad lista'} (${formatTime(cache.fetchedAt)}).`
      : '';

    let text = '';
    let withLogin = false;
    if (state === 'needsLogin') {
      text = 'Du är inte inloggad i Hub.' + savedNote;
      withLogin = true;
    } else if (state === 'forbidden') {
      text = 'Du saknar behörighet till Hub (rollen Hub.Reader).' + savedNote;
    } else if (state === 'offline' || state === 'error') {
      text = 'Hub kunde inte nås.' + savedNote;
    } else {
      banner.classList.add('hidden');
      return;
    }

    const span = document.createElement('span');
    span.textContent = text;
    banner.appendChild(span);
    if (withLogin) {
      const btn = document.createElement('button');
      btn.className = 'btn-hub-login';
      btn.textContent = 'Logga in i Hub';
      btn.addEventListener('click', () => openHubLogin());
      banner.appendChild(btn);
    }
    banner.classList.remove('hidden');
  }

  // ---- Onboarding (visas vid första start) ----
  function showOnboarding(uiState, activateTab) {
    const app = document.getElementById('app');
    const overlay = document.getElementById('onboarding-overlay');
    const step1 = document.getElementById('onboarding-step-1');
    const step2 = document.getElementById('onboarding-step-2');

    app.classList.add('onboarding-active');
    step1.classList.remove('hidden');
    step2.classList.add('hidden');
    overlay.classList.remove('hidden');

    let selectedDevMode = false;

    async function finishOnboarding() {
      overlay.classList.add('hidden');
      app.classList.remove('onboarding-active');
      uiState.devMode = selectedDevMode;
      uiState.setupDone = true;
      await saveUiState(uiState);
      document.getElementById('dev-mode-checkbox').checked = selectedDevMode;
      await refreshViews();
    }

    function goToStep2(isDev) {
      selectedDevMode = isDev;
      step1.classList.add('hidden');
      step2.classList.remove('hidden');
      // Redan inloggad i Hub? Då behövs inget mer – kunderna finns.
      refreshHub().then(state => {
        if (state === 'ok' && !overlay.classList.contains('hidden')) finishOnboarding();
      });
    }

    document.getElementById('onboarding-dev-yes').onclick = () => goToStep2(true);
    document.getElementById('onboarding-dev-no').onclick = () => goToStep2(false);

    document.getElementById('onboarding-login-btn').onclick = async () => {
      await finishOnboarding();
      openHubLogin();
    };

    document.getElementById('onboarding-skip-btn').onclick = async () => {
      await finishOnboarding();
      activateTab(
        document.getElementById('tab-settings'),
        document.getElementById('view-settings')
      );
    };
  }

  // ---- Flikar ----
  function setupTabs() {
    const btnHome = document.getElementById('tab-home');
    const btnSettings = document.getElementById('tab-settings');
    const btnConfig = document.getElementById('tab-config');
    const viewHome = document.getElementById('view-home');
    const viewSettings = document.getElementById('view-settings');
    const viewConfig = document.getElementById('view-config');

    function activateTab(activeBtn, activeView) {
      [btnHome, btnSettings, btnConfig].forEach(b => b.classList.remove('active'));
      [viewHome, viewSettings, viewConfig].forEach(v => v.classList.add('hidden'));
      activeBtn.classList.add('active');
      activeView.classList.remove('hidden');
    }

    // Stänger detaljvyn och tar bort egna URL:er som lämnats tomma.
    async function cleanupAndCloseEdit() {
      const customers = await getCustomers();
      for (const c of customers) {
        for (const app of c.applications) {
          const kept = app.domains.filter(d => d.source === 'hub' || (d.baseUrl && d.baseUrl.trim()));
          if (kept.length !== app.domains.length) await saveLocalDomains(app.slug, kept);
        }
      }
      showSettingsList();
      await refreshViews();
    }

    btnSettings.addEventListener('click', () => activateTab(btnSettings, viewSettings));
    btnConfig.addEventListener('click', () => activateTab(btnConfig, viewConfig));

    return { cleanupAndCloseEdit, activateTab, btnHome, viewHome };
  }

  // ---- Custom modal (ersätter alert/confirm) ----
  function showModal(message, buttons) {
    return new Promise(resolve => {
      const backdrop = document.getElementById('custom-modal');
      const msgEl = document.getElementById('modal-message');
      const actionsEl = document.getElementById('modal-actions');
      msgEl.textContent = message;
      actionsEl.innerHTML = '';
      for (const btn of buttons) {
        const el = document.createElement('button');
        el.className = 'modal-btn ' + (btn.primary ? 'modal-btn-primary' : 'modal-btn-secondary');
        el.textContent = btn.label;
        el.addEventListener('click', () => {
          backdrop.classList.add('hidden');
          resolve(btn.value);
        });
        actionsEl.appendChild(el);
      }
      backdrop.classList.remove('hidden');
    });
  }

  function showAlert(message) {
    return showModal(message, [{ label: 'OK', primary: true, value: undefined }]);
  }

  function showConfirm(message, okLabel = 'OK', cancelLabel = 'Avbryt') {
    return showModal(message, [
      { label: cancelLabel, primary: false, value: false },
      { label: okLabel, primary: true, value: true },
    ]);
  }

  // ---- XSS-skydd ----
  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Tillåter bara http(s)-URL:er – blockerar javascript:, data: m.m.
  function sanitizeUrl(url) {
    const s = String(url ?? '').trim();
    return /^https?:\/\//i.test(s) ? s : '';
  }

  // Tillåter bara valida hex-färgvärden (t.ex. #2c3956)
  function sanitizeColor(val) {
    const s = String(val ?? '').trim();
    return /^#[0-9a-f]{3,8}$/i.test(s) ? s : '';
  }

  async function isExtensionInDevelopmentMode() {
    if (!chrome.management?.getSelf) return false;
    try {
      const self = await chrome.management.getSelf();
      return self.installType === 'development';
    } catch {
      return false;
    }
  }

  // ---- Docka till höger / lossa till popup ----
  const PANEL_PATH = 'popup/popup.html?mode=panel';
  const isPanelMode = new URLSearchParams(location.search).get('mode') === 'panel';
  if (isPanelMode) document.documentElement.classList.add('panel-mode');

  // ---- Mörkt läge ----
  // 'light' / 'dark' = uttryckligt val, annars följer vi systemets tema.
  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function setupThemeSelect(uiState) {
    const select = document.getElementById('theme-select');
    select.value = uiState.theme === 'light' || uiState.theme === 'dark' ? uiState.theme : 'auto';
    select.addEventListener('change', async () => {
      const ui = await getUiState();
      ui.theme = select.value === 'auto' ? undefined : select.value;
      applyTheme(ui.theme);
      await saveUiState(ui);
    });
  }

  // Sätts så tidigt som möjligt (utan att vänta på övrig init) för att undvika
  // att popupen hinner blinka till i fel tema.
  getUiState().then((ui) => applyTheme(ui.theme));

  function setupDockToggle(tab) {
    const dockBtn = document.getElementById('tab-dock');
    if (!dockBtn || !chrome.sidePanel || !tab?.id) {
      if (dockBtn) dockBtn.classList.add('hidden');
      return;
    }

    if (isPanelMode) {
      dockBtn.classList.add('active');
      dockBtn.title = 'Lossa till popup';
    } else {
      dockBtn.title = 'Docka till höger';
    }

    dockBtn.addEventListener('click', async () => {
      try {
        if (isPanelMode) {
          // Stängningen sker i service worker – panelens egen kontext dör så
          // fort den stängs och hinner annars inte återaktivera sig själv.
          chrome.runtime.sendMessage({ type: 'closeSidePanel', tabId: tab.id });
        } else {
          await chrome.sidePanel.setOptions({ tabId: tab.id, path: PANEL_PATH, enabled: true });
          await chrome.sidePanel.open({ tabId: tab.id });
          window.close();
        }
      } catch (err) {
        console.error('Kunde inte växla docknings-läge:', err);
      }
    });
  }

  // ---- Uppdatera alla vyer från lagrade data ----
  let currentTab = null;

  async function refreshViews() {
    const [customers, ui, status, cache] = await Promise.all([
      getCustomers(), getUiState(), getHubStatus(), getHubCache(),
    ]);
    renderHubBanner(status, cache);
    // Behörighetsbanner bara om hämtningen faktiskt misslyckats och behörigheten saknas
    if (status?.state !== 'ok' && !(await hasHubPermission())) await renderPermissionBanner();
    renderHome(currentTab?.url ? findMatch(customers, currentTab.url) : null, currentTab?.url ?? '', ui);
    // Rita inte om listan över en öppen detaljvy
    if (document.getElementById('customer-edit-panel').classList.contains('hidden')) {
      renderSettings(customers, ui);
    }
    return customers;
  }

  // Aktiv flik. I sidopanelen finns inget "nuvarande fönster" som i en popup,
  // så senast fokuserade fönstret används i första hand.
  async function getActiveTab() {
    let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.url) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  // Sidopanelen ligger kvar öppen medan man byter flik och navigerar, så den
  // måste följa med. (Popupen stängs av sig själv, så där gör det ingen skada.)
  function watchActiveTab() {
    const update = async (tab) => {
      if (!tab?.url) return;
      if (currentTab?.windowId !== undefined && tab.windowId !== currentTab.windowId) return;
      if (tab.id === currentTab?.id && tab.url === currentTab?.url) return;
      currentTab = tab;
      await refreshViews();
    };

    chrome.tabs.onActivated.addListener(async ({ tabId }) => {
      try { await update(await chrome.tabs.get(tabId)); } catch { /* fliken hann stängas */ }
    });
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (tab.active && (changeInfo.url || changeInfo.status === 'complete')) update(tab);
    });
  }

  // ---- Init ----
  async function init() {
    const { cleanupAndCloseEdit, activateTab, btnHome, viewHome } = setupTabs();

    const [tab, uiState, isDevelopmentInstall] = await Promise.all([
      getActiveTab(),
      getUiState(),
      isExtensionInDevelopmentMode(),
    ]);
    currentTab = tab;
    watchActiveTab();

    setupDockToggle(tab);
    setupThemeSelect(uiState);

    // Visa det som finns sparat direkt, hämta sedan färsk lista från Hub
    const customers = await refreshViews();
    const match = tab?.url ? findMatch(customers, tab.url) : null;

    // Onboarding vid första start (endast om ingen kundlista finns sparad)
    if (!uiState.setupDone && customers.length === 0) {
      showOnboarding(uiState, activateTab);
    } else if (!match) {
      // Ingen matchning – gå direkt till Kunder-fliken
      activateTab(document.getElementById('tab-settings'), document.getElementById('view-settings'));
    }

    refreshHub().then(refreshViews);

    // Utvecklarläge-checkbox
    const devCb = document.getElementById('dev-mode-checkbox');
    const resetSection = document.getElementById('developer-reset-section');
    const resetBtn = document.getElementById('reset-app-btn');

    function updateDeveloperUi(ui) {
      devCb.checked = !!ui.devMode;
      resetSection.classList.toggle('hidden', !isDevelopmentInstall);
    }

    updateDeveloperUi(uiState);

    devCb.addEventListener('change', async () => {
      const ui = await getUiState();
      ui.devMode = devCb.checked;
      await saveUiState(ui);
      await refreshViews();
      updateDeveloperUi(ui);
    });

    // Hub-adress (bara när tillägget körs lokalt som "unpacked")
    if (isDevelopmentInstall) {
      const hubUrlSection = document.getElementById('hub-url-section');
      const hubUrlInput = document.getElementById('hub-url-input');
      hubUrlSection.classList.remove('hidden');
      hubUrlInput.value = await getHubUrlOverride();

      document.getElementById('hub-url-save').addEventListener('click', async () => {
        const val = hubUrlInput.value.trim();
        if (val) {
          let origin;
          try { origin = new URL(val); } catch { origin = null; }
          if (!origin || !/^https?:$/.test(origin.protocol)) {
            await showAlert('Ange en giltig adress, t.ex. https://hub.dev.sublime.se');
            return;
          }
          // Måste ligga först i klickhanteraren (kräver användargest). Porten
          // ignoreras i behörigheter, så localhost:1234 täcks av localhost.
          let granted = false;
          try {
            granted = await chrome.permissions.request({ origins: [`${origin.protocol}//${origin.hostname}/*`] });
          } catch (e) {
            await showAlert('Adressen får inte användas: ' + e.message + '\n\nTillåtna: hub.dev.sublime.se och localhost.');
            return;
          }
          if (!granted) return;
        }
        await setHubUrlOverride(val);
        const state = await refreshHub();
        await refreshViews();
        await showAlert(val ? `Hub-adress sparad (${state}).` : 'Använder hub.dev.sublime.se.');
      });
    }

    resetBtn.addEventListener('click', async () => {
      const confirmed = await showConfirm('Återställ appen? Detta rensar egna URL:er, favoriter och sparad Hub-lista, och startar onboarding igen.', 'Återställ');
      if (!confirmed) return;

      await clearLocalData();
      await chrome.storage.local.remove([UI_KEY, HUB_CACHE_KEY, HUB_STATUS_KEY]);

      const clearedUi = {};
      document.getElementById('customers-search').value = '';
      await refreshViews();
      updateDeveloperUi(clearedUi);
      activateTab(document.getElementById('tab-home'), document.getElementById('view-home'));
      showOnboarding(clearedUi, activateTab);
    });

    // Tillbaka-knapp i detaljvyn
    document.getElementById('back-btn').addEventListener('click', async () => {
      await cleanupAndCloseEdit();
    });

    // Sidor-fliken: stäng detaljvyn om öppen
    btnHome.addEventListener('click', async () => {
      const editPanel = document.getElementById('customer-edit-panel');
      if (!editPanel.classList.contains('hidden')) {
        await cleanupAndCloseEdit();
      }
      activateTab(btnHome, viewHome);
    });

    // Export
    document.getElementById('export-btn').addEventListener('click', async () => {
      const own = await exportLocalUrls();
      if (Object.keys(own).length === 0) {
        await showAlert('Du har inga egna URL:er att exportera.');
        return;
      }
      exportOwnUrls();
    });

    // Import
    document.getElementById('import-btn').addEventListener('click', () => {
      importFile(async (message) => {
        await refreshViews();
        await showAlert(message);
      });
    });

    // Sök bland kunder
    document.getElementById('customers-search').addEventListener('input', async () => {
      const [updated, ui] = await Promise.all([getCustomers(), getUiState()]);
      renderSettings(updated, ui);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
