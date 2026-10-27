import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-life360';

test('the Unreleased section moves under the new version', () => {
  const before = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Something.\n\n[Unreleased]: ${REPO}/commits/main\n`;
  const after = rollChangelog(before, '1.0.0', '2026-10-26');
  assert.match(
    after,
    /## \[Unreleased\]\n\n## \[1\.0\.0\] - 2026-10-26\n\n### Added\n\n- Something\./,
  );
  assert.match(after, new RegExp(`\\[Unreleased\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.HEAD`));
  assert.match(after, new RegExp(`\\[1\\.0\\.0\\]: ${REPO}/releases/tag/v1\\.0\\.0`));

  const next = rollChangelog(after, '1.0.1', '2026-10-27');
  assert.match(next, /## \[1\.0\.1\] - 2026-10-27\n\n- Maintenance release/);
  assert.match(next, new RegExp(`\\[1\\.0\\.1\\]: ${REPO}/compare/v1\\.0\\.0\\.\\.\\.v1\\.0\\.1`));
});

test('releasing twice the same version changes nothing', () => {
  const text = `## [Unreleased]\n\n## [1.0.0] - 2026-10-26\n\n- x\n`;
  assert.equal(rollChangelog(text, '1.0.0', '2026-10-27'), text);
});

test('CHANGELOG.md has an Unreleased section the Release workflow can roll', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(text, /^## \[Unreleased\]$/m);
  // `commits/main` until the first release, `compare/v<last>...HEAD` after.
  assert.match(
    text,
    new RegExp(
      `^\\[Unreleased\\]: ${REPO}/(commits/main|compare/v\\d+\\.\\d+\\.\\d+\\.\\.\\.HEAD)$`,
      'm',
    ),
  );
});
