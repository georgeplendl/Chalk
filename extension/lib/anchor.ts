// DOM anchoring for annotations.
//
// Annotations are anchored to the element they were drawn over: we store CSS
// selectors for the element plus the annotation's offset relative to its rect.
// On load/resize/mutation the element is re-resolved and the annotation is
// repositioned so it follows the content instead of the viewport. When the
// element can't be found, callers fall back to proportional viewport scaling.

export interface AnnotationAnchor {
  /** Selector candidates, ordered best (most stable) to worst. */
  selectors: string[];
  /** Annotation left minus element rect left, in document coords. */
  offsetX: number;
  /** Annotation top minus element rect top, in document coords. */
  offsetY: number;
  /** Element rect size at draw time — used to scale annotation with element. */
  elemW: number;
  elemH: number;
  /** Leading text of the element, used to verify selector resolution. */
  textHint?: string;
}

export interface DocumentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const TEXT_HINT_LENGTH = 40;
const MAX_STRUCTURAL_DEPTH = 6;

/** getBoundingClientRect translated into document coordinates. */
export function getDocumentRect(el: Element): DocumentRect {
  const r = el.getBoundingClientRect();
  return {
    left: r.left + window.scrollX,
    top: r.top + window.scrollY,
    width: r.width,
    height: r.height,
  };
}

// Ids from JS frameworks churn between page loads (ember123, :r4:, radix-:r1:,
// uuid-ish strings, mostly-numeric ids) — anchoring to them would break on the
// next visit.
function isStableId(id: string): boolean {
  if (!id || id.length > 64) return false;
  if (/^(ember|react|radix|headlessui|mui)[-:]?\d/i.test(id)) return false;
  if (/^:.*:$/.test(id)) return false;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}/i.test(id)) return false;
  const digits = (id.match(/\d/g) ?? []).length;
  return digits / id.length < 0.4;
}

function cssEscape(value: string): string {
  return CSS.escape(value);
}

function isUniqueSelector(selector: string, el: Element): boolean {
  try {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === el;
  } catch {
    return false;
  }
}

// Structural path using tag names + :nth-of-type, walking up until we hit an
// id'd ancestor or a landmark element. Class names are deliberately excluded —
// CSS-module hashes and utility classes churn between deploys.
function buildStructuralSelector(el: Element): string | null {
  const segments: string[] = [];
  let node: Element | null = el;

  for (let depth = 0; node && depth < MAX_STRUCTURAL_DEPTH; depth++) {
    const tag = node.tagName.toLowerCase();
    if (tag === 'html' || tag === 'body') {
      segments.unshift(tag === 'body' ? 'body' : 'html');
      break;
    }

    const parent: Element | null = node.parentElement;
    const id = node.id;
    if (id && isStableId(id)) {
      segments.unshift(`#${cssEscape(id)}`);
      break;
    }

    if (!parent) {
      segments.unshift(tag);
      break;
    }

    const sameTagSiblings = Array.from(parent.children).filter(
      c => c.tagName === node!.tagName,
    );
    const segment = sameTagSiblings.length > 1
      ? `${tag}:nth-of-type(${sameTagSiblings.indexOf(node) + 1})`
      : tag;
    segments.unshift(segment);
    node = parent;
  }

  const selector = segments.join(' > ');
  return isUniqueSelector(selector, el) ? selector : null;
}

/** Selector candidates for an element, ordered best to worst. */
export function buildSelectors(el: Element): string[] {
  const selectors: string[] = [];

  if (el.id && isStableId(el.id)) {
    const s = `#${cssEscape(el.id)}`;
    if (isUniqueSelector(s, el)) selectors.push(s);
  }

  for (const attr of ['data-testid', 'aria-label', 'name']) {
    const value = el.getAttribute(attr);
    if (value && value.length <= 64) {
      const s = `${el.tagName.toLowerCase()}[${attr}="${cssEscape(value)}"]`;
      if (isUniqueSelector(s, el)) selectors.push(s);
      if (selectors.length >= 2) break;
    }
  }

  const structural = buildStructuralSelector(el);
  if (structural && !selectors.includes(structural)) selectors.push(structural);

  return selectors.slice(0, 3);
}

function getTextHint(el: Element): string | undefined {
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, TEXT_HINT_LENGTH) : undefined;
}

function isVisible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// Full-bleed wrappers (page containers covering most of the viewport) make
// poor anchors — they move/resize like the viewport itself, which is exactly
// what we're trying to escape.
function isAnchorWorthy(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'html' || tag === 'body') return false;
  if (!isVisible(el)) return false;

  const style = window.getComputedStyle(el);
  if (style.position === 'fixed' || style.position === 'sticky') return false;

  const r = el.getBoundingClientRect();
  const coversViewport =
    r.width >= window.innerWidth * 0.9 && r.height >= window.innerHeight * 0.9;
  return !coversViewport;
}

function isChalkElement(el: Element): boolean {
  if (el.tagName.toLowerCase() === 'chalk-toolbar') return true;
  return el.closest('chalk-toolbar') !== null;
}

/**
 * Element under a document-coordinate point, skipping Chalk's own overlay.
 */
export function findAnchorElementAtPoint(
  docX: number,
  docY: number,
  overlayEl: Element | null,
): Element | null {
  return elementAtPoint(docX, docY, overlayEl);
}
function elementAtPoint(docX: number, docY: number, overlayEl: Element | null): Element | null {
  const x = docX - window.scrollX;
  const y = docY - window.scrollY;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return null;

  for (const el of document.elementsFromPoint(x, y)) {
    if (overlayEl && (el === overlayEl || overlayEl.contains(el))) continue;
    if (isChalkElement(el)) continue;
    if (isAnchorWorthy(el)) return el;
  }
  return null;
}

/**
 * Best anchor element for an annotation. Samples the bounding-box center plus
 * the four corners and majority-votes, so strokes spilling over an element's
 * edge still anchor to the element they mostly cover.
 */
export function findAnchorElement(
  bounds: DocumentRect,
  overlayEl: Element | null,
): Element | null {
  const cx = bounds.left + bounds.width / 2;
  const cy = bounds.top + bounds.height / 2;
  const points: Array<[number, number]> = [
    [cx, cy],
    [bounds.left, bounds.top],
    [bounds.left + bounds.width, bounds.top],
    [bounds.left, bounds.top + bounds.height],
    [bounds.left + bounds.width, bounds.top + bounds.height],
  ];

  const votes = new Map<Element, number>();
  for (const [x, y] of points) {
    const el = elementAtPoint(x, y, overlayEl);
    if (el) votes.set(el, (votes.get(el) ?? 0) + 1);
  }

  let best: Element | null = null;
  let bestVotes = 0;
  for (const [el, count] of votes) {
    if (count > bestVotes) {
      best = el;
      bestVotes = count;
    }
  }
  return best;
}

/**
 * Anchor record for an annotation over the given element. `position` is the
 * Fabric object's left/top in document coords — the same value that gets
 * recomputed from the anchor at render time.
 */
export function buildAnchor(
  el: Element,
  position: { left: number; top: number },
): AnnotationAnchor | null {
  const selectors = buildSelectors(el);
  if (selectors.length === 0) return null;

  const rect = getDocumentRect(el);
  return {
    selectors,
    offsetX: position.left - rect.left,
    offsetY: position.top - rect.top,
    elemW: rect.width,
    elemH: rect.height,
    textHint: getTextHint(el),
  };
}

/** True when overlap area / smaller rect area >= minRatio. */
export function boundsOverlap(a: DocumentRect, b: DocumentRect, minRatio = 0.3): boolean {
  const overlapW = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const overlapH = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  const overlapArea = overlapW * overlapH;
  if (overlapArea <= 0) return false;
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  return smaller > 0 && overlapArea / smaller >= minRatio;
}

/**
 * Recompute offsets for a new annotation while keeping the session anchor's
 * selectors and element size — keeps consecutive fill strokes on the same scale.
 */
export function reuseSessionAnchor(
  session: AnnotationAnchor,
  el: Element,
  position: { left: number; top: number },
): AnnotationAnchor {
  const rect = getDocumentRect(el);
  return {
    selectors: session.selectors,
    offsetX: position.left - rect.left,
    offsetY: position.top - rect.top,
    elemW: session.elemW,
    elemH: session.elemH,
    textHint: session.textHint,
  };
}

/**
 * Re-resolve an anchor to a live element, or null if no selector matches a
 * visible element whose text agrees with the stored hint.
 */
export function resolveAnchor(anchor: AnnotationAnchor): Element | null {
  for (const selector of anchor.selectors) {
    let el: Element | null;
    try {
      el = document.querySelector(selector);
    } catch {
      continue;
    }
    if (!el || !isVisible(el)) continue;

    if (anchor.textHint) {
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
      if (!text.startsWith(anchor.textHint)) continue;
    }
    return el;
  }
  return null;
}

function isAnnotationAnchor(value: unknown): value is AnnotationAnchor {
  if (typeof value !== 'object' || value === null) return false;
  const a = value as Record<string, unknown>;
  return (
    Array.isArray(a.selectors) &&
    a.selectors.every(s => typeof s === 'string') &&
    typeof a.offsetX === 'number' &&
    typeof a.offsetY === 'number' &&
    typeof a.elemW === 'number' &&
    typeof a.elemH === 'number'
  );
}

/** Parse an anchor out of stored annotation data, if present and well-formed. */
export function parseAnchor(value: unknown): AnnotationAnchor | null {
  return isAnnotationAnchor(value) ? value : null;
}
