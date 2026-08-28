import {
  extractMigrationTimestamp,
  findCollisionsForChangedFiles,
  findDuplicateTimestamps,
  formatDuplicateReport,
} from './check-migration-timestamps';

describe('check-migration-timestamps', () => {
  it('extracts the numeric prefix from migration filenames', () => {
    expect(
      extractMigrationTimestamp(
        '1775000000000-CreateLeaderboardHistoryTable.ts',
      ),
    ).toBe('1775000000000');
    expect(extractMigrationTimestamp('invalid-name.ts')).toBeNull();
  });

  it('flags deliberately duplicated timestamps', () => {
    const files = [
      '1775000000000-CreateLeaderboardHistoryTable.ts',
      '1775000000000-AddPredictionNoteColumn.ts',
      '1775000001000-UniqueMigration.ts',
    ];

    const duplicates = findDuplicateTimestamps(files);

    expect(duplicates.size).toBe(1);
    expect(duplicates.get('1775000000000')).toEqual([
      '1775000000000-CreateLeaderboardHistoryTable.ts',
      '1775000000000-AddPredictionNoteColumn.ts',
    ]);
    expect(formatDuplicateReport(duplicates)).toContain(
      '1775000000000-CreateLeaderboardHistoryTable.ts',
    );
  });

  it('reports collisions only when a changed file participates', () => {
    const allFiles = [
      '/migrations/1775000000000-CreateLeaderboardHistoryTable.ts',
      '/migrations/1775000000000-AddPredictionNoteColumn.ts',
    ];

    expect(findCollisionsForChangedFiles(allFiles, []).size).toBe(0);

    const collisions = findCollisionsForChangedFiles(allFiles, [
      '/migrations/1775000000000-AddPredictionNoteColumn.ts',
    ]);

    expect(collisions.size).toBe(1);
    expect(collisions.get('1775000000000')).toHaveLength(2);
  });
});
