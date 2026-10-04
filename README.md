# SublimeHelpTool

Kunder, miljöer och länkar hämtas från Sublime Hub (`/api/v1/browser-links`) med medarbetarens vanliga Hub-inloggning. Hubbens data är skrivskyddad i pluginet; användaren kan lägga till egna URL:er på kunderna.

- Inte inloggad: popupen visar "Logga in i Hub" och den senast sparade listan.
- Lokal körning (laddat som "unpacked"): använder hub.dev.sublime.se. Klicka på "Tillåt" i popupen första gången. Under Inställningar kan du i stället ange en egen adress, t.ex. Aspire-adressen på localhost.
- Reserv: en Hub-fil ("JSON för webbläsarpluginer") kan importeras under Inställningar och används tills Hub går att nå.

## Utveckling

```bash
npm install
npm run lint          # ESLint
npm run build          # Paketerar dist/sublime-help-tool-vX.Y.Z.zip med nuvarande version
npm run release:patch  # Bumpar patch-version i manifest.json och paketerar
npm run release:minor  # Bumpar minor-version
npm run release:major  # Bumpar major-version
```

## Så gör du en ny release (steg för steg)

1. Öppna en terminal i projektmappen.
2. Bestäm vilken typ av ändring du gjort:
   - Bara en liten fix/bugg → `npm run release:patch`
   - En ny funktion (inget som kan gå sönder) → `npm run release:minor`
   - En stor ändring som kan göra att gamla saker slutar fungera → `npm run release:major`

   Osäker? Kör `release:patch` — det är vanligast.

3. Kommandot höjer automatiskt versionsnumret i `manifest.json` (t.ex. `2.1.0` → `2.1.1`) och skapar en färdig zip-fil i `dist/`, t.ex. `dist/sublime-help-tool-v2.1.1.zip`.
4. Kolla att det blev rätt:
   ```bash
   git status
   ```
   Du bör se att `manifest.json` har ändrats.
5. Committa versionshöjningen:
   ```bash
   git add manifest.json
   git commit -m "Bump version to X.Y.Z"
   ```
6. Ladda upp zip-filen från `dist/` dit tillägget ska publiceras (t.ex. Chrome Web Store).
