import { describe, test, expect } from 'bun:test';
import {
  parseBuildSqlSummary,
  bumpCorpusVersion,
  monthYearUtc,
  updateSiteFreshness,
  verifyHealthBody,
  pushRemote,
  MIGRATION_FILES,
} from '../src/push-remote.js';
import type { PushRemoteDeps } from '../src/push-remote.js';

const BUILD_STDOUT = [
  'Reading C:\\dev\\repairmcp\\apps\\deg-server\\data\\deg-inquiries-full.json',
  'Parsed 22786 inquiries.',
  '',
  '=== Generation summary ===',
  'Records:               22786',
  'Corpus current through: 2026-08-27',
  'Corpus last synced:     2026-08-27   <- set CORPUS_VERSION to this',
  'INSERT statements:     339',
  'Largest statement:     80,102 bytes (limit 100,000)',
].join('\n');

const WRANGLER_JSONC = [
  '{',
  '  "vars": {',
  '    // the cache key',
  '    "CORPUS_VERSION": "2026-08-02"',
  '  }',
  '}',
].join('\n');

const SITE_HTML = [
  '<div class="stat">',
  '  <p class="stat-n">22,652</p>',
  '  <p class="stat-l">resolved and pending inquiries, current through July 2026</p>',
  '</div>',
  '<div class="stat">',
  '  <p class="stat-n">2008</p>',
  '  <p class="stat-l">the oldest inquiry in the set, so the history is all there</p>',
  '</div>',
].join('\n');

function goodHealth(): string {
  return JSON.stringify({
    ok: true,
    records: 22786,
    corpusSyncedAt: '2026-08-27',
    corpusCurrentThrough: '2026-08-27',
    corpusVersionStale: false,
  });
}

describe('parseBuildSqlSummary', () => {
  test('parses the real generation summary', () => {
    expect(parseBuildSqlSummary(BUILD_STDOUT)).toEqual({
      records: 22786,
      currentThrough: '2026-08-27',
      syncedAt: '2026-08-27',
    });
  });

  test('returns null when any line is missing', () => {
    expect(parseBuildSqlSummary('Records:               22786')).toBeNull();
    expect(parseBuildSqlSummary('')).toBeNull();
  });
});

describe('bumpCorpusVersion', () => {
  test('rewrites the var and nothing else', () => {
    const out = bumpCorpusVersion(WRANGLER_JSONC, '2026-08-27');
    expect(out).toContain('"CORPUS_VERSION": "2026-08-27"');
    expect(out).not.toContain('2026-08-02');
    expect(out).toContain('// the cache key');
  });

  test('throws when the key is absent', () => {
    expect(() => bumpCorpusVersion('{}', '2026-08-27')).toThrow('exactly one');
  });

  test('throws when the key appears twice', () => {
    expect(() => bumpCorpusVersion(WRANGLER_JSONC + WRANGLER_JSONC, '2026-08-27')).toThrow(
      'exactly one',
    );
  });
});

describe('monthYearUtc', () => {
  test('formats without any Date/timezone involvement', () => {
    expect(monthYearUtc('2026-08-27')).toBe('August 2026');
    expect(monthYearUtc('2026-01-01')).toBe('January 2026');
    expect(monthYearUtc('2025-12-31')).toBe('December 2025');
  });

  test('throws on junk', () => {
    expect(() => monthYearUtc('yesterday')).toThrow();
    expect(() => monthYearUtc('2026-13-01')).toThrow();
  });
});

describe('updateSiteFreshness', () => {
  test('replaces only the anchored count/month pair', () => {
    const out = updateSiteFreshness(SITE_HTML, 22786, '2026-08-27');
    expect(out).toContain('<p class="stat-n">22,786</p>');
    expect(out).toContain('current through August 2026');
    // the other stat is untouched
    expect(out).toContain('<p class="stat-n">2008</p>');
    expect(out).not.toContain('22,652');
  });

  test('throws when the stat copy changed and the anchor no longer matches', () => {
    expect(() => updateSiteFreshness('<p>rewritten page</p>', 22786, '2026-08-27')).toThrow(
      'exactly one',
    );
  });
});

describe('verifyHealthBody', () => {
  const expected = { records: 22786, syncedAt: '2026-08-27', currentThrough: '2026-08-27' };

  test('empty problems on an exact match', () => {
    expect(verifyHealthBody(goodHealth(), expected)).toEqual([]);
  });

  test('flags a stale record count', () => {
    const body = JSON.stringify({ ...JSON.parse(goodHealth()), records: 22652 });
    const problems = verifyHealthBody(body, expected);
    expect(problems.join(' ')).toContain('records=22652');
  });

  test('flags corpusVersionStale', () => {
    const body = JSON.stringify({ ...JSON.parse(goodHealth()), corpusVersionStale: true });
    expect(verifyHealthBody(body, expected).join(' ')).toContain('corpusVersionStale=true');
  });

  test('flags non-JSON', () => {
    expect(verifyHealthBody('<html>cloudflare error</html>', expected)[0]).toContain('not return JSON');
  });
});

interface FakeWorld {
  deps: PushRemoteDeps;
  files: Map<string, string>;
  calls: string[];
}

function makeWorld(overrides: Partial<PushRemoteDeps> = {}): FakeWorld {
  const files = new Map<string, string>([
    ['wrangler.jsonc', WRANGLER_JSONC],
    ['index.html', SITE_HTML],
  ]);
  const calls: string[] = [];
  const ok = { exitCode: 0, stdout: '', stderr: '' };
  const deps: PushRemoteDeps = {
    runBuildSql: async () => {
      calls.push('build');
      return { ...ok, stdout: BUILD_STDOUT };
    },
    runD1Migration: async (file) => {
      calls.push(`d1:${file}`);
      return ok;
    },
    runDeployWorker: async () => {
      calls.push('deploy:worker');
      return ok;
    },
    runCopyLint: async () => {
      calls.push('lint');
      return ok;
    },
    runDeploySite: async () => {
      calls.push('deploy:site');
      return ok;
    },
    fetchHealth: async () => {
      calls.push('health');
      return goodHealth();
    },
    readFile: (p) => {
      const v = files.get(p);
      if (v === undefined) throw new Error(`no such fake file: ${p}`);
      return v;
    },
    writeFile: (p, t) => {
      files.set(p, t);
    },
    wranglerJsoncPath: 'wrangler.jsonc',
    siteHtmlPath: 'index.html',
    log: () => {},
    healthAttempts: 2,
    healthDelayMs: 0,
    sleep: async () => {},
    ...overrides,
  };
  return { deps, files, calls };
}

describe('pushRemote', () => {
  test('happy path runs every step in order and edits both files', async () => {
    const world = makeWorld();
    const result = await pushRemote(world.deps);
    expect(result.ok).toBe(true);
    expect(result.summary?.records).toBe(22786);
    expect(world.calls).toEqual([
      'build',
      ...MIGRATION_FILES.map((f) => `d1:${f}`),
      'deploy:worker',
      'health',
      'lint',
      'deploy:site',
    ]);
    expect(world.files.get('wrangler.jsonc')).toContain('"CORPUS_VERSION": "2026-08-27"');
    expect(world.files.get('index.html')).toContain('22,786');
    expect(world.files.get('index.html')).toContain('August 2026');
  });

  test('refuses to push when the build summary cannot be parsed', async () => {
    const world = makeWorld({
      runBuildSql: async () => ({ exitCode: 0, stdout: 'no summary', stderr: '' }),
    });
    const result = await pushRemote(world.deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('refusing to push blind');
    expect(world.calls).not.toContain('d1:0001_schema.sql');
  });

  test('a failed migration names the file and warns about partial state', async () => {
    const world = makeWorld({
      runD1Migration: async (file) =>
        file === '0002_data.sql'
          ? { exitCode: 1, stdout: '', stderr: 'D1_ERROR: too many requests' }
          : { exitCode: 0, stdout: '', stderr: '' },
    });
    const result = await pushRemote(world.deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('0002_data.sql');
    expect(result.reason).toContain('mid-import');
    // never got to the deploys
    expect(world.calls).not.toContain('deploy:worker');
  });

  test('a health readback that never matches fails after the configured attempts', async () => {
    let healthCalls = 0;
    const world = makeWorld({
      fetchHealth: async () => {
        healthCalls++;
        return JSON.stringify({ ...JSON.parse(goodHealth()), records: 22652 });
      },
    });
    const result = await pushRemote(world.deps);
    expect(result.ok).toBe(false);
    expect(healthCalls).toBe(2);
    expect(result.reason).toContain('does not state what this push produced');
    // the site is never touched when the worker readback fails
    expect(world.files.get('index.html')).toContain('22,652');
  });

  test('a lint failure after the count edit fails the push', async () => {
    const world = makeWorld({
      runCopyLint: async () => ({ exitCode: 1, stdout: 'em dash found', stderr: '' }),
    });
    const result = await pushRemote(world.deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('copy linter');
    expect(world.calls).not.toContain('deploy:site');
  });

  test('a site deploy failure is reported after the worker already landed', async () => {
    const world = makeWorld({
      runDeploySite: async () => ({ exitCode: 1, stdout: '', stderr: 'route error' }),
    });
    const result = await pushRemote(world.deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('deploy (site)');
    expect(world.calls).toContain('deploy:worker');
  });
});
