# Changelog

## Ej incheckat

**Nytt: byggverktyg för release**
- Lagt till `package.json` + `package-lock.json` (nytt npm-projekt, inga körtidsberoenden, bara devDependencies: `eslint`, `globals`, `archiver`).
- Lagt till `eslint.config.js`: flat config med browser-globals + `chrome` som global, `sourceType: module`, reglerna `no-unused-vars` (warn), `no-undef` (error), `eqeqeq` (warn), `prefer-const` (warn). Egen sektion för `scripts/**` med Node-globals.
- Lagt till `scripts/build.js`:
  - `bumpVersion(version, level)` – räknar ut nästa `patch`/`minor`/`major`-version från semver i `manifest.json`.
  - `updateManifestVersion(newVersion)` – skriver in nytt versionsnummer i `manifest.json` med en riktad textersättning (regex på `"version": "..."`) istället för att skriva om hela filen, så att befintlig formattering (blankrader, indrag) bevaras.
  - `buildZip(version)` – paketerar `manifest.json`, `background/`, `content/`, `icons/`, `popup/`, `shared/` till `dist/sublime-help-tool-vX.Y.Z.zip` via `archiver`.
  - CLI-flagga `--bump=patch|minor|major`.
- Nya npm-scripts i `package.json`: `lint`, `lint:fix`, `build`, `release:patch`, `release:minor`, `release:major`.
- `.gitignore`: lagt till `node_modules/` och `dist/`.
- `README.md`: ny sektion "Utveckling" (npm-kommandon) och ny sektion "Så gör du en ny release" med steg-för-steg-instruktioner.
- `FORBATTRINGSIDEER.md`: tagit bort raden "ESLint + byggskript som paketerar `.zip` och bumpar `manifest.json`-version inför release" under Kodkvalitet/underhåll, eftersom den är genomförd.

## 2.1.0 – Omnibox, sidopanel, mörkt läge, Storybook-länk, synkad lagring (commit `0c6fed6`)

**Kunddata flyttad till synkad lagring (`shared/storage.js`, ny fil)**
- Ny delad modul `shared/storage.js` som ersätter direkta `chrome.storage.local`-anrop för kunddata.
- Bytt lagringsplats för kunder från `chrome.storage.local` till `chrome.storage.sync`, så att samma kunduppsättning följer med mellan Chrome-profiler/datorer.
- Varje kund lagras nu som en egen post (`cust_<id>`) plus ett index (`sublimeHelp_customerIds`) istället för en enda stor array, för att undvika `chrome.storage.sync`s 8 KB-gräns per post.
- `genId()` flyttad hit från `popup.js` (delas nu mellan popup och service worker).
- `getCustomers()`, `saveCustomers()`, `clearAllCustomers()` – nya publika funktioner.
- Automatisk engångsmigrering (`migrateLegacyLocalDataIfNeeded`) av gammal data från `sublimeHelp_customers` (local) till den nya synkade strukturen, styrd av flaggan `sublimeHelp_migratedToSync`. Gamla nyckeln rörs inte, så den finns kvar som backup.
- `saveCustomers()` speglar också till den gamla lokala nyckeln som extra säkerhetskopia (best-effort, ignorerar fel).

**Omnibox-integration (`background/service-worker.js`, `manifest.json`)**
- Nytt `omnibox`-block i `manifest.json` med nyckelordet `sh`.
- `chrome.omnibox.onInputChanged`: visar förslag (kundnamn + miljö) medan man skriver, filtrerar på kundnamn, respekterar `devMode` för dev-only-domäner, max 8 förslag.
- `chrome.omnibox.onInputEntered`: matchar antingen ett specifikt `kundId|domänId`-förslag eller första lämpliga domän för ett kundnamn, öppnar URL:en i aktuell flik eller ny flik beroende på `disposition`.
- Nya hjälpfunktioner `sanitizeUrl()` (blockerar allt utom http/https) och `escapeXml()` (för omnibox-beskrivningar) i service worker.
- `getIconImageData`/`updateIcon` uppdaterade till att hämta kunder via `getCustomers()` istället för direkt `chrome.storage.local`.

**Sidopanel / "docka till höger" (`manifest.json`, `background/service-worker.js`, `popup/popup.js`, `popup/popup.html`)**
- Nytt `side_panel`-block i `manifest.json` (`popup/popup.html?mode=panel`) och ny permission `sidePanel`.
- Ny knapp `#tab-dock` i `popup.html` för att docka popupen som sidopanel respektive lossa tillbaka till popup.
- `setupDockToggle()` i `popup.js`: växlar mellan popup- och panel-läge via `chrome.sidePanel.setOptions`/`open`, känner igen panel-läge via `?mode=panel` i URL:en och sätter CSS-klassen `panel-mode` på `<html>`.
- Ny meddelandehanterare i service worker (`closeSidePanel`) som stänger sidopanelen åt popupen, eftersom panelens egen JS-kontext dör innan den hinner göra det själv.
- `chrome.storage.onChanged`-lyssnare (för `sync`-området) som uppdaterar ikonen på alla öppna flikar när kunddata synkas in från en annan enhet.

**Mörkt läge (`popup/popup.js`, `popup/popup.html`, `popup/popup.css`)**
- Ny temaväljare (`#theme-select`) i `popup.html` med alternativen System/Ljust/Mörkt.
- `applyTheme()` sätter/tar bort `data-theme="light"|"dark"` på `<html>`; utan uttryckligt val följs systemets `prefers-color-scheme`.
- `setupThemeSelect()` läser/sparar valt tema i UI-state (`sublimeHelp_ui`).
- Temat sätts direkt vid sidladdning (innan resten av `init()` körs) för att undvika att popupen blinkar till i fel tema.
- Stora tillägg i `popup.css` med mörkt färgschema för hela gränssnittet.

**Storybook-länk per kund (`popup/popup.js`, `popup/popup.html`, `popup/popup.css`)**
- Nytt fält `storybookUrl` per kund, saneras med `sanitizeUrl()` och sparas/laddas i export/import-format.
- Ny Storybook-ikonknapp i kundkortets header (endast i `devMode`) som öppnar Storybook-URL:en i ny flik.
- Ny rad högst upp i den expanderade panelen för Storybook-länken (endast i `devMode`).
- Nytt inputfält för Storybook-URL i redigeringsläget för en kund.

**Övriga ändringar**
- Inloggnings-URL-fältet (`cmsLoginUrl`) är nu alltid synligt i redigeringsläget (tidigare bara när ett CMS var valt); visar en generisk låsikon (`GENERIC_LOGIN_ICON_SVG`) när inget CMS är valt, annars CMS-ikonen.
- `manifest.json`: version `2.0.1` → `2.1.0`.
- Ny fil `FORBATTRINGSIDEER.md` med idélista för framtida vidareutveckling (delning/synk, snabbsök, statuskontroll, fler CMS:er, datarobusthet, anteckningar, UI-polish, kodkvalitet).
