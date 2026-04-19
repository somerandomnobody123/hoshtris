'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// PAINT TOOLS  (Prompt 18)
// ═══════════════════════════════════════════════════════════════════════════════

let _editorMode       = false;
let _activePaintColor = 0;    // 0-8; matches board cell encoding
let _isPainting       = false;
let _hoverCell        = null; // { col, visRow, boardRow } | null

/**
 * canvasToBoardCell(canvas, clientX, clientY)
 * Converts window-space mouse coords to a board cell.
 * Returns { col, visRow, boardRow } or null if outside the canvas.
 */
function canvasToBoardCell(canvas, clientX, clientY) {
  const rect   = canvas.getBoundingClientRect();
  const cs     = canvas.width / BOARD_COLS;
  const col    = Math.floor((clientX - rect.left)  / cs);
  const visRow = Math.floor((clientY - rect.top)   / cs);
  if (col < 0 || col >= BOARD_COLS || visRow < 0 || visRow >= VISIBLE_ROWS) return null;
  return { col, visRow, boardRow: visRow + HIDDEN_ROWS };
}

/**
 * paintCell(col, boardRow)
 * Writes _activePaintColor to the board at (col, boardRow) and re-renders.
 * No-ops when the cell already holds that value.
 */
function paintCell(col, boardRow) {
  if (gameState.board[boardRow][col] === _activePaintColor) return;
  gameState.board[boardRow][col] = _activePaintColor;
  markDirty();
  render();
}

/**
 * renderPaintHover(ctx, cs)
 * Draws a semi-transparent preview on the hovered cell.
 * Called at the end of render() only when _editorMode is true.
 */
function renderPaintHover(ctx, cs) {
  if (!_hoverCell) return;
  const { col, visRow } = _hoverCell;
  const px = col    * cs;
  const py = visRow * cs;

  ctx.save();
  if (_activePaintColor === 0) {
    // Erase preview: dark veil + white X
    ctx.fillStyle = 'rgba(0,0,0,0.50)';
    ctx.fillRect(px + 1, py + 1, cs - 2, cs - 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + 4,      py + 4);
    ctx.lineTo(px + cs - 4, py + cs - 4);
    ctx.moveTo(px + cs - 4, py + 4);
    ctx.lineTo(px + 4,      py + cs - 4);
    ctx.stroke();
  } else {
    // Color preview: translucent fill in the target color
    ctx.globalAlpha = 0.65;
    ctx.fillStyle   = COLORS[_activePaintColor];
    ctx.fillRect(px + 1, py + 1, cs - 2, cs - 2);
    ctx.globalAlpha = 1;
  }
  // Bright cell border
  ctx.strokeStyle = 'rgba(255,255,255,0.80)';
  ctx.lineWidth   = 1.5;
  ctx.strokeRect(px + 1.5, py + 1.5, cs - 3, cs - 3);
  ctx.restore();
}

// ── Swatch selection ──────────────────────────────────────────────────────────

document.querySelectorAll('.color-swatch').forEach(swatch => {
  swatch.addEventListener('click', () => {
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
    _activePaintColor = +swatch.dataset.color;
  });
});

// ── Canvas paint events ───────────────────────────────────────────────────────

(function wireCanvasPaint() {
  const canvas = document.getElementById('playfield');

  canvas.addEventListener('mousedown', e => {
    if (!_editorMode) return;
    e.preventDefault();
    _isPainting = true;
    // Push undo snapshot once at start of each drag stroke
    pushHistory();
    const cell = canvasToBoardCell(canvas, e.clientX, e.clientY);
    if (cell) paintCell(cell.col, cell.boardRow);
  });

  canvas.addEventListener('mousemove', e => {
    if (!_editorMode) return;
    const cell = canvasToBoardCell(canvas, e.clientX, e.clientY);
    _hoverCell = cell;
    if (_isPainting && cell) paintCell(cell.col, cell.boardRow);
    else render(); // repaint hover highlight even when not painting
  });

  canvas.addEventListener('mouseup', () => { _isPainting = false; if (_editorMode) render(); });

  canvas.addEventListener('mouseleave', () => {
    _isPainting = false;
    _hoverCell  = null;
    render();
  });

  // Prevent context menu interfering with right-click drags
  canvas.addEventListener('contextmenu', e => { if (_editorMode) e.preventDefault(); });
}());

// ── Editor mode enter / exit ──────────────────────────────────────────────────

function enterEditorMode() {
  // Auto-create a bundle if none is loaded, capturing current board state
  if (!BUNDLE_STATE.bundle) {
    const b = new Bundle({ name: 'Untitled Bundle' });
    const pos = new Position({
      name:  'Position 1',
      board: gameState.board.map(row => row.slice()),
      hold:  gameState.hold || '',
      queue: gameState.queue.join(''),
    });
    b.addPosition(pos);
    BUNDLE_STATE.bundle       = b;
    BUNDLE_STATE.currentIndex = 0;
    _activeFilter             = '';
    clearDirty();
    updateFilterDropdown();
    updateNavUI();
  }
  cancelGravity();
  cancelLateral();
  cancelSDF();
  _currentSpawnSnapshot = null; // no piece locking in editor mode
  _editorMode = true;
  document.getElementById('editor-toolbar').style.display    = 'flex';
  document.getElementById('editor-controls').style.display   = 'flex';
  document.getElementById('mode-badge').textContent          = 'Editor';
  document.getElementById('playfield').classList.add('editor-active');
  document.getElementById('btn-editor-toggle').textContent   = 'Player';
  // Ensure the correct swatch reflects the current paint color
  document.querySelectorAll('.color-swatch').forEach(s =>
    s.classList.toggle('active', +s.dataset.color === _activePaintColor)
  );
  syncEditorControls(currentPosition());
}

function exitEditorMode() {
  _editorMode = false;
  _isPainting = false;
  _hoverCell  = null;
  document.getElementById('editor-toolbar').style.display    = 'none';
  document.getElementById('editor-controls').style.display   = 'none';
  document.getElementById('mode-badge').textContent          = 'Player';
  document.getElementById('playfield').classList.remove('editor-active');
  document.getElementById('btn-editor-toggle').textContent   = 'Editor';
  // Re-snapshot the current piece so the first lock back in player mode
  // correctly records the spawn state (board may have been painted in editor)
  _currentSpawnSnapshot = gameState.current.type ? snapshotState() : null;
  scheduleGravity();
  render();
}

document.getElementById('btn-editor-toggle').addEventListener('click', () => {
  if (_editorMode) exitEditorMode(); else enterEditorMode();
});

updateStatsDisplay(); // zero out the HUD before first render
initLayout();        // sizes canvas, calls render() + renderPreviews()
// Note: spawnPiece() is NOT called here — the main menu will be shown first.
// The game starts properly when the user picks a mode (Free Play calls resetGame,
// Play/Edit Bundle calls applyPositionToGame via loadBundle).

// ═══════════════════════════════════════════════════════════════════════════════
// BUNDLE DATA STRUCTURES  (Prompt 16)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * newEmptyBoard()
 * Returns a fresh 24×10 board array filled with 0 (empty).
 * Stored row-major: board[row][col], row 0 = top (hidden zone).
 */
function newEmptyBoard() {
  return Array.from({ length: BOARD_ROWS }, () => new Array(BOARD_COLS).fill(0));
}

/**
 * Position — one puzzle position inside a Bundle.
 *
 *   id         — unique string identifier (Date.now() + random suffix)
 *   name       — human-readable label (e.g. "TST Setup")
 *   board      — 24×10 number array; 0=empty 1=garbage 2-8=piece colors (I…L)
 *   hold       — single char 'I'|'O'|'T'|'S'|'Z'|'J'|'L' or '' for empty
 *   queue      — string of piece chars e.g. "IOTSZJL" (up to ~14 chars)
 *   categories — string[] of tag names e.g. ['t-spin-setup', 'opening']
 *   goal       — free-form instruction string shown to the player
 */
class Position {
  constructor({
    id         = `pos-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name       = 'New Position',
    board      = null,
    hold       = '',
    queue      = '',
    categories = [],
    goal       = '',
  } = {}) {
    this.id         = id;
    this.name       = name;
    this.board      = board ?? newEmptyBoard();
    this.hold       = hold;
    this.queue      = queue;
    this.categories = categories.slice(); // defensive copy
    this.goal       = goal;
  }

  /** Return a deep clone with a brand-new id. */
  clone() {
    return new Position({
      // deliberately omit id so a fresh one is generated
      name:       this.name + ' (copy)',
      board:      this.board.map(row => row.slice()),
      hold:       this.hold,
      queue:      this.queue,
      categories: this.categories.slice(),
      goal:       this.goal,
    });
  }

  /** Serialise to a plain object safe for JSON.stringify. */
  toJSON() {
    return {
      id:         this.id,
      name:       this.name,
      board:      this.board,
      hold:       this.hold,
      queue:      this.queue,
      categories: this.categories,
      goal:       this.goal,
    };
  }

  /** Reconstruct a Position from a plain object (e.g. after JSON.parse). */
  static fromJSON(obj) {
    return new Position(obj);
  }
}

/**
 * Bundle — an ordered collection of Positions with shared metadata.
 *
 *   id          — unique string identifier
 *   name        — bundle display name
 *   description — optional longer description
 *   author      — optional author string
 *   version     — integer, incremented on every save
 *   createdAt   — ISO date string
 *   positions   — Position[] ordered array
 */
class Bundle {
  constructor({
    id          = `bundle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name        = 'New Bundle',
    description = '',
    author      = '',
    version     = 1,
    createdAt   = new Date().toISOString(),
    positions   = [],
  } = {}) {
    this.id          = id;
    this.name        = name;
    this.description = description;
    this.author      = author;
    this.version     = version;
    this.createdAt   = createdAt;
    this.positions   = positions.map(p => (p instanceof Position ? p : Position.fromJSON(p)));
  }

  // ── Accessors ───────────────────────────────────────────────────────────────

  get length() { return this.positions.length; }

  getPosition(index) {
    return this.positions[index] ?? null;
  }

  // ── Mutation helpers ────────────────────────────────────────────────────────

  /**
   * addPosition(pos?, afterIndex?)
   * Appends a new blank Position (or a provided Position instance) after
   * afterIndex. If afterIndex is omitted, appends at the end.
   * Returns the index of the newly inserted position.
   */
  addPosition(pos = null, afterIndex = null) {
    const newPos = pos instanceof Position ? pos : new Position();
    const insertAt = afterIndex !== null
      ? Math.min(afterIndex + 1, this.positions.length)
      : this.positions.length;
    this.positions.splice(insertAt, 0, newPos);
    return insertAt;
  }

  /**
   * removePosition(index)
   * Removes the position at index. Refuses if only one position remains.
   * Returns the removed Position, or null if refused.
   */
  removePosition(index) {
    if (this.positions.length <= 1) return null;
    const [removed] = this.positions.splice(index, 1);
    return removed;
  }

  /**
   * duplicatePosition(index)
   * Inserts a deep clone of position[index] immediately after it.
   * Returns the index of the new copy.
   */
  duplicatePosition(index) {
    const source = this.positions[index];
    if (!source) return null;
    return this.addPosition(source.clone(), index);
  }

  /**
   * reorderPositions(fromIndex, toIndex)
   * Moves the position at fromIndex to toIndex (shifts others accordingly).
   * No-op if indices are out of range or identical.
   */
  reorderPositions(fromIndex, toIndex) {
    const len = this.positions.length;
    if (
      fromIndex < 0 || fromIndex >= len ||
      toIndex   < 0 || toIndex   >= len ||
      fromIndex === toIndex
    ) return;
    const [moved] = this.positions.splice(fromIndex, 1);
    this.positions.splice(toIndex, 0, moved);
  }

  // ── Serialisation ───────────────────────────────────────────────────────────

  toJSON() {
    return {
      id:          this.id,
      name:        this.name,
      description: this.description,
      author:      this.author,
      version:     this.version,
      createdAt:   this.createdAt,
      positions:   this.positions.map(p => p.toJSON()),
    };
  }

  static fromJSON(obj) {
    return new Bundle(obj);
  }
}

// ── Active bundle state ───────────────────────────────────────────────────────

/**
 * BUNDLE_STATE — runtime state for the currently loaded bundle.
 *
 *   bundle        — Bundle instance or null (null = free-play, no bundle loaded)
 *   currentIndex  — index of the active Position within bundle.positions
 */
const BUNDLE_STATE = {
  bundle:       null,
  currentIndex: 0,
};

/**
 * _bundleDirty
 * True when the loaded bundle has been modified since it was last exported or
 * freshly loaded. Cleared by loadBundle() and export handlers; set by any
 * mutation (painting, editor field edits, position management).
 */
let _bundleDirty = false;

function markDirty()  { _bundleDirty = true; }
function clearDirty() { _bundleDirty = false; }

/**
 * confirmDiscardBundle()
 * Returns true if it is safe to replace the current bundle.
 * When the bundle is dirty and editor mode is active it prompts the user;
 * non-editor mode never warns (the bundle hasn't been meaningfully edited).
 */
function confirmDiscardBundle() {
  if (!_bundleDirty || !_editorMode || !BUNDLE_STATE.bundle) return true;
  return confirm(
    `"${BUNDLE_STATE.bundle.name}" has unsaved changes.\n` +
    'Export the bundle first, or click OK to discard your changes.'
  );
}

/** Convenience getter — current Position or null. */
function currentPosition() {
  if (!BUNDLE_STATE.bundle) return null;
  return BUNDLE_STATE.bundle.getPosition(BUNDLE_STATE.currentIndex);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUNDLE NAVIGATION  (Prompt 17)
// ═══════════════════════════════════════════════════════════════════════════════

const KNOWN_CATEGORIES = [
  't-spin-setup', 'all-spin-setup', 'downstack', 'count-to-4',
  'opening', 'midgame', 'c-spin', 'dt-cannon', 'STSD', 'pc-setup',
];

/** Currently selected category filter; '' = show all. */
let _activeFilter = '';

/**
 * filteredIndices()
 * Returns an ordered array of global position indices that match _activeFilter.
 * Empty filter returns all indices.
 */
function filteredIndices() {
  if (!BUNDLE_STATE.bundle) return [];
  return BUNDLE_STATE.bundle.positions.reduce((acc, p, i) => {
    if (!_activeFilter || p.categories.includes(_activeFilter)) acc.push(i);
    return acc;
  }, []);
}

/**
 * updateFilterDropdown()
 * Rebuilds the category <select> from categories present in the bundle,
 * preserving the current selection where possible.
 */
function updateFilterDropdown() {
  const sel    = document.getElementById('filter-input');
  const bundle = BUNDLE_STATE.bundle;
  const prev   = sel.value;

  sel.innerHTML = '<option value="">All Categories</option>';
  if (!bundle) return;

  // Collect unique categories that appear in this bundle, in KNOWN_CATEGORIES order
  const present = new Set();
  bundle.positions.forEach(p => p.categories.forEach(c => present.add(c)));

  // Known-order first, then any extras alphabetically
  const ordered = [
    ...KNOWN_CATEGORIES.filter(c => present.has(c)),
    ...[...present].filter(c => !KNOWN_CATEGORIES.includes(c)).sort(),
  ];

  ordered.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    sel.appendChild(opt);
  });

  sel.value = present.has(prev) ? prev : '';
}

/**
 * updateNavUI()
 * Syncs all navigation controls — indicator text, number input, progress bar,
 * button disabled states, and the filter dropdown — to the current BUNDLE_STATE.
 */
function updateNavUI() {
  const bundle    = BUNDLE_STATE.bundle;
  const indicator = document.getElementById('pos-indicator');
  const posInput  = document.getElementById('pos-input');
  const fill      = document.getElementById('nav-progress-fill');
  const btnIds    = ['nav-first', 'nav-prev', 'nav-next', 'nav-last'];

  if (!bundle) {
    indicator.textContent = '—';
    posInput.value = '';
    posInput.removeAttribute('max');
    fill.style.width = '0%';
    btnIds.forEach(id => { document.getElementById(id).disabled = true; });
    updateFilterDropdown();
    return;
  }

  const indices     = filteredIndices();
  const filteredPos = indices.indexOf(BUNDLE_STATE.currentIndex);
  const display     = filteredPos >= 0 ? filteredPos : 0;
  const total       = indices.length;

  indicator.textContent = total > 0 ? `${display + 1} of ${total}` : '0 of 0';
  posInput.value = total > 0 ? display + 1 : '';
  posInput.max   = total;

  const pct = total > 1 ? (display / (total - 1)) * 100 : (total === 1 ? 100 : 0);
  fill.style.width = pct + '%';

  document.getElementById('nav-first').disabled = display <= 0;
  document.getElementById('nav-prev').disabled  = display <= 0;
  document.getElementById('nav-next').disabled  = display >= total - 1;
  document.getElementById('nav-last').disabled  = display >= total - 1;

  updateFilterDropdown();
}

/**
 * applyPositionToGame(pos)
 * Loads a Position's board, hold, and queue into the live game state.
 * Clears undo/redo, resets stats, and sets bagMode = false so the
 * queue exhausts naturally without auto-refill.
 */
function applyPositionToGame(pos) {
  cancelLateral();
  cancelSDF();
  cancelGravity();
  undoStack = [];
  redoStack = [];
  _currentSpawnSnapshot = null;
  _lockResets = 0;

  gameState.board   = pos.board.map(row => row.slice());
  gameState.hold    = pos.hold || null;
  gameState.queue   = pos.queue.toUpperCase().split('').filter(c => PIECE_TYPES.includes(c));
  gameState.bagMode = false;

  gameState.stats         = { pieces: 0, lines: 0, sent: 0, b2b: 0, combo: 0, spins: {} };
  gameState.current       = { type: null, rotation: 0, col: 0, row: 0 };
  gameState.lastAction    = null;
  gameState.lastKickIndex = -1;

  hideQueueBanner();
  document.getElementById('overlay').classList.remove('visible');
  setGoalDisplay(pos.goal);

  if (gameState.queue.length > 0 || gameState.bagMode) {
    spawnPiece();
  } else if (!_editorMode) {
    showQueueExhausted();
  }
  render();
  renderPreviews();
  updateStatsDisplay();

  if (_editorMode) syncEditorControls(pos);
}

/**
 * navTo(globalIndex)
 * Navigates to the position at globalIndex in the bundle, applies it to the
 * game, and refreshes the nav UI.
 */
function navTo(globalIndex) {
  if (!BUNDLE_STATE.bundle) return;
  const clamped = Math.max(0, Math.min(globalIndex, BUNDLE_STATE.bundle.length - 1));
  BUNDLE_STATE.currentIndex = clamped;
  const pos = currentPosition();
  if (pos) applyPositionToGame(pos);
  updateNavUI();
}

/**
 * loadBundle(bundle)
 * Installs a Bundle as the active bundle, resets filter, and navigates to
 * position 0.
 */
function loadBundle(bundle) {
  BUNDLE_STATE.bundle       = bundle;
  BUNDLE_STATE.currentIndex = 0;
  _activeFilter             = '';
  clearDirty();
  updateFilterDropdown();
  const pos = currentPosition();
  if (pos) applyPositionToGame(pos);
  updateNavUI();
}

// ── Wire navigation controls ──────────────────────────────────────────────────
(function wireNavControls() {
  document.getElementById('nav-first').addEventListener('click', () => {
    const idx = filteredIndices();
    if (idx.length) navTo(idx[0]);
  });
  document.getElementById('nav-last').addEventListener('click', () => {
    const idx = filteredIndices();
    if (idx.length) navTo(idx[idx.length - 1]);
  });
  document.getElementById('nav-prev').addEventListener('click', () => {
    const idx = filteredIndices();
    const fp  = idx.indexOf(BUNDLE_STATE.currentIndex);
    if (fp > 0) navTo(idx[fp - 1]);
  });
  document.getElementById('nav-next').addEventListener('click', () => {
    const idx = filteredIndices();
    const fp  = idx.indexOf(BUNDLE_STATE.currentIndex);
    if (fp >= 0 && fp < idx.length - 1) navTo(idx[fp + 1]);
  });

  // Number input — 1-based display; commit on Enter or blur
  const posInput = document.getElementById('pos-input');
  function commitPosInput() {
    const idx = filteredIndices();
    const n   = parseInt(posInput.value, 10);
    if (!isNaN(n) && n >= 1 && n <= idx.length) {
      navTo(idx[n - 1]);
    } else {
      updateNavUI(); // revert to valid value
    }
  }
  posInput.addEventListener('change', commitPosInput);
  posInput.addEventListener('keydown', e => { if (e.key === 'Enter') commitPosInput(); });

  // Category filter
  document.getElementById('filter-input').addEventListener('change', function () {
    _activeFilter = this.value;
    const idx = filteredIndices();
    if (idx.length && !idx.includes(BUNDLE_STATE.currentIndex)) {
      navTo(idx[0]);
    } else {
      updateNavUI();
    }
  });

  // Initial render — no bundle loaded yet
  updateNavUI();
}());

// ═══════════════════════════════════════════════════════════════════════════════
// POSITION EDITOR  (Prompt 19)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * syncEditorControls(pos)
 * Populates hold-select, queue-input, and goal-input from a Position.
 * Clears all fields when pos is null.
 */
function syncEditorControls(pos) {
  document.getElementById('hold-select').value      = pos ? (pos.hold || '') : '';
  document.getElementById('queue-input').value      = pos ? pos.queue        : '';
  document.getElementById('goal-input').value       = pos ? pos.goal         : '';
  document.getElementById('category-primary').value = pos ? (pos.categories[0] || '') : '';
  document.getElementById('category-sub').value     = pos ? pos.categories.slice(1).join(', ') : '';
}

/**
 * saveCurrentToPosition()
 * Writes live game state (board, hold, queue) and goal-input text into the
 * active Position object. No-op when no position is loaded or not in editor mode.
 */
function saveCurrentToPosition() {
  const pos = currentPosition();
  if (!pos || !_editorMode) return;
  pos.board = gameState.board.map(row => row.slice());
  pos.hold  = gameState.hold || '';
  pos.queue = gameState.queue.join('');
  pos.goal  = document.getElementById('goal-input').value.trim();
  const primary = document.getElementById('category-primary').value.trim();
  const sub     = document.getElementById('category-sub').value.trim();
  const cats    = [];
  if (primary) cats.push(primary);
  sub.split(',').map(s => s.trim()).filter(Boolean).forEach(c => cats.push(c));
  pos.categories = cats;
  markDirty();
}

// ── Auto-save board after each paint stroke ───────────────────────────────────
// The per-cell paint fires render() live; we persist to the Position on mouseup
// (end of drag) and mouseleave so the position isn't written on every pixel.
(function wireEditorPaintSave() {
  const canvas = document.getElementById('playfield');
  canvas.addEventListener('mouseup',    () => { if (_editorMode) saveCurrentToPosition(); });
  canvas.addEventListener('mouseleave', () => { if (_editorMode) saveCurrentToPosition(); });
}());

// ── Hold selector ─────────────────────────────────────────────────────────────
document.getElementById('hold-select').addEventListener('change', function () {
  if (!_editorMode) return;
  gameState.hold = this.value || null;
  renderPreviews();
  saveCurrentToPosition();
});

// ── Queue input ───────────────────────────────────────────────────────────────
document.getElementById('queue-input').addEventListener('input', function () {
  if (!_editorMode) return;
  // Normalise: uppercase, strip non-piece chars
  const cleaned = this.value.toUpperCase().replace(/[^IOTSZJL]/g, '');
  if (this.value !== cleaned) this.value = cleaned;
  gameState.queue = cleaned.split(''); // already validated chars
  renderPreviews();
  saveCurrentToPosition();
});

// ── Goal input ────────────────────────────────────────────────────────────────
document.getElementById('goal-input').addEventListener('input', function () {
  if (!_editorMode) return;
  setGoalDisplay(this.value);
  saveCurrentToPosition();
});

// ═══════════════════════════════════════════════════════════════════════════════
// POSITION MANAGEMENT  (Prompt 20)
// ═══════════════════════════════════════════════════════════════════════════════

// New Position — blank position appended after the current one
document.getElementById('btn-new-pos').addEventListener('click', () => {
  if (!BUNDLE_STATE.bundle) return;
  saveCurrentToPosition();
  const newIdx = BUNDLE_STATE.bundle.addPosition(
    new Position({ name: `Position ${BUNDLE_STATE.bundle.length + 1}` }),
    BUNDLE_STATE.currentIndex
  );
  navTo(newIdx);
});

// Duplicate Position — deep clone inserted immediately after current
document.getElementById('btn-dup-pos').addEventListener('click', () => {
  if (!BUNDLE_STATE.bundle) return;
  saveCurrentToPosition();
  const copyIdx = BUNDLE_STATE.bundle.duplicatePosition(BUNDLE_STATE.currentIndex);
  if (copyIdx !== null) navTo(copyIdx);
});

// Delete Position — requires confirmation; refuses when only one remains
document.getElementById('btn-del-pos').addEventListener('click', () => {
  const bundle = BUNDLE_STATE.bundle;
  if (!bundle) return;
  if (bundle.length <= 1) {
    alert('A bundle must contain at least one position.');
    return;
  }
  if (!confirm('Delete this position? This cannot be undone.')) return;
  markDirty();
  const wasIdx = BUNDLE_STATE.currentIndex;
  bundle.removePosition(wasIdx);
  // Stay at same index if possible, otherwise step back one
  navTo(Math.min(wasIdx, bundle.length - 1));
});

// ═══════════════════════════════════════════════════════════════════════════════
// REORDERING & CATEGORIES  (Prompt 21)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Move Up / Move Down ───────────────────────────────────────────────────────

document.getElementById('btn-move-up').addEventListener('click', () => {
  const bundle = BUNDLE_STATE.bundle;
  if (!bundle || BUNDLE_STATE.currentIndex <= 0) return;
  saveCurrentToPosition();
  const from = BUNDLE_STATE.currentIndex;
  bundle.reorderPositions(from, from - 1);
  BUNDLE_STATE.currentIndex = from - 1;
  updateNavUI();
});

document.getElementById('btn-move-dn').addEventListener('click', () => {
  const bundle = BUNDLE_STATE.bundle;
  if (!bundle || BUNDLE_STATE.currentIndex >= bundle.length - 1) return;
  saveCurrentToPosition();
  const from = BUNDLE_STATE.currentIndex;
  bundle.reorderPositions(from, from + 1);
  BUNDLE_STATE.currentIndex = from + 1;
  updateNavUI();
});

// ── Category inputs ───────────────────────────────────────────────────────────

document.getElementById('category-primary').addEventListener('input', function () {
  if (!_editorMode) return;
  saveCurrentToPosition();
  updateFilterDropdown(); // new category may appear in / disappear from the filter
});

document.getElementById('category-sub').addEventListener('input', function () {
  if (!_editorMode) return;
  saveCurrentToPosition();
  updateFilterDropdown();
});

