import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { finalizeDatabaseUrl, finalizeSummary, finalizeFailure } from '../src/server/institution-finalize.ts';
import { cleanupInstitutions } from '../src/server/institution-cleanup.ts';
import { catalogCommand } from '../src/server/course-catalog-service.ts';

test('finalize configuration requires an explicit valid PostgreSQL database without echoing credentials', () => {
  for (const value of [undefined, '', 'not-a-url', 'https://example.invalid/db', 'postgresql://', 'postgresql://localhost/', 'postgresql://user:private-password@localhost/db#fragment']) {
    assert.throws(() => finalizeDatabaseUrl(value), error => {
      const result = finalizeFailure(error); assert.equal(result.exitCode, 1);
      assert.match(result.message, /DATABASE_CONFIGURATION/); assert.doesNotMatch(result.message, /private-password|not-a-url|https:\/\//); return true;
    });
  }
  assert.equal(finalizeDatabaseUrl('postgresql://localhost/campus_test'), 'postgresql://localhost/campus_test');
});
test('console summaries use Arabic and Western digits and distinguish pending physical files', () => {
  const text = finalizeSummary({ alreadyCompleted: false, institutions: 10, mappings: 10, fetched: 198, mapped: 193, unknown: 5, ambiguous: 0, pendingFiles: 1 });
  assert.match(text, /المصدر 198/); assert.match(text, /لم يكتمل/); assert.doesNotMatch(text, /اكتملت العملية بنجاح|[٠-٩]/);
  assert.match(finalizeSummary({ alreadyCompleted: true, institutions: 10, mappings: 10, fetched: 198, mapped: 193, unknown: 5, ambiguous: 0, pendingFiles: 0 }), /مكتمل سابقًا/);
  assert.doesNotMatch(finalizeFailure(new Error('postgresql://private:secret@host/db')).message, /private|secret|host/);
});
test('HTTP service contracts cannot opt into unauthenticated maintenance', async () => {
  await assert.rejects(() => cleanupInstitutions(null!, undefined!, { snapshot: 'a'.repeat(64), confirmed: true }));
  assert.equal(catalogCommand.safeParse({ action: 'sync', maintenance: true }).success, false);
});
test('actual standalone entry rejects missing/malformed configuration before database access', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'campus-finalize-config-'));
  try {
    for (const value of ['', 'postgresql://private:do-not-log@example.invalid/']) {
      const result = spawnSync(process.execPath, ['--experimental-strip-types', path.resolve('scripts/finalize-institutions.ts')], { cwd: directory, env: { ...process.env, DATABASE_URL: value }, encoding: 'utf8', timeout: 20000 });
      assert.equal(result.status, 1); assert.match(result.stderr, /DATABASE_CONFIGURATION/); assert.match(result.stderr, /لم تُغيّر أي بيانات/); assert.doesNotMatch(result.stderr + result.stdout, /do-not-log|example.invalid/);
    }
    const extra = spawnSync(process.execPath, ['--experimental-strip-types', path.resolve('scripts/finalize-institutions.ts'), '--dry-run'], { cwd: directory, env: { ...process.env, DATABASE_URL: '' }, encoding: 'utf8', timeout: 20000 });
    assert.equal(extra.status, 1); assert.match(extra.stderr, /UNEXPECTED_ARGUMENTS/); assert.match(extra.stderr, /لم تُغيّر أي بيانات/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
