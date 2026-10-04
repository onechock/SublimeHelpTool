# Integritetspolicy – Sublime help tool

_Senast uppdaterad: 2026-10-04_

## Sammanfattning

Sublime help tool samlar inte in personuppgifter och delar inte några uppgifter med externa parter. Tillägget hämtar kundlistan från Sublimes interna system Sublime Hub med användarens egen Hub-inloggning.

## Data som lagras

- **Kundlistan från Hub** (kunder, miljöer och länkar) sparas lokalt i webbläsaren via `chrome.storage.local` så att den kan visas offline.
- **Egna URL:er och favoriter** som användaren lägger in sparas via `chrome.storage.sync`. Om användaren är inloggad i Chrome med synk påslaget synkas de av Chrome mellan användarens egna enheter; annars stannar de på enheten.

Tillägget lagrar inga lösenord eller inloggningsuppgifter.

## Nätverksanrop

Tillägget anropar Sublime Hub (hub.sublime.se) för att hämta kundlistan. Anropet skickar med användarens befintliga Hub-session (cookie) men tillägget läser eller sparar inte cookien. Ingen data från användaren skickas till Hub utöver detta anrop.

Tillägget gör dessutom HTTP-anrop mot URL:er som användaren själv har konfigurerat, i syfte att kontrollera om en miljö är tillgänglig (tillgänglighetstest). Inga svar från dessa anrop sparas, analyseras eller vidarebefordras.

## Spårning och analys

Tillägget använder ingen form av spårning, analys eller telemetri.

## Kontakt

Frågor om denna integritetspolicy kan riktas till [sublime.se](https://www.sublime.se).
