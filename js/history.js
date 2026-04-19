'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// HISTORY — UNDO / REDO
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_HISTORY = 30;

let undoStack = []; // snapshots, oldest first — pop() = most recent
let redoStack = []; // snapshots displaced by undo — pop() = most recent

// Holds a snapshot taken at the moment the current piece spawned.
// Pushed to undoStack when that piece locks, giving one undo entry per piece.
let _currentSpawnSnapshot = null;

/**
 * snapshotState()
 *
 * Returns a deep copy of the parts of gameState that undo/redo must restore:
 * board, current piece, hold, queue, stats, and spin-detection fields.
 */
function snapshotState() {
  return {
    board:         gameState.board.map(row => [...row]),
    current:       { ...gameState.current },
    hold:          gameState.hold,
    queue:         [...gameState.queue],
    stats:         { ...gameState.stats, spins: { ...gameState.stats.spins } },
    lastAction:    gameState.lastAction,
    lastKickIndex: gameState.lastKickIndex,
  };
}

/**
 * pushHistory()
 *
 * Saves the current state onto the undo stack before an action is applied.
 * Clears the redo stack (a new action invalidates any forward history).
 * Trims the undo stack to MAX_HISTORY entries.
 */
function pushHistory() {
  undoStack.push(snapshotState());
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack = [];
}

/**
 * applySnapshot(snap)
 *
 * Restores gameState from a previously saved snapshot.
 * Deep-copies the snapshot data so the stack entries stay immutable.
 */
function applySnapshot(snap) {
  gameState.board         = snap.board.map(row => [...row]);
  gameState.current       = { ...snap.current };
  gameState.hold          = snap.hold;
  gameState.queue         = [...snap.queue];
  gameState.stats         = { ...snap.stats, spins: { ...snap.stats.spins } };
  gameState.lastAction    = snap.lastAction;
  gameState.lastKickIndex = snap.lastKickIndex;
}

/**
 * undo()
 *
 * Pops the most recent snapshot off the undo stack, pushes the current state
 * onto the redo stack, then restores the popped snapshot.
 */
function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(snapshotState());
  applySnapshot(undoStack.pop());
  // The restored state has a (different) active piece — update the spawn
  // snapshot so lockPiece() records the correct state when it eventually locks.
  _currentSpawnSnapshot = gameState.current.type ? snapshotState() : null;
  render();
  renderPreviews();
  updateStatsDisplay();
}

/**
 * redo()
 *
 * Pops the most recent snapshot off the redo stack, pushes the current state
 * onto the undo stack, then restores the popped snapshot.
 */
function redo() {
  if (redoStack.length === 0) return;
  undoStack.push(snapshotState());
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  applySnapshot(redoStack.pop());
  // Same as undo — refresh spawn snapshot for the newly active piece.
  _currentSpawnSnapshot = gameState.current.type ? snapshotState() : null;
  render();
  renderPreviews();
  updateStatsDisplay();
}

