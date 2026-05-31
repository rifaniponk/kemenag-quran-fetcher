import { expectedVerseKeysForRange } from '../quran-metadata.js';
import {
  buildSurahReports,
  findDuplicateKeys,
  truncateIssues,
  verseKeyFromAyah,
} from './shared.js';
import {
  compareJuzFilesTextAgainstQuranCom,
  compareLocalAyahsTextAgainstQuranCom,
} from './quran-com-text.js';

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

function compareMetadata(localAyahs, quranComVersesByKey) {
  const metadataMismatches = [];

  for (const ayah of localAyahs) {
    const verseKey = verseKeyFromAyah(ayah);
    const reference = quranComVersesByKey.get(verseKey);

    if (!reference) {
      continue;
    }

    const metadataChecks = [
      ['page', reference.page_number],
      ['manzil', reference.manzil_number],
    ];

    for (const [field, expectedValue] of metadataChecks) {
      if (ayah[field] !== expectedValue) {
        metadataMismatches.push({
          verseKey,
          field,
          local: ayah[field],
          quranCom: expectedValue,
        });
      }
    }
  }

  return metadataMismatches;
}

export async function compareAgainstQuranCom({
  localAyahs,
  quranComVersesByKey,
  startSurah,
  endSurah,
  deep = false,
}) {
  const localKeys = localAyahs.map(verseKeyFromAyah);
  const quranComKeys = [...quranComVersesByKey.keys()];
  const expectedKeys = expectedVerseKeysForRange(startSurah, endSurah);
  const keys = compareKeys(localKeys, quranComKeys, expectedKeys);

  let textMismatches = [];
  let metadataMismatches = [];
  let textCheckedCount = 0;
  let textSkippedCount = 0;
  let localTextComparison = null;
  let juzTextComparison = null;

  if (deep) {
    localTextComparison = compareLocalAyahsTextAgainstQuranCom(
      localAyahs,
      quranComVersesByKey,
    );
    juzTextComparison = await compareJuzFilesTextAgainstQuranCom(
      quranComVersesByKey,
    );

    textMismatches = [
      ...localTextComparison.textMismatches,
      ...juzTextComparison.textMismatches,
    ];
    metadataMismatches = compareMetadata(localAyahs, quranComVersesByKey);
    textCheckedCount =
      localTextComparison.textCheckedCount + juzTextComparison.textCheckedCount;
    textSkippedCount =
      localTextComparison.textSkippedCount + juzTextComparison.textSkippedCount;
  }

  const surahReports = buildSurahReports({
    startSurah,
    endSurah,
    localKeys,
    quranComKeys,
    expectedKeys,
    textMismatches: localTextComparison?.textMismatches ?? [],
    metadataMismatches,
  });

  const keysPass =
    keys.localMissingFromQuranCom.length === 0 &&
    keys.localExtraAgainstQuranCom.length === 0 &&
    keys.localMissingFromStaticExpected.length === 0 &&
    keys.localExtraAgainstStaticExpected.length === 0 &&
    keys.localDuplicateKeys.length === 0 &&
    keys.quranComDuplicateKeys.length === 0;

  const deepPass =
    !deep ||
    (textMismatches.length === 0 && metadataMismatches.length === 0);

  return {
    pass: keysPass && deepPass,
    keys: {
      pass: keysPass,
      ...keys,
      surahReports,
    },
    deep: deep
      ? {
          pass: deepPass,
          textCheckedCount,
          textSkippedCount,
          textMismatchCount: textMismatches.length,
          metadataMismatchCount: metadataMismatches.length,
          textMismatches: truncateIssues(textMismatches),
          metadataMismatches: truncateIssues(metadataMismatches),
          allAyahsText: localTextComparison
            ? {
                pass: localTextComparison.textMismatches.length === 0,
                textCheckedCount: localTextComparison.textCheckedCount,
                textSkippedCount: localTextComparison.textSkippedCount,
                textMismatchCount: localTextComparison.textMismatches.length,
                textMismatches: truncateIssues(localTextComparison.textMismatches),
              }
            : null,
          juzText: juzTextComparison
            ? {
                pass: juzTextComparison.textMismatches.length === 0,
                textCheckedCount: juzTextComparison.textCheckedCount,
                textSkippedCount: juzTextComparison.textSkippedCount,
                textMismatchCount: juzTextComparison.textMismatches.length,
                textMismatches: truncateIssues(juzTextComparison.textMismatches),
              }
            : null,
        }
      : null,
  };
}
