#!/usr/bin/env node
// Validates every Mermaid block in the given Markdown files.
//
// `mmdc -i <file.md>` accepts Markdown directly and renders each ```mermaid
// block it finds, so one invocation per file covers all diagrams in it. Going
// through the real renderer rather than a grammar means the check matches what
// GitHub actually renders -- a diagram that passes here renders there.
//
// Exits 1 if any diagram fails to parse, printing the renderer's own error so
// the failure names the construct that broke rather than a generic message.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const files = process.argv.slice(2);

if (files.length === 0) {
  console.log('no markdown files given');
  process.exit(0);
}

const artefacts = mkdtempSync(join(tmpdir(), 'mermaid-check-'));
let failures = 0;
let diagrams = 0;

try {
  for (const [index, file] of files.entries()) {
    const out = join(artefacts, `out-${index}.md`);
    // shell:true is required on Windows, where the launcher is npx.cmd and
    // spawnSync cannot resolve it otherwise (ENOENT).
    const result = spawnSync(
      'npx',
      [
        '--yes',
        '@mermaid-js/mermaid-cli@11',
        '-i', file,
        '-o', out,
        '-a', artefacts,
        '-p', 'scripts/puppeteer-config.json',
      ],
      { encoding: 'utf8', shell: true },
    );

    const combined = `${result.stdout || ''}${result.stderr || ''}`;

    const found = combined.match(/Found (\d+) mermaid charts?/);
    diagrams += found ? Number(found[1]) : 0;

    if (result.status === 0) {
      console.log(`PASS  ${file} (${found ? found[1] : 0} chart)`);
      continue;
    }

    failures += 1;
    const detail = combined
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      // Drop the renderer stack; keep the message a reader can act on.
      .filter((line) => !/^at |^node:|internal\/|\.mjs:\d+/.test(line))
      .filter((line) => !/^(npx|Parsing|Rendering|Found \d+)/.test(line))
      .slice(0, 6)
      .join('\n      ');
    console.log(`FAIL  ${file}`);
    if (detail) console.log(`      ${detail}`);
  }
} finally {
  rmSync(artefacts, { recursive: true, force: true });
}

console.log(`\nchecked ${diagrams} chart(s) across ${files.length} file(s); ${failures} file(s) failed`);
process.exit(failures > 0 ? 1 : 0);
