# Kemenag Quran Fetcher

This subproject fetches Qur'an Kemenag ayah data from:

`https://web-api.qurankemenag.net/quran-ayah`

It stores every field returned by the API. The output is sorted for reading from juz 1 to juz 30.

## Commands

Run from this directory:

```bash
npm run fetch
```

Validate local data against Quran.com verse keys:

```bash
npm run validate
```

Run a small smoke check for Surah Al-Fatihah only:

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

## Validation Logic

The validator checks:

1. Local Kemenag verse keys.
2. Quran.com verse keys from `quran/verses/uthmani`.
3. Static expected counts for 114 surahs.

It fails if any verse key is missing, duplicated, or extra.

## Production Note

This endpoint is used by the official Qur'an Kemenag web app. Direct access can return `403 Forbidden` unless requests include browser style headers. For a production app, prefer an approved token or permission flow from Kemenag or LPMQ, then call the API through your backend.
