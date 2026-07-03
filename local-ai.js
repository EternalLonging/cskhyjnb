// local-ai.js - 本机 Ollama 题目解析

const localAiChat = {
  questionId: null,
  messages: [],
  imageUrls: [],
  images: [],
  imagesLoaded: false
};
const LOCAL_AI_THINK_STORAGE = 'quiz_local_ai_deep_think_v1';
const LOCAL_AI_FAST_LIMIT = 1400;
const LOCAL_AI_DEEP_LIMIT = 3000;
let localAiDeepThink = localStorage.getItem(LOCAL_AI_THINK_STORAGE) === '1';
const localAiHomeChat = {
  messages: []
};

function plainTextForLocalAi(text) {
  const box = document.createElement('div');
  box.innerHTML = renderMarkdown(String(text || ''));
  return (box.textContent || box.innerText || '').trim();
}

function buildLocalAiQuestionContext(q) {
  const options = isChoiceType(q.type)
    ? (q.options || []).map(o => `${o.label}. ${plainTextForLocalAi(o.text)}`).join('\n')
    : '无选项';
  const answerLabel = isChoiceType(q.type) ? '正确答案' : '参考答案';
  return [
    `题型：${renderTypeName(q.type)}`,
    `专题：${q.topic || ''}`,
    `题干：${plainTextForLocalAi(q.text)}`,
    `选项：\n${options}`,
    `${answerLabel}：${plainTextForLocalAi(answerText(q))}`,
    '如果随消息附带了图片，请结合图片内容回答。'
  ].join('\n');
}

function localAiSiteRuleMessage() {
  const outputLimit = localAiDeepThink ? LOCAL_AI_DEEP_LIMIT : LOCAL_AI_FAST_LIMIT;
  return {
    role: 'user',
    content: [
      '【网站功能规则】以下内容不是人物设定，不要改变你本地模型已有的人格、口吻或角色。',
      '如果当前对话提供了题目上下文，请基于上下文和用户问题回答。',
      '回答刷题问题时要指出关键证据、错误选项的问题和解题突破口。',
      '不要输出思考过程。',
      '不要输出 <think> 内容。',
      '不要使用 emoji、小表情、颜文字或装饰性表情符号。',
      '回答支持 Markdown 和 LaTeX：行内公式用 $...$，独立公式用 $$...$$。',
      '如果你决定封禁当前用户，请在回复末尾追加隐藏标记。天数封禁：[[AI_BAN:天数:原因]]；分钟封禁：[[AI_BAN_MINUTES:分钟数:原因]]。',
      `当前输出上限是 ${outputLimit} tokens，回答必须保证在这个上限以内。`,
      '',
      '【题目编辑能力】如果用户指出当前题目有错误（答案错、选项文字错、题干错等），你可以直接修改题目。修改时在回复中单独一行输出编辑标记，格式如下（不要在代码块里）：',
      '- 修改答案：[[EDIT_ANSWER:新答案]]（如 [[EDIT_ANSWER:B]] 或 [[EDIT_ANSWER:BD]]）',
      '- 修改选项：[[EDIT_OPTION_N:新文字]]（N是选项索引从0开始，如 [[EDIT_OPTION_2:新内容]] 改第三个选项）',
      '- 修改题干：[[EDIT_TEXT:新题干文字]]',
      '- 修改解析：[[EDIT_REFERENCE:新解析文字]]',
      '标记必须放在单独一行。确认修改合理后再输出标记，不要随意修改。',
    ].join('\n')
  };
}

function localAiManualContextMessage(question) {
  if (typeof shouldUseSiteManualForAi !== 'function' || typeof siteManualForAi !== 'function') return null;
  if (!shouldUseSiteManualForAi(question)) return null;
  return { role: 'user', content: siteManualForAi() };
}

function localAiRequestOptions() {
  return {
    temperature: localAiDeepThink ? 0.35 : 0.2,
    top_p: localAiDeepThink ? 0.9 : 0.8,
    num_predict: localAiDeepThink ? LOCAL_AI_DEEP_LIMIT : LOCAL_AI_FAST_LIMIT
  };
}

function isPublicAiMode() {
  const ep = (localStorage.getItem(PUBLIC_AI_ENDPOINT_STORAGE) || '').trim();
  if (!ep) return false;
  // localhost/127.0.0.1 走 Ollama 原生格式
  if (/^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(ep)) return false;
  return true;
}

function localAiRequestBody(messages) {
  if (isPublicAiMode()) {
    // OpenAI 兼容格式（DeepSeek、OpenAI 等）
    return {
      model: LOCAL_AI_MODEL,
      stream: true,
      temperature: localAiDeepThink ? 0.35 : 0.2,
      top_p: localAiDeepThink ? 0.9 : 0.8,
      max_tokens: localAiDeepThink ? LOCAL_AI_DEEP_LIMIT : LOCAL_AI_FAST_LIMIT,
      messages,
    };
  }
  // Ollama 原生格式
  return {
    model: LOCAL_AI_MODEL,
    stream: true,
    think: localAiDeepThink,
    keep_alive: '10m',
    options: localAiRequestOptions(),
    messages,
  };
}

async function askLocalOllamaMessagesStream(messages, onText) {
  const headers = { 'Content-Type': 'application/json' };
  if (PUBLIC_AI_TOKEN) headers.Authorization = `Bearer ${PUBLIC_AI_TOKEN}`;
  const res = await fetch(AI_CHAT_ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify(localAiRequestBody(messages))
  });

  if (!res.ok) {
    let data = {};
    try { data = await res.json(); } catch (_) {}
    const detail = data.error
      ? (typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error)))
      : '';
    throw new Error(`AI 服务返回 ${res.status}${detail ? '：' + detail : ''}`);
  }
  if (!res.body) {
    const data = await res.json();
    // OpenAI 格式: choices[0].message.content；Ollama 格式: message.content
    const text = cleanLocalAiResponse(
      data.choices?.[0]?.message?.content
      || data.message?.content
      || data.response
      || ''
    );
    onText(text);
    return text;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      let trimmed = line.trim();
      if (!trimmed) continue;
      // OpenAI SSE 格式：去掉 "data: " 前缀
      if (trimmed.startsWith('data: ')) trimmed = trimmed.slice(6);
      if (trimmed === '[DONE]') continue;
      let data;
      try { data = JSON.parse(trimmed); } catch (_) { continue; }
      // OpenAI: choices[0].delta.content；Ollama: message.content
      const chunk = data.choices?.[0]?.delta?.content || data.message?.content || data.response || '';
      if (chunk) {
        fullText += chunk;
        onText(cleanLocalAiResponse(fullText));
      }
      if (data.done || data.choices?.[0]?.finish_reason) {
        const cleaned = cleanLocalAiResponse(fullText);
        onText(cleaned);
        return cleaned;
      }
    }
  }
  const cleaned = cleanLocalAiResponse(fullText);
  onText(cleaned);
  return cleaned;
}

function cleanLocalAiResponse(text) {
  return stripLocalAiEmoji(String(text || '')
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, '')
    .trim());
}

function displayLocalAiResponse(text) {
  return String(text || '')
    .replace(/\[\[AI_JUDGE\s*:\s*(正确|部分正确|错误)\]\]/g, '')
    .replace(/\[\[AI_BAN_MINUTES(?::[^\]]*)?\]\]/g, '')
    .replace(/\[\[AI_BAN(?::[^\]]*)?\]\]/g, '')
    .trim();
}

function parseLocalAiBan(text) {
  const raw = String(text || '');
  const minuteMatch = raw.match(/\[\[AI_BAN_MINUTES(?::([^\]]{0,160}))?\]\]/);
  if (minuteMatch) {
    const payload = String(minuteMatch[1] || '').trim();
    const parts = payload.split(':');
    const minutes = Math.max(1, Math.min(1440, Math.ceil(Number(parts[0]) || 1)));
    const reason = parts.slice(1).join(':') || 'AI 临时封禁';
    return { minutes, reason: String(reason).trim() };
  }
  const m = raw.match(/\[\[AI_BAN(?::([^\]]{0,160}))?\]\]/);
  if (!m) return null;
  const payload = String(m[1] || '').trim();
  const parts = payload.split(':');
  const maybeDays = (parts[0] || '').trim();
  const hasDays = /^\d+(\.\d+)?$/.test(maybeDays);
  const days = hasDays ? Math.max(1, Math.min(3650, Math.ceil(Number(maybeDays)))) : null;
  const reason = hasDays ? parts.slice(1).join(':') : payload;
  return { days, reason: String(reason).trim() };
}

function handleLocalAiBanSignal(text) {
  const banInfo = parseLocalAiBan(text);
  if (!banInfo || typeof banCurrentUserByAi !== 'function') return false;
  banCurrentUserByAi(banInfo);
  return true;
}

function stripLocalAiEmoji(text) {
  return String(text || '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]\uFE0F?/gu, '')
    .replace(/[\uFE0F\u200D]/g, '');
}

function extractLocalAiImageUrlsFromText(text) {
  const raw = String(text || '');
  const urls = [];
  const mdRe = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const htmlRe = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = mdRe.exec(raw))) urls.push(m[1]);
  while ((m = htmlRe.exec(raw))) urls.push(m[1]);
  return urls;
}

function resolveLocalAiImageUrl(src) {
  const value = String(src || '').trim();
  if (!value) return '';
  if (/^data:image\//i.test(value)) return value;
  try {
    return new URL(value, window.location.href).href;
  } catch (_) {
    return '';
  }
}

function collectLocalAiImageUrls(q) {
  if (!q) return [];
  const parts = [
    q.text,
    q.reference,
    ...(q.options || []).map(o => o.text)
  ];
  const seen = new Set();
  const urls = [];
  parts.forEach(part => {
    extractLocalAiImageUrlsFromText(part).forEach(src => {
      const url = resolveLocalAiImageUrl(src);
      if (url && !seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    });
  });
  return urls.slice(0, 4);
}

function imageUrlToPngBase64(url) {
  return new Promise((resolve, reject) => {
    if (/^data:image\//i.test(url)) {
      const comma = url.indexOf(',');
      if (comma >= 0) return resolve(url.slice(comma + 1));
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const maxSide = 1280;
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
        canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png').split(',')[1]);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error(`图片读取失败：${url}`));
    img.src = url;
  });
}

async function ensureLocalAiImagesForCurrentQuestion() {
  const q = state.current;
  if (!q) return [];
  ensureLocalAiChatForCurrentQuestion();
  if (localAiChat.imagesLoaded) return localAiChat.images;
  localAiChat.imageUrls = collectLocalAiImageUrls(q);
  localAiChat.images = [];
  for (const url of localAiChat.imageUrls) {
    try {
      localAiChat.images.push(await imageUrlToPngBase64(url));
    } catch (err) {
      console.warn(err);
    }
  }
  localAiChat.imagesLoaded = true;
  return localAiChat.images;
}

function ensureLocalAiChatForCurrentQuestion() {
  const q = state.current;
  if (!q) return;
  if (localAiChat.questionId === q.id) return;
  localAiChat.questionId = q.id;
  localAiChat.messages = [
    {
      role: 'user',
      content: `下面是当前题目上下文，后续所有回答都围绕这道题：\n${buildLocalAiQuestionContext(q)}`
    }
  ];
  localAiChat.imageUrls = [];
  localAiChat.images = [];
  localAiChat.imagesLoaded = false;
}

function appendLocalAiMessage(role, text) {
  const output = $('localAiOutput');
  if (!output) return;
  const div = document.createElement('div');
  div.className = `local-ai-message ${role}`;
  div.innerHTML = `<b>${role === 'user' ? '我' : '<img src="assets/local-ai-character.jpg" style="width:20px;height:20px;border-radius:50%;vertical-align:middle;object-fit:cover;" alt="" />'}</b>${renderMarkdown(text)}`;
  output.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return div;
}

function setLocalAiMessageText(div, role, text) {
  if (!div) return;
  div.innerHTML = `<b>${role === 'user' ? '我' : '<img src="assets/local-ai-character.jpg" style="width:20px;height:20px;border-radius:50%;vertical-align:middle;object-fit:cover;" alt="" />'}</b>${renderMarkdown(text)}`;
  div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function appendLocalAiMessageTo(output, role, text) {
  if (!output) return null;
  const div = document.createElement('div');
  div.className = `local-ai-message ${role}`;
  div.innerHTML = `<b>${role === 'user' ? '我' : '<img src="assets/local-ai-character.jpg" style="width:20px;height:20px;border-radius:50%;vertical-align:middle;object-fit:cover;" alt="" />'}</b>${renderMarkdown(text)}`;
  output.appendChild(div);
  div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return div;
}

function syncLocalAiThinkButton() {
  [$('localAiThinkBtn'), $('homeAiThinkBtn')].forEach(btn => {
    if (!btn) return;
    btn.classList.toggle('active', localAiDeepThink);
    btn.textContent = localAiDeepThink ? '深度思考：开' : '深度思考：关';
  });
}

function toggleLocalAiThinking() {
  localAiDeepThink = !localAiDeepThink;
  localStorage.setItem(LOCAL_AI_THINK_STORAGE, localAiDeepThink ? '1' : '0');
  syncLocalAiThinkButton();
  const output = $('localAiOutput');
  const panel = $('localAiPanel');
  if (output && panel && !panel.classList.contains('hidden')) {
    const tip = localAiDeepThink ? '已开启深度思考，回答会更慢但更细。' : '已关闭深度思考，恢复快速短答。';
    appendLocalAiMessage('assistant', tip);
  }
  const homeOutput = $('homeAiOutput');
  if (homeOutput) {
    const tip = localAiDeepThink ? '已开启深度思考，回答会更慢但更细。' : '已关闭深度思考，恢复快速短答。';
    appendLocalAiMessageTo(homeOutput, 'assistant', tip);
  }
}

function resetLocalAiPanel() {
  const panel = $('localAiPanel');
  const output = $('localAiOutput');
  const btn = $('localAiBtn');
  if (panel) panel.classList.add('hidden');
  if (output) output.innerHTML = '';
  if ($('localAiQuestionInput')) $('localAiQuestionInput').value = '';
  if (btn) {
    btn.disabled = false;
    btn.textContent = '问 AI';
  }
  syncLocalAiThinkButton();
  localAiChat.questionId = null;
  localAiChat.messages = [];
  localAiChat.imageUrls = [];
  localAiChat.images = [];
  localAiChat.imagesLoaded = false;
}

function clearQuestionLocalAiContext() {
  const q = state.current;
  localAiChat.questionId = null;
  localAiChat.messages = [];
  localAiChat.imageUrls = [];
  localAiChat.images = [];
  localAiChat.imagesLoaded = false;
  if ($('localAiQuestionInput')) $('localAiQuestionInput').value = '';
  const output = $('localAiOutput');
  if (output) output.innerHTML = '<div class="local-ai-hint">已清空当前题目的 AI 上下文。可以重新提问。</div>';
  if (q) ensureLocalAiChatForCurrentQuestion();
}

function openLocalAiChatForCurrentQuestion() {
  const q = state.current;
  const panel = $('localAiPanel');
  const output = $('localAiOutput');
  const input = $('localAiQuestionInput');
  if (!q || !panel || !output || !input) return;

  ensureLocalAiChatForCurrentQuestion();
  syncLocalAiThinkButton();
  panel.classList.remove('hidden');
  if (!output.innerHTML.trim()) {
    const imageCount = collectLocalAiImageUrls(q).length;
    output.innerHTML = `<div class="local-ai-hint">围绕当前题目直接提问即可，按 Ctrl+Enter 可发送。${imageCount ? `检测到 ${imageCount} 张题图，会自动随问题发送；需要使用支持图片的 Ollama 模型。` : ''}</div>`;
  }
  input.focus();
}

async function askLocalAiFollowup() {
  const q = state.current;
  const panel = $('localAiPanel');
  const output = $('localAiOutput');
  const input = $('localAiQuestionInput');
  const askBtn = $('localAiAskBtn');
  if (!q || !panel || !output || !input || !askBtn) return;

  const question = input.value.trim();
  if (!question) return;

  panel.classList.remove('hidden');
  ensureLocalAiChatForCurrentQuestion();
  input.value = '';
  if (output.querySelector('.local-ai-hint')) output.innerHTML = '';
  appendLocalAiMessage('user', question);
  localAiChat.messages.push({ role: 'user', content: question });

  const loading = document.createElement('div');
  loading.className = 'local-ai-loading';
  loading.textContent = 'AI 正在回答...';
  output.appendChild(loading);
  askBtn.disabled = true;

  try {
    const images = await ensureLocalAiImagesForCurrentQuestion();
    if (images.length) loading.textContent = `AI 正在结合 ${images.length} 张题图回答...`;
    const context = { ...localAiChat.messages[0] };
    if (images.length) context.images = images;
    // 检测用户是否在申诉（上一轮 AI 刚判题且用户异议）
    let appealHint = '';
    if (state.checked) {
      const lastRecord = (state.history || []).find(h => h.roundIndex === state.currentIndex);
      if (lastRecord && lastRecord.result === 'wrong') {
        appealHint = '\n\n用户在对刚才的判题结果提出申诉，请认真重新评估。如果用户的理由合理，请改变你的判断并输出 [[AI_JUDGE:正确]] 或 [[AI_JUDGE:部分正确]]。';
      }
    }
    const userMsg = appealHint ? { role: 'user', content: question + appealHint } : localAiChat.messages[localAiChat.messages.length - 1];
    if (appealHint) localAiChat.messages[localAiChat.messages.length - 1] = userMsg;
    const recent = localAiChat.messages.slice(1).slice(-7);
    const manualContext = localAiManualContextMessage(question);
    const manualMessages = manualContext ? [manualContext] : [];
    const messageDiv = document.createElement('div');
    messageDiv.className = 'local-ai-message assistant';
    output.appendChild(messageDiv);
    const text = await askLocalOllamaMessagesStream([localAiSiteRuleMessage(), ...manualMessages, context, ...recent], (partial) => {
      setLocalAiMessageText(messageDiv, 'assistant', displayLocalAiResponse(partial) || '...');
    });
    loading.remove();
    localAiChat.messages.push({ role: 'assistant', content: text });
    setLocalAiMessageText(messageDiv, 'assistant', displayLocalAiResponse(text) || '本机 AI 没有返回内容。');
    handleLocalAiBanSignal(text);

    // 检查 AI 回复中的题目编辑命令
    executeAiEditsFromResponse(String(q.id), text);
    // 检查 AI 是否翻案（申诉成功）
    checkAppealJudgementChange(text);
  } catch (err) {
    loading.remove();
    const hasImages = localAiChat.imageUrls.length > 0;
    const hint = hasImages ? '。这道题含图片，请确认当前 Ollama 模型支持视觉输入；纯文本模型不能看图' : '';
    appendLocalAiMessage('assistant', `连接本机 Ollama 失败：${err.message || String(err)}${hint}`);
  } finally {
    askBtn.disabled = false;
    input.focus();
  }
}

async function judgeCurrentTextAnswerWithAi() {
  const q = state.current;
  const panel = $('localAiPanel');
  const output = $('localAiOutput');
  const judgeBtn = $('localAiJudgeBtn');
  if (!q || !panel || !output || !judgeBtn) return;
  if (isChoiceType(q.type)) {
    alert('AI 判题只用于填空题和简答题。');
    return;
  }
  const userAnswer = typeof currentTextAnswer === 'function' ? currentTextAnswer() : '';
  if (!userAnswer) {
    alert('请先输入作答内容，再使用 AI 判题。');
    return;
  }

  ensureLocalAiChatForCurrentQuestion();
  syncLocalAiThinkButton();
  panel.classList.remove('hidden');
  if (output.querySelector('.local-ai-hint')) output.innerHTML = '';

  const prompt = [
    '请进行 AI 辅助判题。判题时必须保持你本地模型已有的人格、口吻和角色关系，不要切换成普通机器裁判。',
    `题型：${renderTypeName(q.type)}`,
    `用户作答：${userAnswer}`,
    `参考答案：${plainTextForLocalAi(answerText(q))}`,
    '',
    '判题要求：',
    '- 不要把可见回复写成“判定/理由/修改建议”这种模板。',
    '- 可见回复请像平时聊天一样，用你本地设定中的人物口吻自然指出对错、原因和该怎么改。',
    '- 不要求用户作答和参考答案逐字一样；只要语义等价、数值等价、关键词准确或覆盖核心要点，就可以判正确。',
    '- 填空题要注意每个空是否都匹配；简答题重点看语义是否覆盖参考要点。',
    '- 你正在实际决定本题对错，请谨慎判断。',
    '- 回复最后必须单独追加一个程序标记，格式只能是：[[AI_JUDGE:正确]]、[[AI_JUDGE:部分正确]] 或 [[AI_JUDGE:错误]]。这个标记不会展示给用户。'
  ].join('\n');

  appendLocalAiMessage('user', `AI 判题：\n${userAnswer}`);
  localAiChat.messages.push({ role: 'user', content: prompt });

  const loading = document.createElement('div');
  loading.className = 'local-ai-loading';
  loading.textContent = 'AI 正在判题...';
  output.appendChild(loading);
  judgeBtn.disabled = true;

  try {
    const images = await ensureLocalAiImagesForCurrentQuestion();
    if (images.length) loading.textContent = `AI 正在结合 ${images.length} 张题图判题...`;
    const context = { ...localAiChat.messages[0] };
    if (images.length) context.images = images;
    const recent = localAiChat.messages.slice(1).slice(-7);
    const messageDiv = document.createElement('div');
    messageDiv.className = 'local-ai-message assistant';
    output.appendChild(messageDiv);
    const text = await askLocalOllamaMessagesStream([localAiSiteRuleMessage(), context, ...recent], (partial) => {
      setLocalAiMessageText(messageDiv, 'assistant', displayLocalAiResponse(partial) || '...');
    });
    loading.remove();
    localAiChat.messages.push({ role: 'assistant', content: text });
    setLocalAiMessageText(messageDiv, 'assistant', displayLocalAiResponse(text) || '本机 AI 没有返回内容。');
    handleLocalAiBanSignal(text);
    applyAiTextJudgement(q, userAnswer, text);
  } catch (err) {
    loading.remove();
    appendLocalAiMessage('assistant', `AI 判题失败：${err.message || String(err)}`);
  } finally {
    judgeBtn.disabled = false;
  }
}

function parseAiJudgement(text) {
  const raw = String(text || '');
  const marker = raw.match(/\[\[AI_JUDGE\s*:\s*(正确|部分正确|错误)\]\]/);
  if (marker) return marker[1];
  const m = raw.match(/判定\s*[:：]\s*(部分正确|正确|错误)/);
  if (m) return m[1];
  if (/部分正确/.test(raw)) return '部分正确';
  if (/正确/.test(raw) && !/不正确|错误/.test(raw)) return '正确';
  if (/错误|不正确/.test(raw)) return '错误';
  return '';
}

function applyAiTextJudgement(q, userAnswer, feedback) {
  const verdict = parseAiJudgement(feedback);
  if (!q || !verdict || isChoiceType(q.type) || state.checked) return;
  const correct = verdict === '正确';
  state.checked = true;

  if ($('fillAnswerInput')) $('fillAnswerInput').disabled = true;
  if (typeof setFillBlanksDisabled === 'function') setFillBlanksDisabled(true);
  if ($('shortAnswerInput')) $('shortAnswerInput').disabled = true;

  addHistoryRecord(q, userAnswer, false, correct);
  const wrongIds = getWrongIds();
  if (correct) setWrongIds(wrongIds.filter(id => id !== q.id));
  else setWrongIds([...wrongIds, q.id]);

  $('answerBox')?.classList.remove('hidden');
  if ($('answerBox')) {
    const label = correct ? 'AI 判定正确' : (verdict === '部分正确' ? 'AI 判定部分正确（按错误记录）' : 'AI 判定错误');
    let mineText = userAnswer;
    if (q.type === 'fill' && typeof fillBlankCount === 'function' && fillBlankCount(q) >= 2) {
      const parts = String(userAnswer || '').split('\n');
      mineText = parts.map((v, i) => `第${i + 1}空：${v || '（空）'}`).join('　');
    }
    $('answerBox').innerHTML = [
      `${label}<br><b>参考答案：</b><br>${renderMarkdown(answerText(q))}`,
      `<br><b>你的作答：</b><br>${renderMarkdown(mineText)}`,
      `<br><b>AI 判题说明：</b><br>${renderMarkdown(displayLocalAiResponse(feedback))}`
    ].join('');
  }

  if (typeof renderQuestionNotes === 'function') renderQuestionNotes(q);
  $('submitBtn')?.classList.add('hidden');
  $('showBtn')?.classList.add('hidden');
  $('localAiJudgeBtn')?.classList.add('hidden');
  if (!correct) $('retryWrongBtn')?.classList.remove('hidden');
  else $('retryWrongBtn')?.classList.add('hidden');
  $('nextBtn')?.classList.remove('hidden');
  if ($('nextBtn')) $('nextBtn').textContent = state.currentIndex < state.pool.length - 1 ? '下一题' : '完成本轮';
  if (typeof updateStats === 'function') updateStats();
  if (typeof saveProgress === 'function') saveProgress();
}

function initHomeLocalAiChat() {
  const output = $('homeAiOutput');
  if (!output || output.dataset.ready === '1') return;
  output.dataset.ready = '1';
  syncLocalAiThinkButton();
  appendLocalAiMessageTo(output, 'assistant', '我在哦。题库、复习计划、错题整理，或是任何学习问题，都可以问我。');
}

function clearHomeLocalAiContext() {
  localAiHomeChat.messages = [];
  if ($('homeAiInput')) $('homeAiInput').value = '';
  const output = $('homeAiOutput');
  if (!output) return;
  output.innerHTML = '';
  output.dataset.ready = '';
  initHomeLocalAiChat();
  $('homeAiInput')?.focus();
}

function initHomeAiResizeHandle() {
  const dialog = $('homeAiDialog');
  const handle = $('homeAiResizeHandle');
  if (!dialog || !handle || handle.dataset.ready === '1') return;
  handle.dataset.ready = '1';
  handle.addEventListener('pointerdown', (event) => {
    if (window.matchMedia && window.matchMedia('(max-width: 900px)').matches) return;
    event.preventDefault();
    handle.setPointerCapture?.(event.pointerId);
    const rect = dialog.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startW = rect.width;
    const startH = rect.height;
    const minW = 420;
    const minH = 430;
    const maxW = Math.max(minW, window.innerWidth - 44);
    const maxH = Math.max(minH, window.innerHeight - 130);
    const move = (moveEvent) => {
      const nextW = Math.min(maxW, Math.max(minW, startW + startX - moveEvent.clientX));
      const nextH = Math.min(maxH, Math.max(minH, startH + startY - moveEvent.clientY));
      dialog.style.width = `${Math.round(nextW)}px`;
      dialog.style.height = `${Math.round(nextH)}px`;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
}

function openHomeLocalAiDialog() {
  const dialog = $('homeAiDialog');
  if (!dialog) return;
  initHomeLocalAiChat();
  syncLocalAiThinkButton();
  dialog.classList.remove('hidden');
  $('homeAiInput')?.focus();
}

function closeHomeLocalAiDialog() {
  $('homeAiDialog')?.classList.add('hidden');
}

async function askHomeLocalAi() {
  const output = $('homeAiOutput');
  const input = $('homeAiInput');
  const askBtn = $('homeAiAskBtn');
  if (!output || !input || !askBtn) return;
  const question = input.value.trim();
  if (!question) return;

  openHomeLocalAiDialog();
  initHomeLocalAiChat();
  input.value = '';
  appendLocalAiMessageTo(output, 'user', question);
  localAiHomeChat.messages.push({ role: 'user', content: question });

  const loading = document.createElement('div');
  loading.className = 'local-ai-loading';
  loading.textContent = 'AI 正在回答...';
  output.appendChild(loading);
  askBtn.disabled = true;

  try {
    const recent = localAiHomeChat.messages.slice(-10);
    const manualContext = localAiManualContextMessage(question);
    const manualMessages = manualContext ? [manualContext] : [];
    const messageDiv = document.createElement('div');
    messageDiv.className = 'local-ai-message assistant';
    output.appendChild(messageDiv);
    const text = await askLocalOllamaMessagesStream([localAiSiteRuleMessage(), ...manualMessages, ...recent], (partial) => {
      setLocalAiMessageText(messageDiv, 'assistant', displayLocalAiResponse(partial) || '...');
    });
    loading.remove();
    localAiHomeChat.messages.push({ role: 'assistant', content: text });
    setLocalAiMessageText(messageDiv, 'assistant', displayLocalAiResponse(text) || '本机 AI 没有返回内容。');
    handleLocalAiBanSignal(text);
    // 检查 AI 回复中的题目编辑命令（首页无当前题目时提示用户）
    const editApplied = executeAiEditsFromResponse('', text);
    if (parseAiEditCommands(text).length > 0 && editApplied === 0) {
      appendLocalAiMessageTo(output, 'assistant', '检测到编辑命令，但首页无法定位当前题目。请打开对应题目后在刷题页使用 AI 编辑。');
    }
  } catch (err) {
    loading.remove();
    appendLocalAiMessageTo(output, 'assistant', `连接本机 Ollama 失败：${err.message || String(err)}`);
  } finally {
    askBtn.disabled = false;
    input.focus();
  }
}

// =============================================================================
// AI 题目编辑 —— 解析 AI 回复中的 [[EDIT_xxx]] 标记并写入编辑层
// =============================================================================

function parseAiEditCommands(text) {
  const raw = String(text || '');
  const commands = [];
  // 支持 EDIT_FIELD:value 和 EDIT_OPTION_N:value（N=选项索引）
  const re = /\[\[EDIT_(\w+(?:_\d+)?)\s*:\s*([^\]]{0,2000})\]\]/g;
  let m;
  while ((m = re.exec(raw))) {
    const field = String(m[1] || '').trim();
    const value = String(m[2] || '').trim();
    if (field && value) commands.push({ field, value });
  }
  return commands;
}

// 对单题的一个字段应用编辑，通过已有的 edit layer 写入。
function applyFieldEditToQuestion(q, field, value) {
  if (!q || !q.id) return false;
  const patched = JSON.parse(JSON.stringify(q));
  const f = field.toLowerCase();

  if (f === 'answer') {
    patched.answer = value;
    if (patched.originalAnswer !== undefined) patched.originalAnswer = value;
  } else if (f === 'text') {
    patched.text = value;
  } else if (f === 'reference') {
    patched.reference = value;
  } else if (f === 'explanation') {
    patched.explanation = value;
  } else if (/^option_?\d+$/.test(f)) {
    const idx = Number(f.replace('option', '').replace('_', ''));
    if (Array.isArray(patched.options) && idx >= 0 && idx < patched.options.length) {
      patched.options[idx].text = value;
    } else {
      return false;
    }
  } else if (f === 'topic') {
    patched.topic = value;
  } else if (f === 'subtopic') {
    patched.subtopic = value;
  } else {
    return false;
  }

  const edits = typeof loadQuestionEdits === 'function' ? loadQuestionEdits() : { version: 1, updatedAt: 0, deletedIds: [], overrides: {}, custom: [], customTopics: [], customSubTopics: [] };
  edits.deletedIds = (edits.deletedIds || []).filter(id => String(id) !== String(patched.id));
  if (typeof isBaseQuestionId === 'function' && isBaseQuestionId(patched.id)) {
    edits.overrides[patched.id] = patched;
  } else {
    patched.custom = true;
    const list = edits.custom || [];
    const index = list.findIndex(item => String(item.id) === String(patched.id));
    if (index >= 0) list[index] = patched;
    else list.push(patched);
    edits.custom = list;
  }
  if (typeof saveQuestionEdits === 'function') {
    saveQuestionEdits(edits);
    return true;
  }
  return false;
}

// 从 AI 回复中提取编辑命令并确认执行。
function executeAiEditsFromResponse(questionId, text) {
  const commands = parseAiEditCommands(text);
  if (!commands.length) return 0;
  const q = (state.current && String(state.current.id) === String(questionId))
    ? state.current
    : (typeof questionById === 'function' ? questionById(questionId) : null);
  if (!q) return 0;

  const descriptions = commands.map(c => {
    const f = c.field.toLowerCase();
    if (/^option_?\d+$/.test(f)) {
      const idx = Number(f.replace('option', '').replace('_', ''));
      return `选项 ${String.fromCharCode(65 + idx)} → "${c.value}"`;
    }
    const labels = { answer: '答案', text: '题干', reference: '参考答案', explanation: '解析', topic: '专题', subtopic: '子专题' };
    return `${labels[f] || c.field} → "${c.value}"`;
  });
  if (!confirm(`AI 建议修改当前题目：\n${descriptions.join('\n')}\n\n是否确认？`)) return 0;

  let applied = 0;
  for (const cmd of commands) {
    if (applyFieldEditToQuestion(q, cmd.field, cmd.value)) applied++;
  }

  if (applied > 0 && document.body?.dataset.page === 'practice' && state.current && String(state.current.id) === String(questionId)) {
    const fresh = typeof questionById === 'function' ? questionById(questionId) : null;
    if (fresh) {
      state.pool[state.currentIndex] = typeof prepareQuestion === 'function' ? prepareQuestion(fresh) : fresh;
      state.current = state.pool[state.currentIndex];
      if (typeof renderQuestion === 'function') renderQuestion();
    }
  }
  return applied;
}

// =============================================================================
// AI 判题申诉 —— 用户说服 AI 后，翻转错→对
// =============================================================================

function flipCurrentJudgementToCorrect() {
  if (!state.checked) return false;
  const q = state.current;
  if (!q) return false;

  const idx = state.currentIndex;
  const record = (state.history || []).find(h => h.roundIndex === idx);
  if (!record || record.result !== 'wrong') return false;

  record.result = 'right';
  (state.history || []).forEach(h => {
    if (h.id === q.id && h.result === 'wrong') h.result = 'right';
  });

  if (typeof getWrongIds === 'function' && typeof setWrongIds === 'function') {
    const wrongIds = getWrongIds();
    setWrongIds(wrongIds.filter(id => id !== q.id));
  }

  if (typeof updateStats === 'function') updateStats();
  if ($('answerBox')) {
    $('answerBox').innerHTML = `<b>AI 判定已更正为正确</b><br><b>参考答案：</b><br>${typeof renderMarkdown === 'function' ? renderMarkdown(typeof answerText === 'function' ? answerText(q) : (q.answer || q.reference || '')) : (q.answer || q.reference || '')}`;
  }
  $('retryWrongBtn')?.classList.add('hidden');
  $('nextBtn')?.classList.remove('hidden');
  if ($('nextBtn')) {
    $('nextBtn').textContent = idx < (state.pool || []).length - 1 ? '下一题' : '完成本轮';
  }
  if (typeof renderHistory === 'function') renderHistory();
  if (typeof saveProgress === 'function') saveProgress();
  return true;
}

// 检查 AI 回复中是否有翻案标记（申诉成功→纠正错题）
function checkAppealJudgementChange(text) {
  if (!state.checked) return false;
  const idx = state.currentIndex;
  const record = (state.history || []).find(h => h.roundIndex === idx);
  if (!record || record.result !== 'wrong') return false;
  const verdict = typeof parseAiJudgement === 'function' ? parseAiJudgement(text) : '';
  if (verdict === '正确' || verdict === '部分正确') {
    if (confirm('AI 已改变判断：认为你的答案正确。是否将本题结果从错误改为正确？')) {
      return flipCurrentJudgementToCorrect();
    }
  }
  return false;
}

// =============================================================================
// AI 设置弹窗 —— 配置 API 地址、Token 和模型
// =============================================================================

function openAiSettingsDialog() {
  document.getElementById('aiSettingsOverlay')?.remove();
  const currentEndpoint = localStorage.getItem(PUBLIC_AI_ENDPOINT_STORAGE) || '';
  const currentToken = localStorage.getItem(PUBLIC_AI_TOKEN_STORAGE) || '';
  const currentModel = localStorage.getItem(PUBLIC_AI_MODEL_STORAGE) || LOCAL_AI_DEFAULT_MODEL;
  const isPublic = !!currentEndpoint;

  const overlay = document.createElement('div');
  overlay.id = 'aiSettingsOverlay';
  overlay.className = 'auth-overlay admin-password-overlay';
  overlay.innerHTML = `
    <div class="auth-card" style="max-width:520px;">
      <h1>AI 设置</h1>
      <p class="history-records-hint">
        当前模式：<b>${isPublic ? '公网 API' : '本机 Ollama'}</b>
        当前模型：<b>${escapeHtml(currentModel)}</b>
      </p>
      <div id="aiTunnelStatus" class="ai-tunnel-status" style="display:none;margin:8px 0;padding:8px 12px;background:#e8f5e9;border-radius:6px;font-size:0.9em;">
        🌐 公网隧道已开启<br>
        分享地址：<code id="aiTunnelUrl" style="word-break:break-all;"></code>
      </div>
      <div style="margin:14px 0;">
        <label style="display:block;margin-bottom:4px;font-weight:600;">API 地址 <span style="font-weight:400;color:#888;">（留空 = 使用本机 Ollama）</span></label>
        <input id="aiSettingsEndpoint" type="text" class="admin-form-input" value="${escapeHtml(currentEndpoint)}" placeholder="https://你的域名/api/chat" style="width:100%;box-sizing:border-box;">
      </div>
      <div style="margin:14px 0;">
        <label style="display:block;margin-bottom:4px;font-weight:600;">API Token / Key</label>
        <input id="aiSettingsToken" type="password" class="admin-form-input" value="${escapeHtml(currentToken)}" placeholder="sk-..." style="width:100%;box-sizing:border-box;">
      </div>
      <div style="margin:14px 0;">
        <label style="display:block;margin-bottom:4px;font-weight:600;">模型名称</label>
        <input id="aiSettingsModel" type="text" class="admin-form-input" value="${escapeHtml(currentModel)}" placeholder="${escapeHtml(LOCAL_AI_DEFAULT_MODEL)}" style="width:100%;box-sizing:border-box;">
      </div>
      <p id="aiSettingsStatus" style="color:#888;font-size:0.9em;margin:8px 0;"></p>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
        <button id="aiSettingsTest" class="ghost" type="button">测试连接</button>
        <button id="aiSettingsClose" class="ghost" type="button">取消</button>
        <button id="aiSettingsSave" class="primary" type="button">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) { clearInterval(overlay._tunnelTimer); overlay.remove(); } });
  overlay.querySelector('#aiSettingsClose')?.addEventListener('click', () => { clearInterval(overlay._tunnelTimer); overlay.remove(); });

  // 定时查询隧道状态（仅 Electron 环境有效）
  overlay._tunnelTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/tunnel-status');
      if (!res.ok) return;
      const t = await res.json();
      const el = overlay.querySelector('#aiTunnelStatus');
      if (!el) return;
      if (t.enabled && t.url) {
        el.style.display = 'block';
        const code = el.querySelector('#aiTunnelUrl');
        if (code) code.textContent = t.url + '/api/chat';
      }
    } catch (_) {}
  }, 3000);

  overlay.querySelector('#aiSettingsSave')?.addEventListener('click', () => {
    const ep = overlay.querySelector('#aiSettingsEndpoint')?.value?.trim() || '';
    const tk = overlay.querySelector('#aiSettingsToken')?.value?.trim() || '';
    const md = overlay.querySelector('#aiSettingsModel')?.value?.trim() || LOCAL_AI_DEFAULT_MODEL;
    localStorage.setItem(PUBLIC_AI_ENDPOINT_STORAGE, ep);
    localStorage.setItem(PUBLIC_AI_TOKEN_STORAGE, tk);
    localStorage.setItem(PUBLIC_AI_MODEL_STORAGE, md);
    if (typeof refreshAiConfig === 'function') refreshAiConfig();
    const status = overlay.querySelector('#aiSettingsStatus');
    if (status) { status.textContent = '已保存。'; status.style.color = '#4caf50'; }
    setTimeout(() => overlay.remove(), 600);
  });

  overlay.querySelector('#aiSettingsTest')?.addEventListener('click', async () => {
    const rawEp = overlay.querySelector('#aiSettingsEndpoint')?.value?.trim() || '';
    const ep = (typeof normalizeAiEndpoint === 'function' ? normalizeAiEndpoint(rawEp) : rawEp) || LOCAL_AI_ENDPOINT;
    const tk = overlay.querySelector('#aiSettingsToken')?.value?.trim() || '';
    const md = overlay.querySelector('#aiSettingsModel')?.value?.trim() || LOCAL_AI_DEFAULT_MODEL;
    const status = overlay.querySelector('#aiSettingsStatus');
    if (status) { status.textContent = '正在测试连接...'; status.style.color = '#888'; }
    const btn = overlay.querySelector('#aiSettingsTest');
    if (btn) btn.disabled = true;
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (tk) headers.Authorization = `Bearer ${tk}`;
      const isPublic = isPublicAiMode();
      const testBody = isPublic
        ? { model: md, messages: [{ role: 'user', content: '你好，请回复"pong"。' }], stream: false, max_tokens: 10 }
        : { model: md, messages: [{ role: 'user', content: '你好，请回复"pong"。' }], stream: false, options: { num_predict: 10 } };
      const res = await fetch(ep, {
        method: 'POST',
        headers,
        body: JSON.stringify(testBody)
      });
      if (res.ok) {
        if (status) { status.textContent = '连接成功！'; status.style.color = '#4caf50'; }
      } else {
        let detail = '';
        try {
          const d = await res.json();
          detail = d.error
            ? (typeof d.error === 'string' ? d.error : (d.error.message || JSON.stringify(d.error)))
            : '';
        } catch (_) {}
        if (status) { status.textContent = `服务器返回 ${res.status}${detail ? '：' + detail : ''}`; status.style.color = '#f44336'; }
      }
    } catch (err) {
      if (status) { status.textContent = `连接失败：${err.message || String(err)}`; status.style.color = '#f44336'; }
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

// 首页加载时尝试恢复 AI 聊天记录
function restoreHomeAiChatFromSession() {
  try {
    const saved = sessionStorage.getItem('quiz_home_ai_chat_v1');
    if (!saved) return;
    sessionStorage.removeItem('quiz_home_ai_chat_v1');
    const msgs = JSON.parse(saved);
    if (!Array.isArray(msgs) || !msgs.length) return;
    localAiHomeChat.messages = msgs;
    const output = document.getElementById('homeAiOutput');
    if (!output) return;
    output.innerHTML = '';
    output.dataset.ready = '';
    msgs.forEach(m => {
      const div = document.createElement('div');
      div.className = `local-ai-message ${m.role}`;
      div.innerHTML = `<b>${m.role === 'user' ? '我' : '<img src="assets/local-ai-character.jpg" style="width:20px;height:20px;border-radius:50%;vertical-align:middle;object-fit:cover;" alt="" />'}</b>${typeof renderMarkdown === 'function' ? renderMarkdown(m.content || '') : (m.content || '')}`;
      output.appendChild(div);
    });
    if (msgs.length) output.scrollTop = output.scrollHeight;
  } catch (_) {}
}

