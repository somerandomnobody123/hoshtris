"""
Converts data/puzzles.db into data/puzzles-embed.js (base64 encoded).
Required for file:// mode where fetch() is blocked.

Usage (from project root):
    python3 tools/generate-embed.py

Run this every time you update puzzles.db.
"""
import base64
from pathlib import Path

root     = Path(__file__).parent.parent
db_path  = root / 'data' / 'puzzles.db'
out_path = root / 'data' / 'puzzles-embed.js'

if not db_path.exists():
    raise FileNotFoundError(f'{db_path} not found. Run: python3 tools/create-puzzles.py')

buf = db_path.read_bytes()
b64 = base64.b64encode(buf).decode('ascii')

out_path.write_text(
    '// Auto-generated — do not edit.\n'
    '// Regenerate with: python3 tools/generate-embed.py\n'
    f'// Source: data/puzzles.db ({len(buf)} bytes → {len(b64)} chars base64)\n'
    f'window.PUZZLES_DB_B64="{b64}";\n'
)

print(f'Generated: data/puzzles-embed.js')
print(f'  DB size: {len(buf)/1024:.1f} KB')
print(f'  Embed:   {len(b64)/1024:.1f} KB (base64)')
