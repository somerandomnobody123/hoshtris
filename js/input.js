'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// HANDLING SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Configurable handling timings. Prompts 8 and 15 will expose these through the
 * settings UI and persist them to localStorage.
 *
 *   das  — Delayed Auto Shift: ms to hold before lateral auto-repeat begins (17–333 ms).
 *   arr  — Auto Repeat Rate:   ms between each lateral shift once DAS fires (0–83 ms).
 *          0 = instant — piece shifts all the way to the wall in one step.
 *   sdf  — Soft Drop:          ms between each soft-drop step while Down is held.
 *          0 = instant — piece snaps to ghost row on Down press (no lock).
 */
const HANDLING = {
  das:     100,  // ms  Delayed Auto Shift
  arr:     0,    // ms  Auto Repeat Rate  (0 = instant wall-shift)
  dcd:     0,    // ms  Direction Change Delay
  sdf:       0,    // ms  Soft Drop repeat  (0 = instant snap)
  gravity:   0,    // rows/sec  (0 = off)
  lockDelay: 500,  // ms  lock delay after piece lands (0 = instant)
};

(function loadHandling() {
  try {
    const raw = localStorage.getItem('hoshtris-handling');
    if (raw) Object.assign(HANDLING, JSON.parse(raw));
  } catch (_) {}
}());

function saveHandling() {
  localStorage.setItem('hoshtris-handling', JSON.stringify(HANDLING));
}

// ═══════════════════════════════════════════════════════════════════════════════
// GAME SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * SETTINGS — global game-mode toggles persisted to localStorage.
 * Prompt 15 will expose these via the full settings panel UI.
 *
 *   spinMode — controls which pieces qualify for spin bonuses:
 *     'tspin'   T-Spin Only  (default)
 *     'allspin' All-Spin+    (non-T pieces can spin; immobile = Mini)
 *     'allmini' All-Mini+    (all non-T spins are Mini; T-spins keep full damage)
 */
const SETTINGS = {
  spinMode:    'tspin',
  sdPriority:  false,        // true = piece drops to floor before lateral DAS fires
  comboSystem: 'multiplier', // 'multiplier' = TETR.IO style, 'standard' = Guideline flat bonus
};

(function loadSettings() {
  try {
    const raw = localStorage.getItem('hoshtris-settings');
    if (raw) Object.assign(SETTINGS, JSON.parse(raw));
  } catch (_) { /* corrupt storage — keep defaults */ }
}());

function saveSettings() {
  localStorage.setItem('hoshtris-settings', JSON.stringify(SETTINGS));
}

// ═══════════════════════════════════════════════════════════════════════════════
// INPUT STATE
// ═══════════════════════════════════════════════════════════════════════════════

// Cached indicator bar elements (DOM ready because <script> is at end of <body>).
const elDasBar = document.getElementById('das-bar');
const elArrBar = document.getElementById('arr-bar');

/**
 * input — live tracking of held keys and DAS/ARR/SDF timer state.
 *
 *   heldKeys    — Set of currently held KeyboardEvent.code strings.
 *   dasDir      — Active lateral direction: -1 left | 0 none | +1 right.
 *   dasStart    — performance.now() when the current lateral key was first pressed.
 *   dasReady    — true once HANDLING.das has elapsed and auto-repeat has started.
 *   dasTimeout  — setTimeout handle; fires once after HANDLING.das ms.
 *   arrInterval — setInterval handle; fires every HANDLING.arr ms after DAS fires.
 *   sdfInterval — setInterval handle; fires every HANDLING.sdf ms while Down held.
 *   rafId       — requestAnimationFrame handle for DAS bar animation.
 */
const input = {
  heldKeys:    new Set(),
  dasDir:      0,
  dasStart:    0,
  dasReady:    false,
  dasTimeout:  null,
  arrInterval: null,
  sdfInterval: null,
  dcdTimeout:  null, // Direction Change Delay timer
  rafId:       null,
};

// ─── Indicator animation ──────────────────────────────────────────────────────

/**
 * tickIndicators()
 *
 * rAF callback. Runs every frame while a lateral key is held.
 * Fills the DAS bar proportionally until DAS fires, then holds it full
 * and brightens it to signal "auto-repeat active".
 */
function tickIndicators() {
  if (input.dasDir === 0) {
    elDasBar.style.width      = '0%';
    elDasBar.style.background = 'var(--accent)';
    input.rafId = null;
    return;
  }
  if (input.dasReady) {
    elDasBar.style.width      = '100%';
    elDasBar.style.background = '#88aaff'; // brighter: fully charged
  } else {
    const pct = Math.min(100, (performance.now() - input.dasStart) / HANDLING.das * 100);
    elDasBar.style.width      = pct + '%';
    elDasBar.style.background = 'var(--accent)';
  }
  input.rafId = requestAnimationFrame(tickIndicators);
}

/**
 * flashArrBar()
 *
 * Snaps the ARR bar to full width then lets a CSS ease-out transition decay it,
 * producing a quick flash on every repeated lateral shift.
 */
function flashArrBar() {
  elArrBar.style.transition = 'none';
  elArrBar.style.width      = '100%';
  void elArrBar.offsetWidth; // force reflow so the next transition fires
  elArrBar.style.transition = 'width 0.12s ease-out';
  elArrBar.style.width      = '0%';
}

// ─── DAS / ARR helpers ────────────────────────────────────────────────────────

/** Cancel any active DAS timeout, ARR interval, and DCD delay. */
function cancelLateral() {
  if (input.dcdTimeout)  { clearTimeout(input.dcdTimeout);   input.dcdTimeout  = null; }
  if (input.dasTimeout)  { clearTimeout(input.dasTimeout);   input.dasTimeout  = null; }
  if (input.arrInterval) { clearInterval(input.arrInterval); input.arrInterval = null; }
  input.dasDir   = 0;
  input.dasReady = false;
}

/** Fire one lateral shift in dir (-1 or +1). */
function shiftOnce(dir) {
  if (dir < 0) moveLeft(); else moveRight();
}

/**
 * shiftToWall(dir)
 *
 * Shift the active piece all the way to the wall in one synchronous loop.
 * Used when ARR = 0 (instant auto-repeat). Calls render() once after all shifts.
 */
function shiftToWall(dir) {
  let moved = false;
  while (tryMove(dir, 0)) moved = true;
  if (moved) render();
}

/**
 * startDAS(dir)
 *
 * Called on every fresh lateral keydown.
 *   1. Fires an immediate first shift (single-tap responsiveness).
 *   2. Starts the DAS charge animation via rAF.
 *   3. After HANDLING.das ms, either shifts to wall (ARR=0) or starts the ARR
 *      interval for continued timed repeats.
 */
function startDAS(dir) {
  cancelLateral();
  input.dasDir   = dir;
  input.dasStart = performance.now();
  input.dasReady = false;

  // SD Priority: when down is held, snap to ghost before lateral movement starts
  if (SETTINGS.sdPriority && gameState.current.type) {
    const sdCode = KEYBINDS.sd;
    if (sdCode && input.heldKeys.has(sdCode)) {
      gameState.current.row = getGhostRow();
      gameState.lastAction  = 'move';
      render();
    }
  }

  shiftOnce(dir); // immediate first tap

  // Re-apply SDF after the lateral shift so it persists through direction changes
  const _sdCode = KEYBINDS.sd;
  if (_sdCode && input.heldKeys.has(_sdCode)) startSDF();

  if (!input.rafId) input.rafId = requestAnimationFrame(tickIndicators);

  input.dasTimeout = setTimeout(() => {
    input.dasTimeout = null;
    input.dasReady   = true;
    flashArrBar();
    if (HANDLING.arr === 0) {
      shiftToWall(dir);
    } else {
      input.arrInterval = setInterval(() => {
        if (input.dasDir === dir) { shiftOnce(dir); flashArrBar(); }
      }, HANDLING.arr);
    }
  }, HANDLING.das);
}

/**
 * startDASWithDCD(dir)
 *
 * Wraps startDAS with Direction Change Delay (DCD) logic.
 * If DCD > 0 and the opposite direction was already active, we wait
 * HANDLING.dcd ms before committing to the new direction.  If the new key is
 * released within that window nothing happens — avoids accidental over-shoot
 * on fast reversals.  When DCD is 0 (default) this is a direct passthrough.
 */
function startDASWithDCD(dir) {
  if (HANDLING.dcd > 0 && input.dasDir === -dir) {
    cancelLateral();
    input.dcdTimeout = setTimeout(() => {
      input.dcdTimeout = null;
      const code = KEYBINDS[dir < 0 ? 'left' : 'right'];
      if (code && input.heldKeys.has(code)) startDAS(dir);
    }, HANDLING.dcd);
  } else {
    startDAS(dir);
  }
}

/**
 * onPieceSpawn()
 *
 * Called at the end of lockPiece() after a new piece spawns.
 * If a lateral key is still held and DAS is already charged, shifts the new
 * piece immediately so there is no positional lag on fast placements.
 */
function onPieceSpawn() {
  if (input.dasDir !== 0 && input.dasReady) {
    if (HANDLING.arr === 0) shiftToWall(input.dasDir);
    else                    shiftOnce(input.dasDir);
  }
  // Persist soft drop to the new piece if down is still held
  const sdCode = KEYBINDS.sd;
  if (sdCode && input.heldKeys.has(sdCode)) startSDF();
}

// ─── SDF helpers ──────────────────────────────────────────────────────────────

/** Cancel the active SDF interval. */
function cancelSDF() {
  if (input.sdfInterval) { clearInterval(input.sdfInterval); input.sdfInterval = null; }
}

/**
 * startSDF()
 *
 * Called on Down keydown.
 *   SDF = 0 (instant): snaps piece to ghost row without locking.
 *   SDF > 0:           fires softDrop immediately then repeats every HANDLING.sdf ms.
 */
function startSDF() {
  cancelSDF();
  if (!gameState.current.type) return;
  if (HANDLING.sdf === 0) {
    gameState.current.row = getGhostRow();
    gameState.lastAction  = 'move';
    render();
  } else {
    softDrop();
    input.sdfInterval = setInterval(() => {
      if (gameState.current.type) softDrop();
    }, HANDLING.sdf);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// KEYBIND SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The 8 configurable game actions and their default KeyboardEvent.code values.
 * ArrowUp is kept as a non-configurable secondary CW binding (hardwired in keyMap).
 */
const KEYBIND_DEFAULTS = {
  left:  'ArrowLeft',
  right: 'ArrowRight',
  sd:    'ArrowDown',
  hd:    'Space',
  cw:    'KeyX',
  ccw:   'KeyZ',
  r180:  'KeyA',
  hold:  'KeyC',
};

/** Live keybind map — mutated by the settings UI (Prompt 15). */
let KEYBINDS = { ...KEYBIND_DEFAULTS };

// Load persisted keybinds (merge with defaults so any new actions get a fallback).
(function loadKeybinds() {
  try {
    const raw = localStorage.getItem('hoshtris-keybinds');
    if (raw) KEYBINDS = Object.assign({}, KEYBIND_DEFAULTS, JSON.parse(raw));
  } catch (_) { /* corrupt storage — fall back to defaults */ }
}());

/** Persist the current KEYBINDS map to localStorage. */
function saveKeybinds() {
  localStorage.setItem('hoshtris-keybinds', JSON.stringify(KEYBINDS));
}

/**
 * keyMap — reverse lookup: KeyboardEvent.code → action name.
 * Rebuilt whenever a binding changes. ArrowUp is a hardwired secondary CW entry.
 */
let keyMap = {};

function buildKeyMap() {
  keyMap = {};
  for (const [action, code] of Object.entries(KEYBINDS)) {
    if (code) keyMap[code] = action;
  }
  // ArrowUp is a non-configurable secondary CW binding (standard Tetris convention).
  if (!keyMap['ArrowUp']) keyMap['ArrowUp'] = 'cw';
}
buildKeyMap();

/**
 * setKeybind(action, code)
 *
 * Assigns `code` to `action`.  If another action already owns `code` that
 * binding is cleared (last-set wins) and the displaced action name is returned
 * so the UI can show a conflict warning.  Returns null if no conflict.
 */
function setKeybind(action, code) {
  let displaced = null;
  for (const [a, c] of Object.entries(KEYBINDS)) {
    if (c === code && a !== action) {
      KEYBINDS[a] = '';  // clear the conflicting slot
      displaced = a;
      break;
    }
  }
  KEYBINDS[action] = code;
  buildKeyMap();
  saveKeybinds();
  return displaced; // null = no conflict; string = action that lost its key
}

/**
 * getKeybindConflicts()
 *
 * Returns an array of [action, code] pairs where two actions share the same
 * non-empty code.  Used by the settings UI (Prompt 15) to highlight problems.
 */
function getKeybindConflicts() {
  const seen = {};
  const conflicts = [];
  for (const [action, code] of Object.entries(KEYBINDS)) {
    if (!code) continue;
    if (seen[code]) conflicts.push([action, code], [seen[code], code]);
    else seen[code] = action;
  }
  return conflicts;
}

// ═══════════════════════════════════════════════════════════════════════════════
// KEYBOARD LISTENERS
// ═══════════════════════════════════════════════════════════════════════════════

document.addEventListener('keydown', e => {
  // If a keybind is being captured in the settings panel, ignore game input.
  if (_capturingAction) return;

  // Let text inputs (queue-input, goal-input, etc.) handle their own keystrokes.
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  // Ctrl+Z = undo, Ctrl+Y = redo — intercept before the modifier early-return.
  if (e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.code === 'KeyZ') { e.preventDefault(); undo(); return; }
    if (e.code === 'KeyY') { e.preventDefault(); redo(); return; }
    return;
  }
  if (e.metaKey || e.altKey) return;
  if (input.heldKeys.has(e.code)) return; // block browser key-repeat

  const action = keyMap[e.code];

  // KeyR is a non-configurable reset shortcut; all other unbound keys are ignored.
  if (!action && e.code !== 'KeyR') return;

  e.preventDefault();
  input.heldKeys.add(e.code);

  switch (action) {
    case 'left':  startDASWithDCD(-1); break;
    case 'right': startDASWithDCD(+1); break;
    case 'sd':    startSDF();   break;
    case 'hd':    hardDrop();   break;
    case 'cw':    rotateCW();   break;
    case 'ccw':   rotateCCW();  break;
    case 'r180':  rotate180();  break;
    case 'hold':  holdPiece(); break;
    default:
      if (e.code === 'KeyR') {
        if (PUZZLE_STATE.active && PUZZLE_STATE.currentRow) {
          applyPositionToGame(puzzleRowToPosition(PUZZLE_STATE.currentRow)); // retry same puzzle
        } else if (!_editorMode && BUNDLE_STATE.bundle && currentPosition()) {
          applyPositionToGame(currentPosition()); // restart current bundle position
        } else {
          resetGame();
        }
      }
      break;
  }
});

document.addEventListener('keyup', e => {
  input.heldKeys.delete(e.code);

  const action = keyMap[e.code];

  if (action === 'left' || action === 'right') {
    const relDir = action === 'left' ? -1 : +1;
    if (input.dasDir === relDir) {
      cancelLateral();
      // If the opposite direction key is still held, restart DAS for it
      const oppCode = KEYBINDS[relDir < 0 ? 'right' : 'left'];
      if (oppCode && input.heldKeys.has(oppCode)) {
        startDAS(-relDir);
      } else {
        // Kick the rAF loop once more so the bar animates back to 0
        if (!input.rafId) input.rafId = requestAnimationFrame(tickIndicators);
      }
    }
  }

  if (action === 'sd') cancelSDF();
});

