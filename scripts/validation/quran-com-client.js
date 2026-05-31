import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { quranComCacheDir } from '../io.js';
import { surahAyahCounts } from '../quran-metadata.js';

export function getQuranComBaseUrl() {
  return process.env.QURAN_COM_API_BASE_URL ?? 'https://api.quran.com/api/v4';
}

function cachePathForSurah(surah) {
  return path.join(quranComCacheDir, `surah-${String(surah).padStart(3, '0')}.json`);
}

async function readCache(surah) {
  try {
    const content = await readFile(cachePathForSurah(surah), 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function writeCache(surah, payload) {
  await mkdir(quranComCacheDir, { recursive: true });
  await writeFile(cachePathForSurah(surah), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function fetchSurahVersesFromApi(surah, baseUrl) {
  const ayahCount = surahAyahCounts[surah - 1];
  const url = new URL('/api/v4/verses/by_chapter/' + surah, baseUrl);
  url.searchParams.set('per_page', String(ayahCount));
  url.searchParams.set('fields', 'text_uthmani,text_uthmani_simple');

  const response = await fetch(url);
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Quran.com request failed with HTTP ${response.status}: ${responseText.slice(0, 300)}`,
    );
  }

  const payload = JSON.parse(responseText);
  const verses = Array.isArray(payload.verses) ? payload.verses : [];

  if (verses.length !== ayahCount) {
    throw new Error(
      `Quran.com surah ${surah} returned ${verses.length} verses, expected ${ayahCount}.`,
    );
  }

  return verses;
}

export async function fetchQuranComSurahVerses(surah, { useCache = true } = {}) {
  if (useCache) {
    const cached = await readCache(surah);

    if (cached?.verses?.length === surahAyahCounts[surah - 1]) {
      const hasSimpleText = cached.verses.every(
        (verse) => typeof verse.text_uthmani_simple === 'string',
      );

      if (hasSimpleText) {
        return cached.verses;
      }
    }
  }

  const baseUrl = getQuranComBaseUrl();
  const verses = await fetchSurahVersesFromApi(surah, baseUrl);
  await writeCache(surah, {
    fetchedAt: new Date().toISOString(),
    baseUrl,
    surah,
    verses,
  });

  return verses;
}

export async function fetchQuranComVersesForRange(startSurah, endSurah, options = {}) {
  const versesByKey = new Map();

  for (let surah = startSurah; surah <= endSurah; surah += 1) {
    const verses = await fetchQuranComSurahVerses(surah, options);

    for (const verse of verses) {
      versesByKey.set(verse.verse_key, verse);
    }

    console.log(`Loaded Quran.com surah ${surah}: ${verses.length} verses`);
  }

  return versesByKey;
}

export async function fetchQuranComVerseKeys(startSurah, endSurah, options = {}) {
  const versesByKey = await fetchQuranComVersesForRange(startSurah, endSurah, options);
  return [...versesByKey.keys()];
}
