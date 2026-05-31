import { expectedVerseKeysForRange } from '../quran-metadata.js';
import {
  arabicTextsEquivalent,
  buildKemenagComparisonText,
} from './normalize-arabic.js';
import {
  buildSurahReports,
  findDuplicateKeys,
  truncateIssues,
  verseKeyFromAyah,
} from './shared.js';

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

function compareTextAndMetadata(localAyahs, quranComVersesByKey) {
  const textMismatches = [];
  const metadataMismatches = [];

  for (const ayah of localAyahs) {
    const verseKey = verseKeyFromAyah(ayah);
    const reference = quranComVersesByKey.get(verseKey);

    if (!reference) {
      continue;
    }

    const localText = buildKemenagComparisonText(ayah);
    const referenceTexts = [reference.text_uthmani, reference.text_uthmani_simple];

    if (!arabicTextsEquivalent(localText, referenceTexts)) {
      textMismatches.push({
        verseKey,
        localPreview: localText.slice(0, 80),
        referencePreview: (reference.text_uthmani_simple ?? reference.text_uthmani).slice(
          0,
          80,
        ),
      });
    }

    const metadataChecks = [
      ['page', reference.page_number],
      ['juz', reference.juz_number],
      ['quarter_hizb', reference.rub_el_hizb_number],
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

  return { textMismatches, metadataMismatches };
}

export function compareAgainstQuranCom({
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

  if (deep) {
    const deepComparison = compareTextAndMetadata(localAyahs, quranComVersesByKey);
    textMismatches = deepComparison.textMismatches;
    metadataMismatches = deepComparison.metadataMismatches;
  }

  const surahReports = buildSurahReports({
    startSurah,
    endSurah,
    localKeys,
    quranComKeys,
    expectedKeys,
    textMismatches,
    metadataMismatches,
  });

  const keysPass =
    keys.localMissingFromQuranCom.length === 0 &&
    keys.localExtraAgainstQuranCom.length === 0 &&
    keys.localMissingFromStaticExpected.length === 0 &&
    keys.localExtraAgainstStaticExpected.length === 0 &&
    keys.localDuplicateKeys.length === 0 &&
    keys.quranComDuplicateKeys.length === 0;

  const deepPass = !deep || (textMismatches.length === 0 && metadataMismatches.length === 0);

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
          textMismatchCount: textMismatches.length,
          metadataMismatchCount: metadataMismatches.length,
          textMismatches: truncateIssues(textMismatches),
          metadataMismatches: truncateIssues(metadataMismatches),
        }
      : null,
  };
}
