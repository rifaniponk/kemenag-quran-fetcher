import { expectedVerseKeysForRange } from './quran-metadata.js';
import {
  allAyahsPath,
  readJson,
  validationReportPath,
  writeJson,
} from './io.js';
import {
  loadManifestIfPresent,
  validateCrossFileConsistency,
  validateJuzBoundaries,
} from './validation/cross-file.js';
import { validateInternalIntegrity } from './validation/internal.js';
import {
  parseValidationArgs,
  printValidationHelp,
} from './validation/parse-args.js';
import { printValidationSummary } from './validation/print-summary.js';
import { compareAgainstQuranCom } from './validation/quran-com-compare.js';
import {
  fetchQuranComVersesForRange,
  getQuranComBaseUrl,
} from './validation/quran-com-client.js';

function getRequestedRange(localPayload, options) {
  if (options.surah !== null) {
    return { startSurah: options.surah, endSurah: options.surah };
  }

  return {
    startSurah: localPayload.meta?.requestedSurahStart ?? 1,
    endSurah: localPayload.meta?.requestedSurahEnd ?? 114,
  };
}

function filterAyahsForRange(ayahs, startSurah, endSurah) {
  return ayahs.filter(
    (ayah) => ayah.surah_id >= startSurah && ayah.surah_id <= endSurah,
  );
}

function buildModes(options) {
  const modes = [];

  if (options.internal) {
    modes.push('internal', 'crossFile', 'juzBoundaries');
  }

  if (options.keys) {
    modes.push('keys');
  }

  if (options.deep) {
    modes.push('deep');
  }

  if (options.offline) {
    return ['internal', 'crossFile', 'juzBoundaries'];
  }

  return modes;
}

function buildSummary(report) {
  const summary = {};

  if (report.internal) {
    summary.internal = {
      pass: report.internal.pass,
      issueCount: report.internal.issueCount,
    };
  }

  if (report.crossFile) {
    summary.crossFile = {
      pass: report.crossFile.pass,
      issueCount: report.crossFile.issueCount,
    };
  }

  if (report.juzBoundaries) {
    summary.juzBoundaries = {
      pass: report.juzBoundaries.pass,
      issueCount: report.juzBoundaries.issueCount,
    };
  }

  if (report.quranCom?.keys) {
    summary.keys = {
      pass: report.quranCom.keys.pass,
      issueCount:
        report.quranCom.keys.localMissingFromQuranCom.length +
        report.quranCom.keys.localExtraAgainstQuranCom.length +
        report.quranCom.keys.localMissingFromStaticExpected.length +
        report.quranCom.keys.localExtraAgainstStaticExpected.length +
        report.quranCom.keys.localDuplicateKeys.length,
    };
  }

  if (report.quranCom?.deep) {
    summary.deep = {
      pass: report.quranCom.deep.pass,
      textCheckedCount: report.quranCom.deep.textCheckedCount,
      textSkippedCount: report.quranCom.deep.textSkippedCount,
      textMismatchCount: report.quranCom.deep.textMismatchCount,
      metadataMismatchCount: report.quranCom.deep.metadataMismatchCount,
    };
  }

  return summary;
}

function isReportPassing(report) {
  const sections = [
    report.internal,
    report.crossFile,
    report.juzBoundaries,
    report.quranCom?.keys,
    report.quranCom?.deep,
  ].filter(Boolean);

  return sections.every((section) => section.pass);
}

async function main() {
  const options = parseValidationArgs();

  if (options.help) {
    printValidationHelp();
    return;
  }

  const localPayload = await readJson(allAyahsPath);
  const allAyahs = Array.isArray(localPayload.data) ? localPayload.data : [];
  const { startSurah, endSurah } = getRequestedRange(localPayload, options);
  const scopedAyahs = filterAyahsForRange(allAyahs, startSurah, endSurah);
  const modes = buildModes(options);
  const report = {
    generatedAt: new Date().toISOString(),
    modes,
    quranComBaseUrl: getQuranComBaseUrl(),
    localFile: allAyahsPath,
    requestedSurahStart: startSurah,
    requestedSurahEnd: endSurah,
    scopedAyahCount: scopedAyahs.length,
    expectedAyahCount: expectedVerseKeysForRange(startSurah, endSurah).length,
  };

  if (options.internal) {
    console.log('Running internal integrity checks...');
    report.internal = validateInternalIntegrity({
      ayahs: scopedAyahs,
      startSurah,
      endSurah,
    });

    const manifest = await loadManifestIfPresent();
    console.log('Running cross-file consistency checks...');
    report.crossFile = await validateCrossFileConsistency(scopedAyahs, manifest);

    console.log('Running juz boundary checks...');
    report.juzBoundaries = validateJuzBoundaries(scopedAyahs);
  }

  if (options.keys || options.deep) {
    console.log(
      `Fetching Quran.com data for surah ${startSurah} to ${endSurah}...`,
    );
    const quranComVersesByKey = await fetchQuranComVersesForRange(
      startSurah,
      endSurah,
    );
    report.quranCom = compareAgainstQuranCom({
      localAyahs: scopedAyahs,
      quranComVersesByKey,
      startSurah,
      endSurah,
      deep: options.deep,
    });
  }

  report.summary = buildSummary(report);
  report.pass = isReportPassing(report);

  await writeJson(validationReportPath, report);

  printValidationSummary(report, validationReportPath);

  if (!report.pass) {
    process.exitCode = 1;
    return;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
