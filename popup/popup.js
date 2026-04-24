// popup.js – Sublime help tool
// Hanterar kunddomäner och visar miljölänkar för aktuell sida.

(() => {
  const STORAGE_KEY = 'sublimeHelp_customers';
  const UI_KEY = 'sublimeHelp_ui';

  const COLORS = [
    { value: '#2c3956', label: 'Sublime' },
    { value: '#3b82f6', label: 'Blå' },
    { value: '#22c55e', label: 'Grön' },
    { value: '#f59e0b', label: 'Gul' },
    { value: '#ef4444', label: 'Röd' },
    { value: '#ec4899', label: 'Rosa' },
    { value: '#14b8a6', label: 'Turkos' },
    { value: '#8b5cf6', label: 'Lila' },
  ];

  const AZURE_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path fill="#0078d4" d="M6.73 2.17h4.54L6.57 16.16H2.04z"/><path fill="#50b5f5" d="M11.27 2.17l-4.7 13.99h10.37z"/></svg>`;

  const UMBRACO_ICON_SVG = `<img src="images/umbraco.png" width="16" height="16" alt="Umbraco">`;
  const OPTIMIZELY_ICON_SVG = `<img src="images/optimizely.png" width="16" height="16" alt="Optimizely">`;

  function getCmsIcon(cms) {
    if (cms === 'umbraco') return UMBRACO_ICON_SVG;
    if (cms === 'optimizely') return OPTIMIZELY_ICON_SVG;
    return '';
  }

  // ---- Datalagring ----
  async function getCustomers() {
    const r = await chrome.storage.local.get(STORAGE_KEY);
    return r[STORAGE_KEY] ?? [];
  }

  async function saveCustomers(customers) {
    await chrome.storage.local.set({ [STORAGE_KEY]: customers });
  }

  async function getUiState() {
    const r = await chrome.storage.local.get(UI_KEY);
    return r[UI_KEY] ?? {};
  }

  async function saveUiState(state) {
    await chrome.storage.local.set({ [UI_KEY]: state });
  }

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
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

  // Hittar vilken kund och domän som matchar nuvarande flik
  function findMatch(customers, tabUrl) {
    const tabHost = getHostname(tabUrl);
    if (!tabHost) return null;

    for (const customer of customers) {
      for (const domain of customer.domains) {
        if (getHostname(domain.baseUrl) === tabHost) {
          return { customer, matchedDomain: domain };
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

    const { customer, matchedDomain } = match;

    // Kundnamn + badge för aktuell miljö
    const header = document.createElement('div');
    header.className = 'customer-header';
    const badgeColor = sanitizeColor(matchedDomain.color) || '#4b6584';
    const homeCmsIcon = getCmsIcon(customer.cms);
    header.innerHTML = `
      <span class="customer-name">${escHtml(customer.name)}</span>
      ${homeCmsIcon ? `<span class="customer-cms-icon" title="${customer.cms === 'umbraco' ? 'Umbraco' : 'Optimizely'}">${homeCmsIcon}</span>` : ''}
      <span class="badge" style="background:${badgeColor};color:white">${escHtml(matchedDomain.label)}</span>`;
    if (customer.azureUrl && uiState.devMode) {
      const azureLink = document.createElement('a');
      azureLink.href = '#';
      azureLink.className = 'btn-azure-header';
      azureLink.title = 'Öppna Azure-portalen';
      azureLink.innerHTML = AZURE_ICON_SVG;
      azureLink.addEventListener('click', e => {
        e.preventDefault();
        const safeUrl = sanitizeUrl(customer.azureUrl);
        if (safeUrl) chrome.tabs.create({ url: safeUrl });
      });
      header.appendChild(azureLink);
    }
    result.appendChild(header);

    // Lista med ALLA miljöer – aktuell markerad, övriga klickbara
    const list = document.createElement('div');
    list.className = 'domain-links';

    const allDomains = customer.domains;
    if (allDomains.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Inga domäner konfigurerade för den här kunden.';
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

        // CMS-inloggningsknapp
        if (customer.cms === 'umbraco' || customer.cms === 'optimizely') {
          const loginPath = customer.cmsLoginUrl || (customer.cms === 'umbraco' ? '/umbraco' : '/episerver/cms');
          try {
            const rawLoginUrl = new URL(loginPath, domain.baseUrl).href;
            const safeLoginUrl = sanitizeUrl(rawLoginUrl);
            if (safeLoginUrl) {
              const loginBtn = document.createElement('button');
              loginBtn.className = 'btn-cms-login';
              loginBtn.title = `Logga in (${loginPath})`;
              loginBtn.innerHTML = getCmsIcon(customer.cms);
              loginBtn.addEventListener('click', e => { e.stopPropagation(); chrome.tabs.create({ url: safeLoginUrl }); });
              link.appendChild(loginBtn);
            }
          } catch { /* ogiltig URL */ }
        }

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

  function showCustomerEdit(customer, customers, uiState = {}) {
    document.getElementById('settings-list-panel').classList.add('hidden');
    const panel = document.getElementById('customer-edit-panel');
    panel.classList.remove('hidden');
    const editContent = document.getElementById('customer-edit-content');
    editContent.__uiState = uiState;
    editContent.innerHTML = '';
    editContent.appendChild(buildCustomerCard(customer, customers, uiState));
  }

  function renderSettings(customers, uiState = {}) {
    const list = document.getElementById('customers-list');
    list.innerHTML = '';
    showSettingsList();

    const searchEl = document.getElementById('customers-search');
    const query = (searchEl?.value ?? '').trim().toLowerCase();
    const isSearching = query.length > 0;

    const allFiltered = isSearching
      ? customers.filter(c => c.name.toLowerCase().includes(query))
      : customers;

    if (customers.length === 0) {
      list.innerHTML = '<p class="muted">Inga kunder tillagda ännu.</p>';
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
          customer.favorite = !customer.favorite;
          await saveCustomers(customers);
          const ui = await getUiState();
          // Om detta är den första favoriten som läggs till, återställ dolda-tillståndet
          const favoriteCount = customers.filter(c => c.favorite).length;
          if (customer.favorite && favoriteCount === 1 && ui.othersHidden) {
            ui.othersHidden = false;
            await saveUiState(ui);
          }
          renderSettings(customers, ui);
        });

        const nameSpan = document.createElement('span');
        nameSpan.className = 'customer-list-name';
        nameSpan.textContent = customer.name;
        nameSpan.title = customer.name;

        const cmsIconSpan = document.createElement('span');
        cmsIconSpan.className = 'customer-cms-icon';
        const cmsIconHtml = getCmsIcon(customer.cms);
        cmsIconSpan.innerHTML = cmsIconHtml;
        if (cmsIconHtml) cmsIconSpan.title = customer.cms === 'umbraco' ? 'Umbraco' : 'Optimizely';

        const domainCount = document.createElement('span');
        domainCount.className = 'customer-list-count';
        domainCount.textContent = `${customer.domains.length} domän${customer.domains.length !== 1 ? 'er' : ''}`;

        const editBtn = document.createElement('button');
        editBtn.className = 'btn-edit';
        editBtn.title = 'Redigera';
        editBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
        editBtn.addEventListener('click', e => { e.stopPropagation(); showCustomerEdit(customer, customers, uiState); });

        const expandPanel = document.createElement('div');
        expandPanel.className = 'customer-expand hidden';

        // Azure-rad längst upp i expand-panelen
        if (customer.azureUrl && uiState.devMode) {
          const safeAzureUrl = sanitizeUrl(customer.azureUrl);
          if (safeAzureUrl) {
            const azureRow = document.createElement('div');
            azureRow.className = 'expand-domain-link expand-azure-link';
            azureRow.title = safeAzureUrl;
            azureRow.innerHTML = `
              <span class="expand-azure-icon">${AZURE_ICON_SVG}</span>
              <span class="expand-domain-label" style="color:#0078d4">Azure</span>
              <span class="expand-domain-url">${escHtml(safeAzureUrl.replace(/^https?:\/\//, ''))}</span>`;
            azureRow.addEventListener('click', e => { e.stopPropagation(); chrome.tabs.create({ url: safeAzureUrl }); });
            expandPanel.appendChild(azureRow);
          }
        }

        for (const domain of customer.domains) {
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

          // Lägg till inloggningslänk om CMS är valt
          if (customer.cms === 'umbraco' || customer.cms === 'optimizely') {
            const loginPath = customer.cmsLoginUrl || (customer.cms === 'umbraco' ? '/umbraco' : '/episerver/cms');
            try {
              const rawLoginUrl = new URL(loginPath, domain.baseUrl).href;
              const safeLoginUrl = sanitizeUrl(rawLoginUrl);
              if (safeLoginUrl) {
                const loginBtn = document.createElement('button');
                loginBtn.className = 'btn-cms-login';
                loginBtn.title = `Logga in (${escHtml(loginPath)})`;
                loginBtn.innerHTML = getCmsIcon(customer.cms);
                loginBtn.addEventListener('click', e => { e.stopPropagation(); chrome.tabs.create({ url: safeLoginUrl }); });
                link.appendChild(loginBtn);
              }
            } catch { /* ogiltig URL */ }
          }

          expandPanel.appendChild(link);
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
            // Flytta i customers-arrayen (bara bland favoriter)
            const favIds = allWrappers.map(w => w.getAttribute('data-id'));
            const reordered = favIds.map(id => customers.find(c => c.id === id));
            // Ta bort src och infoga vid target
            const [moved] = reordered.splice(srcIdx, 1);
            reordered.splice(tgtIdx, 0, moved);
            // Bygg ny customers-array: reordnade favoriter + övriga i ursprungsordning
            const nonFavs = customers.filter(c => !c.favorite);
            customers.splice(0, customers.length, ...reordered, ...nonFavs);
            await saveCustomers(customers);
            const ui = await getUiState();
            renderSettings(customers, ui);
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

  function buildCustomerCard(customer, customers, uiState = {}) {
    const card = document.createElement('div');
    card.className = 'customer-card';

    // Namnrad
    const nameRow = document.createElement('div');
    nameRow.className = 'card-name-row';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = customer.name;
    nameInput.className = 'input-name';
    nameInput.placeholder = 'Kundnamn';
    nameInput.addEventListener('change', async () => {
      customer.name = nameInput.value.trim() || customer.name;
      await saveCustomers(customers);
    });

    const removeCustomerBtn = document.createElement('button');
    removeCustomerBtn.textContent = '×';
    removeCustomerBtn.className = 'btn-remove-customer';
    removeCustomerBtn.title = 'Ta bort kund';
    removeCustomerBtn.addEventListener('click', async () => {
      if (!await showConfirm(`Ta bort kunden "${customer.name}"?`, 'Ta bort')) return;
      const idx = customers.indexOf(customer);
      if (idx > -1) customers.splice(idx, 1);
      await saveCustomers(customers);
      renderSettings(customers);
    });

    nameRow.appendChild(nameInput);
    nameRow.appendChild(removeCustomerBtn);
    card.appendChild(nameRow);

    // CMS-väljare (popup-stil, som färgväljaren)
    const cmsWrap = document.createElement('div');
    cmsWrap.className = 'cms-wrap';

    const cmsPickerBtn = document.createElement('button');
    cmsPickerBtn.type = 'button';
    cmsPickerBtn.className = 'cms-picker-btn';
    cmsPickerBtn.title = 'Välj CMS';

    function updateCmsPickerBtn() {
      const icon = getCmsIcon(customer.cms);
      cmsPickerBtn.innerHTML = icon
        ? `<span class="cms-picker-icon">${icon}</span>`
        : `<span class="cms-picker-empty">CMS</span><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 4l3 3 3-3"/></svg>`;
      cmsPickerBtn.title = customer.cms
        ? (customer.cms === 'umbraco' ? 'Umbraco' : 'Optimizely')
        : 'Välj CMS';
    }
    updateCmsPickerBtn();

    const cmsPopup = document.createElement('div');
    cmsPopup.className = 'cms-popup hidden';

    const cmsPopupOptions = [
      { value: 'umbraco', label: 'Umbraco', icon: UMBRACO_ICON_SVG },
      { value: 'optimizely', label: 'Optimizely', icon: OPTIMIZELY_ICON_SVG },
      { value: null, label: 'Inget CMS', icon: null },
    ];
    for (const opt of cmsPopupOptions) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.title = opt.label;
      if (opt.value === null) {
        swatch.className = 'cms-swatch cms-swatch-none' + (!customer.cms ? ' selected' : '');
        swatch.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="2" y1="2" x2="10" y2="10"/><line x1="10" y1="2" x2="2" y2="10"/></svg>`;
      } else {
        swatch.className = 'cms-swatch' + (customer.cms === opt.value ? ' selected' : '');
        swatch.innerHTML = opt.icon;
      }
      swatch.addEventListener('click', async e => {
        e.stopPropagation();
        customer.cms = opt.value;
        cmsPopup.querySelectorAll('.cms-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        updateCmsPickerBtn();
        cmsPopup.classList.add('hidden');
        await saveCustomers(customers);
      });
      cmsPopup.appendChild(swatch);
    }

    cmsPickerBtn.addEventListener('click', e => {
      e.stopPropagation();
      document.querySelectorAll('.cms-popup:not(.hidden)').forEach(p => {
        if (p !== cmsPopup) p.classList.add('hidden');
      });
      cmsPopup.classList.toggle('hidden');
    });
    document.addEventListener('click', () => cmsPopup.classList.add('hidden'));

    cmsWrap.appendChild(cmsPickerBtn);
    cmsWrap.appendChild(cmsPopup);

    // Anpassad CMS-inloggnings-URL
    const cmsLoginRow = document.createElement('div');
    cmsLoginRow.className = 'cms-login-url-row' + (customer.cms ? '' : ' hidden');
    const cmsLoginIcon = document.createElement('span');
    cmsLoginIcon.className = 'cms-login-url-icon';
    cmsLoginIcon.innerHTML = getCmsIcon(customer.cms || 'optimizely');
    const cmsLoginInput = document.createElement('input');
    cmsLoginInput.type = 'text';
    cmsLoginInput.value = customer.cmsLoginUrl || '';
    cmsLoginInput.className = 'input-url';
    cmsLoginInput.placeholder = 'Anpassad inloggningssökväg (t.ex. /util/login.aspx)';
    cmsLoginInput.addEventListener('change', async () => {
      const val = cmsLoginInput.value.trim();
      customer.cmsLoginUrl = val || null;
      cmsLoginInput.value = val;
      await saveCustomers(customers);
    });
    cmsLoginRow.appendChild(cmsLoginIcon);
    cmsLoginRow.appendChild(cmsLoginInput);

    // Uppdatera synlighet och ikon när CMS byts
    const origUpdateCmsPickerBtn = updateCmsPickerBtn;
    function updateCmsPickerBtnAndRow() {
      origUpdateCmsPickerBtn();
      cmsLoginRow.classList.toggle('hidden', !customer.cms);
      cmsLoginIcon.innerHTML = getCmsIcon(customer.cms || 'optimizely');
    }
    // Ersätt swatch-klick-lyssnare med uppdaterad funktion
    cmsPopup.querySelectorAll('.cms-swatch').forEach((swatch, i) => {
      const opt = cmsPopupOptions[i];
      const old = swatch.cloneNode(true);
      swatch.parentNode.replaceChild(old, swatch);
      old.addEventListener('click', async e => {
        e.stopPropagation();
        customer.cms = opt.value;
        cmsPopup.querySelectorAll('.cms-swatch').forEach(s => s.classList.remove('selected'));
        old.classList.add('selected');
        updateCmsPickerBtnAndRow();
        cmsPopup.classList.add('hidden');
        await saveCustomers(customers);
      });
    });

    // Azure-URL rad (alltid synlig i editläge)
    const azureRow = document.createElement('div');
    azureRow.className = 'azure-url-row';
    const azureIconSpan = document.createElement('span');
    azureIconSpan.className = 'azure-url-icon';
    azureIconSpan.innerHTML = AZURE_ICON_SVG;
    const azureUrlInput = document.createElement('input');
    azureUrlInput.type = 'text';
    azureUrlInput.value = customer.azureUrl || '';
    azureUrlInput.className = 'input-url';
    azureUrlInput.placeholder = 'Azure-URL (t.ex. https://portal.azure.com/#@...)';
    azureUrlInput.addEventListener('change', async () => {
      let val = azureUrlInput.value.trim();
      if (val && !/^https?:\/\//i.test(val)) val = 'https://' + val;
      customer.azureUrl = val;
      azureUrlInput.value = val;
      await saveCustomers(customers);
    });
    azureRow.appendChild(azureIconSpan);
    azureRow.appendChild(azureUrlInput);
    azureRow.appendChild(cmsWrap);
    card.appendChild(azureRow);
    card.appendChild(cmsLoginRow);

    // Domänlista
    const domainList = document.createElement('div');
    domainList.className = 'domain-edit-list';
    for (const domain of customer.domains) {
      domainList.appendChild(buildDomainRow(domain, customer, customers, domainList));
    }
    card.appendChild(domainList);

    // Lägg till domän-knapp
    const addDomainBtn = document.createElement('button');
    addDomainBtn.textContent = '+ Lägg till domän';
    addDomainBtn.className = 'btn-secondary';
    addDomainBtn.addEventListener('click', async () => {
      const newDomain = { id: genId(), label: '', baseUrl: '', color: COLORS[0].value };
      customer.domains.push(newDomain);
      const row = buildDomainRow(newDomain, customer, customers, domainList);
      domainList.appendChild(row);
      row.querySelector('input').focus();
      await saveCustomers(customers);
    });
    card.appendChild(addDomainBtn);

    return card;
  }

  function buildDomainRow(domain, customer, customers, domainList) {
    const row = document.createElement('div');
    row.className = 'domain-edit-row';
    row.draggable = true;
    row.dataset.domainId = domain.id;

    // Drag-handtag
    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.title = 'Dra för att ändra ordning';
    handle.innerHTML = `<svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor"><circle cx="4" cy="3" r="1.5"/><circle cx="8" cy="3" r="1.5"/><circle cx="4" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="4" cy="13" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>`;
    handle.addEventListener('mousedown', () => { row.draggable = true; });

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = domain.label;
    labelInput.className = 'input-label';
    labelInput.placeholder = 'Name';
    labelInput.addEventListener('mousedown', () => { row.draggable = false; });
    labelInput.addEventListener('change', async () => {
      domain.label = labelInput.value.trim();
      await saveCustomers(customers);
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
      let val = urlInput.value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (!val) {
        domain.baseUrl = '';
        urlInput.value = '';
        await saveCustomers(customers);
        return;
      }
      // Validera: bara domän (tillgåter subdomäner och port, inga sökvägar)
      const domainPattern = /^(localhost|([a-z0-9-]+\.)+[a-z]{2,})(:\d+)?$/i;
      if (!domainPattern.test(val)) {
        urlInput.classList.add('input-error');
        urlInput.title = 'Ange bara domänen, t.ex. dev.example.com eller localhost:5001';
        return;
      }
      domain.baseUrl = 'https://' + val;
      urlInput.value = val;
      urlInput.classList.remove('input-error');
      await saveCustomers(customers);
    });

    const removeBtn = document.createElement('button');
    removeBtn.textContent = '×';
    removeBtn.className = 'btn-remove';
    removeBtn.title = 'Ta bort domän';
    removeBtn.addEventListener('click', async () => {
      const idx = customer.domains.indexOf(domain);
      if (idx > -1) customer.domains.splice(idx, 1);
      await saveCustomers(customers);
      row.remove();
    });

    // Drag & drop-hantering
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

      const fromIdx = customer.domains.findIndex(d => d.id === fromId);
      const toIdx = customer.domains.findIndex(d => d.id === toId);
      if (fromIdx === -1 || toIdx === -1) return;

      // Flytta i datan
      const [moved] = customer.domains.splice(fromIdx, 1);
      customer.domains.splice(toIdx, 0, moved);
      await saveCustomers(customers);

      // Rita om listan
      domainList.innerHTML = '';
      for (const d of customer.domains) {
        domainList.appendChild(buildDomainRow(d, customer, customers, domainList));
      }
    });

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
      await saveCustomers(customers);
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
        await saveCustomers(customers);
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
  // ---- Färgnamn för export/import ----
  function colorToExportName(hex) {
    const idx = COLORS.findIndex(c => c.value === (hex || COLORS[0].value));
    return idx >= 0 ? idx + 1 : 1;
  }

  function exportNameToColor(name) {
    if (name === undefined || name === null || name === '') return COLORS[0].value;
    // Stödjer både siffra (1) och gammalt format (Färg1)
    const m = String(name).match(/^(?:[Ff]ärg)?(\d+)$/);
    if (!m) return COLORS[0].value;
    return COLORS[parseInt(m[1], 10) - 1]?.value ?? COLORS[0].value;
  }

  // Konverterar ett råobjekt från importfil till internt format med nya ID:n
  function normalizeImportCustomer(raw) {
    return {
      id: genId(),
      name: String(raw.name ?? '').trim(),
      azureUrl: sanitizeUrl(raw.azureUrl),
      ...((['umbraco', 'optimizely', 'episerver'].includes(raw.cms)) ? { cms: raw.cms === 'episerver' ? 'optimizely' : raw.cms } : {}),
      ...(raw.cmsLoginUrl ? { cmsLoginUrl: String(raw.cmsLoginUrl).trim() } : {}),
      domains: (Array.isArray(raw.domains) ? raw.domains : []).map(d => ({
        id: genId(),
        label: String(d.label ?? '').trim(),
        baseUrl: sanitizeUrl(d.url ?? d.baseUrl ?? ''),
        color: exportNameToColor(d.color),
        ...(d.devOnly ? { devOnly: true } : {}),
      }))
    };
  }

  function exportCustomers(customers) {
    const exportData = customers.map(c => ({
      name: c.name,
      ...(c.azureUrl ? { azureUrl: c.azureUrl } : {}),
      ...(c.cms ? { cms: c.cms } : {}),
      ...(c.cmsLoginUrl ? { cmsLoginUrl: c.cmsLoginUrl } : {}),
      domains: c.domains.map(d => {
        const entry = { label: d.label, url: d.baseUrl };
        entry.color = colorToExportName(d.color);
        if (d.devOnly) entry.devOnly = true;
        return entry;
      })
    }));
    const json = JSON.stringify({ version: 3, customers: exportData }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = 'sublime-help-kunder.json';
    a.click();
    URL.revokeObjectURL(objUrl);
  }

  function importCustomers(existingCustomers, onDone) {
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
          const text = reader.result.replace(/^\uFEFF/, '');
          const parsed = JSON.parse(text);
          if (!parsed.version || !Array.isArray(parsed.customers)) {
            await showAlert('Ogiltig fil – förväntas en Sublime help tool-export.');
            return;
          }
          const incoming = parsed.customers.map(normalizeImportCustomer).filter(c => c.name);
          const hasExisting = existingCustomers.length > 0;

          let replace = false;
          if (hasExisting) {
            const choice = await showModal(
              `Filen innehåller ${incoming.length} kunder.\n\nVill du lägga till dem eller ersätta hela din nuvarande lista?`,
              [
                { label: 'Avbryt', primary: false, value: 'cancel' },
                { label: 'Lägg till', primary: false, value: 'add' },
                { label: 'Ersätt', primary: true, value: 'replace' },
              ]
            );
            if (choice === 'cancel') return;
            replace = choice === 'replace';
          }

          // Spara favoriter från befintlig lista för att återställa efter import
          const favoriteNames = new Set(existingCustomers.filter(c => c.favorite).map(c => c.name.toLowerCase()));

          let merged;
          let addedCount;
          if (replace) {
            merged = incoming;
            addedCount = incoming.length;
          } else {
            const existingNames = new Set(existingCustomers.map(c => c.name.toLowerCase()));
            const toAdd = incoming.filter(c => !existingNames.has(c.name.toLowerCase()));
            merged = [...existingCustomers, ...toAdd];
            addedCount = toAdd.length;
          }

          // Återställ favoriter för kunder som fortfarande finns
          for (const c of merged) {
            if (favoriteNames.has(c.name.toLowerCase())) {
              c.favorite = true;
            }
          }

          await saveCustomers(merged);
          onDone(merged, addedCount, replace);
        } catch (e) {
          await showAlert('Kunde inte läsa filen. Kontrollera att det är en giltig JSON-fil.\n\nFel: ' + e.message);
        }
      };
      reader.onerror = async () => { await showAlert('Kunde inte öppna filen.'); };
      reader.readAsText(file, 'UTF-8');
    });
    input.click();
  }

  // ---- Onboarding (visas vid första start) ----
  function showOnboarding(uiState, customers, tab, activateTab) {
    const app = document.getElementById('app');
    const overlay = document.getElementById('onboarding-overlay');
    const step1 = document.getElementById('onboarding-step-1');
    const step2 = document.getElementById('onboarding-step-2');

    app.classList.add('onboarding-active');
    step1.classList.remove('hidden');
    step2.classList.add('hidden');
    overlay.classList.remove('hidden');

    let selectedDevMode = false;

    function goToStep2(isDev) {
      selectedDevMode = isDev;
      step1.classList.add('hidden');
      step2.classList.remove('hidden');
    }

    async function finishOnboarding() {
      overlay.classList.add('hidden');
      app.classList.remove('onboarding-active');
      uiState.devMode = selectedDevMode;
      uiState.setupDone = true;
      await saveUiState(uiState);
      document.getElementById('dev-mode-checkbox').checked = selectedDevMode;
      const updatedCustomers = await getCustomers();
      renderSettings(updatedCustomers, uiState);
      const updatedMatch = tab?.url ? findMatch(updatedCustomers, tab.url) : null;
      renderHome(updatedMatch, tab?.url ?? '', uiState);
    }

    document.getElementById('onboarding-dev-yes').onclick = () => goToStep2(true);
    document.getElementById('onboarding-dev-no').onclick = () => goToStep2(false);

    document.getElementById('onboarding-import-btn').onclick = async () => {
      await finishOnboarding();
      const existing = await getCustomers();
      importCustomers(existing, async (merged) => {
        const ui = await getUiState();
        renderSettings(merged, ui);
        const updatedMatch = tab?.url ? findMatch(merged, tab.url) : null;
        renderHome(updatedMatch, tab?.url ?? '', ui);
        activateTab(
          document.getElementById('tab-settings'),
          document.getElementById('view-settings')
        );
      });
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

    async function cleanupAndCloseEdit() {
      const customers = await getCustomers();
      let changed = false;
      for (const c of customers) {
        const before = c.domains.length;
        c.domains = c.domains.filter(d => d.baseUrl && d.baseUrl.trim());
        if (c.domains.length !== before) changed = true;
      }
      if (changed) await saveCustomers(customers);
      const ui = await getUiState();
      renderSettings(customers, ui);
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

  // ---- Init ----
  async function init() {
    const { cleanupAndCloseEdit, activateTab, btnHome, viewHome } = setupTabs();

    const [customers, [tab], uiState, isDevelopmentInstall] = await Promise.all([
      getCustomers(),
      chrome.tabs.query({ active: true, currentWindow: true }),
      getUiState(),
      isExtensionInDevelopmentMode(),
    ]);

    // Startsida
    const match = tab?.url ? findMatch(customers, tab.url) : null;
    renderHome(match, tab?.url ?? '', uiState);

    // Inställningar
    renderSettings(customers, uiState);

    // Onboarding vid första start (endast om ingen kund är importerad)
    if (!uiState.setupDone && customers.length === 0) {
      showOnboarding(uiState, customers, tab, activateTab);
    } else if (!match) {
      // Ingen matchning – gå direkt till Kunder-fliken
      activateTab(document.getElementById('tab-settings'), document.getElementById('view-settings'));
    }

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
      const updatedCustomers = await getCustomers();
      const updatedMatch = tab?.url ? findMatch(updatedCustomers, tab.url) : null;
      renderHome(updatedMatch, tab?.url ?? '', ui);
      renderSettings(updatedCustomers, ui);
      updateDeveloperUi(ui);
    });

    resetBtn.addEventListener('click', async () => {
      const confirmed = await showConfirm('Återställ appen? Detta rensar alla kunder och startar onboarding igen.', 'Återställ');
      if (!confirmed) return;

      await chrome.storage.local.remove([STORAGE_KEY, UI_KEY]);

      const clearedUi = {};
      document.getElementById('customers-search').value = '';
      renderSettings([], clearedUi);
      renderHome(null, tab?.url ?? '', clearedUi);
      updateDeveloperUi(clearedUi);
      activateTab(document.getElementById('tab-home'), document.getElementById('view-home'));
      showOnboarding(clearedUi, [], tab, activateTab);
    });

    // Tillbaka-knapp i edit-vy
    document.getElementById('back-btn').addEventListener('click', async () => {
      await cleanupAndCloseEdit();
    });

    // Sidor-fliken: stäng edit om öppet
    btnHome.addEventListener('click', async () => {
      const editPanel = document.getElementById('customer-edit-panel');
      if (!editPanel.classList.contains('hidden')) {
        await cleanupAndCloseEdit();
      }
      activateTab(btnHome, viewHome);
    });

    // Export
    document.getElementById('export-btn').addEventListener('click', async () => {
      const customers = await getCustomers();
      if (customers.length === 0) {
        await showAlert('Inga kunder att exportera.');
        return;
      }
      exportCustomers(customers);
    });

    // Import
    document.getElementById('import-btn').addEventListener('click', async () => {
      const existing = await getCustomers();
      importCustomers(existing, async (merged, addedCount, replaced) => {
        const ui = await getUiState();
        renderSettings(merged, ui);
        if (replaced) {
          await showAlert(`Import klar! Listan ersattes med ${addedCount} kund${addedCount !== 1 ? 'er' : ''}.`);
        } else {
          await showAlert(`Import klar! ${addedCount} ny${addedCount !== 1 ? 'a' : ''} kund${addedCount !== 1 ? 'er' : ''} lades till.`);
        }
      });
    });

    // Lägg till kund
    document.getElementById('customers-search').addEventListener('input', async () => {
      const updated = await getCustomers();
      const ui = await getUiState();
      renderSettings(updated, ui);
    });

    document.getElementById('add-customer-btn').addEventListener('click', async () => {
      const updated = await getCustomers();
      const newCustomer = { id: genId(), name: 'Ny kund', azureUrl: '', domains: [] };
      updated.push(newCustomer);
      await saveCustomers(updated);
      const ui = await getUiState();
      renderSettings(updated, ui);
      showCustomerEdit(newCustomer, updated, ui);

      // Fokusera på namnfältet direkt
      const cards = document.querySelectorAll('.customer-card');
      const lastCard = cards[cards.length - 1];
      if (lastCard) {
        lastCard.scrollIntoView({ behavior: 'smooth' });
        lastCard.querySelector('.input-name')?.select();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();

