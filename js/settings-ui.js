'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS PANEL CONTROLLER
// ═══════════════════════════════════════════════════════════════════════════════

/** Non-null while waiting for a keypress to assign to a keybind slot. */
let _capturingAction = null;

/**
 * codeToLabel(code)
 *
 * Converts a KeyboardEvent.code string to a compact human-readable label
 * suitable for display on a keybind button.
 */
function codeToLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key'))   return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) {
    return ({ Left: '←', Right: '→', Up: '↑', Down: '↓' })[code.slice(5)] ?? code.slice(5);
  }
  const MAP = {
    Space:        'Space',  Enter:        'Enter',  Tab:          'Tab',
    Backspace:    '⌫',      Escape:       'Esc',    Delete:       'Del',
    Home:         'Home',   End:          'End',    PageUp:       'PgUp',
    PageDown:     'PgDn',   Insert:       'Ins',
    ShiftLeft:    'L⇧',     ShiftRight:   'R⇧',
    ControlLeft:  'L⌃',     ControlRight: 'R⌃',
    AltLeft:      'L⌥',     AltRight:     'R⌥',
    MetaLeft:     'L⌘',     MetaRight:    'R⌘',
    CapsLock:     'Caps',   NumLock:      'NumLk',
    Semicolon:    ';',      Quote:        "'",      Backquote:    '`',
    BracketLeft:  '[',      BracketRight: ']',      Backslash:    '\\',
    Comma:        ',',      Period:       '.',      Slash:        '/',
    Minus:        '-',      Equal:        '=',
  };
  return MAP[code] ?? code;
}

/**
 * syncSettingsUI()
 *
 * Reads the current HANDLING, KEYBINDS, and SETTINGS values and updates every
 * control in the settings panel to match.  Safe to call any time the panel is
 * opened or a value changes externally.
 */
function syncSettingsUI() {
  // ── Sliders ──────────────────────────────────────────────────────────────
  const SLIDER_DEFS = [
    { sl: 'sl-das',  sv: 'sv-das',  val: HANDLING.das,     fmt: v => `${v} ms` },
    { sl: 'sl-arr',  sv: 'sv-arr',  val: HANDLING.arr,     fmt: v => `${v} ms` },
    { sl: 'sl-dcd',  sv: 'sv-dcd',  val: HANDLING.dcd,     fmt: v => v === 0 ? 'Off'     : `${v} ms` },
    { sl: 'sl-sdf',  sv: 'sv-sdf',  val: HANDLING.sdf,     fmt: v => v === 0 ? 'Instant' : `${v} ms` },
    { sl: 'sl-grav', sv: 'sv-grav', val: HANDLING.gravity,   fmt: v => v === 0 ? 'Off'     : `${v} G`  },
    { sl: 'sl-ld',   sv: 'sv-ld',   val: HANDLING.lockDelay, fmt: v => v === 0 ? 'Instant' : `${v} ms` },
  ];
  for (const { sl, sv, val, fmt } of SLIDER_DEFS) {
    document.getElementById(sl).value       = val;
    document.getElementById(sv).textContent = fmt(val);
  }

  // ── Keybind buttons ──────────────────────────────────────────────────────
  document.querySelectorAll('.keybind-btn').forEach(btn => {
    const action = btn.dataset.action;
    btn.textContent = codeToLabel(KEYBINDS[action]);
    btn.classList.remove('capturing', 'conflict');
  });

  // ── Spin mode select ─────────────────────────────────────────────────────
  document.getElementById('settings-spin-mode').value    = SETTINGS.spinMode;
  document.getElementById('settings-sd-priority').value  = SETTINGS.sdPriority ? 'sd' : 'movement';
  document.getElementById('settings-combo-system').value = SETTINGS.comboSystem;
}

/** Open the settings panel and sync all controls to current values. */
function openSettings() {
  syncSettingsUI();
  document.getElementById('settings-backdrop').classList.add('open');
}

/** Close the settings panel, cancelling any in-progress keybind capture. */
function closeSettings() {
  if (_capturingAction) cancelCapture();
  document.getElementById('settings-backdrop').classList.remove('open');
}

/**
 * cancelCapture()
 *
 * Aborts an in-progress keybind capture, restoring the button to its current
 * key label and clearing the capturing state.
 */
function cancelCapture() {
  if (!_capturingAction) return;
  const btn = document.querySelector(`.keybind-btn[data-action="${_capturingAction}"]`);
  if (btn) {
    btn.textContent = codeToLabel(KEYBINDS[_capturingAction]);
    btn.classList.remove('capturing');
  }
  _capturingAction = null;
}

// ── Slider wiring ─────────────────────────────────────────────────────────────
(function wireSliders() {
  const CONFIG = [
    { sl: 'sl-das',  sv: 'sv-das',  key: 'das',     fmt: v => `${v} ms` },
    { sl: 'sl-arr',  sv: 'sv-arr',  key: 'arr',     fmt: v => `${v} ms` },
    { sl: 'sl-dcd',  sv: 'sv-dcd',  key: 'dcd',     fmt: v => v === 0 ? 'Off'     : `${v} ms` },
    { sl: 'sl-sdf',  sv: 'sv-sdf',  key: 'sdf',     fmt: v => v === 0 ? 'Instant' : `${v} ms` },
    { sl: 'sl-grav', sv: 'sv-grav', key: 'gravity',   fmt: v => v === 0 ? 'Off'     : `${v} G`  },
    { sl: 'sl-ld',   sv: 'sv-ld',   key: 'lockDelay', fmt: v => v === 0 ? 'Instant' : `${v} ms` },
  ];
  for (const { sl, sv, key, fmt } of CONFIG) {
    document.getElementById(sl).addEventListener('input', function () {
      const v     = +this.value;
      HANDLING[key] = v;
      document.getElementById(sv).textContent = fmt(v);
      saveHandling();
      // Reapply gravity immediately if the piece is live
      if (key === 'gravity') scheduleGravity();
    });
  }
}());

// ── Keybind capture ───────────────────────────────────────────────────────────

// Clicking a keybind button enters capture mode for that action.
// Clicking it again (while capturing) cancels without assigning.
document.querySelectorAll('.keybind-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (_capturingAction === btn.dataset.action) { cancelCapture(); return; }
    if (_capturingAction) cancelCapture();
    _capturingAction = btn.dataset.action;
    btn.textContent = '…';
    btn.classList.add('capturing');
  });
});

// Capture-phase keydown: runs before the game listener.
// stopImmediatePropagation prevents any other listener (game keydown, etc.)
// from also acting on the captured key.
document.addEventListener('keydown', e => {
  if (!_capturingAction) return;
  e.preventDefault();
  e.stopImmediatePropagation(); // block ALL other keydown listeners

  if (e.code === 'Escape') { cancelCapture(); return; }

  const action    = _capturingAction;
  _capturingAction = null;

  const displaced = setKeybind(action, e.code);
  syncSettingsUI();

  // If another action was displaced, briefly flash its button red
  if (displaced) {
    const lostBtn = document.querySelector(`.keybind-btn[data-action="${displaced}"]`);
    if (lostBtn) {
      lostBtn.classList.add('conflict');
      setTimeout(() => lostBtn.classList.remove('conflict'), 1200);
    }
  }
}, true /* capture phase */);

// ── Settings spin mode ────────────────────────────────────────────────────────

// Changes in the settings spin-mode select are authoritative; also keep the
// in-game topbar spin-mode select in sync (if it exists).
document.getElementById('settings-spin-mode').addEventListener('change', function () {
  SETTINGS.spinMode = this.value;
  saveSettings();
  const gameSel = document.getElementById('spin-mode-select');
  if (gameSel) gameSel.value = this.value;
});

// ── Settings movement priority ────────────────────────────────────────────────
document.getElementById('settings-sd-priority').addEventListener('change', function () {
  SETTINGS.sdPriority = this.value === 'sd';
  saveSettings();
});

// ── Settings combo system ─────────────────────────────────────────────────────
document.getElementById('settings-combo-system').addEventListener('change', function () {
  SETTINGS.comboSystem = this.value;
  saveSettings();
});

