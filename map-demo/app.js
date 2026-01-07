(() => {
  const STORAGE_KEY = 'jp-pref-selected-v1';
  const container = document.getElementById('map-container');
  const tooltip = document.getElementById('tooltip');
  const selectedList = document.getElementById('selectedList');
  const resetBtn = document.getElementById('resetBtn');

  const state = {
    selected: new Set(loadSelected()),
    svgRoot: null,
  };

  // Load and inline the SVG for interactivity
  init();

  async function init() {
    try {
      const resp = await fetch('japan.svg');
      if (!resp.ok) throw new Error(`SVG fetch failed: ${resp.status}`);
      const svgText = await resp.text();
      container.innerHTML = svgText;
      const svg = container.querySelector('svg');
      if (!svg) throw new Error('SVG not found in response.');
      svg.setAttribute('id', 'japanMap');
      state.svgRoot = svg;

      // Make sure the SVG scales responsively
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

      bindPaths();
      renderSelectedList();
    } catch (e) {
      container.innerHTML = `<div style="padding:12px;color:#d32f2f">SVGの読み込みに失敗しました: ${e.message}</div>`;
    }
  }

  function bindPaths() {
    const paths = state.svgRoot.querySelectorAll('path[id]');
    paths.forEach(p => {
      p.tabIndex = 0;
      p.setAttribute('role', 'button');
      p.setAttribute('aria-label', p.id);
      updatePathClass(p);

      p.addEventListener('mouseenter', (ev) => {
        p.classList.add('hovered');
        showTooltip(p.id, ev);
      });
      p.addEventListener('mousemove', (ev) => showTooltip(p.id, ev));
      p.addEventListener('mouseleave', () => {
        p.classList.remove('hovered');
        hideTooltip();
      });
      p.addEventListener('click', () => togglePrefecture(p.id));
      p.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); togglePrefecture(p.id); }
      });
    });

    resetBtn.addEventListener('click', () => {
      state.selected.clear();
      saveSelected();
      paths.forEach(updatePathClass);
      renderSelectedList();
    });
  }

  function togglePrefecture(id) {
    if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
    saveSelected();
    const p = state.svgRoot.getElementById ? state.svgRoot.getElementById(id) : state.svgRoot.querySelector(`#${CSS.escape(id)}`);
    if (p) updatePathClass(p);
    renderSelectedList();
  }

  function updatePathClass(p) {
    const id = p.id;
    if (!id) return;
    p.classList.toggle('selected', state.selected.has(id));
  }

  function renderSelectedList() {
    const items = [...state.selected].sort();
    if (!items.length) {
      selectedList.innerHTML = '<li>なし</li>';
      return;
    }
    selectedList.innerHTML = items.map(id => `
      <li>
        <span>${id}</span>
        <button aria-label="解除" data-id="${id}">解除</button>
      </li>
    `).join('');
    selectedList.querySelectorAll('button[data-id]').forEach(btn => {
      btn.addEventListener('click', () => togglePrefecture(btn.dataset.id));
    });
  }

  function showTooltip(text, ev) {
    const rect = container.getBoundingClientRect();
    tooltip.textContent = text;
    tooltip.style.left = (ev.clientX - rect.left) + 'px';
    tooltip.style.top = (ev.clientY - rect.top) + 'px';
    tooltip.classList.add('show');
  }

  function hideTooltip() {
    tooltip.classList.remove('show');
  }

  function loadSelected() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  function saveSelected() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.selected])); } catch {}
  }
})();
