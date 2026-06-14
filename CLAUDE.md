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
questions.js (window.QUESTION_BANK — 844 base questions)
  → config.js (constants, Supabase keys, localStorage keys, global $() helper)
    → utils.js (pure utilities, Markdown renderer, file I/O)
      → data.js (question bank CRUD, topic hierarchy, edit layer, topic management ops)
        → sync.js (Supabase client, auth gates, cloud sync, notes, invite RPC)
          → state.js (quiz session state, progress persistence)
            → ui.js (all DOM rendering, dialogs, overlays)
              → app.js (event binding, keyboard handler, page dispatch)
```

No module system — all functions are global.

### Key Files

| File | Purpose |
|------|---------|
| `manifest.json` | PWA config (name: 超时空辉夜姬, icon: 3.png) |
| `sw.js` | Service Worker — pre-caches app shell. Cache name `quiz-v4`. Registration uses `sw.js?v=4` to bust HTTP cache. Bump both when updating SW. |
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

## Image Handling

Images in question text or options use `<img>` tags pointing to `assets/<hash>.webp` (28 images, ~3.2MB total). Original PNGs from 超星 CDN converted via sharp. Both Markdown `![alt](url)` and HTML `<img>` tags are supported in `renderMarkdown()` — HTML tags are extracted before `escapeHtml()` and re-inserted as safe image blocks. Clean up leftover HTML artifacts (`<span style=...>`, `data-original`) from parsed questions.

## Question Bank

844 base questions in `questions.js`:
- Original 637 (毛概 + 数据库 + 编译原理 from Word imports)
- 209 compiler theory from 超星 homework pages (parsed via `parse-jiati.js` script, no longer in repo)
- Answers for the 超星 import were determined programmatically — expect some errors, users can fix via admin panel

## Quiz Flow: "继续刷题" vs "重新开始"

- **「继续刷题」**: Always restores last saved progress from localStorage (`quiz_progress_v4`). Ignores setting changes (topic, count, type). Does NOT load from cloud — local progress always wins.
- **「重新开始」**: Clears saved progress, builds fresh pool from current settings. Transfers topic selection via `sessionStorage.quiz_pending_topics` to avoid localStorage corruption.

`restoreProgressIfMatched()` no longer checks settings signature or bank size — only filters out deleted questions from the saved pool.

## Progress & Settings Sync (Supabase)

- **Progress** (`quiz_progress_v4`): Saved locally, synced to cloud on a 3-5s debounce. Cloud loaded only when local is empty (new device). Timestamp-based: server `updated_at` wins.
- **Settings** (`quiz_settings_v2`): **Not synced to cloud**. Each device keeps its own topic selection. Previously caused cross-device overwrites.
- **Wrong IDs** (`quiz_wrong_ids_v1`): Synced across devices via meta sync.
