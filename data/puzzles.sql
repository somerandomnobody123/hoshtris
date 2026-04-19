-- Hoshtris Puzzle Database Schema
-- Source of truth for puzzles.db structure.
-- Regenerate puzzles.db: python3 tools/create-puzzles.py
-- Regenerate embed:      node tools/generate-embed.js

CREATE TABLE IF NOT EXISTS puzzles (
    id          TEXT    PRIMARY KEY,
    -- Display name shown in puzzle browser and nav bar
    name        TEXT    NOT NULL,

    -- Board state: JSON string of a 24×10 integer array (number[][])
    --   Rows 0-3:  hidden zone (always 0)
    --   Rows 4-23: visible playfield
    --   Cell values: 0=empty, 1=garbage, 2=I, 3=O, 4=T, 5=S, 6=Z, 7=J, 8=L
    board       TEXT    NOT NULL,

    -- Hold piece: '' (none) or one of 'I','O','T','S','Z','J','L'
    hold        TEXT    DEFAULT '',

    -- Upcoming piece queue: string of piece chars e.g. 'TSZIOJ'
    queue       TEXT    DEFAULT '',

    -- Instruction shown in the Goal panel during play
    goal        TEXT    DEFAULT '',

    -- Internal notes (not shown in-game)
    description TEXT    DEFAULT '',

    -- Solve percentage estimate 0-100 (used for difficulty filter)
    --   >70  = Easy
    --   40-70 = Medium
    --   <40  = Hard
    difficulty  INTEGER DEFAULT 50,

    -- Spin type required: '' (none), 'tspin', or 'allspin'
    spin_type   TEXT    DEFAULT '',

    -- Setup categories: JSON array of strings
    --   Valid values: 't-spin-setup', 'all-spin-setup', 'downstack',
    --   'count-to-4', 'opening', 'midgame', 'c-spin', 'dt-cannon',
    --   'STSD', 'pc-setup'  (plus any custom strings)
    setup_types TEXT    DEFAULT '[]',

    created_at  TEXT    DEFAULT (datetime('now'))
);

-- ── Adding a new puzzle ───────────────────────────────────────────────────────
--
-- 1. Open puzzles.db in DB Browser for SQLite (https://sqlitebrowser.org)
-- 2. Go to "Execute SQL" tab
-- 3. Run an INSERT like the example below
-- 4. Save the database
-- 5. Run: node tools/generate-embed.js   (regenerates puzzles-embed.js for file:// mode)
-- 6. Refresh the browser
--
-- INSERT INTO puzzles (id, name, board, hold, queue, goal, description,
--                      difficulty, spin_type, setup_types)
-- VALUES (
--   'puzzle-my-new-position',
--   'My New Position',
--   '[[0,0,0,0,0,0,0,0,0,0],...,(24 rows total)]',  -- 24×10 JSON array
--   'T',          -- hold piece (or '')
--   'IOTSZJL',   -- queue string
--   'Do the thing',
--   'Notes for myself',
--   55,           -- difficulty 0-100
--   'tspin',      -- '' | 'tspin' | 'allspin'
--   '["t-spin-setup","opening"]'  -- JSON array
-- );
--
-- ── Board JSON format tip ─────────────────────────────────────────────────────
--
-- Easiest way to get a board JSON:
-- 1. Build the position in Hoshtris editor mode
-- 2. Export the position (Export Position button)
-- 3. Open the exported .hosh file, copy the "board" field value
-- 4. Paste it as the board column value in your INSERT
