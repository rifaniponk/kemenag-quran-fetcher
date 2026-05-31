export function parseValidationArgs(argv = process.argv) {
  const options = {
    offline: false,
    internal: false,
    deep: false,
    surah: null,
    keys: true,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--offline') {
      options.offline = true;
      options.keys = false;
      options.internal = true;
      continue;
    }

    if (arg === '--internal') {
      options.internal = true;
      continue;
    }

    if (arg === '--deep') {
      options.deep = true;
      options.internal = true;
      continue;
    }

    if (arg === '--surah') {
      const value = Number.parseInt(argv[index + 1] ?? '', 10);

      if (!Number.isInteger(value) || value < 1 || value > 114) {
        throw new Error('--surah must be an integer between 1 and 114.');
      }

      options.surah = value;
      index += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      return { ...options, help: true };
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export function printValidationHelp() {
  console.log(`Usage: node scripts/validate-against-quran-com.js [options]

Options:
  --internal   Also run offline integrity and cross-file checks
  --deep       Full validation: internal + keys + Arabic text + metadata vs Quran.com
  --offline    Offline only: internal + cross-file + juz boundaries (no API calls)
  --surah N    Limit Quran.com checks to a single surah (1-114)
  -h, --help   Show this help
`);
}
