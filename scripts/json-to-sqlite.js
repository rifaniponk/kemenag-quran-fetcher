import { writeFile } from "node:fs/promises";
import path from "node:path";

import { allAyahsPath, projectRoot, readJson } from "./io.js";

function parseExportArgs(argv = process.argv) {
  const options = {
    input: allAyahsPath,
    output: path.join(projectRoot, "data", "quran_id.sql"),
    table: "quran_id",
    fields: null,
    listFields: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--input") {
      options.input = path.resolve(argv[index + 1] ?? "");
      index += 1;
      continue;
    }

    if (arg === "--output") {
      options.output = path.resolve(argv[index + 1] ?? "");
      index += 1;
      continue;
    }

    if (arg === "--table") {
      options.table = argv[index + 1] ?? "";
      index += 1;
      continue;
    }

    if (arg === "--fields") {
      options.fields = (argv[index + 1] ?? "")
        .split(",")
        .map((field) => field.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (arg === "--list-fields") {
      options.listFields = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      return { ...options, help: true };
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printExportHelp() {
  console.log(`Usage: node scripts/json-to-sqlite.js [options]

Convert all-ayahs.json into a SQLite-compatible SQL dump (UTF-8).

Options:
  --input PATH     Input JSON file (default: data/all-ayahs.json)
  --output PATH    Output SQL file (default: data/all-ayahs.sql)
  --table NAME     SQLite table name (default: ayahs)
  --fields LIST    Comma-separated fields to export (supports dot paths, e.g. surah.latin)
  --list-fields    Print available top-level and nested field paths, then exit
  -h, --help       Show this help

Examples:
  node scripts/json-to-sqlite.js --fields id,surah_id,ayah,juz,arabic,translation
  node scripts/json-to-sqlite.js --table verses --fields id,arabic,surah.translation
`);
}

function assertIdentifier(name, label) {
  if (!name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(
      `${label} must be a valid SQLite identifier (letters, numbers, underscore).`,
    );
  }
}

function fieldPathToColumn(fieldPath) {
  return fieldPath.replace(/\./g, "_");
}

function getFieldValue(record, fieldPath) {
  return fieldPath.split(".").reduce((value, key) => {
    if (value === null || value === undefined) {
      return undefined;
    }

    return value[key];
  }, record);
}

function collectFieldPaths(value, prefix = "", paths = new Set()) {
  if (value === null || value === undefined) {
    return paths;
  }

  if (Array.isArray(value)) {
    paths.add(prefix);
    return paths;
  }

  if (typeof value === "object") {
    if (prefix) {
      paths.add(prefix);
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      collectFieldPaths(nestedValue, nextPrefix, paths);
    }

    return paths;
  }

  if (prefix) {
    paths.add(prefix);
  }

  return paths;
}

function listAvailableFields(records) {
  const paths = new Set();

  for (const record of records.slice(0, 50)) {
    collectFieldPaths(record, "", paths);
  }

  return [...paths].sort((a, b) => a.localeCompare(b));
}

function escapeSqlString(value) {
  return value.replace(/'/g, "''");
}

function formatSqlLiteral(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot serialize non-finite number: ${value}`);
    }

    return Number.isInteger(value) ? String(value) : String(value);
  }

  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }

  const serialized =
    typeof value === "string" ? value : JSON.stringify(value, null, 0);

  return `'${escapeSqlString(serialized)}'`;
}

function inferSqliteType(values) {
  const nonNullValues = values.filter(
    (value) => value !== null && value !== undefined,
  );

  if (nonNullValues.length === 0) {
    return "TEXT";
  }

  if (
    nonNullValues.every(
      (value) => typeof value === "number" && Number.isInteger(value),
    )
  ) {
    return "INTEGER";
  }

  if (nonNullValues.every((value) => typeof value === "number")) {
    return "REAL";
  }

  if (nonNullValues.every((value) => typeof value === "boolean")) {
    return "INTEGER";
  }

  return "TEXT";
}

function buildCreateTableStatement(tableName, fields, columnValues) {
  const columns = fields
    .map((fieldPath) => {
      const columnName = fieldPathToColumn(fieldPath);
      const sqlType = inferSqliteType(columnValues.get(fieldPath) ?? []);
      return `  "${columnName}" ${sqlType}`;
    })
    .join(",\n");

  return `CREATE TABLE IF NOT EXISTS "${tableName}" (\n${columns}\n);`;
}

function buildInsertStatement(tableName, fields, record) {
  const columnNames = fields
    .map((fieldPath) => `"${fieldPathToColumn(fieldPath)}"`)
    .join(", ");
  const values = fields
    .map((fieldPath) => formatSqlLiteral(getFieldValue(record, fieldPath)))
    .join(", ");

  return `INSERT INTO "${tableName}" (${columnNames}) VALUES (${values});`;
}

async function exportJsonToSqlite(options) {
  const payload = await readJson(options.input);
  const records = payload.data;

  if (!Array.isArray(records)) {
    throw new Error(`Expected "data" array in ${options.input}`);
  }

  if (options.listFields) {
    for (const fieldPath of listAvailableFields(records)) {
      console.log(fieldPath);
    }

    return {
      fieldCount: listAvailableFields(records).length,
      rowCount: 0,
      output: null,
    };
  }

  const fields = options.fields ?? [
    "id",
    "surah_id",
    "ayah",
    "juz",
    "page",
    "arabic",
    "translation",
  ];

  if (fields.length === 0) {
    throw new Error(
      "At least one field is required. Use --fields or --list-fields.",
    );
  }

  assertIdentifier(options.table, "Table name");

  for (const fieldPath of fields) {
    assertIdentifier(fieldPathToColumn(fieldPath), `Field "${fieldPath}"`);
  }

  const columnValues = new Map(fields.map((fieldPath) => [fieldPath, []]));

  for (const record of records) {
    for (const fieldPath of fields) {
      columnValues.get(fieldPath).push(getFieldValue(record, fieldPath));
    }
  }

  const lines = [
    "-- Generated by scripts/json-to-sqlite.js",
    "-- Encoding: UTF-8",
    "PRAGMA foreign_keys=OFF;",
    'PRAGMA encoding="UTF-8";',
    "BEGIN TRANSACTION;",
    buildCreateTableStatement(options.table, fields, columnValues),
  ];

  for (const record of records) {
    lines.push(buildInsertStatement(options.table, fields, record));
  }

  lines.push("COMMIT;", "");

  await writeFile(options.output, lines.join("\n"), "utf8");

  return {
    fieldCount: fields.length,
    rowCount: records.length,
    output: options.output,
  };
}

async function main() {
  const options = parseExportArgs();

  if (options.help) {
    printExportHelp();
    return;
  }

  const result = await exportJsonToSqlite(options);

  if (result.output) {
    console.log(
      `Wrote ${result.rowCount} rows with ${result.fieldCount} columns to ${result.output}`,
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
