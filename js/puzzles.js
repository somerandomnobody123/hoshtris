'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// PUZZLE DATABASE  (sql.js wrapper)
// ═══════════════════════════════════════════════════════════════════════════════

const PuzzleDB = {
  _db:      null,
  _loading: false,
  _error:   null,

  isReady() { return this._db !== null; },

  async load() {
    if (this._db)     return;
    if (this._loading) return;
    this._loading = true;
    try {
      // Load the WASM binary: try fetch first (HTTP/HTTPS), fall back to base64 embed (file://).
      let wasmBinary = null;
      try {
        const r = await fetch('js/vendor/sql-wasm.wasm');
        if (r.ok) wasmBinary = await r.arrayBuffer();
      } catch (_) {}
      if (!wasmBinary) {
        if (typeof SQL_WASM_B64 === 'undefined') throw new Error('sql-wasm-embed.js not loaded.');
        wasmBinary = _b64ToUint8Array(SQL_WASM_B64).buffer;
      }
      const SQL = await initSqlJs({ wasmBinary });

      let buf = null;

      // Try fetch first (works when served over HTTP/HTTPS).
      try {
        const resp = await fetch('data/puzzles.db');
        if (resp.ok) buf = new Uint8Array(await resp.arrayBuffer());
      } catch (_) { /* blocked on file:// — fall through */ }

      // Fall back to base64 embed (required for file:// protocol).
      if (!buf) {
        if (typeof PUZZLES_DB_B64 === 'undefined') {
          throw new Error('puzzles-embed.js not loaded and fetch() unavailable.');
        }
        buf = _b64ToUint8Array(PUZZLES_DB_B64);
      }

      this._db = new SQL.Database(buf);
    } catch (err) {
      this._error = err.message;
      throw err;
    } finally {
      this._loading = false;
    }
  },

  /** Execute a SELECT and return rows as plain objects. */
  query(sql, params = {}) {
    if (!this._db) throw new Error('DB not loaded');
    const stmt = this._db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  },
};

function _b64ToUint8Array(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUZZLE STATE  (runtime state for random-puzzle mode)
// ═══════════════════════════════════════════════════════════════════════════════

const PUZZLE_STATE = {
  active:       false,
  filteredRows: [],   // array of DB row objects matching current filters
  currentRow:   null,
};

// ═══════════════════════════════════════════════════════════════════════════════
// PUZZLE BROWSER  (open / close / filter UI)
// ═══════════════════════════════════════════════════════════════════════════════

function openPuzzleBrowser() {
  document.getElementById('puzzle-browser').classList.remove('hidden');
  _buildSetupCheckboxes();
  _attachFilterListeners();

  // Load DB and update count; show loading state while waiting.
  const countEl = document.getElementById('pb-count');
  countEl.textContent = 'Loading database…';
  _showPbError(null);
  _setPbActionsEnabled(false);

  PuzzleDB.load()
    .then(() => {
      _setPbActionsEnabled(true);
      updatePuzzleCount();
    })
    .catch(err => {
      _showPbError('Could not load puzzle database: ' + err.message);
    });
}

function closePuzzleBrowser() {
  document.getElementById('puzzle-browser').classList.add('hidden');
  document.getElementById('pb-list-wrap').style.display = 'none';
  document.getElementById('pb-toggle-list').textContent = '▸ Show matching puzzles';
  openMainMenu();
}

// ── Filter listeners (attached once per browser open) ─────────────────────────

let _filterListenersAttached = false;

function _attachFilterListeners() {
  if (_filterListenersAttached) return;
  _filterListenersAttached = true;

  document.getElementById('pb-close-btn').addEventListener('click', closePuzzleBrowser);

  // Re-count on any filter change
  document.getElementById('pb-filters').addEventListener('change', () => {
    updatePuzzleCount();
  });

  // Puzzle list toggle
  document.getElementById('pb-toggle-list').addEventListener('click', togglePuzzleList);

  // Action buttons
  document.getElementById('pb-btn-random').addEventListener('click', () => {
    const rows = _runFilterQuery();
    if (!rows.length) { alert('No puzzles match the current filters.'); return; }
    document.getElementById('puzzle-browser').classList.add('hidden');
    if (_editorMode) exitEditorMode();
    enterPuzzleMode(rows);
  });

  document.getElementById('pb-btn-bundle').addEventListener('click', loadPuzzlesAsBundle);

  // Puzzle nav buttons
  document.getElementById('pb-nav-next').addEventListener('click', nextRandomPuzzle);
  document.getElementById('pb-nav-back').addEventListener('click', () => {
    exitPuzzleMode();
    openPuzzleBrowser();
  });
}

// ── Checkbox builder ──────────────────────────────────────────────────────────

function _buildSetupCheckboxes() {
  const container = document.getElementById('pb-setup-checkboxes');
  if (container.hasChildNodes()) return; // already built

  KNOWN_CATEGORIES.forEach(cat => {
    const label = document.createElement('label');
    label.className = 'pb-check-row';
    const cb = document.createElement('input');
    cb.type  = 'checkbox';
    cb.value = cat;
    cb.dataset.setupCat = cat;
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + cat));
    container.appendChild(label);
  });
}

// ── Count display ─────────────────────────────────────────────────────────────

function updatePuzzleCount() {
  if (!PuzzleDB.isReady()) return;
  const rows    = _runFilterQuery();
  const countEl = document.getElementById('pb-count');
  const toggle  = document.getElementById('pb-toggle-list');

  countEl.textContent = `${rows.length} puzzle${rows.length !== 1 ? 's' : ''} match`;
  toggle.style.display = rows.length > 0 ? 'block' : 'none';

  // If list is currently expanded, refresh it
  if (document.getElementById('pb-list-wrap').style.display !== 'none') {
    _populatePuzzleTable(rows);
  }
}

// ── Puzzle list (expandable) ──────────────────────────────────────────────────

function togglePuzzleList() {
  const wrap   = document.getElementById('pb-list-wrap');
  const toggle = document.getElementById('pb-toggle-list');
  const rows   = _runFilterQuery();

  if (wrap.style.display === 'none') {
    _populatePuzzleTable(rows);
    wrap.style.display   = 'block';
    toggle.textContent   = '▾ Hide puzzle list';
  } else {
    wrap.style.display = 'none';
    toggle.textContent = '▸ Show matching puzzles';
  }
}

function _populatePuzzleTable(rows) {
  const tbody = document.getElementById('pb-puzzle-tbody');
  tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.textContent = r.name;

    const tdDiff = document.createElement('td');
    tdDiff.textContent = r.difficulty + '%';
    tdDiff.style.textAlign = 'center';
    tdDiff.title = _diffLabel(r.difficulty);

    const tdCats = document.createElement('td');
    const cats = JSON.parse(r.setup_types || '[]');
    tdCats.textContent = cats.join(', ') || '—';

    tr.appendChild(tdName);
    tr.appendChild(tdDiff);
    tr.appendChild(tdCats);
    tbody.appendChild(tr);
  });
}

function _diffLabel(d) {
  if (d > 70) return 'Easy';
  if (d >= 40) return 'Medium';
  return 'Hard';
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function _showPbError(msg) {
  const el = document.getElementById('pb-error');
  if (msg) {
    el.textContent = msg;
    el.style.display = 'block';
  } else {
    el.style.display = 'none';
  }
}

function _setPbActionsEnabled(on) {
  ['pb-btn-random', 'pb-btn-bundle'].forEach(id => {
    document.getElementById(id).disabled = !on;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILTER QUERY
// ═══════════════════════════════════════════════════════════════════════════════

function _readFilters() {
  const setupTypes = [...document.querySelectorAll('#pb-setup-checkboxes input:checked')]
    .map(cb => cb.value);
  const spinType = document.querySelector('input[name="pb-spin"]:checked')?.value ?? '';
  const difficulty = document.querySelector('input[name="pb-diff"]:checked')?.value ?? '';
  return { setupTypes, spinType, difficulty };
}

function _runFilterQuery() {
  if (!PuzzleDB.isReady()) return [];
  const { setupTypes, spinType, difficulty } = _readFilters();

  const sql = `
    SELECT * FROM puzzles
    WHERE
      (
        :diff = ''
        OR (:diff = 'easy'   AND difficulty > 70)
        OR (:diff = 'medium' AND difficulty >= 40 AND difficulty <= 70)
        OR (:diff = 'hard'   AND difficulty < 40)
      )
      AND (
        :spin = '' OR spin_type = :spin
      )
      AND (
        :setupCount = 0
        OR EXISTS (
          SELECT 1 FROM json_each(setup_types) je
          WHERE je.value IN (SELECT value FROM json_each(:setupJson))
        )
      )
    ORDER BY difficulty DESC, name ASC
  `;

  return PuzzleDB.query(sql, {
    ':diff':       difficulty,
    ':spin':       spinType,
    ':setupCount': setupTypes.length,
    ':setupJson':  JSON.stringify(setupTypes),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// POSITION CONVERSION
// ═══════════════════════════════════════════════════════════════════════════════

function puzzleRowToPosition(row) {
  return new Position({
    id:         row.id,
    name:       row.name,
    board:      JSON.parse(row.board),
    hold:       row.hold  || '',
    queue:      row.queue || '',
    categories: JSON.parse(row.setup_types || '[]'),
    goal:       row.goal  || '',
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOAD AS BUNDLE
// ═══════════════════════════════════════════════════════════════════════════════

function loadPuzzlesAsBundle() {
  if (!PuzzleDB.isReady()) return;
  const rows = _runFilterQuery();
  if (!rows.length) { alert('No puzzles match the current filters.'); return; }

  const bundle = new Bundle({ name: 'Puzzles' });
  rows.forEach(r => bundle.addPosition(puzzleRowToPosition(r)));

  document.getElementById('puzzle-browser').classList.add('hidden');
  if (_editorMode) exitEditorMode();
  loadBundle(bundle);
  document.getElementById('mode-badge').textContent = 'Player';
}

// ═══════════════════════════════════════════════════════════════════════════════
// RANDOM PUZZLE MODE
// ═══════════════════════════════════════════════════════════════════════════════

function enterPuzzleMode(rows) {
  PUZZLE_STATE.active       = true;
  PUZZLE_STATE.filteredRows = rows.slice();
  PUZZLE_STATE.currentRow   = null;

  document.getElementById('bundle-nav').style.display  = 'none';
  document.getElementById('nav-progress-wrap').style.display = 'none';
  document.getElementById('puzzle-nav').style.display  = 'flex';
  document.getElementById('mode-badge').textContent    = 'Puzzle';

  nextRandomPuzzle();
}

function exitPuzzleMode() {
  PUZZLE_STATE.active       = false;
  PUZZLE_STATE.filteredRows = [];
  PUZZLE_STATE.currentRow   = null;

  document.getElementById('puzzle-nav').style.display         = 'none';
  document.getElementById('bundle-nav').style.display         = 'flex';
  document.getElementById('nav-progress-wrap').style.display  = 'block';
  document.getElementById('mode-badge').textContent           = 'Player';
  document.getElementById('pb-nav-label').textContent         = '';
}

function nextRandomPuzzle() {
  const rows = PUZZLE_STATE.filteredRows;
  if (!rows.length) return;
  const row = rows[Math.floor(Math.random() * rows.length)];
  PUZZLE_STATE.currentRow = row;
  applyPositionToGame(puzzleRowToPosition(row));
  document.getElementById('pb-nav-label').textContent = row.name;
}
