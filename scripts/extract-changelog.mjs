#!/usr/bin/env node
/**
 * Extract the CHANGELOG section for a version.
 * Usage: node scripts/extract-changelog.mjs 0.1.24
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const version = process.argv[2];
if (!version) {
  process.stderr.write('Usage: node scripts/extract-changelog.mjs <version>\n');
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const escaped = version.replace(/\./g, '\\.');
const headerRe = new RegExp(`## \\[${escaped}\\][^\\n\\r]*`);
const sectionRe = new RegExp(
  `## \\[${escaped}\\][^\\n\\r]*\\r?\\n([\\s\\S]*?)(?:\\r?\\n---\\s*\\r?\\n|$)`,
);

const header = changelog.match(headerRe)?.[0];
const body = changelog.match(sectionRe)?.[1]?.trim();

if (header && body) {
  process.stdout.write(`${header}\n\n${body}\n`);
} else {
  process.stdout.write(`Chalk extension release ${version}.\n`);
}
