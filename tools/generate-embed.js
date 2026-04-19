/**
 * Converts data/puzzles.db into data/puzzles-embed.js (base64 encoded).
 * Required for file:// mode where fetch() is blocked.
 *
 * Usage (from project root):
 *   node tools/generate-embed.js
 *
 * Run this every time you update puzzles.db.
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const root    = path.join(__dirname, '..');
const dbPath  = path.join(root, 'data', 'puzzles.db');
const outPath = path.join(root, 'data', 'puzzles-embed.js');

if (!fs.existsSync(dbPath)) {
  console.error(`Error: ${dbPath} not found. Run: python3 tools/create-puzzles.py`);
  process.exit(1);
}

const buf = fs.readFileSync(dbPath);
const b64 = buf.toString('base64');

fs.writeFileSync(outPath,
  `// Auto-generated — do not edit.\n` +
  `// Regenerate with: node tools/generate-embed.js\n` +
  `// Source: data/puzzles.db (${buf.length} bytes → ${b64.length} chars base64)\n` +
  `window.PUZZLES_DB_B64="${b64}";\n`
);

console.log(`Generated: data/puzzles-embed.js`);
console.log(`  DB size: ${(buf.length / 1024).toFixed(1)} KB`);
console.log(`  Embed:   ${(b64.length / 1024).toFixed(1)} KB (base64)`);
