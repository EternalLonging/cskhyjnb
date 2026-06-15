// =============================================================================
// state.js — 答题状态管理、进度持久化、题目准备
// 依赖：config.js, utils.js, data.js, sync.js
// =============================================================================

const state = {
  pool: [], currentIndex: 0, selected: new Set(), checked: false,
  right: 0, wrong: 0, current: null, settings: null,
  history: [], historyOpen: false, drafts: {}, autoTimer: null,
  wrongReplayCount: 0, progressRestored: false, roundId: null,
};

function getWrongIds() {
  return JSON.parse(localStorage.getItem(WRONG_KEY) || '[]');
}

function setWrongIds(ids) {
  localStorage.setItem(WRONG_KEY, JSON.stringify([...new Set(ids)]));
  saveMetaToCloud();
}

function clearAutoTimer() {
  if (state.autoTimer) {
    clearTimeout(state.autoTimer);
    state.autoTimer = null;
  }
}

function normalizeSettingsForSignature(settings) {
  return {
    mode: settings.mode,
    type: settings.type,
    order: settings.order,
    singleFirst: Boolean(settings.singleFirst),
    shuffleOptions: settings.shuffleOptions !== false,
    autoSubmit: Boolean(settings.autoSubmit),
    autoNextCorrect: settings.autoNextCorrect !== false,
    count: Number(settings.count || 30),
    singleCount: Number(settings.singleCount || 0),
    multipleCount: Number(settings.multipleCount || 0),
    fillCount: Number(settings.fillCount || 0),
    shortCount: Number(settings.shortCount || 0),
    topics: [...(settings.topics || [])].sort(),
  };
}

function settingsSignature(settings) {
  return JSON.stringify(normalizeSettingsForSignature(settings));
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null');
  } catch (err) {
    return null;
  }
}

function clearSavedProgress() {
  const existing = getLocalProgressState();
  localStorage.removeItem(PROGRESS_KEY);
  deleteProgressFromCloud(existing);
}

function saveProgress() {
  if (!document.body || document.body.dataset.page !== 'practice') return;
  if (!state.settings || !state.pool.length) return;
  const selected = [...state.selected].sort().join('');
  const payload = {
    bankSize: questions.length,
    signature: settingsSignature(state.settings),
    settings: state.settings,
    pool: state.pool,
    currentIndex: state.currentIndex,
    history: state.history,
    drafts: state.drafts,
    selected,
    checked: state.checked,
    wrongReplayCount: state.wrongReplayCount,
    roundId: state.roundId,
    savedAt: Date.now(),
  };
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(payload));
  saveProgressToCloud(payload);
}

function prepareQuestion(q, settings = null) {
  const preparedBase = { ...q, originalAnswer: q.originalAnswer || q.answer || '' };
  if (!isChoiceType(q.type)) return preparedBase;
  const shouldShuffle = preparedBase.lockOptions ? false : (settings ? settings.shuffleOptions !== false : readSettings().shuffleOptions !== false);
  const sourceOptions = (q.options || []).map((opt, index) => ({
    label: opt.label || LETTERS[index],
    text: opt.text,
    originalLabel: opt.originalLabel || opt.label || LETTERS[index],
  }));
  const optionList = shouldShuffle ? shuffle(sourceOptions) : sourceOptions;
  const shuffledOptions = optionList.map((opt, index) => ({
    label: LETTERS[index] || opt.label,
    text: opt.text,
    originalLabel: opt.originalLabel || opt.label,
  }));
  const originalAnswer = q.originalAnswer || q.answer || '';
  const answer = shuffledOptions
    .filter(opt => originalAnswer.includes(opt.originalLabel))
    .map(opt => opt.label)
    .sort()
    .join('');
  return {
    ...q,
    originalAnswer,
    answer,
    options: shuffledOptions,
    optionShuffled: shouldShuffle,
  };
}

function baseQuestionById(id) {
  return questions.find(q => q.id === id) || state.pool.find(q => q.id === id) || null;
}
