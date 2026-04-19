'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// BOARD CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const BOARD_COLS   = 10;
const BOARD_ROWS   = 24;   // 4 hidden + 20 visible
const VISIBLE_ROWS = 20;
const HIDDEN_ROWS  = 4;

// ─── Color map ───────────────────────────────────────────────────────────────
// Index 0 = empty (not drawn). Indices 1-8 match the spec:
//   1=garbage  2=I  3=O  4=T  5=S  6=Z  7=J  8=L
const COLORS = [
  null,        // 0  empty
  '#6a6a7a',   // 1  garbage  gray
  '#00cfcf',   // 2  I        cyan
  '#f0c000',   // 3  O        yellow
  '#a020f0',   // 4  T        purple
  '#00c000',   // 5  S        green
  '#d00000',   // 6  Z        red
  '#2060d0',   // 7  J        blue
  '#e06000',   // 8  L        orange
];

const PIECE_TYPES = ['I','O','T','S','Z','J','L'];

// ─── Full piece definitions ───────────────────────────────────────────────────
// Each entry contains:
//   color     – COLORS[] index (2-8)
//   spawnCol  – board column of the bounding-box origin at spawn
//   spawnRow  – board row  of the bounding-box origin at spawn
//   rotations – 4 arrays (states 0-3) of [dc, dr] offsets from [spawnCol, spawnRow]
//
// Rotation states: 0=spawn, 1=CW, 2=180°, 3=CCW  (standard SRS labelling).
// I and O use a 4×4 bounding box; J/L/S/T/Z use a 3×3 bounding box.
//
// spawnRow=3 for all pieces:  the lowest mino offset in state-0 is row+1 or
// row+1, placing the bottom of each bounding box at board row 4 — the first
// visible row — so every piece appears at the skyline immediately on spawn.
const PIECES = {
  I: {
    color: 2, spawnCol: 3, spawnRow: 3,
    rotations: [
      [[0,1],[1,1],[2,1],[3,1]],  // 0 spawn  — horizontal bar in 4×4 box, row 1
      [[2,0],[2,1],[2,2],[2,3]],  // 1 CW     — vertical bar, col 2
      [[0,2],[1,2],[2,2],[3,2]],  // 2 180°   — horizontal bar, row 2
      [[1,0],[1,1],[1,2],[1,3]],  // 3 CCW    — vertical bar, col 1
    ],
  },
  O: {
    color: 3, spawnCol: 4, spawnRow: 3,
    // 2×2 bounding box; rotationally symmetric — all states identical
    rotations: [
      [[0,0],[1,0],[0,1],[1,1]],
      [[0,0],[1,0],[0,1],[1,1]],
      [[0,0],[1,0],[0,1],[1,1]],
      [[0,0],[1,0],[0,1],[1,1]],
    ],
  },
  T: {
    color: 4, spawnCol: 3, spawnRow: 3,
    rotations: [
      [[1,0],[0,1],[1,1],[2,1]],  // 0 spawn  — flat, bump up
      [[1,0],[1,1],[2,1],[1,2]],  // 1 CW     — bump right
      [[0,1],[1,1],[2,1],[1,2]],  // 2 180°   — bump down
      [[1,0],[0,1],[1,1],[1,2]],  // 3 CCW    — bump left
    ],
  },
  S: {
    color: 5, spawnCol: 3, spawnRow: 3,
    rotations: [
      [[1,0],[2,0],[0,1],[1,1]],  // 0 spawn
      [[1,0],[1,1],[2,1],[2,2]],  // 1 CW
      [[1,1],[2,1],[0,2],[1,2]],  // 2 180°
      [[0,0],[0,1],[1,1],[1,2]],  // 3 CCW
    ],
  },
  Z: {
    color: 6, spawnCol: 3, spawnRow: 3,
    rotations: [
      [[0,0],[1,0],[1,1],[2,1]],  // 0 spawn
      [[2,0],[1,1],[2,1],[1,2]],  // 1 CW
      [[0,1],[1,1],[1,2],[2,2]],  // 2 180°
      [[1,0],[0,1],[1,1],[0,2]],  // 3 CCW
    ],
  },
  J: {
    color: 7, spawnCol: 3, spawnRow: 3,
    rotations: [
      [[0,0],[0,1],[1,1],[2,1]],  // 0 spawn  — hook top-left
      [[1,0],[2,0],[1,1],[1,2]],  // 1 CW
      [[0,1],[1,1],[2,1],[2,2]],  // 2 180°
      [[1,0],[1,1],[0,2],[1,2]],  // 3 CCW
    ],
  },
  L: {
    color: 8, spawnCol: 3, spawnRow: 3,
    rotations: [
      [[2,0],[0,1],[1,1],[2,1]],  // 0 spawn  — hook top-right
      [[1,0],[1,1],[1,2],[2,2]],  // 1 CW
      [[0,1],[1,1],[2,1],[0,2]],  // 2 180°
      [[0,0],[1,0],[1,1],[1,2]],  // 3 CCW
    ],
  },
};

// ─── SRS kick tables — J, L, S, T, Z ─────────────────────────────────────────
//
// Keys are 'fromState>toState' for all 8 CW/CCW transitions.
// Each value is 5 [dc, dr] offsets to test in order (test 1 = [0,0] = no shift).
//
// Source: Tetris Guideline / TETR.IO SRS offset table, converted from the
// guideline's (x, y↑) math frame to our (col, row↓) screen frame: dr = −y_math.
//
//  Transition │ Test1 │ Test2  │ Test3   │ Test4  │ Test5
//  ───────────┼───────┼────────┼─────────┼────────┼────────
//  0→1 (CW)  │  0, 0 │ −1, 0  │ −1,−1   │  0,+2  │ −1,+2
//  1→0 (CCW) │  0, 0 │ +1, 0  │ +1,+1   │  0,−2  │ +1,−2
//  1→2 (CW)  │  0, 0 │ +1, 0  │ +1,+1   │  0,−2  │ +1,−2
//  2→1 (CCW) │  0, 0 │ −1, 0  │ −1,−1   │  0,+2  │ −1,+2
//  2→3 (CW)  │  0, 0 │ +1, 0  │ +1,−1   │  0,+2  │ +1,+2
//  3→2 (CCW) │  0, 0 │ −1, 0  │ −1,+1   │  0,−2  │ −1,−2
//  3→0 (CW)  │  0, 0 │ −1, 0  │ −1,+1   │  0,−2  │ −1,−2
//  0→3 (CCW) │  0, 0 │ +1, 0  │ +1,−1   │  0,+2  │ +1,+2
const KICKS_JLSTZ = {
  '0>1': [[ 0, 0],[-1, 0],[-1,-1],[ 0, 2],[-1, 2]],
  '1>0': [[ 0, 0],[ 1, 0],[ 1, 1],[ 0,-2],[ 1,-2]],
  '1>2': [[ 0, 0],[ 1, 0],[ 1, 1],[ 0,-2],[ 1,-2]],
  '2>1': [[ 0, 0],[-1, 0],[-1,-1],[ 0, 2],[-1, 2]],
  '2>3': [[ 0, 0],[ 1, 0],[ 1,-1],[ 0, 2],[ 1, 2]],
  '3>2': [[ 0, 0],[-1, 0],[-1, 1],[ 0,-2],[-1,-2]],
  '3>0': [[ 0, 0],[-1, 0],[-1, 1],[ 0,-2],[-1,-2]],
  '0>3': [[ 0, 0],[ 1, 0],[ 1,-1],[ 0, 2],[ 1, 2]],
};

// ─── SRS kick table — I piece ─────────────────────────────────────────────────
//
// Standard SRS simple-kick method (Tetris Guideline).  Test 1 is always [0,0]
// (basic rotation in place); tests 2-5 are the wall-kick offsets to try if
// test 1 collides.  Values are in [dc, dr] screen coordinates (col, row↓).
//
//  Transition │ Test1 │ Test2  │ Test3  │ Test4   │ Test5
//  ───────────┼───────┼────────┼────────┼─────────┼────────
//  0→1 (CW)  │  0, 0 │ −2, 0  │ +1, 0  │ −2,+1   │ +1,−2
//  1→0 (CCW) │  0, 0 │ +2, 0  │ −1, 0  │ +2,−1   │ −1,+2
//  1→2 (CW)  │  0, 0 │ −1, 0  │ +2, 0  │ −1,−2   │ +2,+1
//  2→1 (CCW) │  0, 0 │ +1, 0  │ −2, 0  │ +1,+2   │ −2,−1
//  2→3 (CW)  │  0, 0 │ +2, 0  │ −1, 0  │ +2,−1   │ −1,+2
//  3→2 (CCW) │  0, 0 │ −2, 0  │ +1, 0  │ −2,+1   │ +1,−2
//  3→0 (CW)  │  0, 0 │ +1, 0  │ −2, 0  │ +1,+2   │ −2,−1
//  0→3 (CCW) │  0, 0 │ −1, 0  │ +2, 0  │ −1,−2   │ +2,+1
const KICKS_I = {
  '0>1': [[ 0, 0],[-2, 0],[ 1, 0],[-2, 1],[ 1,-2]],
  '1>0': [[ 0, 0],[ 2, 0],[-1, 0],[ 2,-1],[-1, 2]],
  '1>2': [[ 0, 0],[-1, 0],[ 2, 0],[-1,-2],[ 2, 1]],
  '2>1': [[ 0, 0],[ 1, 0],[-2, 0],[ 1, 2],[-2,-1]],
  '2>3': [[ 0, 0],[ 2, 0],[-1, 0],[ 2,-1],[-1, 2]],
  '3>2': [[ 0, 0],[-2, 0],[ 1, 0],[-2, 1],[ 1,-2]],
  '3>0': [[ 0, 0],[ 1, 0],[-2, 0],[ 1, 2],[-2,-1]],
  '0>3': [[ 0, 0],[-1, 0],[ 2, 0],[-1,-2],[ 2, 1]],
};

// ─── 180° rotation kick offsets (SRS+, all piece types) ──────────────────────
//
// Applied in order; test 1 = [0,0] = basic rotation with no positional shift.
// If that collides, the remaining 8 offsets are tried before rejecting.
// Listed directly in [dc, dr] screen coordinates (col, row↓) as per the spec.
const KICKS_180 = [
  [ 0, 0],   // test 1 — no offset
  [ 0, 1],   // test 2
  [ 1, 0],   // test 3
  [ 0,-1],   // test 4
  [-1, 0],   // test 5
  [ 1, 1],   // test 6
  [-1,-1],   // test 7
  [ 1,-1],   // test 8
  [-1, 1],   // test 9
];
