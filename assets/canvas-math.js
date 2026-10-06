(function (root) {
  'use strict';
  const minZoom = 0.1;
  const maxZoom = 2;
  function clampZoom(value) {
    return Number.isFinite(value) ? Math.max(minZoom, Math.min(maxZoom, value)) : 1;
  }
  function widthFit(viewportWidth, pageWidth, padding) {
    const available = Math.max(0, viewportWidth - (padding === undefined ? 64 : padding));
    return clampZoom(Math.min(1, available / (pageWidth > 0 ? pageWidth : 1280)));
  }
  function anchorAdjustment(before, after, anchor, oldZoom, newZoom) {
    return {
      left: after.left + (anchor.clientX - before.left) / oldZoom * newZoom - anchor.clientX,
      top: after.top + (anchor.clientY - before.top) / oldZoom * newZoom - anchor.clientY
    };
  }
  function scrollDelta(input, viewportWidth, viewportHeight) {
    const xUnit = input.deltaMode === 1 ? 16 : input.deltaMode === 2 ? viewportWidth : 1;
    const yUnit = input.deltaMode === 1 ? 16 : input.deltaMode === 2 ? viewportHeight : 1;
    return { left: input.deltaX * xUnit, top: input.deltaY * yUnit };
  }
  const api = { minZoom, maxZoom, clampZoom, widthFit, anchorAdjustment, scrollDelta };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MockupCanvasMath = api;
})(typeof window !== 'undefined' ? window : globalThis);
