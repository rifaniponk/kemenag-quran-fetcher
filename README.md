# Kemenag Quran Fetcher

This subproject fetches Qur'an Kemenag ayah data from:

`https://web-api.qurankemenag.net/quran-ayah`

It stores every field returned by the API. The output is sorted for reading from juz 1 to juz 30.

## Commands

Run from this directory:

```bash
npm run fetch
```

Validate local data against Quran.com:

```bash
npm run validate              # verse-key completeness (default)
npm run validate:internal     # default + offline integrity checks
npm run validate:deep         # full validation (text + metadata)
npm run validate:offline      # offline only, no API calls
npm run validate -- --surah 2 # limit Quran.com checks to one surah
```

Run a small smoke check for Surah Al-Fatihah only (fetch + deep validate):

```bash
npm run smoke
```

## Output

The fetch command writes:

```text
data/all-ayahs.json
data/by-juz/juz-01.json
data/by-juz/juz-02.json
...
data/by-juz/juz-30.json
data/manifest.json
```

The validator writes:

```text
data/validation-report.json
```

## Data Shape

`data/all-ayahs.json` contains:

```json
{
  "meta": {},
  "data": []
}
```

Each item in `data` is the raw ayah object returned by Qur'an Kemenag. The script does not remove API fields.

## Environment

Optional environment variables:

```text
KEMENAG_API_BASE_URL
KEMENAG_FETCH_LIMIT
KEMENAG_SURAH_START
KEMENAG_SURAH_END
QURAN_COM_API_BASE_URL
```

Defaults:

```text
KEMENAG_API_BASE_URL=https://web-api.qurankemenag.net
KEMENAG_FETCH_LIMIT=50
KEMENAG_SURAH_START=1
KEMENAG_SURAH_END=114
QURAN_COM_API_BASE_URL=https://api.quran.com/api/v4
```

## Validation Algorithm

The validator (`scripts/validate-against-quran-com.js`) reads `data/all-ayahs.json`, scopes ayahs to the requested surah range, runs one or more check layers, and writes a structured report to `data/validation-report.json`. The process exits with code `1` when any enabled layer fails.

### Overview

```text
all-ayahs.json
      │
      ├─► Layer 1: Internal integrity        (offline)
      ├─► Layer 2: Cross-file consistency    (offline)
      ├─► Layer 2b: Juz boundary checks      (offline)
      ├─► Layer 3: Verse key completeness    (Quran.com API)
      └─► Layer 4: Arabic text + metadata    (Quran.com API, --deep only)
                │
                ▼
      validation-report.json
```

Each ayah is identified by a **verse key** in the form `surah_id:ayah` (for example `2:255`).

### Validation modes

| Command | Layers enabled | Network required |
| --- | --- | --- |
| `npm run validate` | Layer 3 (keys) | Yes |
| `npm run validate:internal` | Layers 1, 2, 2b, 3 | Yes |
| `npm run validate:deep` | Layers 1, 2, 2b, 3, 4 | Yes |
| `npm run validate:offline` | Layers 1, 2, 2b | No |
| `npm run validate -- --surah N` | Same as above, but Quran.com fetch is limited to surah `N` | Depends on mode |

Flags can be combined. `--deep` automatically enables the offline layers (1, 2, 2b). `--offline` skips all Quran.com requests.

### Scope selection

The validator determines which surahs to check:

1. If `--surah N` is passed, only surah `N` is validated.
2. Otherwise, it reads `meta.requestedSurahStart` and `meta.requestedSurahEnd` from `all-ayahs.json` (defaults: 1–114).

Ayahs outside the scoped range are ignored. Expected ayah counts come from the static table in `scripts/quran-metadata.js` (114 surahs, 6236 total ayahs).

---

### Layer 1 — Internal integrity (offline)

Validates that each ayah object in the scoped range is structurally sound on its own, without external references.

**Algorithm:**

1. Build the list of local verse keys (`surah_id:ayah`).
2. Fail if any verse key appears more than once.
3. For every ayah, assert all required top-level fields exist:
   `id`, `surah_id`, `ayah`, `page`, `quarter_hizb`, `juz`, `manzil`, `arabic`, `kitabah`, `latin`, `translation`, `arabic_words`, `surah`.
4. For every nested `surah` object, assert all required fields exist:
   `id`, `arabic`, `latin`, `transliteration`, `translation`, `num_ayah`, `page`, `location`.
5. Assert reference consistency:
   - `surah_id === surah.id`
   - `surah.num_ayah` matches the static surah ayah count
   - `ayah` is within `1..surah.num_ayah`
6. Assert all `id` values are unique.
7. If the scoped range is the full Qur'an (surahs 1–114, 6236 ayahs), assert global `id` values are sequential from 1 to 6236.
8. Assert the array is sorted in canonical read order: `juz → page → surah_id → ayah`.
9. For each surah in range, assert every ayah number from 1 to the expected count is present (no gaps).
10. Assert `arabic`, `latin`, and `translation` are non-empty strings.
11. Assert `arabic_words` is a non-empty array.
12. Assert `arabic_words` joined length is roughly consistent with `arabic` (ratio between 0.5 and 1.5).

---

### Layer 2 — Cross-file consistency (offline)

Validates that the fetch output files agree with each other.

**Algorithm:**

1. Read all 30 files in `data/by-juz/juz-NN.json`.
2. For each juz file:
   - Assert `meta.ayahCount === data.length`.
   - Assert every ayah in the file has `ayah.juz === N` (the file's juz number).
   - Collect duplicate verse keys within the file.
3. Build the union of all verse keys across juz files.
4. Compare the juz union against `all-ayahs.json`:
   - Fail on keys present in juz files but missing from `all-ayahs.json`.
   - Fail on keys present in `all-ayahs.json` but missing from the juz union.
5. If `data/manifest.json` exists, assert:
   - `completeness.expectedCount === all-ayahs count`
   - `completeness.actualCount === all-ayahs count`
   - `completeness.isComplete === true`

---

### Layer 2b — Juz boundary checks (offline)

Validates juz grouping against a static boundary table (`juzMetadata` in `scripts/quran-metadata.js`, sourced from Quran.com).

**Algorithm:**

1. Group scoped ayahs by their `juz` field.
2. For each juz that has data and whose ayah count equals the expected full-juz count:
   - Assert the first ayah (by surah/ayah order) matches the expected `firstVerseKey`.
   - Assert the last ayah matches the expected `lastVerseKey`.

Partial fetches (for example smoke test with surah 1 only) skip boundary checks for juz files that do not contain a complete juz.

---

### Layer 3 — Verse key completeness (Quran.com API)

Validates that the scoped local dataset contains exactly the right set of ayahs.

**Algorithm:**

1. Fetch reference verses from Quran.com:
   `GET /verses/by_chapter/{surah}?per_page={ayahCount}&fields=text_uthmani,text_uthmani_simple`
   One request per surah in scope. Responses are cached under `data/.cache/quran-com/`.
2. Build three verse-key sets:
   - **Local** — from Kemenag `surah_id:ayah`
   - **Quran.com** — from the API response
   - **Static expected** — from `expectedVerseKeysForRange()` in `quran-metadata.js`
3. Compute set differences:
   - `localMissingFromQuranCom` — in Quran.com but not local
   - `localExtraAgainstQuranCom` — in local but not Quran.com
   - `localMissingFromStaticExpected` — expected but not local
   - `localExtraAgainstStaticExpected` — in local but not expected
4. Detect duplicate keys in local and Quran.com sets.
5. Build per-surah reports (`quranCom.keys.surahReports`) summarizing missing, extra, and mismatch counts per surah.

**Pass condition:** all difference lists are empty and no duplicates exist.

---

### Layer 4 — Arabic text and metadata (`--deep`)

Validates that each ayah's content and navigation metadata match the Quran.com reference, not just its verse key.

**Algorithm (per ayah in scope):**

1. Look up the matching Quran.com verse by verse key.
2. **Text comparison:**
   - Build local comparison text from `arabic_words`, keeping only substantive words (tokens with at least 2 letters after stripping diacritics; waqf markers like `ەۙ` are excluded).
   - Compare against both Quran.com `text_uthmani` and `text_uthmani_simple`.
   - Texts match if either strict or relaxed normalization produces an equal string (see below).
3. **Metadata comparison** — exact integer equality:
   - `page` ↔ `page_number`
   - `juz` ↔ `juz_number`
   - `quarter_hizb` ↔ `rub_el_hizb_number`
   - `manzil` ↔ `manzil_number`

**Pass condition:** zero text mismatches and zero metadata mismatches.

#### Arabic normalization

Kemenag uses its own kitabah orthography; Quran.com uses Uthmani script. Direct string comparison would produce false positives (for example `صراط` vs `صرط`). The validator applies a two-step normalization before comparing:

**Strict normalization** (`normalizeArabic`):

1. Unicode NFKC normalization
2. Strip diacritics and Qur'anic annotation marks
3. Unify alef variants (أ إ آ ٱ ا ...) to `ا`
4. Remove tatweel and shadda
5. Keep only Arabic letters and digits
6. Remove whitespace

**Relaxed normalization** (`relaxedNormalizeArabic`):

1. Apply strict normalization
2. Remove optional medial alef between consonants (handles dagger-alef orthography differences)

Two texts are **equivalent** when strict-normalized strings match, or when relaxed-normalized strings match.

---

### Pass / fail rules

The overall report passes only when every **enabled** layer passes:

| Layer | Passes when |
| --- | --- |
| Internal | `issueCount === 0` |
| Cross-file | `issueCount === 0` |
| Juz boundaries | `issueCount === 0` |
| Keys | No missing, extra, or duplicate verse keys |
| Deep | No text or metadata mismatches |

Issue lists in the report are truncated to the first 50 entries per category, with a `total` count for the full number.

### Validation report

`data/validation-report.json` contains:

```json
{
  "generatedAt": "...",
  "modes": ["internal", "crossFile", "juzBoundaries", "keys", "deep"],
  "requestedSurahStart": 1,
  "requestedSurahEnd": 114,
  "scopedAyahCount": 6236,
  "expectedAyahCount": 6236,
  "pass": true,
  "summary": {
    "internal": { "pass": true, "issueCount": 0 },
    "crossFile": { "pass": true, "issueCount": 0 },
    "juzBoundaries": { "pass": true, "issueCount": 0 },
    "keys": { "pass": true, "issueCount": 0 },
    "deep": { "pass": true, "textMismatchCount": 0, "metadataMismatchCount": 0 }
  },
  "internal": { "...": "..." },
  "crossFile": { "...": "..." },
  "juzBoundaries": { "...": "..." },
  "quranCom": {
    "keys": {
      "surahReports": {
        "1": { "pass": true, "expected": 7, "local": 7, "quranCom": 7 }
      }
    },
    "deep": {
      "textMismatches": { "items": [], "total": 0, "truncated": false },
      "metadataMismatches": { "items": [], "total": 0, "truncated": false }
    }
  }
}
```

Use `quranCom.keys.surahReports` to pinpoint which surah failed without scanning the full mismatch list.

### Recommended workflow

```bash
# Quick key check after fetch
npm run validate

# Full confidence before using data in production
npm run fetch
npm run validate:deep
```

Quran.com responses are cached under `data/.cache/quran-com/` so repeated deep validations skip re-fetching unchanged surahs.

## Continuous Integration

GitHub Actions runs deep validation on every push to `main` or `feat/**` branches and on pull requests targeting `main`.

Workflow: `.github/workflows/validate.yml`

```bash
npm run ci
```

The job validates the committed dataset in `data/all-ayahs.json` for the surah range recorded in its `meta` fields (currently the smoke dataset: surah 1 only). When the full Qur'an is committed, the same workflow deep-validates all 6236 ayahs without changes to the pipeline.

If validation fails, the workflow uploads `data/validation-report.json` as an artifact for debugging.

## Production Note

This endpoint is used by the official Qur'an Kemenag web app. Direct access can return `403 Forbidden` unless requests include browser style headers. For a production app, prefer an approved token or permission flow from Kemenag or LPMQ, then call the API through your backend.
