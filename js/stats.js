'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// STATS DISPLAY
// ═══════════════════════════════════════════════════════════════════════════════

// Standard (Guideline) combo flat-bonus table.
// Index = consecutive clears so far before this one (0 = first clear of a chain → +0, 1 = second → +1, …)
const COMBO_TABLE_STANDARD = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5];
// TETR.IO combo formula: damage = floor(damage * (1 + preCombo * 0.25))
// where preCombo is the combo count BEFORE this clear's increment.
// Equivalent to the lookup table in the chart (works for any combo depth).

/**
 * calcAttack(spin, lines)
 *
 * Returns the base attack value and B2B eligibility for a given clear.
 * Does NOT mutate gameState — all state changes happen in processLockStats().
 *
 * Standard damage table (Tetris Guideline):
 *   Lines │ No spin │ Spin (standard) │ Spin (mini)
 *   ──────┼─────────┼─────────────────┼────────────
 *     0   │    0    │        1        │     0
 *     1   │    0    │        2        │     1
 *     2   │    1    │        4        │     1
 *     3   │    2    │        6        │     —
 *     4   │    4    │        —        │     —
 *
 * B2B eligible: Tetris (4-line, no spin) + any spin with lines > 0.
 * B2B bonus applied here (+1) when the chain is already active (b2b ≥ 1).
 */
function calcAttack(spin, lines) {
  let base = 0;
  let b2bEligible = false;

  if (spin === 'standard') {
    base         = [1, 2, 4, 6][lines] ?? 0;
    b2bEligible  = lines > 0;
  } else if (spin === 'mini') {
    base         = [0, 1, 1, 0][lines] ?? 0;
    b2bEligible  = lines > 0;
  } else {
    base         = [0, 0, 1, 2, 4][lines] ?? 0;
    b2bEligible  = lines === 4;
  }

  return { base, b2bEligible };
}

/**
 * processLockStats(type, spin, lines)
 *
 * Called in lockPiece() after spin detection and line clear.
 *   1. Calculates damage (base + B2B bonus if chain active).
 *   2. Updates the B2B chain counter.
 *   3. Records the spin type in stats.spins.
 *
 * Returns the total lines-sent for this lock so lockPiece can add it to
 * gameState.stats.sent.
 */
function processLockStats(type, spin, lines) {
  const { base, b2bEligible } = calcAttack(spin, lines);

  // B2B bonus: +1 when this attack is eligible AND the chain is already running.
  const b2bBonus = (b2bEligible && gameState.stats.b2b >= 1) ? 1 : 0;
  let damage     = base + b2bBonus;

  // Update B2B chain.
  // A non-eligible line clear (single/double/triple, no spin) breaks the chain.
  // A 0-line clear or a 0-line spin leaves the chain unchanged.
  if (b2bEligible) {
    gameState.stats.b2b++;
  } else if (lines > 0 && !b2bEligible) {
    gameState.stats.b2b = 0;
  }

  // Combo tracking: capture pre-increment count, then increment or reset.
  if (lines > 0) {
    const preCombo = gameState.stats.combo; // 0 = first clear of a chain
    gameState.stats.combo++;
    if (damage > 0) {
      if (SETTINGS.comboSystem === 'standard') {
        // Guideline flat bonus indexed by pre-increment count.
        const idx = Math.min(preCombo, COMBO_TABLE_STANDARD.length - 1);
        damage += COMBO_TABLE_STANDARD[idx];
      } else {
        // TETR.IO: floor(damage × (1 + preCombo × 0.25))
        // preCombo=0 → ×1.0 (no bonus), preCombo=1 → ×1.25, preCombo=4 → ×2.0, …
        damage = Math.floor(damage * (1 + preCombo * 0.25));
      }
    }
  } else {
    gameState.stats.combo = 0;
  }

  // Track spin event by type + grade ('T-standard', 'S-mini', …).
  if (spin) {
    const key = `${type}-${spin}`;
    gameState.stats.spins[key] = (gameState.stats.spins[key] ?? 0) + 1;
  }

  return damage;
}

/**
 * updateStatsDisplay()
 *
 * Pushes current gameState.stats values to the left-panel HUD.
 * Called after every lock and on undo/redo.
 */
function updateStatsDisplay() {
  const { pieces, lines, sent, b2b, combo, spins } = gameState.stats;
  const totalSpins = Object.values(spins).reduce((a, v) => a + v, 0);
  document.getElementById('stat-pieces').textContent = pieces;
  document.getElementById('stat-lines').textContent  = lines;
  document.getElementById('stat-sent').textContent   = sent;
  document.getElementById('stat-app').textContent    =
    pieces > 0 ? (sent / pieces).toFixed(2) : '0.00';
  document.getElementById('stat-b2b').textContent    = b2b;
  document.getElementById('stat-combo').textContent  = combo;
  document.getElementById('stat-spins').textContent  = totalSpins;
}

