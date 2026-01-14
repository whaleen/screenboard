import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { Manifest } from "./manifest";
import { writeJson } from "./utils";

export async function writeManifest(outDir: string, manifest: Manifest) {
  await writeJson(join(outDir, "manifest.json"), manifest);
}

export async function writeViewer(outDir: string, manifest?: Manifest) {
  const html = buildViewerHtml(manifest);
  await writeFile(join(outDir, "index.html"), html, "utf8");
}

function buildViewerHtml(manifest?: Manifest) {
  const embeddedManifest = manifest
    ? `<script>window.__screenboardManifest = ${JSON.stringify(manifest).replace(/<\\//g, "<\\\\/")};</script>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Screenboard</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Spline+Sans+Mono:wght@400;600&display=swap');
    :root {
      --bg: #f7f5ef;
      --ink: #1d1a16;
      --muted: #6b655d;
      --accent: #ff8a3d;
      --panel: #ffffff;
      --border: #e3ddd3;
      --shadow: 0 20px 40px rgba(28, 22, 14, 0.12);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Space Grotesk', system-ui, sans-serif;
      color: var(--ink);
      background: radial-gradient(circle at top, #fff8ea 0%, #f3efe5 60%, #ece6db 100%);
      min-height: 100vh;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 20;
      backdrop-filter: blur(12px);
      background: rgba(247, 245, 239, 0.9);
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 16px;
      justify-content: space-between;
    }
    header h1 {
      margin: 0;
      font-size: 20px;
      letter-spacing: 0.02em;
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
    }
    .controls input,
    .controls select,
    .controls button {
      font-family: 'Spline Sans Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--panel);
      color: var(--ink);
    }
    .controls button {
      cursor: pointer;
      border: 1px solid var(--accent);
      background: var(--accent);
      color: #fff;
      font-weight: 600;
    }
    #board {
      position: relative;
      height: calc(100vh - 90px);
      overflow: hidden;
    }
    #content {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: 0 0;
    }
    .card {
      position: absolute;
      background: var(--panel);
      border-radius: 14px;
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
      padding: 12px;
      width: max-content;
    }
    .card img {
      display: block;
      border-radius: 10px;
      max-width: 100%;
    }
    .card h3 {
      margin: 0 0 6px;
      font-size: 14px;
    }
    .card small {
      display: block;
      color: var(--muted);
      font-size: 12px;
    }
    .card .actions {
      margin-top: 8px;
      display: flex;
      gap: 8px;
    }
    .card a {
      font-size: 12px;
      color: var(--ink);
      text-decoration: none;
      border: 1px solid var(--border);
      padding: 4px 8px;
      border-radius: 6px;
      background: #f9f6f0;
    }
    .empty {
      padding: 40px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <header>
    <h1>Screenboard</h1>
    <div class="controls">
      <input id="search" placeholder="Search screens" />
      <select id="viewportFilter"><option value="">All viewports</option></select>
      <select id="stateFilter"><option value="">All states</option></select>
      <button id="reset">Reset view</button>
    </div>
  </header>
  <div id="board">
    <div id="content"></div>
  </div>
  ${embeddedManifest}
  <script>
    const state = {
      scale: 0.8,
      offsetX: 40,
      offsetY: 40,
      dragging: false,
      lastX: 0,
      lastY: 0,
      screens: []
    };

    const content = document.getElementById('content');
    const board = document.getElementById('board');
    const search = document.getElementById('search');
    const viewportFilter = document.getElementById('viewportFilter');
    const stateFilter = document.getElementById('stateFilter');
    const reset = document.getElementById('reset');

    function applyTransform() {
      content.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px) scale(${state.scale})`;
    }

    function layoutScreens(screens) {
      const spacing = 120;
      let y = 0;
      const byViewport = {};
      screens.forEach((screen) => {
        byViewport[screen.viewportId] = byViewport[screen.viewportId] || [];
        byViewport[screen.viewportId].push(screen);
      });
      Object.values(byViewport).forEach((group) => {
        let x = 0;
        group.forEach((screen) => {
          screen.x = x;
          screen.y = y;
          x += screen.width + spacing;
        });
        const maxHeight = Math.max(...group.map((screen) => screen.height));
        y += maxHeight + spacing;
      });
    }

    function renderScreens() {
      content.innerHTML = '';
      const query = search.value.trim().toLowerCase();
      const viewportValue = viewportFilter.value;
      const stateValue = stateFilter.value;
      const visible = state.screens.filter((screen) => {
        const urlText = (screen.url || '').toLowerCase();
        const matchesQuery = !query || screen.name.toLowerCase().includes(query) || urlText.includes(query);
        const matchesViewport = !viewportValue || screen.viewportId === viewportValue;
        const matchesState = !stateValue || screen.stateId === stateValue;
        return matchesQuery && matchesViewport && matchesState;
      });

      if (!visible.length) {
        content.innerHTML = '<div class="empty">No screens match your filters.</div>';
        return;
      }

      layoutScreens(visible);

      visible.forEach((screen) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.left = `${screen.x}px`;
        card.style.top = `${screen.y}px`;
        card.innerHTML = `
          <h3>${screen.name}</h3>
          <small>${screen.viewportId} • ${screen.stateId}</small>
          <img src="${screen.image}" width="${screen.width}" height="${screen.height}" />
          <div class="actions">
            <a href="${screen.image}" target="_blank">Open image</a>
            ${screen.url ? `<a href="${screen.url}" target="_blank">Open live</a>` : ''}
          </div>
        `;
        content.appendChild(card);
      });
    }

    function bindPanZoom() {
      board.addEventListener('pointerdown', (event) => {
        state.dragging = true;
        state.lastX = event.clientX;
        state.lastY = event.clientY;
      });
      board.addEventListener('pointerup', () => {
        state.dragging = false;
      });
      board.addEventListener('pointerleave', () => {
        state.dragging = false;
      });
      board.addEventListener('pointermove', (event) => {
        if (!state.dragging) return;
        const dx = event.clientX - state.lastX;
        const dy = event.clientY - state.lastY;
        state.offsetX += dx;
        state.offsetY += dy;
        state.lastX = event.clientX;
        state.lastY = event.clientY;
        applyTransform();
      });

      board.addEventListener('wheel', (event) => {
        event.preventDefault();
        const delta = event.deltaY > 0 ? -0.08 : 0.08;
        const nextScale = Math.min(2, Math.max(0.2, state.scale + delta));
        state.scale = nextScale;
        applyTransform();
      }, { passive: false });
    }

    async function init() {
      const manifest = window.__screenboardManifest ? window.__screenboardManifest : await (await fetch('manifest.json')).json();
      document.querySelector('h1').textContent = manifest.title || 'Screenboard';
      state.screens = manifest.screens || [];
      (manifest.viewports || []).forEach((viewport) => {
        const option = document.createElement('option');
        option.value = viewport.id;
        option.textContent = viewport.name;
        viewportFilter.appendChild(option);
      });
      (manifest.states || []).forEach((stateItem) => {
        const option = document.createElement('option');
        option.value = stateItem.id;
        option.textContent = stateItem.name;
        stateFilter.appendChild(option);
      });
      renderScreens();
      applyTransform();
    }

    search.addEventListener('input', renderScreens);
    viewportFilter.addEventListener('change', renderScreens);
    stateFilter.addEventListener('change', renderScreens);
    reset.addEventListener('click', () => {
      state.scale = 0.8;
      state.offsetX = 40;
      state.offsetY = 40;
      applyTransform();
    });

    bindPanZoom();
    init();
  </script>
</body>
</html>`;
}
