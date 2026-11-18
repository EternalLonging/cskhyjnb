// Shared reading/listening materials. The saved question pool holds compact IDs;
// JSON exports embed material snapshots so they can also be imported independently.
function questionMaterial(q) {
  return q?.material || window.CET6_DATA?.materials?.[q?.materialId] || null;
}

function renderCet6Transcript(q) {
  if (!q || !(q.number >= 1 && q.number <= 25)) return '';
  const segments = window.CET6_TRANSCRIPTS?.[q?.paperId];
  const segment = segments?.find(item => q.number >= item.start && q.number <= item.end);
  if (!segment) {
    const unavailable = window.CET6_TRANSCRIPTS_UNAVAILABLE?.[q?.paperId];
    return unavailable ? `<p class="cet6-transcript-unavailable">${escapeHtml(unavailable)}</p>` : '';
  }
  return `<details class="cet6-transcript"><summary>听力原文 · ${escapeHtml(segment.title)}（${segment.start}–${segment.end}）</summary>
    <p>${escapeHtml(segment.english)}</p>
    <a href="${escapeHtml(segment.source)}" target="_blank" rel="noopener">原文来源 ↗</a></details>`;
}

function safeStudyResource(value) {
  const url = String(value || '');
  if (/^https?:\/\//i.test(url)) return url;
  if (/^assets\/[\w./-]+$/.test(url) && !url.split('/').includes('..')) return url;
  return '';
}

function materialReviewHtml(q) {
  const m = questionMaterial(q);
  if (!m) return '';
  const audio = safeStudyResource(m.audio), pdf = safeStudyResource(m.pdf);
  return `<p class="material-prose">${escapeHtml(m.passage || '')}</p>
    ${m.choices ? `<p>${m.choices.map(o => `${escapeHtml(o.label)}. ${escapeHtml(o.text)}`).join('　')}</p>` : ''}
    ${audio ? `<audio controls preload="none" src="${escapeHtml(audio)}"></audio>` : ''}
    ${pdf ? `<p><a href="${escapeHtml(pdf)}" target="_blank" rel="noopener">查看原卷 PDF</a></p>` : ''}`;
}

const cetAudioPositionsKey = 'quiz_cet6_audio_v1';
let cetAudioBound = false;
let lastCetAudioSaveAt = 0;
function readCetAudioPositions() {
  try { return JSON.parse(localStorage.getItem(cetAudioPositionsKey) || '{}') || {}; }
  catch (_) { return {}; }
}

function saveCetAudioPosition(force = false) {
  const audio = $('materialAudio');
  if (!audio?.dataset.resource || !Number.isFinite(audio.currentTime)) return;
  if (!force && Date.now() - lastCetAudioSaveAt < 2000) return;
  const positions = readCetAudioPositions();
  positions[audio.dataset.resource] = { time: audio.currentTime, rate: audio.playbackRate };
  try { localStorage.setItem(cetAudioPositionsKey, JSON.stringify(positions)); } catch (_) {}
  lastCetAudioSaveAt = Date.now();
}

function renderQuestionMaterial(q) {
  const panel = $('materialPanel');
  if (!panel) return;
  const m = questionMaterial(q), audio = $('materialAudio');
  if (!cetAudioBound) {
    cetAudioBound = true;
    audio.addEventListener('timeupdate', saveCetAudioPosition);
    audio.addEventListener('pause', () => saveCetAudioPosition(true));
    audio.addEventListener('ratechange', () => saveCetAudioPosition(true));
    audio.addEventListener('loadedmetadata', () => {
      const saved = readCetAudioPositions()[audio.dataset.resource];
      if (saved) {
        audio.currentTime = Math.min(Number(saved.time) || 0, Math.max(0, audio.duration - 0.1));
        audio.playbackRate = Number(saved.rate) || 1;
      }
    });
    audio.addEventListener('error', () => {
      $('materialAudioStatus').textContent = '音频暂时无法播放，请尝试下方“下载听力”后本地播放。';
    });
    window.addEventListener('pagehide', () => saveCetAudioPosition(true));
    $('materialRate').addEventListener('change', event => { audio.playbackRate = Number(event.target.value); });
  }
  panel.classList.toggle('hidden', !m);
  $('questionWorkspace')?.classList.toggle('with-material', Boolean(m));
  if (!m) { audio.pause(); return; }
  const src = safeStudyResource(m.audio);
  $('materialAudioArea').classList.toggle('hidden', !src);
  if (src && audio.dataset.resource !== src) {
    saveCetAudioPosition(true);
    audio.pause();
    audio.dataset.resource = src;
    audio.src = src;
    $('materialAudioStatus').textContent = '整套听力 · 切题保留播放进度';
  } else if (!src) { audio.pause(); }
  $('materialRate').value = String(readCetAudioPositions()[src]?.rate || 1);
  // Keep the passage scroll position when moving within the same question group.
  const materialKey = q.materialId || JSON.stringify(m);
  if (panel.dataset.material !== materialKey) {
    panel.dataset.material = materialKey;
    $('materialPaper').textContent = m.paperTitle || q.topic;
    $('materialTitle').textContent = m.title || '阅读材料';
    const passage = $('materialPassage');
    passage.textContent = m.passage || '';
    passage.scrollTop = 0;
    $('materialChoices').innerHTML = (m.choices || []).map(o =>
      `<button type="button" class="material-choice" data-value="${escapeHtml(o.label)}">${escapeHtml(o.label)} <span>${escapeHtml(o.text)}</span></button>`).join('');
    $('materialChoices').querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
      if (state.checked || state.current?.type !== 'fill') return;
      $('fillAnswerInput').value = btn.dataset.value;
      saveTextAnswerDraft();
      syncMaterialSelection();
    }));
  }
  const resources = [['查看原卷 PDF', m.pdf, false], ['下载听力', src, true], ['题目与答案来源', m.source, false]];
  $('materialLinks').innerHTML = resources.filter(([,url]) => safeStudyResource(url)).map(([label,url,download]) =>
    `<a href="${escapeHtml(safeStudyResource(url))}" target="_blank" rel="noopener" ${download ? 'download' : ''}>${label} ↗</a>`).join('');
  syncMaterialSelection();
}

function syncMaterialSelection() {
  const value = ($('fillAnswerInput')?.value || '').trim().toUpperCase();
  document.querySelectorAll('.material-choice').forEach(btn => {
    btn.setAttribute('aria-pressed', String(btn.dataset.value === value));
    btn.disabled = state.checked;
  });
}

async function launchCet6Paper(paperId, section = 'all') {
  const paper = window.CET6_DATA.papers.find(p => p.id === paperId);
  if (!paper) return;
  const pool = questions.filter(q => q.paperId === paperId &&
    (section === 'all' || (section === 'listening' ? q.number <= 25 : q.number >= 26)));
  if (!pool.length) return;
  const safe = await archiveRoundIfAttempted(getLocalProgressState());
  if (!safe) throw new Error('历史记录暂存失败，原进度已保留。');
  const settings = { ...readSettings(), mode: 'practice', type: 'all', order: 'sequential',
    singleFirst: false, shuffleOptions: false, autoSubmit: false, autoNextCorrect: false,
    singleCount: 0, multipleCount: 0, fillCount: 0, shortCount: 0,
    count: pool.length, topics: [...new Set(pool.map(questionPathKey))] };
  saveSettings(settings);
  sessionStorage.setItem('quiz_pending_topics', JSON.stringify(settings.topics));
  sessionStorage.setItem('quiz_pending_cet6_launch', JSON.stringify({ paperId, section }));
  localStorage.setItem(FORCE_RESTART_KEY, '1');
  await clearSavedProgress();
  window.location.href = 'practice.html';
}

function initCet6Home() {
  const box = $('cet6Entry');
  if (!box || box.dataset.ready) return;
  box.dataset.ready = 'true';
  const papers = [...(window.CET6_DATA?.papers || [])].reverse();
  box.innerHTML = `<div class="cet6-intro"><span class="cet6-kicker">CET–6 / 真题练习</span>
    <h2>把英语练进日常。</h2><p>2024–2026 · 15 套原卷 · 10 套听力 · 700 道客观题</p></div>
    <div class="cet6-launch"><label for="cet6Paper">选择试卷</label><select id="cet6Paper">${papers.map(p =>
      `<option value="${p.id}">${escapeHtml(p.title)}</option>`).join('')}</select>
    <label for="cet6Section">练习内容</label><select id="cet6Section"><option value="all">听力 + 阅读</option><option value="listening">只练听力</option><option value="reading">只练阅读</option></select>
    <p id="cet6PaperNote"></p><div class="cet6-launch-actions"><button id="cet6Start" class="primary" type="button">开始六级练习 →</button><a id="cet6Pdf" target="_blank" rel="noopener">原卷 PDF ↗</a></div>
    <p id="cet6LaunchError" role="alert"></p></div>`;
  let previousHasAudio = Boolean(papers[0]?.audio);
  const update = () => {
    const p = papers.find(p => p.id === $('cet6Paper').value);
    if (!p.audio || !previousHasAudio) $('cet6Section').value = p.audio ? 'all' : 'reading';
    previousHasAudio = Boolean(p.audio);
    $('cet6Pdf').href = p.pdf;
    $('cet6PaperNote').textContent = p.audio ? '保留原题号与选项顺序；听力可调速，阅读可点击词库作答。' : '第 3 套不含独立听力，提供 30 道阅读题。听力请选择第 1 / 2 套。';
    $('cet6Section').querySelector('[value="listening"]').disabled = !p.audio;
    $('cet6Section').querySelector('[value="all"]').textContent = p.audio ? '听力 + 阅读' : '全部阅读';
    if (!p.audio) $('cet6Section').value = 'reading';
  };
  $('cet6Paper').addEventListener('change', update);
  $('cet6Start').addEventListener('click', async () => {
    const button = $('cet6Start'); button.disabled = true;
    try { await launchCet6Paper($('cet6Paper').value, $('cet6Section').value); }
    catch (err) { $('cet6LaunchError').textContent = err.message; button.disabled = false; }
  });
  update();
}
