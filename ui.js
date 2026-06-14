// ui.js — 所有 DOM 渲染：首页、答题页、管理面板、导入/导出
// 依赖：config.js, utils.js, data.js, sync.js, state.js

function loadAllNotes() {
  try {
    const data = JSON.parse(localStorage.getItem(NOTE_KEY) || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch (err) {
    return {};
  }
}

function saveAllNotes(data) {
  localStorage.setItem(NOTE_KEY, JSON.stringify(data || {}));
}

function getQuestionNote(id) {
  const data = loadAllNotes();
  const item = normalizeNote(data[id] || {});
  return {
    explanation: item.explanation,
    comments: item.comments,
    updatedAt: item.updatedAt,
  };
}

function saveQuestionNote(id, note) {
  if (!id) return;
  const data = loadAllNotes();
  const normalized = normalizeNote(note || {});
  const saved = {
    explanation: normalized.explanation,
    comments: normalized.comments,
    updatedAt: Date.now(),
  };
  data[id] = saved;
  saveAllNotes(data);
  saveQuestionNoteToCloud(id, saved);
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderCommentList(note) {
  const list = $('commentList');
  if (!list) return;
  const commentsAll = sortComments(note.comments || []);
  const comments = commentsAll.slice(0, 20);
  if (!commentsAll.length) {
    list.innerHTML = '<div class="comment-empty">还没有评论，可以写一下易错点、记忆方法或老师强调的内容。</div>';
    return;
  }
  const clientId = commentClientId();
  list.innerHTML = comments.map((item) => {
    const liked = Array.isArray(item.likedBy) && item.likedBy.includes(clientId);
    return `
      <div class="comment-item" data-comment-id="${escapeHtml(item.id)}">
        <div class="comment-text markdown-body">${renderMarkdown(item.text || '')}</div>
        <div class="comment-meta">
          <span>${escapeHtml(formatTime(item.ts))}</span>
          <div class="comment-actions">
            <button class="comment-like ${liked ? 'liked' : ''}" type="button" data-comment-id="${escapeHtml(item.id)}">👍 ${liked ? '已赞' : '点赞'} <b>${Number(item.likes || 0)}</b></button>
            <button class="comment-delete" type="button" data-comment-id="${escapeHtml(item.id)}">删除</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderQuestionNotes(q, options = {}) {
  const panel = $('notePanel');
  if (!panel || !q) return;

  // 题解和评论只有在本题已经提交或直接看过答案后才允许查看。
  // 答错后也可以查看；但点击“重新作答”进入重做状态后会隐藏，避免边看题解边重做。
  if (!state.checked) {
    panel.classList.add('hidden');
    if ($('explanationInput')) $('explanationInput').value = '';
    if ($('commentInput')) $('commentInput').value = '';
    if ($('commentList')) $('commentList').innerHTML = '';
    if ($('explanationPreview')) $('explanationPreview').innerHTML = '';
    return;
  }

  panel.classList.remove('hidden');
  if ($('noteQuestionTitle')) $('noteQuestionTitle').textContent = `当前题：${q.topic} · 原题号 ${q.number}`;

  if (isStandaloneMode()) {
    if ($('explanationInput')) {
      $('explanationInput').value = '';
      $('explanationInput').disabled = true;
      $('explanationInput').placeholder = '单机模式不能编辑题解。它只读取云端题库修改；切换到云端同步模式后可发布/查看题解和评论。';
    }
    if ($('commentInput')) {
      $('commentInput').value = '';
      $('commentInput').disabled = true;
      $('commentInput').placeholder = '单机模式不能发表评论。';
    }
    if ($('addCommentBtn')) $('addCommentBtn').disabled = true;
    if ($('noteSaveTip')) $('noteSaveTip').textContent = '单机模式不支持题解/评论';
    if ($('commentList')) $('commentList').innerHTML = '<div class="comment-empty">当前是单机模式：会读取云端题库修改，但不能发布、编辑或查看云端题解和评论。</div>';
    if ($('explanationPreview')) $('explanationPreview').innerHTML = ''; 
    return;
  }

  if ($('explanationInput')) {
    $('explanationInput').disabled = false;
    $('explanationInput').placeholder = '可以写错项原因、记忆方法。例：D（与时俱进）主要属于中国特色社会主义理论体系中的表述。';
  }
  if ($('commentInput')) {
    $('commentInput').disabled = false;
    $('commentInput').placeholder = '写一条评论，例如：这题容易把“实事求是”和“与时俱进”混淆。';
  }
  if ($('addCommentBtn')) $('addCommentBtn').disabled = false;

  const note = getQuestionNote(q.id);
  if ($('explanationInput') && document.activeElement !== $('explanationInput')) $('explanationInput').value = note.explanation;
  if ($('explanationPreview')) $('explanationPreview').innerHTML = note.explanation ? renderMarkdown(note.explanation) : '<span class="comment-empty">题解预览为空，支持 Markdown。</span>';
  if ($('commentInput') && document.activeElement !== $('commentInput')) $('commentInput').value = '';
  if ($('noteSaveTip')) $('noteSaveTip').textContent = note.explanation ? '已加载本题保存的题解/评论' : '题解/评论会自动保存';
  renderCommentList(note);
  if (!options.skipFetch) fetchQuestionNoteFromCloud(q.id);
}

function saveCurrentExplanation() {
  if (isStandaloneMode()) return;
  const q = state.current;
  if (!q || !state.checked || !$('explanationInput')) return;
  const note = getQuestionNote(q.id);
  note.explanation = $('explanationInput').value;
  saveQuestionNote(q.id, note);
  if ($('explanationPreview')) $('explanationPreview').innerHTML = note.explanation ? renderMarkdown(note.explanation) : '<span class="comment-empty">题解预览为空，支持 Markdown。</span>';
  if ($('noteSaveTip')) $('noteSaveTip').textContent = '已自动保存';
}

function addCurrentComment() {
  if (isStandaloneMode()) { if ($('noteSaveTip')) $('noteSaveTip').textContent = '单机模式不能发表评论'; return; }
  const q = state.current;
  const input = $('commentInput');
  if (!q || !state.checked || !input) return;
  const text = (input.value || '').trim();
  if (!text) {
    if ($('noteSaveTip')) $('noteSaveTip').textContent = '评论不能为空';
    return;
  }
  const note = getQuestionNote(q.id);
  note.comments.unshift({
    id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    text,
    ts: Date.now(),
    likes: 0,
    likedBy: [],
  });
  saveQuestionNote(q.id, note);
  input.value = '';
  if ($('noteSaveTip')) $('noteSaveTip').textContent = '评论已保存';
  renderCommentList(getQuestionNote(q.id));
}

function deleteCurrentComment(commentId) {
  if (isStandaloneMode()) return;
  const q = state.current;
  if (!q || !state.checked || !commentId) return;
  const note = getQuestionNote(q.id);
  const before = note.comments.length;
  note.comments = note.comments.filter(item => String(item.id) !== String(commentId));
  if (note.comments.length === before) {
    if ($('noteSaveTip')) $('noteSaveTip').textContent = '没有找到这条评论，可能已被刷新。';
    return;
  }
  saveQuestionNote(q.id, note);
  noteFetchState.fetched.add(q.id);
  if ($('noteSaveTip')) $('noteSaveTip').textContent = '评论已删除';
  renderCommentList(getQuestionNote(q.id));
}

function toggleCommentLike(commentId) {
  if (isStandaloneMode()) return;
  const q = state.current;
  if (!q || !state.checked || !commentId) return;
  const clientId = commentClientId();
  const note = getQuestionNote(q.id);
  const comment = note.comments.find(item => String(item.id) === String(commentId));
  if (!comment) return;
  comment.likedBy = Array.isArray(comment.likedBy) ? comment.likedBy.map(String) : [];
  if (comment.likedBy.includes(clientId)) {
    comment.likedBy = comment.likedBy.filter(id => id !== clientId);
  } else {
    comment.likedBy.push(clientId);
  }
  comment.likes = comment.likedBy.length;
  saveQuestionNote(q.id, note);
  if ($('noteSaveTip')) $('noteSaveTip').textContent = '点赞已更新';
  renderCommentList(getQuestionNote(q.id));
}

function topicChecksInGroup(group) {
  return [...document.querySelectorAll('.topicCheck')].filter(c => c.dataset.course === group);
}

function topicChecksInTopic(group, topic) {
  return [...document.querySelectorAll('.topicCheck')].filter(c => c.dataset.course === group && c.value.split('|||')[1] === topic);
}

function setTopicMidState(topicEl) {
  const group = topicEl?.dataset?.course;
  const topic = topicEl?.dataset?.topic;
  const master = topicEl?.querySelector('.topicMidCheck');
  const children = topicChecksInTopic(group, topic);
  if (!master || !children.length) return;
  const checkedCount = children.filter(c => c.checked).length;
  master.checked = checkedCount === children.length;
  master.indeterminate = checkedCount > 0 && checkedCount < children.length;
}

function setGroupState(groupEl) {
  const group = groupEl.dataset.course;
  const children = topicChecksInGroup(group);
  const master = groupEl.querySelector('.groupCheck');
  groupEl.querySelectorAll('.topic-topic-card').forEach(setTopicMidState);
  if (!master || !children.length) return;
  const checkedCount = children.filter(c => c.checked).length;
  master.checked = checkedCount === children.length;
  master.indeterminate = checkedCount > 0 && checkedCount < children.length;
}

function updateAllGroupStates() {
  document.querySelectorAll('.topic-topic-card').forEach(setTopicMidState);
  document.querySelectorAll('.topic-group').forEach(setGroupState);
}

function updateStats() {
  // 本轮统计以 history 为准，跳回错题重新作答后，答对会从错误变成正确。
  const history = Array.isArray(state.history) ? state.history : [];
  state.right = history.filter(item => item.result === 'right').length;
  state.wrong = history.filter(item => item.result === 'wrong').length;
  if ($('totalCount')) $('totalCount').textContent = questions.length;
  if ($('rightNum')) $('rightNum').textContent = state.right;
  if ($('wrongNum')) $('wrongNum').textContent = state.wrong;
  const done = state.right + state.wrong;
  if ($('rateNum')) $('rateNum').textContent = done ? `${Math.round(state.right / done * 100)}%` : '0%';
  if ($('progressBar')) {
    const progress = state.pool.length ? Math.min(100, Math.round((state.currentIndex + (state.checked ? 1 : 0)) / state.pool.length * 100)) : 0;
    $('progressBar').style.width = `${progress}%`;
  }
  if ($('clearWrongBtn')) {
    const wrongCount = getWrongIds().length;
    $('clearWrongBtn').textContent = `清空错题本（${wrongCount}）`;
  }
  if ($('historyBtn')) {
    $('historyBtn').textContent = state.pool.length ? `题号列表（${history.length}/${state.pool.length}）` : '题号列表（0）';
  }
}

function renderManualDialog() {
  document.getElementById('manualOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'manualOverlay';
  overlay.className = 'auth-overlay manual-overlay';
  overlay.innerHTML = `<div class="auth-card manual-card">
    <h1>使用手册</h1>
    <div class="manual-content">
      <p><b>同步模式</b>：输入同步码和邀请码后使用；同一同步码本设备只需验证一次。题解和评论全站共享，进度按同步码独立保存。</p>
      <p><b>单机模式</b>：不需要同步码，会读取云端题库修改；进度只保存在当前设备，不能查看、发布或编辑云端题解评论。</p>
      <p><b>Markdown</b>：题干、选项、题解和评论支持换行、**加粗**、\`代码\`、标题和列表。</p>
      <p><b>快捷键</b>：电脑端 1-4 选择 A-D，5 直接看答案，空格=提交/下一题/看答案。</p>
      <p><b>题库管理</b>：输入管理密码后可添加、修改、删除题目，导入/导出题库，修改专题和邀请码。</p>
    </div>
    <button class="primary" id="manualCloseBtn" type="button">知道了</button>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#manualCloseBtn')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function initTopics() {
  if ($('totalCount')) $('totalCount').textContent = questions.length;
  const topicList = $('topicList');
  const saved = readSettings();
  const existingChecks = [...document.querySelectorAll('.topicCheck')];
  const selected = new Set(existingChecks.length ? existingChecks.filter(c => c.checked).map(c => c.value) : (saved.topics || allTopicKeys()));
  if ($('modeSelect')) $('modeSelect').value = saved.mode;
  if ($('typeSelect')) $('typeSelect').value = saved.type;
  if ($('orderSelect')) $('orderSelect').value = saved.order;
  if ($('singleFirstCheck')) $('singleFirstCheck').checked = Boolean(saved.singleFirst);
  if ($('prefShuffleOptions')) $('prefShuffleOptions').checked = saved.shuffleOptions !== false;
  if ($('prefAutoSubmit')) $('prefAutoSubmit').checked = Boolean(saved.autoSubmit);
  if ($('prefAutoNextCorrect')) $('prefAutoNextCorrect').checked = saved.autoNextCorrect !== false;
  if ($('countInput')) $('countInput').value = saved.count;
  if ($('singleCountInput')) $('singleCountInput').value = saved.singleCount || 0;
  if ($('multipleCountInput')) $('multipleCountInput').value = saved.multipleCount || 0;
  if ($('fillCountInput')) $('fillCountInput').value = saved.fillCount || 0;
  if ($('shortCountInput')) $('shortCountInput').value = saved.shortCount || 0;
  if (!topicList) return;
  const tags = readCourseTags();
  const keyword = String($('topicSearchInput')?.value || '').trim().toLowerCase();
  const tree = buildTopicHierarchy();
  topicList.innerHTML = tree.map(([course, cInfo]) => {
    const courseTags = tags[course] || [];
    const courseSearch = `${course} ${courseTags.join(' ')}`.toLowerCase();
    const courseOpen = keyword ? ' open' : '';
    const topicHtml = [...cInfo.topics.entries()].map(([topic, tInfo]) => {
      const topicSearch = `${course} ${topic} ${courseTags.join(' ')}`.toLowerCase();
      const subHtml = [...tInfo.subs.entries()].map(([sub, sInfo]) => {
        const hay = `${course} ${topic} ${sub} ${courseTags.join(' ')}`.toLowerCase();
        if (keyword && !hay.includes(keyword)) return '';
        return `<label class="topic-item sub-topic leaf-topic topic-mini-card">
          <input type="checkbox" class="topicCheck" data-course="${escapeHtml(course)}" value="${escapeHtml(sInfo.key)}" ${selected.has(sInfo.key) ? 'checked' : ''} />
          <span><b>${escapeHtml(sub)}</b><small>${countSummaryText(sInfo)}</small></span>
        </label>`;
      }).join('');
      if (!subHtml && keyword && !courseSearch.includes(keyword) && !topic.toLowerCase().includes(keyword)) return '';
      const topicOpen = keyword ? ' open' : '';
      return `<details class="topic-level topic-level-mid topic-topic-card" data-course="${escapeHtml(course)}" data-topic="${escapeHtml(topic)}"${topicOpen}>
        <summary class="topic-mid-summary">
          <div class="topic-summary-main topic-mid-main">
            <input type="checkbox" class="topicMidCheck" aria-label="选择 ${escapeHtml(topic)} 全部小专题" data-course="${escapeHtml(course)}" data-topic="${escapeHtml(topic)}" />
            <span><b>${escapeHtml(topic)}</b><small>${countSummaryText(tInfo)}</small></span>
          </div>
          <em class="topic-expand-only">展开</em>
        </summary>
        <div class="topic-leaf-list">${subHtml || '<div class="topic-empty-mini">没有匹配的小专题</div>'}</div>
      </details>`;
    }).join('');
    if (!topicHtml && keyword && !courseSearch.includes(keyword)) return '';
    return `<details class="topic-group topic-course topic-course-card" data-course="${escapeHtml(course)}"${courseOpen}>
      <summary class="topic-course-summary">
        <div class="topic-summary-main">
          <input type="checkbox" class="groupCheck" aria-label="选择 ${escapeHtml(course)} 全部小专题" />
          <span><b>${escapeHtml(course)}</b><small>${countSummaryText(cInfo)}</small></span>
        </div>
        <span class="topic-expand-hint topic-expand-only">展开</span>
      </summary>
      <div class="topic-course-body">
        <div class="course-tags">${courseTags.map(t => `<button class="course-tag" type="button" data-course="${escapeHtml(course)}" data-tag="${escapeHtml(t)}">#${escapeHtml(t)} ×</button>`).join('') || '<span class="tag-empty">暂无标签</span>'}
          <button class="add-course-tag" type="button" data-course="${escapeHtml(course)}">+ 标签</button>
        </div>
        <div class="topic-sub-list">${topicHtml || '<div class="topic-empty-mini">没有匹配的小专题</div>'}</div>
      </div>
    </details>`;
  }).join('') || '<div class="admin-empty">没有找到匹配的专题。</div>';
  document.querySelectorAll('.topic-course-summary').forEach(summary => {
    summary.addEventListener('click', event => {
      const groupEl = summary.closest('.topic-group');
      if (!groupEl) return;
      if (event.target.closest('.topic-expand-only')) return; // 只有点“展开/收起”才展开
      event.preventDefault();
      const master = groupEl.querySelector('.groupCheck');
      if (!master) return;
      master.checked = !master.checked || master.indeterminate;
      master.indeterminate = false;
      topicChecksInGroup(groupEl.dataset.course).forEach(c => c.checked = master.checked);
      setGroupState(groupEl);
      saveSettings(collectHomeSettings());
    });
  });
  document.querySelectorAll('.groupCheck').forEach(master => {
    master.addEventListener('click', event => {
      event.stopPropagation();
      const groupEl = master.closest('.topic-group');
      topicChecksInGroup(groupEl.dataset.course).forEach(c => c.checked = master.checked);
      setGroupState(groupEl);
      saveSettings(collectHomeSettings());
    });
    master.addEventListener('change', () => {
      const groupEl = master.closest('.topic-group');
      const group = groupEl.dataset.course;
      topicChecksInGroup(group).forEach(c => c.checked = master.checked);
      setGroupState(groupEl);
    });
  });
  document.querySelectorAll('.topic-mid-summary').forEach(summary => {
    summary.addEventListener('click', event => {
      const topicEl = summary.closest('.topic-topic-card');
      if (!topicEl) return;
      if (event.target.closest('.topic-expand-only')) return; // 只有点“展开/收起”才展开
      event.preventDefault();
      const master = topicEl.querySelector('.topicMidCheck');
      if (!master) return;
      master.checked = !master.checked || master.indeterminate;
      master.indeterminate = false;
      topicChecksInTopic(topicEl.dataset.course, topicEl.dataset.topic).forEach(c => c.checked = master.checked);
      const groupEl = topicEl.closest('.topic-group');
      setTopicMidState(topicEl);
      if (groupEl) setGroupState(groupEl);
      saveSettings(collectHomeSettings());
    });
  });
  document.querySelectorAll('.topicMidCheck').forEach(master => {
    master.addEventListener('click', event => {
      event.stopPropagation();
      const topicEl = master.closest('.topic-topic-card');
      topicChecksInTopic(topicEl.dataset.course, topicEl.dataset.topic).forEach(c => c.checked = master.checked);
      setTopicMidState(topicEl);
      const groupEl = topicEl.closest('.topic-group');
      if (groupEl) setGroupState(groupEl);
      saveSettings(collectHomeSettings());
    });
  });
  document.querySelectorAll('.topicCheck').forEach(check => {
    check.addEventListener('change', () => {
      const topicEl = check.closest('.topic-topic-card');
      const groupEl = check.closest('.topic-group');
      if (topicEl) setTopicMidState(topicEl);
      if (groupEl) setGroupState(groupEl);
      saveSettings(collectHomeSettings());
    });
  });
  updateAllGroupStates();
  topicList.querySelectorAll('.add-course-tag').forEach(btn => btn.addEventListener('click', () => {
    ensureAdminUnlocked(() => {
      const tag = prompt(`给“${btn.dataset.course}”添加标签：`);
      if (!tag) return;
      addTagToCourse(btn.dataset.course, tag);
      initTopics();
    });
  }));
  topicList.querySelectorAll('.course-tag').forEach(btn => btn.addEventListener('click', () => {
    ensureAdminUnlocked(() => {
      if (confirm(`删除标签 #${btn.dataset.tag} 吗？`)) { removeTagFromCourse(btn.dataset.course, btn.dataset.tag); initTopics(); }
    });
  }));
  updateAllGroupStates();
}

function selectedTopics() {
  return [...document.querySelectorAll('.topicCheck:checked')].map(x => x.value);
}

function collectHomeSettings() {
  const topics = selectedTopics();
  return {
    mode: $('modeSelect').value,
    type: $('typeSelect').value,
    order: $('orderSelect').value,
    singleFirst: Boolean($('singleFirstCheck')?.checked),
    shuffleOptions: $('prefShuffleOptions') ? Boolean($('prefShuffleOptions').checked) : true,
    autoSubmit: Boolean($('prefAutoSubmit')?.checked),
    autoNextCorrect: $('prefAutoNextCorrect') ? Boolean($('prefAutoNextCorrect').checked) : true,
    count: Math.max(1, Number($('countInput').value || 30)),
    singleCount: Math.max(0, Number($('singleCountInput')?.value || 0)),
    multipleCount: Math.max(0, Number($('multipleCountInput')?.value || 0)),
    fillCount: Math.max(0, Number($('fillCountInput')?.value || 0)),
    shortCount: Math.max(0, Number($('shortCountInput')?.value || 0)),
    topics,
  };
}

function buildPool(settings) {
  const mode = settings.mode;
  const type = settings.type;
  const topics = new Set(settings.topics || []);
  let pool = questions.filter(q => topics.has(questionPathKey(q)));
  if (type !== 'all') pool = pool.filter(q => q.type === type);
  if (mode === 'wrong') {
    const wrongIds = new Set(getWrongIds());
    pool = pool.filter(q => wrongIds.has(q.id));
  }
  const explicitCounts = ['singleCount','multipleCount','fillCount','shortCount'].some(k => Number(settings[k] || 0) > 0);
  if (type === 'all' && mode !== 'review' && explicitCounts) {
    const orderedTypes = ['single','multiple','fill','short'];
    let picked = [];
    orderedTypes.forEach(tp => {
      const n = Number(settings[`${tp}Count`] || 0);
      if (n > 0) {
        const arr = pool.filter(q => q.type === tp);
        picked.push(...(settings.order === 'random' ? shuffle(arr) : arr).slice(0, n));
      }
    });
    pool = picked;
  } else if (settings.singleFirst && type === 'all') {
    const singles = pool.filter(q => q.type === 'single');
    const multiples = pool.filter(q => q.type === 'multiple');
    const others = pool.filter(q => q.type !== 'single' && q.type !== 'multiple');
    pool = settings.order === 'random' ? [...shuffle(singles), ...shuffle(multiples), ...shuffle(others)] : [...singles, ...multiples, ...others];
  } else if (settings.order === 'random') {
    pool = shuffle(pool);
  }
  const count = Math.max(1, Number(settings.count || 30));
  if (mode !== 'review' && !explicitCounts) pool = pool.slice(0, Math.min(count, pool.length));
  return pool.map(q => prepareQuestion(q, settings));
}


function goPractice(options = {}) {
  const settings = collectHomeSettings();
  if (!settings.topics.length) {
    alert('至少选择一个专题再开始。');
    return;
  }
  saveSettings(settings);
  if (options.restart) {
    // 重新开始：强制重建题池
    sessionStorage.setItem('quiz_pending_topics', JSON.stringify(settings.topics));
    localStorage.setItem(FORCE_RESTART_KEY, '1');
    clearSavedProgress();
  }
  window.location.href = 'practice.html';
}

function modeName(mode) {
  return mode === 'review' ? '答案速背' : mode === 'wrong' ? '错题重做' : '刷题模式';
}

function typeName(type) {
  return type === 'single' ? '单选题' : type === 'multiple' ? '多选题' : type === 'fill' ? '填空题' : type === 'short' ? '简答题' : '全部题型';
}

function restoreProgressIfMatched(settings) {
  const saved = loadProgress();
  if (!saved || !Array.isArray(saved.pool) || !saved.pool.length) return false;
  // 继续刷题：不管设置怎么变，始终恢复上次进度
  // 过滤掉已不存在的题目（比如被删除了的）
  const validIds = new Set(questions.map(q => q.id));
  saved.pool = saved.pool.filter(q => validIds.has(q.id));
  if (!saved.pool.length) return false;
  saved.currentIndex = Math.max(0, Math.min(saved.currentIndex || 0, saved.pool.length - 1));
  saved.bankSize = questions.length;

  state.settings = settings;
  state.pool = saved.pool;
  state.currentIndex = Math.max(0, Math.min(Number(saved.currentIndex || 0), state.pool.length - 1));
  state.right = 0;
  state.wrong = 0;
  state.selected = new Set();
  state.checked = false;
  state.current = null;
  state.history = Array.isArray(saved.history) ? saved.history : [];
  state.historyOpen = false;
  state.drafts = saved.drafts || {};
  state.wrongReplayCount = Number(saved.wrongReplayCount || 0);
  state.progressRestored = true;
  return true;
}

function applyPracticeHeader(settings, pool) {
  if ($('modePill')) $('modePill').textContent = modeName(settings.mode);
  if ($('topicPill')) $('topicPill').textContent = pool.length ? `本轮 ${pool.length} 题` : '没有可用题目';
  if ($('practiceSub')) {
    const topicText = settings.topics.length === allTopicKeys().length ? '全部专题' : `${settings.topics.length} 个小专题`;
    const resumeText = state.progressRestored ? ' · 已恢复上次进度' : '';
    const singleFirstText = settings.singleFirst && settings.type === 'all' ? ' · 单选在前' : '';
    $('practiceSub').textContent = `${modeName(settings.mode)} · ${typeName(settings.type)} · ${topicText} · ${settings.order === 'random' ? '随机' : '按顺序'}${singleFirstText}${resumeText}`;
  }
}

function startQuiz(settings, options = {}) {
  clearAutoTimer();
  // 如果从首页带了新选题，用 sessionStorage 中的选题覆盖
  // 重新开始：从 sessionStorage 获取选题并重建题池
  const pending = sessionStorage.getItem('quiz_pending_topics');
  if (pending) {
    try {
      settings.topics = JSON.parse(pending);
      sessionStorage.removeItem('quiz_pending_topics');
      options.resume = false;
    } catch(e) {}
  }
  const shouldResume = options.resume !== false;
  let restored = false;
  if (shouldResume) restored = restoreProgressIfMatched(settings);

  if (!restored) {
    const pool = buildPool(settings);
    state.settings = settings;
    state.pool = pool;
    state.currentIndex = 0;
    state.right = 0;
    state.wrong = 0;
    state.selected = new Set();
    state.checked = false;
    state.current = null;
    state.history = [];
    state.historyOpen = false;
    state.drafts = {};
    state.wrongReplayCount = 0;
    state.progressRestored = false;
  }

  updateStats();
  $('emptyState')?.classList.add('hidden');
  $('questionCard')?.classList.add('hidden');
  $('reviewList')?.classList.add('hidden');
  closeHistory(false);
  applyPracticeHeader(settings, state.pool);

  if (!state.pool.length) {
    $('emptyState')?.classList.remove('hidden');
    if ($('emptyState')) $('emptyState').innerHTML = '<h2>没有找到符合条件的题目</h2><p>可以返回首页换个专题/题型，或先积累错题后再进入错题重做。</p>';
    return;
  }
  saveProgress();
  if (settings.mode === 'review') renderReview(state.pool);
  else renderQuestion();
}

function renderReview(pool) {
  const box = $('reviewList');
  if (!box) return;
  box.classList.remove('hidden');
  box.innerHTML = pool.map((q, i) => `
    <article class="review-item">
      <div class="question-meta">${i + 1}. ${escapeHtml(q.topic)} · ${renderTypeName(q.type)} · 原题号 ${q.number}</div>
      <h3>${renderMarkdown(q.text)}</h3>
      ${isChoiceType(q.type) ? `<ol type="A">${q.options.map(o => `<li>${renderMarkdown(o.text)}</li>`).join('')}</ol>` : ''}
      <div class="review-answer">${isChoiceType(q.type) ? `答案：${escapeHtml(q.answer)}　` : '参考答案：'}${renderMarkdown(answerText(q))}</div>
    </article>
  `).join('');
  if ($('progressBar')) $('progressBar').style.width = '100%';
}

function historyRecordForIndex(index) {
  return state.history.find(item => item.roundIndex === index) || null;
}

function restoreSolvedQuestion(record) {
  if (!record || !state.current) return;
  state.checked = true;
  if (isChoiceType(state.current.type)) {
    state.selected = new Set((record.selected || '').split('').filter(Boolean));
    document.querySelectorAll('.option').forEach(el => {
      const label = el.dataset.label;
      const isSelected = state.selected.has(label);
      const isRight = state.current.answer.includes(label);
      el.classList.toggle('selected', isSelected);
      if (isRight) el.classList.add('correct');
      if (isSelected && !isRight) el.classList.add('wrong');
      const input = el.querySelector('input');
      if (input) { input.checked = isSelected; input.disabled = true; }
    });
  } else {
    if ($('fillAnswerInput')) { $('fillAnswerInput').value = record.selected || ''; $('fillAnswerInput').disabled = true; }
    if ($('shortAnswerInput')) { $('shortAnswerInput').value = record.selected || ''; $('shortAnswerInput').disabled = true; }
  }
  $('answerBox')?.classList.remove('hidden');
  if ($('answerBox')) {
    const label = record.result === 'show' ? '已查看答案' : (record.result === 'right' ? '回答正确 ✅' : '回答错误 ❌');
    $('answerBox').innerHTML = `${label}<br><b>${isChoiceType(state.current.type) ? '正确答案：' + escapeHtml(state.current.answer) : '参考答案：'}</b><br>${renderMarkdown(answerText(state.current))}`;
  }
  $('submitBtn')?.classList.add('hidden');
  $('showBtn')?.classList.add('hidden');
  if (record.result === 'wrong') $('retryWrongBtn')?.classList.remove('hidden');
  else $('retryWrongBtn')?.classList.add('hidden');
  $('nextBtn')?.classList.remove('hidden');
  if ($('nextBtn')) $('nextBtn').textContent = state.currentIndex < state.pool.length - 1 ? '下一题' : '完成本轮';
}


function resetWrongQuestionForRetry(record) {
  // 进入错题重做状态后，清空旧错误选择，并隐藏正确答案、题解和评论。
  state.checked = false;
  state.selected = new Set();
  delete state.drafts[state.currentIndex];
  document.querySelectorAll('.option').forEach(el => {
    el.classList.remove('selected', 'correct', 'wrong');
    const input = el.querySelector('input');
    if (input) { input.checked = false; input.disabled = false; }
  });
  if ($('fillAnswerInput')) { $('fillAnswerInput').value = ''; $('fillAnswerInput').disabled = false; }
  if ($('shortAnswerInput')) { $('shortAnswerInput').value = ''; $('shortAnswerInput').disabled = false; }
  $('answerBox')?.classList.remove('hidden');
  if ($('answerBox')) $('answerBox').innerHTML = '这道题之前答错了，已清空原来的错误作答。重新作答，答对后题号会变成绿色。';
  $('submitBtn')?.classList.remove('hidden');
  $('showBtn')?.classList.remove('hidden');
  $('retryWrongBtn')?.classList.add('hidden');
  $('nextBtn')?.classList.add('hidden');
  renderQuestionNotes(state.current);
}


function beginRetryCurrentWrongQuestion() {
  const record = historyRecordForIndex(state.currentIndex);
  if (!record || record.result !== 'wrong') return;
  resetWrongQuestionForRetry(record);
  saveProgress();
}

function renderDraftSelection() {
  const draft = state.drafts[state.currentIndex];
  if (draft === undefined || state.checked) return;
  const q = state.current;
  if (!q) return;
  if (!isChoiceType(q.type)) {
    const val = typeof draft === 'object' ? (draft.text || '') : String(draft || '');
    if (q.type === 'fill' && $('fillAnswerInput')) $('fillAnswerInput').value = val;
    if (q.type === 'short' && $('shortAnswerInput')) $('shortAnswerInput').value = val;
    return;
  }
  const selectedText = typeof draft === 'object' ? (draft.selected || '') : String(draft || '');
  state.selected = new Set(selectedText.split('').filter(Boolean));
  document.querySelectorAll('.option').forEach(el => {
    const checked = state.selected.has(el.dataset.label);
    el.classList.toggle('selected', checked);
    const input = el.querySelector('input');
    if (input) input.checked = checked;
  });
}


function renderQuestion() {
  clearAutoTimer();
  if (state.currentIndex >= state.pool.length) return finishQuiz();
  state.current = state.pool[state.currentIndex];
  state.selected = new Set();
  state.checked = false;
  const q = state.current;
  applyPracticeHeader(state.settings || readSettings(), state.pool);
  $('questionCard')?.classList.remove('hidden');
  $('emptyState')?.classList.add('hidden');
  $('answerBox')?.classList.add('hidden');
  if ($('answerBox')) $('answerBox').innerHTML = '';
  $('submitBtn')?.classList.remove('hidden');
  $('showBtn')?.classList.remove('hidden');
  $('retryWrongBtn')?.classList.add('hidden');
  $('nextBtn')?.classList.add('hidden');
  if ($('nextBtn')) $('nextBtn').textContent = '下一题';
  if ($('questionMeta')) $('questionMeta').innerHTML = `<span>第 ${state.currentIndex + 1} / ${state.pool.length} 题</span><span>${escapeHtml(q.topic)}</span><span>${renderTypeName(q.type)}</span><span>原题号 ${q.number}</span>${isChoiceType(q.type) ? `<span>${q.optionShuffled ? '选项已乱序' : '选项未乱序'}</span>` : ''}`;
  if ($('questionText')) $('questionText').innerHTML = renderMarkdown(q.text);
  if ($('optionsBox')) {
    if (isChoiceType(q.type)) {
      $('optionsBox').classList.remove('hidden');
      $('optionsBox').innerHTML = q.options.map(o => `
        <label class="option" data-label="${o.label}">
          <input type="${q.type === 'multiple' ? 'checkbox' : 'radio'}" name="opt" value="${o.label}" />
          <span><span class="option-label">${o.label}.</span> ${renderMarkdown(o.text)}</span>
        </label>
      `).join('');
    } else {
      $('optionsBox').innerHTML = '';
      $('optionsBox').classList.add('hidden');
    }
  }
  if ($('textAnswerBox')) {
    $('textAnswerBox').classList.toggle('hidden', isChoiceType(q.type));
    if ($('fillAnswerInput')) $('fillAnswerInput').classList.toggle('hidden', q.type !== 'fill');
    if ($('shortAnswerInput')) $('shortAnswerInput').classList.toggle('hidden', q.type !== 'short');
    if ($('fillAnswerInput')) { $('fillAnswerInput').value = ''; $('fillAnswerInput').disabled = false; }
    if ($('shortAnswerInput')) { $('shortAnswerInput').value = ''; $('shortAnswerInput').disabled = false; }
  }
  document.querySelectorAll('.option').forEach(el => {
    el.addEventListener('click', (event) => { event.preventDefault(); selectOption(el.dataset.label); });
  });
  const oldRecord = historyRecordForIndex(state.currentIndex);
  if (oldRecord) {
    // 已做错的题跳回来时先展示原来的错题结果，并允许查看题解/评论；
    // 真正点击“重新作答”后才清空答案并隐藏题解/评论。
    restoreSolvedQuestion(oldRecord);
  } else {
    renderDraftSelection();
  }
  renderQuestionNotes(q);
  renderHistory();
  updateStats();
  saveProgress();
}

function selectOption(label) {
  if (state.checked) return;
  const q = state.current;
  if (!q) return;
  if (q.type === 'single') state.selected = new Set([label]);
  else {
    if (state.selected.has(label)) state.selected.delete(label);
    else state.selected.add(label);
  }
  document.querySelectorAll('.option').forEach(el => {
    const checked = state.selected.has(el.dataset.label);
    el.classList.toggle('selected', checked);
    const input = el.querySelector('input');
    input.checked = checked;
  });
  state.drafts[state.currentIndex] = [...state.selected].sort().join('');
  saveProgress();
  if (q.type === 'single' && state.settings?.autoSubmit) {
    setTimeout(() => submitAnswer(false), 0);
  }
}


function saveTextAnswerDraft() {
  if (!state.current || isChoiceType(state.current.type) || state.checked) return;
  state.drafts[state.currentIndex] = { text: currentTextAnswer() };
  saveProgress();
}

function selectedAnswerText(q, selectedAns) {
  if (!selectedAns) return isChoiceType(q.type) ? '未选择' : '未作答';
  if (!isChoiceType(q.type)) return selectedAns;
  return selectedAns.split('').map(letter => {
    const opt = q.options.find(o => o.label === letter);
    return opt ? `${letter}. ${opt.text}` : letter;
  }).join('；');
}

function normalizeFreeText(text) {
  return String(text || '').trim().replace(/\s+/g, '').toLowerCase();
}
function isTextAnswerCorrect(q, text) {
  const user = normalizeFreeText(text);
  if (!user) return false;
  const accepted = String(q.answer || q.reference || '').split(/[|;；、，,\/]/).map(normalizeFreeText).filter(Boolean);
  return accepted.some(ans => user === ans);
}
function currentTextAnswer() {
  const q = state.current;
  if (!q || isChoiceType(q.type)) return '';
  return q.type === 'fill' ? ($('fillAnswerInput')?.value || '').trim() : ($('shortAnswerInput')?.value || '').trim();
}


function addHistoryRecord(q, selectedAns, forceShow, correct) {
  const existing = state.history.find(item => item.id === q.id && item.roundIndex === state.currentIndex);
  let result = forceShow ? 'show' : (correct ? 'right' : 'wrong');
  // 已经答错的题，只有重新答对才会变成绿色；单纯看答案仍然保留错误状态。
  if (forceShow && existing?.result === 'wrong') result = 'wrong';
  const record = {
    id: q.id,
    roundIndex: state.currentIndex,
    numberInRound: state.currentIndex + 1,
    topic: q.topic,
    type: q.type,
    number: q.number,
    text: q.text,
    options: q.options,
    answer: q.answer,
    selected: selectedAns,
    result,
  };
  if (existing) Object.assign(existing, record);
  else state.history.push(record);

  // 某道题曾经答错，后来在错题乱序重刷或跳题重答中答对后，所有同 ID 的红色题号都改成绿色。
  if (!forceShow && correct) {
    state.history.forEach(item => {
      if (item.id === q.id && item.result === 'wrong') {
        item.result = 'right';
        item.selected = selectedAns;
      }
    });
  }
  delete state.drafts[state.currentIndex];
  renderHistory();
  saveProgress();
}


function renderHistory() {
  const list = $('historyList');
  if (!list) return;
  if (!state.pool.length) {
    list.innerHTML = '<div class="history-empty">本轮还没有生成题目。</div>';
    updateStats();
    return;
  }
  const recordMap = new Map(state.history.map(item => [item.roundIndex, item]));
  list.innerHTML = `
    <div class="history-number-grid">
      ${state.pool.map((q, index) => {
        const item = recordMap.get(index);
        const result = item ? item.result : 'todo';
        const statusText = result === 'right' ? '正确' : result === 'wrong' ? '错误' : result === 'show' ? '看答案' : '未做';
        const isCurrent = index === state.currentIndex ? ' current' : '';
        return `<button class="history-number-btn history-jump ${result}${isCurrent}" type="button" data-index="${index}" title="第 ${index + 1} 题：${statusText}">
          <span>第 ${index + 1} 题</span><small>${statusText}</small>
        </button>`;
      }).join('')}
    </div>
    <p class="history-tip">灰色=未做，绿色=正确，红色=错误，黄色=看过答案。点任意题号都能跳转；红色错题跳回后可先看题解/评论，点“重新作答”后会隐藏题解和评论，答对后变绿。</p>
  `;
  updateStats();
}


function openHistory() {
  renderHistory();
  state.historyOpen = true;
  $('historyPanel')?.classList.remove('hidden');
  document.body.classList.add('history-open');
}

function closeHistory(update=true) {
  state.historyOpen = false;
  $('historyPanel')?.classList.add('hidden');
  document.body.classList.remove('history-open');
  if (update) updateStats();
}

function toggleHistory() {
  if (state.historyOpen) closeHistory();
  else openHistory();
}

function isDesktopHistoryLayout() {
  return window.matchMedia && window.matchMedia('(min-width: 901px)').matches;
}

function jumpToHistoryQuestion(index) {
  const num = Number(index);
  if (!Number.isInteger(num) || num < 0 || num >= state.pool.length) return;
  const keepHistoryOpen = isDesktopHistoryLayout();
  state.currentIndex = num;
  if (!keepHistoryOpen) closeHistory(false);
  renderQuestion();
  if (keepHistoryOpen) {
    state.historyOpen = true;
    $('historyPanel')?.classList.remove('hidden');
    document.body.classList.add('history-open');
    renderHistory();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}


function scheduleAutoNext() {
  clearAutoTimer();
  if ($('answerBox')) $('answerBox').innerHTML += '<br><span class="auto-next-tip">答对了，自动进入下一题...</span>';
  state.autoTimer = setTimeout(() => {
    state.autoTimer = null;
    nextQuestion();
  }, AUTO_NEXT_DELAY);
}

function submitAnswer(forceShow=false) {
  const q = state.current;
  if (!q) return;
  let selectedAns = '';
  let correct = false;
  if (isChoiceType(q.type)) {
    if (!forceShow && !state.selected.size) { alert('先选择一个答案再提交。'); return; }
    selectedAns = [...state.selected].sort().join('');
    correct = selectedAns === q.answer;
  } else {
    selectedAns = currentTextAnswer();
    if (!forceShow && !selectedAns) { alert('请先输入答案再提交。'); return; }
    correct = !forceShow && (q.type === 'short' && !q.answer ? false : isTextAnswerCorrect(q, selectedAns));
  }
  state.checked = true;
  if (isChoiceType(q.type)) {
    document.querySelectorAll('.option').forEach(el => {
      const label = el.dataset.label;
      if (q.answer.includes(label)) el.classList.add('correct');
      if (state.selected.has(label) && !q.answer.includes(label)) el.classList.add('wrong');
      const input = el.querySelector('input');
      if (input) input.disabled = true;
    });
  } else {
    if ($('fillAnswerInput')) $('fillAnswerInput').disabled = true;
    if ($('shortAnswerInput')) $('shortAnswerInput').disabled = true;
  }
  const referenceOnlyShort = q.type === 'short' && !q.answer && q.reference && !forceShow;
  addHistoryRecord(q, selectedAns, forceShow || referenceOnlyShort, correct);

  const record = historyRecordForIndex(state.currentIndex);
  const wrongIds = getWrongIds();
  if (!forceShow) {
    if (correct) setWrongIds(wrongIds.filter(id => id !== q.id));
    else setWrongIds([...wrongIds, q.id]);
  } else if (record?.result === 'wrong') {
    setWrongIds([...wrongIds, q.id]);
  }

  $('answerBox')?.classList.remove('hidden');
  if ($('answerBox')) {
    const label = referenceOnlyShort ? '已查看参考答案' : (forceShow ? (record?.result === 'wrong' ? '仍标记为错误，请重新作答直到正确' : '答案') : (correct ? '回答正确 ✅' : '回答错误 ❌'));
    const answerLabel = isChoiceType(q.type) ? `正确答案：${escapeHtml(q.answer)}` : '参考答案：';
    const mine = !forceShow && !isChoiceType(q.type) ? `<br><b>你的作答：</b><br>${renderMarkdown(selectedAns)}` : '';
    $('answerBox').innerHTML = `${label}<br><b>${answerLabel}</b><br>${renderMarkdown(answerText(q))}${mine}<div id="questionStatsArea" class="question-stats-area">${isStandaloneMode() ? '' : '正在加载全站统计...'}</div>`;
  }
  renderQuestionNotes(q);
  $('submitBtn')?.classList.add('hidden');
  $('showBtn')?.classList.add('hidden');
  if (record?.result === 'wrong') $('retryWrongBtn')?.classList.remove('hidden');
  else $('retryWrongBtn')?.classList.add('hidden');
  $('nextBtn')?.classList.remove('hidden');
  updateStats();
  saveProgress();
  if (!forceShow && correct && state.settings?.autoNextCorrect !== false) scheduleAutoNext();

  // 全站统计：同步模式下记录本题作答结果，拉取并显示全站正确率。
  if (!forceShow && !isStandaloneMode() && q) {
    recordQuestionAttemptToCloud(q.id, correct).then(stats => {
      const area = document.getElementById('questionStatsArea');
      if (area && stats && stats.total) {
        const rate = Math.round(stats.correct / stats.total * 100);
        area.innerHTML = `<span class="question-stats">全站统计：共 <b>${stats.total}</b> 次提交，正确率 <b>${rate}%</b></span>`;
      } else if (area && isStandaloneMode()) {
        area.innerHTML = '';
      }
    }).catch(() => {
      const area = document.getElementById('questionStatsArea');
      if (area) area.innerHTML = '';
    });
  } else if (isStandaloneMode()) {
    const area = document.getElementById('questionStatsArea');
    if (area) area.innerHTML = '';
  }
}


function shouldNotifyMultipleStart(prevIndex, nextIndex) {
  if (!state.settings?.singleFirst || state.settings?.type !== 'all') return false;
  const prev = state.pool[prevIndex];
  const next = state.pool[nextIndex];
  if (!prev || !next) return false;
  if (prev.type !== 'single' || next.type !== 'multiple') return false;
  // 只在第一次从单选区进入多选区时提醒，错题重刷追加的题不重复乱提醒。
  return !state.pool.slice(0, nextIndex).some(q => q.type === 'multiple');
}

function nextQuestion() {
  clearAutoTimer();
  const prevIndex = state.currentIndex;
  state.currentIndex++;
  saveProgress();
  renderQuestion();
  if (shouldNotifyMultipleStart(prevIndex, state.currentIndex)) {
    setTimeout(() => alert('单选题已刷完，下面开始多选题。'), 80);
  }
}

function getRemainingWrongQuestionIds() {
  return [...new Set(state.history.filter(item => item.result === 'wrong').map(item => item.id))];
}

function appendWrongReplayIfNeeded() {
  if (state.settings?.mode === 'review') return false;
  const wrongIds = getRemainingWrongQuestionIds();
  if (!wrongIds.length) return false;
  const replayQuestions = shuffle(wrongIds)
    .map(id => baseQuestionById(id))
    .filter(Boolean)
    .map(q => prepareQuestion(q, state.settings || readSettings()));
  if (!replayQuestions.length) return false;
  state.wrongReplayCount += 1;
  const startIndex = state.pool.length;
  state.pool.push(...replayQuestions);
  state.currentIndex = startIndex;
  if ($('practiceSub')) $('practiceSub').textContent = `正在乱序重刷错题 · 第 ${state.wrongReplayCount} 轮`;
  renderHistory();
  saveProgress();
  return true;
}

function finishQuiz() {
  clearAutoTimer();
  if (appendWrongReplayIfNeeded()) {
    renderQuestion();
    if ($('answerBox')) {
      $('answerBox').classList.remove('hidden');
      $('answerBox').innerHTML = '上一轮还有错题，已自动把错题打乱后放到后面继续练。';
    }
    return;
  }

  $('questionCard')?.classList.add('hidden');
  $('emptyState')?.classList.remove('hidden');
  const done = state.right + state.wrong;
  const rate = done ? Math.round(state.right / done * 100) : 0;
  clearSavedProgress();
  if ($('emptyState')) $('emptyState').innerHTML = `<h2>本轮完成</h2><p>做题 ${done} 道，正确 ${state.right} 道，错误 ${state.wrong} 道，正确率 ${rate}%。</p><p>错题已经全部重刷到正确，错题本也会随答对自动减少。</p><div class="actions finish-actions"><button class="primary" type="button" onclick="clearSavedProgress(); startQuiz(readSettings(), {resume:false})">再来一轮</button><button class="ghost" type="button" onclick="window.location.href='index.html'">返回首页</button></div>`;
  if ($('progressBar')) $('progressBar').style.width = '100%';
}


function adminTopicOptions() {
  return Object.keys(summary).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

async function ensureAdminUnlocked(action) {
  await loadAdminPasswordFromCloud();
  if (sessionStorage.getItem(ADMIN_AUTH_KEY) === 'ok') {
    action();
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay admin-password-overlay';
  overlay.innerHTML = `
    <div class="auth-card">
      <h1>题库管理密码</h1>
      <p>添加、修改、删除题目和选项需要输入管理密码。</p>
      <input id="adminPasswordInput" type="password" autocomplete="current-password" placeholder="请输入管理密码" />
      <button id="adminPasswordSubmit" class="primary" type="button">进入题库管理</button>
      <button id="adminPasswordCancel" class="ghost" type="button">取消</button>
      <div id="adminPasswordError" class="auth-error"></div>
      <span class="auth-hint">管理密码会优先从云端读取，修改后不会因清缓存恢复默认。</span>
    </div>
  `;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#adminPasswordInput');
  const error = overlay.querySelector('#adminPasswordError');
  const submit = () => {
    if ((input.value || '').trim() === getAdminPassword()) {
      sessionStorage.setItem(ADMIN_AUTH_KEY, 'ok');
      overlay.remove();
      action();
    } else {
      error.textContent = '管理密码错误。';
      input.value = '';
      input.focus();
    }
  };
  overlay.querySelector('#adminPasswordSubmit')?.addEventListener('click', submit);
  overlay.querySelector('#adminPasswordCancel')?.addEventListener('click', () => overlay.remove());
  input?.addEventListener('keydown', (event) => { if (event.key === 'Enter') submit(); });
  setTimeout(() => input?.focus(), 50);
}





async function openInviteManageDialog() {
  document.getElementById('inviteManageOverlay')?.remove();
  await saveAdminPasswordToCloud(getAdminPassword());
  const adminPassword = getAdminPassword();

  const overlay = document.createElement('div');
  overlay.id = 'inviteManageOverlay';
  overlay.className = 'auth-overlay admin-password-overlay';
  overlay.innerHTML = '<div class="auth-card" style="max-width:800px;width:95%;">'
    + '<h1>邀请码管理（一人一码）</h1>'
    + '<p>生成和管理邀请码。每个邀请码可单独设置使用次数、有效期和指定使用者。</p>'
    + '<div class="invite-manage-toolbar" style="display:flex;gap:8px;justify-content:center;margin-bottom:8px;">'
    + '<button id="inviteCreateBtn" class="primary" type="button">+ 生成新邀请码</button>'
    + '<button id="inviteRefreshBtn" class="ghost" type="button">刷新列表</button>'
    + '</div>'
    + '<div id="inviteCodeList" class="invite-code-list" style="max-height:420px;overflow:auto;"></div>'
    + '<div id="inviteManageStatus" class="auth-error" style="min-height:22px;margin-top:8px;"></div>'
    + '<button id="inviteCloseBtn" class="ghost" type="button" style="margin-top:8px;">关闭</button>'
    + '</div>';
  document.body.appendChild(overlay);

  const statusEl = overlay.querySelector('#inviteManageStatus');
  const listEl = overlay.querySelector('#inviteCodeList');

  const loadCodes = async () => {
    listEl.innerHTML = '<p style="text-align:center;color:#64748b;">正在加载...</p>';
    statusEl.textContent = '';
    try {
      const result = await adminListInviteCodes(adminPassword);
      const codes = result.codes || [];
      if (!codes.length) { listEl.innerHTML = '<p style="text-align:center;color:#64748b;padding:24px;">还没有邀请码，点击上方"生成新邀请码"创建。</p>'; return; }
      var html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
        + '<thead><tr style="background:#f1f5f9;">'
        + '<th style="padding:8px;text-align:left;">邀请码</th>'
        + '<th style="padding:8px;text-align:center;width:60px;">次数</th>'
        + '<th style="padding:8px;text-align:left;min-width:60px;">指定给</th>'
        + '<th style="padding:8px;text-align:left;min-width:80px;">过期</th>'
        + '<th style="padding:8px;text-align:center;width:50px;">状态</th>'
        + '<th style="padding:8px;text-align:center;width:50px;">操作</th>'
        + '</tr></thead><tbody>';
      codes.forEach(function(c) {
        var sc = c.status === 'active' ? '#16a34a' : c.status === 'expired' ? '#a0a0a0' : '#dc2626';
        var st = c.status === 'active' ? '有效' : c.status === 'expired' ? '过期' : '禁用';
        var op = c.status !== 'active' ? 'opacity:0.55;' : '';
        var ui = c.max_uses > 0 ? (c.used_count + '/' + c.max_uses) : (c.used_count + '/不限');
        var ei = c.expires_at ? formatTime(new Date(c.expires_at).getTime()) : '-';
        var ai = c.assigned_to ? escapeHtml(c.assigned_to) : '<span style="color:#a0a0a0;">-</span>';
        var ni = c.notes ? '<br><small style="color:#64748b;">' + escapeHtml(c.notes) + '</small>' : '';
        var ab = c.status === 'active'
          ? '<button class="invite-action-btn ghost small-btn" data-code="' + escapeHtml(c.code) + '" data-action="disable">禁用</button>'
          : '<button class="invite-action-btn ghost small-btn" data-code="' + escapeHtml(c.code) + '" data-action="enable">启用</button>';
        html += '<tr style="border-bottom:1px solid #e5e7eb;' + op + '">'
          + '<td style="padding:8px;"><code style="font-weight:600;">' + escapeHtml(c.code) + '</code>' + ni + '</td>'
          + '<td style="padding:8px;text-align:center;">' + ui + '</td>'
          + '<td style="padding:8px;">' + ai + '</td>'
          + '<td style="padding:8px;font-size:12px;">' + ei + '</td>'
          + '<td style="padding:8px;text-align:center;color:' + sc + ';font-weight:600;">' + st + '</td>'
          + '<td style="padding:8px;text-align:center;">' + ab + '</td>'
          + '</tr>';
      });
      html += '</tbody></table>';
      html += '<details style="margin-top:12px;"><summary style="cursor:pointer;color:#2563eb;font-size:13px;">查看使用记录</summary><div style="margin-top:8px;font-size:12px;max-height:200px;overflow:auto;">';
      var hasUsage = false;
      codes.forEach(function(c) {
        if (c.used_by && Array.isArray(c.used_by) && c.used_by.length > 0) {
          hasUsage = true;
          html += '<p style="margin:4px 0;"><code style="font-weight:600;">' + escapeHtml(c.code) + '</code>: '
            + c.used_by.map(function(u) { return escapeHtml(u.identifier || '?') + ' (' + (u.used_at ? formatTime(new Date(u.used_at).getTime()) : '?') + ')'; }).join(', ')
            + '</p>';
        }
      });
      if (!hasUsage) html += '<p style="color:#a0a0a0;">暂无使用记录</p>';
      html += '</div></details>';
      listEl.innerHTML = html;

      listEl.querySelectorAll('.invite-action-btn').forEach(function(btn) {
        btn.addEventListener('click', async function() {
          var cd = btn.dataset.code;
          var ac = btn.dataset.action;
          var ns = ac === 'disable' ? 'disabled' : 'active';
          var msg = ac === 'disable' ? '确定禁用邀请码 "' + cd + '" 吗？已使用的授权不受影响。' : '确定重新启用邀请码 "' + cd + '" 吗？';
          if (!confirm(msg)) return;
          try { await adminUpdateInviteCode(adminPassword, cd, ns); await loadCodes(); } catch (err) { statusEl.textContent = err.message || '操作失败'; }
        });
      });
    } catch (err) { listEl.innerHTML = ''; statusEl.textContent = err.message || '加载邀请码列表失败'; }
  };

  const showCreateForm = () => {
    const existing = overlay.querySelector('.invite-create-form');
    if (existing) { existing.remove(); return; }
    const form = document.createElement('div');
    form.className = 'invite-create-form';
    form.style.cssText = 'background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:8px;';
    form.innerHTML = '<h3 style="margin:0 0 12px;font-size:16px;">生成新邀请码</h3>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
      + '<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">邀请码 <input id="inviteNewCode" type="text" placeholder="例如：zhangsan2024" /></label>'
      + '<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">最大使用次数 <input id="inviteNewMaxUses" type="number" value="1" min="1" /></label>'
      + '<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">指定给（可选） <input id="inviteNewAssignedTo" type="text" placeholder="姓名或学号" /></label>'
      + '<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;">过期时间（可选） <input id="inviteNewExpiresAt" type="datetime-local" /></label>'
      + '<label style="display:flex;flex-direction:column;gap:4px;font-size:13px;grid-column:span 2;">备注（可选） <input id="inviteNewNotes" type="text" placeholder="内部备注" /></label>'
      + '</div>'
      + '<div style="display:flex;gap:8px;margin-top:12px;">'
      + '<button id="inviteCreateSubmit" class="primary" type="button">创建</button>'
      + '<button id="inviteCreateCancel" class="ghost" type="button">取消</button>'
      + '</div>'
      + '<div id="inviteCreateStatus" class="auth-error"></div>';
    overlay.querySelector('.invite-manage-toolbar').after(form);

    const createStatus = form.querySelector('#inviteCreateStatus');
    form.querySelector('#inviteCreateSubmit').addEventListener('click', async () => {
      const code = form.querySelector('#inviteNewCode').value || '';
      if (!code.trim()) { createStatus.textContent = '邀请码不能为空'; return; }
      createStatus.textContent = '正在创建...'; createStatus.style.color = '';
      try {
        await adminCreateInviteCode(adminPassword, code, {
          maxUses: parseInt(form.querySelector('#inviteNewMaxUses').value || '1'),
          expiresAt: form.querySelector('#inviteNewExpiresAt').value ? new Date(form.querySelector('#inviteNewExpiresAt').value).toISOString() : null,
          assignedTo: form.querySelector('#inviteNewAssignedTo').value || null,
          notes: form.querySelector('#inviteNewNotes').value || null
        });
        form.remove(); await loadCodes();
      } catch (err) { createStatus.textContent = err.message || '创建失败'; createStatus.style.color = '#dc2626'; }
    });
    form.querySelector('#inviteCreateCancel').addEventListener('click', () => form.remove());
    setTimeout(() => form.querySelector('#inviteNewCode')?.focus(), 50);
  };

  overlay.querySelector('#inviteCreateBtn').addEventListener('click', showCreateForm);
  overlay.querySelector('#inviteRefreshBtn').addEventListener('click', loadCodes);
  overlay.querySelector('#inviteCloseBtn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  await loadCodes();
}


function openAdminPasswordChangeDialog() {
  document.getElementById('adminChangePasswordOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'adminChangePasswordOverlay';
  overlay.className = 'auth-overlay admin-password-overlay';
  overlay.innerHTML = `
    <div class="auth-card">
      <h1>修改管理密码</h1>
      <p>需要先输入当前管理密码，验证通过后才能设置新密码。</p>
      <input id="adminOldPasswordInput" type="password" autocomplete="current-password" placeholder="当前管理密码" />
      <input id="adminNewPasswordInput" type="password" autocomplete="new-password" placeholder="新管理密码" />
      <input id="adminConfirmPasswordInput" type="password" autocomplete="new-password" placeholder="再次输入新密码" />
      <button id="adminChangePasswordSubmit" class="primary" type="button">保存新密码</button>
      <button id="adminChangePasswordCancel" class="ghost" type="button">取消</button>
      <div id="adminChangePasswordError" class="auth-error"></div>
      <span class="auth-hint">新密码会保存到云端和本地；清理浏览器数据后会从云端恢复，不会自动回到默认密码。</span>
    </div>
  `;
  document.body.appendChild(overlay);
  const oldInput = overlay.querySelector('#adminOldPasswordInput');
  const newInput = overlay.querySelector('#adminNewPasswordInput');
  const confirmInput = overlay.querySelector('#adminConfirmPasswordInput');
  const error = overlay.querySelector('#adminChangePasswordError');
  const submit = () => {
    const oldPass = String(oldInput?.value || '').trim();
    const newPass = String(newInput?.value || '').trim();
    const confirmPass = String(confirmInput?.value || '').trim();
    if (oldPass !== getAdminPassword()) {
      error.textContent = '当前管理密码错误。';
      oldInput.value = '';
      oldInput.focus();
      return;
    }
    if (newPass.length < 4) {
      error.textContent = '新密码至少 4 位。';
      newInput.focus();
      return;
    }
    if (newPass !== confirmPass) {
      error.textContent = '两次输入的新密码不一致。';
      confirmInput.value = '';
      confirmInput.focus();
      return;
    }
    setAdminPassword(newPass);
    sessionStorage.setItem(ADMIN_AUTH_KEY, 'ok');
    error.style.color = '#16a34a';
    error.textContent = '管理密码已修改，并已保存到云端。';
    setTimeout(() => overlay.remove(), 700);
  };
  overlay.querySelector('#adminChangePasswordSubmit')?.addEventListener('click', submit);
  overlay.querySelector('#adminChangePasswordCancel')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
  overlay.querySelectorAll('input').forEach(input => input.addEventListener('keydown', (event) => { if (event.key === 'Enter') submit(); }));
  setTimeout(() => oldInput?.focus(), 50);
}


function questionLikeForEdit(q, topicOverride = '') {
  const topic = topicOverride || q.topic || '自定义题库';
  return normalizeQuestion({
    ...q,
    topic,
    options: (q.options || []).map(o => ({ label: o.label, text: o.text })),
    answer: q.answer,
    reference: q.reference || '',
    course: q.course || '',
    subtopic: q.subtopic || '',
  }, q);
}

function topicExists(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return false;
  return adminTopicOptions().some(t => t === trimmed);
}

function addCustomTopic(name) {
  const topic = String(name || '').trim();
  if (!topic) throw new Error('请输入专题名称。');
  if (topicExists(topic)) throw new Error('这个专题已经存在。');
  const edits = loadQuestionEdits();
  edits.customTopics = [...new Set([...(edits.customTopics || []), topic])];
  saveQuestionEdits(edits);
  return topic;
}

function renameTopicEverywhere(oldName, newName) {
  const oldTopic = String(oldName || '').trim();
  const newTopic = String(newName || '').trim();
  if (!oldTopic) throw new Error('请选择要修改的专题。');
  if (!newTopic) throw new Error('请输入新的专题名称。');
  if (oldTopic === newTopic) throw new Error('新旧专题名称相同。');
  if (topicExists(newTopic)) throw new Error('新专题名称已经存在，请换一个名称。');

  const edits = loadQuestionEdits();
  edits.overrides = edits.overrides || {};
  edits.custom = Array.isArray(edits.custom) ? edits.custom : [];
  edits.customTopics = Array.isArray(edits.customTopics) ? edits.customTopics : [];

  let changedCount = 0;
  questions.filter(q => q.topic === oldTopic).forEach(q => {
    const renamed = questionLikeForEdit(q, newTopic);
    if (isBaseQuestionId(q.id)) {
      edits.overrides[q.id] = renamed;
    } else {
      const idx = edits.custom.findIndex(item => String(item.id) === String(q.id));
      if (idx >= 0) edits.custom[idx] = { ...edits.custom[idx], ...renamed, topic: newTopic, custom: true };
    }
    changedCount += 1;
  });

  edits.customTopics = edits.customTopics.map(t => String(t || '').trim() === oldTopic ? newTopic : String(t || '').trim()).filter(Boolean);
  if (changedCount === 0 && !edits.customTopics.includes(newTopic)) edits.customTopics.push(newTopic);
  edits.customTopics = [...new Set(edits.customTopics)];
  saveQuestionEdits(edits);

  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (saved && Array.isArray(saved.topics)) {
      saved.topics = saved.topics.map(t => t === oldTopic ? newTopic : t);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved));
    }
  } catch (err) {}
  return { oldTopic, newTopic, changedCount };
}

function removeEmptyCustomTopic(name) {
  const topic = String(name || '').trim();
  if (!topic) throw new Error('请选择专题。');
  const info = summary[topic];
  if (info && Number(info.total || 0) > 0) throw new Error('这个专题下面还有题目，不能删除。请先把题目改到其他专题。');
  const edits = loadQuestionEdits();
  edits.customTopics = (edits.customTopics || []).filter(t => String(t || '').trim() !== topic);
  saveQuestionEdits(edits);
  return topic;
}

function refreshAdminTopicControls(overlay, selectedTopic = '') {
  if (!overlay) return;
  const topics = adminTopicOptions();
  const filter = overlay.querySelector('#adminTopicFilter');
  const oldFilter = selectedTopic || filter?.value || 'all';
  if (filter) {
    filter.innerHTML = `<option value="all">全部专题</option>${topics.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}`;
    filter.value = topics.includes(oldFilter) ? oldFilter : 'all';
  }
  const dataList = overlay.querySelector('#adminTopicDatalist');
  if (dataList) dataList.innerHTML = topics.map(t => `<option value="${escapeHtml(t)}"></option>`).join('');
  renderAdminQuestionList(overlay, overlay._adminState?.selectedId || '');
}

function openTopicManagerDialog(parentOverlay) {
  const existing = document.getElementById('topicManagerOverlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'topicManagerOverlay';
  overlay.className = 'auth-overlay admin-password-overlay topic-manager-overlay';
  const renderInner = () => {
    const topics = adminTopicOptions();
    overlay.innerHTML = `
      <div class="auth-card topic-manager-card">
        <h1>专题管理</h1>
        <p>可以添加新专题，也可以修改已有专题名称。修改名称会自动更新该专题下的所有题目。</p>
        <div class="topic-manager-section">
          <b>添加专题</b>
          <div class="topic-manager-row">
            <input id="topicAddInput" type="text" placeholder="例如：数据库新增题" />
            <button id="topicAddBtn" class="primary" type="button">添加</button>
          </div>
        </div>
        <div class="topic-manager-section">
          <b>修改专题名称</b>
          <select id="topicOldSelect">${topics.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}（${summary[t]?.total || 0} 题）</option>`).join('')}</select>
          <div class="topic-manager-row">
            <input id="topicRenameInput" type="text" placeholder="新的专题名称" />
            <button id="topicRenameBtn" class="primary" type="button">保存修改</button>
          </div>
          <button id="topicDeleteEmptyBtn" class="danger-btn" type="button">删除空专题</button>
        </div>
        <div id="topicManagerStatus" class="auth-error topic-manager-status"></div>
        <button id="topicManagerCloseBtn" class="ghost" type="button">关闭</button>
      </div>`;
    const status = overlay.querySelector('#topicManagerStatus');
    const setOk = (msg) => { if (status) { status.style.color = '#16a34a'; status.textContent = msg; } };
    const setErr = (msg) => { if (status) { status.style.color = '#dc2626'; status.textContent = msg; } };
    overlay.querySelector('#topicAddBtn')?.addEventListener('click', () => {
      try {
        const topic = addCustomTopic(overlay.querySelector('#topicAddInput')?.value);
        initTopics();
        refreshAdminTopicControls(parentOverlay, topic);
        renderInner();
        setTimeout(() => {
          const st = overlay.querySelector('#topicManagerStatus');
          if (st) { st.style.color = '#16a34a'; st.textContent = `已添加专题：${topic}`; }
        }, 0);
      } catch (err) { setErr(err.message || '添加失败。'); }
    });
    overlay.querySelector('#topicRenameBtn')?.addEventListener('click', () => {
      try {
        const oldTopic = overlay.querySelector('#topicOldSelect')?.value;
        const newTopic = overlay.querySelector('#topicRenameInput')?.value;
        const result = renameTopicEverywhere(oldTopic, newTopic);
        initTopics();
        refreshAdminTopicControls(parentOverlay, result.newTopic);
        const currentTopicInput = parentOverlay?.querySelector('#adminTopicInput');
        if (currentTopicInput && currentTopicInput.value === result.oldTopic) currentTopicInput.value = result.newTopic;
        renderInner();
        setTimeout(() => {
          const st = overlay.querySelector('#topicManagerStatus');
          if (st) { st.style.color = '#16a34a'; st.textContent = `已把“${result.oldTopic}”改为“${result.newTopic}”，更新 ${result.changedCount} 道题。`; }
        }, 0);
      } catch (err) { setErr(err.message || '修改失败。'); }
    });
    overlay.querySelector('#topicDeleteEmptyBtn')?.addEventListener('click', () => {
      const topic = overlay.querySelector('#topicOldSelect')?.value;
      if (!topic) return;
      if (!confirm(`确定删除空专题“${topic}”吗？只有 0 道题的专题可以删除。`)) return;
      try {
        const removed = removeEmptyCustomTopic(topic);
        initTopics();
        refreshAdminTopicControls(parentOverlay);
        renderInner();
        setTimeout(() => {
          const st = overlay.querySelector('#topicManagerStatus');
          if (st) { st.style.color = '#16a34a'; st.textContent = `已删除空专题：${removed}`; }
        }, 0);
      } catch (err) { setErr(err.message || '删除失败。'); }
    });
    overlay.querySelector('#topicOldSelect')?.addEventListener('change', (event) => {
      const input = overlay.querySelector('#topicRenameInput');
      if (input) input.value = event.target.value || '';
    });
    overlay.querySelector('#topicManagerCloseBtn')?.addEventListener('click', () => overlay.remove());
    const oldSelect = overlay.querySelector('#topicOldSelect');
    const renameInput = overlay.querySelector('#topicRenameInput');
    if (oldSelect && renameInput && !renameInput.value) renameInput.value = oldSelect.value || '';
  };
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
  renderInner();
}

// ========== 高级专题管理：层次移动、删除 ==========

function openAdvancedTopicManagerDialog() {
  document.getElementById('advancedTopicMgrOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'advancedTopicMgrOverlay';
  overlay.className = 'auth-overlay admin-password-overlay';

  const setStatus = (msg, isErr) => {
    const st = overlay.querySelector('#topicMgrStatus');
    if (st) { st.textContent = msg; st.className = 'topic-mgr-status ' + (isErr ? 'error' : 'success'); }
  };

  const renderTree = () => {
    const hierarchy = buildTopicHierarchy();
    const edits = loadQuestionEdits();
    const customSubs = edits.customSubTopics || [];
    let html = '';
    if (!hierarchy.length) {
      html = '<div class="topic-mgr-empty">暂无专题数据</div>';
    }
    hierarchy.forEach(([course, courseInfo]) => {
      html += `<details class="topic-mgr-course" open>
        <summary><b>${escapeHtml(course)}</b> <small>${countSummaryText(courseInfo)}</small></summary>
        <div class="topic-mgr-course-body">`;
      const topicEntries = [...courseInfo.topics.entries()];
      topicEntries.forEach(([topic, topicInfo]) => {
        html += `<div class="topic-mgr-topic">
          <span class="topic-mgr-topic-name">📁 ${escapeHtml(topic)} <small>${countSummaryText(topicInfo)}</small></span>
          <span class="topic-mgr-actions">
            <button class="topic-mgr-btn-move" data-action="move" data-topic="${escapeHtml(topic)}">移入▾</button>
            <button class="topic-mgr-btn-delete" data-action="delete-topic" data-topic="${escapeHtml(topic)}" data-count="${topicInfo.total}">删除</button>
          </span>
        </div>`;
        // 移入选择器
        html += `<div class="topic-mgr-move-select">
          <select>${adminTopicOptions().filter(t => t !== topic).map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}</select>
          <button class="topic-mgr-btn-move" data-action="confirm-move" data-topic="${escapeHtml(topic)}">确认移入</button>
        </div>`;
        // 渲染子专题
        const subEntries = [...topicInfo.subs.entries()];
        subEntries.forEach(([sub, subInfo]) => {
          html += `<div class="topic-mgr-subtopic">
            <span class="topic-mgr-subtopic-name">📄 ${escapeHtml(sub)} <small>${countSummaryText(subInfo)}</small></span>
            <span class="topic-mgr-actions">
              <button class="topic-mgr-btn-promote" data-action="promote" data-topic="${escapeHtml(topic)}" data-sub="${escapeHtml(sub)}">移出</button>
              <button class="topic-mgr-btn-delete" data-action="delete-sub" data-topic="${escapeHtml(topic)}" data-sub="${escapeHtml(sub)}" data-count="${subInfo.total}">删除</button>
            </span>
          </div>`;
        });
      });
      html += `</div></details>`;
    });

    const content = overlay.querySelector('#topicMgrContent');
    if (content) content.innerHTML = html;

    // 绑定事件
    content?.querySelectorAll('[data-action="move"]').forEach(btn => {
      btn.addEventListener('click', () => {
        // 找到本行紧邻的 .topic-mgr-move-select
        const row = btn.closest('.topic-mgr-topic');
        const sel = row?.nextElementSibling;
        if (sel && sel.classList.contains('topic-mgr-move-select')) {
          sel.classList.toggle('open');
        }
      });
    });
    content?.querySelectorAll('[data-action="confirm-move"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const topic = btn.dataset.topic;
        const moveSel = btn.closest('.topic-mgr-move-select');
        const select = moveSel?.querySelector('select');
        const target = select?.value;
        if (!target) return;
        if (!confirm(`确定将专题"${topic}"及其所有题目移入"${target}"吗？`)) return;
        try {
          const result = moveTopicUnder(topic, target);
          setStatus(`已将"${topic}"移入"${target}"，移动 ${result.movedCount} 道题。`);
          initTopics();
          renderTree();
        } catch (err) { setStatus(err.message, true); }
      });
    });
    content?.querySelectorAll('[data-action="promote"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const topic = btn.dataset.topic;
        const sub = btn.dataset.sub;
        if (!confirm(`确定将子专题"${sub}"从"${topic}"中移出，提升为独立专题吗？`)) return;
        try {
          const result = promoteSubtopicToTopic(topic, sub);
          setStatus(`已将"${sub}"提升为独立专题，影响 ${result.changedCount} 道题。`);
          initTopics();
          renderTree();
        } catch (err) { setStatus(err.message, true); }
      });
    });
    content?.querySelectorAll('[data-action="delete-topic"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const topic = btn.dataset.topic;
        const count = Number(btn.dataset.count) || 0;
        if (!confirm(`⚠️ 确定删除专题"${topic}"及其所有 ${count} 道题目吗？\n\n此操作不可撤销！`)) return;
        try {
          const result = deleteTopicWithQuestions(topic);
          setStatus(`已删除专题"${topic}"及其 ${result.deletedCount} 道题目。`);
          initTopics();
          renderTree();
        } catch (err) { setStatus(err.message, true); }
      });
    });
    content?.querySelectorAll('[data-action="delete-sub"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const topic = btn.dataset.topic;
        const sub = btn.dataset.sub;
        const count = Number(btn.dataset.count) || 0;
        if (!confirm(`⚠️ 确定删除子专题"${sub}"及其所有 ${count} 道题目吗？\n\n此操作不可撤销！`)) return;
        try {
          const result = deleteTopicWithQuestions(topic, sub);
          setStatus(`已删除子专题"${sub}"及其 ${result.deletedCount} 道题目。`);
          initTopics();
          renderTree();
        } catch (err) { setStatus(err.message, true); }
      });
    });
  };

  overlay.innerHTML = `
    <div class="auth-card advanced-topic-mgr-card">
      <h1>专题管理</h1>
      <p class="topic-mgr-desc">管理专题层次结构：新建、移动、提升、删除专题及其子专题。</p>
      <div class="topic-mgr-toolbar">
        <button id="advAddTopicBtn" class="primary" type="button" style="width:auto">+ 新建专题</button>
        <button id="advAddSubBtn" class="ghost" type="button" style="width:auto">+ 新建子专题</button>
      </div>
      <div class="topic-mgr-tree" id="topicMgrContent"></div>
      <div id="topicMgrStatus" class="topic-mgr-status"></div>
      <button id="advTopicMgrCloseBtn" class="ghost" type="button">关闭</button>
    </div>`;
  document.body.appendChild(overlay);

  // 新建专题
  overlay.querySelector('#advAddTopicBtn')?.addEventListener('click', () => {
    const name = prompt('请输入新专题名称：');
    if (!name || !name.trim()) return;
    try {
      addCustomTopic(name.trim());
      setStatus(`已创建专题：${name.trim()}`);
      initTopics();
      renderTree();
    } catch (err) { setStatus(err.message, true); }
  });

  // 新建子专题
  overlay.querySelector('#advAddSubBtn')?.addEventListener('click', () => {
    const parent = prompt('请输入父专题名称：');
    if (!parent || !parent.trim()) return;
    const name = prompt('请输入子专题名称：');
    if (!name || !name.trim()) return;
    try {
      createEmptySubtopic(parent.trim(), name.trim());
      setStatus(`已在"${parent.trim()}"下创建子专题：${name.trim()}`);
      initTopics();
      renderTree();
    } catch (err) { setStatus(err.message, true); }
  });

  overlay.querySelector('#advTopicMgrCloseBtn')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
  renderTree();
}

function openQuestionManager(targetId = '') {
  ensureAdminUnlocked(() => renderQuestionManager(targetId));
}

function renderQuestionManager(targetId = '') {
  document.getElementById('questionManagerOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'questionManagerOverlay';
  overlay.className = 'admin-manager-overlay';
  overlay.innerHTML = `
    <div class="admin-manager-card">
      <div class="admin-manager-head">
        <div>
          <h2>题库管理</h2>
          <p>可以添加、修改、删除题目，也可以修改 A-D 等选项内容和正确答案。保存后会同步到云端题库修改区。</p>
        </div>
        <button id="adminCloseBtn" class="history-close" type="button">关闭</button>
      </div>
      <div class="admin-toolbar">
        <input id="adminSearchInput" type="text" placeholder="搜索题干 / 专题 / 原题号" />
        <select id="adminTopicFilter"><option value="all">全部专题</option>${adminTopicOptions().map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}</select>
        <button id="adminAddBtn" class="primary" type="button">新增题目</button>
        <button id="adminTopicManageBtn" class="ghost" type="button">专题管理</button>
        <button id="adminExportBankBtn" class="ghost" type="button">导出题库</button>
        <button id="adminImportBankBtn" class="ghost" type="button">导入题库/Word/填空简答</button>
        <input id="adminImportFileInput" type="file" accept=".json,.docx,.txt,.text" hidden />
        <button id="adminReloadEditsBtn" class="ghost" type="button">从云端刷新</button>
        <button id="adminChangePasswordBtn" class="ghost" type="button">修改管理密码</button>
        <button id="adminInviteManageBtn" class="ghost" type="button">邀请码管理</button>
        <button id="adminResetAllBtn" class="danger-btn" type="button">清空题库修改</button>
      </div>
      <div class="admin-manager-body">
        <aside class="admin-list-wrap">
          <div class="admin-list-title">题目列表 <span id="adminListCount"></span></div>
          <div id="adminQuestionList" class="admin-question-list"></div>
        </aside>
        <section class="admin-form-wrap">
          <form id="adminQuestionForm" class="admin-question-form">
            <input id="adminQuestionId" type="hidden" />
            <div class="admin-form-status" id="adminFormStatus">选择左侧题目进行编辑，或点击“新增题目”。</div>
            <div class="admin-three-cols">
              <label>大专题 / 课程名称
                <input id="adminCourseInput" placeholder="例如：毛概 / 数据库" />
              </label>
              <label>小专题 / 章节
                <input id="adminTopicInput" list="adminTopicDatalist" placeholder="例如：第一章" />
                <datalist id="adminTopicDatalist">${adminTopicOptions().map(t => `<option value="${escapeHtml(t)}"></option>`).join('')}</datalist>
              </label>
              <label>更小专题 / 小节
                <input id="adminSubtopicInput" placeholder="例如：专题一 / SQL 基础" />
              </label>
            </div>
            <div class="admin-two-cols">
              <label>原题号
                <input id="adminNumberInput" type="number" min="0" />
              </label>
              <label>题型
                <select id="adminTypeInput">
                  <option value="single">单选题</option>
                  <option value="multiple">多选题</option>
                  <option value="fill">填空题</option>
                  <option value="short">简答题</option>
                </select>
              </label>
            </div>
            <label>题干
              <textarea id="adminTextInput" rows="4" placeholder="请输入题干"></textarea>
            </label>
            <label>来源/备注
              <input id="adminSourceInput" placeholder="例如：手动添加" />
            </label>
            <div class="admin-option-head">
              <b>选项</b>
              <button id="adminAddOptionBtn" class="ghost small-btn" type="button">添加选项</button>
            </div>
            <div id="adminOptionsArea" class="admin-options-area"></div>
            <div class="admin-answer-box">
              <b>正确答案 / 参考答案</b>
              <div id="adminAnswerArea" class="admin-answer-area"></div>
              <div id="adminTextAnswerArea" class="admin-text-answer-area hidden">
                <label>正确答案（填空可填多个，用 | 或 ；分隔）
                  <textarea id="adminTextAnswerInput" rows="2" placeholder="例如：实事求是|实事求是的思想路线"></textarea>
                </label>
                <label>参考答案（简答题建议填写 Markdown，可插入图片）
                  <textarea id="adminReferenceInput" rows="4" placeholder="可填写参考要点，支持 Markdown，也支持 ![说明](图片链接)"></textarea>
                </label>
                <div class="admin-ref-tools">
                  <button id="adminInsertRefImageBtn" class="ghost small-btn" type="button">插入图片链接</button>
                  <button id="adminUploadRefImageBtn" class="ghost small-btn" type="button">上传图片插入</button>
                  <input id="adminReferenceImageFile" type="file" accept="image/*" class="hidden" />
                </div>
              </div>
              <small>选择题用 A/B/C/D；填空题可设置正确答案；简答题可以设置参考答案，并支持 Markdown 图片。</small>
            </div>
            <div class="admin-form-actions">
              <button id="adminSaveBtn" class="primary" type="submit">保存题目</button>
              <button id="adminDeleteBtn" class="danger-btn" type="button">删除这道题</button>
              <button id="adminCancelEditBtn" class="ghost" type="button">清空表单</button>
            </div>
          </form>
        </section>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const stateAdmin = { selectedId: '', optionTexts: [] };
  overlay._adminState = stateAdmin;
  bindReferenceImageTools(overlay);

  const renderList = () => renderAdminQuestionList(overlay, stateAdmin.selectedId);
  overlay.querySelector('#adminCloseBtn')?.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (event) => { if (event.target === overlay) overlay.remove(); });
  overlay.querySelector('#adminSearchInput')?.addEventListener('input', renderList);
  overlay.querySelector('#adminTopicFilter')?.addEventListener('change', renderList);
  overlay.querySelector('#adminAddBtn')?.addEventListener('click', () => setAdminFormQuestion(overlay, null));
  overlay.querySelector('#adminTopicManageBtn')?.addEventListener('click', () => openTopicManagerDialog(overlay));
  overlay.querySelector('#adminExportBankBtn')?.addEventListener('click', exportQuestionBank);
  overlay.querySelector('#adminImportBankBtn')?.addEventListener('click', () => {
    const input = overlay.querySelector('#adminImportFileInput');
    if (input) { input.value = ''; input.click(); }
  });
  overlay.querySelector('#adminImportFileInput')?.addEventListener('change', (event) => {
    handleQuestionBankImportFile(overlay, event.target.files?.[0]);
  });
  overlay.querySelector('#adminChangePasswordBtn')?.addEventListener('click', openAdminPasswordChangeDialog);
  overlay.querySelector('#adminInviteManageBtn')?.addEventListener('click', openInviteManageDialog);
  overlay.querySelector('#adminReloadEditsBtn')?.addEventListener('click', async () => {
    overlay.querySelector('#adminFormStatus').textContent = '正在从云端刷新题库修改...';
    await loadQuestionEditsFromCloud();
    initTopics();
    renderQuestionManager(stateAdmin.selectedId);
  });
  overlay.querySelector('#adminResetAllBtn')?.addEventListener('click', () => {
    if (!confirm('确定清空所有手动添加、修改、删除记录吗？这会恢复到内置题库。')) return;
    saveQuestionEdits(emptyQuestionEdits());
    initTopics();
    if (document.body.dataset.page === 'practice') startQuiz(readSettings(), { resume: false });
    renderQuestionManager('');
  });
  overlay.querySelector('#adminQuestionList')?.addEventListener('click', (event) => {
    const btn = event.target.closest('.admin-question-row');
    if (!btn) return;
    setAdminFormQuestion(overlay, questionById(btn.dataset.id));
  });
  overlay.querySelector('#adminAddOptionBtn')?.addEventListener('click', () => addAdminOptionRow(overlay, ''));
  overlay.querySelector('#adminOptionsArea')?.addEventListener('click', (event) => {
    const btn = event.target.closest('.admin-remove-option');
    if (!btn) return;
    const rows = [...overlay.querySelectorAll('.admin-option-row')];
    if (rows.length <= 2) { alert('至少保留两个选项。'); return; }
    btn.closest('.admin-option-row')?.remove();
    relabelAdminOptions(overlay);
    renderAdminAnswerChoices(overlay);
  });
  overlay.querySelector('#adminOptionsArea')?.addEventListener('input', () => renderAdminAnswerChoices(overlay));
  overlay.querySelector('#adminTypeInput')?.addEventListener('change', () => renderAdminAnswerChoices(overlay));
  overlay.querySelector('#adminCancelEditBtn')?.addEventListener('click', () => setAdminFormQuestion(overlay, null));
  overlay.querySelector('#adminDeleteBtn')?.addEventListener('click', () => deleteAdminQuestion(overlay));
  overlay.querySelector('#adminQuestionForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    saveAdminQuestionForm(overlay);
  });

  renderList();
  if (targetId && questionById(targetId)) setAdminFormQuestion(overlay, questionById(targetId));
  else setAdminFormQuestion(overlay, null);
}

function renderAdminQuestionList(overlay, selectedId = '') {
  const list = overlay.querySelector('#adminQuestionList');
  const count = overlay.querySelector('#adminListCount');
  if (!list) return;
  const keyword = String(overlay.querySelector('#adminSearchInput')?.value || '').trim().toLowerCase();
  const topic = overlay.querySelector('#adminTopicFilter')?.value || 'all';
  let rows = questions;
  if (topic !== 'all') rows = rows.filter(q => q.topic === topic);
  if (keyword) {
    rows = rows.filter(q => `${q.topic} ${q.number} ${q.text} ${q.options.map(o => o.text).join(' ')}`.toLowerCase().includes(keyword));
  }
  if (count) count.textContent = `(${rows.length})`;
  const visible = rows.slice(0, 300);
  list.innerHTML = visible.map(q => `
    <button class="admin-question-row ${String(q.id) === String(selectedId) ? 'active' : ''}" type="button" data-id="${escapeHtml(q.id)}">
      <b>${escapeHtml(q.topic)} · ${q.number || '-'}</b>
      <span>${escapeHtml(q.text).slice(0, 70)}${q.text.length > 70 ? '…' : ''}</span>
      <small>${renderTypeName(q.type)} · ${isChoiceType(q.type) ? '答案 ' + escapeHtml(q.answer) : '参考答案'}${q.custom ? ' · 手动添加' : ''}</small>
    </button>
  `).join('') || '<div class="admin-empty">没有匹配的题目。</div>';
}

function setAdminFormQuestion(overlay, q) {
  const status = overlay.querySelector('#adminFormStatus');
  const idInput = overlay.querySelector('#adminQuestionId');
  const courseInput = overlay.querySelector('#adminCourseInput');
  const topicInput = overlay.querySelector('#adminTopicInput');
  const subtopicInput = overlay.querySelector('#adminSubtopicInput');
  const numberInput = overlay.querySelector('#adminNumberInput');
  const typeInput = overlay.querySelector('#adminTypeInput');
  const textInput = overlay.querySelector('#adminTextInput');
  const sourceInput = overlay.querySelector('#adminSourceInput');
  const textAnswerInput = overlay.querySelector('#adminTextAnswerInput');
  const referenceInput = overlay.querySelector('#adminReferenceInput');
  overlay._adminState.selectedId = q?.id || '';
  if (idInput) idInput.value = q?.id || '';
  if (courseInput) courseInput.value = q?.course || deriveCourseName(q || {});
  if (topicInput) topicInput.value = q?.topic || '自定义题库';
  if (subtopicInput) subtopicInput.value = q?.subtopic || q?.source_stem || q?.topic || '';
  if (numberInput) numberInput.value = q?.number || '';
  if (typeInput) typeInput.value = q?.type || 'single';
  if (textInput) textInput.value = q?.text || '';
  if (sourceInput) sourceInput.value = q?.source || '手动添加';
  if (textAnswerInput) textAnswerInput.value = !isChoiceType(q?.type) ? (q?.answer || '') : '';
  if (referenceInput) referenceInput.value = q?.reference || '';
  if (status) status.textContent = q ? `正在编辑：${q.topic} · 原题号 ${q.number || '-'} · ID：${q.id}` : '正在新增题目。保存后会加入题库。';
  const area = overlay.querySelector('#adminOptionsArea');
  if (area) area.innerHTML = '';
  const opts = q?.options?.length ? q.options.map(o => o.text) : ['', '', '', ''];
  opts.forEach(text => addAdminOptionRow(overlay, text, false));
  if (area && area.children.length < 2) {
    while (area.children.length < 2) addAdminOptionRow(overlay, '', false);
  }
  renderAdminAnswerChoices(overlay, q?.answer || '');
  renderAdminQuestionList(overlay, q?.id || '');
}

function addAdminOptionRow(overlay, text = '', update = true) {
  const area = overlay.querySelector('#adminOptionsArea');
  if (!area) return;
  const index = area.children.length;
  if (index >= LETTERS.length) { alert(`最多支持 ${LETTERS.length} 个选项。`); return; }
  const row = document.createElement('div');
  row.className = 'admin-option-row';
  row.innerHTML = `
    <b>${LETTERS[index]}.</b>
    <input class="adminOptionText" type="text" value="${escapeHtml(text)}" placeholder="选项内容" />
    <button class="admin-remove-option" type="button">删除选项</button>
  `;
  area.appendChild(row);
  if (update) {
    relabelAdminOptions(overlay);
    renderAdminAnswerChoices(overlay);
  }
}

function relabelAdminOptions(overlay) {
  [...overlay.querySelectorAll('.admin-option-row')].forEach((row, index) => {
    const label = row.querySelector('b');
    if (label) label.textContent = `${LETTERS[index]}.`;
  });
}

function insertTextAtCursor(textarea, text) {
  if (!textarea) return;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  textarea.value = `${before}${text}${after}`;
  const pos = start + text.length;
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = pos;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function bindReferenceImageTools(overlay) {
  const textarea = overlay.querySelector('#adminReferenceInput');
  const fileInput = overlay.querySelector('#adminReferenceImageFile');
  overlay.querySelector('#adminInsertRefImageBtn')?.addEventListener('click', () => {
    const url = (prompt('请输入图片链接或 data:image 地址') || '').trim();
    if (!url) return;
    const alt = (prompt('请输入图片说明（可不填）') || '').trim();
    insertTextAtCursor(textarea, `
![${alt}](${url})
`);
  });
  overlay.querySelector('#adminUploadRefImageBtn')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (!/^image\//i.test(file.type || '')) {
      alert('请选择图片文件。');
      fileInput.value = '';
      return;
    }
    const alt = (prompt('请输入图片说明（可不填）', file.name.replace(/\.[^.]+$/, '')) || '').trim();
    const reader = new FileReader();
    reader.onload = () => {
      insertTextAtCursor(textarea, `
![${alt}](${reader.result})
`);
      fileInput.value = '';
    };
    reader.readAsDataURL(file);
  });
}

function renderAdminAnswerChoices(overlay, selected = null) {
  const box = overlay.querySelector('#adminAnswerArea');
  const textBox = overlay.querySelector('#adminTextAnswerArea');
  const optionsHead = overlay.querySelector('.admin-option-head');
  const optionsArea = overlay.querySelector('#adminOptionsArea');
  if (!box) return;
  const type = overlay.querySelector('#adminTypeInput')?.value || 'single';
  if (!isChoiceType(type)) {
    box.innerHTML = '';
    textBox?.classList.remove('hidden');
    optionsHead?.classList.add('muted-options');
    optionsArea?.classList.add('muted-options');
    return;
  }
  textBox?.classList.add('hidden');
  optionsHead?.classList.remove('muted-options');
  optionsArea?.classList.remove('muted-options');
  const currentSelected = selected === null ? [...overlay.querySelectorAll('input[name="adminAnswer"]:checked')].map(input => input.value).join('') : selected;
  const selectedSet = new Set(String(currentSelected || '').toUpperCase().split(''));
  const rows = [...overlay.querySelectorAll('.admin-option-row')];
  const inputType = type === 'multiple' ? 'checkbox' : 'radio';
  box.innerHTML = rows.map((row, index) => {
    const text = row.querySelector('.adminOptionText')?.value || '';
    const letter = LETTERS[index];
    return `<label><input type="${inputType}" name="adminAnswer" value="${letter}" ${selectedSet.has(letter) ? 'checked' : ''} /> ${letter}${text.trim() ? `：${escapeHtml(text.trim()).slice(0, 18)}` : ''}</label>`;
  }).join('');
}


function collectAdminQuestionForm(overlay) {
  const id = String(overlay.querySelector('#adminQuestionId')?.value || '').trim();
  const type = overlay.querySelector('#adminTypeInput')?.value || 'single';
  const optionTexts = [...overlay.querySelectorAll('.adminOptionText')].map(input => input.value.trim()).filter(Boolean);
  const answers = isChoiceType(type)
    ? [...overlay.querySelectorAll('input[name="adminAnswer"]:checked')].map(input => input.value).join('')
    : String(overlay.querySelector('#adminTextAnswerInput')?.value || '').trim();
  const reference = String(overlay.querySelector('#adminReferenceInput')?.value || '').trim();
  const q = normalizeQuestion({
    id: id || undefined,
    course: overlay.querySelector('#adminCourseInput')?.value,
    topic: overlay.querySelector('#adminTopicInput')?.value,
    subtopic: overlay.querySelector('#adminSubtopicInput')?.value,
    number: overlay.querySelector('#adminNumberInput')?.value,
    type,
    text: overlay.querySelector('#adminTextInput')?.value,
    source: overlay.querySelector('#adminSourceInput')?.value || '手动添加',
    source_stem: overlay.querySelector('#adminSourceInput')?.value || '手动添加',
    options: isChoiceType(type) ? optionTexts.map((text, index) => ({ label: LETTERS[index], text })) : [],
    answer: answers,
    reference,
    custom: !id || !isBaseQuestionId(id),
  }, id ? questionById(id) || {} : {});
  if (!q.topic) throw new Error('请填写专题。');
  if (!q.text) throw new Error('请填写题干。');
  if (isChoiceType(type)) {
    if (q.options.length < 2) throw new Error('至少填写两个选项。');
    if (!q.answer) throw new Error('请勾选正确答案。');
    if (type === 'single' && q.answer.length !== 1) throw new Error('单选题只能选择一个正确答案。');
  } else if (!q.answer && !q.reference) {
    throw new Error('填空题/简答题需要填写正确答案或参考答案。');
  }
  return q;
}


function saveAdminQuestionForm(overlay) {
  try {
    const q = collectAdminQuestionForm(overlay);
    const edits = loadQuestionEdits();
    edits.deletedIds = (edits.deletedIds || []).filter(id => String(id) !== String(q.id));
    if (isBaseQuestionId(q.id)) {
      edits.overrides[q.id] = q;
    } else {
      q.custom = true;
      const index = (edits.custom || []).findIndex(item => String(item.id) === String(q.id));
      if (index >= 0) edits.custom[index] = q;
      else edits.custom.push(q);
    }
    saveQuestionEdits(edits);
    afterQuestionBankEdited(q.id);
    const fresh = questionById(q.id);
    setAdminFormQuestion(overlay, fresh);
    const status = overlay.querySelector('#adminFormStatus');
    if (status) status.textContent = '已保存题目。首页专题数量和刷题题库已更新。';
  } catch (err) {
    alert(err.message || '保存失败，请检查题目内容。');
  }
}

function deleteAdminQuestion(overlay) {
  const id = overlay.querySelector('#adminQuestionId')?.value;
  if (!id) { alert('当前是新增表单，还没有可删除的题目。'); return; }
  const q = questionById(id);
  if (!q) { alert('没有找到这道题。'); return; }
  if (!confirm(`确定删除这道题吗？\n${q.topic} · 原题号 ${q.number || '-'}\n${q.text.slice(0, 60)}`)) return;
  const edits = loadQuestionEdits();
  if (isBaseQuestionId(id)) {
    edits.deletedIds = [...new Set([...(edits.deletedIds || []), String(id)])];
    if (edits.overrides) delete edits.overrides[id];
  } else {
    edits.custom = (edits.custom || []).filter(item => String(item.id) !== String(id));
  }
  saveQuestionEdits(edits);
  afterQuestionBankEdited('');
  setAdminFormQuestion(overlay, null);
}

function afterQuestionBankEdited(changedId = '') {
  if (document.body.dataset.page === 'home') {
    initTopics();
    updateStats();
    return;
  }
  if (document.body.dataset.page === 'practice') {
    const freshCurrent = changedId && state.current ? questionById(state.current.id) : null;
    if (freshCurrent && state.current?.id === changedId) {
      state.pool[state.currentIndex] = prepareQuestion(freshCurrent);
      delete state.drafts[state.currentIndex];
      state.history = state.history.filter(item => item.roundIndex !== state.currentIndex);
      renderQuestion();
    } else {
      applyPracticeHeader(state.settings || readSettings(), state.pool);
      renderHistory();
    }
  }
}

function safeFileStem(name = '') {
  return String(name || '导入题库')
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim() || '导入题库';
}

function simplifyQuestionForExport(q) {
  const normalized = normalizeQuestion(q, q);
  return {
    id: normalized.id,
    topic: normalized.topic,
    number: normalized.number,
    type: normalized.type,
    text: normalized.text,
    options: normalized.options.map(o => ({ label: o.label, text: o.text })),
    answer: normalized.answer,
    reference: normalized.reference || '',
    course: normalized.course || '',
    subtopic: normalized.subtopic || '',
    source: normalized.source,
    source_stem: normalized.source_stem,
    custom: Boolean(normalized.custom),
  };
}

function downloadTextFile(filename, text, mime = 'application/json;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportQuestionBank() {
  const payload = {
    format: 'quiz_question_bank_export_v2',
    exportedAt: new Date().toISOString(),
    questionCount: questions.length,
    note: 'questions 是当前完整题库；edits 是用于恢复本网站题库修改的记录。导入本文件会优先恢复 edits。',
    questions: questions.map(simplifyQuestionForExport),
    edits: loadQuestionEdits(),
  };
  const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  downloadTextFile(`刷题网站题库导出_${ts}.json`, JSON.stringify(payload, null, 2));
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
    reader.readAsText(file, 'utf-8');
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
    reader.readAsArrayBuffer(file);
  });
}

function normalizeAnswerLetters(value) {
  return [...new Set(String(value || '').toUpperCase().replace(/[^A-H]/g, '').split('').filter(Boolean))].sort().join('');
}

function cleanImportedLine(line = '') {
  return String(line || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\*\*/g, '')
    .replace(/^[\s•●·-]+/, '')
    .trim();
}

function extractAnswerFromStem(stem) {
  let answer = '';
  let answerText = '';
  let cleaned = String(stem || '');
  const answerMatch = cleaned.match(/(?:答案|正确答案)\s*[:：]?\s*([A-Ha-h]{1,8})/);
  if (answerMatch) {
    answer = normalizeAnswerLetters(answerMatch[1]);
    cleaned = cleaned.replace(answerMatch[0], '');
  }
  const inlineLetter = cleaned.match(/[（(]\s*([A-Ha-h](?:\s*[、,，]?\s*[A-Ha-h]){0,7})\s*[）)]/);
  if (!answer && inlineLetter) {
    answer = normalizeAnswerLetters(inlineLetter[1]);
    cleaned = cleaned.replace(inlineLetter[0], '（ ）');
  }
  if (!answer) {
    const inlineText = cleaned.match(/[（(]\s*([^（）()]{1,24})\s*[）)]/);
    if (inlineText && !/[？?]/.test(inlineText[1]) && !/^\d+$/.test(inlineText[1].trim())) {
      answerText = inlineText[1].trim();
      cleaned = cleaned.replace(inlineText[0], '（ ）');
    }
  }
  return { answer, answerText, cleaned: cleaned.trim() };
}

function parseAnswerLine(line) {
  const raw = String(line || '').trim();
  const m = raw.match(/^(?:答案|正确答案|参考答案|参考解析|解析)\s*[:：]?\s*(.+)$/);
  if (!m) return { answer: '', answerText: '', reference: '', isReference: false };
  const value = String(m[1] || '').trim();
  const letters = normalizeAnswerLetters(value);
  const isRef = /^参考答案|^参考解析|^解析/.test(raw);
  if (!isRef && letters && /^[A-Ha-h\s、,，]+$/.test(value)) return { answer: letters, answerText: '', reference: '', isReference: false };
  return { answer: '', answerText: value, reference: value, isReference: isRef };
}

function inferAnswerFromText(answerText, options) {
  const key = String(answerText || '').replace(/[\s，,。；;：:（）()]/g, '');
  if (!key) return '';
  const hits = [];
  options.forEach((opt, index) => {
    const text = String(opt.text || '').replace(/[\s，,。；;：:（）()]/g, '');
    if (text && (text.includes(key) || key.includes(text))) hits.push(LETTERS[index]);
  });
  return hits.join('');
}

function parseQuestionsFromPlainText(rawText, topicName, sourceName, importType = 'auto') {
  let text = String(rawText || '').replace(/\r/g, '\n').replace(/\u00a0/g, ' ');
  // Word 里有时把多个选项放在一行，这里尽量在 A-D 选项前断行。
  text = text.replace(/(^|[\n\t ])([A-Ha-h])\s*[、\.．]\s*/g, (m, prefix, letter) => `${prefix}\n${letter.toUpperCase()}、`);
  text = text.replace(/(^|[\n\t ])答案\s*[:：]/g, '$1\n答案：');
  const lines = text.split('\n').map(cleanImportedLine).filter(Boolean);
  const blocks = [];
  let current = null;
  const startRe = /^(?:第\s*)?(\d+)\s*[、\.．]\s*(.+)$/;
  lines.forEach(line => {
    const start = line.match(startRe);
    if (start) {
      if (current) blocks.push(current);
      current = { number: Number(start[1]) || 0, first: start[2] || '', lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  });
  if (current) blocks.push(current);

  const imported = [];
  const skipped = [];
  const optionRe = /^([A-Ha-h])\s*[、\.．)）]\s*(.*)$/;
  const looseOptionRe = /^([A-Ha-h])\s+(.{2,})$/;
  const sourceStem = safeFileStem(sourceName);
  const topic = String(topicName || sourceStem || '导入题库').trim() || '导入题库';
  const forcedType = ['choice','fill','short'].includes(String(importType || '').trim()) ? String(importType || '').trim() : 'auto';
  const now = Date.now();

  blocks.forEach((block, idx) => {
    const firstAnswer = extractAnswerFromStem(block.first);
    let answer = firstAnswer.answer;
    let answerText = firstAnswer.answerText;
    let referenceText = '';
    const qLines = [firstAnswer.cleaned].filter(Boolean);
    const options = [];
    let currentOption = null;

    block.lines.forEach(rawLine => {
      let line = cleanImportedLine(rawLine);
      if (!line) return;
      const ans = parseAnswerLine(line);
      if (ans.answer || ans.answerText || ans.reference) {
        if (ans.answer) answer = ans.answer;
        if (ans.isReference) referenceText = [referenceText, ans.reference].filter(Boolean).join('\n');
        else if (!answer && ans.answerText) answerText = ans.answerText;
        return;
      }
      const stemAns = extractAnswerFromStem(line);
      if (stemAns.answer && !answer) {
        answer = stemAns.answer;
        line = stemAns.cleaned;
      } else if (stemAns.answerText && !answerText) {
        answerText = stemAns.answerText;
        line = stemAns.cleaned;
      }
      const opt = line.match(optionRe) || line.match(looseOptionRe);
      if (opt) {
        currentOption = { text: String(opt[2] || '').trim() };
        options.push(currentOption);
        return;
      }
      if (currentOption) currentOption.text = `${currentOption.text}\n${line}`.trim();
      else qLines.push(line);
    });

    const cleanedOptions = options.map(o => ({ text: String(o.text || '').trim() })).filter(o => o.text);
    const questionText = qLines.join('\n').replace(/\s*(?:答案|正确答案|参考答案)\s*[:：].*$/g, '').trim();
    if (!questionText) {
      skipped.push({ number: block.number, reason: '缺少题干' });
      return;
    }

    // 选择题：有选项时按原逻辑导入；也可用导入类型强制只导入选择题。
    if (cleanedOptions.length >= 2 && forcedType !== 'fill' && forcedType !== 'short') {
      if (!answer && answerText) answer = inferAnswerFromText(answerText, cleanedOptions);
      answer = normalizeAnswerLetters(answer);
      if (!answer) {
        skipped.push({ number: block.number, reason: '缺少选择题答案' });
        return;
      }
      const valid = new Set(cleanedOptions.map((_, i) => LETTERS[i]));
      answer = answer.split('').filter(l => valid.has(l)).join('');
      if (!answer) {
        skipped.push({ number: block.number, reason: '答案字母超过选项范围' });
        return;
      }
      imported.push(normalizeQuestion({
        id: `import_${now}_${idx + 1}_${Math.random().toString(36).slice(2, 8)}`,
        topic,
        number: block.number || idx + 1,
        type: answer.length > 1 ? 'multiple' : 'single',
        text: questionText,
        options: cleanedOptions.map((o, i) => ({ label: LETTERS[i], text: o.text })),
        answer,
        source: sourceName || topic,
        source_stem: sourceStem,
        custom: true,
      }));
      return;
    }

    // 填空题 / 简答题：无选项时可直接导入。答案行用“答案/正确答案”，参考答案行用“参考答案”。
    const textAnswer = String(answerText || referenceText || '').trim();
    const inferredTextType = forcedType === 'fill' || forcedType === 'short'
      ? forcedType
      : (/简答|问答|论述|分析|说明/.test(questionText) || referenceText || textAnswer.length > 40 ? 'short' : 'fill');
    if (!textAnswer) {
      skipped.push({ number: block.number, reason: '缺少填空/简答答案或参考答案' });
      return;
    }
    imported.push(normalizeQuestion({
      id: `import_${now}_${idx + 1}_${Math.random().toString(36).slice(2, 8)}`,
      topic,
      number: block.number || idx + 1,
      type: inferredTextType,
      text: questionText,
      options: [],
      answer: inferredTextType === 'fill' ? textAnswer : (answerText && !referenceText ? answerText : ''),
      reference: inferredTextType === 'short' ? textAnswer : '',
      source: sourceName || topic,
      source_stem: sourceStem,
      custom: true,
    }));
  });

  return { questions: imported, skipped, blockCount: blocks.length };
}

function importQuestionsIntoEdits(importedQuestions, options = {}) {
  const list = (importedQuestions || []).map(q => normalizeQuestion(q, q)).filter(q => q.text && (isChoiceType(q.type) ? (q.options.length >= 2 && q.answer) : (q.answer || q.reference)));
  if (!list.length) throw new Error('没有可导入的题目。');
  const edits = loadQuestionEdits();
  edits.custom = Array.isArray(edits.custom) ? edits.custom : [];
  edits.overrides = edits.overrides || {};
  edits.deletedIds = edits.deletedIds || [];
  list.forEach(q => {
    if (isBaseQuestionId(q.id)) {
      edits.overrides[q.id] = q;
      edits.deletedIds = edits.deletedIds.filter(id => String(id) !== String(q.id));
      return;
    }
    q.custom = true;
    const oldIndex = edits.custom.findIndex(item => String(item.id) === String(q.id));
    if (oldIndex >= 0) edits.custom[oldIndex] = q;
    else edits.custom.push(q);
  });
  const saved = saveQuestionEdits(edits);
  afterQuestionBankEdited(list[0]?.id || '');
  return { saved, importedCount: list.length };
}

function importQuestionBankJson(text) {
  const data = JSON.parse(text);
  if (data && data.format === 'quiz_question_bank_export_v2' && data.edits) {
    if (!confirm('检测到本网站导出的题库文件。导入后会覆盖当前题库修改记录，确定继续吗？')) return { importedCount: 0, cancelled: true };
    const saved = saveQuestionEdits(normalizeQuestionEdits(data.edits));
    afterQuestionBankEdited('');
    return { importedCount: (saved.custom || []).length + Object.keys(saved.overrides || {}).length, restoredEdits: true };
  }
  const arr = Array.isArray(data) ? data : data.questions;
  if (!Array.isArray(arr)) throw new Error('JSON 格式不正确：需要 questions 数组，或本网站导出的题库文件。');
  return importQuestionsIntoEdits(arr);
}

async function importWordOrTextFile(file, overlay) {
  const status = overlay?.querySelector('#adminFormStatus');
  const ext = String(file.name || '').split('.').pop().toLowerCase();
  const defaultTopic = safeFileStem(file.name);
  let rawText = '';
  if (ext === 'docx') {
    if (!window.mammoth || !window.mammoth.extractRawText) {
      throw new Error('Word 导入库还没有加载完成。请确认网络正常，刷新后再试。');
    }
    if (status) status.textContent = '正在读取 Word 文档...';
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    rawText = result.value || '';
  } else {
    rawText = await readFileAsText(file);
  }
  const topicName = prompt('请输入这批导入题目的专题/章节名称：', defaultTopic) || defaultTopic;
  const typeInput = (prompt('请选择导入题型：auto=自动识别，choice=选择题，fill=填空题，short=简答题', 'auto') || 'auto').trim().toLowerCase();
  const importType = ['auto','choice','fill','short'].includes(typeInput) ? typeInput : 'auto';
  if (status) status.textContent = '正在解析题目...';
  const parsed = parseQuestionsFromPlainText(rawText, topicName, file.name, importType);
  if (!parsed.questions.length) {
    throw new Error(`没有识别到可导入的题目。已尝试解析 ${parsed.blockCount} 个题号块，请检查格式是否为“1、题干（A）/ A、选项 / 答案：A”，或“1、填空/简答题干 / 答案：xxx / 参考答案：xxx”。`);
  }
  const skippedMsg = parsed.skipped.length ? `\n有 ${parsed.skipped.length} 个题号块因缺少题干、选项或答案/参考答案被跳过。` : '';
  if (!confirm(`识别到 ${parsed.questions.length} 道题，确定导入到“${topicName}”吗？${skippedMsg}`)) return { importedCount: 0, cancelled: true };
  return importQuestionsIntoEdits(parsed.questions);
}

async function handleQuestionBankImportFile(overlay, file) {
  if (!file) return;
  const status = overlay?.querySelector('#adminFormStatus');
  try {
    if (status) status.textContent = `正在导入：${file.name}`;
    const ext = String(file.name || '').split('.').pop().toLowerCase();
    let result;
    if (ext === 'json') {
      result = importQuestionBankJson(await readFileAsText(file));
    } else if (ext === 'docx' || ext === 'txt' || ext === 'text') {
      result = await importWordOrTextFile(file, overlay);
    } else {
      throw new Error('暂时只支持导入 .docx、.txt、.json 文件。');
    }
    initTopics();
    renderQuestionManager('');
    setTimeout(() => {
      const newOverlay = document.getElementById('questionManagerOverlay');
      const newStatus = newOverlay?.querySelector('#adminFormStatus');
      if (newStatus) newStatus.textContent = result?.cancelled ? '已取消导入。' : `导入完成：${result.importedCount || 0} 条记录已保存。`;
    }, 0);
  } catch (err) {
    if (status) status.textContent = '导入失败。';
    alert(err.message || '导入失败，请检查文件格式。');
  }
}
