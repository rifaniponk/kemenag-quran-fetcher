const DIACRITICS_AND_MARKS =
  /[\u064B-\u065F\u0670\u06D6-\u06ED\u08F0-\u08FF]/g;
const ALEF_VARIANTS = /[\u0622\u0623\u0625\u0671\u0627\u0629\u0649\u06D5]/g;
const TATWEEL_AND_SHADDA = /[\u0640\u0651]/g;
const NON_ARABIC_LETTERS = /[^\u0621-\u064A\u0660-\u0669]/g;
const OPTIONAL_MEDIAL_ALEF =
  /(?<=[بتثجحخدذرزسشصضطظعغفقكلمنهي])ا(?=[بتثجحخدذرزسشصضطظعغفقكلمنهي])/g;

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

export function buildKemenagComparisonText(ayah) {
  if (Array.isArray(ayah.arabic_words) && ayah.arabic_words.length > 0) {
    return ayah.arabic_words.filter(isSubstantiveArabicWord).join('');
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
    .replace(ALEF_VARIANTS, 'ا')
    .replace(TATWEEL_AND_SHADDA, '')
    .replace(NON_ARABIC_LETTERS, '')
    .replace(/\s+/g, '')
    .trim();
}

export function relaxedNormalizeArabic(text) {
  return normalizeArabic(text).replace(OPTIONAL_MEDIAL_ALEF, '');
}

export function arabicTextsEquivalent(localText, referenceTexts) {
  const localStrict = normalizeArabic(localText);
  const localRelaxed = relaxedNormalizeArabic(localText);

  return referenceTexts.some((referenceText) => {
    if (typeof referenceText !== 'string' || referenceText.length === 0) {
      return false;
    }

    return (
      localStrict === normalizeArabic(referenceText) ||
      localRelaxed === relaxedNormalizeArabic(referenceText)
    );
  });
}
