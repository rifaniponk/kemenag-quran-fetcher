import path from 'node:path';

import { byJuzDir, manifestPath, readJson } from '../io.js';
import { juzMetadata } from '../quran-metadata.js';
import { findDuplicateKeys, truncateIssues, verseKeyFromAyah } from './shared.js';

async function readJuzFile(juz) {
  const fileName = `juz-${String(juz).padStart(2, '0')}.json`;
  return readJson(path.join(byJuzDir, fileName));
}

function validateJuzFileDuplicates(juz, juzAyahs) {
  const keys = juzAyahs.map(verseKeyFromAyah);

  return {
    juz,
    ayahCount: juzAyahs.length,
    duplicateKeys: findDuplicateKeys(keys),
  };
}

const CROSS_FILE_AYAH_FIELDS = [
  'id',
  'surah_id',
  'ayah',
  'page',
  'quarter_hizb',
  'juz',
  'manzil',
  'arabic',
  'kitabah',
  'latin',
  'translation',
];

function buildAyahsByKey(ayahs) {
  const byKey = new Map();

  for (const ayah of ayahs) {
    byKey.set(verseKeyFromAyah(ayah), ayah);
  }

  return byKey;
}

function compareAyahPayload(localAyah, referenceAyah) {
  const verseKey = verseKeyFromAyah(localAyah);
  const mismatchedFields = [];

  for (const field of CROSS_FILE_AYAH_FIELDS) {
    if (localAyah[field] !== referenceAyah[field]) {
      mismatchedFields.push(field);
    }
  }

  if (localAyah.surah?.id !== referenceAyah.surah?.id) {
    mismatchedFields.push('surah.id');
  }

  if (mismatchedFields.length === 0) {
    return null;
  }

  return {
    type: 'juzPayloadMismatch',
    verseKey,
    juz: localAyah.juz,
    fields: mismatchedFields,
  };
}

export async function validateCrossFileConsistency(allAyahs, manifest) {
  const issues = [];
  const juzComparisons = [];
  const allAyahsByKey = buildAyahsByKey(allAyahs);
  const allKeys = allAyahs.map(verseKeyFromAyah);
  const allKeySet = new Set(allKeys);
  const juzUnionKeys = new Set();

  for (let juz = 1; juz <= 30; juz += 1) {
    const juzPayload = await readJuzFile(juz);
    const juzAyahs = Array.isArray(juzPayload.data) ? juzPayload.data : [];
    const metaCount = juzPayload.meta?.ayahCount ?? null;

    if (metaCount !== juzAyahs.length) {
      issues.push({
        type: 'juzMetaCountMismatch',
        juz,
        metaCount,
        actualCount: juzAyahs.length,
      });
    }

    for (const ayah of juzAyahs) {
      const key = verseKeyFromAyah(ayah);

      if (juzUnionKeys.has(key)) {
        issues.push({ type: 'duplicateInJuzUnion', verseKey: key, juz });
      }

      juzUnionKeys.add(key);

      if (ayah.juz !== juz) {
        issues.push({
          type: 'juzFieldMismatch',
          verseKey: key,
          fileJuz: juz,
          ayahJuz: ayah.juz,
        });
      }

      const referenceAyah = allAyahsByKey.get(key);

      if (!referenceAyah) {
        continue;
      }

      const payloadIssue = compareAyahPayload(ayah, referenceAyah);

      if (payloadIssue) {
        issues.push(payloadIssue);
      }
    }

    if (juzAyahs.length > 0) {
      juzComparisons.push(validateJuzFileDuplicates(juz, juzAyahs));
    }
  }

  const missingFromAllAyahs = [...juzUnionKeys].filter((key) => !allKeySet.has(key));
  const missingFromJuzUnion = allKeys.filter((key) => !juzUnionKeys.has(key));

  for (const key of missingFromAllAyahs) {
    issues.push({ type: 'inJuzButMissingFromAllAyahs', verseKey: key });
  }

  for (const key of missingFromJuzUnion) {
    issues.push({ type: 'inAllAyahsButMissingFromJuzUnion', verseKey: key });
  }

  if (manifest?.completeness) {
    const manifestExpected = manifest.completeness.expectedCount;
    const manifestActual = manifest.completeness.actualCount;

    if (manifestExpected !== allAyahs.length) {
      issues.push({
        type: 'manifestExpectedCountMismatch',
        manifestExpected,
        allAyahsCount: allAyahs.length,
      });
    }

    if (manifestActual !== allAyahs.length) {
      issues.push({
        type: 'manifestActualCountMismatch',
        manifestActual,
        allAyahsCount: allAyahs.length,
      });
    }

    if (manifest.completeness.isComplete !== true && allAyahs.length > 0) {
      issues.push({
        type: 'manifestIncompleteFlag',
        isComplete: manifest.completeness.isComplete,
      });
    }
  }

  return {
    pass: issues.length === 0,
    issueCount: issues.length,
    juzUnionCount: juzUnionKeys.size,
    allAyahsCount: allAyahs.length,
    juzComparisons,
    issues: truncateIssues(issues),
  };
}

export function validateJuzBoundaries(ayahs) {
  const issues = [];
  const ayahsByJuz = new Map();

  for (const ayah of ayahs) {
    if (!ayahsByJuz.has(ayah.juz)) {
      ayahsByJuz.set(ayah.juz, []);
    }

    ayahsByJuz.get(ayah.juz).push(ayah);
  }

  for (const juzInfo of juzMetadata) {
    const juzAyahs = ayahsByJuz.get(juzInfo.juz) ?? [];

    if (juzAyahs.length === 0) {
      continue;
    }

    const sortedKeys = juzAyahs.map(verseKeyFromAyah).sort((a, b) => {
      const [aSurah, aAyah] = a.split(':').map(Number);
      const [bSurah, bAyah] = b.split(':').map(Number);
      return aSurah - bSurah || aAyah - bAyah;
    });

    const firstKey = sortedKeys[0];
    const lastKey = sortedKeys[sortedKeys.length - 1];

    if (juzAyahs.length === juzInfo.verseCount) {
      if (firstKey !== juzInfo.firstVerseKey) {
        issues.push({
          type: 'juzFirstVerseMismatch',
          juz: juzInfo.juz,
          expected: juzInfo.firstVerseKey,
          actual: firstKey,
        });
      }

      if (lastKey !== juzInfo.lastVerseKey) {
        issues.push({
          type: 'juzLastVerseMismatch',
          juz: juzInfo.juz,
          expected: juzInfo.lastVerseKey,
          actual: lastKey,
        });
      }
    }
  }

  return {
    pass: issues.length === 0,
    issueCount: issues.length,
    issues: truncateIssues(issues),
  };
}

export async function loadManifestIfPresent() {
  try {
    return await readJson(manifestPath);
  } catch {
    return null;
  }
}
