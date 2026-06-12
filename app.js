// app.js — 入口：事件绑定和页面初始化调度
// 依赖：所有前置文件（config.js, utils.js, data.js, sync.js, state.js, ui.js）

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = $('installBtn');
  if (btn) btn.classList.remove('hidden');
});

function bindHome() {
  initTopics();
  updateStats();
  // PWA 安装按钮
  $('installBtn')?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      $('installBtn').classList.add('hidden');
    }
    deferredPrompt = null;
  });
  initTopics();
  updateStats();
  $('continueBtn')?.addEventListener('click', () => goPractice({ restart: false }));
  $('restartHomeBtn')?.addEventListener('click', () => goPractice({ restart: true }));
  $('clearWrongBtn')?.addEventListener('click', () => {
    if (confirm('确定清空错题本吗？')) { setWrongIds([]); updateStats(); }
  });
  $('manageQuestionsBtn')?.addEventListener('click', () => openQuestionManager());
  $('manageTopicsBtn')?.addEventListener('click', () => {
    ensureAdminUnlocked(openAdvancedTopicManagerDialog);
  });
  $('manualBtn')?.addEventListener('click', renderManualDialog);
  let topicSearchTimer = null;
  $('topicSearchInput')?.addEventListener('input', () => {
    clearTimeout(topicSearchTimer);
    topicSearchTimer = setTimeout(initTopics, 120);
  });
  $('clearTopicSearchBtn')?.addEventListener('click', () => { if ($('topicSearchInput')) $('topicSearchInput').value = ''; initTopics(); });
  document.querySelectorAll('#preferenceBox input, #modeSelect, #typeSelect, #orderSelect, #countInput').forEach(el => el.addEventListener('change', () => saveSettings(collectHomeSettings())));
  $('toggleTopics')?.addEventListener('click', () => {
    const checks = [...document.querySelectorAll('.topicCheck')];
    const allChecked = checks.every(c => c.checked);
    checks.forEach(c => c.checked = !allChecked);
    updateAllGroupStates();
  });
}


function isTypingInForm() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function handleKeyboardControl(event) {
  if (!isDesktopHistoryLayout()) return;
  if (isTypingInForm()) return;
  if (state.settings?.mode === 'review') return;
  const key = event.key;
  if (['1', '2', '3', '4'].includes(key)) {
    event.preventDefault();
    const label = LETTERS[Number(key) - 1];
    const hasOption = state.current?.options?.some(o => o.label === label);
    if (!state.checked && hasOption) selectOption(label);
    return;
  }
  if (key === '5') {
    event.preventDefault();
    if (!state.checked && state.current) submitAnswer(true);
    return;
  }
  if (key === ' ' || key === 'Spacebar') {
    event.preventDefault();
    if (!state.current) return;
    // 空格三合一：未出结果时，有选择就提交；没选择就直接看答案；出结果后进入下一题。
    if (state.checked) {
      nextQuestion();
    } else if (state.selected.size) {
      submitAnswer(false);
    } else {
      submitAnswer(true);
    }
  }
}

function bindPractice() {
  $('submitBtn')?.addEventListener('click', () => submitAnswer(false));
  $('showBtn')?.addEventListener('click', () => submitAnswer(true));
  $('retryWrongBtn')?.addEventListener('click', beginRetryCurrentWrongQuestion);
  $('nextBtn')?.addEventListener('click', nextQuestion);
  $('backHomeBtn')?.addEventListener('click', () => { window.location.href = 'index.html'; });
  $('restartBtn')?.addEventListener('click', () => { clearSavedProgress(); startQuiz(readSettings(), {resume:false}); });
  $('manageQuestionsBtn')?.addEventListener('click', () => openQuestionManager(state.current?.id || ''));
  $('editCurrentQuestionBtn')?.addEventListener('click', () => openQuestionManager(state.current?.id || ''));
  $('historyBtn')?.addEventListener('click', toggleHistory);
  $('closeHistoryBtn')?.addEventListener('click', () => closeHistory());
  $('historyPanel')?.addEventListener('click', (event) => { if (event.target.id === 'historyPanel') closeHistory(); });
  $('historyList')?.addEventListener('click', (event) => {
    const btn = event.target.closest('.history-number-btn, .history-jump');
    if (btn) jumpToHistoryQuestion(btn.dataset.index);
  });
  $('explanationInput')?.addEventListener('input', saveCurrentExplanation);
  $('addCommentBtn')?.addEventListener('click', addCurrentComment);
  $('fillAnswerInput')?.addEventListener('input', saveTextAnswerDraft);
  $('fillAnswerInput')?.addEventListener('keydown', (event) => { if (event.key === 'Enter') submitAnswer(false); });
  $('shortAnswerInput')?.addEventListener('input', saveTextAnswerDraft);
  $('commentInput')?.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') addCurrentComment();
  });
  $('commentList')?.addEventListener('click', (event) => {
    const likeBtn = event.target.closest('.comment-like');
    if (likeBtn) { toggleCommentLike(likeBtn.dataset.commentId); return; }
    const deleteBtn = event.target.closest('.comment-delete');
    if (deleteBtn) deleteCurrentComment(deleteBtn.dataset.commentId);
  });
  document.addEventListener('keydown', handleKeyboardControl);
  const forceRestart = localStorage.getItem(FORCE_RESTART_KEY) === '1';
  if (forceRestart) {
    localStorage.removeItem(FORCE_RESTART_KEY);
    clearSavedProgress();
  }
  startQuiz(readSettings(), { resume: !forceRestart });
}

window.addEventListener('beforeunload', () => { flushProgressToCloud(); flushMetaToCloud(); });

const page = document.body.dataset.page;
if (page === 'home') setupPasswordGate(bindHome);
if (page === 'practice') setupPasswordGate(bindPractice);
