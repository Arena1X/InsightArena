import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import { basename, join } from 'path';

const MIGRATION_FILENAME_PATTERN = /^(\d{13,})-(.+)\.ts$/;

export function extractMigrationTimestamp(filename: string): string | null {
  const match = basename(filename).match(MIGRATION_FILENAME_PATTERN);
  return match?.[1] ?? null;
}

export function findDuplicateTimestamps(
  filenames: string[],
): Map<string, string[]> {
  const byTimestamp = new Map<string, string[]>();

  for (const filename of filenames) {
    const timestamp = extractMigrationTimestamp(filename);
    if (!timestamp) {
      continue;
    }

    const existing = byTimestamp.get(timestamp) ?? [];
    existing.push(basename(filename));
    byTimestamp.set(timestamp, existing);
  }

  const duplicates = new Map<string, string[]>();
  for (const [timestamp, files] of byTimestamp.entries()) {
    if (files.length > 1) {
      duplicates.set(timestamp, files);
    }
  }

  return duplicates;
}

export function listMigrationFiles(migrationsDir: string): string[] {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => join(migrationsDir, file));
}

export function formatDuplicateReport(
  duplicates: Map<string, string[]>,
): string {
  const lines = ['Duplicate TypeORM migration timestamp prefixes found:'];

  for (const [timestamp, files] of [...duplicates.entries()].sort()) {
    lines.push(`  ${timestamp}:`);
    for (const file of files.sort()) {
      lines.push(`    - ${file}`);
    }
  }

  lines.push(
    '',
    'Each migration file must use a unique 13-digit timestamp prefix.',
    'Generate migrations with: pnpm run migration:generate -- src/migrations/DescriptiveName',
  );

  return lines.join('\n');
}

export function getChangedMigrationFiles(
  migrationsDir: string,
  baseRef = 'origin/main',
): string[] {
  try {
    const output = execSync(`git diff --name-only ${baseRef}...HEAD`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('backend/src/migrations/'))
      .filter((line) => line.endsWith('.ts'))
      .map((line) => join(migrationsDir, basename(line)));
  } catch {
    return [];
  }
}

export function findCollisionsForChangedFiles(
  allFiles: string[],
  changedFiles: string[],
): Map<string, string[]> {
  const duplicates = findDuplicateTimestamps(allFiles);
  if (duplicates.size === 0 || changedFiles.length === 0) {
    return new Map();
  }

  const changedBasenames = new Set(changedFiles.map((file) => basename(file)));
  const collisions = new Map<string, string[]>();

  for (const [timestamp, files] of duplicates.entries()) {
    if (files.some((file) => changedBasenames.has(file))) {
      collisions.set(timestamp, files);
    }
  }

  return collisions;
}

export function checkMigrationTimestamps(options: {
  migrationsDir: string;
  mode?: 'all' | 'incremental';
  baseRef?: string;
}): void {
  const {
    migrationsDir,
    mode = 'incremental',
    baseRef = 'origin/main',
  } = options;
  const allFiles = listMigrationFiles(migrationsDir);

  if (mode === 'all') {
    const duplicates = findDuplicateTimestamps(allFiles);
    if (duplicates.size > 0) {
      throw new Error(formatDuplicateReport(duplicates));
    }
    return;
  }

  const changedFiles = getChangedMigrationFiles(migrationsDir, baseRef);
  const collisions = findCollisionsForChangedFiles(allFiles, changedFiles);

  if (collisions.size > 0) {
    throw new Error(formatDuplicateReport(collisions));
  }
}

if (require.main === module) {
  const migrationsDir = join(__dirname, '../migrations');
  const mode = process.argv.includes('--all') ? 'all' : 'incremental';

  try {
    checkMigrationTimestamps({ migrationsDir, mode });
    console.log('Migration timestamp check passed.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
