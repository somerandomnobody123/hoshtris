'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// BOARD STATE
// ═══════════════════════════════════════════════════════════════════════════════

/** Returns a fresh empty 24×10 board (all zeros). */
function createBoard() {
  return Array.from({ length: BOARD_ROWS }, () => new Array(BOARD_COLS).fill(0));
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRAWING PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * drawMino(ctx, px, py, cs, colorId)
 *
 * Core drawing primitive. Renders one beveled mino square at pixel (px, py)
 * with side length cs. Uses a 1-px dark border gap + highlight/shadow strips
 * for a clean 3-D look that matches screenshot-realistic Tetris styling.
 */
function drawMino(ctx, px, py, cs, colorId) {
  const base = COLORS[colorId];
  if (!base) return;

  const gap   = 1;                               // inter-cell dark gap
  const bevel = Math.max(1, Math.floor(cs * 0.14)); // highlight/shadow strip width

  // ── Outer gap (1-px dark border) ──────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(px, py, cs, cs);

  // ── Base fill ──────────────────────────────────────────────────────────────
  ctx.fillStyle = base;
  ctx.fillRect(px + gap, py + gap, cs - gap * 2, cs - gap * 2);

  // ── Top-left highlight ─────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.30)';
  // top strip
  ctx.fillRect(px + gap,   py + gap,              cs - gap * 2, bevel);
  // left strip
  ctx.fillRect(px + gap,   py + gap,              bevel,        cs - gap * 2);

  // ── Bottom-right shadow ────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  // bottom strip
  ctx.fillRect(px + gap,            py + cs - gap - bevel, cs - gap * 2, bevel);
  // right strip
  ctx.fillRect(px + cs - gap - bevel, py + gap,            bevel,        cs - gap * 2);
}

/**
 * drawGrid(ctx, cols, rows, cs)
 *
 * Fills the canvas background and draws subtle 0.5-px grid lines for the
 * empty playfield. Called first in every render pass.
 */
function drawGrid(ctx, cols, rows, cs) {
  ctx.fillStyle = '#131318';
  ctx.fillRect(0, 0, cols * cs, rows * cs);

  ctx.strokeStyle = '#1e1e28';
  ctx.lineWidth   = 0.5;

  for (let r = 0; r <= rows; r++) {
    ctx.beginPath();
    ctx.moveTo(0,        r * cs);
    ctx.lineTo(cols * cs, r * cs);
    ctx.stroke();
  }
  for (let c = 0; c <= cols; c++) {
    ctx.beginPath();
    ctx.moveTo(c * cs, 0);
    ctx.lineTo(c * cs, rows * cs);
    ctx.stroke();
  }
}

/**
 * drawCell(ctx, col, row, colorId, cs)
 *
 * Draws one mino at integer grid coordinates (col, row) in canvas space.
 * col 0 = leftmost column, row 0 = topmost visible row.
 */
function drawCell(ctx, col, row, colorId, cs) {
  drawMino(ctx, col * cs, row * cs, cs, colorId);
}

/**
 * drawPiece(ctx, cells, colorId, originCol, originRow, cs)
 *
 * Draws a tetromino onto the main canvas given its mino offsets [dc, dr]
 * relative to an origin grid cell. Used for the active falling piece.
 *
 * @param {Array}  cells      - Array of [dc, dr] offsets (e.g. PIECE_SHAPES.T)
 * @param {number} colorId    - Color index 1-8
 * @param {number} originCol  - Canvas-space column of piece origin
 * @param {number} originRow  - Canvas-space row of piece origin
 * @param {number} cs         - Cell size in pixels
 */
function drawPiece(ctx, cells, colorId, originCol, originRow, cs) {
  for (const [dc, dr] of cells) {
    drawCell(ctx, originCol + dc, originRow + dr, colorId, cs);
  }
}

/**
 * drawMiniPiece(canvas, cells, colorId)
 *
 * Renders a single tetromino centered inside a small preview canvas
 * (used for the hold slot and the 5 next-queue slots).
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Array}  cells    - [col, row] offsets (normalized bounding box)
 * @param {number} colorId  - Color index 1-8, or 0/falsy = empty
 */
function drawMiniPiece(canvas, cells, colorId) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Dark fill matching the mini-canvas-wrap background
  ctx.fillStyle = '#131318';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!colorId || !cells || !cells.length) return;

  const minC  = Math.min(...cells.map(([c]) => c));
  const maxC  = Math.max(...cells.map(([c]) => c));
  const minR  = Math.min(...cells.map(([,r]) => r));
  const maxR  = Math.max(...cells.map(([,r]) => r));
  const spanW = maxC - minC + 1;
  const spanH = maxR - minR + 1;

  // Choose cell size so the piece fits with ~0.5-cell padding on each side
  const cs = Math.floor(Math.min(
    canvas.width  / (spanW + 1),
    canvas.height / (spanH + 1)
  ));

  // Center the piece inside the canvas
  const ox = Math.round((canvas.width  - spanW * cs) / 2) - minC * cs;
  const oy = Math.round((canvas.height - spanH * cs) / 2) - minR * cs;

  for (const [dc, dr] of cells) {
    drawMino(ctx, ox + dc * cs, oy + dr * cs, cs, colorId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RENDER PASSES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * renderGhostPiece(ctx, cs)
 *
 * Draws a landing-preview outline at the hard-drop destination.
 * Rendered before the active piece so the live piece always appears on top.
 * Skipped when the piece is already resting on the stack (ghostRow === current.row).
 */
function renderGhostPiece(ctx, cs) {
  const { type, rotation, col, row } = gameState.current;
  if (!type) return;
  const ghostRow = getGhostRow();
  if (ghostRow === row) return;
  const base  = COLORS[PIECES[type].color];
  const lw    = Math.max(1, Math.round(cs * 0.10));
  const inset = lw / 2 + 1;
  ctx.strokeStyle = base;
  ctx.lineWidth   = lw;
  for (const [dc, dr] of PIECES[type].rotations[rotation]) {
    const br = ghostRow + dr;
    const bc = col + dc;
    if (br < HIDDEN_ROWS || br >= BOARD_ROWS) continue;
    if (bc < 0 || bc >= BOARD_COLS) continue;
    ctx.strokeRect(
      bc * cs + inset,
      (br - HIDDEN_ROWS) * cs + inset,
      cs - inset * 2,
      cs - inset * 2
    );
  }
}

/**
 * renderActivePiece(ctx, cs)
 *
 * Draws the current falling piece over the locked board.
 * Minos whose board row falls inside the hidden zone (rows 0-3) are clipped.
 */
function renderActivePiece(ctx, cs) {
  const { type, rotation, col, row } = gameState.current;
  if (!type) return;
  const { rotations, color } = PIECES[type];
  for (const [dc, dr] of rotations[rotation]) {
    const br = row + dr;
    const bc = col + dc;
    if (br < HIDDEN_ROWS || br >= BOARD_ROWS) continue;
    if (bc < 0 || bc >= BOARD_COLS) continue;
    drawCell(ctx, bc, br - HIDDEN_ROWS, color, cs);
  }
}

/**
 * render()
 *
 * Single entry point for updating the playfield canvas.
 * Pass order: grid background → locked cells → ghost → active piece.
 */
function render() {
  const canvas = document.getElementById('playfield');
  const ctx    = canvas.getContext('2d');
  const cs     = canvas.width / BOARD_COLS;

  drawGrid(ctx, BOARD_COLS, VISIBLE_ROWS, cs);

  for (let r = HIDDEN_ROWS; r < BOARD_ROWS; r++) {
    const cr = r - HIDDEN_ROWS;
    for (let c = 0; c < BOARD_COLS; c++) {
      if (gameState.board[r][c]) drawCell(ctx, c, cr, gameState.board[r][c], cs);
    }
  }

  if (!_isPainting) {
    renderGhostPiece(ctx, cs);
    renderActivePiece(ctx, cs);
  }
  if (_editorMode) renderPaintHover(ctx, cs);
}

/**
 * renderPreviews()
 *
 * Draws hold + 5 next-queue pieces into their mini-canvases.
 * Uses rotation-0 shape from PIECES for previews (auto-centred by drawMiniPiece).
 */
function renderPreviews() {
  const holdCanvas = document.getElementById('hold-canvas');
  const h = gameState.hold;
  drawMiniPiece(holdCanvas,
    h ? PIECES[h].rotations[0] : [],
    h ? PIECES[h].color        : 0
  );

  document.querySelectorAll('.next-canvas').forEach((canvas, i) => {
    const t = gameState.queue[i] || null;
    drawMiniPiece(canvas,
      t ? PIECES[t].rotations[0] : [],
      t ? PIECES[t].color        : 0
    );
  });
}
