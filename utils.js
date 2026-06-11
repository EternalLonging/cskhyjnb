// =============================================================================
// utils.js — 纯工具函数（无 DOM 副作用、无网络请求、无全局状态修改）
// 依赖：config.js
// =============================================================================

function clonePlain(obj) {
  return JSON.parse(JSON.stringify(obj || {}));
}

function nowTs() { return Date.now(); }

function shouldSkipCloudCheck(key, interval = CLOUD_CHECK_INTERVAL) {
  const last = Number(localStorage.getItem(key) || 0);
  return last && (nowTs() - last < interval);
}

function markCloudChecked(key) { localStorage.setItem(key, String(nowTs())); }

function isHomePage() { return document.body?.dataset?.page === 'home'; }

function isPracticePage() { return document.body?.dataset?.page === 'practice'; }

function isChoiceType(type) {
  return type === 'single' || type === 'multiple';
}

function isDesktopHistoryLayout() {
  return window.matchMedia && window.matchMedia('(min-width: 901px)').matches;
}

function simpleHash(str) {
  let hash = 0;
  const text = String(str || '');
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s]));
}

function sanitizeMarkdownImageUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const escapeUrl = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (/^(https?:|data:image\/|blob:)/i.test(raw)) {
    return escapeUrl(raw);
  }
  // 允许网站本地图片资源，例如 assets/compiler/q_001.webp。
  // 这样上传到 Netlify 后，题目图片可以和网页一起正常显示。
  if (/^(\.\/)?assets\/[A-Za-z0-9_\-\/.%]+\.(png|jpe?g|webp|gif|svg)$/i.test(raw)) {
    return escapeUrl(raw.replace(/^\.\//, ''));
  }
  return '';
}

function renderMarkdown(text) {
  const source = String(text ?? '').replace(/\r\n/g, '\n');
  const imageTokens = [];
  let prepared = source.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    const token = `@@MDIMG${imageTokens.length}@@`;
    imageTokens.push({ alt: String(alt || ''), src: String(src || '') });
    return token;
  });
  let html = escapeHtml(prepared);
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`);
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^###\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^##\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^#\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/^[-*]\s+(.+)$/gm, '• $1');
  html = html.replace(/@@MDIMG(\d+)@@/g, (_, idx) => {
    const item = imageTokens[Number(idx)] || {};
    const safeSrc = sanitizeMarkdownImageUrl(item.src || '');
    if (!safeSrc) return '';
    const altText = escapeHtml(item.alt || '参考图片');
    const caption = item.alt ? `<div class="md-image-caption">${altText}</div>` : '';
    return `<div class="md-image-block"><img src="${safeSrc}" alt="${altText}" loading="lazy" decoding="async" />${caption}</div>`;
  });
  html = html.replace(/\n/g, '<br>');
  return html;
}

function renderTypeName(type) {
  return type === 'multiple' ? '多选题' : type === 'fill' ? '填空题' : type === 'short' ? '简答题' : '单选题';
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normalizeFreeText(text) {
  return String(text || '').trim().replace(/\s+/g, '').toLowerCase();
}

function safeFileStem(name = '') {
  return String(name || '导入题库')
    .replace(/\.[^.]+$/, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim() || '导入题库';
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
    .replace(/ /g, ' ')
    .replace(/\*\*/g, '')
    .replace(/^[\s•●·-]+/, '')
    .trim();
}
