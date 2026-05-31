import { expectedVerseKeysForRange } from './quran-metadata.js';
import {
  allAyahsPath,
  readJson,
  validationReportPath,
  writeJson,
} from './io.js';

const quranComBaseUrl =
  process.env.QURAN_COM_API_BASE_URL ?? 'https://api.quran.com/api/v4';

function verseKeyFromKemenagAyah(ayah) {
  return `${ayah.surah_id}:${ayah.ayah}`;
}

function getRequestedRange(localPayload) {
  return {
    startSurah: localPayload.meta?.requestedSurahStart ?? 1,
    endSurah: localPayload.meta?.requestedSurahEnd ?? 114,
  };
}

function findDuplicateKeys(keys) {
  const seen = new Set();
  const duplicates = new Set();

  for (const key of keys) {
    if (seen.has(key)) {
      duplicates.add(key);
    }

    seen.add(key);
  }

  return [...duplicates];
}

async function fetchQuranComVerseKeysForSurah(surah) {
  const url = new URL('/api/v4/quran/verses/uthmani', quranComBaseUrl);
  url.searchParams.set('chapter_number', String(surah));

  const response = await fetch(url);
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Quran.com request failed with HTTP ${response.status}: ${responseText.slice(0, 300)}`,
    );
  }

  const payload = JSON.parse(responseText);
  const verses = Array.isArray(payload.verses) ? payload.verses : [];

  return verses.map((verse) => verse.verse_key);
}

async function fetchQuranComVerseKeys(startSurah, endSurah) {
  const keys = [];

  for (let surah = startSurah; surah <= endSurah; surah += 1) {
    const surahKeys = await fetchQuranComVerseKeysForSurah(surah);
    keys.push(...surahKeys);
    console.log(`Loaded Quran.com surah ${surah}: ${surahKeys.length} keys`);
  }

  return keys;
}

function compareKeys(localKeys, quranComKeys, expectedKeys) {
  const localSet = new Set(localKeys);
  const quranComSet = new Set(quranComKeys);
  const expectedSet = new Set(expectedKeys);

  return {
    counts: {
      local: localKeys.length,
      quranCom: quranComKeys.length,
      expected: expectedKeys.length,
    },
    localMissingFromQuranCom: quranComKeys.filter((key) => !localSet.has(key)),
    localExtraAgainstQuranCom: localKeys.filter((key) => !quranComSet.has(key)),
    localMissingFromStaticExpected: expectedKeys.filter((key) => !localSet.has(key)),
    localExtraAgainstStaticExpected: localKeys.filter((key) => !expectedSet.has(key)),
    localDuplicateKeys: findDuplicateKeys(localKeys),
    quranComDuplicateKeys: findDuplicateKeys(quranComKeys),
  };
}

function isReportPassing(report) {
  return (
    report.localMissingFromQuranCom.length === 0 &&
    report.localExtraAgainstQuranCom.length === 0 &&
    report.localMissingFromStaticExpected.length === 0 &&
    report.localExtraAgainstStaticExpected.length === 0 &&
    report.localDuplicateKeys.length === 0 &&
    report.quranComDuplicateKeys.length === 0
  );
}

async function main() {
  const localPayload = await readJson(allAyahsPath);
  const localData = Array.isArray(localPayload.data) ? localPayload.data : [];
  const { startSurah, endSurah } = getRequestedRange(localPayload);
  const localKeys = localData.map(verseKeyFromKemenagAyah);
  const quranComKeys = await fetchQuranComVerseKeys(startSurah, endSurah);
  const expectedKeys = expectedVerseKeysForRange(startSurah, endSurah);
  const comparison = compareKeys(localKeys, quranComKeys, expectedKeys);
  const pass = isReportPassing(comparison);

  const report = {
    generatedAt: new Date().toISOString(),
    quranComBaseUrl,
    localFile: allAyahsPath,
    requestedSurahStart: startSurah,
    requestedSurahEnd: endSurah,
    pass,
    comparison,
  };

  await writeJson(validationReportPath, report);

  if (!pass) {
    console.error(`Validation failed. See ${validationReportPath}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Validation passed. See ${validationReportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
