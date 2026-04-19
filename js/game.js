'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════════════════════
//
// current  – active falling piece
//   .type      piece type char ('I','O','T','S','Z','J','L') or null
//   .rotation  state index 0-3
//   .col       board column of the bounding-box origin
//   .row       board row    of the bounding-box origin
//
// hold     – held piece type char, or null
// queue    – ordered array of upcoming piece type chars
// stats    – per-attempt counters (populated in Prompt 14)

const gameState = {
  board:   createBoard(),
  current: { type: null, rotation: 0, col: 0, row: 0 },
  hold:    null,
  queue:   [],
  stats:   { pieces: 0, lines: 0, sent: 0, b2b: 0, spins: {} },

  // ── Spin-detection helpers ───────────────────────────────────────────────────
  // lastAction    : 'rotate' | 'move' | null  — what the player did last.
  //                 Movements and drops clear spin eligibility; only 'rotate'
  //                 qualifies a lock as a spin.
  // lastKickIndex : index into the kick-table used by the last rotation.
  //                 0 = no offset applied (basic rotation).  >0 = piece was
  //                 displaced by a kick.  -1 = no rotation has occurred yet.
  // lastKick      : actual [dc, dr] offset of the last kick, or null.
  //                 Used to distinguish a CW/CCW "1×2" kick (|dc|=1, |dr|=2)
  //                 that upgrades a T-Spin Mini → full T-Spin.
  lastAction:    null,
  lastKickIndex: -1,
  lastKick:      null,

  // ── Bag-mode flag ──────────────────────────────────────────────────────────────
  // true  = free-play: queue is auto-refilled by the 7-bag randomizer.
  // false = puzzle mode: queue was loaded from a bundle position and exhausts
  //         naturally (lockPiece stops spawning when queue reaches 0).
  bagMode: true,
};

// ═══════════════════════════════════════════════════════════════════════════════
// 7-BAG RANDOMIZER
// ═══════════════════════════════════════════════════════════════════════════════

/** Internal bag buffer — drawn from sequentially, refilled when empty. */
let _bag = [];

/** Fisher-Yates shuffle in place. */
function _shuffleBag(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * drawFromBag()
 *
 * Returns the next piece type from the current bag.  When the bag runs dry a
 * fresh shuffled bag of all 7 types is generated automatically.
 */
function drawFromBag() {
  if (_bag.length === 0) {
    _bag = [...PIECE_TYPES];
    _shuffleBag(_bag);
  }
  return _bag.pop();
}

/**
 * fillQueue()
 *
 * Tops up gameState.queue to at least 5 pieces from the 7-bag.
 * Does nothing when bagMode is false (puzzle / bundle mode), where the queue
 * is pre-loaded from a position and is meant to exhaust naturally.
 */
function fillQueue() {
  if (!gameState.bagMode) return;
  while (gameState.queue.length < 5) gameState.queue.push(drawFromBag());
}

// Initial fill — replaces the fixed two-bag seed used before Prompt 10.
fillQueue();

// ═══════════════════════════════════════════════════════════════════════════════
// PIECE SPAWNING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * spawnPiece(type?)
 *
 * Places a new piece at the top of the board.  If `type` is omitted the next
 * piece is shifted from gameState.queue.
 *
 * Spawn geometry (spawnRow = 3 for every piece):
 *   - The bounding-box origin lands at board row 3 (last hidden row).
 *   - The lowest mino offset in state-0 is dr=1, so the piece's bottom row
 *     sits at board row 4 — the first visible row — appearing at the skyline.
 *   - spawnCol centres each piece horizontally (col 3 for most, col 4 for O).
 *
 * Top-out on spawn overlap is checked in lockPiece() after each placement.
 */
/**
 * setGoalDisplay(text)
 * Updates the goal panel with prominent styling when a goal is set,
 * or a muted placeholder when empty.
 */
function setGoalDisplay(text) {
  const el  = document.getElementById('goal-text');
  const box = document.getElementById('goal-box');
  const has = !!(text && text.trim());
  el.textContent = has ? text : '—';
  el.classList.toggle('empty', !has);
  box.classList.toggle('goal-active', has);
}

/** Show the queue-exhausted banner (player mode only). */
function showQueueExhausted() {
  document.getElementById('queue-banner').classList.add('visible');
}

/** Hide the queue-exhausted banner. */
function hideQueueBanner() {
  document.getElementById('queue-banner').classList.remove('visible');
}

function spawnPiece(type) {
  hideQueueBanner();
  const t   = type ?? gameState.queue.shift();
  fillQueue(); // top up to 5 visible; no-op in puzzle mode (bagMode=false)
  const def = PIECES[t];
  gameState.current = {
    type:     t,
    rotation: 0,
    col:      def.spawnCol,
    row:      def.spawnRow,
  };
  // Fresh piece — clear spin-detection state and lock delay counter
  gameState.lastAction    = null;
  gameState.lastKickIndex = -1;
  gameState.lastKick      = null;
  _lockResets = 0;
  // Snapshot this spawn state; pushed to undoStack when the piece locks
  _currentSpawnSnapshot = snapshotState();
  scheduleGravity();
}

// ═══════════════════════════════════════════════════════════════════════════════
// COLLISION DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * isColliding(col, row, rotation, type)
 *
 * Returns true if placing `type` at board origin (col, row) with `rotation`
 * would overlap a wall, the floor, or any locked cell.
 * board rows < 0 are above the grid (allowed — hidden spawn zone).
 */
function isColliding(col, row, rotation, type) {
  for (const [dc, dr] of PIECES[type].rotations[rotation]) {
    const bc = col + dc;
    const br = row + dr;
    if (bc < 0 || bc >= BOARD_COLS) return true;   // left/right wall
    if (br >= BOARD_ROWS)           return true;   // floor
    if (br >= 0 && gameState.board[br][bc]) return true; // locked cell
    // br < 0 → above the board; permitted during spawn
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GHOST PIECE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * getGhostRow()
 *
 * Walks the current piece downward until the next step would collide.
 * Returns the board row of the lowest valid position (hard-drop destination).
 */
function getGhostRow() {
  const { type, rotation, col, row } = gameState.current;
  let gr = row;
  while (!isColliding(col, gr + 1, rotation, type)) gr++;
  return gr;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOVEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * tryMove(dCol, dRow)
 *
 * Attempts to translate the active piece by (dCol, dRow).
 * Mutates gameState.current on success; leaves it unchanged on collision.
 * Returns true if the move was applied.
 */
function tryMove(dCol, dRow) {
  const { type, rotation, col, row } = gameState.current;
  if (!type) return false;
  const nc = col + dCol;
  const nr = row + dRow;
  if (isColliding(nc, nr, rotation, type)) return false;
  gameState.current.col = nc;
  gameState.current.row = nr;
  gameState.lastAction  = 'move'; // cancels spin eligibility
  return true;
}

/** Shift the active piece one column to the left. */
function moveLeft()  { if (tryMove(-1, 0)) { resetLockDelay(); render(); } }

/** Shift the active piece one column to the right. */
function moveRight() { if (tryMove( 1, 0)) { resetLockDelay(); render(); } }

/**
 * softDrop()
 *
 * Moves the piece down one row. In puzzle mode (0 G) this is purely manual.
 * Does NOT auto-lock on failure — locking only happens via hardDrop() or
 * the gravity timer added in Prompt 7.
 */
function softDrop() { tryMove(0, 1); render(); }

// ═══════════════════════════════════════════════════════════════════════════════
// ROTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * rotatePiece(dir)
 *
 * Attempts to rotate the active piece by `dir` steps (+1 = CW, -1 = CCW).
 *
 * SRS algorithm:
 *   1. Compute target rotation state: newRot = (rot + dir + 4) % 4.
 *   2. Look up the kick table for this piece type and 'from>to' key.
 *   3. Test each [dk, dr] offset in order — apply the first collision-free
 *      position and return true.
 *   4. If every test fails, leave gameState.current unchanged and return false.
 *
 * Writes gameState.lastKickIndex (0 = basic rotation, >0 = kick applied) and
 * gameState.lastAction = 'rotate' so Prompt 12 spin detection has full context.
 *
 * O-piece: symmetric — basic test always passes, no kicks needed.
 * I-piece: uses KICKS_I (placeholder until Prompt 6 fills in the real table).
 * 180°:    separate path added in Prompt 6.
 */
function rotatePiece(dir) {
  const { type, rotation, col, row } = gameState.current;
  if (!type) return false;

  const newRot = (rotation + dir + 4) % 4;
  const key    = `${rotation}>${newRot}`;

  const kicks = type === 'I' ? KICKS_I[key]
              : type === 'O' ? [[0, 0]]
              : KICKS_JLSTZ[key];

  for (let i = 0; i < kicks.length; i++) {
    const [dk, dr] = kicks[i];
    const nc = col + dk;
    const nr = row + dr;
    if (!isColliding(nc, nr, newRot, type)) {
      gameState.current.col      = nc;
      gameState.current.row      = nr;
      gameState.current.rotation = newRot;
      gameState.lastAction       = 'rotate';
      gameState.lastKickIndex    = i;  // 0 = no offset; >0 = kick was needed
      gameState.lastKick         = kicks[i];
      resetLockDelay();
      render();
      return true;
    }
  }

  return false; // all tests failed — rotation rejected, piece unchanged
}

/** Rotate the active piece clockwise (default: Arrow Up). */
function rotateCW()  { rotatePiece(+1); }

/** Rotate the active piece counter-clockwise (default: Z). */
function rotateCCW() { rotatePiece(-1); }

/** Rotate the active piece 180° using SRS+ kick table (default: A). */
function rotate180() {
  const { type, rotation, col, row } = gameState.current;
  if (!type) return false;
  const newRot = (rotation + 2) % 4;
  for (let i = 0; i < KICKS_180.length; i++) {
    const [dk, dr] = KICKS_180[i];
    if (!isColliding(col + dk, row + dr, newRot, type)) {
      gameState.current.col = col + dk;
      gameState.current.row = row + dr;
      gameState.current.rotation = newRot;
      gameState.lastAction = 'rotate';
      gameState.lastKickIndex = i;
      gameState.lastKick    = KICKS_180[i];
      resetLockDelay();
      render();
      return true;
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOLD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * holdPiece()
 *
 * Swaps the active piece with the hold slot (or stashes it if hold is empty).
 * Infinite holds are allowed — there is no "once per spawn" restriction.
 *
 *   Empty hold : current piece → hold, next piece spawns from queue front.
 *   Filled hold : current ↔ hold, swapped piece re-spawns at rotation 0.
 *
 * The swapped-in piece always spawns fresh at its default position so the
 * player has full control immediately.  Top-out is checked after spawn.
 */
function holdPiece() {
  cancelGravity();
  const { type } = gameState.current;
  if (!type) return;

  const prev = gameState.hold; // null if empty

  // Stash current into hold
  gameState.hold    = type;
  gameState.current = { type: null, rotation: 0, col: 0, row: 0 };

  if (prev === null) {
    // Nothing was held — consume next piece from queue
    if (gameState.queue.length === 0) {
      // Undo the stash: can't hold into an empty slot with no queue piece to swap in
      gameState.hold = null;
      spawnPiece(type);
    } else {
      spawnPiece();
    }
  } else {
    // Swap — bring previously held piece into play (no queue consumed)
    spawnPiece(prev);
  }

  const { type: nt, rotation: nr, col: nc, row: nRow } = gameState.current;
  if (isColliding(nc, nRow, nr, nt)) { topOut(); return; }

  render();
  onPieceSpawn();
  renderPreviews();
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOCK, LINE CLEAR & SPAWN
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * clearLines()
 *
 * Filters out every row where all 10 cells are non-zero, then prepends the
 * same number of blank rows at the top to keep the board at BOARD_ROWS tall.
 * Returns the count of lines cleared (0-4).
 */
function clearLines() {
  const remaining = gameState.board.filter(row => row.some(cell => cell === 0));
  const cleared   = BOARD_ROWS - remaining.length;
  if (cleared === 0) return 0;
  for (let i = 0; i < cleared; i++) remaining.unshift(new Array(BOARD_COLS).fill(0));
  gameState.board = remaining;
  return cleared;
}

/**
 * lockPiece()
 *
 * Stamps the active piece's color onto gameState.board, clears full lines,
 * updates stats, then spawns the next piece.
 *
 * Top-out conditions (spec: "piece spawn collision or lock above visible field"):
 *   1. A locked mino lands in the hidden zone (board rows 0-3).
 *   2. The freshly spawned replacement piece immediately collides.
 */
function lockPiece() {
  cancelGravity();
  // Commit the spawn snapshot for this piece to the undo stack,
  // and clear all redo states — placing a piece ends the "future" branch.
  if (_currentSpawnSnapshot) {
    undoStack.push(_currentSpawnSnapshot);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    _currentSpawnSnapshot = null;
  }
  redoStack = [];
  const { type, rotation, col, row } = gameState.current;
  const { rotations, color } = PIECES[type];
  let lockedInHidden = false;

  // Compute movement checks BEFORE stamping — after the piece is on the board
  // its own cells create false collision positives in adjacent-position tests.
  const immobile     = isImmobile(col, row, rotation, type);
  const blockedAbove = isColliding(col, row - 1, rotation, type);

  for (const [dc, dr] of rotations[rotation]) {
    const br = row + dr;
    const bc = col + dc;
    if (br < 0 || br >= BOARD_ROWS || bc < 0 || bc >= BOARD_COLS) continue;
    gameState.board[br][bc] = color;
    if (br < HIDDEN_ROWS) lockedInHidden = true;
  }

  if (lockedInHidden) { topOut(); return; }

  // Detect spin AFTER stamping (T-spin corners see locked neighbours) but
  // BEFORE clearLines() removes rows. gameState.lastAction / lastKickIndex
  // are still set here; they get cleared by the next spawnPiece() call.
  const spin         = detectSpin(type, rotation, col, row, immobile, blockedAbove);
  const linesCleared = clearLines();
  showSpinText(spin, linesCleared, type);

  gameState.stats.pieces++;
  gameState.stats.lines += linesCleared;
  gameState.stats.sent  += processLockStats(type, spin, linesCleared);
  updateStatsDisplay();

  // Clear active piece before spawning so render() shows a clean board
  // if queue is empty (puzzle mode: queue exhausted → stop spawning).
  gameState.current = { type: null, rotation: 0, col: 0, row: 0 };
  if (gameState.queue.length === 0) {
    if (!gameState.bagMode && gameState.hold) {
      // Rescue the hold piece into the queue so play can continue
      gameState.queue = [gameState.hold];
      gameState.hold  = null;
    } else {
      render();
      renderPreviews();
      if (!_editorMode) showQueueExhausted();
      return;
    }
  }

  spawnPiece();
  const { type: nt, rotation: nr, col: nc, row: nRow } = gameState.current;
  if (isColliding(nc, nRow, nr, nt)) { topOut(); return; }

  render();
  onPieceSpawn(); // shift immediately if a lateral key is held with DAS charged
  renderPreviews();
}

/**
 * hardDrop()
 *
 * Teleports the active piece to its ghost position and immediately locks it.
 */
function hardDrop() {
  if (!gameState.current.type) return;
  gameState.current.row = getGhostRow();
  lockPiece();
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOP-OUT & RESET
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * topOut()
 *
 * Clears the active piece, draws the final board state, and shows the
 * "Top Out" overlay. The game is halted until the player resets.
 */
function topOut() {
  cancelGravity();
  gameState.current = { type: null, rotation: 0, col: 0, row: 0 };
  render();
  document.getElementById('overlay-title').textContent = 'Top Out';
  document.getElementById('overlay-sub').textContent   = 'Press R to reset';
  document.getElementById('overlay').classList.add('visible');
}

/**
 * resetGame()
 *
 * Restores everything to initial state and spawns the first piece.
 * Called by the R key or any future "Retry" button.
 */
function resetGame() {
  cancelLateral();
  cancelSDF();
  cancelGravity();
  undoStack = [];
  redoStack = [];
  _currentSpawnSnapshot = null;
  _lockResets = 0;
  gameState.board         = createBoard();
  gameState.current       = { type: null, rotation: 0, col: 0, row: 0 };
  gameState.hold          = null;
  gameState.queue         = [];
  gameState.bagMode       = true;
  gameState.stats         = { pieces: 0, lines: 0, sent: 0, b2b: 0, combo: 0, spins: {} };
  _bag = []; // discard partial bag so next reset starts a fresh shuffle
  fillQueue();
  gameState.lastAction    = null;
  gameState.lastKickIndex = -1;
  gameState.lastKick      = null;
  hideQueueBanner();
  document.getElementById('overlay').classList.remove('visible');
  spawnPiece();
  render();
  renderPreviews();
  updateStatsDisplay();
}

// ═══════════════════════════════════════════════════════════════════════════════
// GRAVITY TIMER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A simple gravity loop: when HANDLING.gravity > 0, the active piece falls
 * one row every (1000/gravity) ms.  Auto-locks when it can no longer fall.
 * Gravity is suspended when the setting is 0 (puzzle / no-gravity mode).
 */
let _gravTimer  = null;
let _lockTimer  = null;
let _lockResets = 0;
const MAX_LOCK_RESETS = 15;

function cancelGravity() {
  if (_gravTimer) { clearTimeout(_gravTimer); _gravTimer = null; }
  // Lock delay is always cancelled alongside gravity
  if (_lockTimer) { clearTimeout(_lockTimer); _lockTimer = null; }
}

/**
 * scheduleLock()
 * Starts (or restarts) the lock delay timer. When it expires the piece locks.
 * Called whenever gravity finds the piece cannot fall. Safe to call repeatedly.
 */
function scheduleLock() {
  if (_lockTimer) { clearTimeout(_lockTimer); _lockTimer = null; }
  if (!gameState.current.type) return;
  if (HANDLING.lockDelay <= 0) { lockPiece(); return; }
  _lockTimer = setTimeout(() => {
    _lockTimer = null;
    if (gameState.current.type) lockPiece();
  }, HANDLING.lockDelay);
}

/**
 * resetLockDelay()
 * Called after a successful lateral move or rotation while the lock delay is
 * counting. Resets the timer up to MAX_LOCK_RESETS times per piece.
 */
function resetLockDelay() {
  if (!_lockTimer) return;               // lock delay not active
  if (!isOnSurface()) {
    // Piece can now fall (e.g. tucked under overhang) — cancel lock and resume gravity
    scheduleGravity();                   // cancelGravity() inside clears _lockTimer
    return;
  }
  if (_lockResets >= MAX_LOCK_RESETS) return; // cap reached — let it expire
  _lockResets++;
  scheduleLock();
}

/**
 * isOnSurface()
 * Returns true when the active piece cannot fall one more row.
 */
function isOnSurface() {
  const { type, rotation, col, row } = gameState.current;
  if (!type) return false;
  return isColliding(col, row + 1, rotation, type);
}

function scheduleGravity() {
  cancelGravity();
  if (HANDLING.gravity <= 0 || !gameState.current.type) return;
  _gravTimer = setTimeout(() => {
    _gravTimer = null;
    if (!gameState.current.type) return;
    if (!tryMove(0, 1)) {
      scheduleLock();     // piece has settled — start lock delay
    } else {
      render();
      scheduleGravity();  // piece fell — schedule next drop
    }
  }, 1000 / HANDLING.gravity);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPIN DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * T_CORNERS — front and back corner offsets for each T rotation state.
 *
 * The T bounding box is 3×3.  All four diagonal corners [0,0],[2,0],[0,2],[2,2]
 * are never occupied by T-piece cells, so they can be checked freely after the
 * piece has already been stamped to the board.
 *
 * "Front" = the two corners in the direction the T bump faces.
 * "Back"  = the two corners on the opposite side.
 *
 * Rotation states:
 *   0 = spawn (bump up)    1 = CW (bump right)
 *   2 = 180° (bump down)   3 = CCW (bump left)
 */
const T_CORNERS = {
  0: { front: [[0,0],[2,0]], back: [[0,2],[2,2]] }, // bump up
  1: { front: [[2,0],[2,2]], back: [[0,0],[0,2]] }, // bump right
  2: { front: [[0,2],[2,2]], back: [[0,0],[2,0]] }, // bump down
  3: { front: [[0,0],[0,2]], back: [[2,0],[2,2]] }, // bump left
};

/**
 * isCornerFilled(bc, br)
 *
 * Returns true if the board cell at (bc, br) is occupied by a wall, the
 * floor, the ceiling, or a locked mino.  Used for all spin corner checks.
 */
function isCornerFilled(bc, br) {
  if (bc < 0 || bc >= BOARD_COLS) return true; // side walls
  if (br < 0 || br >= BOARD_ROWS) return true; // ceiling / floor
  return gameState.board[br][bc] !== 0;
}

/**
 * isImmobile(col, row, rotation, type)
 *
 * Returns true if the piece cannot move left, right, or down from (col, row).
 * Must be called BEFORE the piece is stamped to the board — after stamping,
 * the piece's own cells would cause false collision positives.
 */
function isImmobile(col, row, rotation, type) {
  return isColliding(col - 1, row,     rotation, type) &&
         isColliding(col + 1, row,     rotation, type) &&
         isColliding(col,     row + 1, rotation, type);
}

/**
 * detectTSpin(type, rotation, col, row)
 *
 * Called in lockPiece() after the piece is stamped to the board (so locked
 * neighbours are visible) but before clearLines() removes any rows.
 *
 * Algorithm:
 *   1. Only the T piece qualifies, and only when lastAction === 'rotate'.
 *   2. Count filled corners among all four 3×3 box corners.
 *      Fewer than 3 → no spin.
 *   3. Count filled "front" corners (the two adjacent to the T bump):
 *      - 2 front filled → T-Spin (standard), regardless of kick.
 *      - 1 front filled → T-Spin Mini, UNLESS the "1×2 kick" exception applies:
 *        if the last rotation used a kick with |dc|=1 AND |dr|=2 (the SRS
 *        5th test for CW/CCW, seen in TST and Fin spins), upgrade to standard.
 *
 * Returns 'standard' | 'mini' | null.
 */
function detectTSpin(type, rotation, col, row) {
  if (type !== 'T')                        return null;
  if (gameState.lastAction !== 'rotate')   return null;

  const { front, back } = T_CORNERS[rotation];
  const allCorners = [...front, ...back];
  const filled = allCorners.filter(([dc, dr]) =>
    isCornerFilled(col + dc, row + dr)
  ).length;

  if (filled < 3) return null;

  // 2+ front corners → proper T-spin
  const frontFilled = front.filter(([dc, dr]) =>
    isCornerFilled(col + dc, row + dr)
  ).length;
  if (frontFilled >= 2) return 'standard';

  // 1 front corner → mini, unless a "1×2 kick" was used.
  // The SRS 5th test (last entry, index 4) for CW/CCW always displaces by
  // |dc|=1 and |dr|=2.  We check the actual stored offset so 180° rotations
  // (whose index-4 kick is only [-1,0]) are not incorrectly upgraded.
  const [kdc, kdr] = gameState.lastKick ?? [0, 0];
  const is1x2Kick  = Math.abs(kdc) === 1 && Math.abs(kdr) === 2;
  return is1x2Kick ? 'standard' : 'mini';
}

/**
 * detectSpin(type, rotation, col, row, immobile, blockedAbove)
 *
 * Mode-aware entry point called from lockPiece().
 *
 *   'tspin'   — T-piece only; non-T always null.
 *   'allspin' — Non-T spins return 'standard'. T always uses corner detection.
 *   'allmini' — Non-T spins return 'mini'.   T always uses corner detection.
 *
 * `immobile` and `blockedAbove` must be pre-computed before piece stamping.
 *
 * Returns 'standard' | 'mini' | null.
 */
function detectSpin(type, rotation, col, row, immobile, blockedAbove) {
  // T-piece: always use corner detection unchanged across all modes.
  if (type === 'T') return detectTSpin(type, rotation, col, row);

  // Non-T pieces only qualify in allspin / allmini modes.
  if (SETTINGS.spinMode === 'tspin')     return null;
  if (gameState.lastAction !== 'rotate') return null;
  if (type === 'O')                      return null; // O is symmetric, never a spin

  // Full immobility required: piece must be stuck left, right, down AND up.
  // The upward check filters out pieces that could have been dropped straight
  // in without rotating — a genuine spin-in requires the ceiling/stack above.
  if (!immobile || !blockedAbove) return null;

  if (SETTINGS.spinMode === 'allmini') return 'mini';
  return 'standard'; // allspin
}

/**
 * showSpinText(spin, lines, type)
 *
 * Displays the spin label on the playfield and restarts the fade animation.
 * Label colour matches the spinning piece; label prefix uses the piece letter.
 *
 * Examples: "T-Spin Single", "T-Spin Mini Double", "S-Spin Mini", "I-Spin Single"
 */
function showSpinText(spin, lines, type) {
  if (!spin) return;
  const counts = ['', 'Single', 'Double', 'Triple'];
  const mini   = spin === 'mini' ? ' Mini' : '';
  const count  = lines > 0 ? ' ' + (counts[lines] ?? '') : '';
  const el     = document.getElementById('spin-label');
  el.textContent      = `${type}-Spin${mini}${count}`;
  el.style.color      = `var(--col-${type.toLowerCase()})`;
  el.style.textShadow = `0 0 12px ${COLORS[PIECES[type].color]}88`;
  el.classList.remove('show');
  void el.offsetWidth; // force reflow to restart CSS animation
  el.classList.add('show');
}

