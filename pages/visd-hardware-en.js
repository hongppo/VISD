(() => {
  const documentData = {
  "title": "하드웨어(영문)",
  "url": "https://www.global-visd.com/en/hardware/",
  "sections": [
    {
      "name": "",
      "originalText": "",
      "originalHtml": "",
      "revisedText": "",
      "revisedHtml": ""
    }
  ]
};

  document.querySelector('[data-page="title"]').textContent = documentData.title;
  document.querySelector('[data-page="url"]').textContent = documentData.url;
  const status = document.getElementById('copy-status');
  document.querySelectorAll('.section-pair').forEach((pair, index) => {
    const section = documentData.sections[index];
    pair.querySelector('[data-field="section-name"]').textContent = section.name;
    pair.querySelector('[data-field="original-text"]').textContent = section.originalText;
    pair.querySelector('[data-field="original-html"]').textContent = section.originalHtml;
    pair.querySelector('[data-field="revised-text"]').textContent = section.revisedText;
    pair.querySelector('[data-field="revised-html"]').textContent = section.revisedHtml;
    pair.querySelector('.original').classList.toggle('has-revision', !!(section.revisedText.trim() || section.revisedHtml.trim()));
    pair.querySelectorAll('[data-copy]').forEach(button => {
      const values = {
        original: section.originalHtml,
        revised: section.revisedHtml,
        'original-text': section.originalText,
        'revised-text': section.revisedText
      };
      const value = values[button.dataset.copy];
      const label = button.dataset.copy.endsWith('-text') ? '텍스트' : 'HTML';
      button.disabled = !value.trim();
      button.addEventListener('click', async () => {
        if (!value.trim()) return;
        const buffer = document.createElement('textarea');
        buffer.value = value;
        buffer.setAttribute('aria-hidden', 'true');
        buffer.style.position = 'fixed';
        buffer.style.opacity = '0';
        document.body.appendChild(buffer);
        buffer.select();
        let copied = false;
        try { copied = document.execCommand('copy'); } catch (_) { /* Try Clipboard API below. */ }
        buffer.remove();
        if (!copied && navigator.clipboard) {
          try { await navigator.clipboard.writeText(value); copied = true; } catch (_) { /* Report failure. */ }
        }
        status.textContent = copied ? (label === '텍스트' ? '텍스트를 복사했습니다.' : 'HTML을 복사했습니다.') : '복사하지 못했습니다. 내용을 선택해 복사해 주세요.';
      });
    });
  });
  // Only overflowing panels capture the wheel; empty panels leave page scrolling available.
  const refreshScrollRegions = () => {
    document.querySelectorAll('.plain-text, .html-code').forEach(panel => {
      panel.toggleAttribute('data-viewer-scroll-region', panel.scrollHeight > panel.clientHeight + 1);
    });
  };
  requestAnimationFrame(refreshScrollRegions);
  window.addEventListener('resize', refreshScrollRegions);
})();
