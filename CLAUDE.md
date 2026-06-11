# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

综合刷题网站 (Comprehensive Quiz Website) — a vanilla JavaScript single-page application for quiz practice. Supports single-choice, multiple-choice, fill-in-the-blank, and short-answer questions. Features cloud sync via Supabase and offline single-machine mode. Includes a built-in question bank manager with Word/JSON import/export.

## How to Run

**Local development**: Open `index.html` or `practice.html` directly in a browser (double-click). No build step, no dev server. ES modules are intentionally avoided to maintain `file://` protocol compatibility.

**Syntax check**: `node --check <file>.js` — each JS file should pass without errors.

**Deployment**: Upload the entire folder to Netlify (or any static host). The app loads Supabase and Mammoth.js from CDN; everything else is self-contained.

## Architecture

### Script Load Order (Critical)

Both HTML pages load scripts in this exact order — dependencies flow downward:

```
questions.js (data: window.QUESTION_BANK / QUESTION_SUMMARY)
  → config.js (constants, shared globals)
    → utils.js (pure utilities, Markdown renderer, file I/O)
      → data.js (question bank CRUD, topic hierarchy, settings)
        → sync.js (Supabase client, auth gates, cloud sync, notes)
          → state.js (quiz session state, progress persistence)
            → ui.js (all DOM rendering — home, practice, admin, import/export)
              → app.js (event binding, keyboard handler, initialization dispatch)
```

Each file defines global `function` declarations — no module system, no bundler. All functions are available globally after loading.

### Page Dispatch

`app.js` (the last few lines) reads `document.body.dataset.page` to decide which page to initialize:
- `"home"` → `setupPasswordGate(bindHome)` → shows mode selection overlay, then renders topic tree
- `"practice"` → `setupPasswordGate(bindPractice)` → shows mode selection overlay, then starts quiz

Both pages use the same codebase; the `data-page` attribute on `<body>` is the sole differentiator.

### Core Data Flow

1. `baseQuestions` = `window.QUESTION_BANK` (from `questions.js`, ~158+ questions)
2. `refreshQuestionBank()` merges base questions with local edits (overrides, deletions, custom additions) → populates `questions[]` and `summary{}`
3. Settings are read from localStorage (`readSettings()`), combined with selected topics → `buildPool()` filters + shuffles → prepares each question via `prepareQuestion()` (handles option shuffling)
4. Quiz state lives in the global `state` object (current index, history, selected answers, scores)
5. Cloud sync uses Supabase `study_progress` table as a key-value store (`sync_key` + `deck_key` → `state` JSON blob)

### Key Global Objects

| Object | Defined In | Purpose |
|--------|-----------|---------|
| `state` | state.js | Current quiz session (pool, index, history, scores, selected) |
| `syncState` | sync.js | Supabase client, sync key, mode, status |
| `adminPasswordState` | sync.js | Cached admin password with loading state |
| `noteFetchState` | sync.js | Tracks which question notes have been fetched from cloud |
| `questions` / `summary` | config.js (populated by data.js) | The active question bank and per-topic stats |
| `$` | config.js | Shorthand for `document.getElementById()` |

### Auth Model (Frontend-Only)

- **Cloud sync mode**: Requires a sync code + invite code. Progress synced per sync code.
- **Single-machine mode**: No sync code needed but still requires invite code. Reads cloud question edits but doesn't sync progress or allow note posting.
- **Admin access**: Password-gated (`fengxingadmin` default). Stored in localStorage + cloud. `sessionStorage` flag (`quiz_admin_unlocked_v1`) bypasses re-entry during a session.
- Default invite code: `fengxing`
- This is **not** real server-side auth — suitable for classroom/personal use only.

### Supabase Table Usage

The app uses three Supabase tables via the `study_progress` key-value pattern:
- `study_progress` (sync_key, deck_key, state JSON, updated_at) — for progress, settings, question edits, admin password, course tags, invite codes
- `question_notes` (sync_key, question_id, note JSON, updated_at) — for shared notes/comments

### Key Architectural Patterns

- **Local-first, cloud-enhanced**: Single mode loads instantly from localStorage, then checks cloud for updates in the background
- **Debounced cloud writes**: Progress saves are throttled (3s desktop, 5s mobile) via `setTimeout` before Supabase upsert
- **Timestamp-based conflict resolution**: Newest `updatedAt` wins when merging local vs cloud data
- **Question edits as a diff layer**: Original questions are never modified — edits are stored as overrides/deletions/additions in localStorage + cloud
- **Inline HTML rendering**: All modals, overlays, and admin panels are built via large template literals in ui.js — no templating library

### File Purposes

- `questions.js` — static question bank data (assigns to `window.QUESTION_BANK`)
- `config.js` — all constants, localStorage keys, `$()` helper, shared globals (`questions`, `summary`, caches)
- `utils.js` — zero-side-effect functions: `escapeHtml()`, `renderMarkdown()`, `shuffle()`, `formatTime()`, file I/O helpers, import text parsers
- `data.js` — question normalization (`normalizeQuestion()`), bank refresh, topic hierarchy, settings read, `answerText()`. Executes `refreshQuestionBank()` at load time.
- `sync.js` — Supabase client init, all cloud CRUD, auth overlays (mode selection, invite, sync code), admin password management, course tags sync, notes/comments cloud layer
- `state.js` — the `state` object, wrong ID tracking, progress save/load/clear, `prepareQuestion()` (option shuffling logic)
- `ui.js` — everything that touches the DOM: question rendering, history panel, admin question manager, import/export dialogs, topic tree, stats display, note/comment UI
- `app.js` — `bindHome()`, `bindPractice()`, keyboard handler, `beforeunload` flush, page dispatch
