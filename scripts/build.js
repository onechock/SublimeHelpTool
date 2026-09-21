// scripts/build.js – bumpar manifest.json-version (valfritt) och paketerar
// tillägget som en .zip i dist/, redo för uppladdning till Chrome Web Store.
//
// Användning:
//   node scripts/build.js                 -> bygger zip med nuvarande version
//   node scripts/build.js --bump=patch    -> 2.1.0 -> 2.1.1, bygger zip
//   node scripts/build.js --bump=minor    -> 2.1.0 -> 2.2.0, bygger zip
//   node scripts/build.js --bump=major    -> 2.1.0 -> 3.0.0, bygger zip

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(rootDir, 'manifest.json');
const distDir = path.join(rootDir, 'dist');

// Filer/mappar som ska ingå i den paketerade extensionen.
const INCLUDE = ['manifest.json', 'background', 'content', 'icons', 'popup', 'shared'];

function parseArgs(argv) {
  const args = { bump: null };
  for (const arg of argv) {
    const match = arg.match(/^--bump=(patch|minor|major)$/);
    if (match) args.bump = match[1];
  }
  return args;
}

function bumpVersion(version, level) {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    throw new Error(`Kan inte tolka version "${version}" (förväntar semver x.y.z)`);
  }
  const [major, minor, patch] = parts;
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function updateManifestVersion(newVersion) {
  const raw = readFileSync(manifestPath, 'utf8');
  const versionLine = /("version"\s*:\s*")[^"]*(")/;
  if (!versionLine.test(raw)) {
    throw new Error('Hittar ingen "version"-nyckel i manifest.json');
  }
  // Riktad textersättning istället för JSON.stringify, så att befintlig
  // formattering (blankrader, indrag) i manifest.json bevaras.
  writeFileSync(manifestPath, raw.replace(versionLine, `$1${newVersion}$2`));
}

function buildZip(version) {
  if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });

  const zipPath = path.join(distDir, `sublime-help-tool-v${version}.zip`);
  const output = createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => resolve(zipPath));
    archive.on('warning', (err) => reject(err));
    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    for (const entry of INCLUDE) {
      const fullPath = path.join(rootDir, entry);
      if (!existsSync(fullPath)) continue;
      if (entry === 'manifest.json') {
        archive.file(fullPath, { name: entry });
      } else {
        archive.directory(fullPath, entry);
      }
    }
    archive.finalize();
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const version = args.bump ? bumpVersion(manifest.version, args.bump) : manifest.version;

  if (args.bump) {
    updateManifestVersion(version);
    console.log(`Version uppdaterad: ${manifest.version} -> ${version}`);
  }

  const zipPath = await buildZip(version);
  console.log(`Paketerad: ${path.relative(rootDir, zipPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
