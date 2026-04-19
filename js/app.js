'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// MODE SWITCHING / MAIN MENU  (Prompt 26)
// ═══════════════════════════════════════════════════════════════════════════════

function openMainMenu() {
  document.getElementById('main-menu').classList.remove('hidden');
}

function closeMainMenu() {
  document.getElementById('main-menu').classList.add('hidden');
}

// ── Play Bundle ───────────────────────────────────────────────────────────────
// Opens file picker; on valid load shows the Play-or-Edit dialog.

document.getElementById('mm-btn-play').addEventListener('click', () => {
  if (!confirmDiscardBundle()) return;
  document.getElementById('mm-file-input').value = '';
  document.getElementById('mm-file-input').click();
});

document.getElementById('mm-file-input').addEventListener('change', function () {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    let obj;
    try { obj = JSON.parse(e.target.result); }
    catch (err) {
      closeMainMenu();
      alert(`Could not parse "${file.name}" as JSON.\n${err.message}`);
      openMainMenu();
      return;
    }
    const err = validateBundle(obj);
    if (err) {
      closeMainMenu();
      alert(`Invalid bundle:\n${err}`);
      openMainMenu();
      return;
    }
    // Bundle is valid — close menu and show Play-or-Edit dialog
    closeMainMenu();
    showPlayOrEditDialog(new Bundle(obj));
  };
  reader.onerror = () => alert(`Could not read "${file.name}".`);
  reader.readAsText(file);
});

// ── Edit Bundle ───────────────────────────────────────────────────────────────
// Creates a blank single-position bundle and enters Editor mode immediately.

document.getElementById('mm-btn-edit').addEventListener('click', () => {
  if (!confirmDiscardBundle()) return;
  closeMainMenu();
  if (_editorMode) exitEditorMode();
  const b = new Bundle({ name: 'Untitled Bundle' });
  b.addPosition(new Position({ name: 'Position 1' }));
  loadBundle(b);
  enterEditorMode();
});

// ── Free Play ─────────────────────────────────────────────────────────────────
// Clears any loaded bundle and resets to a standard free-play game.

document.getElementById('mm-btn-free').addEventListener('click', () => {
  if (!confirmDiscardBundle()) return;
  closeMainMenu();
  if (_editorMode) exitEditorMode();
  BUNDLE_STATE.bundle       = null;
  BUNDLE_STATE.currentIndex = 0;
  updateNavUI();
  resetGame(); // blank board, bagMode=true, fresh piece
  setGoalDisplay('');
});

// ── Menu button (topbar) ──────────────────────────────────────────────────────

document.getElementById('btn-menu').addEventListener('click', openMainMenu);

// ── Logo click (topbar) ───────────────────────────────────────────────────────

document.getElementById('topbar-logo').addEventListener('click', () => {
  if (!confirmDiscardBundle()) return;
  openMainMenu();
});

// ── Play-or-Edit dialog ───────────────────────────────────────────────────────

let _poeBundle = null;

function showPlayOrEditDialog(bundle) {
  _poeBundle = bundle;
  const n = bundle.length;
  document.getElementById('poe-msg').textContent =
    `"${bundle.name}" — ${n} position${n !== 1 ? 's' : ''}. How would you like to proceed?`;
  document.getElementById('poe-backdrop').classList.add('open');
}

function closePoeDialog() {
  document.getElementById('poe-backdrop').classList.remove('open');
  _poeBundle = null;
}

document.getElementById('poe-play-btn').addEventListener('click', () => {
  if (!confirmDiscardBundle()) return;
  if (_poeBundle) {
    if (_editorMode) exitEditorMode();
    loadBundle(_poeBundle);
  }
  closePoeDialog();
});

document.getElementById('poe-edit-btn').addEventListener('click', () => {
  if (!confirmDiscardBundle()) return;
  if (_poeBundle) {
    loadBundle(_poeBundle);
    enterEditorMode();
  }
  closePoeDialog();
});

document.getElementById('poe-cancel-btn').addEventListener('click', () => {
  closePoeDialog();
  openMainMenu(); // return to menu if user cancels
});

document.getElementById('poe-backdrop').addEventListener('click', e => {
  if (e.target === document.getElementById('poe-backdrop')) {
    closePoeDialog();
    openMainMenu();
  }
});

// ── About modal ───────────────────────────────────────────────────────────────

function openAbout() {
  document.getElementById('about-backdrop').classList.add('open');
}

function closeAbout() {
  document.getElementById('about-backdrop').classList.remove('open');
}

document.getElementById('mm-btn-about').addEventListener('click', () => {
  openAbout();
});

document.getElementById('about-close-btn').addEventListener('click', closeAbout);
document.getElementById('about-ok-btn').addEventListener('click', closeAbout);

document.getElementById('about-backdrop').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeAbout();
});

// ── Puzzles ───────────────────────────────────────────────────────────────────

document.getElementById('mm-btn-puzzles').addEventListener('click', () => {
  closeMainMenu();
  openPuzzleBrowser();
});

// ── Show main menu on startup ─────────────────────────────────────────────────
openMainMenu();
