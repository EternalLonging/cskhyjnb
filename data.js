// =============================================================================
// data.js — 题库数据管理（纯本地操作，无 Supabase 网络请求）
// 依赖：config.js, utils.js
// =============================================================================

function emptyQuestionEdits() {
  return { version: 1, updatedAt: 0, deletedIds: [], overrides: {}, custom: [], customTopics: [], customSubTopics: [] };
}

function normalizeQuestionEdits(raw) {
  const out = emptyQuestionEdits();
  if (!raw || typeof raw !== 'object') return out;
  out.version = 1;
  out.updatedAt = Number(raw.updatedAt || 0);
  out.deletedIds = Array.isArray(raw.deletedIds) ? [...new Set(raw.deletedIds.map(String).filter(Boolean))] : [];
  out.overrides = raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : {};
  out.custom = Array.isArray(raw.custom) ? raw.custom : [];
  out.customTopics = Array.isArray(raw.customTopics)
    ? [...new Set(raw.customTopics.map(t => String(t || '').trim()).filter(Boolean))]
    : [];
  out.customSubTopics = Array.isArray(raw.customSubTopics)
    ? raw.customSubTopics.filter(item => item && typeof item.topic === 'string' && typeof item.subtopic === 'string')
    : [];
  return out;
}

function loadQuestionEdits() {
  try {
    return normalizeQuestionEdits(JSON.parse(localStorage.getItem(QUESTION_EDIT_KEY) || 'null'));
  } catch (err) {
    return emptyQuestionEdits();
  }
}

function saveQuestionEditsLocal(edits) {
  const normalized = normalizeQuestionEdits(edits);
  normalized.updatedAt = Number(normalized.updatedAt || Date.now());
  localStorage.setItem(QUESTION_EDIT_KEY, JSON.stringify(normalized));
  refreshQuestionBank();
  return normalized;
}

function deriveCourseName(q = {}) {
  const hay = `${q.course || ''} ${q.topic || ''} ${q.source || ''} ${q.source_stem || ''}`;
  if (/数据库|DBMS|SQL|关系|E-R/i.test(hay)) return '数据库';
  if (/专题|毛泽东|邓小平|三个代表|科学发展观|社会主义|新民主主义|马克思/i.test(hay)) return '毛概';
  return String(q.course || '自定义课程').trim() || '自定义课程';
}

function normalizeQuestion(raw = {}, fallback = {}) {
  const id = String(raw.id || fallback.id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const topic = String(raw.topic || fallback.topic || '自定义题库').trim() || '自定义题库';
  const allowedType = ['single', 'multiple', 'fill', 'short'];
  const type = allowedType.includes(raw.type) ? raw.type : (allowedType.includes(fallback.type) ? fallback.type : 'single');
  const baseOptions = Array.isArray(raw.options) && raw.options.length ? raw.options : (fallback.options || []);
  const options = baseOptions
    .map(item => String(item?.text ?? item ?? '').trim())
    .filter(Boolean)
    .slice(0, LETTERS.length)
    .map((text, index) => ({ label: LETTERS[index], text }));
  let answer = String(raw.answer ?? fallback.answer ?? '').trim();
  if (isChoiceType(type)) {
    const validLetters = new Set(options.map(o => o.label));
    answer = answer.toUpperCase().replace(/[^A-H]/g, '').split('').filter(l => validLetters.has(l));
    answer = [...new Set(answer)].sort();
    if (type === 'single') answer = answer.slice(0, 1);
    answer = answer.join('');
  }
  const course = String(raw.course || fallback.course || deriveCourseName({ topic, source: raw.source || fallback.source, source_stem: raw.source_stem || fallback.source_stem })).trim();
  const subtopic = String(raw.subtopic || fallback.subtopic || raw.source_stem || fallback.source_stem || topic).trim() || topic;
  const reference = String(raw.reference ?? fallback.reference ?? '').trim();
  return {
    source: String(raw.source || fallback.source || '手动题库'),
    source_stem: String(raw.source_stem || fallback.source_stem || raw.source || fallback.source || '手动题库'),
    course,
    subtopic,
    topic,
    number: Number(raw.number || fallback.number || 0) || 0,
    type,
    text: String(raw.text || fallback.text || '').trim(),
    options,
    answer,
    reference,
    id,
    lockOptions: Boolean(raw.lockOptions || fallback.lockOptions),
    custom: Boolean(raw.custom || fallback.custom || id.startsWith('custom_')),
  };
}

function computeSummary(bank) {
  const out = {};
  bank.forEach(q => {
    const topic = q.topic || '未分类';
    if (!out[topic]) out[topic] = { total: 0, single: 0, multiple: 0, fill: 0, short: 0, source: q.source || q.source_stem || '手动题库' };
    out[topic].total += 1;
    if (q.type === 'multiple') out[topic].multiple += 1;
    else if (q.type === 'fill') out[topic].fill += 1;
    else if (q.type === 'short') out[topic].short += 1;
    else out[topic].single += 1;
    if (!out[topic].source && q.source) out[topic].source = q.source;
  });
  return out;
}

function refreshQuestionBank() {
  const edits = loadQuestionEdits();
  const deleted = new Set(edits.deletedIds || []);
  const overrides = edits.overrides || {};
  const bank = [];
  baseQuestions.forEach(base => {
    const id = String(base.id || '');
    if (deleted.has(id)) return;
    const q = overrides[id] ? normalizeQuestion({ ...overrides[id], id }, base) : normalizeQuestion(base, base);
    if (q.text && (isChoiceType(q.type) ? (q.options.length >= 2 && q.answer) : (q.answer || q.reference))) bank.push(q);
  });
  (edits.custom || []).forEach(item => {
    const q = normalizeQuestion({ ...item, custom: true }, item);
    if (!deleted.has(q.id) && q.text && (isChoiceType(q.type) ? (q.options.length >= 2 && q.answer) : (q.answer || q.reference))) bank.push(q);
  });
  questions = bank;
  summary = computeSummary(bank);
  topicHierarchyCache = null;
  allTopicKeysCache = null;
  (edits.customTopics || []).forEach(topic => {
    const name = String(topic || '').trim();
    if (!name) return;
    if (!summary[name]) summary[name] = { total: 0, single: 0, multiple: 0, source: '自定义专题' };
  });
}

function mergeQuestionEdits(local, remote) {
  const l = normalizeQuestionEdits(local);
  const r = normalizeQuestionEdits(remote);
  return Number(r.updatedAt || 0) > Number(l.updatedAt || 0) ? r : l;
}

function isBaseQuestionId(id) {
  return baseQuestions.some(q => String(q.id) === String(id));
}

function questionById(id) {
  return questions.find(q => String(q.id) === String(id)) || baseQuestions.find(q => String(q.id) === String(id)) || null;
}

// ——— 题目展示辅助 ———

function answerText(q) {
  if (!isChoiceType(q.type)) return q.reference || q.answer || '暂无参考答案';
  return q.answer.split('').map(letter => {
    const opt = q.options.find(o => o.label === letter);
    return opt ? `${letter}. ${opt.text}` : letter;
  }).join('；');
}

function questionCourse(q) { return q.course || deriveCourseName(q); }
function questionTopic(q) { return q.topic || '未分类'; }
function questionSubtopic(q) { return q.subtopic || q.source_stem || q.topic || '默认小节'; }
function questionPathKey(q) { return q.pathKey || [questionCourse(q), questionTopic(q), questionSubtopic(q)].join('|||'); }

function allTopicKeys() {
  if (!allTopicKeysCache) allTopicKeysCache = [...new Set(questions.map(questionPathKey))];
  return allTopicKeysCache;
}

function buildTopicHierarchy() {
  if (topicHierarchyCache) return topicHierarchyCache;
  const tree = new Map();
  questions.forEach(q => {
    const course = questionCourse(q);
    const topic = questionTopic(q);
    const subtopic = questionSubtopic(q);
    q.pathKey = q.pathKey || [course, topic, subtopic].join('|||');
    const key = q.pathKey;
    if (!tree.has(course)) tree.set(course, { total: 0, single: 0, multiple: 0, fill: 0, short: 0, topics: new Map() });
    const c = tree.get(course);
    c.total += 1; c[q.type] = (c[q.type] || 0) + 1;
    if (!c.topics.has(topic)) c.topics.set(topic, { total: 0, single: 0, multiple: 0, fill: 0, short: 0, subs: new Map() });
    const t = c.topics.get(topic);
    t.total += 1; t[q.type] = (t[q.type] || 0) + 1;
    if (!t.subs.has(subtopic)) t.subs.set(subtopic, { key, total: 0, single: 0, multiple: 0, fill: 0, short: 0 });
    const sub = t.subs.get(subtopic);
    sub.total += 1; sub[q.type] = (sub[q.type] || 0) + 1;
  });
  // 注入自定义空专题（无题目但需在树中显示）
  const edits = loadQuestionEdits();
  (edits.customTopics || []).forEach(topicName => {
    topicName = String(topicName || '').trim();
    if (!topicName) return;
    // 检查该专题是否已在树中（有题目）
    let found = false;
    for (const [course, info] of tree) {
      if (info.topics.has(topicName)) { found = true; break; }
    }
    if (found) return;
    // 尝试推断课程名
    const course = getCustomCourseName({ topic: topicName });
    if (!tree.has(course)) tree.set(course, { total: 0, single: 0, multiple: 0, fill: 0, short: 0, topics: new Map() });
    const c = tree.get(course);
    if (!c.topics.has(topicName)) c.topics.set(topicName, { total: 0, single: 0, multiple: 0, fill: 0, short: 0, subs: new Map() });
  });
  // 注入自定义空子专题（无题目但需要在树中显示）
  (edits.customSubTopics || []).forEach(item => {
    if (!item.topic || !item.subtopic) return;
    const course = item.course || deriveCourseName({ topic: item.topic }) || getCustomCourseName(item);
    if (!tree.has(course)) tree.set(course, { total: 0, single: 0, multiple: 0, fill: 0, short: 0, topics: new Map() });
    const c = tree.get(course);
    if (!c.topics.has(item.topic)) c.topics.set(item.topic, { total: 0, single: 0, multiple: 0, fill: 0, short: 0, subs: new Map() });
    const t = c.topics.get(item.topic);
    if (!t.subs.has(item.subtopic)) t.subs.set(item.subtopic, { key: [course, item.topic, item.subtopic].join('|||'), total: 0, single: 0, multiple: 0, fill: 0, short: 0 });
  });
  topicHierarchyCache = [...tree.entries()].sort((a,b)=>a[0].localeCompare(b[0],'zh-CN'));
  return topicHierarchyCache;

  function getCustomCourseName(item) {
    // 尝试从已有题目推断课程名
    const existing = questions.filter(q => q.topic === item.topic);
    if (existing.length > 0) return questionCourse(existing[0]);
    // 从已有树中找匹配的课程
    for (const [course, info] of tree) {
      if (info.topics.has(item.topic)) return course;
    }
    return '自定义课程';
  }
}

function countSummaryText(info) {
  return `共 ${info.total || 0} 题，单选 ${info.single || 0}，多选 ${info.multiple || 0}，填空 ${info.fill || 0}，简答 ${info.short || 0}`;
}

// ——— 设置读取 ———

function defaultSettings() {
  return {
    mode: 'practice', type: 'all', order: 'random',
    singleFirst: false, shuffleOptions: true, autoSubmit: false, autoNextCorrect: true,
    count: 30, singleCount: 0, multipleCount: 0, fillCount: 0, shortCount: 0,
    topics: allTopicKeys(),
  };
}

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    const merged = { ...defaultSettings(), ...(saved || {}) };
    const allKeys = allTopicKeys();
    if (!Array.isArray(merged.topics) || !merged.topics.length) merged.topics = allKeys;
    // 兼容旧版本：旧设置保存的是 q.topic，而新版保存的是 course|||topic|||subtopic。
    if (merged.topics.some(t => !String(t).includes('|||'))) {
      const oldTopics = new Set(merged.topics);
      merged.topics = allKeys.filter(key => oldTopics.has(key.split('|||')[1]));
      if (!merged.topics.length) merged.topics = allKeys;
    }
    merged.count = Math.max(1, Number(merged.count || 30));
    ['singleCount','multipleCount','fillCount','shortCount'].forEach(k => merged[k] = Math.max(0, Number(merged[k] || 0)));
    merged.singleFirst = Boolean(merged.singleFirst);
    merged.shuffleOptions = merged.shuffleOptions !== false;
    merged.autoSubmit = Boolean(merged.autoSubmit);
    merged.autoNextCorrect = merged.autoNextCorrect !== false;
    return merged;
  } catch (err) { return defaultSettings(); }
}

function adminTopicOptions() {
  return Object.keys(summary).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

// ========== 专题管理（高级）==========

function createEmptySubtopic(topicName, subtopicName) {
  const edits = loadQuestionEdits();
  topicName = String(topicName || '').trim();
  subtopicName = String(subtopicName || '').trim();
  if (!topicName || !subtopicName) throw new Error('专题名和子专题名不能为空');
  if (topicName === subtopicName) throw new Error('子专题名不能与专题名相同');
  const exists = (edits.customSubTopics || []).some(
    item => item.topic === topicName && item.subtopic === subtopicName
  );
  if (exists) throw new Error('该子专题已存在');
  // 检查是否已有题目属于该子专题（实际数据中已存在）
  const hasRealQuestions = questions.some(
    q => questionTopic(q) === topicName && questionSubtopic(q) === subtopicName
  );
  if (hasRealQuestions) throw new Error('该子专题已存在（有题目归属）');
  edits.customSubTopics.push({ topic: topicName, subtopic: subtopicName });
  // 确保父专题在 customTopics 中
  if (!edits.customTopics.includes(topicName)) edits.customTopics.push(topicName);
  saveQuestionEdits(edits);
  return { topic: topicName, subtopic: subtopicName };
}

function moveTopicUnder(sourceTopic, targetTopic) {
  const edits = loadQuestionEdits();
  sourceTopic = String(sourceTopic || '').trim();
  targetTopic = String(targetTopic || '').trim();
  if (!sourceTopic || !targetTopic) throw new Error('专题名不能为空');
  if (sourceTopic === targetTopic) throw new Error('不能将专题移到自己下面');
  let movedCount = 0;
  // 收集所有属于 sourceTopic 的题目
  const matchingQuestions = questions.filter(q => questionTopic(q) === sourceTopic);
  matchingQuestions.forEach(q => {
    const id = String(q.id);
    const oldSubtopic = questionSubtopic(q);
    // 新的 subtopic：如果题目已有子专题，保留原样；否则使用 sourceTopic
    const newSubtopic = oldSubtopic && oldSubtopic !== sourceTopic ? oldSubtopic : sourceTopic;
    if (isBaseQuestionId(id)) {
      const existing = edits.overrides[id] || {};
      edits.overrides[id] = { ...existing, topic: targetTopic, subtopic: newSubtopic };
    } else {
      const customQ = edits.custom.find(c => String(c.id) === id);
      if (customQ) { customQ.topic = targetTopic; customQ.subtopic = newSubtopic; }
    }
    movedCount++;
  });
  // 还要处理 customSubTopics 中属于 sourceTopic 的条目
  (edits.customSubTopics || []).forEach(item => {
    if (item.topic === sourceTopic) {
      item.topic = targetTopic;
    }
  });
  // 清理 customTopics
  const stillHasQuestions = questions.some(q => questionTopic(q) === sourceTopic && !matchingQuestions.includes(q)) ||
    (edits.customSubTopics || []).some(item => item.topic === sourceTopic);
  if (!stillHasQuestions) {
    edits.customTopics = edits.customTopics.filter(t => t !== sourceTopic);
  }
  if (!edits.customTopics.includes(targetTopic)) edits.customTopics.push(targetTopic);
  saveQuestionEdits(edits);
  return { movedCount };
}

function promoteSubtopicToTopic(parentTopic, subtopicName) {
  const edits = loadQuestionEdits();
  parentTopic = String(parentTopic || '').trim();
  subtopicName = String(subtopicName || '').trim();
  if (!parentTopic || !subtopicName) throw new Error('参数不能为空');
  if (parentTopic === subtopicName) throw new Error('子专题名不能与父专题名相同');
  let changedCount = 0;
  questions.forEach(q => {
    if (questionTopic(q) === parentTopic && questionSubtopic(q) === subtopicName) {
      const id = String(q.id);
      if (isBaseQuestionId(id)) {
        const existing = edits.overrides[id] || {};
        edits.overrides[id] = { ...existing, topic: subtopicName, subtopic: subtopicName };
      } else {
        const customQ = edits.custom.find(c => String(c.id) === id);
        if (customQ) { customQ.topic = subtopicName; customQ.subtopic = subtopicName; }
      }
      changedCount++;
    }
  });
  // 更新 customSubTopics
  (edits.customSubTopics || []).forEach(item => {
    if (item.topic === parentTopic && item.subtopic === subtopicName) {
      item.topic = subtopicName;
    }
  });
  if (!edits.customTopics.includes(subtopicName)) edits.customTopics.push(subtopicName);
  saveQuestionEdits(edits);
  return { changedCount };
}

function deleteTopicWithQuestions(topicName, subtopicName) {
  const edits = loadQuestionEdits();
  topicName = String(topicName || '').trim();
  subtopicName = subtopicName ? String(subtopicName).trim() : '';
  let deletedCount = 0;
  questions.filter(q => {
    if (subtopicName) {
      return questionTopic(q) === topicName && questionSubtopic(q) === subtopicName;
    }
    return questionTopic(q) === topicName;
  }).forEach(q => {
    const id = String(q.id);
    if (isBaseQuestionId(id)) {
      if (!edits.deletedIds.includes(id)) edits.deletedIds.push(id);
      delete edits.overrides[id];
    } else {
      edits.custom = edits.custom.filter(c => String(c.id) !== id);
    }
    deletedCount++;
  });
  // 清理 customSubTopics
  edits.customSubTopics = (edits.customSubTopics || []).filter(item => {
    if (subtopicName) {
      return !(item.topic === topicName && item.subtopic === subtopicName);
    }
    return item.topic !== topicName;
  });
  // 清理 customTopics
  if (!subtopicName) {
    edits.customTopics = edits.customTopics.filter(t => t !== topicName);
  }
  saveQuestionEdits(edits);
  return { deletedCount };
}

// ——— 加载时立即执行：从 baseQuestions 和本地编辑构建题库 ———
refreshQuestionBank();
