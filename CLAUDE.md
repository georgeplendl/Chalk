# Chalk — Project Context for Claude

## What this is

Chalk is a Chrome extension that lets users draw and write text on any webpage. Annotations are shared — anyone with Chalk installed sees what others drew on the same URL. Think social graffiti for the web.

- **Repo:** https://github.com/georgeplendl/chalk
- **Local path:** `BTR/` (this directory)
- **PRD:** `Docs/PRD.md` (v0.4)

## Stack

- **WXT** (v0.19) + TypeScript — Chrome extension framework, Manifest V3
- **Fabric.js** (v6) — canvas drawing; PencilBrush for freehand, IText for text
- **Supabase** — shared Postgres storage via REST API; anonymous sessions via `chrome.storage.local`

## Key files

```
extension/
  entrypoints/
    background.ts          # service worker — handles icon click, badge ON/OFF
    content/index.ts       # main content script — canvas, toolbar, load/save annotations
  lib/
    anchor.ts              # DOM anchoring — selector generation/resolution for annotations
    annotations.ts         # Supabase fetch/save/report helpers
    session.ts             # anonymous session token (crypto.randomUUID, persisted)
    url.ts                 # URL normalization (strips UTM, www., trailing slash, fragment)
  wxt.config.ts            # manifest config — action key MUST be present or icon click won't fire
  supabase-schema.sql      # DB schema + RLS policies
  releases/                # versioned zips for testers
  .env                     # Supabase URL + anon key (gitignored — copy from .env.example)
INSTRUCTIONS.md            # beta tester install guide
README.md                  # GitHub readme
CLAUDE.md                  # this file
```

## Changelog

`CHANGELOG.md` in the repo root follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) format. **Always update it before committing** — add a new version block at the top covering all changes since the last commit, using sections: Added, Changed, Fixed, Removed. Never commit without updating the changelog first.

## Release workflow

1. Bump version in **both** `extension/package.json` and `extension/wxt.config.ts`
2. `cd extension && npm run zip`
3. Copy `.output/chalk-extension-x.x.x-chrome.zip` → `extension/releases/`
4. Commit and push
5. Never reuse or overwrite a version number; never delete old release zips

## Known design decisions

- **DOM-anchored annotations:** each annotation stores an `anchor` (CSS selector candidates for the element it was drawn over, offset relative to that element's rect, element size at draw time, and a text hint for verification). On load/resize/mutation, the element is re-resolved and the annotation repositions with it, scaling uniformly by the element's width ratio (clamped 0.25–4×). Selectors never use class names — CSS-module hashes and utility classes churn between deploys.
- **Proportional scaling fallback:** annotations also store `canvasWidth`/`canvasHeight` at draw time; when an anchor is missing (legacy rows, iframes, canvas-rendered pages) or can't be resolved, coordinates scale by viewport ratio. `scaleX`/`scaleY`/`fontSize` scale by `ratioX` only (not `ratioY`) to prevent shape skewing.
- **Single relayout path:** window `resize`, body `ResizeObserver`, and a debounced `MutationObserver` all call `scheduleRelayout()`, which defers while a stroke or text edit is in progress and re-renders without the fade-in stagger.
- **Canvas-level text events:** use `canvas.on('text:editing:exited', ...)` not `text.on('editing:exited', ...)` — the object-level event is unreliable in Fabric.js v6.
- **Shadow DOM toolbar:** the drawing toolbar uses Shadow DOM to prevent CSS conflicts with host pages.
- **`action` key in manifest:** `wxt.config.ts` must include `action: { default_title: '...' }` or WXT omits the action key and `chrome.action.onClicked` never fires.

## User preferences

- Bump version on every build that goes to testers — no exceptions.
- Commit and push after every meaningful change.
- Keep responses short and direct.
