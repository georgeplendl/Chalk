# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Version numbers follow `major.minor.patch` — currently in pre-release (0.x).

---

## [0.1.23] - 2026-06-03

### Fixed
- TypeScript dev setup: `env.d.ts` and explicit `module`/`moduleResolution` in `tsconfig.json` so `import.meta.env` resolves correctly before `wxt prepare` runs

---

## [0.1.22] - 2026-05-06

### Fixed
- Annotations no longer stay invisible on second open — `activate()` now calls `fadeInAnnotations()` when the canvas already exists, re-staggering all objects from `opacity: 0` after a close

---

## [0.1.21] - 2026-05-06

### Added
- Keyboard shortcuts **1–6** select color swatches (1 = black, 2 = red, 3 = green, 4 = blue, 5 = orange, 6 = white)
- `selectColor()` helper — swatch clicks and keyboard shortcuts now share the same code path

---

## [0.1.20] - 2026-05-06

### Fixed
- Annotations now correctly fade in on load and fade out on close — replaced Fabric.js `animate()` calls (which silently failed due to a v6 API change) with a self-contained `requestAnimationFrame` animator
- Closing Chalk now correctly hides all annotations including newly drawn strokes and text

---

## [0.1.18] - 2026-05-06

### Added
- Annotations fade out simultaneously (220ms) when Chalk is closed
- Toolbar slides down and fades out (200ms) on close — both animations run in parallel before `display: none` is applied

---

## [0.1.17] - 2026-05-06

### Added
- Annotations stagger fade-in on load: 50ms apart per annotation, 400ms per fade, capped at 500ms total delay
- Toolbar slides up from 20px below with spring easing on open; replays animation each time the overlay is shown

---

## [0.1.15] - 2026-05-06

### Added
- Keyboard shortcut **P** activates the paintbrush
- Keyboard shortcut **T** activates the text tool
- `setToolFromKey()` helper — toolbar button clicks and keyboard shortcuts share the same logic

### Fixed
- **Escape** key now reliably deactivates the current tool by using a capture-phase event listener, preventing Fabric.js from swallowing the event

---

## [0.1.13] - 2026-05-06

### Added
- **Escape** key deactivates the currently selected tool and sets canvas `pointerEvents: none`, restoring native page scroll and click behavior without closing the overlay
- Clicking a tool button (or pressing P/T) re-enables that tool

---

## [0.1.12] - 2026-05-06

### Fixed
- Toolbar transparency bug: page CSS rules targeting generic `div` elements (e.g. `div { opacity: 0.8 }`) cascaded into the Shadow DOM, making all toolbar elements appear transparent. Host element renamed from `<div>` to `<chalk-toolbar>` to prevent page CSS matching. `opacity: 1`, `filter: none`, and `mix-blend-mode: normal` added as explicit inline resets.

---

## [0.1.10] - 2026-05-06

### Changed
- Chalk logo fill color updated to `#DDDDDD` (slightly darker)
- Swatch active ring color changed to `rgba(51, 51, 51, 0.5)` per Figma spec

---

## [0.1.8] - 2026-05-06

### Fixed
- Swatch active state now tracked via `data-color` attribute; previous comparison against `el.style.background` failed because Chrome normalizes hex values to `rgb()` at runtime
- Swatch active ring changed from `outline` with `outline-offset` (which left a white gap) to `box-shadow: 0 0 0 2.5px` (hugs the edge, respects border-radius)

---

## [0.1.7] - 2026-05-06

### Changed
- Color swatches resized from 24×24px to 30×30px to match Figma spec
- Size button padding updated to `8px` all sides (Large: `8px 12px`) — height is now determined by font size rather than a fixed value

---

## [0.1.6] - 2026-05-06

### Changed
- Removed divider between Chalk logo and the draw button
- SVG icon stroke-width reduced from `2` to `1.5` across brush, type, and close icons
- Active button and size colors corrected to true black (`#000`) instead of `#111`

---

## [0.1.5] - 2026-05-06

### Added
- Chalk wordmark SVG logo inlined in the toolbar (exported from `Assets/chalk-logo.svg`)

---

## [0.1.4] - 2026-05-06

### Fixed
- Toolbar dividers changed from vertical (1px wide) to horizontal (1px tall × 29px wide) to match Figma
- `deactivate()` now calls `exitEditing()` on any active IText before hiding the overlay, preventing text annotations from being lost when closing Chalk quickly

---

## [0.1.3] - 2026-05-06

### Changed
- Toolbar completely redesigned to match Figma:
  - Layout changed from vertical (right side) to horizontal (bottom-center, fixed)
  - Background changed to frosted glass: `rgba(255, 255, 255, 0.9)` with `backdrop-filter: blur(8px)`
  - Tool buttons now use Lucide SVG icons (brush, type, ×) instead of text labels
  - Color swatches arranged in a horizontal row
  - Size buttons show "Small", "Medium", "Large" with visually distinct font sizes to communicate brush weight
  - Vertical dividers separate logical groups

---

## [0.1.2] - 2026-05-06

### Fixed
- Text annotations not saving to Supabase — replaced unreliable object-level `editing:exited` listener with canvas-level `text:editing:exited` event, which fires consistently in Fabric.js v6

---

## [0.1.1] - 2026-05-05

### Added
- Initial beta release
- Freehand drawing with configurable color and brush size
- Text annotations (click to place, type, click away to save)
- Annotations stored in Supabase by canonical URL and shared across all users
- Anonymous session token persisted in `chrome.storage.local`
- Toggle overlay on/off via extension toolbar icon (badge shows ON state)
- Proportional coordinate scaling — annotations store canvas dimensions at draw time and scale correctly on viewport resize
- URL normalization strips UTM params, `www.`, trailing slashes, and fragments
- Report button backend (schema + helper) — UI pending
