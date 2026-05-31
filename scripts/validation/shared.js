import { expectedVerseKey } from '../quran-metadata.js';

export function verseKeyFromAyah(ayah) {
  return expectedVerseKey(ayah.surah_id, ayah.ayah);
}

export function findDuplicateKeys(keys) {
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

export function truncateIssues(issues, limit = 50) {
  if (issues.length <= limit) {
    return { items: issues, total: issues.length, truncated: false };
  }

  return {
    items: issues.slice(0, limit),
    total: issues.length,
    truncated: true,
  };
}

export function groupKeysBySurah(keys) {
  const groups = new Map();

  for (const key of keys) {
    const surah = Number.parseInt(key.split(':')[0], 10);

    if (!groups.has(surah)) {
      groups.set(surah, []);
    }

    groups.get(surah).push(key);
  }

  return groups;
}

export function buildSurahReports({
  startSurah,
  endSurah,
  localKeys,
  quranComKeys,
  expectedKeys,
  textMismatches = [],
  metadataMismatches = [],
}) {
  const localBySurah = groupKeysBySurah(localKeys);
  const quranComBySurah = groupKeysBySurah(quranComKeys);
  const expectedBySurah = groupKeysBySurah(expectedKeys);
  const textBySurah = groupKeysBySurah(textMismatches.map((item) => item.verseKey));
  const metadataBySurah = groupKeysBySurah(
    metadataMismatches.map((item) => item.verseKey),
  );
  const reports = {};

  for (let surah = startSurah; surah <= endSurah; surah += 1) {
    const localSet = new Set(localBySurah.get(surah) ?? []);
    const quranComSet = new Set(quranComBySurah.get(surah) ?? []);
    const expectedSet = new Set(expectedBySurah.get(surah) ?? []);
    const missingFromQuranCom = [...quranComSet].filter((key) => !localSet.has(key));
    const extraAgainstQuranCom = [...localSet].filter((key) => !quranComSet.has(key));
    const missingFromExpected = [...expectedSet].filter((key) => !localSet.has(key));
    const extraAgainstExpected = [...localSet].filter((key) => !expectedSet.has(key));
    const pass =
      missingFromQuranCom.length === 0 &&
      extraAgainstQuranCom.length === 0 &&
      missingFromExpected.length === 0 &&
      extraAgainstExpected.length === 0 &&
      (textBySurah.get(surah)?.length ?? 0) === 0 &&
      (metadataBySurah.get(surah)?.length ?? 0) === 0;

    reports[surah] = {
      pass,
      expected: expectedSet.size,
      local: localSet.size,
      quranCom: quranComSet.size,
      missingFromQuranCom,
      extraAgainstQuranCom,
      missingFromExpected,
      extraAgainstExpected,
      textMismatchCount: textBySurah.get(surah)?.length ?? 0,
      metadataMismatchCount: metadataBySurah.get(surah)?.length ?? 0,
    };
  }

  return reports;
}
