'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// TEST PLAY & EXPORT  (Prompt 22)
// ═══════════════════════════════════════════════════════════════════════════════

let _testingFromEditor = false;

/**
 * testPlay()
 * Saves current edits, exits editor mode, and reloads the position fresh so
 * the user gets a clean run from the saved board/hold/queue.
 */
function testPlay() {
  saveCurrentToPosition();
  _testingFromEditor = true;
  exitEditorMode();
  const pos = currentPosition();
  if (pos) applyPositionToGame(pos);
  document.getElementById('btn-return-editor').style.display = '';
  document.getElementById('btn-editor-toggle').style.display = 'none';
}

/**
 * returnToEditor()
 * Returns from test-play back to editor mode at the same position.
 */
function returnToEditor() {
  _testingFromEditor = false;
  document.getElementById('btn-return-editor').style.display = 'none';
  document.getElementById('btn-editor-toggle').style.display = '';
  enterEditorMode();
}

/**
 * downloadJSON(obj, filename)
 * Serialises obj to indented JSON and triggers a file download.
 */
function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Export full bundle ────────────────────────────────────────────────────────
document.getElementById('btn-export').addEventListener('click', () => {
  if (!BUNDLE_STATE.bundle) {
    alert('No bundle loaded. Enter Editor mode to create one.');
    return;
  }
  saveCurrentToPosition();
  const name = BUNDLE_STATE.bundle.name.replace(/\s+/g, '_') || 'bundle';
  downloadJSON(BUNDLE_STATE.bundle.toJSON(), `${name}.hosh`);
  clearDirty();
});

// ── Export single position (wrapped as a one-entry bundle) ────────────────────
document.getElementById('btn-export-pos').addEventListener('click', () => {
  const pos = currentPosition();
  if (!pos) return;
  saveCurrentToPosition();
  const singleBundle = new Bundle({
    name:      `${BUNDLE_STATE.bundle.name} – ${pos.name}`,
    positions: [pos.toJSON()],
  });
  const filename = pos.name.replace(/\s+/g, '_') || 'position';
  downloadJSON(singleBundle.toJSON(), `${filename}.hosh`);
});

// ── Test Play / Return to Editor ──────────────────────────────────────────────
document.getElementById('btn-test-play').addEventListener('click', testPlay);
document.getElementById('btn-return-editor').addEventListener('click', returnToEditor);

// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOT CAPTURE  (Prompt 24)
// ═══════════════════════════════════════════════════════════════════════════════

const SS_CS        = 32;                        // cell size in screenshot px
const SS_PANEL_W   = Math.round(SS_CS * 3);     // side panel width  (96 px)
const SS_GAP       = 4;                         // gap between panel and playfield
const SS_PF_W      = BOARD_COLS  * SS_CS;       // playfield width   (320 px)
const SS_PF_H      = VISIBLE_ROWS * SS_CS;      // playfield height  (640 px)
const SS_TOTAL_W   = SS_PANEL_W + SS_GAP + SS_PF_W + SS_GAP + SS_PANEL_W; // 520 px
const SS_TOTAL_H   = SS_PF_H;                   // 640 px

/**
 * _drawSsPanel(ctx, px, py, pw, ph, label, pieceTypes)
 *
 * Renders a side panel (hold or next queue) onto the screenshot canvas.
 * pieceTypes is an array of piece-type chars (1 entry for hold, up to 5 for next).
 */
function _drawSsPanel(ctx, px, py, pw, ph, label, pieceTypes) {
  // Panel background
  ctx.fillStyle = '#1a1a22';
  ctx.fillRect(px, py, pw, ph);

  // Label text
  const labelSize = Math.round(SS_CS * 0.34);
  ctx.font        = `700 ${labelSize}px 'Segoe UI', system-ui, sans-serif`;
  ctx.textAlign   = 'center';
  ctx.fillStyle   = '#9898b8';
  ctx.fillText(label, px + pw / 2, py + Math.round(SS_CS * 0.52));

  const SLOT_H  = Math.round(SS_CS * 2.2); // vertical space per piece slot
  const startY  = py + Math.round(SS_CS * 0.7);

  pieceTypes.forEach((type, i) => {
    if (!type || !PIECES[type]) return;
    const cells = PIECES[type].rotations[0];
    const color = PIECES[type].color;

    const minC = Math.min(...cells.map(([c]) => c));
    const maxC = Math.max(...cells.map(([c]) => c));
    const minR = Math.min(...cells.map(([, r]) => r));
    const maxR = Math.max(...cells.map(([, r]) => r));
    const spanW = maxC - minC + 1;
    const spanH = maxR - minR + 1;

    const cs = Math.floor(Math.min(pw / (spanW + 1), SLOT_H / (spanH + 1)));
    const ox  = px + Math.round((pw  - spanW * cs) / 2) - minC * cs;
    const oy  = startY + i * SLOT_H + Math.round((SLOT_H - spanH * cs) / 2) - minR * cs;

    for (const [dc, dr] of cells) {
      drawMino(ctx, ox + dc * cs, oy + dr * cs, cs, color);
    }
  });
}

/**
 * captureScreenshot(includeGhost)
 *
 * Renders the full board state (locked cells + optional ghost + active piece)
 * flanked by hold and next-queue panels onto an offscreen canvas.
 * Returns a PNG data URL.
 *
 * @param {boolean} includeGhost  Whether to draw the ghost piece outline.
 * @returns {string}              PNG data URL.
 */
function captureScreenshot(includeGhost) {
  const oc  = document.createElement('canvas');
  oc.width  = SS_TOTAL_W;
  oc.height = SS_TOTAL_H;
  const ctx = oc.getContext('2d');

  // App background fill
  ctx.fillStyle = '#0e0e12';
  ctx.fillRect(0, 0, SS_TOTAL_W, SS_TOTAL_H);

  // ── Playfield ────────────────────────────────────────────────────────────────
  const pfX = SS_PANEL_W + SS_GAP;

  ctx.save();
  ctx.translate(pfX, 0);

  drawGrid(ctx, BOARD_COLS, VISIBLE_ROWS, SS_CS);

  // Locked board cells (skip hidden rows 0-3)
  for (let r = HIDDEN_ROWS; r < BOARD_ROWS; r++) {
    const cr = r - HIDDEN_ROWS;
    for (let c = 0; c < BOARD_COLS; c++) {
      if (gameState.board[r][c]) drawCell(ctx, c, cr, gameState.board[r][c], SS_CS);
    }
  }

  // Ghost piece outline
  if (includeGhost && gameState.current.type) {
    const { type, rotation, col, row } = gameState.current;
    const ghostRow = getGhostRow();
    if (ghostRow !== row) {
      const lw    = Math.max(1, Math.round(SS_CS * 0.10));
      const inset = lw / 2 + 1;
      ctx.strokeStyle = COLORS[PIECES[type].color];
      ctx.lineWidth   = lw;
      for (const [dc, dr] of PIECES[type].rotations[rotation]) {
        const br = ghostRow + dr;
        const bc = col + dc;
        if (br < HIDDEN_ROWS || br >= BOARD_ROWS) continue;
        if (bc < 0 || bc >= BOARD_COLS) continue;
        ctx.strokeRect(
          bc * SS_CS + inset,
          (br - HIDDEN_ROWS) * SS_CS + inset,
          SS_CS - inset * 2,
          SS_CS - inset * 2
        );
      }
    }
  }

  // Active falling piece is intentionally NOT rendered — the screenshot
  // represents the locked board state only so it reloads cleanly.

  ctx.restore();

  // ── Side panels ──────────────────────────────────────────────────────────────
  _drawSsPanel(ctx, 0, 0, SS_PANEL_W, SS_TOTAL_H,
    'HOLD', gameState.hold ? [gameState.hold] : ['']);

  _drawSsPanel(ctx, pfX + SS_PF_W + SS_GAP, 0, SS_PANEL_W, SS_TOTAL_H,
    'NEXT', gameState.queue.slice(0, 5));

  return oc.toDataURL('image/png');
}

// ── Screenshot modal ──────────────────────────────────────────────────────────

function openScreenshotModal() {
  document.getElementById('screenshot-backdrop').classList.add('open');
  _updateSsPreview();
}

function closeScreenshotModal() {
  document.getElementById('screenshot-backdrop').classList.remove('open');
}

function _updateSsPreview() {
  const includeGhost = document.getElementById('ss-ghost-toggle').checked;
  const dataUrl = captureScreenshot(includeGhost);

  // Draw scaled-down preview onto the preview canvas
  const preview = document.getElementById('ss-preview');
  const maxW    = document.getElementById('ss-preview-wrap').clientWidth - 16;
  const scale   = Math.min(1, maxW / SS_TOTAL_W);
  preview.width  = Math.round(SS_TOTAL_W * scale);
  preview.height = Math.round(SS_TOTAL_H * scale);
  preview.style.width  = preview.width  + 'px';
  preview.style.height = preview.height + 'px';

  const img = new Image();
  img.onload = () => preview.getContext('2d').drawImage(img, 0, 0, preview.width, preview.height);
  img.src = dataUrl;
}

document.getElementById('btn-screenshot').addEventListener('click', openScreenshotModal);
document.getElementById('ss-close-btn').addEventListener('click', closeScreenshotModal);
document.getElementById('ss-cancel-btn').addEventListener('click', closeScreenshotModal);

document.getElementById('ss-ghost-toggle').addEventListener('change', _updateSsPreview);

document.getElementById('ss-download-btn').addEventListener('click', () => {
  const includeGhost = document.getElementById('ss-ghost-toggle').checked;
  const dataUrl = captureScreenshot(includeGhost);
  const a = document.createElement('a');
  a.href     = dataUrl;
  a.download = `hoshtris-${Date.now()}.png`;
  a.click();
});

document.getElementById('screenshot-backdrop').addEventListener('click', e => {
  if (e.target === document.getElementById('screenshot-backdrop')) closeScreenshotModal();
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCREENSHOT LOADING  (Prompt 25)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Hoshtris-format palette (exact RGB match) ─────────────────────────────────

/**
 * Known palette entries used to match sampled pixels back to color IDs.
 * Used only for our own screenshot export (exact colours known at build time).
 */
const SS_LOAD_PALETTE = [
  { id: 0, r:  19, g:  19, b:  24 },  // #131318  grid cell bg
  { id: 0, r:  14, g:  14, b:  18 },  // #0e0e12  app bg
  { id: 0, r:  26, g:  26, b:  34 },  // #1a1a22  panel bg
  { id: 1, r: 106, g: 106, b: 122 },  // #6a6a7a  garbage
  { id: 2, r:   0, g: 207, b: 207 },  // #00cfcf  I
  { id: 3, r: 240, g: 192, b:   0 },  // #f0c000  O
  { id: 4, r: 160, g:  32, b: 240 },  // #a020f0  T
  { id: 5, r:   0, g: 192, b:   0 },  // #00c000  S
  { id: 6, r: 208, g:   0, b:   0 },  // #d00000  Z
  { id: 7, r:  32, g:  96, b: 208 },  // #2060d0  J
  { id: 8, r: 224, g:  96, b:   0 },  // #e06000  L
];

/** Maps color ID 2-8 to piece type char. */
const COLORID_TO_TYPE = ['', '', 'I', 'O', 'T', 'S', 'Z', 'J', 'L'];

/**
 * pickColorId(r, g, b)
 * Nearest-neighbour palette match in RGB space. Used for hoshtris screenshots
 * where exact colours are known.
 */
function pickColorId(r, g, b) {
  let bestId = 0, bestDist = Infinity;
  for (const e of SS_LOAD_PALETTE) {
    const d = (r - e.r) ** 2 + (g - e.g) ** 2 + (b - e.b) ** 2;
    if (d < bestDist) { bestDist = d; bestId = e.id; }
  }
  return bestId;
}

/**
 * dominantId(pixels, imgW, imgH, cx, cy, r)
 * Majority-vote palette match sampled over a square region around (cx, cy).
 * Returns the most-frequent non-zero color ID (1-8), or 0 if nothing found.
 * Uses step = ceil(r/5) for denser sampling than the old r/3 — catches
 * small piece icons when screenshots are scaled down.
 */
function dominantId(pixels, imgW, imgH, cx, cy, r) {
  const counts = new Array(9).fill(0);
  const step   = Math.max(1, Math.ceil(r / 5));
  for (let dy = -r; dy <= r; dy += step) {
    for (let dx = -r; dx <= r; dx += step) {
      const x = Math.round(Math.max(0, Math.min(imgW - 1, cx + dx)));
      const y = Math.round(Math.max(0, Math.min(imgH - 1, cy + dy)));
      const i = (y * imgW + x) * 4;
      counts[pickColorId(pixels[i], pixels[i + 1], pixels[i + 2])]++;
    }
  }
  let bestId = 0, bestN = 0;
  for (let id = 1; id <= 8; id++) {
    if (counts[id] > bestN) { bestN = counts[id]; bestId = id; }
  }
  return bestId;
}

// ── Generic HSL classifier ────────────────────────────────────────────────────

/**
 * _rgbToHsl(r, g, b)
 * Converts 0–255 RGB to [hue 0–360, saturation 0–100, lightness 0–100].
 */
function _rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = d / (l > 0.5 ? 2 - max - min : max + min);
  let h;
  if      (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else                h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

/**
 * _classifyCell(h, s, l)
 *
 * Game-agnostic HSL classifier. Returns a hoshtris color ID:
 *   0 = empty, 1 = garbage, 2-8 = I/O/T/S/Z/J/L
 *
 * WHY THE OLD CODE FAILED:
 *   The previous version used `l <= 50` to detect empty cells. This is wrong
 *   for standard Tetris piece colours: cyan I = 40.7% lightness, green S =
 *   37.5%, red Z = 40.7%, yellow O = 47%, orange L = 43.9% — all ≤ 50%. Every
 *   one of those pieces was classified as empty, leaving the board mostly blank.
 *
 * NEW THREE-LAYER LOGIC:
 *   Layer 1 — Very dark (l < 20%) → empty. Handles dark backgrounds, gridlines,
 *             and ghost pieces blended at ≤25% opacity against a dark bg
 *             (25% opacity ghost: blended l ≈ 18%, blended s ≈ 25% → empty ✓).
 *   Layer 2 — Achromatic (s < 25%) → garbage or background. Distinguishes gray
 *             garbage blocks from truly dark empty cells.
 *   Layer 3 — Chromatic → use hue band to identify piece type. The bands cover
 *             all 360° so no case is left unhandled.
 *
 * GHOST PIECE CAVEAT:
 *   Ghost pieces rendered at >50% opacity may still be misclassified as locked
 *   pieces. This is a known limitation; most games use ≤30% opacity for ghosts.
 */
function _classifyCell(h, s, l) {
  // Layer 1: very dark → empty (background, gridline, or faint ghost)
  if (l < 20) return 0;

  // Layer 2: achromatic — not a coloured piece
  if (s < 25) {
    // Classify as garbage only when lightness AND saturation are both meaningful.
    // A white UI overlay (score counter, line counter, etc.) blended over a dark
    // board cell produces l≈40% but s≈1–2% — nearly pure gray.  Requiring s >= 4
    // prevents these white-overlay artifacts from being mis-labelled as garbage
    // while still catching real garbage blocks (typically s ≈ 5–15%, l ≈ 35–60%).
    return (l >= 30 && l < 65 && s >= 4) ? 1   // mid-gray with slight chroma → garbage
                                          : 0;  // too dark, too bright, or too achromatic → empty
  }

  // Layer 3: chromatic → identify by hue band (covers all 360°).
  //
  // I/J BOUNDARY NOTE: the boundary was moved from 202.5° to 210°.
  // TETR.IO's I piece (#41B3FF) lands at h≈204°, which is 1.5° past the old
  // 202.5° boundary and was therefore mis-classified as J.  Extending the I
  // band to 210° fixes this without affecting TETR.IO's J (h≈237°) or any
  // other game's J piece (all sit well above 210°).
  if (h >= 150   && h < 210)   return 2;  // Cyan/sky-blue → I  (was h<202.5)
  if (h >= 40.5  && h < 67.5)  return 3;  // Yellow        → O
  if (h >= 262.5 && h < 330)   return 4;  // Purple        → T
  if (h >= 67.5  && h < 150)   return 5;  // Green         → S
  if (h >= 330   || h < 22.5)  return 6;  // Red           → Z
  if (h >= 210   && h < 262.5) return 7;  // Blue          → J  (was h>=202.5)
  if (h >= 22.5  && h < 40.5)  return 8;  // Orange        → L
  return 0;  // unreachable — hue bands cover 360°; fallback for safety
}

/**
 * _projectBrightness(ix0, iy0, ix1, iy1, axis)
 *
 * Returns a Float32Array of average luminance values projected along one axis
 * of the selected image region.  axis='x' → one value per column pixel;
 * axis='y' → one value per row pixel.
 *
 * Samples up to 120 lines in the orthogonal direction (was 60 — doubled to
 * reduce the probability of skipping over narrow 1-px gridlines).
 * Uses the module-level _liPixels / _liOrigW / _liOrigH buffers.
 */
function _projectBrightness(ix0, iy0, ix1, iy1, axis) {
  const selW = ix1 - ix0, selH = iy1 - iy0;
  if (axis === 'x') {
    const proj = new Float32Array(selW);
    const step = Math.max(1, Math.ceil(selH / 120));
    for (let dx = 0; dx < selW; dx++) {
      let sum = 0, cnt = 0;
      for (let dy = 0; dy < selH; dy += step) {
        const px = Math.min(ix0 + dx, _liOrigW - 1);
        const py = Math.min(iy0 + dy, _liOrigH - 1);
        const i  = (py * _liOrigW + px) * 4;
        sum += _liPixels[i] * 0.299 + _liPixels[i + 1] * 0.587 + _liPixels[i + 2] * 0.114;
        cnt++;
      }
      proj[dx] = cnt ? sum / cnt : 128;
    }
    return proj;
  } else {
    const proj = new Float32Array(selH);
    const step = Math.max(1, Math.ceil(selW / 120));
    for (let dy = 0; dy < selH; dy++) {
      let sum = 0, cnt = 0;
      for (let dx = 0; dx < selW; dx += step) {
        const px = Math.min(ix0 + dx, _liOrigW - 1);
        const py = Math.min(iy0 + dy, _liOrigH - 1);
        const i  = (py * _liOrigW + px) * 4;
        sum += _liPixels[i] * 0.299 + _liPixels[i + 1] * 0.587 + _liPixels[i + 2] * 0.114;
        cnt++;
      }
      proj[dy] = cnt ? sum / cnt : 128;
    }
    return proj;
  }
}

/**
 * _detectGrid(proj, numCells)
 *
 * Finds the cell size and phase offset that best aligns a regular grid of
 * numCells cells with the brightness projection.  Scores by maximising
 * (cell-centre brightness − gridline brightness).
 *
 * IMPROVEMENTS OVER THE ORIGINAL:
 *  • Wider search range: ±35% of naive estimate (was ±18%). Accommodates
 *    selections that include board border or frame pixels.
 *  • Finer search step: 0.25 px increments (was 0.5) for sub-pixel accuracy.
 *  • Flat-projection guard: if projection variance is negligible (std dev < 2
 *    luminance units), falls back to the naive estimate and logs a warning
 *    rather than returning a noisy, unreliable result.
 *
 * Returns { cellSize, offset } where cell c's centre is at
 *   offset + (c + 0.5) * cellSize.
 */
function _detectGrid(proj, numCells) {
  const len     = proj.length;
  const estSize = len / numCells;

  // Compute mean brightness for centred scoring and flat-projection detection
  let mean = 0;
  for (let i = 0; i < len; i++) mean += proj[i];
  mean /= len;

  // Check variance — a flat projection has no grid signal to detect
  let variance = 0;
  for (let i = 0; i < len; i++) variance += (proj[i] - mean) ** 2;
  variance /= len;

  if (variance < 4) {  // std dev < 2 luminance units → essentially flat
    console.warn('_detectGrid: flat brightness projection — no grid signal detected. ' +
      'Falling back to naive cell-size estimate. Try selecting only the playfield area.');
    return { cellSize: estSize, offset: 0 };
  }

  let bestScore = -Infinity, bestSize = estSize, bestOffset = 0;

  // Search ±35% of the naive estimate in 0.25 px steps
  for (let size = estSize * 0.65; size <= estSize * 1.35; size += 0.25) {
    for (let offset = 0; offset < size; offset += 0.25) {
      let score = 0;
      for (let c = 0; c < numCells; c++) {
        const cx = Math.round(offset + (c + 0.5) * size);  // cell centre
        const gl = Math.round(offset + c * size);           // gridline
        // Centred scoring: (centre − mean) − (gridline − mean) = centre − gridline
        // Using mean-centred form makes the score invariant to overall brightness.
        if (cx >= 0 && cx < len) score += proj[cx] - mean;
        if (gl >= 0 && gl < len) score -= proj[gl] - mean;
      }
      // Penalise the closing gridline at the far edge
      const glEnd = Math.round(offset + numCells * size);
      if (glEnd >= 0 && glEnd < len) score -= proj[glEnd] - mean;

      if (score > bestScore) { bestScore = score; bestSize = size; bestOffset = offset; }
    }
  }
  return { cellSize: bestSize, offset: bestOffset };
}

/**
 * _readBoardFromRegion(ix0, iy0, ix1, iy1, debug)
 *
 * Detects the Tetris grid using brightness projections along both axes, then
 * classifies each cell via majority-vote HSL sampling of the cell's inner area
 * (avoiding gridline edges).  Bottom-aligns detected rows in the visible region.
 *
 * IMPROVEMENTS OVER THE ORIGINAL:
 *  • numRows is derived from the selection's own geometry (selH / nominalCellPx)
 *    rather than from xGrid.cellSize. A failed x-detection no longer cascades
 *    into a wrong row count and a wrong y-grid.
 *  • sampleR tightened to 25% of cell size (was 28%) to stay further from
 *    cell borders and reduce border-pixel contamination.
 *  • Optional debug=true parameter emits detailed diagnostic output to the
 *    browser console, including grid parameters, a text board map, and an
 *    annotated canvas data URL with the detected grid overlaid.
 *
 * Uses the module-level _liPixels / _liOrigW / _liOrigH buffers.
 * Returns a full 24×10 board array (rows 0-3 hidden, 4-23 visible).
 *
 * @param {number}  ix0, iy0, ix1, iy1  Image-coordinate selection bounds.
 * @param {boolean} [debug=false]        Emit diagnostic output to console.
 */
function _readBoardFromRegion(ix0, iy0, ix1, iy1, debug = false) {
  const selW = ix1 - ix0;
  const selH = iy1 - iy0;

  // ── Detect column grid ────────────────────────────────────────────────────
  const xProj = _projectBrightness(ix0, iy0, ix1, iy1, 'x');
  const xGrid = _detectGrid(xProj, BOARD_COLS);

  // ── Estimate row count from geometry, not from xGrid.cellSize ────────────
  // Using the selection's own aspect ratio avoids cascading errors when
  // x-detection is uncertain.  nominalCellPx = expected cell size if the
  // selection perfectly covers the 10-column playfield.
  const nominalCellPx = selW / BOARD_COLS;
  const estRows       = Math.min(Math.round(selH / nominalCellPx), VISIBLE_ROWS);
  const numRows       = Math.max(1, estRows);

  // ── Detect row grid ───────────────────────────────────────────────────────
  const yProj = _projectBrightness(ix0, iy0, ix1, iy1, 'y');
  const yGrid = _detectGrid(yProj, numRows);

  // ── Sample each cell ──────────────────────────────────────────────────────
  const board      = Array.from({ length: BOARD_ROWS }, () => new Array(BOARD_COLS).fill(0));
  // 25% of cell size (was 28%) keeps samples well clear of gridline borders.
  const sampleR    = Math.max(1, Math.floor(xGrid.cellSize * 0.25));
  const sampleStep = Math.max(1, Math.floor(sampleR / 2));

  for (let r = 0; r < numRows; r++) {
    // Bottom-align: if fewer rows were detected than VISIBLE_ROWS, the missing
    // rows are treated as empty rows at the top (hidden zone).
    const boardRow = HIDDEN_ROWS + (VISIBLE_ROWS - numRows) + r;

    for (let c = 0; c < BOARD_COLS; c++) {
      const cx = Math.round(ix0 + xGrid.offset + (c + 0.5) * xGrid.cellSize);
      const cy = Math.round(iy0 + yGrid.offset + (r + 0.5) * yGrid.cellSize);

      // Majority-vote over inner region of the cell (avoids gridlines)
      const counts = new Array(9).fill(0);
      for (let dy = -sampleR; dy <= sampleR; dy += sampleStep) {
        for (let dx = -sampleR; dx <= sampleR; dx += sampleStep) {
          const px  = Math.max(0, Math.min(_liOrigW - 1, cx + dx));
          const py  = Math.max(0, Math.min(_liOrigH - 1, cy + dy));
          const idx = (py * _liOrigW + px) * 4;
          const [h, s, l] = _rgbToHsl(_liPixels[idx], _liPixels[idx + 1], _liPixels[idx + 2]);
          counts[_classifyCell(h, s, l)]++;
        }
      }
      let bestId = 0, bestN = 0;
      for (let id = 1; id <= 8; id++) {
        if (counts[id] > bestN) { bestN = counts[id]; bestId = id; }
      }
      const total = counts.reduce((a, b) => a + b, 0);
      board[boardRow][c] = (bestN > total * 0.3) ? bestId : 0;
    }
  }

  // ── Debug output ──────────────────────────────────────────────────────────
  if (debug) {
    console.group('_readBoardFromRegion debug');
    console.log(`Selection: ${selW}×${selH} px  at  (${ix0},${iy0})–(${ix1},${iy1})`);
    console.log(`X grid: cellSize=${xGrid.cellSize.toFixed(2)}, offset=${xGrid.offset.toFixed(2)}`);
    console.log(`Y grid: cellSize=${yGrid.cellSize.toFixed(2)}, offset=${yGrid.offset.toFixed(2)}, numRows=${numRows}`);
    console.log('Board (rows 4-23, visible, top→bottom):');
    for (let vr = 0; vr < VISIBLE_ROWS; vr++) {
      const row = board[HIDDEN_ROWS + vr];
      console.log(`row ${String(HIDDEN_ROWS + vr).padStart(2)}: ` +
        row.map(v => v ? (COLORID_TO_TYPE[v] || String(v)) : '.').join(' '));
    }

    // Annotated canvas: render the source pixels with the detected grid overlay
    // and cell labels.  Right-click the logged data URL to open it in a new tab.
    try {
      const oc  = document.createElement('canvas');
      oc.width  = selW;
      oc.height = selH;
      const ctx = oc.getContext('2d');

      // Copy source pixels into the debug canvas
      const imgData = ctx.createImageData(selW, selH);
      for (let dy = 0; dy < selH; dy++) {
        for (let dx = 0; dx < selW; dx++) {
          const srcIdx = ((iy0 + dy) * _liOrigW + (ix0 + dx)) * 4;
          const dstIdx = (dy * selW + dx) * 4;
          imgData.data[dstIdx]     = _liPixels[srcIdx];
          imgData.data[dstIdx + 1] = _liPixels[srcIdx + 1];
          imgData.data[dstIdx + 2] = _liPixels[srcIdx + 2];
          imgData.data[dstIdx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);

      // Draw detected grid lines in translucent green
      ctx.strokeStyle = 'rgba(0,255,128,0.65)';
      ctx.lineWidth   = 1;
      for (let c = 0; c <= BOARD_COLS; c++) {
        const x = xGrid.offset + c * xGrid.cellSize;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, selH); ctx.stroke();
      }
      for (let row = 0; row <= numRows; row++) {
        const y = yGrid.offset + row * yGrid.cellSize;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(selW, y); ctx.stroke();
      }

      // Label each non-empty cell with its detected piece type
      const labelSize = Math.max(8, Math.floor(xGrid.cellSize * 0.35));
      ctx.font         = `bold ${labelSize}px monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      for (let r = 0; r < numRows; r++) {
        const boardRow = HIDDEN_ROWS + (VISIBLE_ROWS - numRows) + r;
        for (let c = 0; c < BOARD_COLS; c++) {
          const v  = board[boardRow][c];
          const cx = xGrid.offset + (c + 0.5) * xGrid.cellSize;
          const cy = yGrid.offset + (r + 0.5) * yGrid.cellSize;
          if (v) {
            ctx.fillStyle = '#fff';
            ctx.fillText(COLORID_TO_TYPE[v] || String(v), cx, cy);
          }
        }
      }

      console.log('Annotated grid (right-click → "Open image in new tab" to inspect):');
      console.log(oc.toDataURL('image/png'));
    } catch (e) {
      console.warn('Debug canvas render failed:', e);
    }
    console.groupEnd();
  }

  return board;
}

// ── Load-image modal state ────────────────────────────────────────────────────

let _pendingLoadImg = null;  // { board } — set once a board region is confirmed
let _liPixels       = null;  // Uint8ClampedArray — raw pixel buffer of loaded image
let _liOrigW        = 0;     // natural image width  (px)
let _liOrigH        = 0;     // natural image height (px)
let _liScale        = 1;     // canvas_px / image_px ratio for the image canvas
let _liEl           = null;  // HTMLImageElement used to redraw the image canvas
let _liDragging     = false; // true while mouse button is held on the image canvas
let _liStart        = null;  // {x, y} drag-start in canvas coords
let _liSel          = null;  // {x0,y0,x1,y1} confirmed selection in canvas coords

function openLoadImgModal() {
  document.getElementById('loadimg-backdrop').classList.add('open');
}

function closeLoadImgModal() {
  document.getElementById('loadimg-backdrop').classList.remove('open');
  _pendingLoadImg = null;
  _liSel = null;
}

/**
 * _drawImageCanvas(sel)
 * Redraws _liEl onto #loadimg-image-canvas, with an optional selection overlay.
 * sel = { x0, y0, x1, y1 } in canvas coordinates, or null for no overlay.
 */
function _drawImageCanvas(sel) {
  const canvas = document.getElementById('loadimg-image-canvas');
  const ctx    = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (_liEl) ctx.drawImage(_liEl, 0, 0, canvas.width, canvas.height);
  if (sel && sel.x1 > sel.x0 && sel.y1 > sel.y0) {
    ctx.fillStyle   = 'rgba(0,136,255,0.18)';
    ctx.fillRect(sel.x0, sel.y0, sel.x1 - sel.x0, sel.y1 - sel.y0);
    ctx.strokeStyle = '#48aaff';
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(sel.x0 + 0.75, sel.y0 + 0.75,
                   sel.x1 - sel.x0 - 1.5, sel.y1 - sel.y0 - 1.5);
  }
}

/**
 * _applySelection(x0, y0, x1, y1)
 * Converts a canvas-coord selection to image coords, reads the board,
 * and updates the preview + status.
 */
function _applySelection(x0, y0, x1, y1) {
  _liSel = { x0, y0, x1, y1 };
  _drawImageCanvas(_liSel);

  const ix0 = Math.round(x0 / _liScale);
  const iy0 = Math.round(y0 / _liScale);
  const ix1 = Math.round(x1 / _liScale);
  const iy1 = Math.round(y1 / _liScale);

  if (ix1 - ix0 < 30 || iy1 - iy0 < 30) {
    document.getElementById('loadimg-status').textContent =
      'Selection too small — drag over the full 10×20 board area.';
    document.getElementById('loadimg-status').className = 'import-panel-msg';
    _pendingLoadImg = null;
    return;
  }

  const board = _readBoardFromRegion(ix0, iy0, ix1, iy1, false);
  _pendingLoadImg = { board };

  document.getElementById('loadimg-status').textContent =
    'Board region captured. Verify the preview below, then set hold / queue and click Load.';
  document.getElementById('loadimg-status').className = 'import-panel-msg';

  requestAnimationFrame(() => renderLoadImgPreview(board));
}

/**
 * _setupImageDrag()
 * Attaches drag-to-select mouse handlers to #loadimg-image-canvas.
 * Called once at module load time.
 */
function _setupImageDrag() {
  const canvas = document.getElementById('loadimg-image-canvas');

  canvas.addEventListener('mousedown', e => {
    if (!_liEl) return;
    const rect  = canvas.getBoundingClientRect();
    _liDragging = true;
    _liStart    = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  });

  canvas.addEventListener('mousemove', e => {
    if (!_liDragging || !_liStart) return;
    const rect = canvas.getBoundingClientRect();
    const ex   = e.clientX - rect.left;
    const ey   = e.clientY - rect.top;
    _drawImageCanvas({
      x0: Math.min(_liStart.x, ex), y0: Math.min(_liStart.y, ey),
      x1: Math.max(_liStart.x, ex), y1: Math.max(_liStart.y, ey),
    });
  });

  canvas.addEventListener('mouseup', e => {
    if (!_liDragging || !_liStart) return;
    _liDragging = false;
    const rect  = canvas.getBoundingClientRect();
    const ex    = e.clientX - rect.left;
    const ey    = e.clientY - rect.top;
    _applySelection(
      Math.min(_liStart.x, ex), Math.min(_liStart.y, ey),
      Math.max(_liStart.x, ex), Math.max(_liStart.y, ey),
    );
  });

  canvas.addEventListener('mouseleave', () => { _liDragging = false; });
}

_setupImageDrag();

/**
 * renderLoadImgPreview(board)
 * Draws a scaled board preview into #loadimg-preview so the user can verify
 * the detected cell colours.
 */
function renderLoadImgPreview(board) {
  const wrap    = document.getElementById('loadimg-preview-wrap');
  const preview = document.getElementById('loadimg-preview');
  const maxW    = wrap.clientWidth - 16;
  const cs      = Math.floor(Math.min(maxW / BOARD_COLS, 240 / VISIBLE_ROWS));
  preview.width  = BOARD_COLS  * cs;
  preview.height = VISIBLE_ROWS * cs;
  const ctx = preview.getContext('2d');
  drawGrid(ctx, BOARD_COLS, VISIBLE_ROWS, cs);
  for (let vr = 0; vr < VISIBLE_ROWS; vr++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const v = board[vr + HIDDEN_ROWS][c];
      if (v) drawCell(ctx, c, vr, v, cs);
    }
  }
}

/**
 * processImageFile(file)
 *
 * Loads the image file, shows it in the modal for drag-to-select, and (for
 * our own hoshtris screenshot format) also auto-detects hold / queue.
 *
 * User workflow:
 *   1. Load image  →  modal opens showing the source image.
 *   2. Drag over the 10×20 playfield  →  preview updates with detected board.
 *   3. Fill in hold / queue, click Load.
 *
 * For hoshtris screenshots the board region and panels are pre-selected
 * automatically so the user can proceed straight to step 3.
 *
 * IMPROVEMENT: dominantId sampling radius for hold/queue detection increased
 * from 0.28× to 0.35× panel width, covering more of each piece icon and
 * reducing missed detections on scaled-down screenshots.
 */
function processImageFile(file) {
  const img = new Image();
  const url = URL.createObjectURL(file);

  img.onload = () => {
    URL.revokeObjectURL(url);

    // Capture pixel data via offscreen canvas
    const oc  = document.createElement('canvas');
    oc.width  = img.naturalWidth;
    oc.height = img.naturalHeight;
    const ctx = oc.getContext('2d');
    ctx.drawImage(img, 0, 0);

    try {
      _liPixels = ctx.getImageData(0, 0, oc.width, oc.height).data;
    } catch {
      document.getElementById('loadimg-status').textContent =
        'Could not read image pixels (cross-origin restriction). Save the image locally first.';
      document.getElementById('loadimg-status').className = 'import-panel-msg error';
      _pendingLoadImg = null;
      openLoadImgModal();
      return;
    }

    _liOrigW    = img.naturalWidth;
    _liOrigH    = img.naturalHeight;
    _liEl       = img;
    _liSel      = null;
    _liDragging = false;
    _pendingLoadImg = null;

    document.getElementById('loadimg-image-wrap').style.display = '';

    // Pre-fill name
    document.getElementById('loadimg-name').value =
      file.name.replace(/\.[^.]+$/, '') || 'Imported from Screenshot';

    let statusText = 'Drag to select the board region (the 10×20 grid).';
    let hold = '', queue = '';
    // Image-coord selection for auto-detection (converted to canvas coords after render)
    let autoSelImg = null;

    // ── Hoshtris format: auto-detect board + panels ──────────────────────────
    const hoshtrisRatio = SS_TOTAL_W / SS_TOTAL_H;
    if (Math.abs(_liOrigW / _liOrigH - hoshtrisRatio) / hoshtrisRatio < 0.05) {
      const scale   = _liOrigW / SS_TOTAL_W;
      const pfX     = (SS_PANEL_W + SS_GAP) * scale;
      const cellW   = (SS_PF_W  / BOARD_COLS)  * scale;
      const cellH   = (SS_PF_H  / VISIBLE_ROWS) * scale;
      // 0.35× cell size (was 0.22×) covers more of the piece icon, improving
      // detection accuracy when the screenshot is scaled down.
      const sampleR = Math.round(Math.min(cellW, cellH) * 0.35);

      const board = Array.from({ length: BOARD_ROWS }, () => new Array(BOARD_COLS).fill(0));
      for (let vr = 0; vr < VISIBLE_ROWS; vr++) {
        for (let c = 0; c < BOARD_COLS; c++) {
          const cx = pfX + (c + 0.5) * cellW;
          const cy =       (vr + 0.5) * cellH;
          board[vr + HIDDEN_ROWS][c] =
            dominantId(_liPixels, _liOrigW, _liOrigH, cx, cy, sampleR);
        }
      }

      const slotH    = SS_CS * 2.2 * scale;
      const slotTopY = SS_CS * 0.7 * scale;
      // 0.35× panel width (was 0.28×) for more reliable hold/queue sampling
      const panelR   = Math.round(SS_PANEL_W * 0.35 * scale);
      const holdId   = dominantId(_liPixels, _liOrigW, _liOrigH,
        SS_PANEL_W * 0.5 * scale, slotTopY + slotH * 0.5, panelR);
      hold = COLORID_TO_TYPE[holdId] || '';

      const nextCx = (SS_PANEL_W + SS_GAP + SS_PF_W + SS_GAP + SS_PANEL_W * 0.5) * scale;
      for (let i = 0; i < 5; i++) {
        const id = dominantId(_liPixels, _liOrigW, _liOrigH,
          nextCx, slotTopY + (i + 0.5) * slotH, panelR);
        const t = COLORID_TO_TYPE[id];
        if (t) queue += t;
      }

      _pendingLoadImg = { board };
      statusText = 'Hoshtris format detected — hold and queue pre-filled. ' +
        'You can also drag to re-select the board region.';

      // Store selection in image coords — converted to canvas coords in the rAF below
      autoSelImg = {
        ix0: pfX,
        iy0: 0,
        ix1: pfX + BOARD_COLS * cellW,
        iy1: _liOrigH,
      };
    } else {
      // Not a hoshtris screenshot — log the mismatch to help diagnose failures
      console.warn(
        `processImageFile: hoshtris format not detected. ` +
        `Image aspect ratio=${(_liOrigW / _liOrigH).toFixed(3)}, ` +
        `expected≈${(SS_TOTAL_W / SS_TOTAL_H).toFixed(3)} (±5%). ` +
        `Drag to select the board region manually.`
      );
    }

    document.getElementById('loadimg-hold').value  = hold;
    document.getElementById('loadimg-queue').value = queue;

    const statusEl   = document.getElementById('loadimg-status');
    statusEl.textContent = statusText;
    statusEl.className   = 'import-panel-msg';

    openLoadImgModal();

    // Size the canvas after the modal is rendered so we can measure the wrap
    requestAnimationFrame(() => {
      const wrap   = document.getElementById('loadimg-image-wrap');
      const availW = Math.max(100, wrap.clientWidth  - 2);
      const availH = Math.max(100, wrap.clientHeight - 2);
      _liScale = Math.min(1, availW / _liOrigW, availH / _liOrigH);

      const imageCanvas    = document.getElementById('loadimg-image-canvas');
      imageCanvas.width    = Math.round(_liOrigW * _liScale);
      imageCanvas.height   = Math.round(_liOrigH * _liScale);
      imageCanvas.style.width  = imageCanvas.width  + 'px';
      imageCanvas.style.height = imageCanvas.height + 'px';

      // Convert image-coord auto-selection to canvas coords
      if (autoSelImg) {
        _liSel = {
          x0: Math.round(autoSelImg.ix0 * _liScale),
          y0: Math.round(autoSelImg.iy0 * _liScale),
          x1: Math.round(autoSelImg.ix1 * _liScale),
          y1: Math.round(autoSelImg.iy1 * _liScale),
        };
      }

      _drawImageCanvas(_liSel);
      if (_pendingLoadImg) renderLoadImgPreview(_pendingLoadImg.board);
    });
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert(`Could not load image "${file.name}".`);
  };

  img.src = url;
}

/**
 * applyLoadedImagePosition()
 * Creates a single-position bundle from the detected board + user-supplied
 * hold / queue / name, loads it, and closes the modal.
 */
function applyLoadedImagePosition() {
  if (!_pendingLoadImg) {
    const statusEl = document.getElementById('loadimg-status');
    statusEl.textContent = 'No board selected yet — drag over the playfield first.';
    statusEl.className   = 'import-panel-msg';
    return;
  }
  if (!confirmDiscardBundle()) return;
  const { board } = _pendingLoadImg;

  const hold  = document.getElementById('loadimg-hold').value;
  const queue = document.getElementById('loadimg-queue').value
    .toUpperCase().split('').filter(c => VALID_PIECE_CHARS.has(c)).join('');
  const name  = document.getElementById('loadimg-name').value.trim()
    || 'Imported from Screenshot';

  if (_editorMode) exitEditorMode();

  const pos    = new Position({ name, board: board.map(r => r.slice()), hold, queue });
  const bundle = new Bundle({ name, positions: [pos.toJSON()] });
  loadBundle(bundle);

  closeLoadImgModal();
}

// ── Event wiring ──────────────────────────────────────────────────────────────

document.getElementById('btn-load-image').addEventListener('click', () => {
  document.getElementById('loadimg-file-input').value = '';
  document.getElementById('loadimg-file-input').click();
});

document.getElementById('loadimg-file-input').addEventListener('change', function () {
  if (this.files[0]) processImageFile(this.files[0]);
});

document.getElementById('loadimg-close-btn').addEventListener('click', closeLoadImgModal);
document.getElementById('loadimg-cancel-btn').addEventListener('click', closeLoadImgModal);
document.getElementById('loadimg-load-btn').addEventListener('click', applyLoadedImagePosition);

document.getElementById('loadimg-backdrop').addEventListener('click', e => {
  if (e.target === document.getElementById('loadimg-backdrop')) closeLoadImgModal();
});

// ── Self-contained test ───────────────────────────────────────────────────────

/**
 * _debugLoadTest(imgPath)
 *
 * Self-contained diagnostic test. Run from the browser console to verify the
 * screenshot-parsing pipeline without using the full UI.
 *
 * Usage (open DevTools console, then):
 *   _debugLoadTest('hoshtris-1234567890.png')
 *   _debugLoadTest('test_board.png')
 *
 * What it does:
 *   1. Fetches imgPath (must be same-origin or CORS-accessible)
 *   2. Calls processImageFile() — opens the Load Image modal and (for hoshtris
 *      format) auto-detects hold / queue
 *   3. After 400 ms, logs the detected board as a text map, plus hold / queue
 *
 * For generic Tetris screenshots, drag-select the board region in the modal
 * after calling this, then re-check _pendingLoadImg.board in the console.
 * For a detailed annotated canvas, call:
 *   _readBoardFromRegion(ix0, iy0, ix1, iy1, true)
 * with the image-coordinate bounds of your selection.
 */
async function _debugLoadTest(imgPath) {
  try {
    const resp = await fetch(imgPath);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching "${imgPath}"`);
    const blob = await resp.blob();
    const file = new File([blob], imgPath.split('/').pop(), { type: blob.type });
    processImageFile(file);
    setTimeout(() => {
      console.group(`_debugLoadTest: ${imgPath}`);
      if (!_pendingLoadImg) {
        console.warn('No board detected yet. For generic screenshots, ' +
          'drag-select the board region in the modal first.');
      } else {
        const { board } = _pendingLoadImg;
        console.log('Board (rows 0-3 hidden, 4-23 visible):');
        for (let r = HIDDEN_ROWS; r < BOARD_ROWS; r++) {
          console.log(`row ${String(r).padStart(2)}: ` +
            board[r].map(v => v ? (COLORID_TO_TYPE[v] || String(v)) : '.').join(' '));
        }
      }
      console.log('Hold :', document.getElementById('loadimg-hold').value  || '(empty)');
      console.log('Queue:', document.getElementById('loadimg-queue').value || '(empty)');
      console.groupEnd();
    }, 400);
  } catch (e) {
    console.error('_debugLoadTest failed:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMPORT SYSTEM  (Prompt 23)
// ═══════════════════════════════════════════════════════════════════════════════

const VALID_PIECE_CHARS = new Set(['I','O','T','S','Z','J','L']);

/**
 * boardHash(board)
 * Returns a lightweight string key that uniquely identifies a board layout.
 * Used for duplicate detection when merging bundles.
 */
function boardHash(board) {
  // Flatten and join — fast, deterministic, collision-resistant for our use-case
  return board.map(row => row.join('')).join('|');
}

/**
 * validateBundle(obj)
 * Returns null on success, or an error string describing the problem.
 * Checks: positions array present, each position has a valid board (24×10,
 * cells 0-8), valid hold char, valid queue chars.
 */
function validateBundle(obj) {
  if (!obj || typeof obj !== 'object') return 'File is not a valid JSON object.';
  if (!Array.isArray(obj.positions))   return 'Missing required field: positions (array).';
  if (obj.positions.length === 0)      return 'Bundle contains no positions.';

  for (let i = 0; i < obj.positions.length; i++) {
    const p = obj.positions[i];
    const label = `Position ${i + 1}${p.name ? ` ("${p.name}")` : ''}`;

    // Board dimensions
    if (!Array.isArray(p.board))             return `${label}: board is not an array.`;
    if (p.board.length !== 24)               return `${label}: board must have 24 rows (got ${p.board.length}).`;
    for (let r = 0; r < 24; r++) {
      if (!Array.isArray(p.board[r]))        return `${label}: row ${r} is not an array.`;
      if (p.board[r].length !== 10)          return `${label}: row ${r} must have 10 cells (got ${p.board[r].length}).`;
      for (let c = 0; c < 10; c++) {
        const v = p.board[r][c];
        if (typeof v !== 'number' || v < 0 || v > 8 || !Number.isInteger(v))
          return `${label}: invalid cell value ${v} at row ${r}, col ${c} (must be integer 0-8).`;
      }
    }

    // Hold
    if (p.hold !== undefined && p.hold !== '' && !VALID_PIECE_CHARS.has(p.hold))
      return `${label}: invalid hold value "${p.hold}" (must be I/O/T/S/Z/J/L or empty).`;

    // Queue
    if (p.queue !== undefined) {
      if (typeof p.queue !== 'string')       return `${label}: queue must be a string.`;
      for (const ch of p.queue.toUpperCase()) {
        if (!VALID_PIECE_CHARS.has(ch))      return `${label}: invalid queue character "${ch}".`;
      }
    }
  }

  return null; // valid
}

// ── Modal helpers ─────────────────────────────────────────────────────────────

function openImportBackdrop(panelId) {
  document.getElementById('import-error-panel').style.display = 'none';
  document.getElementById('import-merge-panel').style.display = 'none';
  document.getElementById(panelId).style.display = '';
  document.getElementById('import-backdrop').classList.add('open');
}

function closeImportBackdrop() {
  document.getElementById('import-backdrop').classList.remove('open');
}

function showImportError(msg) {
  document.getElementById('import-error-msg').textContent = msg;
  openImportBackdrop('import-error-panel');
}

/** _pendingImport holds the validated parsed bundle object until user confirms. */
let _pendingImport = null;

function showMergeDialog(incoming) {
  // Detect duplicates against current bundle (by board hash)
  const existingHashes = new Set();
  if (BUNDLE_STATE.bundle) {
    BUNDLE_STATE.bundle.positions.forEach(p => existingHashes.add(boardHash(p.board)));
  }

  const dups = incoming.positions.filter(p => existingHashes.has(boardHash(p.board)));
  const newCount  = incoming.positions.length - dups.length;
  const totalIn   = incoming.positions.length;
  const bundleName = incoming.name || 'Untitled Bundle';

  let msg = `"${bundleName}" — ${totalIn} position${totalIn !== 1 ? 's' : ''} found.`;
  if (dups.length > 0) {
    msg += `\n${dups.length} duplicate${dups.length !== 1 ? 's' : ''} already exist in the current bundle (will be skipped on Merge).`;
    msg += `\n${newCount} new position${newCount !== 1 ? 's' : ''} will be added on Merge.`;
  } else {
    msg += '\nNo duplicates detected.';
  }

  // Merge button label/state
  const mergeBtn = document.getElementById('import-merge-btn');
  mergeBtn.disabled = (newCount === 0);
  mergeBtn.title    = newCount === 0 ? 'All positions already exist' : '';

  // Duplicate list
  const dupList = document.getElementById('import-dup-list');
  if (dups.length > 0) {
    dupList.style.display = '';
    dupList.innerHTML = '<strong style="color:var(--text-label)">Duplicate positions:</strong><br>' +
      dups.map((p, i) => `${i + 1}. ${p.name || '(unnamed)'}`).join('<br>');
  } else {
    dupList.style.display = 'none';
  }

  document.getElementById('import-merge-msg').textContent = msg;
  _pendingImport = { incoming, dups, existingHashes };
  openImportBackdrop('import-merge-panel');
}

// ── Apply import ──────────────────────────────────────────────────────────────

function applyImport(mode) {
  if (!_pendingImport) return;
  const { incoming, existingHashes } = _pendingImport;
  _pendingImport = null;
  closeImportBackdrop();

  if (mode === 'replace') {
    if (!confirmDiscardBundle()) return;
    loadBundle(new Bundle(incoming));
    if (_editorMode) enterEditorMode(); // refresh editor UI
  } else {
    // Merge: ensure a bundle exists to merge into
    if (!BUNDLE_STATE.bundle) {
      loadBundle(new Bundle({ name: incoming.name || 'Imported Bundle' }));
      // loadBundle starts with one blank position; remove it if board is truly empty
      const blank = BUNDLE_STATE.bundle.positions[0];
      const isBlank = boardHash(blank.board) === boardHash(newEmptyBoard()) && !blank.hold && !blank.queue;
      if (isBlank) BUNDLE_STATE.bundle.positions.splice(0, 1);
    }

    let added = 0;
    incoming.positions.forEach(rawPos => {
      if (!existingHashes.has(boardHash(rawPos.board))) {
        BUNDLE_STATE.bundle.addPosition(new Position(rawPos));
        added++;
      }
    });

    navTo(BUNDLE_STATE.bundle.length - 1);
    if (_editorMode) enterEditorMode();
    updateNavUI();
  }
}

// ── File processing ───────────────────────────────────────────────────────────

function processImportFile(file) {
  if (!file) return;
  if (!file.name.endsWith('.hosh') && !file.name.endsWith('.json')) {
    showImportError(`"${file.name}" is not a valid bundle file.\nOnly .hosh bundle files can be imported.`);
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    let obj;
    try {
      obj = JSON.parse(e.target.result);
    } catch (err) {
      showImportError(`Could not parse "${file.name}" as JSON.\n\n${err.message}`);
      return;
    }

    const err = validateBundle(obj);
    if (err) {
      showImportError(`Invalid bundle file "${file.name}":\n\n${err}`);
      return;
    }

    showMergeDialog(obj);
  };
  reader.onerror = () => showImportError(`Failed to read file "${file.name}".`);
  reader.readAsText(file);
}

// ── Drag-and-drop wiring ──────────────────────────────────────────────────────

let _dragCounter = 0; // track nested dragenter/dragleave correctly

document.addEventListener('dragenter', e => {
  if (!e.dataTransfer.types.includes('Files')) return;
  _dragCounter++;
  document.getElementById('drag-overlay').classList.add('active');
  e.preventDefault();
});

document.addEventListener('dragleave', () => {
  _dragCounter--;
  if (_dragCounter <= 0) {
    _dragCounter = 0;
    document.getElementById('drag-overlay').classList.remove('active');
  }
});

document.addEventListener('dragover', e => e.preventDefault());

document.addEventListener('drop', e => {
  e.preventDefault();
  _dragCounter = 0;
  document.getElementById('drag-overlay').classList.remove('active');
  const file = e.dataTransfer.files[0];
  if (file) processImportFile(file);
});

// ── Import button click ───────────────────────────────────────────────────────

document.getElementById('btn-import').addEventListener('click', () => {
  document.getElementById('import-file-input').value = ''; // reset so same file re-triggers
  document.getElementById('import-file-input').click();
});

document.getElementById('import-file-input').addEventListener('change', function () {
  if (this.files[0]) processImportFile(this.files[0]);
});

// ── Modal button wiring ───────────────────────────────────────────────────────

document.getElementById('import-error-ok').addEventListener('click', closeImportBackdrop);

document.getElementById('import-cancel-btn').addEventListener('click', () => {
  _pendingImport = null;
  closeImportBackdrop();
});

document.getElementById('import-merge-btn').addEventListener('click', () => applyImport('merge'));
document.getElementById('import-replace-btn').addEventListener('click', () => applyImport('replace'));

// Close on backdrop click
document.getElementById('import-backdrop').addEventListener('click', e => {
  if (e.target === document.getElementById('import-backdrop')) {
    _pendingImport = null;
    closeImportBackdrop();
  }
});

