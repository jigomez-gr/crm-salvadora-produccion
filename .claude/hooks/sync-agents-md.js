// PostToolUse hook (matcher: Write|Edit).
// When a CLAUDE.md is written/edited, mirror it onto the sibling AGENTS.md in
// the same directory. CLAUDE.md is the source of truth; AGENTS.md is generated.
// Reads the hook payload (JSON) from stdin; never blocks the tool on error.
const path = require('path');
const fs = require('fs');

let raw = '';
process.stdin.on('data', (chunk) => (raw += chunk));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw || '{}');
    const file =
      (input.tool_input && input.tool_input.file_path) ||
      (input.tool_response && input.tool_response.filePath);
    if (!file) return;
    if (path.basename(file) !== 'CLAUDE.md') return;
    const sibling = path.join(path.dirname(file), 'AGENTS.md');
    fs.copyFileSync(file, sibling);
  } catch {
    // Sync failures must never break the edit/write that triggered the hook.
  }
});
