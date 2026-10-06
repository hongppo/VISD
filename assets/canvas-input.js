/* Standalone input adapter. Its function source is also injected into preview frames. */
window.MockupCanvasInput = function bindCanvasInput(surface, emit, options) {
  'use strict';
  options = options || {};
  const doc = surface.ownerDocument;
  const win = doc.defaultView;
  const listeners = [];
  let inside = false;
  let space = false;
  let pointer = null;
  let previousX = 0;
  let previousY = 0;
  let gestureActive = false;
  let gestureScale = 1;
  let gestureUntil = 0;
  let suppressClick = false;
  let moved = false;
  let lastPoint = null;
  function listen(target, name, handler, settings) {
    target.addEventListener(name, handler, settings);
    listeners.push(() => target.removeEventListener(name, handler, settings));
  }
  function blocked() { return Boolean(options.isBlocked && options.isBlocked()); }
  function control(node) {
    return Boolean(node && node.closest && node.closest('input,textarea,select,button,a[href],[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="button"],[role="slider"]'));
  }
  function editable(node) {
    return Boolean(node && node.closest && node.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="slider"]'));
  }
  function classes() {
    surface.classList.toggle('is-pan-ready', space && !blocked());
    surface.classList.toggle('is-panning', pointer !== null);
  }
  function setSpace(active, notify) {
    const next = Boolean(active && !blocked());
    if (space === next) return;
    space = next;
    if (!space) endPan();
    classes();
    if (notify && options.onSpaceChange) options.onSpaceChange(space);
  }
  function endPan() {
    if (pointer === null) return;
    const captured = pointer;
    pointer = null;
    try { if (surface.hasPointerCapture(captured)) surface.releasePointerCapture(captured); } catch (_) {}
    classes();
    emit({ kind: 'pan-end' });
  }
  function reset() {
    endPan();
    setSpace(false, true);
    gestureActive = false;
    gestureScale = 1;
    gestureUntil = 0;
    classes();
  }
  function rememberPoint(event) {
    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) lastPoint = { clientX: event.clientX, clientY: event.clientY };
  }
  function point(event) {
    rememberPoint(event);
    if (lastPoint) return lastPoint;
    const rect = surface.getBoundingClientRect();
    return {
      clientX: Number.isFinite(event.clientX) ? event.clientX : rect.left + rect.width / 2,
      clientY: Number.isFinite(event.clientY) ? event.clientY : rect.top + rect.height / 2
    };
  }
  function sendZoom(event, factor) {
    if (!(factor > 0) || !Number.isFinite(factor)) return;
    emit(Object.assign({ kind: 'zoom', factor }, point(event)));
  }
  listen(surface, 'pointerenter', (event) => { inside = true; rememberPoint(event); classes(); });
  listen(surface, 'pointerleave', () => { inside = false; });
  listen(surface, 'wheel', (event) => {
    rememberPoint(event);
    if (event.defaultPrevented) return;
    if (event.ctrlKey) {
      event.preventDefault();
      if (blocked()) return;
      if (gestureActive || Date.now() < gestureUntil) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1;
      sendZoom(event, Math.exp(-Math.max(-100, Math.min(100, event.deltaY * unit)) * 0.01));
      return;
    }
    if (blocked()) return;
    // Scrollable mockup panels retain native scrolling; pinch and Space still control the canvas.
    if (!space && event.target && event.target.closest && event.target.closest('[data-viewer-scroll-region]')) return;
    // Editable content retains its own scrolling and native control behavior.
    if (event.target && event.target.closest && event.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    event.preventDefault();
    emit({ kind: 'scroll', deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode || 0 });
  }, { passive: false });
  listen(surface, 'gesturestart', (event) => {
    event.preventDefault();
    if (blocked()) return;
    gestureActive = true;
    gestureScale = Number.isFinite(event.scale) && event.scale > 0 ? event.scale : 1;
    gestureUntil = Date.now() + 250;
  }, { passive: false });
  listen(surface, 'gesturechange', (event) => {
    event.preventDefault();
    if (blocked()) return;
    if (!gestureActive || !Number.isFinite(event.scale) || event.scale <= 0) return;
    sendZoom(event, event.scale / gestureScale);
    gestureScale = event.scale;
    gestureUntil = Date.now() + 250;
  }, { passive: false });
  listen(surface, 'gestureend', (event) => {
    event.preventDefault();
    if (!gestureActive) return;
    gestureActive = false;
    gestureScale = 1;
    gestureUntil = Date.now() + 250;
  }, { passive: false });
  listen(doc, 'keydown', (event) => {
    if (event.code !== 'Space' && event.key !== ' ') return;
    if (blocked() || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (editable(event.target) || editable(doc.activeElement)) return;
    if (!inside && (control(event.target) || control(doc.activeElement))) return;
    if (!inside && !surface.contains(doc.activeElement)) return;
    event.preventDefault();
    setSpace(true, true);
  });
  listen(doc, 'keyup', (event) => {
    if (event.code !== 'Space' && event.key !== ' ') return;
    if (space) event.preventDefault();
    setSpace(false, true);
  });
  listen(surface, 'pointerdown', (event) => {
    if (!space || blocked() || event.button !== 0 || control(event.target)) { suppressClick = false; return; }
    event.preventDefault();
    pointer = event.pointerId;
    previousX = event.screenX;
    previousY = event.screenY;
    moved = false;
    suppressClick = false;
    try { surface.setPointerCapture(pointer); } catch (_) {}
    classes();
    emit({ kind: 'pan-start' });
  });
  listen(surface, 'pointermove', (event) => {
    rememberPoint(event);
    if (pointer === null || event.pointerId !== pointer) return;
    if (blocked()) { reset(); return; }
    event.preventDefault();
    const deltaX = event.screenX - previousX;
    const deltaY = event.screenY - previousY;
    previousX = event.screenX;
    previousY = event.screenY;
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || (!deltaX && !deltaY)) return;
    moved = true;
    emit({ kind: 'pan', deltaX, deltaY });
  });
  listen(surface, 'pointerup', (event) => {
    if (event.pointerId !== pointer) return;
    event.preventDefault();
    suppressClick = moved;
    endPan();
  });
  listen(surface, 'click', (event) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  listen(surface, 'pointercancel', reset);
  listen(surface, 'lostpointercapture', () => { if (pointer !== null) reset(); });
  listen(win, 'blur', () => {
    // Focusing the embedded canvas must preserve a Space press from its host.
    const active = doc.activeElement;
    if (active && active.tagName === 'IFRAME' && surface.contains(active)) return;
    reset();
  });
  listen(doc, 'visibilitychange', () => { if (doc.hidden) reset(); });
  return {
    reset,
    setSpace: (active) => setSpace(active, false),
    destroy: () => { reset(); listeners.splice(0).forEach((remove) => remove()); }
  };
};
