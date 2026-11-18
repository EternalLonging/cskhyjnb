const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'sync.js'), 'utf8');
const configSource = fs.readFileSync(path.join(projectRoot, 'config.js'), 'utf8');

function sliceBetween(startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, `missing source section: ${startText}`);
  return source.slice(start, end);
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    has(key) { return values.has(key); },
  };
}

test('admin session marker is versioned so legacy unlock state is not reused', () => {
  assert.match(configSource, /const ADMIN_AUTH_KEY = 'quiz_admin_unlocked_v2'/);
});

test('Supabase client is rebuilt when the sync key changes', () => {
  const created = [];
  const localStorage = createStorage({ quiz_sync_key_v1: 'first-key' });
  const context = vm.createContext({
    console,
    localStorage,
    SYNC_KEY_STORAGE: 'quiz_sync_key_v1',
    SYNC_KEY_HEADER: 'x-quiz-sync-key',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_KEY: 'anon-key',
    encodeBase64Utf8: value => Buffer.from(String(value), 'utf8').toString('base64'),
    renderSyncBadge: () => {},
    window: {
      supabase: {
        createClient: (url, key, options) => {
          const client = { id: created.length + 1 };
          created.push({ url, key, options, client });
          return client;
        },
      },
    },
  });

  vm.runInContext(`
    ${sliceBetween('const syncState =', 'const noteFetchState =')}
    ${sliceBetween('function initSupabaseClient()', 'async function initSync')}
    this.api = { syncState, initSupabaseClient };
  `, context);

  const first = context.api.initSupabaseClient();
  context.api.syncState.key = '\u4e2d\u6587-key';
  const second = context.api.initSupabaseClient();
  const secondAgain = context.api.initSupabaseClient();

  assert.notEqual(first, second);
  assert.equal(second, secondAgain);
  assert.equal(created.length, 2);
  assert.equal(
    created[0].options.global.headers['x-quiz-sync-key'],
    Buffer.from('first-key', 'utf8').toString('base64'),
  );
  assert.equal(
    created[1].options.global.headers['x-quiz-sync-key'],
    Buffer.from('\u4e2d\u6587-key', 'utf8').toString('base64'),
  );
});

test('progress tombstone is serialized before a new progress write', async () => {
  const events = [];
  const rows = [];
  const localStorage = createStorage();
  let localProgress = { savedAt: 222, pool: [{ id: 'q1' }] };

  function queryBuilder(row) {
    const execute = async () => {
      events.push(`start:${row.deck_key}`);
      if (row.deck_key === 'progress:__deleted__') {
        await new Promise(resolve => setTimeout(resolve, 15));
      }
      rows.push(row);
      events.push(`end:${row.deck_key}`);
      return { data: { updated_at: '2026-01-02T03:04:05.000Z' }, error: null };
    };
    return {
      then(resolve, reject) { return execute().then(resolve, reject); },
      select() { return { maybeSingle: execute }; },
    };
  }

  const context = vm.createContext({
    console,
    setTimeout,
    clearTimeout,
    localStorage,
    PROGRESS_KEY: 'progress',
    PROGRESS_TOMBSTONE_DECK: 'progress:__deleted__',
    syncState: {
      enabled: true,
      key: 'owner',
      client: { from: () => ({ upsert: queryBuilder }) },
    },
    state: { settings: {} },
    readSettings: () => ({}),
    settingsSignature: () => 'sig',
    syncDeckKey: signature => `progress:${signature}`,
    getLocalProgressState: () => localProgress,
  });

  vm.runInContext(`
    let pendingProgressCloudPayload = null;
    let progressCloudTimer = null;
    let progressCloudWriteQueue = Promise.resolve();
    ${sliceBetween('function enqueueProgressCloudWrite', '// ——— \u9898\u89e3/\u8bc4\u8bba\u4e91\u7aef\u540c\u6b65')}
    this.api = {
      deleteProgressFromCloud,
      flushProgressToCloud,
      setPending(value) { pendingProgressCloudPayload = value; },
    };
  `, context);

  const deleting = context.api.deleteProgressFromCloud({ roundId: 111 });
  context.api.setPending({ savedAt: 222, signature: 'new', settings: {}, pool: [{ id: 'q1' }] });
  const saving = context.api.flushProgressToCloud();
  await Promise.all([deleting, saving]);

  assert.deepEqual(events, [
    'start:progress:__deleted__',
    'end:progress:__deleted__',
    'start:progress:new',
    'end:progress:new',
  ]);
  const tombstone = rows[0].state;
  assert.equal(tombstone._progressDeleted, true);
  assert.equal(tombstone.savedAt, tombstone.deletedAt);

  const stored = JSON.parse(localStorage.getItem('unused-progress-key') || 'null');
  assert.equal(stored, null);
  assert.equal(localProgress.savedAt, 222);
  // markProgressPayloadSynced writes through localStorage; capture that final value.
  const writtenValues = [];
  localStorage.setItem = (key, value) => writtenValues.push(JSON.parse(value));
  context.api.setPending({ savedAt: 222, signature: 'next', settings: {}, pool: [{ id: 'q1' }] });
  await context.api.flushProgressToCloud();
  assert.equal(writtenValues.at(-1)._cloudUpdatedAt, Date.parse('2026-01-02T03:04:05.000Z'));
  assert.equal(writtenValues.at(-1)._cloudSavedAt, 222);
});

test('a newer cloud tombstone removes legacy local progress', async () => {
  const localStorage = createStorage({ progress: JSON.stringify({ savedAt: 100, pool: [{ id: 'old' }] }) });
  const context = vm.createContext({
    console,
    localStorage,
    PROGRESS_KEY: 'progress',
    PROGRESS_TOMBSTONE_DECK: 'progress:__deleted__',
    syncState: {
      enabled: true,
      key: 'owner',
      client: {
        from: () => {
          const chain = {
            select: () => chain,
            eq: () => chain,
            like: () => chain,
            order: () => chain,
            limit: () => chain,
            maybeSingle: async () => ({
              data: {
                deck_key: 'progress:__deleted__',
                state: { _progressDeleted: true, savedAt: 200, deletedAt: 200 },
                updated_at: '2026-01-02T03:04:05.000Z',
              },
              error: null,
            }),
          };
          return chain;
        },
      },
    },
    getLocalProgressState: () => JSON.parse(localStorage.getItem('progress') || 'null'),
  });

  vm.runInContext(`
    ${sliceBetween('async function loadCurrentProgressFromCloud()', 'function saveProgressToCloud')}
    this.loadCurrentProgressFromCloud = loadCurrentProgressFromCloud;
  `, context);

  const result = await context.loadCurrentProgressFromCloud();
  assert.deepEqual({ applied: result.applied, deleted: result.deleted }, { applied: true, deleted: true });
  assert.equal(localStorage.getItem('progress'), null);
});

test('progress clearing absorbs network failures and still resolves false', async () => {
  const context = vm.createContext({
    console: { warn: () => {} },
    clearTimeout,
    PROGRESS_TOMBSTONE_DECK: 'progress:__deleted__',
    syncState: {
      enabled: true,
      key: 'owner',
      client: {
        from: () => ({ upsert: () => Promise.reject(new Error('offline')) }),
      },
    },
  });

  vm.runInContext(`
    let pendingProgressCloudPayload = null;
    let progressCloudTimer = null;
    let progressCloudWriteQueue = Promise.resolve();
    ${sliceBetween('function enqueueProgressCloudWrite', '// ——— \u9898\u89e3/\u8bc4\u8bba\u4e91\u7aef\u540c\u6b65')}
    this.deleteProgressFromCloud = deleteProgressFromCloud;
  `, context);

  assert.equal(await context.deleteProgressFromCloud({ roundId: 1 }), false);
});

test('question attempts use the atomic RPC result without table fallback', async () => {
  const calls = [];
  const client = {
    rpc: async (name, params) => {
      calls.push({ name, params });
      return { data: { total: 41, correct: 30, updatedAt: 1234 }, error: null };
    },
    from: () => { throw new Error('table fallback must not run'); },
  };
  const context = vm.createContext({
    console,
    isStandaloneMode: () => false,
    initSupabaseClient: () => client,
    nowTs: () => 1234,
    isMissingRpcError: () => false,
  });

  vm.runInContext(`
    ${sliceBetween('const questionStatsCache =', 'function formatQuestionStats')}
    this.recordQuestionAttemptToCloud = recordQuestionAttemptToCloud;
  `, context);

  const result = await context.recordQuestionAttemptToCloud('q-1', true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [{
    name: 'record_question_attempt',
    params: { p_question_id: 'q-1', p_is_correct: true },
  }]);
  assert.deepEqual(
    { total: result.total, correct: result.correct, fetchedAt: result._fetchedAt },
    { total: 41, correct: 30, fetchedAt: 1234 },
  );
});

test('admin RPC boolean false is not treated as a successful password change', async () => {
  const localStorage = createStorage({
    admin_password: JSON.stringify({ password: 'legacy', updatedAt: 1 }),
    admin_password_ts: '1',
  });
  const sessionStorage = createStorage();
  let rpcResult = { data: false, error: null };
  const client = { rpc: async () => rpcResult };
  const context = vm.createContext({
    console,
    localStorage,
    sessionStorage,
    ADMIN_PASSWORD_STORAGE: 'admin_password',
    ADMIN_PASSWORD_TS_STORAGE: 'admin_password_ts',
    ADMIN_CREDENTIAL_STORAGE: 'admin_credential',
    ADMIN_AUTH_KEY: 'admin_auth',
    ADMIN_PASSWORD_SYNC_KEY: '__site_admin_settings_v1__',
    ADMIN_PASSWORD_DECK_KEY: '__admin_password_v1__',
    ADMIN_PASSWORD: 'default-password',
    initSupabaseClient: () => client,
  });

  vm.runInContext(`
    ${sliceBetween('const adminPasswordState =', 'const syncState =')}
    this.api = { changeAdminPassword, verifyAdminPassword };
  `, context);

  assert.equal(await context.api.changeAdminPassword('legacy', 'new-password'), false);
  assert.equal(localStorage.has('admin_password'), true);
  assert.equal(sessionStorage.has('admin_credential'), false);

  rpcResult = { data: { success: true }, error: null };
  assert.equal(await context.api.changeAdminPassword('legacy', 'new-password'), true);
  assert.equal(localStorage.has('admin_password'), false);
  assert.equal(localStorage.has('admin_password_ts'), false);
  assert.equal(sessionStorage.getItem('admin_credential'), 'new-password');
  assert.equal(sessionStorage.getItem('admin_auth'), 'ok');
});
