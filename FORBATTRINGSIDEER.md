# Förbättringsidéer – Sublime help tool

Lista över möjlig vidareutveckling av tillägget. Inget av detta är påbörjat – ren idélista för framtida prioritering.

## Delning & synk mellan kollegor

- Auto-sync från en delad källa (t.ex. hämta en JSON-fil från ett internt repo/SharePoint med jämna mellanrum) istället för manuell export/import.

## Navigering & snabbhet

- Snabbsök/"command palette" över alla kunder+domäner, inte bara den som matchar aktuell flik.
- Tangentbordsgenvägar (`chrome.commands`) för att byta miljö utan att öppna popupen.
- "Öppna alla miljöer i flikar" för en kund – jämföra dev/test/stage/prod sida vid sida.
- Högerklicks-kontextmeny: "Öppna denna sida på [annan miljö]".

## Statuskontroll av miljöer

- Bakgrundskontroll som periodiskt pingar alla domäner (idag körs det bara när popupen öppnas), t.ex. färga badge rött om prod ligger nere.
- Visa svarstid/statuskod i tooltip, inte bara ok/ej ok.
- Känd begränsning: `no-cors`-fallbacket i `isReachable` (popup/popup.js) ger alltid "reachable" för ogenomskinliga svar → kan ge falska positiva.

## CMS & inloggning

- Stöd för fler CMS (Sitecore, WordPress, Contentful …) utöver Umbraco/Optimizely.
- Bevara path vid inloggningslänk (matcha nuvarande sida) istället för alltid samma login-path.

## Datarobusthet

- Automatisk backup/export med jämna mellanrum som skydd mot att `storage.local` rensas.
- Ångra-funktion för borttagen kund/domän (idag permanent direkt).
- Varning vid dubbletter när en domän som redan finns hos annan kund läggs till.

## Anteckningar & metadata

- Fritextfält per kund (kontaktperson, kända quirks, var inloggningsuppgifter finns).
- Taggar/kategorier utöver CMS-typ (bransch, ansvarig konsult).

## UI-polish

- Smart favorisering baserat på klickfrekvens, som komplement till manuell stjärnmarkering.

## Kodkvalitet/underhåll

- Enhetstester (t.ex. jsdom) för URL-matchning/sanering (`getHostname`, `buildEquivalentUrl`, `sanitizeUrl`).
