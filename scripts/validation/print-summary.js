const ICON_PASS = '✅';
const ICON_FAIL = '❌';

function formatLayerStatus(pass) {
  return pass ? `${ICON_PASS} pass` : `${ICON_FAIL} FAIL`;
}

export function printValidationSummary(report, reportPath) {
  const overallIcon = report.pass ? ICON_PASS : ICON_FAIL;
  const lines = [
    '',
    `${overallIcon} Validation ${report.pass ? 'PASSED' : 'FAILED'}`,
    `Surah range: ${report.requestedSurahStart}–${report.requestedSurahEnd}`,
    `Ayahs: ${report.scopedAyahCount}/${report.expectedAyahCount} expected`,
    `Modes: ${report.modes.join(', ')}`,
    '',
    'Summary:',
  ];

  const { summary } = report;

  if (summary?.internal) {
    lines.push(
      `  internal:        ${formatLayerStatus(summary.internal.pass)} (${summary.internal.issueCount} issues)`,
    );
  }

  if (summary?.crossFile) {
    lines.push(
      `  cross-file:      ${formatLayerStatus(summary.crossFile.pass)} (${summary.crossFile.issueCount} issues)`,
    );
  }

  if (summary?.juzBoundaries) {
    lines.push(
      `  juz boundaries:  ${formatLayerStatus(summary.juzBoundaries.pass)} (${summary.juzBoundaries.issueCount} issues)`,
    );
  }

  if (summary?.keys) {
    lines.push(
      `  verse keys:      ${formatLayerStatus(summary.keys.pass)} (${summary.keys.issueCount} issues)`,
    );
  }

  if (summary?.deep) {
    const { deep } = summary;
    const textDetail = [
      `${deep.textMismatchCount} text mismatches`,
      `${deep.metadataMismatchCount} metadata mismatches`,
    ];

    if (deep.textCheckedCount !== undefined) {
      textDetail.push(`${deep.textCheckedCount} text checked`);
    }

    if (deep.textSkippedCount !== undefined) {
      textDetail.push(`${deep.textSkippedCount} text skipped`);
    }

    if (deep.allAyahsText) {
      textDetail.push(
        `all-ayahs ${deep.allAyahsText.textMismatchCount} mismatches`,
      );
    }

    if (deep.juzText) {
      textDetail.push(`by-juz ${deep.juzText.textMismatchCount} mismatches`);
    }

    lines.push(`  deep:            ${formatLayerStatus(deep.pass)} (${textDetail.join(', ')})`);
  }

  lines.push('', `Report: ${reportPath}`, '');

  const output = lines.join('\n');

  if (report.pass) {
    console.log(output);
  } else {
    console.error(output);
  }
}
