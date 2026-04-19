"""
Generates data/puzzles.db with 10 example puzzle positions.
Run from the project root: python3 tools/create-puzzles.py
"""
import sqlite3, json, sys
from pathlib import Path

# ── Board helpers ─────────────────────────────────────────────────────────────
G = 1  # garbage cell value

def empty_board():
    return [[0] * 10 for _ in range(24)]

def full_row():
    return [G] * 10

def row(gap_cols):
    """Full garbage row with specific columns set to 0."""
    return [0 if c in gap_cols else G for c in range(10)]

# ── Puzzle board definitions ──────────────────────────────────────────────────

def board_tsd_opener():
    """
    TSD tower at cols 4-5. T piece (rotation 1, right-facing) spins into
    the slot at col 4.
      Row 17: overhang — only col 4 open (forces spin entry)
      Row 18: TSD slot body — cols 4 AND 5 open
      Row 19: T bottom lands here; col 5 stays open so row doesn't clear (TSD not TST)
      Rows 20-23: solid floor
    """
    b = empty_board()
    b[17] = row({4})       # G G G G . G G G G G
    b[18] = row({4, 5})    # G G G G . . G G G G
    b[19] = row({4, 5})    # G G G G . . G G G G  (T fills col 4, col 5 stays open)
    for r in range(20, 24):
        b[r] = full_row()
    return b

def board_tst_setup():
    """
    TST (T-Spin Triple) slot on the left side. T held for the spin.
      Row 17: entry — cols 1,2 open
      Row 18: overhang — col 1 only open
      Row 19: triple-slot body — cols 0,1 open
      Row 20: slot bottom — col 1 only open
      Rows 21-23: floor
    """
    b = empty_board()
    b[17] = row({1, 2})    # G . . G G G G G G G
    b[18] = row({1})       # G . G G G G G G G G
    b[19] = row({0, 1})    # . . G G G G G G G G
    b[20] = row({1})       # G . G G G G G G G G
    for r in range(21, 24):
        b[r] = full_row()
    return b

def board_dt_cannon():
    """
    DT Cannon mid-build — right-side construction with two stacked T-spin slots.
    Upper (TST-like) slot at cols 0-1, rows 14-16.
    Lower (TSD-like) slot at cols 0-1, rows 18-20.
    """
    b = empty_board()
    # Upper TST-like slot
    b[14] = row({0, 1, 2})  # . . . G G G G G G G
    b[15] = row({0, 1})     # . . G G G G G G G G
    b[16] = row({1})        # G . G G G G G G G G
    b[17] = full_row()      # separator row
    # Lower TSD-like slot
    b[18] = row({0})        # . G G G G G G G G G
    b[19] = row({0, 1})     # . . G G G G G G G G
    b[20] = row({0, 1})     # . . G G G G G G G G
    for r in range(21, 24):
        b[r] = full_row()
    return b

def board_stsd():
    """
    STSD (ST-Stacking Double) — T-Spin Double using S-T stacking on the left.
    The recognizable STSD shape: 4-wide tower on left, T-slot embedded.
      Row 17: cols 0-1 open (S/T stacking space)
      Row 18: col 0 open only
      Row 19: cols 0-1 open (TSD slot body)
      Row 20: col 0 open only
      Rows 21-23: floor
    """
    b = empty_board()
    b[17] = row({0, 1})    # . . G G G G G G G G
    b[18] = row({0})       # . G G G G G G G G G  (overhang)
    b[19] = row({0, 1})    # . . G G G G G G G G  (T-slot body)
    b[20] = row({0})       # . G G G G G G G G G  (T-slot bottom)
    for r in range(21, 24):
        b[r] = full_row()
    return b

def board_pc_opportunity():
    """
    Perfect Clear opportunity — bottom 3 rows partially filled.
    Designed so that ITOZSLJ (with L in hold) can finish the PC.
    """
    b = empty_board()
    # Three rows with a recognizable PC pattern
    b[21] = row({0, 1, 2, 3})   # 4-wide gap on left
    b[22] = row({6, 7, 8, 9})   # 4-wide gap on right
    b[23] = row({0, 1, 8, 9})   # gaps on both ends
    return b

def board_downstack():
    """
    Downstack drill — heavy garbage 13 rows tall, single-column shaft at col 5.
    Player clears lines efficiently by working down the shaft.
    Shaft widens slightly at the top for easier entry.
    """
    b = empty_board()
    # Top 3 rows of the stack: 2-wide shaft at cols 4-5
    for r in range(10, 13):
        b[r] = row({4, 5})
    # Middle 5 rows: 1-wide shaft at col 5
    for r in range(13, 18):
        b[r] = row({5})
    # Bottom 6 rows: same shaft
    for r in range(18, 24):
        b[r] = row({5})
    return b

def board_count_to_4():
    """
    Combo drill — 4 target rows with a 2-wide gap on the right (cols 8-9).
    Also 5 setup rows above. Goal is to chain-clear all 4 target rows (4-combo).
    """
    b = empty_board()
    # Setup rows (taller stack for approach room)
    for r in range(15, 20):
        b[r] = row({8, 9})
    # Four target rows — same 2-wide gap
    for r in range(20, 24):
        b[r] = row({8, 9})
    return b

def board_cspin():
    """
    C-Spin (S or Z spin) slot.
    Classic C-Spin setup: S-shaped cavity on the right side,
    covered by an overhang forcing a spin-in.
      Row 17: overhang — col 9 open only
      Row 18: S-cavity top — cols 8,9 open
      Row 19: S-cavity bottom — cols 7,8 open
      Row 20: base — col 7 open (T bottom fills here without clearing)
      Rows 21-23: floor
    """
    b = empty_board()
    b[17] = row({9})       # G G G G G G G G G .   overhang
    b[18] = row({8, 9})    # G G G G G G G G . .   S-top
    b[19] = row({7, 8})    # G G G G G G G . . G   S-bottom
    b[20] = row({7})       # G G G G G G G . G G   base extra gap
    for r in range(21, 24):
        b[r] = full_row()
    return b

def board_jspin_triple():
    """
    J-Spin Triple slot. J-shaped cavity on the right side with overhang.
      Row 17: entry — cols 7,8,9 open
      Row 18: overhang — cols 8,9 open
      Row 19: J-slot body — cols 7,8,9 open
      Row 20: J-slot bottom — cols 8,9 open
      Rows 21-23: floor
    """
    b = empty_board()
    b[17] = row({7, 8, 9})   # G G G G G G G . . .   entry
    b[18] = row({8, 9})      # G G G G G G G G . .   overhang
    b[19] = row({7, 8, 9})   # G G G G G G G . . .   slot body
    b[20] = row({8, 9})      # G G G G G G G G . .   slot bottom
    for r in range(21, 24):
        b[r] = full_row()
    return b

def board_midgame_flat_top():
    """
    Midgame flat-top drill. Board has a bumpy top (heights 2-5 on each col)
    with varied piece colors. Player stacks efficiently to reach a flat top.
    """
    b = empty_board()
    # Heights (from bottom, 0=empty): [5,3,4,3,5,4,3,5,3,4]
    heights = [5, 3, 4, 3, 5, 4, 3, 5, 3, 4]
    for col, h in enumerate(heights):
        for offset in range(h):
            row_idx = 23 - offset
            b[row_idx][col] = G
    # Add a few filled base rows for stability
    for r in range(21, 24):
        b[r] = full_row()
    return b

# ── Puzzle seed data ──────────────────────────────────────────────────────────

PUZZLES = [
    {
        "id": "puzzle-tsd-opener",
        "name": "TSD Opener",
        "board": board_tsd_opener(),
        "hold": "",
        "queue": "TSZIOJ",
        "goal": "Perform a T-Spin Double — spin the T piece into the slot at columns 4-5",
        "description": "Classic TSD tower. T piece (rotation 1) spins into the chimney slot.",
        "difficulty": 75,
        "spin_type": "tspin",
        "setup_types": json.dumps(["t-spin-setup", "opening"]),
    },
    {
        "id": "puzzle-tst-setup",
        "name": "TST Setup",
        "board": board_tst_setup(),
        "hold": "T",
        "queue": "TJLOSZ",
        "goal": "Execute a T-Spin Triple — use the T in hold to spin into the left-side slot",
        "description": "Left-side TST chimney. T held; other pieces support or stall.",
        "difficulty": 40,
        "spin_type": "tspin",
        "setup_types": json.dumps(["t-spin-setup", "midgame"]),
    },
    {
        "id": "puzzle-dt-cannon",
        "name": "DT Cannon",
        "board": board_dt_cannon(),
        "hold": "T",
        "queue": "TLOISZJ",
        "goal": "Complete the DT Cannon — execute two back-to-back T-Spins using the two slots",
        "description": "DT Cannon mid-build with two stacked T-spin slots on the left.",
        "difficulty": 44,
        "spin_type": "tspin",
        "setup_types": json.dumps(["dt-cannon", "opening", "t-spin-setup"]),
    },
    {
        "id": "puzzle-stsd",
        "name": "STSD",
        "board": board_stsd(),
        "hold": "",
        "queue": "TSLIZOJ",
        "goal": "Execute the ST-Stacking Double — T-Spin Double from the left-side STSD slot",
        "description": "Classic STSD shape. T is first in queue for immediate execution.",
        "difficulty": 33,
        "spin_type": "tspin",
        "setup_types": json.dumps(["STSD", "t-spin-setup"]),
    },
    {
        "id": "puzzle-pc-opportunity",
        "name": "PC Opportunity",
        "board": board_pc_opportunity(),
        "hold": "L",
        "queue": "ITOZSLJ",
        "goal": "Achieve a Perfect Clear — fill all three rows without leaving any holes",
        "description": "Three partially filled rows with L in hold. Fill all rows completely.",
        "difficulty": 60,
        "spin_type": "",
        "setup_types": json.dumps(["pc-setup", "opening"]),
    },
    {
        "id": "puzzle-downstack-drill",
        "name": "Downstack Drill",
        "board": board_downstack(),
        "hold": "",
        "queue": "IOTSZJL",
        "goal": "Clear the board — work down the shaft at column 5 until the board is empty",
        "description": "14-row tall garbage stack with a 1-wide shaft. Pure downstack practice.",
        "difficulty": 70,
        "spin_type": "",
        "setup_types": json.dumps(["downstack"]),
    },
    {
        "id": "puzzle-count-to-4",
        "name": "Count to 4 Combo",
        "board": board_count_to_4(),
        "hold": "",
        "queue": "SZITOLJ",
        "goal": "Chain 4 consecutive line clears — clear the 4 target rows one by one",
        "description": "9-row well with 2-wide right-side gap. Clear each row in sequence for a 4-combo.",
        "difficulty": 72,
        "spin_type": "",
        "setup_types": json.dumps(["count-to-4"]),
    },
    {
        "id": "puzzle-cspin",
        "name": "C-Spin",
        "board": board_cspin(),
        "hold": "",
        "queue": "SZIOTJL",
        "goal": "Execute a C-Spin (S or Z piece spin) into the S-shaped slot on the right",
        "description": "S-shaped cavity on the right side covered by an overhang. Requires S or Z spin.",
        "difficulty": 36,
        "spin_type": "allspin",
        "setup_types": json.dumps(["c-spin", "all-spin-setup"]),
    },
    {
        "id": "puzzle-jspin-triple",
        "name": "J-Spin Triple",
        "board": board_jspin_triple(),
        "hold": "",
        "queue": "JITSOZL",
        "goal": "Execute a J-Spin Triple — spin the J piece into the right-side slot",
        "description": "J-shaped triple-height cavity on the right. J is first in queue.",
        "difficulty": 30,
        "spin_type": "allspin",
        "setup_types": json.dumps(["all-spin-setup", "midgame"]),
    },
    {
        "id": "puzzle-midgame-flat-top",
        "name": "Midgame Flat Top",
        "board": board_midgame_flat_top(),
        "hold": "S",
        "queue": "LTOISZJ",
        "goal": "Stack to a flat top — place pieces to even out the bumpy surface",
        "description": "Bumpy midgame board with varying column heights. Practice efficient stacking.",
        "difficulty": 65,
        "spin_type": "",
        "setup_types": json.dumps(["midgame"]),
    },
]

# ── Database creation ─────────────────────────────────────────────────────────

def create_db(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()
    con = sqlite3.connect(path)
    cur = con.cursor()
    cur.execute("""
        CREATE TABLE puzzles (
            id          TEXT    PRIMARY KEY,
            name        TEXT    NOT NULL,
            board       TEXT    NOT NULL,
            hold        TEXT    DEFAULT '',
            queue       TEXT    DEFAULT '',
            goal        TEXT    DEFAULT '',
            description TEXT    DEFAULT '',
            difficulty  INTEGER DEFAULT 50,
            spin_type   TEXT    DEFAULT '',
            setup_types TEXT    DEFAULT '[]',
            created_at  TEXT    DEFAULT (datetime('now'))
        )
    """)
    for p in PUZZLES:
        cur.execute("""
            INSERT INTO puzzles
                (id, name, board, hold, queue, goal, description,
                 difficulty, spin_type, setup_types)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        """, (
            p["id"], p["name"], json.dumps(p["board"]),
            p["hold"], p["queue"], p["goal"], p["description"],
            p["difficulty"], p["spin_type"], p["setup_types"],
        ))
    con.commit()
    con.close()
    print(f"Created {path} with {len(PUZZLES)} puzzles.")

if __name__ == "__main__":
    root = Path(__file__).parent.parent
    create_db(root / "data" / "puzzles.db")
