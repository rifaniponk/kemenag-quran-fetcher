import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const projectRoot = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
);

export const dataDir = path.join(projectRoot, 'data');
export const byJuzDir = path.join(dataDir, 'by-juz');
export const allAyahsPath = path.join(dataDir, 'all-ayahs.json');
export const manifestPath = path.join(dataDir, 'manifest.json');
export const validationReportPath = path.join(dataDir, 'validation-report.json');

export async function ensureDataDirectories() {
  await mkdir(byJuzDir, { recursive: true });
}

export async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function readJson(filePath) {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content);
}
