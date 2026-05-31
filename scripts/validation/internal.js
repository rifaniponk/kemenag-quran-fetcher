import {
  expectedVerseKey,
  surahAyahCounts,
  totalAyahCount,
} from '../quran-metadata.js';
import { findDuplicateKeys, truncateIssues, verseKeyFromAyah } from './shared.js';

const REQUIRED_AYAH_FIELDS = [
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
  'arabic_words',
  'surah',
];

const REQUIRED_SURAH_FIELDS = [
  'id',
  'arabic',
  'latin',
  'transliteration',
  'translation',
  'num_ayah',
  'page',
  'location',
];

function sortAyahsForCanonicalRead(a, b) {
  return a.juz - b.juz || a.page - b.page || a.surah_id - b.surah_id || a.ayah - b.ayah;
}

function isBlank(value) {
  return typeof value !== 'string' || value.trim().length === 0;
}

function validateRequiredFields(ayahs) {
  const issues = [];

  for (const ayah of ayahs) {
    const key = verseKeyFromAyah(ayah);

    for (const field of REQUIRED_AYAH_FIELDS) {
      if (!(field in ayah)) {
        issues.push({ verseKey: key, type: 'missingField', field });
      }
    }

    if (!ayah.surah || typeof ayah.surah !== 'object') {
      issues.push({ verseKey: key, type: 'missingSurahObject' });
      continue;
    }

    for (const field of REQUIRED_SURAH_FIELDS) {
      if (!(field in ayah.surah)) {
        issues.push({ verseKey: key, type: 'missingSurahField', field });
      }
    }
  }

  return issues;
}

function validateReferenceConsistency(ayahs) {
  const issues = [];

  for (const ayah of ayahs) {
    const key = verseKeyFromAyah(ayah);

    if (ayah.surah_id !== ayah.surah?.id) {
      issues.push({
        verseKey: key,
        type: 'surahIdMismatch',
        surahId: ayah.surah_id,
        surahObjectId: ayah.surah?.id,
      });
    }

    const expectedCount = surahAyahCounts[ayah.surah_id - 1];

    if (ayah.surah?.num_ayah !== expectedCount) {
      issues.push({
        verseKey: key,
        type: 'surahNumAyahMismatch',
        expected: expectedCount,
        actual: ayah.surah?.num_ayah,
      });
    }

    if (ayah.ayah < 1 || ayah.ayah > expectedCount) {
      issues.push({
        verseKey: key,
        type: 'ayahOutOfRange',
        expectedMax: expectedCount,
        actual: ayah.ayah,
      });
    }
  }

  return issues;
}

function validateUniqueIds(ayahs) {
  const seen = new Map();
  const issues = [];

  for (const ayah of ayahs) {
    if (seen.has(ayah.id)) {
      issues.push({
        type: 'duplicateId',
        id: ayah.id,
        verseKeys: [seen.get(ayah.id), verseKeyFromAyah(ayah)],
      });
      continue;
    }

    seen.set(ayah.id, verseKeyFromAyah(ayah));
  }

  return issues;
}

function validateSequentialIds(ayahs, startSurah, endSurah) {
  if (startSurah !== 1 || endSurah !== 114 || ayahs.length !== totalAyahCount) {
    return [];
  }

  const ids = ayahs.map((ayah) => ayah.id).sort((a, b) => a - b);
  const issues = [];

  for (let index = 0; index < ids.length; index += 1) {
    const expectedId = index + 1;

    if (ids[index] !== expectedId) {
      issues.push({
        type: 'nonSequentialId',
        expected: expectedId,
        actual: ids[index],
      });
      break;
    }
  }

  return issues;
}

function validateSortOrder(ayahs) {
  const issues = [];

  for (let index = 1; index < ayahs.length; index += 1) {
    const previous = ayahs[index - 1];
    const current = ayahs[index];

    if (sortAyahsForCanonicalRead(previous, current) > 0) {
      issues.push({
        type: 'sortOrderViolation',
        previous: verseKeyFromAyah(previous),
        current: verseKeyFromAyah(current),
      });
      break;
    }
  }

  return issues;
}

function validatePerSurahSequence(ayahs) {
  const bySurah = new Map();

  for (const ayah of ayahs) {
    if (!bySurah.has(ayah.surah_id)) {
      bySurah.set(ayah.surah_id, []);
    }

    bySurah.get(ayah.surah_id).push(ayah.ayah);
  }

  const issues = [];

  for (const [surahId, ayahNumbers] of bySurah.entries()) {
    const sorted = [...ayahNumbers].sort((a, b) => a - b);
    const expectedCount = surahAyahCounts[surahId - 1];

    for (let ayah = 1; ayah <= expectedCount; ayah += 1) {
      if (!sorted.includes(ayah)) {
        issues.push({
          type: 'missingAyahInSurah',
          verseKey: expectedVerseKey(surahId, ayah),
        });
      }
    }
  }

  return issues;
}

function validateNonEmptyContent(ayahs) {
  const issues = [];

  for (const ayah of ayahs) {
    const key = verseKeyFromAyah(ayah);

    for (const field of ['arabic', 'latin', 'translation']) {
      if (isBlank(ayah[field])) {
        issues.push({ verseKey: key, type: 'blankContent', field });
      }
    }

    if ('arabic_words' in ayah && ayah.arabic_words !== null) {
      if (!Array.isArray(ayah.arabic_words)) {
        issues.push({ verseKey: key, type: 'invalidArabicWords' });
      } else if (ayah.arabic_words.length === 0) {
        issues.push({ verseKey: key, type: 'emptyArabicWords' });
      }
    }
  }

  return issues;
}

function validateArabicWords(ayahs) {
  const issues = [];

  for (const ayah of ayahs) {
    if (!Array.isArray(ayah.arabic_words)) {
      continue;
    }

    const key = verseKeyFromAyah(ayah);
    const joinedWords = ayah.arabic_words.join('');
    const joinedArabic = ayah.arabic.replace(/\s+/g, '');

    if (joinedWords.length === 0) {
      continue;
    }

    const lengthRatio = joinedWords.length / joinedArabic.length;

    if (lengthRatio < 0.5 || lengthRatio > 1.5) {
      issues.push({
        verseKey: key,
        type: 'arabicWordsLengthMismatch',
        arabicLength: joinedArabic.length,
        wordsLength: joinedWords.length,
      });
    }
  }

  return issues;
}

export function validateInternalIntegrity({
  ayahs,
  startSurah,
  endSurah,
}) {
  const localKeys = ayahs.map(verseKeyFromAyah);
  const duplicateKeys = findDuplicateKeys(localKeys);
  const requiredFieldIssues = validateRequiredFields(ayahs);
  const referenceIssues = validateReferenceConsistency(ayahs);
  const duplicateIdIssues = validateUniqueIds(ayahs);
  const sequentialIdIssues = validateSequentialIds(ayahs, startSurah, endSurah);
  const sortOrderIssues = validateSortOrder(ayahs);
  const perSurahSequenceIssues = validatePerSurahSequence(ayahs);
  const blankContentIssues = validateNonEmptyContent(ayahs);
  const arabicWordsIssues = validateArabicWords(ayahs);

  const allIssues = [
    ...duplicateKeys.map((key) => ({ type: 'duplicateVerseKey', verseKey: key })),
    ...requiredFieldIssues,
    ...referenceIssues,
    ...duplicateIdIssues,
    ...sequentialIdIssues,
    ...sortOrderIssues,
    ...perSurahSequenceIssues,
    ...blankContentIssues,
    ...arabicWordsIssues,
  ];

  return {
    pass: allIssues.length === 0,
    issueCount: allIssues.length,
    duplicateKeys,
    issues: truncateIssues(allIssues),
  };
}
