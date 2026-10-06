(function () {
  'use strict';
  const config = window.MOCKUP_VIEWER_MANIFEST || { tree: [] };
  const descriptionData = window.MOCKUP_VIEWER_DESCRIPTIONS || {};
  const canvasMath = window.MockupCanvasMath;
  let canvasBinding;
  let zoomSaveTimer;
  const $ = (id) => document.getElementById(id);
  const elements = {
    sidebar: $('sidebar'), descriptions: $('description-panel'), tree: $('page-tree'),
    viewport: $('canvas-viewport'), area: $('canvas-area'), stack: $('canvas-stack'),
    shell: $('artboard-shell'), artboard: $('artboard'), frame: $('page-frame'),
    markers: $('annotation-layer'), list: $('description-list')
  };
  const pages = [];
  const scopePages = new Map();
  const pageButtons = new Map();
  const groupButtons = new Map();
  const groupLists = new Map();
  const descriptions = new Map();
  const markerButtons = new Map();
  const usedIds = new Set();
  const state = { index: 0, zoom: 1, fit: true, activeAnnotation: null, annotationsVisible: true };
  const storageKey = 'mockup-viewer-preferences-v1';
  let preferences = {};
  try { preferences = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch (_) { /* Local files may disallow storage. */ }

  function icon(type) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', type === 'chevron' ? 'm5 7.5 5 5 5-5' : 'M5 2.5h7l3 3v12H5zM12 2.5v4h3M8 10h4M8 13h4');
    svg.append(path);
    svg.classList.add(type === 'chevron' ? 'tree-chevron' : 'tree-page-icon');
    return svg;
  }
  function span(className, content) {
    const node = document.createElement('span');
    node.className = className;
    node.textContent = content;
    return node;
  }
  function onSelectableClick(node, action) {
    let pointerStart = null;
    node.addEventListener('pointerdown', (event) => {
      pointerStart = { x: event.clientX, y: event.clientY };
    });
    node.addEventListener('click', (event) => {
      const selection = window.getSelection();
      const dragged = pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4;
      pointerStart = null;
      if (event.detail > 0 && dragged && selection && !selection.isCollapsed && node.contains(selection.anchorNode)) return;
      action();
    });
  }
  function savePreferences() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ sidebarHidden: elements.sidebar.hidden, descriptionsHidden: elements.descriptions.hidden, annotationsVisible: state.annotationsVisible, fit: state.fit, zoom: state.zoom }));
    } catch (_) { /* Viewer remains fully usable without persistent storage. */ }
  }
  function setAnnotationsVisible(visible, save) {
    state.annotationsVisible = Boolean(visible);
    elements.markers.hidden = !state.annotationsVisible;
    const button = $('toggle-annotations');
    button.setAttribute('aria-pressed', String(state.annotationsVisible));
    button.title = state.annotationsVisible ? '화면 번호 숨기기' : '화면 번호 표시하기';
    if (save !== false) savePreferences();
  }
  function toggleGroup(id, expand) {
    const button = groupButtons.get(id);
    const list = groupLists.get(id);
    if (!button || !list) return;
    const expanded = typeof expand === 'boolean' ? expand : button.getAttribute('aria-expanded') !== 'true';
    button.setAttribute('aria-expanded', String(expanded));
    list.hidden = !expanded;
  }
  function buildTree(nodes, depth, ancestors) {
    const list = document.createElement('ul');
    list.className = 'tree-list';
    (nodes || []).forEach((node) => {
      if (!node || !node.id || usedIds.has(node.id)) return;
      usedIds.add(node.id);
      const item = document.createElement('li');
      if (Array.isArray(node.children)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tree-group-button';
        button.style.paddingLeft = (10 + depth * 16) + 'px';
        button.setAttribute('aria-expanded', 'true');
        button.append(icon('chevron'), span('tree-title', node.title || node.id));
        const childList = buildTree(node.children, depth + 1, ancestors.concat({ id: node.id, title: node.title || node.id }));
        childList.id = 'tree-group-' + groupLists.size;
        button.setAttribute('aria-controls', childList.id);
        groupButtons.set(node.id, button);
        groupLists.set(node.id, childList);
        onSelectableClick(button, () => toggleGroup(node.id));
        item.append(button, childList);
      } else {
        const scopeId = ancestors.length ? ancestors[0].id : node.id;
        if (!scopePages.has(scopeId)) scopePages.set(scopeId, []);
        const scope = scopePages.get(scopeId);
        const page = Object.assign({}, node, { ancestors, scopeId, scopeIndex: scope.length });
        const index = pages.length;
        pages.push(page);
        scope.push(index);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tree-page-button';
        button.style.paddingLeft = (10 + depth * 16) + 'px';
        button.dataset.pageId = page.id;
        button.append(icon('page'), span('tree-title', page.title || page.id), span('tree-number', String(page.scopeIndex + 1).padStart(2, '0')));
        onSelectableClick(button, () => navigate(index));
        pageButtons.set(page.id, button);
        item.append(button);
      }
      list.append(item);
    });
    return list;
  }

  function setPanel(panel, buttonId, hidden, save) {
    const side = panel === elements.sidebar ? 'sidebar' : 'descriptions';
    const rail = $(side + '-rail');
    const expandButton = $('expand-' + side);
    const collapseButton = $('collapse-' + side);
    const restoreFocus = hidden ? panel.contains(document.activeElement) : document.activeElement === expandButton;
    panel.hidden = hidden;
    rail.hidden = !hidden;
    [$(buttonId), expandButton, collapseButton].forEach((button) => {
      button.setAttribute('aria-expanded', String(!hidden));
    });
    if (restoreFocus) (hidden ? expandButton : collapseButton).focus();
    if (save !== false) savePreferences();
    requestAnimationFrame(() => { if (state.fit) fitCanvas(); });
  }
  function pageDimensions() {
    const page = pages[state.index];
    return { width: Number(page && page.width) > 0 ? Number(page.width) : 1280, height: Number(page && (page.documentHeight || page.height)) > 0 ? Number(page.documentHeight || page.height) : 800 };
  }
  function viewportPoint(atTop) {
    const rect = elements.viewport.getBoundingClientRect();
    return {
      clientX: rect.left + elements.viewport.clientWidth / 2,
      clientY: atTop ? rect.top : rect.top + elements.viewport.clientHeight / 2
    };
  }
  function applyZoom(zoom, anchor) {
    const dimensions = pageDimensions();
    const oldZoom = state.zoom;
    const before = anchor ? elements.artboard.getBoundingClientRect() : null;
    state.zoom = canvasMath.clampZoom(zoom);
    elements.artboard.style.width = dimensions.width + 'px';
    elements.artboard.style.height = dimensions.height + 'px';
    elements.artboard.style.transform = 'scale(' + state.zoom + ')';
    elements.shell.style.width = (dimensions.width * state.zoom) + 'px';
    elements.shell.style.height = (dimensions.height * state.zoom) + 'px';
    elements.stack.style.width = (dimensions.width * state.zoom) + 'px';
    markerButtons.forEach((marker) => {
      marker.style.transform = 'translate(-50%, -50%) scale(' + (1 / state.zoom) + ')';
      marker.style.width = state.zoom < 1 ? '26px' : '32px';
      marker.style.height = state.zoom < 1 ? '26px' : '32px';
    });
    $('zoom-reset').textContent = Math.round(state.zoom * 100) + '%';
    $('zoom-reset').setAttribute('aria-label', '현재 ' + Math.round(state.zoom * 100) + '%. 100%로 보기');
    $('zoom-out').disabled = state.zoom <= canvasMath.minZoom + .0001;
    $('zoom-in').disabled = state.zoom >= canvasMath.maxZoom - .0001;
    $('zoom-fit').setAttribute('aria-pressed', String(state.fit));
    if (anchor && oldZoom !== state.zoom) {
      const adjustment = canvasMath.anchorAdjustment(before, elements.artboard.getBoundingClientRect(), anchor, oldZoom, state.zoom);
      elements.viewport.scrollLeft += adjustment.left;
      elements.viewport.scrollTop += adjustment.top;
    }
  }
  function fitCanvas(resetPosition) {
    if (!pages.length) return;
    const dimensions = pageDimensions();
    const anchor = !resetPosition && elements.viewport.scrollTop > 0 ? viewportPoint(true) : null;
    applyZoom(canvasMath.widthFit(elements.viewport.clientWidth, dimensions.width), anchor);
    elements.viewport.scrollLeft = 0;
    if (resetPosition) elements.viewport.scrollTop = 0;
  }
  function manualZoom(value, anchor) {
    state.fit = false;
    applyZoom(canvasMath.clampZoom(value), anchor || viewportPoint(false));
    clearTimeout(zoomSaveTimer);
    zoomSaveTimer = setTimeout(savePreferences, 150);
  }
  function handleCanvasInput(input) {
    if (!pages.length || window.MockupCodeTools.isBusy() || !input) return;
    if (input.kind === 'zoom') {
      if (![input.factor, input.clientX, input.clientY].every(Number.isFinite) || input.factor <= 0) return;
      manualZoom(state.zoom * Math.max(.2, Math.min(5, input.factor)), input);
    } else if (input.kind === 'scroll' || input.kind === 'pan') {
      if (![input.deltaX, input.deltaY].every(Number.isFinite)) return;
      const delta = input.kind === 'pan'
        ? { left: -input.deltaX, top: -input.deltaY }
        : canvasMath.scrollDelta(input, elements.viewport.clientWidth, elements.viewport.clientHeight);
      elements.viewport.scrollLeft += delta.left;
      elements.viewport.scrollTop += delta.top;
    } else if (input.kind === 'pan-start') {
      elements.viewport.classList.add('is-panning');
    } else if (input.kind === 'pan-end') {
      elements.viewport.classList.remove('is-panning');
    }
  }
  function annotationEntries(page) {
    const entries = descriptionData[page.id];
    if (!Array.isArray(entries)) return [];
    const ids = new Set();
    return entries.filter((entry) => {
      if (!entry || !entry.id || ids.has(entry.id)) return false;
      ids.add(entry.id);
      return true;
    });
  }
  function selectAnnotation(id, origin) {
    if (!descriptions.has(id)) return;
    state.activeAnnotation = id;
    descriptions.forEach((card, cardId) => {
      const active = cardId === id;
      card.classList.toggle('is-active', active);
      if (card.getAttribute('role') === 'button') card.setAttribute('aria-pressed', String(active));
    });
    markerButtons.forEach((button, markerId) => {
      const active = markerId === id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    if (elements.descriptions.hidden) setPanel(elements.descriptions, 'toggle-descriptions', false);
    if (origin === 'marker') {
      requestAnimationFrame(() => {
        const card = descriptions.get(id);
        const list = elements.list;
        const top = card.offsetTop - list.offsetTop;
        list.scrollTo({ top: Math.max(0, top - 12), behavior: 'smooth' });
      });
    }
    $('viewer-status').textContent = descriptions.get(id).querySelector('h4').textContent + ' 설명 선택';
  }
  function appendDescriptionBody(node, value) {
    const text = String(value || '');
    const pattern = /\[([^\]\n]+)\]\(#([a-zA-Z0-9_-]+)(?:\/([a-zA-Z0-9_-]+))?\)/g;
    let cursor = 0;
    let hasLinks = false;
    for (const match of text.matchAll(pattern)) {
      node.append(document.createTextNode(text.slice(cursor, match.index)));
      if (pages.some((page) => page.id === match[2])) {
        const link = document.createElement('a');
        link.className = 'description-policy-link';
        link.setAttribute('href', '#' + match[2] + (match[3] ? '/' + match[3] : ''));
        link.textContent = match[1];
        link.addEventListener('click', (event) => {
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          const hash = link.getAttribute('href');
          if (location.hash === hash) renderPage(indexFromHash());
          else location.hash = hash;
        });
        node.append(link);
        hasLinks = true;
      } else node.append(document.createTextNode(match[0]));
      cursor = match.index + match[0].length;
    }
    node.append(document.createTextNode(text.slice(cursor)));
    return hasLinks;
  }
  function renderDescriptions(page) {
    const entries = annotationEntries(page);
    descriptions.clear();
    markerButtons.clear();
    elements.list.replaceChildren();
    elements.markers.replaceChildren();
    $('description-page-label').textContent = '현재 화면 | ' + String(page.scopeIndex + 1).padStart(2, '0');
    $('description-page-title').textContent = page.title;
    $('description-page-summary').textContent = page.summary || '';
    if (!entries.length && !page.hideEmptyDescription) {
      const empty = document.createElement('p');
      empty.className = 'no-descriptions';
      empty.textContent = '이 화면에 등록된 설명이 없습니다.';
      elements.list.append(empty);
    }
    entries.forEach((entry, index) => {
      const number = index + 1;
      const customLabel = typeof entry.label === 'string' ? entry.label.trim() : '';
      const label = customLabel || number;
      const showNumber = entry.showNumber !== false;
      const card = document.createElement('article');
      card.className = 'description-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-pressed', 'false');
      card.setAttribute('aria-label', (showNumber ? (customLabel || number + '번 설명') + ': ' : '') + entry.title);
      card.dataset.annotationId = entry.id;
      const title = document.createElement('h4');
      title.className = 'description-card-title';
      if (showNumber) title.append(span('description-number' + (customLabel ? ' description-code' : ''), label));
      title.append(span('', entry.title || '화면 설명'));
      const body = document.createElement('p');
      const hasLinks = appendDescriptionBody(body, entry.body);
      card.append(title, body);
      if (hasLinks) {
        card.removeAttribute('tabindex');
        card.removeAttribute('aria-pressed');
        card.setAttribute('role', 'group');
        card.classList.add('has-links');
      } else {
        onSelectableClick(card, () => selectAnnotation(entry.id, 'description'));
        card.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectAnnotation(entry.id, 'description'); }
        });
      }
      elements.list.append(card);
      descriptions.set(entry.id, card);
      if (Number.isFinite(entry.x) && Number.isFinite(entry.y)) {
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'annotation-marker';
        marker.textContent = number;
        marker.style.left = entry.x + 'px';
        marker.style.top = entry.y + 'px';
        marker.dataset.annotationId = entry.id;
        marker.hidden = typeof entry.targetId === 'string' && /^[a-zA-Z0-9_-]+$/.test(entry.targetId);
        marker.setAttribute('aria-label', number + '번 설명: ' + entry.title);
        marker.setAttribute('aria-pressed', 'false');
        marker.title = entry.title;
        marker.addEventListener('click', () => selectAnnotation(entry.id, 'marker'));
        elements.markers.append(marker);
        markerButtons.set(entry.id, marker);
      }
    });
    elements.list.scrollTop = 0;
  }
  function safePageSource(source) {
    if (typeof source !== 'string' || !/^(?:\.\/)?pages\/[a-zA-Z0-9_./-]+\.html$/.test(source) || source.split('/').includes('..')) return 'about:blank';
    return source;
  }
  function renderPage(index) {
    if (index < 0 || index >= pages.length) return;
    if (canvasBinding) canvasBinding.reset();
    elements.viewport.classList.remove('is-panning');
    state.index = index;
    state.activeAnnotation = null;
    const page = pages[index];
    pageButtons.forEach((button, id) => {
      if (id === page.id) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    page.ancestors.forEach((group) => toggleGroup(group.id, true));
    $('page-title').textContent = page.title;
    $('page-breadcrumb').textContent = page.ancestors.map((group) => group.title).join(' / ') || '화면 목록';
    $('artboard-kind').textContent = page.kind || '';
    const dimensions = pageDimensions();
    $('artboard-size').textContent = dimensions.width + ' × ' + dimensions.height;
    elements.frame.title = page.title + ' | 목업';
    if (!window.MockupCodeTools.setPage(page, routeFromHash().anchor)) {
      elements.frame.removeAttribute('srcdoc');
      elements.frame.src = safePageSource(page.src);
    }
    const scope = scopePages.get(page.scopeId);
    const scopeTitle = page.ancestors.length ? page.ancestors[0].title : page.title;
    $('previous-page').disabled = page.scopeIndex === 0;
    $('next-page').disabled = page.scopeIndex === scope.length - 1;
    $('page-counter').replaceChildren();
    const current = document.createElement('strong');
    current.textContent = String(page.scopeIndex + 1).padStart(2, '0');
    $('page-counter').append(current, span('', '/'), span('', String(scope.length).padStart(2, '0')));
    $('page-counter').setAttribute('aria-label', scopeTitle + ', ' + (page.scopeIndex + 1) + ' / ' + scope.length);
    $('page-id').textContent = page.id;
    $('page-id').title = '페이지 ID: ' + page.id;
    document.title = page.title;
    renderDescriptions(page);
    if (state.fit) fitCanvas(true);
    else applyZoom(state.zoom);
    elements.viewport.scrollLeft = 0;
    elements.viewport.scrollTop = 0;
    $('viewer-status').textContent = scopeTitle + ', ' + (page.scopeIndex + 1) + ' / ' + scope.length + ', ' + page.title;
  }
  function navigate(index, anchor) {
    if (index < 0 || index >= pages.length ||
        (anchor !== undefined && (typeof anchor !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(anchor)))) return;
    const hash = '#' + encodeURIComponent(pages[index].id) + (anchor === undefined ? '' : '/' + encodeURIComponent(anchor));
    if (location.hash === hash) renderPage(index);
    else location.hash = hash;
  }
  function navigateWithinScope(offset) {
    const page = pages[state.index];
    if (!page) return;
    const scope = scopePages.get(page.scopeId);
    const index = scope[page.scopeIndex + offset];
    if (typeof index === 'number') navigate(index);
  }
  function routeFromHash() {
    try {
      const [id, anchor = ''] = location.hash.slice(1).split('/').map(decodeURIComponent);
      return { id, anchor: /^[a-zA-Z0-9_-]+$/.test(anchor) ? anchor : '' };
    } catch (_) { return { id: '', anchor: '' }; }
  }
  function indexFromHash() {
    const index = pages.findIndex((page) => page.id === routeFromHash().id);
    return index >= 0 ? index : 0;
  }

  elements.tree.append(buildTree(config.tree, 0, []));
  setPanel(elements.sidebar, 'toggle-sidebar', Boolean(preferences.sidebarHidden), false);
  setPanel(elements.descriptions, 'toggle-descriptions', Boolean(preferences.descriptionsHidden), false);
  setAnnotationsVisible(preferences.annotationsVisible !== false, false);
  state.fit = preferences.fit !== false;
  if (Number.isFinite(preferences.zoom)) state.zoom = canvasMath.clampZoom(preferences.zoom);
  $('toggle-sidebar').addEventListener('click', () => setPanel(elements.sidebar, 'toggle-sidebar', !elements.sidebar.hidden));
  $('toggle-descriptions').addEventListener('click', () => setPanel(elements.descriptions, 'toggle-descriptions', !elements.descriptions.hidden));
  $('collapse-sidebar').addEventListener('click', () => setPanel(elements.sidebar, 'toggle-sidebar', true));
  $('expand-sidebar').addEventListener('click', () => setPanel(elements.sidebar, 'toggle-sidebar', false));
  $('collapse-descriptions').addEventListener('click', () => setPanel(elements.descriptions, 'toggle-descriptions', true));
  $('expand-descriptions').addEventListener('click', () => setPanel(elements.descriptions, 'toggle-descriptions', false));
  $('toggle-annotations').addEventListener('click', () => setAnnotationsVisible(!state.annotationsVisible));
  $('zoom-out').addEventListener('click', () => manualZoom(Math.round(state.zoom * 100 - 10) / 100));
  $('zoom-in').addEventListener('click', () => manualZoom(Math.round(state.zoom * 100 + 10) / 100));
  $('zoom-reset').addEventListener('click', () => manualZoom(1));
  $('zoom-fit').addEventListener('click', () => { state.fit = true; fitCanvas(true); savePreferences(); });
  $('previous-page').addEventListener('click', () => navigateWithinScope(-1));
  $('next-page').addEventListener('click', () => navigateWithinScope(1));
  window.addEventListener('hashchange', () => renderPage(indexFromHash()));
  document.addEventListener('keydown', (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
    if (window.MockupCodeTools.isBusy() || !window.getSelection().isCollapsed) return;
    const target = event.target;
    if (target.closest('input,textarea,select,[contenteditable=true]')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); navigateWithinScope(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); navigateWithinScope(1); }
  });
  window.addEventListener('mockup-viewer:document-link', (event) => {
    const page = pages[state.index];
    const detail = event.detail;
    if (window.MockupCodeTools.isBusy() || !page || !detail || detail.pageId !== page.id ||
        typeof detail.anchor !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(detail.anchor)) return;
    const hash = '#' + encodeURIComponent(page.id) + '/' + encodeURIComponent(detail.anchor);
    if (location.hash === hash) renderPage(state.index);
    else location.hash = hash;
  });
  window.addEventListener('mockup-viewer:page-link', (event) => {
    if (window.MockupCodeTools.isBusy() || !event.detail) return;
    const index = pages.findIndex((page) => page.id === event.detail.pageId);
    if (index >= 0) navigate(index, event.detail.anchor);
  });
  window.addEventListener('mockup-viewer:navigate', (event) => {
    if (window.MockupCodeTools.isBusy()) return;
    if (event.detail.direction === 'previous') navigateWithinScope(-1);
    if (event.detail.direction === 'next') navigateWithinScope(1);
  });
  canvasBinding = window.MockupCanvasInput(elements.viewport, handleCanvasInput, {
    isBlocked: () => window.MockupCodeTools.isBusy() || !pages.length,
    onSpaceChange: (active) => window.MockupCodeTools.setCanvasSpace(active)
  });
  window.addEventListener('mockup-viewer:canvas-input', (event) => handleCanvasInput(event.detail));
  window.addEventListener('mockup-viewer:annotation-layout', (event) => {
    const page = pages[state.index];
    const detail = event.detail;
    if (!page || !detail || detail.pageId !== page.id || !Array.isArray(detail.markers)) return;
    const entries = annotationEntries(page);
    detail.markers.forEach((position) => {
      if (!position || typeof position.visible !== 'boolean') return;
      const entry = entries.find((item) => item.id === position.id && typeof item.targetId === 'string');
      const marker = markerButtons.get(position.id);
      if (!entry || !marker || (position.top !== null && !Number.isFinite(position.top))) return;
      marker.style.top = (position.top === null ? entry.y : position.top) + 'px';
      marker.hidden = !position.visible;
    });
  });
  window.addEventListener('mockup-viewer:document-layout', (event) => {
    const page = pages[state.index];
    const detail = event.detail;
    if (!page || !detail || detail.pageId !== page.id) return;
    if (page.autoHeight && Number.isFinite(detail.height) && detail.height > 0) {
      page.documentHeight = Math.max(Number(page.height) || 1, detail.height);
      applyZoom(state.zoom);
      const dimensions = pageDimensions();
      $('artboard-size').textContent = dimensions.width + ' × ' + dimensions.height;
    }
    if (!detail.anchor) return;
    if (detail.anchor.id !== routeFromHash().anchor) return;
    if (!Number.isFinite(detail.anchor.top)) {
      $('viewer-status').textContent = '연결된 문서 항목을 찾을 수 없습니다.';
      return;
    }
    const artboard = elements.artboard.getBoundingClientRect();
    const viewport = elements.viewport.getBoundingClientRect();
    elements.viewport.scrollTop = Math.max(0, elements.viewport.scrollTop + artboard.top - viewport.top + detail.anchor.top * state.zoom - 24);
    $('viewer-status').textContent = page.title + ' | ' + detail.anchor.title + ' 항목으로 이동했습니다.';
  });
  window.addEventListener('mockup-viewer:canvas-space', (event) => {
    canvasBinding.setSpace(event.detail.active === true);
  });
  window.addEventListener('mockup-viewer:canvas-reset', () => {
    canvasBinding.reset();
    elements.viewport.classList.remove('is-panning');
  });
  let resizeFrame;
  function onResize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { if (state.fit) fitCanvas(); });
  }
  if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(elements.viewport);
  else window.addEventListener('resize', onResize);

  if (pages.length) {
    renderPage(indexFromHash());
  } else {
    elements.stack.hidden = true;
    $('empty-state').hidden = false;
    $('page-title').textContent = '화면 목록';
    $('previous-page').disabled = true;
    $('next-page').disabled = true;
    ['toggle-annotations', 'zoom-out', 'zoom-in', 'zoom-reset', 'zoom-fit'].forEach((id) => { $(id).disabled = true; });
  }
})();
