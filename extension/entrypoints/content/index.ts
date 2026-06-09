import { normalizeUrl } from '../../lib/url';
import { getOrCreateSessionToken } from '../../lib/session';
import { fetchAnnotations, saveAnnotation, type AnnotationRow } from '../../lib/annotations';
import {
  buildAnchor,
  findAnchorElement,
  getDocumentRect,
  parseAnchor,
  resolveAnchor,
  type AnnotationAnchor,
} from '../../lib/anchor';

type FabricModule = typeof import('fabric');

const COLORS = ['#1a1a1a', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#f5f5f5'];
const SIZES = [2, 4, 8] as const;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    let isActive = false;
    let fab: FabricModule | null = null;
    let canvas: InstanceType<FabricModule['Canvas']> | null = null;
    let containerEl: HTMLElement | null = null;
    let toolbarHostEl: HTMLElement | null = null;
    let loadedRows: AnnotationRow[] = [];
    let annotationCount = 0;
    let isEditingText = false;
    let isPointerDown = false;
    let relayoutTimer: ReturnType<typeof setTimeout>;
    let currentColor = COLORS[0];
    let currentSize: number = 4;
    let currentTool: 'draw' | 'text' | 'none' = 'draw';

    // --- Keyboard handler ---

    function setToolFromKey(tool: 'draw' | 'text' | 'none') {
      currentTool = tool;
      applyBrush();
      if (containerEl) containerEl.style.pointerEvents = tool !== 'none' ? 'all' : 'none';
      const shadow = toolbarHostEl?.shadowRoot;
      if (shadow) {
        shadow.getElementById('btn-draw')?.classList.toggle('active', tool === 'draw');
        shadow.getElementById('btn-text')?.classList.toggle('active', tool === 'text');
      }
    }

    // Capture phase (3rd arg = true) ensures we fire before Fabric.js can swallow the event
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!isActive) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Don't steal keys from page inputs or Fabric.js text editing
      if (isEditingText) return;
      const target = e.target as HTMLElement;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;

      if (e.key === 'Escape')                    setToolFromKey('none');
      else if (e.key === 'p' || e.key === 'P')   setToolFromKey('draw');
      else if (e.key === 't' || e.key === 'T')   setToolFromKey('text');
      else {
        const colorIndex = parseInt(e.key) - 1;
        if (colorIndex >= 0 && colorIndex < COLORS.length) selectColor(COLORS[colorIndex]);
      }
    }, true);

    function selectColor(color: string) {
      currentColor = color;
      if (canvas?.freeDrawingBrush) canvas.freeDrawingBrush.color = color;
      toolbarHostEl?.shadowRoot?.querySelectorAll<HTMLElement>('.swatch').forEach(el => {
        el.classList.toggle('active', el.dataset.color === color);
      });
    }

    // --- Message handler ---

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === 'GET_STATE') {
        sendResponse({ active: isActive, count: annotationCount });
      } else if (msg.type === 'TOGGLE_OVERLAY') {
        if (isActive) {
          deactivate();
        } else {
          activate().catch(console.error);
        }
        setTimeout(() => sendResponse({ active: isActive, count: annotationCount }), 50);
      }
      return true;
    });

    // --- Lifecycle ---

    async function activate() {
      isActive = true;
      if (!fab) fab = await import('fabric');
      if (!containerEl) {
        createCanvas();
        createToolbar();
        await loadAnnotations();
      } else {
        // Objects were faded to opacity 0 on last close — fade them back in
        setOverlayVisible(true);
        fadeInAnnotations();
        return;
      }
      setOverlayVisible(true);
    }

    function fadeInAnnotations() {
      if (!canvas) return;
      const objects = canvas.getObjects();
      objects.forEach((obj, i) => {
        obj.set({ opacity: 0 });
        setTimeout(() => animateOpacity(obj as any, 1, 400), Math.min(i * 50, 500));
      });
      canvas.renderAll();
    }

    function deactivate() {
      isActive = false;
      // Exit any active text editing first so the save fires before we hide
      if (canvas) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const active = canvas.getActiveObject() as any;
        if (active?.isEditing) {
          active.exitEditing();
          canvas.discardActiveObject();
        }
      }
      // Fade out annotations and toolbar in parallel, then hide
      Promise.all([fadeOutAnnotations(), fadeOutToolbar()]).then(() => setOverlayVisible(false));
    }

    function fadeOutAnnotations(): Promise<void> {
      if (!canvas || canvas.getObjects().length === 0) return Promise.resolve();
      const objects = canvas.getObjects();
      const promises = objects.map(obj => animateOpacity(obj as any, 0, 220));
      return Promise.all(promises).then(() => { canvas?.renderAll(); });
    }

    function fadeOutToolbar(): Promise<void> {
      return new Promise(resolve => {
        const bar = toolbarHostEl?.shadowRoot?.querySelector<HTMLElement>('.bar');
        if (!bar) { resolve(); return; }
        bar.style.animation = 'chalk-toolbar-out 0.2s ease-in both';
        setTimeout(resolve, 200);
      });
    }

    // rAF-based opacity animator — avoids Fabric.js animate API version quirks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function animateOpacity(obj: any, target: number, duration: number): Promise<void> {
      return new Promise(resolve => {
        const start = obj.opacity ?? (target === 0 ? 1 : 0);
        const startTime = performance.now();
        function step(now: number) {
          const t = Math.min((now - startTime) / duration, 1);
          obj.set({ opacity: start + (target - start) * t });
          canvas?.renderAll();
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        }
        requestAnimationFrame(step);
      });
    }

    function setOverlayVisible(visible: boolean) {
      if (containerEl) {
        containerEl.style.display = visible ? 'block' : 'none';
        containerEl.style.pointerEvents = (visible && currentTool !== 'none') ? 'all' : 'none';
      }
      if (toolbarHostEl) {
        toolbarHostEl.style.display = visible ? 'block' : 'none';
        if (visible) {
          // Re-trigger the animation each time the toolbar shows
          const bar = toolbarHostEl.shadowRoot?.querySelector<HTMLElement>('.bar');
          if (bar) {
            bar.style.animation = 'none';
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            bar.offsetHeight; // force reflow
            bar.style.animation = '';
          }
        }
      }
    }

    // --- Annotation data helpers ---

    // Wraps Fabric.js JSON with the canvas dimensions it was drawn at (used by
    // the proportional-scaling fallback) and, when available, a DOM anchor so
    // the annotation tracks the element it was drawn over.
    function wrapWithDimensions(
      fabricJson: Record<string, unknown>,
      anchor: AnnotationAnchor | null,
    ): Record<string, unknown> {
      return {
        fabricData: fabricJson,
        canvasWidth: canvas?.width ?? window.innerWidth,
        canvasHeight: canvas?.height ?? window.innerHeight,
        ...(anchor ? { anchor } : {}),
      };
    }

    function parseAnnotationData(data: Record<string, unknown>) {
      if ('fabricData' in data) {
        return {
          fabricData: data.fabricData as Record<string, unknown>,
          storedW: data.canvasWidth as number | null,
          storedH: data.canvasHeight as number | null,
          anchor: parseAnchor(data.anchor),
        };
      }
      // Legacy format: no dimensions stored, render as-is
      return { fabricData: data, storedW: null, storedH: null, anchor: null };
    }

    // Anchor for a freshly drawn Fabric object. The canvas sits at document
    // (0,0), so Fabric coordinates are document coordinates.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function computeAnchor(obj: any): AnnotationAnchor | null {
      try {
        const b = obj.getBoundingRect();
        const el = findAnchorElement(
          { left: b.left, top: b.top, width: b.width, height: b.height },
          containerEl,
        );
        if (!el) return null;
        return buildAnchor(el, { left: obj.left ?? b.left, top: obj.top ?? b.top });
      } catch {
        return null;
      }
    }

    // Scales Fabric.js serialized object proportionally to the current canvas size.
    function scaleFabricData(
      data: Record<string, unknown>,
      ratioX: number,
      ratioY: number,
    ): Record<string, unknown> {
      const d = { ...data };
      if (typeof d.left === 'number')     d.left     = d.left     * ratioX;
      if (typeof d.top === 'number')      d.top      = d.top      * ratioY;
      // Scale shape uniformly by ratioX to preserve aspect ratio.
      // ratioY differs from ratioX when height changes independently of width,
      // which would skew shapes (a square becomes a tall rectangle, etc.).
      if (typeof d.scaleX === 'number')   d.scaleX   = d.scaleX   * ratioX;
      if (typeof d.scaleY === 'number')   d.scaleY   = d.scaleY   * ratioX;
      if (typeof d.fontSize === 'number') d.fontSize = d.fontSize * ratioX;
      return d;
    }

    // --- Canvas ---

    function getPageDimensions() {
      return {
        w: window.innerWidth,
        h: Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
          window.innerHeight,
        ),
      };
    }

    function createCanvas() {
      if (!fab) return;
      const { w, h } = getPageDimensions();

      containerEl = document.createElement('div');
      Object.assign(containerEl.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: `${w}px`,
        height: `${h}px`,
        pointerEvents: 'none',
        zIndex: '2147483646',
        overflow: 'hidden',
      });
      document.body.appendChild(containerEl);

      const canvasEl = document.createElement('canvas');
      canvasEl.width = w;
      canvasEl.height = h;
      containerEl.appendChild(canvasEl);

      canvas = new fab.Canvas(canvasEl, { selection: false, enableRetinaScaling: false });
      applyBrush();

      // Forward wheel events so page scrolling still works
      canvasEl.addEventListener('wheel', (e) => {
        e.preventDefault();
        window.scrollBy({ left: e.deltaX, top: e.deltaY, behavior: 'instant' as ScrollBehavior });
      }, { passive: false });

      // Save each completed stroke
      canvas.on('path:created', async (e: { path: InstanceType<FabricModule['Path']> }) => {
        const path = e.path;
        path.set({ selectable: false, evented: false, hasControls: false });
        canvas?.renderAll();
        const anchor = computeAnchor(path);
        const token = await getOrCreateSessionToken();
        const row = await saveAnnotation({
          url: normalizeUrl(window.location.href),
          data: wrapWithDimensions(path.toJSON() as Record<string, unknown>, anchor),
          type: 'drawing',
          session_token: token,
        });
        if (row) loadedRows.push(row);
        annotationCount++;
      });

      // Text placement
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.on('mouse:down', (e: any) => {
        if (currentTool !== 'text' || isEditingText || !canvas || !fab) return;
        const pointer = canvas.getPointer(e.e);
        const text = new fab.IText('', {
          left: pointer.x,
          top: pointer.y,
          fill: currentColor,
          fontSize: Math.max(currentSize * 5, 16),
          fontFamily: 'system-ui, sans-serif',
          selectable: true,
          hasControls: false,
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        isEditingText = true;
        text.enterEditing();
      });

      // Save text when editing ends (canvas-level event fires more reliably than object-level)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvas.on('text:editing:exited', async (e: any) => {
        isEditingText = false;
        const text = e.target;
        if (!text) return;
        const content = (text.text ?? '').trim();
        if (content) {
          text.set({ selectable: false, evented: false, hasControls: false });
          canvas?.renderAll();
          const anchor = computeAnchor(text);
          const token = await getOrCreateSessionToken();
          const row = await saveAnnotation({
            url: normalizeUrl(window.location.href),
            data: wrapWithDimensions(text.toJSON() as Record<string, unknown>, anchor),
            type: 'text',
            session_token: token,
          });
          if (row) loadedRows.push(row);
          annotationCount++;
        } else {
          canvas?.remove(text);
        }
      });

      // Track mid-stroke state so relayout never clears a stroke in progress
      canvas.on('mouse:down', () => { isPointerDown = true; });
      canvas.on('mouse:up',   () => { isPointerDown = false; });

      // Re-layout on viewport resize, page content growth (lazy load, infinite
      // scroll), and DOM mutations (SPA re-renders) — anchored annotations
      // follow their elements, the rest re-scale proportionally.
      window.addEventListener('resize', () => scheduleRelayout(250));

      // ResizeObserver fires once on observe() with the initial size — skip it
      let lastBodySize = '';
      new ResizeObserver((entries) => {
        const rect = entries[entries.length - 1].contentRect;
        const size = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
        if (size === lastBodySize) return;
        const isInitial = lastBodySize === '';
        lastBodySize = size;
        if (!isInitial) scheduleRelayout(250);
      }).observe(document.body);

      const isChalkNode = (n: Node) =>
        n === containerEl || n === toolbarHostEl ||
        (containerEl?.contains(n) ?? false) || (toolbarHostEl?.contains(n) ?? false);

      const mutationObserver = new MutationObserver((mutations) => {
        const relevant = mutations.some(m => {
          if (isChalkNode(m.target)) return false;
          // Ignore mutations that only add/remove Chalk's own elements
          const nodes = [...m.addedNodes, ...m.removedNodes];
          return nodes.length === 0 || nodes.some(n => !isChalkNode(n));
        });
        if (relevant) scheduleRelayout(500);
      });
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }

    function scheduleRelayout(delay: number) {
      clearTimeout(relayoutTimer);
      relayoutTimer = setTimeout(async () => {
        if (!containerEl || !canvas) return;
        // Don't wipe the canvas mid-stroke or mid-text-edit — try again later
        if (isPointerDown || isEditingText) {
          scheduleRelayout(500);
          return;
        }
        const { w: newW, h: newH } = getPageDimensions();
        containerEl.style.width = `${newW}px`;
        containerEl.style.height = `${newH}px`;
        canvas.setDimensions({ width: newW, height: newH });
        await renderAnnotations(loadedRows, { animate: false });
      }, delay);
    }

    function applyBrush() {
      if (!canvas || !fab) return;
      canvas.isDrawingMode = currentTool === 'draw';
      if (currentTool === 'draw') {
        const brush = new fab.PencilBrush(canvas);
        brush.color = currentColor;
        brush.width = currentSize;
        canvas.freeDrawingBrush = brush;
      }
    }

    // --- Annotation loading & rendering ---

    async function loadAnnotations() {
      if (!canvas || !fab) return;
      loadedRows = await fetchAnnotations(normalizeUrl(window.location.href));
      annotationCount = loadedRows.length;
      await renderAnnotations(loadedRows);
    }

    async function renderAnnotations(rows: AnnotationRow[], opts?: { animate?: boolean }) {
      if (!canvas || !fab) return;
      const animate = opts?.animate ?? true;
      canvas.clear();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const objects: any[] = [];
      for (const row of rows) {
        const obj = await buildAnnotationObject(row);
        if (obj) {
          // Re-layouts snap into place; initial load fades in from opacity 0
          obj.set({ opacity: animate ? 0 : 1, selectable: false, evented: false, hasControls: false, hasBorders: false });
          canvas.add(obj);
          objects.push(obj);
        }
      }
      canvas.renderAll();
      applyBrush();

      if (!animate) return;
      // Stagger fade-in: 50ms apart, capped so even large sets feel snappy
      objects.forEach((obj, i) => {
        const delay = Math.min(i * 50, 500);
        setTimeout(() => { animateOpacity(obj, 1, 400); }, delay);
      });
    }

    // Positions annotation data via its DOM anchor. Returns null when the
    // anchor can't be resolved, in which case the caller falls back to
    // proportional scaling.
    function applyAnchorPosition(
      data: Record<string, unknown>,
      anchor: AnnotationAnchor,
    ): Record<string, unknown> | null {
      const el = resolveAnchor(anchor);
      if (!el) return null;

      const rect = getDocumentRect(el);
      // Uniform scale from element width keeps shapes unskewed; clamped so a
      // degenerate rect can't blow the annotation up or shrink it to nothing.
      const rawScale = anchor.elemW > 0 ? rect.width / anchor.elemW : 1;
      const scale = Math.min(Math.max(rawScale, 0.25), 4);

      const d = { ...data };
      d.left = rect.left + anchor.offsetX * scale;
      d.top  = rect.top  + anchor.offsetY * scale;
      if (typeof d.scaleX === 'number')   d.scaleX   = d.scaleX   * scale;
      if (typeof d.scaleY === 'number')   d.scaleY   = d.scaleY   * scale;
      if (typeof d.fontSize === 'number') d.fontSize = d.fontSize * scale;
      return d;
    }

    async function buildAnnotationObject(row: AnnotationRow) {
      if (!canvas || !fab) return null;
      try {
        const { fabricData, storedW, storedH, anchor } = parseAnnotationData(row.data);

        let positioned = anchor ? applyAnchorPosition(fabricData, anchor) : null;
        if (!positioned) {
          // Fallback: proportional viewport scaling (also covers legacy rows)
          const currentW = canvas.width!;
          const currentH = canvas.height!;
          const ratioX = storedW ? currentW / storedW : 1;
          const ratioY = storedH ? currentH / storedH : 1;
          positioned = scaleFabricData(fabricData, ratioX, ratioY);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const [obj] = (await fab.util.enlivenObjects([positioned as any])) as any[];
        return obj ?? null;
      } catch (err) {
        console.warn('[Chalk] Could not load annotation:', err);
        return null;
      }
    }

    // --- Toolbar ---

    function createToolbar() {
      // Custom element name prevents page CSS (e.g. "div { opacity: 0.5 }") from targeting the host
      toolbarHostEl = document.createElement('chalk-toolbar');
      Object.assign(toolbarHostEl.style, {
        position: 'fixed',
        bottom: '32px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '2147483647',
        display: 'none',
        opacity: '1',
        filter: 'none',
        mixBlendMode: 'normal',
      });

      const shadow = toolbarHostEl.attachShadow({ mode: 'open' });

      shadow.innerHTML = `
        <style>
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          @keyframes chalk-toolbar-in {
            from { opacity: 0; transform: translateY(20px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0)   scale(1);    }
          }
          @keyframes chalk-toolbar-out {
            from { opacity: 1; transform: translateY(0)   scale(1);    }
            to   { opacity: 0; transform: translateY(12px) scale(0.97); }
          }
          .bar {
            background: rgba(255,255,255,0.9);
            border: 1px solid #ddd;
            border-radius: 12px;
            padding: 8px;
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 6px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.12);
            user-select: none;
            white-space: nowrap;
            animation: chalk-toolbar-in 0.35s cubic-bezier(0.34, 1.4, 0.64, 1) both;
          }
          .divider { height: 1px; width: 29px; background: #d7d7d7; flex-shrink: 0; }
          .logo {
            display: flex; align-items: center;
            padding: 0 4px; flex-shrink: 0;
          }
          .tool-btn {
            width: 40px; height: 40px;
            border-radius: 8px; border: 2px solid transparent;
            background: #ebebeb; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: background 0.1s, border-color 0.1s;
            flex-shrink: 0; padding: 0;
          }
          .tool-btn svg { display: block; stroke: #333; transition: stroke 0.1s; }
          .tool-btn:hover { background: #e0e0e0; }
          .tool-btn.active { background: #000; border-color: #000; }
          .tool-btn.active svg { stroke: #fff; }
          .swatches { display: flex; flex-direction: row; align-items: center; gap: 4px; }
          .swatch {
            width: 30px; height: 30px; border-radius: 50%;
            cursor: pointer; border: 2px solid transparent;
            flex-shrink: 0; transition: border-color 0.1s;
          }
          .swatch.active { box-shadow: 0 0 0 2.5px rgba(51,51,51,0.5); }
          .size {
            border-radius: 6px; border: 1px solid #ddd;
            background: #ebebeb; cursor: pointer; color: #57595a;
            padding: 8px;
            display: flex; align-items: center; justify-content: center;
            transition: background 0.1s; flex-shrink: 0;
            font-family: system-ui, sans-serif; line-height: 1;
          }
          .size.active { background: #000; color: #fff; border-color: #000; }
          .size-s { font-size: 11px; font-weight: 500; }
          .size-m { font-size: 14px; font-weight: 400; }
          .size-l { font-size: 20px; font-weight: 400; padding: 8px 12px; }
          .close-btn {
            width: 40px; height: 40px;
            border-radius: 8px; border: none;
            background: #ebebeb; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            padding: 0; transition: background 0.1s; flex-shrink: 0;
          }
          .close-btn svg { display: block; stroke: #666; transition: stroke 0.1s; }
          .close-btn:hover { background: #fdecea; }
          .close-btn:hover svg { stroke: #e03131; }
        </style>
        <div class="bar">
          <div class="logo">
            <svg width="64" height="49" viewBox="0 0 64 49" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M25.1719 1.84156L28.885 2.83545L39.4867 5.67922L47.1066 7.72096L49.1086 8.25233C50.8636 8.71333 52.1661 9.12449 53.2476 10.709C54.0796 11.9288 54.3757 13.4412 54.08 14.8882C53.9413 15.566 53.7362 16.2454 53.5556 16.9133L52.6486 20.2947L49.7085 31.2559L47.4558 39.6594L46.775 42.2077C46.6136 42.8111 46.4448 43.519 46.2078 44.0868C45.8077 45.026 45.1449 45.8293 44.2989 46.4001C43.0506 47.2383 41.6766 47.5274 40.1976 47.2363C39.6874 47.145 38.8841 46.9058 38.3623 46.7657L35.0762 45.8842L24.6901 43.1033L16.5995 40.9354L14.2245 40.3021C13.6198 40.1407 12.9918 39.9944 12.4156 39.7517C11.5433 39.3779 10.7911 38.77 10.2436 37.9949C9.39573 36.782 9.03841 35.3681 9.30634 33.9049C9.41873 33.2913 9.61005 32.6357 9.77353 32.0293L10.5344 29.2012L13.1936 19.2768L15.8115 9.49513L16.6125 6.50988C17.0969 4.70846 17.4621 3.3429 19.0958 2.20719C20.2693 1.37753 21.7284 1.05662 23.1416 1.31776C23.7505 1.41692 24.5632 1.67922 25.1719 1.84156ZM47.6475 11.4186L44.6576 10.6164L34.2084 7.82164L26.4285 5.736L23.9361 5.06917C23.63 4.98766 22.9377 4.7846 22.6444 4.73925C20.3284 4.35627 20.0812 6.4902 19.6351 8.15993L18.7247 11.5688L15.7802 22.5541L13.6542 30.4921L13.0246 32.8418C12.8926 33.3342 12.7124 33.9392 12.6406 34.4334C12.5557 34.9849 12.7031 35.5472 13.0475 35.9861C13.5942 36.696 14.6106 36.843 15.435 37.0636L17.9792 37.7443L26.0488 39.9076L35.8 42.5224L39.0096 43.3804C39.5471 43.5238 40.2608 43.7366 40.7886 43.846C41.8502 44.0243 42.8821 43.519 43.2235 42.4521C43.4025 41.893 43.5305 41.3049 43.6823 40.736L44.5848 37.3716L47.2646 27.3516L49.6688 18.3902L50.3498 15.849C50.498 15.3017 50.6585 14.7619 50.7622 14.2004C50.937 13.2538 50.3698 12.2046 49.4382 11.9085C48.8586 11.7243 48.2398 11.5755 47.6475 11.4186ZM43.5392 29.1772C43.8765 29.2586 44.7885 29.3996 44.907 29.7247C44.8766 29.8388 44.7784 29.9868 44.6883 30.0654C43.5117 31.0903 42.3026 32.0844 41.1141 33.0962C40.6739 33.4709 40.1453 33.8257 39.7449 34.2367L39.717 34.2656C39.8458 34.8059 40.0191 35.3654 40.1656 35.9043L41.2889 40.028C41.4674 40.6958 41.68 41.421 41.8145 42.0998C41.8419 42.2379 41.8168 42.3032 41.734 42.4079C41.5046 42.5388 39.6069 41.9538 39.2592 41.86C38.9955 41.7935 38.8952 41.7995 38.7022 41.641C38.4997 41.4749 38.3011 40.518 38.2335 40.2587C37.9302 39.0893 37.5787 37.9368 37.2421 36.7781C37.0699 36.1783 36.8924 35.5802 36.71 34.9835C36.5617 34.4969 36.3882 33.9798 36.2987 33.4811C36.4644 33.1286 37.3448 32.4565 37.672 32.1779C38.3558 31.589 39.0428 31.0033 39.7328 30.4219C40.3695 29.8831 40.9954 29.3067 41.6719 28.8224C41.8102 28.722 42.038 28.7814 42.1938 28.8217C42.8191 28.9838 42.9152 29.0104 43.5392 29.1772ZM24.8539 24.1695C25.0736 24.2263 25.4624 24.2856 25.5043 24.553C25.5897 25.0977 25.6463 25.6513 25.7102 26.1995L26.1322 29.8279L26.8618 35.5981C26.9602 36.4037 27.0674 37.2131 27.1468 38.021C27.1635 38.1917 27.1816 38.3332 27.0924 38.4806C27.0528 38.5024 27.0202 38.5173 26.9744 38.5208C26.7604 38.5357 24.2516 37.864 23.8981 37.743C23.7833 37.7036 23.6617 37.6491 23.5696 37.569C23.5015 37.5096 23.4905 37.3878 23.4772 37.3026C23.4067 36.8548 23.3734 36.3985 23.3195 35.9481L23.0033 33.3925C22.835 32.0536 22.5882 30.5215 22.4627 29.1995C22.312 29.3756 22.1734 29.5637 22.0335 29.7487C21.1869 30.8873 20.2506 32.0733 19.3835 33.198C19.0064 33.687 17.6853 35.5784 17.3297 35.8596C16.856 35.9918 15.061 35.2997 14.4642 35.2192C14.2937 35.1962 13.9572 35.0645 13.9107 34.8738C14.037 34.4082 17.3782 30.0591 17.8361 29.4379L21.0381 25.0872C21.3351 24.6885 21.6131 24.2725 21.9176 23.8801C21.9952 23.7801 22.1075 23.6202 22.2198 23.5597C22.3956 23.4656 24.5145 24.0827 24.8539 24.1695ZM33.7347 26.5501C34.1348 26.6527 35.4939 26.9477 35.7505 27.1731C35.8513 27.4053 35.2136 29.5364 35.0989 29.9598L33.9066 34.4092C33.7477 35.0014 33.4049 36.158 33.319 36.7268C33.9536 36.9589 34.8184 37.156 35.4925 37.3536C35.6422 37.6352 35.7192 37.9174 35.8045 38.2834C35.9896 39.0797 36.5961 40.1143 35.7304 40.7446C35.4741 40.9312 34.5841 40.6064 34.2573 40.5147L30.8439 39.6061C30.2673 39.4532 29.685 39.3106 29.1133 39.1414C28.7783 39.0424 28.6863 38.9926 28.7669 38.6381C28.8554 38.2489 28.9703 37.8687 29.0684 37.4824C29.345 36.3984 29.6326 35.3169 29.9305 34.2386L31.312 29.1169C31.3929 28.8159 31.9473 26.5197 32.1423 26.2407C32.242 26.0983 33.3939 26.4578 33.7347 26.5501ZM28.7579 7.98081C29.8076 8.26746 30.779 8.73753 31.6043 9.44314C32.8995 10.5506 33.6745 12.0858 33.7829 13.7868C33.7988 14.0374 33.8298 14.7205 33.6269 14.931C33.5251 14.9896 33.2373 14.9805 33.1366 14.9573C32.2078 14.7432 31.2899 14.4776 30.3687 14.2318C30.3298 14.2214 30.0249 14.1142 30.014 14.0842C29.9174 13.8201 29.8909 13.5315 29.8102 13.2562C29.7568 13.0746 29.6843 12.8991 29.5947 12.7323C28.8664 11.3908 26.9025 10.9723 25.6183 11.7518C24.994 12.1307 24.6685 12.4783 24.2886 13.1031C23.4414 14.4968 23.1351 16.3263 23.9475 17.8059C24.8184 19.3918 27.0959 19.914 28.4327 18.6084C28.5556 18.5046 28.8141 18.1321 28.9452 18.0693C29.1291 17.9819 29.8215 18.2191 30.0153 18.2712L31.6548 18.7104C31.8961 18.774 32.0705 18.8353 32.3024 18.9194L32.327 18.9522C32.4352 19.1008 32.5154 19.2605 32.4575 19.4462C32.1114 20.4212 31.1118 21.4102 30.261 21.9615C28.0844 23.3716 25.3873 23.213 23.1531 22.0233C18.006 19.2822 18.5428 11.7163 23.1953 8.77319C24.9517 7.66221 26.7631 7.54319 28.7579 7.98081ZM48.8213 13.4751C48.9238 13.5092 49.0273 13.5462 49.1081 13.6197C49.1502 13.9962 48.2474 17.1186 48.0672 17.7912L46.2495 24.5673L45.6462 26.8715C45.5653 27.1795 45.4752 27.5539 45.3627 27.8541C45.33 27.9412 45.2555 27.9428 45.1682 27.9688C44.738 27.9141 41.9657 27.1953 41.6956 27.0019C41.6041 26.9361 41.6293 26.7198 41.6436 26.6189C41.7044 26.1947 41.8619 25.7538 41.9735 25.3384L42.663 22.7803C42.7297 22.5338 42.9352 21.8736 42.9018 21.6665C42.6881 21.5196 38.2775 20.345 37.729 20.2571C37.3358 21.141 36.5649 25.123 36.2126 25.5014C36.1741 25.5425 36.1647 25.5413 36.111 25.5409C35.8361 25.5387 33.3175 24.8498 32.9591 24.7206C32.8196 24.6702 32.6701 24.6082 32.5622 24.504C32.5436 24.1431 33.4824 20.8935 33.6226 20.369L35.1296 14.7674C35.4877 13.4164 35.8398 12.0615 36.2098 10.7136C36.2454 10.584 36.3057 10.3845 36.3774 10.2691C36.4203 10.2005 36.5094 10.2117 36.5874 10.2061C37.5053 10.4191 38.4241 10.7108 39.3415 10.934C39.5396 10.9822 39.9341 11.0866 40.0662 11.2404C40.0771 11.477 39.8723 12.156 39.7986 12.4314L39.0991 15.0344C39.0298 15.2892 38.6448 16.4588 38.7773 16.6355C39.2683 16.8431 43.5353 17.9877 43.89 17.9671C44.102 17.7067 44.1676 17.1637 44.2547 16.8364C44.4168 16.2266 45.2048 12.9659 45.4344 12.7091C45.4709 12.6685 45.5071 12.6574 45.5595 12.6536C45.7854 12.6386 48.4856 13.3632 48.8213 13.4751Z" fill="#DDDDDD"/>
            </svg>
          </div>
          <button class="tool-btn active" id="btn-draw" title="Draw">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/>
              <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1 1 2.4 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>
            </svg>
          </button>
          <button class="tool-btn" id="btn-text" title="Text">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 7 4 4 20 4 20 7"/>
              <line x1="9" x2="15" y1="20" y2="20"/>
              <line x1="12" x2="12" y1="4" y2="20"/>
            </svg>
          </button>
          <div class="divider"></div>
          <div class="swatches" id="swatches"></div>
          <div class="divider"></div>
          ${SIZES.map(s => `<button class="size${s === currentSize ? ' active' : ''} size-${s === 2 ? 's' : s === 4 ? 'm' : 'l'}" data-size="${s}">${s === 2 ? 'Small' : s === 4 ? 'Medium' : 'Large'}</button>`).join('')}
          <div class="divider"></div>
          <button class="close-btn" id="btn-close" title="Close">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
      `;

      const swatchContainer = shadow.getElementById('swatches')!;
      swatchContainer.style.cssText = 'display:flex;flex-direction:row;gap:4px;align-items:center;';
      for (const color of COLORS) {
        const s = document.createElement('div');
        s.className = `swatch${color === currentColor ? ' active' : ''}`;
        s.style.background = color;
        s.dataset.color = color;
        if (color === '#f5f5f5') s.style.border = '2px solid #ccc';
        s.title = color;
        s.addEventListener('click', () => selectColor(color));
        swatchContainer.appendChild(s);
      }

      shadow.getElementById('btn-draw')!.addEventListener('click', () => setToolFromKey('draw'));
      shadow.getElementById('btn-text')!.addEventListener('click', () => setToolFromKey('text'));

      shadow.querySelectorAll<HTMLButtonElement>('[data-size]').forEach(btn => {
        btn.addEventListener('click', () => {
          currentSize = parseInt(btn.dataset.size!);
          shadow.querySelectorAll('[data-size]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (canvas?.freeDrawingBrush) canvas.freeDrawingBrush.width = currentSize;
        });
      });

      shadow.getElementById('btn-close')!.addEventListener('click', () => deactivate());

      document.body.appendChild(toolbarHostEl);
    }
  },
});
