(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const frame = $('page-frame');
  const dialog = $('code-dialog');
  const target = $('code-target');
  const content = $('code-content');
  const copyStatus = $('code-copy-status');
  const pickButton = $('pick-component');
  const openButton = $('open-code');
  let currentPage = null;
  let source = null;
  let token = '';
  let picking = false;
  let frameReady = false;
  let returnFocus = openButton;
  let requestedAnchor = '';
  let annotationTargets = [];
  let allowedPageIds = new Set();

  function registeredPageIds() {
    const ids = new Set();
    function visit(nodes) {
      (Array.isArray(nodes) ? nodes : []).forEach((node) => {
        if (!node) return;
        if (Array.isArray(node.children)) visit(node.children);
        else if (typeof node.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(node.id) && typeof node.src === 'string') ids.add(node.id);
      });
    }
    visit((window.MOCKUP_VIEWER_MANIFEST || {}).tree);
    return ids;
  }

  // Runs only in the preview frame; never included in copied source.
  function frameBridge(frameToken, componentIDs, bindCanvasInput, annotationTargets, pageIDs) {
    let canvasBlocked = false;
    let canvasInput = null;
    let selecting = false;
    let hovered = null;
    const allowed = new Set(componentIDs);
    const allowedPages = new Set(pageIDs);
    const sampleMimes = {
      csv: 'text/csv',
      pdf: 'application/pdf',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xls: 'application/vnd.ms-excel'
    };
    const style = document.createElement('style');
    style.textContent = 'html.is-pan-ready,html.is-pan-ready *{cursor:grab!important}html.is-panning,html.is-panning *{cursor:grabbing!important;user-select:none!important;-webkit-user-select:none!important}html,body{user-select:text;-webkit-user-select:text}body[data-viewer-picking] [data-component]{cursor:crosshair}[data-viewer-hover]{outline:2px solid #315da7!important;outline-offset:3px!important}';
    document.head.append(style);
    const send = (action, details) => parent.postMessage(Object.assign({
      channel: 'mockup-viewer-frame', token: frameToken, action
    }, details || {}), '*');
    function reportAnnotationLayout() {
      if (!annotationTargets.length) return;
      const markers = annotationTargets.map((entry) => {
        const element = document.getElementById(entry.targetId);
        if (!element) return { id: entry.id, top: null, visible: true };
        const rect = element.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const centerX = rect.left + rect.width / 2;
        const region = element.closest('[data-viewer-scroll-region]');
        const clip = region ? region.getBoundingClientRect() : null;
        const visible = rect.width > 0 && rect.height > 0 && (!clip ||
          (centerY >= clip.top && centerY <= clip.bottom && centerX >= clip.left && centerX <= clip.right));
        return { id: entry.id, top: centerY + window.scrollY, visible };
      });
      send('annotation-layout', { markers });
    }
    let annotationFramePending = false;
    function scheduleAnnotationLayout() {
      if (!annotationTargets.length || annotationFramePending) return;
      annotationFramePending = true;
      requestAnimationFrame(() => { annotationFramePending = false; reportAnnotationLayout(); });
    }
    if (annotationTargets.length) document.addEventListener('scroll', scheduleAnnotationLayout, true);
    function clearHover() {
      if (hovered) hovered.removeAttribute('data-viewer-hover');
      hovered = null;
    }
    function setSelecting(value) {
      selecting = value;
      if (canvasInput) canvasInput.reset();
      document.body.toggleAttribute('data-viewer-picking', selecting);
      clearHover();
    }
    function componentAt(element) {
      const node = element instanceof Element ? element.closest('[data-component]') : null;
      return node && allowed.has(node.getAttribute('data-component')) ? node : null;
    }
    window.addEventListener('message', (event) => {
      const message = event.data;
      if (event.source !== parent || !message || message.channel !== 'mockup-viewer-host' || message.token !== frameToken) return;
      if (message.action === 'pick-mode') setSelecting(message.active === true);
      if (message.action === 'viewport-motion') window.dispatchEvent(new Event('mockup-viewer:viewport-motion'));
      if (message.action === 'canvas-reset') { canvasBlocked = message.blocked === true; if (canvasInput) canvasInput.reset(); }
      if (message.action === 'canvas-space' && canvasInput) canvasInput.setSpace(message.active === true);
      if (message.action === 'document-target') {
        requestAnimationFrame(() => {
          const root = document.querySelector('[data-document-root]');
          const id = typeof message.anchor === 'string' && /^[a-zA-Z0-9_-]+$/.test(message.anchor) ? message.anchor : '';
          const target = root && id ? document.getElementById(id) : null;
          let anchor = id ? { id, top: null } : null;
          if (target && root.contains(target)) {
            document.querySelectorAll('.is-policy-target').forEach((node) => node.classList.remove('is-policy-target'));
            target.classList.add('is-policy-target');
            target.focus({ preventScroll: true });
            anchor = { id, top: target.getBoundingClientRect().top + window.scrollY, title: (target.querySelector('h2,h3,h4') || target).textContent };
          }
          send('document-layout', {
            height: root ? Math.ceil(root.getBoundingClientRect().bottom + window.scrollY) : null,
            anchor
          });
          reportAnnotationLayout();
        });
      }
    });
    document.addEventListener('pointermove', (event) => {
      if (!selecting) return;
      const next = componentAt(event.target);
      if (next === hovered) return;
      clearHover();
      hovered = next;
      if (hovered) hovered.setAttribute('data-viewer-hover', '');
    });
    document.addEventListener('pointerleave', clearHover);
    document.addEventListener('click', (event) => {
      if (selecting) {
        event.preventDefault();
        event.stopPropagation();
        const component = componentAt(event.target);
        if (component) {
          setSelecting(false);
          send('component-selected', { id: component.getAttribute('data-component') });
        }
      } else if (event.target instanceof Element) {
        const dialogOpener = event.target.closest('[data-viewer-dialog]');
        const dialogCloser = event.target.closest('[data-viewer-dialog-close]');
        const pageLink = event.target.closest('[data-viewer-page]');
        const documentLink = event.target.closest('a[href^="#"]');
        const downloadLink = event.target.closest('a[data-document-download]');
        const sampleLink = event.target.closest('a[data-sample-download]');
        if (dialogOpener) {
          event.preventDefault();
          const id = dialogOpener.getAttribute('data-viewer-dialog');
          const previewDialog = typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id) ? document.getElementById(id) : null;
          if (!dialogOpener.disabled && previewDialog && previewDialog.tagName === 'DIALOG' &&
              typeof previewDialog.showModal === 'function' && !previewDialog.open) {
            if (canvasInput) canvasInput.reset();
            previewDialog.showModal();
          }
        } else if (dialogCloser) {
          event.preventDefault();
          const previewDialog = dialogCloser.closest('dialog');
          if (!dialogCloser.disabled && previewDialog && previewDialog.open && typeof previewDialog.close === 'function') previewDialog.close();
        } else if (pageLink) {
          event.preventDefault();
          const pageId = pageLink.getAttribute('data-viewer-page');
          const anchor = pageLink.getAttribute('data-viewer-anchor');
          if (!pageLink.disabled && allowedPages.has(pageId) &&
              (anchor === null || /^[a-zA-Z0-9_-]+$/.test(anchor))) {
            const previewDialog = pageLink.closest('dialog');
            if (previewDialog && previewDialog.open && typeof previewDialog.close === 'function') previewDialog.close();
            const details = { pageId };
            if (anchor !== null) details.anchor = anchor;
            send('page-link', details);
          }
        } else if (downloadLink) {
          const root = document.querySelector('[data-document-root]');
          const href = downloadLink.getAttribute('href') || '';
          const filename = downloadLink.getAttribute('download') || '';
          if (canvasBlocked || !root || !root.contains(downloadLink) || !filename.endsWith('.md') ||
              /[/\\\x00-\x1f]/.test(filename) || !/^data:text\/markdown;charset=utf-8;base64,[A-Za-z0-9+/]*={0,2}$/.test(href)) {
            event.preventDefault();
          }
        } else if (sampleLink) {
          const root = document.querySelector('[data-document-root]');
          const href = sampleLink.getAttribute('href') || '';
          const filename = sampleLink.getAttribute('download') || '';
          const suffix = /^.+\.(csv|pdf|xlsx|xls)$/i.exec(filename);
          const embedded = /^data:([^;,]+);base64,((?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)$/.exec(href);
          if (event.defaultPrevented || canvasBlocked || document.querySelector('dialog[open]') ||
              document.documentElement.classList.contains('is-panning') || !root || !root.contains(sampleLink) ||
              /[/\\\x00-\x1f\x7f]/.test(filename) || !suffix || !embedded ||
              embedded[1] !== sampleMimes[suffix[1].toLowerCase()]) {
            event.preventDefault();
          }
        } else if (documentLink) {
          event.preventDefault();
          const root = document.querySelector('[data-document-root]');
          const anchor = documentLink.getAttribute('href').slice(1);
          const target = /^[a-zA-Z0-9_-]+$/.test(anchor) ? document.getElementById(anchor) : null;
          if (root && root.contains(documentLink) && target && root.contains(target)) {
            send('document-link', { anchor });
          }
        } else if (event.target.closest('a,button')) event.preventDefault();
      }
    }, true);
    document.addEventListener('submit', (event) => event.preventDefault());
    document.addEventListener('keydown', (event) => {
      if (selecting && event.key === 'Escape') {
        event.preventDefault();
        setSelecting(false);
        send('cancel-pick');
        return;
      }
      if (selecting || document.querySelector('dialog[open]') || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target.closest('input,textarea,select,[contenteditable]')) return;
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        send('navigate', { direction: event.key === 'ArrowLeft' ? 'previous' : 'next' });
      }
    });
    if (typeof bindCanvasInput === 'function') {
      canvasInput = bindCanvasInput(document.documentElement, (input) => send('canvas-input', { input }), {
        isBlocked: () => selecting || canvasBlocked || Boolean(document.querySelector('dialog[open]')),
        onSpaceChange: (active) => send('canvas-space', { active })
      });
      window.addEventListener('pagehide', () => canvasInput.destroy());
    }
    send('ready');
    scheduleAnnotationLayout();
  }

  function sendToFrame(action, details) {
    if (!frame.contentWindow || !source) return;
    frame.contentWindow.postMessage(Object.assign({
      channel: 'mockup-viewer-host', token, action
    }, details || {}), '*');
  }
  $('canvas-viewport').addEventListener('scroll', () => sendToFrame('viewport-motion'), { passive: true });
  window.addEventListener('mockup-viewer:canvas-input', event => {
    if (event.detail && ['scroll', 'pan', 'pan-start', 'zoom'].includes(event.detail.kind)) sendToFrame('viewport-motion');
  });
  function resetCanvasInput() {
    sendToFrame('canvas-reset', { blocked: picking || dialog.open });
    window.dispatchEvent(new CustomEvent('mockup-viewer:canvas-reset'));
  }
  function setPicking(active) {
    picking = Boolean(active && source && frameReady && source.components.length);
    pickButton.setAttribute('aria-pressed', String(picking));
    pickButton.querySelector('span').textContent = picking ? '선택 종료' : '컴포넌트 선택';
    $('component-pick-hint').hidden = !picking;
    $('artboard').classList.toggle('is-picking', picking);
    sendToFrame('pick-mode', { active: picking });
    resetCanvasInput();
  }
  function resetCopyStatus() {
    copyStatus.textContent = 'HTML과 CSS가 함께 포함됩니다.';
    copyStatus.classList.remove('copy-error');
  }
  function selectedCode() {
    if (!source) return '';
    if (target.value === 'page') return source.html;
    const component = source.components.find((entry) => 'component:' + entry.id === target.value);
    if (!component) return '';
    return '<style>\n' + component.css.trim() + '\n</style>\n\n' + component.html.trim() + '\n';
  }
  function updateCode() {
    content.value = selectedCode();
    content.scrollTop = 0;
    content.scrollLeft = 0;
    $('copy-code').disabled = !content.value;
    $('select-code').disabled = !content.value;
    resetCopyStatus();
  }
  function closeDialog() {
    if (!dialog.open) return;
    dialog.close();
  }
  function openDialog(componentId, trigger) {
    if (!source) return;
    setPicking(false);
    returnFocus = trigger || openButton;
    target.replaceChildren();
    const pageOption = document.createElement('option');
    pageOption.value = 'page';
    pageOption.textContent = '페이지 전체';
    target.append(pageOption);
    if (source.components.length) {
      const group = document.createElement('optgroup');
      group.label = '컴포넌트';
      source.components.forEach((component) => {
        const option = document.createElement('option');
        option.value = 'component:' + component.id;
        option.textContent = component.title;
        group.append(option);
      });
      target.append(group);
    }
    target.value = componentId ? 'component:' + componentId : 'page';
    if (!target.value) target.value = 'page';
    $('code-context').textContent = currentPage.title;
    updateCode();
    if (!dialog.open) dialog.showModal();
    resetCanvasInput();
    target.focus();
  }
  function selectAllCode(message) {
    content.focus();
    content.select();
    content.setSelectionRange(0, content.value.length);
    copyStatus.textContent = message || '코드가 선택되었습니다. ⌘C 또는 Ctrl+C로 복사하세요.';
  }
  async function copyCode() {
    const code = content.value;
    const pageToken = token;
    if (!code) return;
    let copied = false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(code);
        copied = true;
      } catch (_) {
        // Continue with the local-file compatible selection-based copy.
      }
    }
    if (pageToken !== token || !dialog.open || content.value !== code) return;
    if (!copied) {
      selectAllCode();
      try { copied = document.execCommand('copy') === true; } catch (_) { copied = false; }
    }
    copyStatus.classList.toggle('copy-error', !copied);
    if (copied) {
      copyStatus.textContent = '코드를 복사했습니다.';
      $('copy-code').focus();
    } else {
      selectAllCode('자동 복사가 허용되지 않았습니다. 선택된 코드를 ⌘C 또는 Ctrl+C로 복사하세요.');
    }
  }
  function setPage(page, anchor) {
    if (dialog.open) closeDialog();
    setPicking(false);
    currentPage = page;
    allowedPageIds = registeredPageIds();
    const descriptions = (window.MOCKUP_VIEWER_DESCRIPTIONS || {})[page.id];
    annotationTargets = (Array.isArray(descriptions) ? descriptions : [])
      .filter((entry) => entry && typeof entry.id === 'string' && typeof entry.targetId === 'string' &&
        /^[a-zA-Z0-9_-]+$/.test(entry.targetId) && Number.isFinite(entry.x) && Number.isFinite(entry.y))
      .map((entry) => ({ id: entry.id, targetId: entry.targetId }));
    requestedAnchor = typeof anchor === 'string' && /^[a-zA-Z0-9_-]+$/.test(anchor) ? anchor : '';
    frameReady = false;
    const pagePath = String(page.src || '').replace(/^\.\//, '');
    const registered = (window.MOCKUP_VIEWER_SOURCES || {})[pagePath];
    source = registered && typeof registered.html === 'string' ? {
      html: registered.html,
      components: Array.isArray(registered.components) ? registered.components : []
    } : null;
    token = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    openButton.disabled = !source;
    pickButton.disabled = true;
    openButton.title = source ? '현재 화면의 HTML과 CSS 보기' : '페이지 소스를 생성하면 코드를 볼 수 있습니다.';
    pickButton.title = source && source.components.length ? '화면에서 복사할 컴포넌트 선택' : '이 페이지에 등록된 컴포넌트가 없습니다.';
    content.value = '';
    target.replaceChildren();
    if (!source) return false;
    const bridge = '<script>(' + frameBridge.toString() + ')(' +
      JSON.stringify(token) + ',' + JSON.stringify(source.components.map((item) => item.id)).replace(/</g, '\\u003c') + ',' +
      (typeof window.MockupCanvasInput === 'function' ? '(' + window.MockupCanvasInput.toString() + ')' : 'null') + ',' +
      JSON.stringify(annotationTargets).replace(/</g, '\\u003c') + ',' +
      JSON.stringify(Array.from(allowedPageIds)) + ');</scr' + 'ipt>';
    const preview = /<\/body\s*>/i.test(source.html) ? source.html.replace(/<\/body\s*>/i, () => bridge + '</body>') : source.html + bridge;
    frame.removeAttribute('src');
    frame.srcdoc = preview;
    return true;
  }
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (event.source !== frame.contentWindow || !message || message.channel !== 'mockup-viewer-frame' || message.token !== token || !source) return;
    if (message.action === 'ready') {
      frameReady = true;
      pickButton.disabled = source.components.length === 0;
      resetCanvasInput();
      if (currentPage.autoHeight || requestedAnchor) sendToFrame('document-target', { anchor: requestedAnchor });
    } else if (message.action === 'annotation-layout' && frameReady && Array.isArray(message.markers)) {
      const markers = message.markers.filter((entry) => entry &&
        annotationTargets.some((target) => target.id === entry.id) &&
        (entry.top === null || Number.isFinite(entry.top)) && typeof entry.visible === 'boolean')
        .map((entry) => ({ id: entry.id, top: entry.top, visible: entry.visible }));
      if (markers.length) window.dispatchEvent(new CustomEvent('mockup-viewer:annotation-layout', {
        detail: { pageId: currentPage.id, markers }
      }));
    } else if (message.action === 'document-layout' && frameReady) {
      const height = Number.isFinite(message.height) && message.height > 0 ? message.height : null;
      let anchor = null;
      if (requestedAnchor && message.anchor && message.anchor.id === requestedAnchor) {
        anchor = { id: requestedAnchor,
          top: Number.isFinite(message.anchor.top) && message.anchor.top >= 0 ? message.anchor.top : null,
          title: typeof message.anchor.title === 'string' ? message.anchor.title : requestedAnchor };
      }
      window.dispatchEvent(new CustomEvent('mockup-viewer:document-layout', { detail: { pageId: currentPage.id, height, anchor } }));
    } else if (message.action === 'canvas-space' && typeof message.active === 'boolean' && (!message.active || (!picking && !dialog.open))) {
      window.dispatchEvent(new CustomEvent('mockup-viewer:canvas-space', { detail: { active: message.active } }));
    } else if (message.action === 'canvas-input' && frameReady && !picking && !dialog.open) {
      const input = message.input;
      if (!input || typeof input !== 'object') return;
      let normalized = null;
      if (input.kind === 'zoom' && [input.factor, input.clientX, input.clientY].every(Number.isFinite) && input.factor > 0) {
        const rect = frame.getBoundingClientRect();
        if (!(frame.clientWidth > 0) || !(frame.clientHeight > 0)) return;
        normalized = { kind: 'zoom', factor: input.factor,
          clientX: rect.left + input.clientX * rect.width / frame.clientWidth,
          clientY: rect.top + input.clientY * rect.height / frame.clientHeight };
      } else if (['scroll', 'pan'].includes(input.kind) && [input.deltaX, input.deltaY].every(Number.isFinite)) {
        normalized = { kind: input.kind, deltaX: input.deltaX, deltaY: input.deltaY };
        if (input.kind === 'scroll') normalized.deltaMode = [0, 1, 2].includes(input.deltaMode) ? input.deltaMode : 0;
      } else if (['pan-start', 'pan-end'].includes(input.kind)) {
        normalized = { kind: input.kind };
      }
      if (normalized) window.dispatchEvent(new CustomEvent('mockup-viewer:canvas-input', { detail: normalized }));
    } else if (message.action === 'component-selected' && picking && source.components.some((item) => item.id === message.id)) {
      openDialog(message.id, pickButton);
    } else if (message.action === 'cancel-pick') {
      setPicking(false);
      pickButton.focus();
    } else if (message.action === 'document-link' && frameReady && !picking && !dialog.open &&
        currentPage.autoHeight && typeof message.anchor === 'string' && /^[a-zA-Z0-9_-]+$/.test(message.anchor)) {
      window.dispatchEvent(new CustomEvent('mockup-viewer:document-link', {
        detail: { pageId: currentPage.id, anchor: message.anchor }
      }));
    } else if (message.action === 'page-link' && frameReady && !picking && !dialog.open && allowedPageIds.has(message.pageId)) {
      if (message.anchor !== undefined && (typeof message.anchor !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(message.anchor))) return;
      const detail = { pageId: message.pageId };
      if (message.anchor !== undefined) detail.anchor = message.anchor;
      window.dispatchEvent(new CustomEvent('mockup-viewer:page-link', { detail }));
    } else if (message.action === 'navigate' && !picking && !dialog.open && ['previous', 'next'].includes(message.direction)) {
      window.dispatchEvent(new CustomEvent('mockup-viewer:navigate', { detail: { direction: message.direction } }));
    }
  });
  openButton.addEventListener('click', () => openDialog(null, openButton));
  pickButton.addEventListener('click', () => {
    if (dialog.open) closeDialog();
    setPicking(!picking);
  });
  $('cancel-component-pick').addEventListener('click', () => { setPicking(false); pickButton.focus(); });
  $('close-code').addEventListener('click', closeDialog);
  dialog.addEventListener('close', () => {
    setPicking(false);
    if (returnFocus && !returnFocus.disabled) returnFocus.focus();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog();
  });
  target.addEventListener('change', updateCode);
  $('copy-code').addEventListener('click', copyCode);
  $('select-code').addEventListener('click', () => selectAllCode());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && picking) {
      event.preventDefault();
      setPicking(false);
      pickButton.focus();
    }
  });
  window.MockupCodeTools = {
    setPage,
    isBusy: () => picking || dialog.open,
    setCanvasSpace: (active) => sendToFrame('canvas-space', { active: Boolean(active && !picking && !dialog.open) })
  };
})();
