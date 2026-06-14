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
  let prepared = source
    // Markdown 图片: ![alt](url)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
      const token = `@@MDIMG${imageTokens.length}@@`;
      imageTokens.push({ alt: String(alt || ''), src: String(src || '') });
      return token;
    })
    // HTML img 标签: <img src="url" ...>
    .replace(/<img\s[^>]*?src\s*=\s*["']([^"']+)["'][^>]*\/?\s*>/gi, (_, src) => {
      const token = `@@MDIMG${imageTokens.length}@@`;
      imageTokens.push({ alt: '', src: String(src || '') });
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

// 简繁体常用字映射（繁 -> 简）。覆盖常用字，生僻字可能未含。
const TRAD_TO_SIMP = {
'編':'编','譯':'译','東':'东','車':'车','馬':'马','學':'学','習':'习','實':'实','時':'时','體':'体',
'狀':'状','況':'况','則':'则','規':'规','範':'范','證':'证','験':'验','驗':'验','錄':'录','畫':'画',
'國':'国','華':'华','語':'语','數':'数','據':'据','庫':'库','應':'应','當':'当','測':'测','試':'试',
'過':'过','關':'关','係':'系','發':'发','現':'现','點':'点','個':'个','們':'们','義':'义','產':'产',
'業':'业','專':'专','題':'题','類':'类','從':'从','會':'会','機':'机','構':'构','種':'种','處':'处',
'內':'内','長':'长','間':'间','問':'问','對':'对','錯':'错','選':'选','擇':'择','輸':'输','結':'结',
'構':'构','態':'态','圖':'图','標':'标','記':'记','號':'号','轉':'转','換':'换','變':'变','量':'量',
'語':'语','義':'义','詞':'词','彙':'汇','編':'编','碼':'码','譯':'译','緩':'缓','衝':'冲','區':'区',
'歸':'归','約':'约','屬':'属','應':'应','該':'该','級':'级','總':'总','計':'计','統':'统','維':'维',
'護':'护','類':'类','繼':'继','承':'承','調':'调','試':'试','執':'执','行':'行','條':'条','確':'确',
'認':'认','證':'证','權':'权','設':'设','備':'备','網':'网','絡':'络','聯':'联','係':'系','顯':'显',
'示':'示','視':'视','圖':'图','頁':'页','面':'面','屏':'屏','幕':'幕','驅':'驱','動':'动','將':'将',
'與':'与','並':'并','處':'处','後':'后','歷':'历','屆':'届','術':'术','語':'语','義':'义','釋':'释',
'動':'动','靜':'静','態':'态','棧':'栈','隊':'队','樹':'树','歸':'归','遞':'递','迴':'回','邏':'逻',
'輯':'辑','運':'运','算':'算','優':'优','劣':'劣','異':'异','傳':'传','遞':'递','參':'参','數':'数',
'極':'极','處':'处','標':'标','誌':'志','閉':'闭','開':'开','關':'关','閘':'闸','韻':'韵','響':'响',
};
const TRAD_TO_SIMP_RE = new RegExp('[' + Object.keys(TRAD_TO_SIMP).join('') + ']', 'g');

// 中文数字 0-10 单字 -> 阿拉伯数字。只处理单字，不处理多位组合（如"十二"）。
const CN_NUM = { '零':'0','〇':'0','一':'1','二':'2','两':'2','兩':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9','十':'10' };
const CN_NUM_RE = new RegExp('[' + Object.keys(CN_NUM).join('') + ']', 'g');

// 把全角字符（包括标点和字母数字）转半角。
function toHalfWidth(str) {
  return String(str || '').replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' '); // 全角空格 -> 半角空格
}

// 归一化自由文本：用于填空/简答判分。
// 抹平：大小写、空格、全半角、中英文标点、常用简繁体、0-10 中文数字。
function normalizeFreeText(text) {
  let s = toHalfWidth(String(text ?? ''));
  s = s.toLowerCase();
  s = s.replace(TRAD_TO_SIMP_RE, ch => TRAD_TO_SIMP[ch] || ch);   // 繁 -> 简
  s = s.replace(CN_NUM_RE, ch => CN_NUM[ch] || ch);               // 中文数字 -> 阿拉伯
  // 删除所有空白和标点（中英文），只保留实质字符。
  s = s.replace(/[\s]/g, '');
  s = s.replace(/[!-/:-@\[-`{-~]/g, '');                          // ASCII 标点（全角已转半角）
  s = s.replace(/[、。，·…—～「」『』【】〔〕（）《》〈〉“”‘’：；！？]/g, ''); // 残留中文标点
  return s;
}

// 解析填空题答案：每一行 = 一个空；同一行内用 | 分隔该空的多种可接受写法。
// 返回 [[空1的可接受写法...], [空2的可接受写法...], ...]
function parseFillAnswer(answer) {
  const lines = String(answer || '').replace(/\r\n/g, '\n').split('\n').map(s => s.trim()).filter(Boolean);
  return lines.map(line => line.split('|').map(s => s.trim()).filter(Boolean)).filter(arr => arr.length);
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
