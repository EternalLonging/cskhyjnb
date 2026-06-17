# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

超时空辉夜姬 — a vanilla JavaScript SPA for quiz practice. Supports single-choice, multiple-choice, fill-in-the-blank, and short-answer questions. Features cloud sync via Supabase and offline single-machine mode. Includes a built-in question bank manager with Word/JSON import/export and a topic hierarchy manager (create, move, promote, delete topics). Deployed via GitHub Pages with PWA support (offline caching + installable). Can also be packaged as a Windows EXE via Electron.

GitHub Pages: `https://eternallonging.github.io/cskhyjnb/`

## How to Run

**Local development** (recommended): Start an HTTP server serving from the project directory.
```bash
node -e "const h=require('http'),fs=require('fs'),p=require('path'),m={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json'};h.createServer((q,r)=>{let u=q.url.split('?')[0];if(u=='/')u='/index.html';const fp=p.join('D:/shuatiwangzhan/1',u);try{const c=fs.readFileSync(fp);r.writeHead(200,{'Content-Type':m[p.extname(u)]||'text/plain','Cache-Control':'no-cache, no-store, must-revalidate'});r.end(c)}catch(e){r.writeHead(404);r.end('Not found: '+u)}}).listen(3000,()=>console.log('http://localhost:3000/'))"
```
Always use an absolute path for the server root (`D:/shuatiwangzhan/1`) — `process.cwd()` varies between bash/PowerShell/cmd. The `Cache-Control: no-cache` header prevents browser caching during development (SW still caches independently — bump `CACHE_NAME` in sw.js if stale).

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
| `sw.js` | Service Worker — pre-caches app shell. Cache name `quiz-v11`. Registration uses `sw.js?v=11` to bust HTTP cache. Bump cache name in sw.js AND the `?v=N` in both index.html/practice.html when updating SW. |
| `package.json` / `electron-main.js` / `electron-builder.yml` | Electron desktop packaging |

### Page Dispatch

`app.js` reads `document.body.dataset.page`:
- `"home"` → `setupPasswordGate(bindHome)` → mode/invite overlay → topic tree
- `"practice"` → `setupPasswordGate(bindPractice)` → mode/invite overlay → quiz starts

## Auth Model

1. **Invite code** (sync/single mode gate) — Supabase RPC one-code-per-person system
2. **Admin password** (question bank & topic management) — localStorage + cloud, session-level bypass (`sessionStorage.quiz_admin_unlocked_v1`)

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

## Testing with Playwright

```bash
npx playwright install chromium   # one-time
npx playwright screenshot --viewport-size="1280,900" http://localhost:3000/ screenshot.png
```

For automated testing, bypass auth gates by setting localStorage before page load:
```js
localStorage.setItem('quiz_access_mode_v1', 'single');
localStorage.setItem('quiz_sync_invite_authorized_v1', '{"__single_mode__":true}');
sessionStorage.setItem('quiz_admin_unlocked_v1', 'ok');
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
  - **Navigation timing**: cloud archive uses a raw `fetch(..., {keepalive:true})` POST to PostgREST and returns the Promise. On a button-click exit (`backHomeBtn`) the handler is `async` and **awaits** the archive before `location.href` — Chrome cancels a keepalive fetch fired in the same synchronous task as a navigation, so awaiting is required or the write is lost. On true unload (`pagehide`) you cannot await; keepalive is best-effort there.
  - **List vs full record (cloud perf)**: `listHistoryCloud` selects only `state->_historyMeta` (alias `meta`), NOT the whole `state` (which embeds the full question pool). It returns lite records (`_lite:true`, no `pool`). "查看详情"/"继续刷" then call `loadHistoryRecord(id)` to fetch the full record on demand. This kept the list payload KB-sized on mobile/weak networks instead of downloading every round's pool.
  - "继续刷" (`resumeFromHistory`) writes the record's payload back to `PROGRESS_KEY` (with `_fromCloud`), saves its settings, and navigates to practice.html so the existing `restoreProgressIfMatched()` recovers it. Do NOT set `quiz_pending_topics` here — that would force a pool rebuild and discard the saved pool.

`restoreProgressIfMatched()` only filters out deleted questions from the saved pool — it ignores settings signature and bank size.

### Performance note (practice page load)

`initSync()` must NOT block question rendering on cloud requests. On the practice page, meta (wrong IDs) sync runs in the background; cloud progress is awaited only when there's no local progress AND not a forced restart (new-device first entry). A previous version awaited `loadMetaFromCloud()` here, blocking render (~890ms → ~68ms once moved to background).

## Progress & Settings Sync (Supabase)

- **Progress** (`quiz_progress_v4`): Saved locally, synced to cloud on a 3-5s debounce. Cloud loaded only when local is empty (new device). Timestamp-based: server `updated_at` wins.
- **Settings** (`quiz_settings_v2`): **Not synced to cloud**. Each device keeps its own topic selection.
- **Wrong IDs** (`quiz_wrong_ids_v1`): Synced across devices via meta sync.

## Supabase RLS (security)

The public anon key is shipped in `config.js` (client-only app), so RLS is the only real data protection. Current policy on `study_progress` and `question_notes`: **SELECT / INSERT / UPDATE allowed; DELETE denied by default**, EXCEPT a dedicated policy allowing DELETE of rows where `deck_key like 'history:%'` (so history records can be deleted but progress/bank/password rows cannot). When adding features that delete cloud rows, account for this — either use a `history:`-prefixed key, soft-delete via UPDATE, or add a narrowly-scoped DELETE policy.
