# Changelog

## Ej incheckat – Kunder och länkar från Hub (branch `wip/api-based-customers`)

**Obs – breaking change: rekommenderas som `release:major` (3.0.0).** Kunderna hämtas nu från Sublime Hub och kan inte längre läggas till, ändras eller tas bort lokalt. Alla tidigare lokala kunder och domäner rensas en gång vid uppdateringen (ny kula, ingen migrering). Egna domäner som lagts in tidigare försvinner alltså och måste läggas in igen som egna URL:er på respektive kund.

**Hämtning från Hub (`shared/hub.js`, ny fil)**
- `GET <hub>/api/v1/browser-links` med `credentials: 'include'` – använder medarbetarens vanliga Hub-inloggning (cookien `__Host-SublimeHub`). Status sparas som `ok`, `needsLogin` (401 eller omdirigering till inloggning), `forbidden` (403, saknar rollen Hub.Reader), `offline` eller `error`. Vid fel används den senast sparade listan.
- Adress: `https://hub.sublime.se`, utom när tillägget körs lokalt (installerat som "unpacked"): då används `https://hub.dev.sublime.se`, eller en egen adress om en sådan sparats under Inställningar (t.ex. Aspire-adressen på localhost). Dev-adressen är en valfri behörighet; popupen visar en "Tillåt"-knapp första gången.
- Service workern hämtar vid installation/start och var 30:e minut (`chrome.alarms`); popupen hämtar också när den öppnas.
- `manifest.json`: nya behörigheter `alarms` och `host_permissions` för `https://hub.sublime.se/*`, samt `optional_host_permissions` för hub.dev.sublime.se och localhost. **Chrome ber användarna godkänna den nya behörigheten vid uppdatering.**

**Datamodell (`shared/storage.js`, omskriven)**
- Hubbens kunder cachas i `chrome.storage.local` och identifieras med `code`. Varje kund har `applications[]` (sajter) med egen `slug` (unikt id), `name`, `cms`, länkar och `domains[]`. Länkar som saknas på applikationen ärvs från kunden. En äldre post med `domains` direkt på kunden tolkas som en enda applikation. Poster utan `code`/`name`, och applikationer utan `slug`, hoppas över.
- Egna URL:er (en post `urls_<slug>` per applikation) och favoriter (i ordning) ligger kvar i `chrome.storage.sync`. `getCustomers()` slår ihop lagren; varje domän har `source: 'hub' | 'local'`.
- Borttaget: egna kunder, `saveCustomers`, `clearAllCustomers`, migreringen från den gamla lokala nyckeln.
- Ny `shared/colors.js` med färgpaletten; Hub och exportfiler anger färg som siffra 1–8.

**Popup**
- Hubbens kunder och domäner är skrivskyddade (lås). På varje applikation går det att lägga till, ändra, sortera och ta bort egna URL:er. Hemvyn visar den applikation vars domän matchar fliken, med dess miljöer; kundlistan och detaljvyn grupperar per applikation, och sökningen träffar både kund- och applikationsnamn. "Lägg till kund", "Ta bort kund" och redigering av namn/CMS/Azure/Storybook är borttagna.
- Statusbanner: "Logga in i Hub" vid 401, behörighetsmeddelande vid 403, och "Visar sparad lista" vid offline.
- Nya länkar från Hub: ClickUp och Figma (utvecklarläge, som Azure/Storybook) samt impersonate (knapp per miljö; en sökväg som börjar med `/` läggs på miljön man står i).
- Egna URL:er kan sorteras fritt bland Hubs låsta domäner (dra i handtaget; Hubs rader går att flytta men inte ändra eller ta bort). Ordningen sparas per applikation (`order_<slug>` i `chrome.storage.sync`) och gäller överallt: hemvyn, listan och omnibox. Nya domäner från Hub hamnar sist.
- Applikationsrubriker är nu band med blågrå bakgrund och accentkant (nya färgvariabler `--color-app-*`, med ljust och mörkt tema), och en tunn linje längst ner på varje applikation, så att det syns tydligt var en ny börjar i både listan och detaljvyn.
- Sidopanelen följer med aktiv flik: den uppdateras när man byter flik eller navigerar (`tabs.onActivated`/`onUpdated`), och hittar aktiv flik via senast fokuserade fönstret i stället för "nuvarande fönster", som inte fungerar som i en popup.
- Onboarding: steg 2 är nu "Logga in i Hub".
- Export exporterar bara egna URL:er. Import läser antingen en sådan export, eller en Hub-fil som låst reservlista som används tills Hub kan nås igen.
- Omnibox-id är nu `<code>|<slug>|<domän-id>`, och sökningen träffar både kund- och applikationsnamn.

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
