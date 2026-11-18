const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const syncSource = fs.readFileSync(path.join(projectRoot, 'sync.js'), 'utf8');
const appSource = fs.readFileSync(path.join(projectRoot, 'app.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(projectRoot, 'ui.js'), 'utf8');
const retryStorageKey = 'quiz_pending_history_archive_v1';

function createStorage(options = {}) {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      const text = String(value);
      if (options.maxValueLength && text.length > options.maxValueLength) {
        throw new Error('quota exceeded');
      }
      values.set(key, text);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function makeRecord(text = 'question', savedAt = 1700000000000) {
  return {
    id: `history:${savedAt}`,
    roundId: savedAt,
    savedAt,
    settings: { mode: 'normal', type: 'all', topics: ['topic'] },
    pool: [{ id: 'q1', text }],
    currentIndex: 0,
    history: [{ id: 'q1', roundIndex: 0, result: 'right' }],
    _historyMeta: { finished: false, createdAt: savedAt },
  };
}

function requestBody(syncKey, record) {
  return JSON.stringify({
    sync_key: syncKey,
    deck_key: record.id,
    state: record,
    updated_at: new Date(record.savedAt).toISOString(),
  });
}

function createHistoryRuntime(options = {}) {
  const storage = options.storage || createStorage();
  const warnings = [];
  const syncState = {
    enabled: options.enabled !== false,
    key: options.syncKey || '\u540c\u6b65\u7801-\u6d4b\u8bd5',
    client: {},
  };
  const context = vm.createContext({
    console: { warn: (...args) => warnings.push(args) },
    localStorage: storage,
    syncState,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_KEY: 'anon-key',
    SYNC_KEY_HEADER: 'x-quiz-sync-key',
    HISTORY_DECK_PREFIX: 'history:',
    HISTORY_MAX: 5,
    HISTORY_KEY: 'quiz_history_v1',
    nowTs: () => 1700000000000,
    utf8ByteLength: value => Buffer.byteLength(String(value), 'utf8'),
    encodeBase64Utf8: value => Buffer.from(String(value), 'utf8').toString('base64'),
    fetch: options.fetch || (async () => ({ ok: true, status: 201 })),
    getLocalProgressState: () => options.localProgress || null,
    buildHistoryRecord: (progress, finished) => {
      if (!progress) return null;
      const record = { ...progress };
      record.id = record.id || `history:${record.roundId || record.savedAt}`;
      record._historyMeta = { ...(record._historyMeta || {}), finished: Boolean(finished) };
      return record;
    },
    isStandaloneMode: () => false,
  });

  const start = syncSource.indexOf('const HISTORY_ARCHIVE_KEEPALIVE_MAX_BYTES');
  assert.notEqual(start, -1, 'history archive section not found');
  const section = syncSource.slice(start);
  vm.runInContext(`${section}\nthis.__historyExports = {
    archiveRoundCloudBeacon,
    archiveRound,
    retryPendingHistoryArchive,
    readPendingHistoryArchives,
    HISTORY_ARCHIVE_KEEPALIVE_MAX_BYTES,
  };`, context, { filename: 'sync-history-section.js' });
  context.__trimCalls = 0;
  vm.runInContext('trimHistoryCloud = async () => { __trimCalls += 1; };', context);
  return { context, storage, warnings, api: context.__historyExports, syncState };
}

test('normal archive uses a standard fetch and sends the UTF-8 sync key header', async () => {
  let request;
  const runtime = createHistoryRuntime({
    fetch: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 201 };
    },
  });

  const result = await runtime.api.archiveRoundCloudBeacon(makeRecord());

  assert.equal(result, true);
  assert.equal(Object.hasOwn(request.options, 'keepalive'), false);
  assert.equal(
    request.options.headers['x-quiz-sync-key'],
    Buffer.from(runtime.syncState.key, 'utf8').toString('base64'),
  );
  assert.equal(runtime.context.__trimCalls, 1);
});

test('non-2xx response returns false, keeps a retry record, and never trims', async () => {
  const runtime = createHistoryRuntime({
    fetch: async () => ({ ok: false, status: 401 }),
  });

  const result = await runtime.api.archiveRoundCloudBeacon(makeRecord());

  assert.equal(result, false);
  assert.equal(runtime.context.__trimCalls, 0);
  assert.equal(runtime.api.readPendingHistoryArchives()[0].record.id, makeRecord().id);
});

test('unload archive at exactly 60 KiB uses keepalive and clears its retry record', async () => {
  let requestOptions;
  const runtime = createHistoryRuntime({
    fetch: async (url, options) => {
      requestOptions = options;
      return { ok: true, status: 201 };
    },
  });
  const record = makeRecord('');
  const baseBytes = Buffer.byteLength(requestBody(runtime.syncState.key, record), 'utf8');
  record.pool[0].text = 'a'.repeat(runtime.api.HISTORY_ARCHIVE_KEEPALIVE_MAX_BYTES - baseBytes);
  assert.equal(
    Buffer.byteLength(requestBody(runtime.syncState.key, record), 'utf8'),
    runtime.api.HISTORY_ARCHIVE_KEEPALIVE_MAX_BYTES,
  );

  const result = await runtime.api.archiveRoundCloudBeacon(record, { unload: true });

  assert.equal(result, true);
  assert.equal(requestOptions.keepalive, true);
  assert.equal(runtime.storage.getItem(retryStorageKey), null);
  assert.equal(runtime.context.__trimCalls, 1);
});

test('unload archive above 60 KiB does not fetch and is retried normally later', async () => {
  let fetchCalls = 0;
  let lastOptions;
  const runtime = createHistoryRuntime({
    fetch: async (url, options) => {
      fetchCalls += 1;
      lastOptions = options;
      return { ok: true, status: 201 };
    },
  });
  const record = makeRecord('\u9898'.repeat(25000));

  const unloadResult = await runtime.api.archiveRoundCloudBeacon(record, { unload: true });
  assert.equal(unloadResult, false);
  assert.equal(fetchCalls, 0);
  assert.equal(runtime.api.readPendingHistoryArchives()[0].record.id, record.id);

  const retryResult = await runtime.api.retryPendingHistoryArchive();
  assert.equal(retryResult, true);
  assert.equal(fetchCalls, 1);
  assert.equal(Object.hasOwn(lastOptions, 'keepalive'), false);
  assert.equal(runtime.storage.getItem(retryStorageKey), null);
  assert.equal(runtime.context.__trimCalls, 1);
});

test('large retry falls back to a small marker when duplicate storage exceeds quota', async () => {
  const progress = makeRecord('\u9898'.repeat(25000));
  const storage = createStorage({ maxValueLength: 1000 });
  let fetchCalls = 0;
  const runtime = createHistoryRuntime({
    storage,
    localProgress: progress,
    fetch: async () => {
      fetchCalls += 1;
      return { ok: true, status: 201 };
    },
  });

  assert.equal(await runtime.api.archiveRoundCloudBeacon(progress, { unload: true }), false);
  const pending = runtime.api.readPendingHistoryArchives()[0];
  assert.equal(pending.record, undefined);
  assert.equal(pending.recordId, progress.id);
  assert.equal(await runtime.api.retryPendingHistoryArchive(), true);
  assert.equal(fetchCalls, 1);
  assert.equal(storage.getItem(retryStorageKey), null);
});

test('consecutive offline rounds stay queued and are all retried', async () => {
  let online = false;
  const requests = [];
  const runtime = createHistoryRuntime({
    fetch: async (url, options) => {
      requests.push(JSON.parse(options.body).deck_key);
      return { ok: online, status: online ? 201 : 503 };
    },
  });
  const first = makeRecord('first', 1700000000001);
  const second = makeRecord('second', 1700000000002);

  assert.equal(await runtime.api.archiveRoundCloudBeacon(first), false);
  assert.equal(await runtime.api.archiveRoundCloudBeacon(second), false);
  assert.deepEqual(
    Array.from(runtime.api.readPendingHistoryArchives(), entry => entry.recordId).sort(),
    [first.id, second.id].sort(),
  );

  online = true;
  assert.equal(await runtime.api.retryPendingHistoryArchive(), true);
  assert.equal(runtime.storage.getItem(retryStorageKey), null);
  assert.deepEqual(requests, [first.id, second.id, second.id, first.id]);
});

test('archive is safe to discard only when a complete retry record is durable', async () => {
  const record = makeRecord('offline');
  const durableRuntime = createHistoryRuntime({
    fetch: async () => ({ ok: false, status: 503 }),
  });
  assert.equal(await durableRuntime.api.archiveRound(false, record), true);
  assert.equal(durableRuntime.api.readPendingHistoryArchives()[0].record.id, record.id);

  const markerOnlyRuntime = createHistoryRuntime({
    storage: createStorage({ maxValueLength: 1000 }),
    localProgress: makeRecord('\u9898'.repeat(25000)),
    fetch: async () => ({ ok: false, status: 503 }),
  });
  const largeRecord = makeRecord('\u9898'.repeat(25000));
  assert.equal(await markerOnlyRuntime.api.archiveRound(false, largeRecord), false);
  const marker = markerOnlyRuntime.api.readPendingHistoryArchives()[0];
  assert.equal(marker.record, undefined);
  assert.equal(marker.recordId, largeRecord.id);
});

test('pagehide and beforeunload share one unload attempt until pageshow', () => {
  const listeners = {};
  let archives = 0;
  let progressFlushes = 0;
  let metaFlushes = 0;
  const start = appSource.indexOf('let pageExitHandled = false;');
  const end = appSource.indexOf('const page =', start);
  assert.ok(start >= 0 && end > start, 'page exit section not found');
  const context = vm.createContext({
    window: { addEventListener: (name, callback) => { listeners[name] = callback; } },
    document: { body: { dataset: { page: 'practice' } } },
    getLocalProgressState: () => ({ id: 'progress' }),
    archiveRoundIfAttempted: (progress, options) => {
      archives += 1;
      assert.equal(options.unload, true);
    },
    flushProgressToCloud: () => { progressFlushes += 1; },
    flushMetaToCloud: () => { metaFlushes += 1; },
  });
  vm.runInContext(appSource.slice(start, end), context, { filename: 'app-page-exit.js' });

  listeners.beforeunload();
  listeners.pagehide();
  assert.deepEqual([archives, progressFlushes, metaFlushes], [1, 1, 1]);

  listeners.pageshow();
  listeners.pagehide();
  assert.deepEqual([archives, progressFlushes, metaFlushes], [2, 2, 2]);
});

test('all normal archive call sites await completion', () => {
  const block = (source, from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
  assert.match(block(syncSource, 'async function initSync', 'function loadGlobalCloudAssetsInBackground'), /retryPendingHistoryArchive\(\)\.catch/);
  assert.match(block(appSource, "$('restartBtn')", "$('manageQuestionsBtn')"), /async[\s\S]*await archiveRoundIfAttempted/);
  assert.match(block(uiSource, 'async function goPractice', 'function modeName'), /await archiveRoundIfAttempted/);
  assert.match(block(uiSource, 'async function finishQuiz', 'function adminTopicOptions'), /await archiveRound\(/);
  assert.match(block(uiSource, 'async function resumeFromHistory', '// ==='), /await archiveRoundIfAttempted/);
  assert.match(block(uiSource, 'async function resumeFromHistory', '// ==='), /await clearSavedProgress/);
  assert.match(uiSource, /const resumed = await resumeFromHistory\(full\)/);
  assert.match(block(appSource, "$('restartBtn')", "$('manageQuestionsBtn')"), /if \(!archiveSafe\)[\s\S]*return;[\s\S]*clearSavedProgress/);
  assert.match(block(uiSource, 'async function goPractice', 'function modeName'), /if \(!archiveSafe\)[\s\S]*return;[\s\S]*clearSavedProgress/);
  assert.match(block(uiSource, 'async function finishQuiz', 'function adminTopicOptions'), /if \(!archiveSafe\)[\s\S]*return;[\s\S]*clearSavedProgress/);
  assert.match(block(uiSource, 'async function resumeFromHistory', '// ==='), /if \(!archiveSafe\)[\s\S]*return false;[\s\S]*clearSavedProgress/);
});
