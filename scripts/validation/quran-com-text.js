import path from 'node:path';

import { byJuzDir, readJson } from '../io.js';
import {
  arabicTextsEquivalent,
  buildKemenagComparisonText,
} from './normalize-arabic.js';
import { truncateIssues, verseKeyFromAyah } from './shared.js';

async function readJuzFile(juz) {
  const fileName = `juz-${String(juz).padStart(2, '0')}.json`;
  return readJson(path.join(byJuzDir, fileName));
}

function compareAyahTextAgainstQuranCom(ayah, reference, source) {
  const verseKey = verseKeyFromAyah(ayah);
  const localText = buildKemenagComparisonText(ayah);

  if (localText.length === 0) {
    return {
      verseKey,
      source,
      type: 'blankComparisonText',
    };
  }

  if (!reference) {
    return {
      verseKey,
      source,
      type: 'missingQuranComReference',
    };
  }

  const referenceTexts = [reference.text_uthmani, reference.text_uthmani_simple];

  if (arabicTextsEquivalent(localText, referenceTexts)) {
    return null;
  }

  return {
    verseKey,
    source,
    type: 'textMismatch',
    localPreview: localText.slice(0, 80),
    referencePreview: (reference.text_uthmani_simple ?? reference.text_uthmani).slice(
      0,
      80,
    ),
  };
}

function compareAyahListTextAgainstQuranCom(ayahs, quranComVersesByKey, source) {
  const textMismatches = [];
  let textCheckedCount = 0;
  let textSkippedCount = 0;

  for (const ayah of ayahs) {
    const verseKey = verseKeyFromAyah(ayah);
    const reference = quranComVersesByKey.get(verseKey);
    const localText = buildKemenagComparisonText(ayah);

    if (localText.length === 0) {
      textSkippedCount += 1;
      continue;
    }

    textCheckedCount += 1;
    const issue = compareAyahTextAgainstQuranCom(ayah, reference, source);

    if (issue) {
      textMismatches.push(issue);
    }
  }

  return { textMismatches, textCheckedCount, textSkippedCount };
}

export async function compareJuzFilesTextAgainstQuranCom(quranComVersesByKey) {
  const textMismatches = [];
  let textCheckedCount = 0;
  let textSkippedCount = 0;

  for (let juz = 1; juz <= 30; juz += 1) {
    const juzPayload = await readJuzFile(juz);
    const juzAyahs = Array.isArray(juzPayload.data) ? juzPayload.data : [];
    const comparison = compareAyahListTextAgainstQuranCom(
      juzAyahs,
      quranComVersesByKey,
      `by-juz/juz-${String(juz).padStart(2, '0')}.json`,
    );

    textMismatches.push(...comparison.textMismatches);
    textCheckedCount += comparison.textCheckedCount;
    textSkippedCount += comparison.textSkippedCount;
  }

  return {
    pass: textMismatches.length === 0,
    textCheckedCount,
    textSkippedCount,
    textMismatchCount: textMismatches.length,
    textMismatches,
  };
}

export function compareLocalAyahsTextAgainstQuranCom(localAyahs, quranComVersesByKey) {
  return compareAyahListTextAgainstQuranCom(
    localAyahs,
    quranComVersesByKey,
    'all-ayahs.json',
  );
}
