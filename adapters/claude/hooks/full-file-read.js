#!/usr/bin/env node
// PreToolUse guard for the Read tool. Enforces the full-comprehension read
// rule from prompt-system/00-system.md ("Full Comprehension Read") at the
// client boundary: a Read that stops before EOF with less than the tool's
// maximum window is a sliced read, and the prompt system prohibits judging
// or editing a file from a slice.
//
// Allowed: any read whose window reaches EOF (a complete read, or the final
// chunk of an offset-chunked read) and any window of at least MAX_WINDOW
// lines (the sanctioned chunk size for files larger than one window).
//
// Contract (Claude Code command hooks):
//   input  -- hook JSON on stdin; tool args live under tool_input
//   output -- exit 0 with a permissionDecision "deny" JSON body to block,
//             exit 0 with no output to make no decision (normal flow)
// Node is the only dependency (the repo already requires Node 20+), and the
// exec-form spawn works on every platform where node.exe is a real binary.

'use strict';

const fs = require('fs');

// Claude Code's Read window when no limit is passed. A chunk at this size is
// the tool's largest window, so it is the sanctioned unit for large files.
const MAX_WINDOW = 2000;

// Above this size the line scan is not worth a hook's latency budget; the
// reader is already forced into chunks, so allow the call.
const MAX_SCAN_BYTES = 64 * 1024 * 1024;

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }) + '\n'
  );
}

function countLines(buffer) {
  let lines = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] === 0x0a) lines += 1;
  }
  // A trailing line without a newline still counts as a line.
  if (buffer.length > 0 && buffer[buffer.length - 1] !== 0x0a) lines += 1;
  return lines;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    // Unparseable input is not this hook's call to block.
    process.exit(0);
  }

  const toolInput = (payload && payload.tool_input) || {};
  const filePath = toolInput.file_path;
  if (typeof filePath !== 'string' || filePath.length === 0) {
    process.exit(0);
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    // Missing or unstatable file: let the Read tool produce its own error.
    process.exit(0);
  }
  if (!stat.isFile() || stat.size > MAX_SCAN_BYTES) {
    process.exit(0);
  }

  const offset =
    Number.isFinite(toolInput.offset) && toolInput.offset > 0
      ? Math.floor(toolInput.offset)
      : 0;
  const limit =
    Number.isFinite(toolInput.limit) && toolInput.limit > 0
      ? Math.floor(toolInput.limit)
      : MAX_WINDOW;
  if (limit >= MAX_WINDOW) {
    // Largest-window chunk: the documented offset-read pattern for big files.
    process.exit(0);
  }

  let buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (err) {
    process.exit(0);
  }

  const total = countLines(buffer);
  const end = offset + limit;
  if (end >= total) {
    // The window reaches EOF: this read is complete.
    process.exit(0);
  }

  deny(
    'Full-comprehension read required (prompt-system/00-system.md, ' +
      '"Full Comprehension Read"): Read(' + filePath + ', offset: ' + offset +
      ', limit: ' + limit + ') covers lines ' + (offset + 1) + '-' + end +
      ' of ' + total + ' and stops before EOF. Read the file in full before ' +
      'judging or editing it: omit limit for a whole-file read, or use ' +
      'limit ' + MAX_WINDOW + ' for offset-chunked reads until EOF.'
  );
  process.exit(0);
});
