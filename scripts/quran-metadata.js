export const surahAyahCounts = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128,
  111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73,
  54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60,
  49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52,
  44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19,
  26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3,
  6, 3, 5, 4, 5, 6,
];

export const totalAyahCount = surahAyahCounts.reduce(
  (sum, count) => sum + count,
  0,
);

export function expectedVerseKey(surahIndex, ayah) {
  return `${surahIndex}:${ayah}`;
}

export function expectedVerseKeysForRange(startSurah, endSurah) {
  const keys = [];

  for (let surah = startSurah; surah <= endSurah; surah += 1) {
    const ayahCount = surahAyahCounts[surah - 1];

    for (let ayah = 1; ayah <= ayahCount; ayah += 1) {
      keys.push(expectedVerseKey(surah, ayah));
    }
  }

  return keys;
}

/** Juz boundaries sourced from Quran.com `/verses/by_juz/{n}`. */
export const juzMetadata = [
  { juz: 1, firstVerseKey: '1:1', lastVerseKey: '2:141', verseCount: 148 },
  { juz: 2, firstVerseKey: '2:142', lastVerseKey: '2:252', verseCount: 111 },
  { juz: 3, firstVerseKey: '2:253', lastVerseKey: '3:92', verseCount: 126 },
  { juz: 4, firstVerseKey: '3:93', lastVerseKey: '4:23', verseCount: 131 },
  { juz: 5, firstVerseKey: '4:24', lastVerseKey: '4:147', verseCount: 124 },
  { juz: 6, firstVerseKey: '4:148', lastVerseKey: '5:81', verseCount: 110 },
  { juz: 7, firstVerseKey: '5:82', lastVerseKey: '6:110', verseCount: 149 },
  { juz: 8, firstVerseKey: '6:111', lastVerseKey: '7:87', verseCount: 142 },
  { juz: 9, firstVerseKey: '7:88', lastVerseKey: '8:40', verseCount: 159 },
  { juz: 10, firstVerseKey: '8:41', lastVerseKey: '9:92', verseCount: 127 },
  { juz: 11, firstVerseKey: '9:93', lastVerseKey: '11:5', verseCount: 151 },
  { juz: 12, firstVerseKey: '11:6', lastVerseKey: '12:52', verseCount: 170 },
  { juz: 13, firstVerseKey: '12:53', lastVerseKey: '14:52', verseCount: 154 },
  { juz: 14, firstVerseKey: '15:1', lastVerseKey: '16:128', verseCount: 227 },
  { juz: 15, firstVerseKey: '17:1', lastVerseKey: '18:74', verseCount: 185 },
  { juz: 16, firstVerseKey: '18:75', lastVerseKey: '20:135', verseCount: 269 },
  { juz: 17, firstVerseKey: '21:1', lastVerseKey: '22:78', verseCount: 190 },
  { juz: 18, firstVerseKey: '23:1', lastVerseKey: '25:20', verseCount: 202 },
  { juz: 19, firstVerseKey: '25:21', lastVerseKey: '27:55', verseCount: 339 },
  { juz: 20, firstVerseKey: '27:56', lastVerseKey: '29:45', verseCount: 171 },
  { juz: 21, firstVerseKey: '29:46', lastVerseKey: '33:30', verseCount: 178 },
  { juz: 22, firstVerseKey: '33:31', lastVerseKey: '36:27', verseCount: 169 },
  { juz: 23, firstVerseKey: '36:28', lastVerseKey: '39:31', verseCount: 357 },
  { juz: 24, firstVerseKey: '39:32', lastVerseKey: '41:46', verseCount: 175 },
  { juz: 25, firstVerseKey: '41:47', lastVerseKey: '45:37', verseCount: 246 },
  { juz: 26, firstVerseKey: '46:1', lastVerseKey: '51:30', verseCount: 195 },
  { juz: 27, firstVerseKey: '51:31', lastVerseKey: '57:29', verseCount: 399 },
  { juz: 28, firstVerseKey: '58:1', lastVerseKey: '66:12', verseCount: 137 },
  { juz: 29, firstVerseKey: '67:1', lastVerseKey: '77:50', verseCount: 431 },
  { juz: 30, firstVerseKey: '78:1', lastVerseKey: '114:6', verseCount: 564 },
];

export function parseVerseKey(verseKey) {
  const [surahPart, ayahPart] = verseKey.split(':');
  return {
    surah: Number.parseInt(surahPart, 10),
    ayah: Number.parseInt(ayahPart, 10),
  };
}

export function compareVerseKeys(a, b) {
  const left = parseVerseKey(a);
  const right = parseVerseKey(b);

  return left.surah - right.surah || left.ayah - right.ayah;
}
