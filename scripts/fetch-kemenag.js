import path from 'node:path';

import {
  expectedVerseKey,
  expectedVerseKeysForRange,
  surahAyahCounts,
  totalAyahCount,
} from './quran-metadata.js';
import {
  allAyahsPath,
  byJuzDir,
  ensureDataDirectories,
  manifestPath,
  writeJson,
} from './io.js';

const apiBaseUrl =
  process.env.KEMENAG_API_BASE_URL ?? 'https://web-api.qurankemenag.net';
const requestLimit = Number.parseInt(process.env.KEMENAG_FETCH_LIMIT ?? '50', 10);
const startSurah = Number.parseInt(process.env.KEMENAG_SURAH_START ?? '1', 10);
const endSurah = Number.parseInt(process.env.KEMENAG_SURAH_END ?? '114', 10);

const browserHeaders = {
  accept: 'application/json, text/plain, */*',
  origin: 'https://quran.kemenag.go.id',
  referer: 'https://quran.kemenag.go.id/',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

function assertFetchConfig() {
  if (!Number.isInteger(requestLimit) || requestLimit < 1) {
    throw new Error('KEMENAG_FETCH_LIMIT must be a positive integer.');
  }

  if (
    !Number.isInteger(startSurah) ||
    !Number.isInteger(endSurah) ||
    startSurah < 1 ||
    endSurah > 114 ||
    startSurah > endSurah
  ) {
    throw new Error('Surah range must be inside 1 to 114.');
  }
}

function verseKeyFromKemenagAyah(ayah) {
  return expectedVerseKey(ayah.surah_id, ayah.ayah);
}

function sortAyahsForCanonicalRead(a, b) {
  return a.juz - b.juz || a.page - b.page || a.surah_id - b.surah_id || a.ayah - b.ayah;
}

function groupByJuz(ayahs) {
  const groups = new Map();

  for (const ayah of ayahs) {
    if (!groups.has(ayah.juz)) {
      groups.set(ayah.juz, []);
    }

    groups.get(ayah.juz).push(ayah);
  }

  return groups;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: browserHeaders });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Request failed with HTTP ${response.status}: ${responseText.slice(0, 300)}`,
    );
  }

  return JSON.parse(responseText);
}

async function fetchSurah(surah) {
  const expectedCount = surahAyahCounts[surah - 1];
  const ayahs = [];
  let start = 0;

  while (ayahs.length < expectedCount) {
    const remaining = expectedCount - ayahs.length;
    const limit = Math.min(requestLimit, remaining);
    const url = new URL('/quran-ayah', apiBaseUrl);
    url.searchParams.set('start', String(start));
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('surah', String(surah));

    const payload = await fetchJson(url);
    const batch = Array.isArray(payload.data) ? payload.data : [];

    if (batch.length === 0) {
      throw new Error(`Kemenag API returned no data for surah ${surah} at start ${start}.`);
    }

    ayahs.push(...batch);
    start += batch.length;
  }

  if (ayahs.length !== expectedCount) {
    throw new Error(
      `Surah ${surah} expected ${expectedCount} ayahs, received ${ayahs.length}.`,
    );
  }

  return ayahs;
}

function buildCompletenessReport(ayahs) {
  const expectedKeys = expectedVerseKeysForRange(startSurah, endSurah);
  const actualKeys = ayahs.map(verseKeyFromKemenagAyah);
  const actualKeySet = new Set(actualKeys);
  const duplicateKeys = actualKeys.filter((key, index) => actualKeys.indexOf(key) !== index);
  const missingKeys = expectedKeys.filter((key) => !actualKeySet.has(key));
  const extraKeys = actualKeys.filter((key) => !expectedKeys.includes(key));

  return {
    expectedCount: expectedKeys.length,
    actualCount: actualKeys.length,
    missingKeys,
    duplicateKeys: [...new Set(duplicateKeys)],
    extraKeys,
    isComplete:
      missingKeys.length === 0 && duplicateKeys.length === 0 && extraKeys.length === 0,
  };
}

async function writeOutputs(ayahs, completeness) {
  const generatedAt = new Date().toISOString();
  const sortedAyahs = [...ayahs].sort(sortAyahsForCanonicalRead);
  const juzGroups = groupByJuz(sortedAyahs);

  await writeJson(allAyahsPath, {
    meta: {
      source: `${apiBaseUrl}/quran-ayah`,
      generatedAt,
      requestedSurahStart: startSurah,
      requestedSurahEnd: endSurah,
      totalAyahCount,
      savedAyahCount: sortedAyahs.length,
      sortOrder: 'juz, page, surah_id, ayah',
      note: 'The data array stores every raw ayah object returned by API Qur’an Kemenag.',
    },
    data: sortedAyahs,
  });

  for (let juz = 1; juz <= 30; juz += 1) {
    const juzAyahs = juzGroups.get(juz) ?? [];
    const fileName = `juz-${String(juz).padStart(2, '0')}.json`;

    await writeJson(path.join(byJuzDir, fileName), {
      meta: {
        source: `${apiBaseUrl}/quran-ayah`,
        generatedAt,
        juz,
        ayahCount: juzAyahs.length,
        sortOrder: 'juz, page, surah_id, ayah',
      },
      data: juzAyahs,
    });
  }

  await writeJson(manifestPath, {
    generatedAt,
    apiBaseUrl,
    requestLimit,
    requestedSurahStart: startSurah,
    requestedSurahEnd: endSurah,
    completeness,
    outputs: {
      allAyahs: path.relative(process.cwd(), allAyahsPath),
      byJuz: path.relative(process.cwd(), byJuzDir),
    },
  });
}

async function main() {
  assertFetchConfig();
  await ensureDataDirectories();

  const ayahs = [];

  for (let surah = startSurah; surah <= endSurah; surah += 1) {
    const surahAyahs = await fetchSurah(surah);
    ayahs.push(...surahAyahs);
    console.log(`Fetched surah ${surah}: ${surahAyahs.length} ayahs`);
  }

  const completeness = buildCompletenessReport(ayahs);

  if (!completeness.isComplete) {
    await writeOutputs(ayahs, completeness);
    throw new Error('Fetched data is incomplete. See data/manifest.json.');
  }

  await writeOutputs(ayahs, completeness);
  console.log(`Saved ${ayahs.length} ayahs to ${path.relative(process.cwd(), allAyahsPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
