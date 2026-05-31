const DIACRITICS_AND_MARKS =
  /[\u064B-\u065F\u0670\u06D6-\u06ED\u08F0-\u08FF]/g;
const ALEF_VARIANTS = /[\u0622\u0623\u0625\u0671\u0627\u0629\u06D5]/g;
const ALIF_MAKSURA = /\u0649/g;
const TATWEEL_AND_SHADDA = /[\u0640\u0651]/g;
const NON_ARABIC_LETTERS = /[^\u0621-\u064A\u0660-\u0669]/g;
const HAMZA_MARKS = /[\u0621\u0626\u0624\u0674\u0675\u06BE\u06C1\u0610-\u0615]/g;

const OPTIONAL_MEDIAL_ALEF =
  /(?<=[بتثجحخدذرزسشصضطظعغفقكلمنهي])ا(?=[بتثجحخدذرزسشصضطظعغفقكلمنهي])|(?<=[و])ا(?=[بتثجحخدذرزسشصضطظعغفقكلمنهي])/g;
const OPTIONAL_MEDIAL_YAA =
  /(?<=[بتثجحخدذرزسشصضطظعغفقكلمنهي])ي(?=[بتثجحخدذرزسشصضطظعغفقكلمنهي])/g;

function stripDiacritics(text) {
  return text.replace(DIACRITICS_AND_MARKS, '').replace(TATWEEL_AND_SHADDA, '');
}

export function isSubstantiveArabicWord(token) {
  if (typeof token !== 'string') {
    return false;
  }

  const rawLetters = stripDiacritics(token).replace(/\s+/g, '');
  return rawLetters.length >= 2;
}

export function hasArabicWords(ayah) {
  return Array.isArray(ayah.arabic_words) && ayah.arabic_words.length > 0;
}

function stripSpaces(text) {
  return text.replace(/\s+/g, '');
}

function wordsMatchKitabahLength(fromWords, kitabah) {
  const wordsLength = stripSpaces(fromWords).length;
  const kitabahLength = stripSpaces(kitabah).length;

  if (kitabahLength === 0) {
    return true;
  }

  const ratio = wordsLength / kitabahLength;
  return ratio >= 0.75 && ratio <= 1.25;
}

export function buildKemenagComparisonText(ayah) {
  if (Array.isArray(ayah.arabic_words) && ayah.arabic_words.length > 0) {
    const fromWords = ayah.arabic_words.filter(isSubstantiveArabicWord).join('');

    if (
      fromWords.length > 0 &&
      typeof ayah.kitabah === 'string' &&
      wordsMatchKitabahLength(fromWords, ayah.kitabah)
    ) {
      return fromWords;
    }
  }

  if (typeof ayah.kitabah === 'string' && ayah.kitabah.length > 0) {
    return ayah.kitabah;
  }

  return ayah.arabic ?? '';
}

export function normalizeArabic(text) {
  if (typeof text !== 'string') {
    return '';
  }

  return text
    .normalize('NFKC')
    .replace(DIACRITICS_AND_MARKS, '')
    .replace(ALIF_MAKSURA, 'ي')
    .replace(ALEF_VARIANTS, 'ا')
    .replace(TATWEEL_AND_SHADDA, '')
    .replace(NON_ARABIC_LETTERS, '')
    .replace(/\s+/g, '')
    .trim();
}

export function relaxedNormalizeArabic(text) {
  return normalizeArabic(text)
    .replace(HAMZA_MARKS, '')
    .replace(/ة/g, 'ه')
    .replace(OPTIONAL_MEDIAL_ALEF, '')
    .replace(OPTIONAL_MEDIAL_YAA, '');
}

export function arabicSimilarity(left, right) {
  const normalizedLeft = relaxedNormalizeArabic(left);
  const normalizedRight = relaxedNormalizeArabic(right);
  const maxLength = Math.max(normalizedLeft.length, normalizedRight.length);

  if (maxLength === 0) {
    return 1;
  }

  const distance = levenshteinDistance(normalizedLeft, normalizedRight);
  return 1 - distance / maxLength;
}

function levenshteinDistance(left, right) {
  const leftLength = left.length;
  const rightLength = right.length;
  const matrix = Array.from({ length: leftLength + 1 }, () =>
    Array(rightLength + 1).fill(0),
  );

  for (let index = 0; index <= leftLength; index += 1) {
    matrix[index][0] = index;
  }

  for (let index = 0; index <= rightLength; index += 1) {
    matrix[0][index] = index;
  }

  for (let row = 1; row <= leftLength; row += 1) {
    for (let column = 1; column <= rightLength; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost,
      );
    }
  }

  return matrix[leftLength][rightLength];
}

function relaxedLengthRatio(left, right) {
  const leftLength = relaxedNormalizeArabic(left).length;
  const rightLength = relaxedNormalizeArabic(right).length;

  if (rightLength === 0) {
    return leftLength === 0 ? 1 : Number.POSITIVE_INFINITY;
  }

  return leftLength / rightLength;
}

export function arabicTextsEquivalent(localText, referenceTexts) {
  if (typeof localText !== 'string' || localText.length === 0) {
    return false;
  }

  const localStrict = normalizeArabic(localText);
  const localRelaxed = relaxedNormalizeArabic(localText);

  return referenceTexts.some((referenceText) => {
    if (typeof referenceText !== 'string' || referenceText.length === 0) {
      return false;
    }

    if (
      localStrict === normalizeArabic(referenceText) ||
      localRelaxed === relaxedNormalizeArabic(referenceText)
    ) {
      return true;
    }

    const lengthRatio = relaxedLengthRatio(localText, referenceText);

    if (lengthRatio < 0.85 || lengthRatio > 1.15) {
      return false;
    }

    return arabicSimilarity(localText, referenceText) >= 0.9;
  });
}
