# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

超时空辉夜姬 — a vanilla JavaScript SPA for quiz practice. Supports single-choice, multiple-choice, fill-in-the-blank, and short-answer questions. Features cloud sync via Supabase and offline single-machine mode. Includes a built-in question bank manager with Word/JSON import/export and a topic hierarchy manager (create, move, promote, delete topics). Deployed via GitHub Pages with PWA support (offline caching + installable). Can also be packaged as a Windows EXE via Electron.

GitHub Pages: `https://eternallonging.github.io/cskhyjnb/`

## How to Run

**Local development** (recommended): Start the built-in localhost-only HTTP server from the project directory.
```bash
node server.js    # http://127.0.0.1:3000/
```
`server.js` resolves its root from `__dirname`, binds only to `127.0.0.1`, and uses `static-path.js` to reject malformed URLs and directory traversal. The `Cache-Control: no-cache` header prevents browser caching during development (SW still caches independently — bump `CACHE_NAME` in sw.js if stale).

**Syntax check**: `node --check <file>.js`

**Build Windows EXE**:
```bash
npm run build    # → dist/超时空辉夜姬 1.0.0.exe (portable, ~80MB)
```
Requires `electron` and `electron-builder` (already in `devDependencies`). The EXE bundles a Chromium browser + built-in HTTP server — no external dependencies needed.

**Deployment**: Push to `main` branch → GitHub Pages auto-deploys. Note: the remote default is `main`, not `master`.
```bash
git push origin master:main
```
GitHub Pages CDN caches for ~10 minutes. Add `?v=N` to URLs to bust cache during testing.

## Architecture

### Script Load Order (Critical)

```
questions_computer_org_choice.js  (window-var: computerOrgQuestions — 50 题)
questions_computer_org_fill.js   (window-var: computerOrgFillToChoice — 23 题)
questions.js (window.QUESTION_BANK — 1047 base questions + concat above)
  → config.js (constants, Supabase keys, localStorage keys, global $() helper)
    → utils.js (pure utilities, Markdown + LaTeX renderer, file I/O)
      → data.js (question bank CRUD, topic hierarchy, edit layer, topic management ops)
        → sync.js (Supabase client, auth gates, cloud sync, notes, invite RPC)
          → state.js (quiz session state, progress persistence)
            → ui.js (all DOM rendering, dialogs, overlays)
              → app.js (event binding, keyboard handler, page dispatch)
```

No module system — all functions are global. The two computer-org files define `const` variables that `questions.js` appends to `window.QUESTION_BANK` at the end of its file via `if (typeof ... !== 'undefined') concat(...)`.

### Key Files

| File | Purpose |
|------|---------|
| `manifest.json` | PWA config (name: 超时空辉夜姬, icon: 3.png) |
| `sw.js` | Service Worker — pre-caches app shell. Cache name `quiz-v18`. Registration uses `sw.js?v=18` to bust HTTP cache. Bump cache name in sw.js AND the `?v=N` in both index.html/practice.html when updating SW. |
| `package.json` / `electron-main.js` / `electron-builder.yml` | Electron desktop packaging |
| `style.css` | All styles. Key sections: `:root` vars (line 1), auth overlays (~345), admin manager (~600), topic manager (~1130), topic tree cards (~1440), practice UI scattered throughout. Admin panel uses its own `--admin-*` CSS custom properties (defined in `:root`) for a cohesive light-luxury theme. |

### Page Dispatch

`app.js` reads `document.body.dataset.page`:
- `"home"` → `setupPasswordGate(bindHome)` → mode/invite overlay → topic tree
- `"practice"` → `setupPasswordGate(bindPractice)` → mode/invite overlay → quiz starts

## Auth Model

1. **Invite code** (sync/single mode gate) — Supabase RPC one-code-per-person system
2. **Admin password** (question bank & topic management) — verified by Supabase RPC; the entered credential is retained only for the current browser session (`sessionStorage.quiz_admin_credential_v2`)

Use `ensureAdminUnlocked(callback)` to gate admin features.

## Question Edit Layer

Questions are **never modified in-place**. All changes go through the edit diff layer:

- `loadQuestionEdits()` → `{ version, updatedAt, deletedIds, overrides, custom, customTopics, customSubTopics }`
- Base questions filtered out if in `deletedIds`, overridden if in `overrides`
- `saveQuestionEdits(edits)` → writes to localStorage + cloud, calls `refreshQuestionBank()`
- `refreshQuestionBank()` rebuilds `questions[]` + `summary{}` from base + edits

## Topic Hierarchy

Three-level tree: **course** → **topic** → **subtopic**, built by `buildTopicHierarchy()` from question fields (`course`, `topic`, `subtopic`). The key format is `course|||topic|||subtopic`.

### Topic Management Functions (data.js)

| Function | Purpose |
|----------|---------|
| `addCustomTopic(name)` | Add empty topic to `edits.customTopics` (ui.js) |
| `createEmptySubtopic(topic, subtopic)` | Add empty subtopic to `edits.customSubTopics` |
| `moveTopicUnder(source, target)` | Move all questions of one topic under another (source becomes subtopic) |
| `promoteSubtopicToTopic(parent, sub)` | Promote subtopic to independent top-level topic |
| `deleteTopicWithQuestions(topic, subtopic?)` | Delete topic and all its questions (optional subtopic filter) |
| `renameTopicEverywhere(old, new)` | Rename topic in all questions + settings (ui.js) |

### Empty Topic Visibility

`buildTopicHierarchy()` injects entries from both `edits.customTopics` and `edits.customSubTopics` so that empty topics/subtopics appear in the tree with 0 question counts.

### Topic Management Dialog

`openAdvancedTopicManagerDialog()` in ui.js — tree view with move/promote/delete buttons per node, plus create topic/subtopic. Requires admin password. Triggered by `$('manageTopicsBtn')` on home page.

## Dialog/Overlay Pattern

All modals follow this pattern:
```js
function openMyDialog() {
  document.getElementById('myOverlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'myOverlay';
  overlay.className = 'auth-overlay admin-password-overlay';
  overlay.innerHTML = `<div class="auth-card">...</div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  // bind buttons, auto-focus inputs, etc.
}
```

### ⚠️ Template String Quoting Pitfall

When writing `innerHTML = \`...\`` template strings for overlay content, **always use straight double quotes `"` for HTML attributes**, never smart/curly quotes (`"` U+201C, `"` U+201D). Smart quotes look identical in most editors but break HTML parsing — the browser won't recognize them as attribute delimiters, causing the entire overlay to render broken or freeze. If an overlay appears blank or stuck after editing its template, check for smart quotes first.

### Admin Overlays (all in ui.js)

| Overlay | Function | CSS Classes | Key Element IDs |
|---------|----------|-------------|-----------------|
| Password gate | `ensureAdminUnlocked()` (line 1168) | `auth-overlay admin-password-overlay` / `auth-card` | `adminPasswordInput`, `adminPasswordSubmit`, `adminPasswordError` |
| Question manager | `renderQuestionManager()` (line 1765) | `admin-manager-overlay` / `admin-manager-card` | `adminSearchInput`, `adminTopicFilter`, `adminAddBtn`, `adminImportBankBtn`, `adminQuestionForm`, `adminOptionsArea`, etc. — **all IDs must be preserved** when editing templates |
| Invite code manager | `openInviteManageDialog()` (line 1211) | `auth-overlay` / `auth-card` | `inviteCreateBtn`, `inviteCodeList`, `inviteManageStatus` |
| Password change | `openAdminPasswordChangeDialog()` (line 1347) | `auth-overlay` / `auth-card` | `adminOldPasswordInput`, `adminNewPasswordInput`, `adminConfirmPasswordInput` |
| Simple topic manager | `openTopicManagerDialog()` (line 1499) | `topic-manager-overlay` / `topic-manager-card` | `topicAddInput`, `topicRenameInput`, `topicOldSelect` |
| Advanced topic manager | `openAdvancedTopicManagerDialog()` (line 1592) | `advanced-topic-mgr-card` | `advAddTopicBtn`, `advAddSubBtn`, `topicMgrContent` |

CSS for these overlays lives in distinct `style.css` sections:
- Auth overlays: `/* ── 管理后台：通用认证覆层 ── */` — applies to password gate, password change, invite manager, topic managers
- Question manager: `/* ═════ 题库管理 — 主覆层 ═════ */` — largest CSS block (~200 lines), includes toolbar, list sidebar, form, responsive
- Topic managers: `/* ═════ 专题管理（简单 & 高级）═════ */`
- Invite codes: `/* ═════ 邀请码管理专属样式 ═════ */`

## Testing with Playwright

```bash
npx playwright install chromium   # one-time
npx playwright screenshot --viewport-size="1280,900" http://localhost:3000/ screenshot.png
```

For automated testing, bypass auth gates by setting localStorage before page load:
```js
localStorage.setItem('quiz_access_mode_v1', 'single');
localStorage.setItem('quiz_sync_invite_authorized_v1', '{"__single_mode__":true}');
sessionStorage.setItem('quiz_admin_unlocked_v2', 'ok');
sessionStorage.setItem('quiz_admin_credential_v2', 'test-only');
```

## Question Format & Normalization

`normalizeQuestion()` in data.js transforms raw questions before they enter the runtime bank:

1. Options are **re-labeled** A, B, C, D... based on position (after filtering empty text). The original `label` field is ignored.
2. Answers are validated against the new labels — an answer of "D" on a question with only 2 non-empty options becomes invalid (only A and B exist after re-labeling).
3. Questions are dropped if `options.length < 2` or `answer` is empty — this silently removes broken questions.

When adding questions, ensure every option has non-empty text and the answer maps to a valid position (1st option = A, 2nd = B, etc.).

### Fill-in-the-blank (multi-blank) format

Fill answers use **newline = one blank**. A single-line answer is one blank (legacy behavior unchanged). For multiple blanks, put each blank's answer on its own line; within a line, `|` separates accepted variants for that blank. Example answer `"2\n1"` = blank 1 is "2", blank 2 is "1". `parseFillAnswer()` (utils.js) parses this into `[[variants], ...]`. The practice UI renders N inputs (`#fillBlanksArea`) when ≥2 blanks, falling back to the single `#fillAnswerInput` for one blank. `isTextAnswerCorrect()` grades each blank independently (all must match).

### Free-text answer matching (`normalizeFreeText`, utils.js)

Fill/short grading is tolerant: it normalizes away case, whitespace, full/half-width forms, CJK & ASCII punctuation, common traditional→simplified characters (`TRAD_TO_SIMP` table — extend it if a char is missed), and single-character Chinese numerals 0-10 (`二`=`2`, `两`=`2`, `十`=`10`). Multi-digit combos like `十二` are intentionally NOT equated to `12`.

## Question Bank

`questions_professional_english.js` adds 204 single-choice questions for course `专业外语`: CH1 has 19, CH2–CH9 have 20 each, and `期中随堂测试` has 25. Both HTML pages load it before `config.js`; the service worker caches it. It contains the source stems, four options, and the document's platform answer keys, with option order locked. The source's Chinese glosses and explanatory notes are not imported. Rebuild it with `python tools/import-professional-english.py <review.docx>`; the importer checks chapter counts and matches every answer word against its selected option.

1120 total questions (1047 base + 73 计算机组成原理). Covers 毛概 + 数据库 + 编译原理 + 计算机组成原理. Two additional files loaded before `questions.js`:

| File | Content |
|------|---------|
| `questions_computer_org_choice.js` | 50 道计算机组成原理选择题（来自 `jiati/计算机组成原理.pdf`） |
| `questions_computer_org_fill.js` | 23 道填空题转选择题（来自 `jiati/二填空题.pdf`） |

These files define `const computerOrgQuestions` / `const computerOrgFillToChoice` variables. `questions.js` appends them to `window.QUESTION_BANK` at the end of its file. The `deriveCourseName()` in `data.js` recognizes keywords like `计算机组成|计组|CPU|指令|总线|Cache|DMA|浮点|二进制|校验|存储器|微程序` to auto-classify as course `计算机组成原理`.

Compiler-theory imports from 超星 had answers determined programmatically — expect some errors; users fix via admin panel.

## LaTeX / KaTeX Rendering

The project uses **KaTeX** (loaded from CDN in both HTML files) for math formula rendering. `renderMarkdown()` in `utils.js` supports:

- `$...$` — inline LaTeX math
- `$$...$$` — block/display LaTeX math

Formulas are extracted as tokens before `escapeHtml()`, then rendered with `katex.renderToString()` at the end. If KaTeX fails or isn't loaded, formulas fall back to plain-text display. The CDN uses `networkFirst` caching in `sw.js`.

## Image Handling

Images in question text or options use `<img>` tags pointing to `assets/<hash>.webp`. Original PNGs from 超星 CDN converted via sharp. Both Markdown `![alt](url)` and HTML `<img>` tags are supported in `renderMarkdown()` — HTML tags are extracted before `escapeHtml()` and re-inserted as safe image blocks via `sanitizeMarkdownImageUrl()` (only http(s)/data:image/blob/local `assets/` URLs pass). Clean up leftover HTML artifacts (`<span style=...>`, `data-original`) from parsed questions.

## Quiz Flow & History Records

The home page has two start-area buttons: **「开始刷题」** (`#restartHomeBtn` → `goPractice({restart:true})`) and **「历史记录」** (`#historyRecordsBtn` → `openHistoryRecordsDialog()`). The old 「继续刷题」 button was removed — resuming is now done through history records.

- **「开始刷题」**: If a local round with attempts exists, archive it first (`archiveRoundIfAttempted`), then clear progress, set `FORCE_RESTART_KEY`, transfer topics via `sessionStorage.quiz_pending_topics`, and rebuild a fresh pool.
- **History records** (sync.js): each sync code (cloud) / device (single mode) keeps the most recent `HISTORY_MAX` (5) rounds. UI: view detail (题号 grid), delete, and "继续刷" for unfinished rounds.
  - **Stable `roundId`**: each round gets a `roundId` (set in `startQuiz` for new rounds, recovered in `restoreProgressIfMatched` for resumed ones, stored in the progress payload by `saveProgress`). History records key off it (`history:<roundId>`), so the SAME round re-archived (exit → resume → exit) updates ONE record instead of spawning duplicates. `archiveRoundLocal` dedupes by `record.id`; cloud relies on `merge-duplicates` upsert.
  - **Archive only when attempted**: every NON-finish archive path (`backHomeBtn`, `pagehide`, `restartBtn`, `goPractice(restart)`, `resumeFromHistory`) goes through `archiveRoundIfAttempted(progress)`, which writes only if the round has ≥1 right/wrong answer (`progressHasAttempts`). This stops "entered practice, built pool, never answered, then restarted" from polluting history with `done:0` records. Only `finishQuiz` calls raw `archiveRound(true, ...)` directly. **When adding a new archive trigger, use `archiveRoundIfAttempted`, not `archiveRound`.**
  - Storage abstraction: UI/exit paths call `archiveRoundIfAttempted` / `archiveRound(finished, progress)` / `listHistoryRecords()` / `loadHistoryRecord(id)` / `removeHistoryRecord(id)`; these dispatch to cloud (`study_progress` rows keyed `history:<roundId>`) or local (`localStorage[HISTORY_KEY]` array) by mode.
  - **Navigation timing**: normal button-click exits use a standard PostgREST `fetch` and **await** its result before navigation. Only true unload (`pagehide`/`beforeunload`) uses `keepalive`, and only when the UTF-8 body is at most 60 KiB. Larger or failed archives enter a per-sync-code, round-deduplicated retry queue in `quiz_pending_history_archive_v1` (up to `HISTORY_MAX` complete records) and are retried with normal requests on the next sync initialization. A destructive navigation clears progress only after the archive was uploaded or a complete retry copy was stored.
  - **List vs full record (cloud perf)**: `listHistoryCloud` selects only `state->_historyMeta` (alias `meta`), NOT the whole `state` (which embeds the full question pool). It returns lite records (`_lite:true`, no `pool`). "查看详情"/"继续刷" then call `loadHistoryRecord(id)` to fetch the full record on demand. This kept the list payload KB-sized on mobile/weak networks instead of downloading every round's pool.
  - "继续刷" (`resumeFromHistory`) writes the record's payload back to `PROGRESS_KEY` (with `_fromCloud`), saves its settings, and navigates to practice.html so the existing `restoreProgressIfMatched()` recovers it. Do NOT set `quiz_pending_topics` here — that would force a pool rebuild and discard the saved pool.

`restoreProgressIfMatched()` only filters out deleted questions from the saved pool — it ignores settings signature and bank size.

### Performance note (practice page load)

`initSync()` must NOT block question rendering on cloud requests. On the practice page, meta (wrong IDs) sync runs in the background; cloud progress is awaited only when there's no local progress AND not a forced restart (new-device first entry). A previous version awaited `loadMetaFromCloud()` here, blocking render (~890ms → ~68ms once moved to background).

## Progress & Settings Sync (Supabase)

- **Progress** (`quiz_progress_v4`): Saved locally, synced to cloud on a 3-5s debounce. PostgreSQL assigns `updated_at`; client clocks are never used for cloud ordering. Clearing progress writes a `progress:__deleted__` tombstone through a serialized write queue so an older row cannot reappear.
- **Settings** (`quiz_settings_v2`): **Not synced to cloud**. Each device keeps its own topic selection.
- **Wrong IDs** (`quiz_wrong_ids_v1`): Synced across devices via meta sync.

## Supabase RLS (security)

The public anon key is shipped in `config.js` (client-only app), so RLS is the real data boundary. Run `supabase_security_hardening.sql` in Supabase SQL Editor whenever setting up or upgrading the database.

- Personal meta/progress/history/AI-ban rows require a Base64 UTF-8 `x-quiz-sync-key` request header matching the row's non-reserved `sync_key`.
- Shared question edits, course tags, and aggregate question stats are public read-only. Admin writes use password-checking RPCs; question stats use the atomic `record_question_attempt` RPC.
- The admin-password row and all other reserved rows are hidden from direct Data API access.
- History DELETE is allowed only when both the request header and row `sync_key` match. Progress uses tombstones rather than DELETE.
- Shared question notes/comments intentionally remain collaboratively writable under the one fixed shared namespace; this preserves the current product behavior.
- All `study_progress.updated_at` and `question_notes.updated_at` values are overwritten by a server-time trigger.


## 开发经验：Pointer Events 自定义拖拽 + 图片元素

如果被拖元素内有 `<img>` 标签，浏览器默认会触发图片拖拽（drag image ghost）。必须三管齐下：
1. 元素加 `draggable="false"`
2. `<img>` 加 `draggable="false"`
3. `pointerdown` 事件里调 `e.preventDefault()`

缺任何一个都可能在某些浏览器上出问题。不要只做其中一个就以为搞定了。


## 开发经验：中文文件编码与 server.js

1. **Python 写入 JS 文件时确保输出 UTF-8**：
   - Python `open(path, "w", encoding="utf-8")` 正确。
   - PowerShell `Set-Content -Encoding UTF8` 在某些情况下会写 BOM，不要用它写代码文件。

2. **server.js 必须加 `charset=utf-8`**：
   - 所有 `text/html`、`application/javascript`、`text/css` 等文本类 MIME 要加 `; charset=utf-8`，否则浏览器默认按系统编码(GBK)解码中文，全是乱码。

3. **server.js 必须 `decodeURIComponent(url)`**：
   - 含中文的 URL 会被浏览器自动编码为 `%E7%BA%BF%E4%BB%A3...`，server 用 `path.join` 之前要先解码，否则找不到文件 404。

4. **测试中文 URL 时不要用 Python urllib**：
   - Python urllib 不支持直接发中文 URL，要用 `urllib.parse.quote()` 编码。
   - 更简单：直接用浏览器打开，看 Network 面板确认 200。

5. **查看文件真实编码**：
   - 用 Python `open(path, "rb").read()` 看原始字节，不要信 PowerShell `Get-Content` 的输出（它默认用系统编码解码）。
