// PreToolUse(Bash) hook — this project forbids npm/npx (considered insecure).
// Blocks any Bash command that *invokes* npm or npx and tells the caller to use
// pnpm. Reads the tool-call JSON on stdin, emits a PreToolUse "deny" decision.
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let cmd = '';
  try {
    cmd = (JSON.parse(input).tool_input || {}).command || '';
  } catch {
    // Unparseable input — don't block.
  }

  // Match `npm`/`npx` only when invoked as a command: at the start, or after a
  // shell separator (; && || | & newline "("), allowing leading env-assignments
  // (FOO=bar npm ...) and sudo. This never matches "pnpm" (the "npm" inside it
  // is preceded by "p", not a separator) nor "npm" appearing inside a word.
  const re = /(^|[\n;&|(]|&&|\|\|)\s*(\w+=\S*\s+)*(sudo\s+)*(npm|npx)(\s|$)/;

  if (re.test(cmd)) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason:
            'npm/npx is forbidden in this project (considered insecure). ' +
            'Use pnpm instead: `pnpm install`, `pnpm <script>`, ' +
            '`pnpm exec <bin>` (replaces npx <bin>), `pnpm dlx <pkg>`.',
        },
      })
    );
  }
  process.exit(0);
});
