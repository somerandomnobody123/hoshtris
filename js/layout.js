'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUT & RESIZE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * initLayout()
 *
 * Calculates the largest integer cell size that fits the available viewport,
 * sizes the playfield canvas to exactly BOARD_COLS×VISIBLE_ROWS cells,
 * then triggers a full render. Re-runs on window resize.
 */
function initLayout() {
  const playfield = document.getElementById('playfield');
  const topbar    = document.getElementById('topbar');
  const editorBar = document.getElementById('editor-toolbar');
  const bundleNav = document.getElementById('bundle-nav');

  function resize() {
    const edH  = editorBar.style.display === 'flex' ? editorBar.offsetHeight : 0;
    const navH = bundleNav.offsetHeight;
    const topH = topbar.offsetHeight;

    // Available space after chrome elements + padding
    const availH = window.innerHeight - topH - edH - navH - 24;
    const availW = window.innerWidth  - 120 * 2 - 12 * 4 - 48;

    // Largest integer cell size that satisfies both constraints
    const cellByH = Math.floor(availH / VISIBLE_ROWS);
    const cellByW = Math.floor(availW / BOARD_COLS);
    const cell    = Math.max(16, Math.min(cellByH, cellByW));

    const W = cell * BOARD_COLS;
    const H = cell * VISIBLE_ROWS;

    playfield.width        = W;
    playfield.height       = H;
    playfield.style.width  = W + 'px';
    playfield.style.height = H + 'px';

    render();
    renderPreviews();
  }

  window.addEventListener('resize', resize);
  resize();
}

// ─── Boot ────────────────────────────────────────────────────────────────────

// ── Settings button / backdrop / Escape wiring ───────────────────────────────
document.getElementById('btn-settings').addEventListener('click', openSettings);
document.getElementById('settings-close-btn').addEventListener('click', closeSettings);
document.getElementById('settings-backdrop').addEventListener('click', e => {
  // Click on the backdrop itself (not the panel) closes the modal
  if (e.target === e.currentTarget) closeSettings();
});
// Escape closes the settings panel (when not capturing — capture intercepts
// Escape first via the capture-phase listener above).
document.addEventListener('keydown', e => {
  if (e.code === 'Escape' &&
      document.getElementById('settings-backdrop').classList.contains('open')) {
    closeSettings();
  }
});

// ── Topbar spin-mode select ───────────────────────────────────────────────────
// Sync spin-mode select to persisted setting, then listen for changes.
// Changes here are also reflected in the settings panel select.
(function initSpinModeSelect() {
  const sel     = document.getElementById('spin-mode-select');
  const settSel = document.getElementById('settings-spin-mode');
  sel.value = SETTINGS.spinMode;
  sel.addEventListener('change', () => {
    SETTINGS.spinMode = sel.value;
    saveSettings();
    if (settSel) settSel.value = sel.value;
  });
}());

