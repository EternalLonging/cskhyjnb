// =============================================================================
// sync.js — Supabase 云端同步、认证门控、管理密码、题解/评论云同步
// 依赖：config.js, utils.js, data.js
// =============================================================================

const adminPasswordState = {
  loaded: false,
  loading: null,
  password: ADMIN_PASSWORD,
  updatedAt: 0,
};

function readLocalAdminPasswordRecord() {
  try {
    const raw = localStorage.getItem(ADMIN_PASSWORD_STORAGE);
    if (!raw) return { password: '', updatedAt: 0 };
    if (raw.trim().startsWith('{')) {
      const parsed = JSON.parse(raw);
      return {
        password: String(parsed.password || '').trim(),
        updatedAt: Number(parsed.updatedAt || 0),
      };
    }
    // 兼容旧版本：以前只保存纯文本密码。
    return {
      password: String(raw || '').trim(),
      updatedAt: Number(localStorage.getItem(ADMIN_PASSWORD_TS_STORAGE) || 0),
    };
  } catch (err) {
    return { password: '', updatedAt: 0 };
  }
}

function writeLocalAdminPasswordRecord(password, updatedAt = Date.now()) {
  const cleaned = String(password || '').trim();
  if (!cleaned) return false;
  const ts = Number(updatedAt || Date.now());
  localStorage.setItem(ADMIN_PASSWORD_STORAGE, JSON.stringify({ password: cleaned, updatedAt: ts }));
  localStorage.setItem(ADMIN_PASSWORD_TS_STORAGE, String(ts));
  adminPasswordState.password = cleaned;
  adminPasswordState.updatedAt = ts;
  adminPasswordState.loaded = true;
  return true;
}

function getAdminPassword() {
  const local = readLocalAdminPasswordRecord();
  if (local.password) return local.password;
  return adminPasswordState.password || ADMIN_PASSWORD;
}

function saveAdminPasswordToCloud(password, updatedAt = Date.now()) {
  const cleaned = String(password || '').trim();
  if (!cleaned) return;
  const client = initSupabaseClient();
  if (!client) return;
  const state = { password: cleaned, updatedAt: Number(updatedAt || Date.now()) };
  client.from('study_progress').upsert({
    sync_key: ADMIN_PASSWORD_SYNC_KEY,
    deck_key: ADMIN_PASSWORD_DECK_KEY,
    state,
    updated_at: new Date(state.updatedAt).toISOString(),
  }).then(({ error }) => {
    if (error) console.warn('保存管理密码到云端失败：', error);
  });
}

async function loadAdminPasswordFromCloud() {
  if (adminPasswordState.loading) return adminPasswordState.loading;
  adminPasswordState.loading = (async () => {
    const local = readLocalAdminPasswordRecord();
    if (local.password) {
      adminPasswordState.password = local.password;
      adminPasswordState.updatedAt = Number(local.updatedAt || 0);
    }
    const client = initSupabaseClient();
    if (!client) {
      adminPasswordState.loaded = true;
      return getAdminPassword();
    }
    try {
      const localTs = Number(local.updatedAt || 0);
      if (local.password && shouldSkipCloudCheck(ADMIN_PASSWORD_CLOUD_CHECK_KEY)) {
        adminPasswordState.loaded = true;
        return getAdminPassword();
      }
      const { data: metaRow, error: metaError } = await client
        .from('study_progress')
        .select('updated_at')
        .eq('sync_key', ADMIN_PASSWORD_SYNC_KEY)
        .eq('deck_key', ADMIN_PASSWORD_DECK_KEY)
        .maybeSingle();
      if (metaError) throw metaError;
      markCloudChecked(ADMIN_PASSWORD_CLOUD_CHECK_KEY);
      const remoteTsHint = Number(new Date(metaRow?.updated_at || 0).getTime() || 0);
      if (local.password && remoteTsHint && remoteTsHint <= localTs) {
        adminPasswordState.loaded = true;
        return getAdminPassword();
      }
      const { data, error } = await client
        .from('study_progress')
        .select('state,updated_at')
        .eq('sync_key', ADMIN_PASSWORD_SYNC_KEY)
        .eq('deck_key', ADMIN_PASSWORD_DECK_KEY)
        .maybeSingle();
      if (error) throw error;
      const remoteState = data?.state || null;
      const remotePassword = String(remoteState?.password || '').trim();
      const remoteTs = Number(remoteState?.updatedAt || new Date(data?.updated_at || 0).getTime() || 0);
      const localNow = readLocalAdminPasswordRecord();
      if (remotePassword && remoteTs >= Number(localNow.updatedAt || 0)) {
        writeLocalAdminPasswordRecord(remotePassword, remoteTs || Date.now());
      } else if (localNow.password && Number(localNow.updatedAt || 0) > remoteTs) {
        saveAdminPasswordToCloud(localNow.password, Number(localNow.updatedAt || Date.now()));
      } else if (!remotePassword && localNow.password) {
        saveAdminPasswordToCloud(localNow.password, Number(localNow.updatedAt || Date.now()));
      }
    } catch (err) {
      console.warn('加载云端管理密码失败：', err);
    }
    adminPasswordState.loaded = true;
    return getAdminPassword();
  })().finally(() => {
    adminPasswordState.loading = null;
  });
  return adminPasswordState.loading;
}

function setAdminPassword(newPassword) {
  const cleaned = String(newPassword || '').trim();
  if (!cleaned) return false;
  const ts = Date.now();
  writeLocalAdminPasswordRecord(cleaned, ts);
  saveAdminPasswordToCloud(cleaned, ts);
  return true;
}

const syncState = {
  client: null,
  key: '',
  enabled: false,
  accessMode: '',
  status: '本地模式',
};

const noteFetchState = {
  fetched: new Set(),
  loading: new Set(),
};

let pendingProgressCloudPayload = null;
let progressCloudTimer = null;

function refreshHomeAfterCloudUpdate() {
  if (!isHomePage()) return;
  try { updateStats(); } catch (err) {}
  try { initTopics(); } catch (err) {}
}

// ——— 题库修改云端同步 ———

async function loadQuestionEditsFromCloud(options = {}) {
  const client = initSupabaseClient();
  if (!client) return false;
  const localEdits = loadQuestionEdits();
  const localTs = Number(localEdits.updatedAt || 0);
  try {
    if (!options.force && shouldSkipCloudCheck(QUESTION_EDIT_CLOUD_CHECK_KEY)) return false;
    const { data: metaRow, error: metaError } = await client
      .from('study_progress')
      .select('updated_at')
      .eq('sync_key', QUESTION_EDIT_SYNC_KEY)
      .eq('deck_key', QUESTION_EDIT_DECK_KEY)
      .maybeSingle();
    if (metaError) throw metaError;
    markCloudChecked(QUESTION_EDIT_CLOUD_CHECK_KEY);
    const remoteTsHint = Number(new Date(metaRow?.updated_at || 0).getTime() || 0);
    if (!options.force && remoteTsHint && remoteTsHint <= localTs) return false;

    const { data, error } = await client
      .from('study_progress')
      .select('state,updated_at')
      .eq('sync_key', QUESTION_EDIT_SYNC_KEY)
      .eq('deck_key', QUESTION_EDIT_DECK_KEY)
      .maybeSingle();
    if (error) throw error;
    if (data && data.state) {
      const remote = normalizeQuestionEdits(data.state);
      remote.updatedAt = Number(remote.updatedAt || new Date(data.updated_at || 0).getTime() || 0);
      const merged = mergeQuestionEdits(localEdits, remote);
      const changed = Number(merged.updatedAt || 0) > localTs;
      if (changed) {
        localStorage.setItem(QUESTION_EDIT_KEY, JSON.stringify(merged));
        refreshQuestionBank();
        refreshHomeAfterCloudUpdate();
      }
      return changed;
    }
  } catch (err) {
    console.warn('加载题库修改失败：', err);
  }
  return false;
}

function saveQuestionEditsToCloud(edits) {
  const client = initSupabaseClient();
  if (!client) return;
  const payload = normalizeQuestionEdits(edits);
  payload.updatedAt = Number(payload.updatedAt || Date.now());
  client.from('study_progress').upsert({
    sync_key: QUESTION_EDIT_SYNC_KEY,
    deck_key: QUESTION_EDIT_DECK_KEY,
    state: payload,
    updated_at: new Date(payload.updatedAt).toISOString(),
  }).then(({ error }) => {
    if (error) console.warn('保存题库修改失败：', error);
  });
}

function saveQuestionEdits(edits) {
  const normalized = normalizeQuestionEdits(edits);
  normalized.updatedAt = Date.now();
  const saved = saveQuestionEditsLocal(normalized);
  saveQuestionEditsToCloud(saved);
  localStorage.removeItem(PROGRESS_KEY);
  localStorage.removeItem(FORCE_RESTART_KEY);
  return saved;
}

// ——— 认证/门控 ———

function setupPasswordGate(onReady) {
  // 新版删除了统一访问密码，改为"同步码 + 邀请码"。
  document.body.classList.remove('auth-locked');
  setupSyncGate(onReady);
}

function readInviteAuthMap() {
  try { return JSON.parse(localStorage.getItem(INVITE_AUTH_STORAGE) || '{}') || {}; } catch (err) { return {}; }
}
function inviteAuthId(syncKey) {
  const key = String(syncKey || '').trim();
  return key ? `sync:${key}` : SINGLE_MODE_AUTH_ID;
}
function markSyncInviteAuthorized(syncKey) {
  const map = readInviteAuthMap();
  const raw = String(syncKey || '').trim();
  map[inviteAuthId(raw)] = true;
  // 兼容旧版：以前直接用同步码作为本地验证键。
  if (raw) map[raw] = true;
  localStorage.setItem(INVITE_AUTH_STORAGE, JSON.stringify(map));
}
function isSyncInviteAuthorized(syncKey) {
  const map = readInviteAuthMap();
  const raw = String(syncKey || '').trim();
  return Boolean(map[inviteAuthId(raw)] || (raw && map[raw]));
}
function markSingleInviteAuthorized() {
  const map = readInviteAuthMap();
  map[SINGLE_MODE_AUTH_ID] = true;
  localStorage.setItem(INVITE_AUTH_STORAGE, JSON.stringify(map));
}
function isSingleInviteAuthorized() {
  return Boolean(readInviteAuthMap()[SINGLE_MODE_AUTH_ID]);
}
// ---- 一人一码邀请系统（新版 RPC） ----

async function consumeInviteCode(code, identifier) {
  const client = initSupabaseClient();
  if (!client) throw new Error('无法连接数据库');
  const { data, error } = await client.rpc('consume_invite_code', {
    p_code: (code || '').trim(),
    p_identifier: (identifier || '').trim(),
  });
  if (error) throw error;
  if (!data || !data.success) throw new Error((data && data.error) || '邀请码验证失败');
  return data;
}

async function adminCreateInviteCode(adminPassword, code, options) {
  options = options || {};
  const client = initSupabaseClient();
  if (!client) throw new Error('无法连接数据库');
  const { data, error } = await client.rpc('admin_create_invite_code', {
    p_admin_password: adminPassword,
    p_code: (code || '').trim(),
    p_max_uses: Math.max(1, Number(options.maxUses) || 1),
    p_expires_at: options.expiresAt || null,
    p_assigned_to: (options.assignedTo || '').trim() || null,
    p_notes: (options.notes || '').trim() || null,
  });
  if (error) throw error;
  if (!data || !data.success) throw new Error((data && data.error) || '创建失败');
  return data;
}

async function adminListInviteCodes(adminPassword) {
  const client = initSupabaseClient();
  if (!client) throw new Error('无法连接数据库');
  const { data, error } = await client.rpc('admin_list_invite_codes', {
    p_admin_password: adminPassword,
  });
  if (error) throw error;
  if (!data || !data.success) throw new Error((data && data.error) || '获取列表失败');
  return data;
}

async function adminUpdateInviteCode(adminPassword, code, newStatus) {
  const client = initSupabaseClient();
  if (!client) throw new Error('无法连接数据库');
  const { data, error } = await client.rpc('admin_update_invite_code', {
    p_admin_password: adminPassword,
    p_code: (code || '').trim(),
    p_new_status: newStatus,
  });
  if (error) throw error;
  if (!data || !data.success) throw new Error((data && data.error) || '操作失败');
  return data;
}


// ——— 课程标签 ———

function readCourseTags() {
  try {
    const raw = JSON.parse(localStorage.getItem(COURSE_TAGS_STORAGE) || '{}') || {};
    if (raw && raw.tags && typeof raw.tags === 'object') return raw.tags;
    return raw && typeof raw === 'object' ? raw : {};
  } catch (err) { return {}; }
}
function localCourseTagsUpdatedAt() {
  try {
    const raw = JSON.parse(localStorage.getItem(COURSE_TAGS_STORAGE) || '{}') || {};
    return Number(raw.updatedAt || localStorage.getItem(COURSE_TAGS_TS_STORAGE) || 0);
  } catch (err) { return Number(localStorage.getItem(COURSE_TAGS_TS_STORAGE) || 0); }
}
function saveCourseTagsLocal(tags, updatedAt = Date.now()) {
  const state = { tags: tags || {}, updatedAt: Number(updatedAt || Date.now()) };
  localStorage.setItem(COURSE_TAGS_STORAGE, JSON.stringify(state));
  localStorage.setItem(COURSE_TAGS_TS_STORAGE, String(state.updatedAt));
}
async function loadCourseTagsFromCloud(options = {}) {
  const client = initSupabaseClient();
  if (!client) return false;
  const localTs = localCourseTagsUpdatedAt();
  try {
    if (!options.force && shouldSkipCloudCheck(COURSE_TAGS_CLOUD_CHECK_KEY)) return false;
    const { data: metaRow, error: metaError } = await client.from('study_progress')
      .select('updated_at')
      .eq('sync_key', COURSE_TAGS_SYNC_KEY)
      .eq('deck_key', COURSE_TAGS_DECK_KEY)
      .maybeSingle();
    if (metaError) throw metaError;
    markCloudChecked(COURSE_TAGS_CLOUD_CHECK_KEY);
    const remoteTsHint = Number(new Date(metaRow?.updated_at || 0).getTime() || 0);
    if (!options.force && remoteTsHint && remoteTsHint <= localTs) return false;

    const { data, error } = await client.from('study_progress')
      .select('state,updated_at')
      .eq('sync_key', COURSE_TAGS_SYNC_KEY)
      .eq('deck_key', COURSE_TAGS_DECK_KEY)
      .maybeSingle();
    if (error) throw error;
    const state = data?.state || {};
    const remoteTags = state.tags || null;
    const remoteTs = Number(state.updatedAt || new Date(data?.updated_at || 0).getTime() || 0);
    if (remoteTags && remoteTs >= localTs) {
      saveCourseTagsLocal(remoteTags, remoteTs || Date.now());
      refreshHomeAfterCloudUpdate();
      return remoteTs > localTs;
    }
  } catch (err) { console.warn('加载课程标签失败：', err); }
  return false;
}
function saveCourseTagsToCloud(tags) {
  const client = initSupabaseClient();
  if (!client) return;
  const state = { tags: tags || {}, updatedAt: Date.now() };
  saveCourseTagsLocal(state.tags, state.updatedAt);
  client.from('study_progress').upsert({
    sync_key: COURSE_TAGS_SYNC_KEY,
    deck_key: COURSE_TAGS_DECK_KEY,
    state,
    updated_at: new Date(state.updatedAt).toISOString(),
  }).then(({ error }) => { if (error) console.warn('保存课程标签失败：', error); });
}
function addTagToCourse(course, tag) {
  const c = String(course || '').trim();
  const t = String(tag || '').trim();
  if (!c || !t) return;
  const tags = readCourseTags();
  tags[c] = [...new Set([...(tags[c] || []), t])];
  saveCourseTagsToCloud(tags);
}
function removeTagFromCourse(course, tag) {
  const c = String(course || '').trim();
  const t = String(tag || '').trim();
  const tags = readCourseTags();
  tags[c] = (tags[c] || []).filter(x => x !== t);
  saveCourseTagsToCloud(tags);
}

// ——— 进度同步辅助 ———

function syncDeckKey(signature) {
  return `progress:${signature}`;
}

function localMetaUpdatedAt() {
  return Number(localStorage.getItem(META_TS_KEY) || 0);
}

function setLocalMetaUpdatedAt(ts = Date.now()) {
  localStorage.setItem(META_TS_KEY, String(ts));
}

function getLocalProgressState() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null');
  } catch (err) {
    return null;
  }
}

function isStandaloneMode() {
  return syncState.accessMode === ACCESS_MODE_SINGLE || localStorage.getItem(ACCESS_MODE_STORAGE) === ACCESS_MODE_SINGLE;
}

// ——— 同步状态徽章和模式选择覆盖层 ———

function renderSyncBadge() {
  let badge = document.getElementById('syncBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'syncBadge';
    badge.className = 'sync-badge';
    document.body.appendChild(badge);
  }
  const isSingle = isStandaloneMode();
  const keyText = isSingle ? '单机模式' : (syncState.key ? `同步码：${escapeHtml(syncState.key)}` : '未设置同步码');
  const statusText = isSingle ? '不发题解/评论' : escapeHtml(syncState.status || '本地模式');
  badge.innerHTML = `
    <span>${keyText}</span>
    <b>${statusText}</b>
    <button id="changeSyncKeyBtn" type="button">切换模式</button>
  `;
  const btn = document.getElementById('changeSyncKeyBtn');
  if (btn) {
    btn.addEventListener('click', () => {
      if (!confirm('切换后会重新选择"云端同步/单机模式"，确定切换吗？')) return;
      localStorage.removeItem(ACCESS_MODE_STORAGE);
      localStorage.removeItem(SYNC_KEY_STORAGE);
      location.reload();
    });
  }
}

function showAccessModeOverlay(onReady) {
  const overlay = document.createElement('div');
  overlay.id = 'accessModeOverlay';
  overlay.className = 'auth-overlay';
  overlay.innerHTML = `
    <div class="auth-card sync-card">
      <h1>选择使用模式</h1>
      <p>云端同步模式需要输入同步码和邀请码，可同步个人进度；题解和评论全站共享。单机模式也需要输入邀请码，只同步题库更新，不同步个人进度，也不能发布/编辑题解和评论。</p>
      <button id="chooseSyncMode" class="primary" type="button">云端同步模式</button>
      <button id="chooseSingleMode" class="ghost" type="button">单机模式</button>
      <span class="auth-hint">单机模式会读取云端题库修改，但换设备不会同步做题进度。</span>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('chooseSyncMode')?.addEventListener('click', () => {
    overlay.remove();
    showSyncOverlay(onReady);
  });
  document.getElementById('chooseSingleMode')?.addEventListener('click', async () => {
    overlay.remove();
    if (isSingleInviteAuthorized()) {
      await enterSingleMode(onReady, { foreground: true });
    } else {
      showSingleInviteOverlay(onReady);
    }
  });
}

async function enterSingleMode(onReady, options = {}) {
  localStorage.setItem(ACCESS_MODE_STORAGE, ACCESS_MODE_SINGLE);
  syncState.accessMode = ACCESS_MODE_SINGLE;
  syncState.key = '';
  syncState.enabled = false;
  syncState.status = options.foreground ? '正在加载题库更新...' : '单机模式：本地题库，后台检查更新';
  renderSyncBadge();
  if (options.foreground) await loadStandaloneCloudAssets();
  else loadStandaloneCloudAssets({ background: true });
  onReady();
}

function showSingleInviteOverlay(onReady) {
  const overlay = document.createElement('div');
  overlay.id = 'singleInviteOverlay';
  overlay.className = 'auth-overlay';
  overlay.innerHTML = `
    <div class="auth-card sync-card">
      <h1>输入邀请码（一人一码）</h1>
      <p>请输入管理员发给你的邀请码。验证通过后，本设备下次进入单机模式不需要重复输入。</p>
      <input id="singleInviteNameInput" type="text" autocomplete="off" placeholder="姓名/学号（可选）" />
      <input id="singleInviteInput" type="password" autocomplete="off" placeholder="邀请码" />
      <button id="singleInviteSubmit" class="primary" type="button">进入单机模式</button>
      <button id="singleBackModeSelect" class="ghost" type="button">返回选择模式</button>
      <div id="singleInviteError" class="auth-error"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#singleInviteInput');
  const submit = overlay.querySelector('#singleInviteSubmit');
  const error = overlay.querySelector('#singleInviteError');
  const accept = async () => {
    const invite = (input.value || '').trim();
    const nameInput = overlay.querySelector('#singleInviteNameInput');
    const identifier = (nameInput ? (nameInput.value || '').trim() : '') || 'single_mode';
    submit.disabled = true;
    error.textContent = '正在验证邀请码...';
    try {
      await consumeInviteCode(invite, identifier);
      markSingleInviteAuthorized();
      overlay.remove();
      await enterSingleMode(onReady, { foreground: true });
    } catch (err) {
      console.warn(err);
      error.textContent = err.message || '验证失败，请稍后重试。';
      submit.disabled = false;
    }
  };
  submit.addEventListener('click', accept);
  input?.addEventListener('keydown', event => { if (event.key === 'Enter') accept(); });
  overlay.querySelector('#singleBackModeSelect')?.addEventListener('click', () => {
    overlay.remove();
    localStorage.removeItem(ACCESS_MODE_STORAGE);
    showAccessModeOverlay(onReady);
  });
  setTimeout(() => input?.focus(), 50);
}

function showSyncOverlay(onReady) {
  const overlay = document.createElement('div');
  overlay.id = 'syncOverlay';
  overlay.className = 'auth-overlay';
  overlay.innerHTML = `
    <div class="auth-card sync-card">
      <h1>输入同步码和邀请码</h1>
      <p>请输入管理员发给你的邀请码。同一同步码首次使用需验证通过。</p>
      <input id="syncKeyInput" type="text" autocomplete="off" placeholder="同步码，例如：class01 / 自己名字拼音" />
      <input id="syncInviteInput" type="password" autocomplete="off" placeholder="邀请码" />
      <button id="syncSubmit" class="primary" type="button">开启同步</button>
      <button id="backModeSelect" class="ghost" type="button">返回选择模式</button>
      <div id="syncError" class="auth-error"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  const input = document.getElementById('syncKeyInput');
  const inviteInput = document.getElementById('syncInviteInput');
  const submit = document.getElementById('syncSubmit');
  const back = document.getElementById('backModeSelect');
  const error = document.getElementById('syncError');
  const accept = async () => {
    const value = (input.value || '').trim();
    const invite = (inviteInput.value || '').trim();
    if (!value) { error.textContent = '请先输入同步码。'; input.focus(); return; }
    submit.disabled = true;
    error.textContent = '正在验证邀请码...';
    try {
      if (!isSyncInviteAuthorized(value)) {
        await consumeInviteCode(invite, value);
        markSyncInviteAuthorized(value);
      }
      localStorage.setItem(ACCESS_MODE_STORAGE, ACCESS_MODE_SYNC);
      localStorage.setItem(SYNC_KEY_STORAGE, value);
      overlay.remove();
      await initSync(value);
      await loadQuestionEditsFromCloud();
      await loadAdminPasswordFromCloud();
      await loadCourseTagsFromCloud();
      onReady();
    } catch (err) {
      console.warn(err);
      error.textContent = err.message || '验证失败，请稍后重试。';
      submit.disabled = false;
    }
  };
  submit.addEventListener('click', accept);
  [input, inviteInput].forEach(el => el?.addEventListener('keydown', (event) => { if (event.key === 'Enter') accept(); }));
  input?.addEventListener('input', async () => {
    const value = (input.value || '').trim();
    if (value && isSyncInviteAuthorized(value)) {
      inviteInput.value = '';
      inviteInput.disabled = true;
      inviteInput.placeholder = '本设备已验证过这个同步码';
    } else {
      inviteInput.disabled = false;
      inviteInput.placeholder = '邀请码';
    }
  });
  back?.addEventListener('click', () => {
    overlay.remove();
    localStorage.removeItem(ACCESS_MODE_STORAGE);
    showAccessModeOverlay(onReady);
  });
  setTimeout(() => input.focus(), 50);
}

async function setupSyncGate(onReady) {
  const savedMode = localStorage.getItem(ACCESS_MODE_STORAGE);
  const savedKey = (localStorage.getItem(SYNC_KEY_STORAGE) || '').trim();

  // 兼容旧版本：如果以前已经保存过同步码，就继续使用云端同步模式。
  if (!savedMode && savedKey) {
    localStorage.setItem(ACCESS_MODE_STORAGE, ACCESS_MODE_SYNC);
  }

  const mode = localStorage.getItem(ACCESS_MODE_STORAGE);
  if (mode === ACCESS_MODE_SINGLE) {
    if (!isSingleInviteAuthorized()) {
      showSingleInviteOverlay(onReady);
      return;
    }
    await enterSingleMode(onReady, { foreground: false });
    return;
  }

  if (mode === ACCESS_MODE_SYNC) {
    if (!savedKey) {
      showSyncOverlay(onReady);
      return;
    }
    // initSync 内部已经加载题库修改、管理密码、专题标签和进度，这里不要重复请求。
    await initSync(savedKey);
    onReady();
    return;
  }

  showAccessModeOverlay(onReady);
}

// ——— 核心 Supabase 同步操作 ———

async function loadStandaloneCloudAssets(options = {}) {
  // 单机模式轻量连接 Supabase：本地优先显示，只后台拉取全站题库修改、专题标签和管理密码。
  // 不读取/保存个人做题进度，也不开放云端题解和评论。
  const client = initSupabaseClient();
  if (!client) {
    syncState.status = '单机模式：本地题库';
    renderSyncBadge();
    return false;
  }
  const run = async () => {
    try {
      const results = await Promise.allSettled([
        loadQuestionEditsFromCloud(),
        loadAdminPasswordFromCloud(),
        loadCourseTagsFromCloud(),
      ]);
      const changed = results.some(r => r.status === 'fulfilled' && r.value);
      syncState.status = changed ? '单机模式：题库已更新' : '单机模式：本地题库已是最新';
      renderSyncBadge();
      if (changed) refreshHomeAfterCloudUpdate();
      return changed;
    } catch (err) {
      console.warn('单机模式加载题库更新失败：', err);
      syncState.status = '单机模式：使用本地题库';
      renderSyncBadge();
      return false;
    }
  };
  if (options.background) {
    run();
    return false;
  }
  return run();
}

function initSupabaseClient() {
  if (!window.supabase || !window.supabase.createClient) {
    syncState.enabled = false;
    syncState.status = '同步库未加载，已用本地模式';
    renderSyncBadge();
    return null;
  }
  if (!syncState.client) {
    syncState.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return syncState.client;
}

async function initSync(key) {
  syncState.accessMode = ACCESS_MODE_SYNC;
  syncState.key = key;
  const client = initSupabaseClient();
  if (!client) return;
  syncState.enabled = true;
  syncState.status = '正在同步...';
  renderSyncBadge();
  try {
    // 全站题库修改、管理密码、专题标签采用本地优先 + 后台检查，减少首页等待时间。
    loadGlobalCloudAssetsInBackground();
    if (isPracticePage()) {
      // 题目渲染不应被云端请求阻塞：meta（错题ID）后台同步即可。
      // 仅当本地没有进度、且不是强制重开时，才需要等云端进度恢复（换设备首次进入的场景）。
      const needCloudProgress = !localStorage.getItem(FORCE_RESTART_KEY) && !loadProgress();
      if (needCloudProgress) {
        await loadCurrentProgressFromCloud();
        loadMetaFromCloud().catch(() => {});
      } else {
        // 本地已有进度或强制重开：全部放后台，立即渲染题目。
        loadUserMetaInBackground();
      }
    } else {
      loadUserMetaInBackground();
    }
    syncState.status = '已同步';
  } catch (err) {
    console.warn('同步初始化失败：', err);
    syncState.status = '同步失败，先用本地';
  }
  renderSyncBadge();
}

function loadGlobalCloudAssetsInBackground() {
  Promise.allSettled([
    loadQuestionEditsFromCloud(),
    loadAdminPasswordFromCloud(),
    loadCourseTagsFromCloud(),
  ]).then(results => {
    const changed = results.some(r => r.status === 'fulfilled' && r.value);
    if (changed) refreshHomeAfterCloudUpdate();
  });
}

function loadUserMetaInBackground() {
  Promise.allSettled([
    loadMetaFromCloud(),
    !localStorage.getItem(FORCE_RESTART_KEY) ? loadCurrentProgressFromCloud() : Promise.resolve(),
  ]).then(() => {
    syncState.status = '已同步';
    renderSyncBadge();
  });
}

async function loadMetaFromCloud() {
  if (!syncState.enabled || !syncState.client || !syncState.key) return;
  const { data, error } = await syncState.client
    .from('study_progress')
    .select('state,updated_at')
    .eq('sync_key', syncState.key)
    .eq('deck_key', SYNC_META_DECK)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.state) {
    await saveMetaToCloud();
    return;
  }
  const remoteState = data.state || {};
  const remoteTs = Number(remoteState.updatedAt || new Date(data.updated_at || 0).getTime() || 0);
  if (remoteTs && remoteTs > localMetaUpdatedAt()) {
    // 不再从云端覆盖设置——不同设备选题偏好不同，覆盖会造成困惑
    if (Array.isArray(remoteState.wrongIds)) localStorage.setItem(WRONG_KEY, JSON.stringify(remoteState.wrongIds));
    setLocalMetaUpdatedAt(remoteTs);
  }
}

async function saveMetaToCloud() {
  if (!syncState.enabled || !syncState.client || !syncState.key) return;
  const now = Date.now();
  setLocalMetaUpdatedAt(now);
  const state = {
    wrongIds: getWrongIds(),
    updatedAt: now,
  };
  syncState.client.from('study_progress').upsert({
    sync_key: syncState.key,
    deck_key: SYNC_META_DECK,
    state,
    updated_at: new Date(now).toISOString(),
  }).then(({ error }) => {
    if (error) console.warn('保存同步设置失败：', error);
    else { syncState.status = '已同步'; renderSyncBadge(); }
  });
}

async function loadCurrentProgressFromCloud() {
  if (!syncState.enabled || !syncState.client || !syncState.key) return;
  // 查找该 sync_key 下所有进度，取最新一条（跨设备无需签名完全匹配）
  const { data, error } = await syncState.client
    .from('study_progress')
    .select('state,updated_at')
    .eq('sync_key', syncState.key)
    .like('deck_key', 'progress:%')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.state) return;
  const local = getLocalProgressState();
  const remote = data.state;
  // 优先用服务器时间（updated_at），避免设备时钟偏差
  const remoteServerTs = new Date(data.updated_at || 0).getTime() || 0;
  const remoteClientTs = Number(remote.savedAt || 0);
  const remoteTs = remoteServerTs || remoteClientTs;
  const localTs = Number(local?.savedAt || 0);
  if (!local || remoteTs >= localTs) {
    // 标记为云端恢复的进度，放宽匹配条件
    remote._fromCloud = true;
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(remote));
  }
}

function saveProgressToCloud(payload) {
  if (!syncState.enabled || !syncState.client || !syncState.key || !payload) return;
  // 手机端优化：不要每点一次选项都立刻请求云端，先本地保存，再合并为一次云端保存。
  pendingProgressCloudPayload = payload;
  if (progressCloudTimer) clearTimeout(progressCloudTimer);
  progressCloudTimer = setTimeout(flushProgressToCloud, isDesktopHistoryLayout() ? 3000 : 5000);
}

function flushProgressToCloud() {
  if (!syncState.enabled || !syncState.client || !syncState.key || !pendingProgressCloudPayload) return;
  const payload = pendingProgressCloudPayload;
  pendingProgressCloudPayload = null;
  if (progressCloudTimer) {
    clearTimeout(progressCloudTimer);
    progressCloudTimer = null;
  }
  const deckKey = syncDeckKey(payload.signature || settingsSignature(payload.settings || readSettings()));
  const now = Date.now();
  const remotePayload = { ...payload, savedAt: payload.savedAt || now };
  syncState.client.from('study_progress').upsert({
    sync_key: syncState.key,
    deck_key: deckKey,
    state: remotePayload,
    updated_at: new Date(remotePayload.savedAt).toISOString(),
  }).then(({ error }) => {
    if (error) console.warn('保存进度失败：', error);
  });
}

function deleteProgressFromCloud(payload) {
  pendingProgressCloudPayload = null;
  if (progressCloudTimer) { clearTimeout(progressCloudTimer); progressCloudTimer = null; }
  if (!syncState.enabled || !syncState.client || !syncState.key) return;
  const settings = payload?.settings || state.settings || readSettings();
  const signature = payload?.signature || settingsSignature(settings);
  const deckKey = syncDeckKey(signature);
  syncState.client.from('study_progress')
    .delete()
    .eq('sync_key', syncState.key)
    .eq('deck_key', deckKey)
    .then(({ error }) => { if (error) console.warn('删除云端进度失败：', error); });
}

// ——— 题解/评论云端同步 ———

async function loadNotesFromCloud() {
  // 旧版本会在登录时全量加载题解/评论，手机端较慢；新版改为做完题后按需加载当前题。
  return;
}

function commentClientId() {
  let id = localStorage.getItem(COMMENT_CLIENT_ID_STORAGE);
  if (!id) {
    if (window.crypto && window.crypto.randomUUID) id = window.crypto.randomUUID();
    else id = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(COMMENT_CLIENT_ID_STORAGE, id);
  }
  return id;
}

function normalizeComment(item) {
  const text = String(item?.text || '').trim();
  if (!text) return null;
  const ts = Number(item?.ts || item?.createdAt || Date.now()) || Date.now();
  const id = String(item?.id || `legacy_${ts}_${simpleHash(text)}`);
  const likedBy = Array.isArray(item?.likedBy) ? [...new Set(item.likedBy.map(String))] : [];
  const likesFromCount = Number(item?.likes || 0);
  const likes = Math.max(likesFromCount, likedBy.length);
  return { id, text, ts, likes, likedBy };
}

function sortComments(comments) {
  return (comments || [])
    .map(normalizeComment)
    .filter(Boolean)
    .sort((a, b) => Number(b.likes || 0) - Number(a.likes || 0) || Number(b.ts || 0) - Number(a.ts || 0));
}

function normalizeNote(note) {
  return {
    explanation: String(note?.explanation || ''),
    comments: sortComments(note?.comments || []),
    updatedAt: Number(note?.updatedAt || 0),
  };
}

function parseCloudNoteRow(row) {
  let item = {};
  try {
    item = JSON.parse(row.note || '{}');
  } catch (err) {
    item = { explanation: String(row.note || ''), comments: [] };
  }
  const parsed = normalizeNote(item);
  parsed.updatedAt = Number(item.updatedAt || new Date(row.updated_at || 0).getTime() || 0) || Date.now();
  return parsed;
}

function mergeNoteData(base, incoming) {
  const out = normalizeNote(base || {});
  const inNote = normalizeNote(incoming || {});
  const incomingTs = Number(inNote.updatedAt || 0);
  if (inNote.explanation && (!out.explanation || incomingTs >= out.updatedAt)) {
    out.explanation = inNote.explanation;
  }

  const commentMap = new Map();
  [...(out.comments || []), ...(inNote.comments || [])].forEach(raw => {
    const item = normalizeComment(raw);
    if (!item) return;
    const old = commentMap.get(item.id);
    if (!old) {
      commentMap.set(item.id, item);
      return;
    }
    const likedBy = [...new Set([...(old.likedBy || []), ...(item.likedBy || [])])];
    commentMap.set(item.id, {
      ...old,
      ...item,
      likedBy,
      likes: Math.max(Number(old.likes || 0), Number(item.likes || 0), likedBy.length),
      ts: Math.max(Number(old.ts || 0), Number(item.ts || 0)),
    });
  });
  out.comments = sortComments([...commentMap.values()]);
  out.updatedAt = Math.max(out.updatedAt, incomingTs);
  return out;
}

async function fetchQuestionNoteFromCloud(id, options = {}) {
  if (!syncState.enabled || !syncState.client || !syncState.key || !id || isStandaloneMode()) return;
  if (!options.force && noteFetchState.fetched.has(id)) return;
  if (noteFetchState.loading.has(id)) return;
  noteFetchState.loading.add(id);
  try {
    // 只读取全站共享题解/评论这一行，这样删除评论后不会被旧同步码里的历史数据重新合并回来。
    const { data, error } = await syncState.client
      .from('question_notes')
      .select('question_id,note,updated_at')
      .eq('sync_key', SHARED_NOTE_SYNC_KEY)
      .eq('question_id', id)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      const all = loadAllNotes();
      const merged = mergeNoteData(all[id] || { explanation: '', comments: [], updatedAt: 0 }, parseCloudNoteRow(data));
      all[id] = merged;
      saveAllNotes(all);
      if (state.current?.id === id && state.checked && !isStandaloneMode()) {
        renderQuestionNotes(state.current, { skipFetch: true });
      }
    }
    noteFetchState.fetched.add(id);
  } catch (err) {
    console.warn('加载题解/评论失败：', err);
  } finally {
    noteFetchState.loading.delete(id);
  }
}

function saveQuestionNoteToCloud(id, note) {
  if (!syncState.enabled || !syncState.client || !syncState.key || !id) return;
  const now = Number(note.updatedAt || Date.now());
  const payload = {
    explanation: String(note.explanation || ''),
    comments: Array.isArray(note.comments) ? note.comments : [],
    updatedAt: now,
  };
  // 写入共享题解区，不再写入个人同步码；进度仍然按个人同步码保存。
  syncState.client.from('question_notes').upsert({
    sync_key: SHARED_NOTE_SYNC_KEY,
    question_id: id,
    note: JSON.stringify(payload),
    updated_at: new Date(now).toISOString(),
  }).then(({ error }) => {
    if (error) console.warn('保存题解/评论失败：', error);
    else noteFetchState.fetched.add(id);
  });
}

// ——— 设置云端同步 ———

function scheduleMetaToCloud() {
  if (!syncState.enabled) return;
  if (metaCloudTimer) clearTimeout(metaCloudTimer);
  metaCloudTimer = setTimeout(() => {
    metaCloudTimer = null;
    saveMetaToCloud();
  }, isDesktopHistoryLayout() ? 600 : 1200);
}

function flushMetaToCloud() {
  if (metaCloudTimer) {
    clearTimeout(metaCloudTimer);
    metaCloudTimer = null;
  }
  saveMetaToCloud();
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  setLocalMetaUpdatedAt(Date.now());
  scheduleMetaToCloud();
}

// ——— 全站题目统计（所有用户答题总次数和正确率）———

const questionStatsCache = {};

async function fetchQuestionStatsFromCloud(questionId) {
  if (!questionId) return null;
  // 单机模式不拉取统计。
  if (isStandaloneMode()) return null;
  const client = initSupabaseClient();
  if (!client) return null;
  // 本地缓存优先（本会话内已经拉取过）。
  const cached = questionStatsCache[questionId];
  if (cached && (nowTs() - (cached._fetchedAt || 0) < 30000)) return cached;
  try {
    const { data, error } = await client
      .from('study_progress')
      .select('state,updated_at')
      .eq('sync_key', QUESTION_STATS_SYNC_KEY)
      .eq('deck_key', QUESTION_STATS_PREFIX + questionId)
      .maybeSingle();
    if (error) throw error;
    const state = data?.state || { total: 0, correct: 0 };
    const stats = {
      total: Number(state.total || 0),
      correct: Number(state.correct || 0),
      _fetchedAt: nowTs(),
    };
    questionStatsCache[questionId] = stats;
    return stats;
  } catch (err) {
    console.warn('拉取题目统计失败：', err);
    return null;
  }
}

async function recordQuestionAttemptToCloud(questionId, isCorrect) {
  if (!questionId || isStandaloneMode()) return null;
  const client = initSupabaseClient();
  if (!client) return null;
  try {
    // 读取当前云端统计
    const { data, error: readErr } = await client
      .from('study_progress')
      .select('state,updated_at')
      .eq('sync_key', QUESTION_STATS_SYNC_KEY)
      .eq('deck_key', QUESTION_STATS_PREFIX + questionId)
      .maybeSingle();
    if (readErr) throw readErr;
    const current = data?.state || { total: 0, correct: 0 };
    const stats = {
      total: Number(current.total || 0) + 1,
      correct: Number(current.correct || 0) + (isCorrect ? 1 : 0),
      updatedAt: nowTs(),
    };
    // 写回云端
    const { error: writeErr } = await client.from('study_progress').upsert({
      sync_key: QUESTION_STATS_SYNC_KEY,
      deck_key: QUESTION_STATS_PREFIX + questionId,
      state: stats,
      updated_at: new Date(stats.updatedAt).toISOString(),
    });
    if (writeErr) throw writeErr;
    // 更新本地缓存
    questionStatsCache[questionId] = {
      total: stats.total,
      correct: stats.correct,
      _fetchedAt: stats.updatedAt,
    };
    return questionStatsCache[questionId];
  } catch (err) {
    console.warn('记录题目统计失败：', err);
    return null;
  }
}

function formatQuestionStats(stats) {
  if (!stats || !stats.total) return '';
  const rate = Math.round(stats.correct / stats.total * 100);
  return `<span class="question-stats">全站统计：共 <b>${stats.total}</b> 次提交，正确率 <b>${rate}%</b></span>`;
}

// =============================================================================
// 历史刷题记录 —— 云端模式存 study_progress 表（history: 前缀），单机模式存本地。
// UI 只调 archiveRound / listHistoryRecords / removeHistoryRecord，内部按模式分流。
// =============================================================================

// 从一份进度 payload 组装一条历史记录（含展示用元信息）。
function buildHistoryRecord(progress, finished) {
  if (!progress || !Array.isArray(progress.pool) || !progress.pool.length) return null;
  const settings = progress.settings || {};
  const history = Array.isArray(progress.history) ? progress.history : [];
  const right = history.filter(h => h.result === 'right').length;
  const wrong = history.filter(h => h.result === 'wrong').length;
  const done = right + wrong;
  const rate = done ? Math.round(right / done * 100) : 0;
  const savedAt = Number(progress.savedAt || nowTs());
  // 专题描述：与 applyPracticeHeader 一致。
  let topicText = '专题';
  try {
    const total = (typeof allTopicKeys === 'function') ? allTopicKeys().length : 0;
    const sel = (settings.topics || []).length;
    topicText = (total && sel === total) ? '全部专题' : `${sel} 个小专题`;
  } catch (err) {}
  return {
    ...progress,
    id: `${HISTORY_DECK_PREFIX}${savedAt}`,
    savedAt,
    _historyMeta: {
      finished: Boolean(finished),
      total: progress.pool.length,
      doneCount: done,
      currentIndex: Number(progress.currentIndex || 0),
      right, wrong, rate,
      topicText,
      modeName: (typeof modeName === 'function') ? modeName(settings.mode) : (settings.mode || ''),
      typeName: (typeof typeName === 'function') ? typeName(settings.type) : (settings.type || ''),
      createdAt: savedAt,
    },
  };
}

// ——— 本地历史（单机模式） ———
function readLocalHistory() {
  try {
    const arr = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch (err) { return []; }
}
function writeLocalHistory(list) {
  const trimmed = (list || [])
    .slice()
    .sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0))
    .slice(0, HISTORY_MAX);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  return trimmed;
}
function archiveRoundLocal(record) {
  const list = readLocalHistory().filter(r => Number(r.savedAt) !== Number(record.savedAt));
  list.push(record);
  writeLocalHistory(list);
}

// ——— 云端历史（同步模式） ———
// 用原生 fetch + keepalive 写入：即使紧接着 location.href 跳转，请求也不会被中断，
// 因此调用方无需 await，点「开始刷题」可立即跳转、不卡顿。
function archiveRoundCloudBeacon(record) {
  if (!syncState.enabled || !syncState.key) return;
  const ts = Number(record.savedAt || nowTs());
  const body = JSON.stringify({
    sync_key: syncState.key,
    deck_key: record.id,
    state: record,
    updated_at: new Date(ts).toISOString(),
  });
  try {
    fetch(`${SUPABASE_URL}/rest/v1/study_progress`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body,
    }).then(() => {
      // 修剪旧记录放在写入成功后后台进行，不阻塞跳转。
      trimHistoryCloud().catch(() => {});
    }).catch(err => console.warn('后台存档历史失败：', err));
  } catch (err) {
    console.warn('后台存档历史异常：', err);
  }
}
async function trimHistoryCloud() {
  if (!syncState.enabled || !syncState.client || !syncState.key) return;
  const { data, error } = await syncState.client
    .from('study_progress')
    .select('deck_key,updated_at')
    .eq('sync_key', syncState.key)
    .like('deck_key', `${HISTORY_DECK_PREFIX}%`)
    .order('updated_at', { ascending: false });
  if (error || !Array.isArray(data)) return;
  const stale = data.slice(HISTORY_MAX);
  for (const row of stale) {
    await syncState.client.from('study_progress')
      .delete().eq('sync_key', syncState.key).eq('deck_key', row.deck_key)
      .then(({ error: e }) => { if (e) console.warn('修剪历史失败：', e); });
  }
}
async function listHistoryCloud() {
  if (!syncState.enabled || !syncState.client || !syncState.key) return [];
  const { data, error } = await syncState.client
    .from('study_progress')
    .select('deck_key,state,updated_at')
    .eq('sync_key', syncState.key)
    .like('deck_key', `${HISTORY_DECK_PREFIX}%`)
    .order('updated_at', { ascending: false })
    .limit(HISTORY_MAX);
  if (error || !Array.isArray(data)) return [];
  return data.map(row => {
    const rec = row.state || {};
    rec.id = rec.id || row.deck_key;
    return rec;
  });
}
async function removeHistoryCloud(id) {
  if (!syncState.enabled || !syncState.client || !syncState.key || !id) return false;
  const { error } = await syncState.client.from('study_progress')
    .delete().eq('sync_key', syncState.key).eq('deck_key', id);
  if (error) { console.warn('删除历史记录失败：', error); return false; }
  return true;
}

// ——— 对外统一接口（UI 调用，按模式分流） ———

// 把一份进度存档成历史记录。progress 默认取本地当前进度。
// 同步返回（不阻塞）：本地立即写入；云端用 keepalive 后台发送，调用方无需 await。
function archiveRound(finished, progress) {
  const src = progress || getLocalProgressState();
  const record = buildHistoryRecord(src, finished);
  if (!record) return false;
  if (isStandaloneMode()) {
    archiveRoundLocal(record);
    return true;
  }
  archiveRoundCloudBeacon(record);
  return true;
}

async function listHistoryRecords() {
  if (isStandaloneMode()) {
    return readLocalHistory().sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0)).slice(0, HISTORY_MAX);
  }
  try { return await listHistoryCloud(); }
  catch (err) { console.warn('读取历史记录失败：', err); return []; }
}

async function removeHistoryRecord(id) {
  if (!id) return false;
  if (isStandaloneMode()) {
    writeLocalHistory(readLocalHistory().filter(r => String(r.id) !== String(id)));
    return true;
  }
  return removeHistoryCloud(id);
}
