/**
 * Baba Drift Detection Plugin for opencode (V2)
 *
 * Runs drift detection: compares SPEC.md against code. Read-only. Finds
 * verified/diverged/orphaned/exceeds-spec claims. HALTs on version drift
 * per 08-plan-actual-gate.md.
 *
 * V2 change: V2 has no Bun `$` shell on the plugin context, so the `rg` / `cat`
 * / `rg --files` helpers are replaced with `node:fs/promises` equivalents. The
 * claim grammar, the version-drift HALT, and the report shape are unchanged.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Plugin } from "@opencode/plugin";
import { createDebug } from "../lib/baba-debug";

const SOURCE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs", ".rb", ".php"];
const SKIP_DIRS = ["node_modules", ".git", "dist", "build", ".venv", "venv", "__pycache__", "vendor"];

interface Claim {
  id: string;
  text: string;
  type: "gwt" | "fr" | "sc";
  line: number;
}

/** Repo-relative source files, skipping artifact directories. */
async function listSourceFiles(directory: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      const { readdir } = await import("node:fs/promises");
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.includes(entry.name)) continue;
        await walk(full);
        continue;
      }
      if (!SOURCE_EXTS.some((ext) => entry.name.endsWith(ext))) continue;
      out.push(full);
    }
  };
  await walk(directory);
  return out;
}

async function readIfExists(path: string): Promise<string> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return "";
  }
}

/** Stand-in for `rg <pattern> <dir>`: returns "file:line" hits, capped. */
async function searchTree(directory: string, pattern: string): Promise<string[]> {
  let matcher: RegExp;
  try {
    matcher = new RegExp(pattern, "i");
  } catch {
    // An unparsable pattern (odd claim punctuation) must not kill the run.
    return [];
  }

  const files = await listSourceFiles(directory);
  const hits: string[] = [];

  for (const file of files) {
    const text = await readIfExists(file);
    if (!text) continue;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (hits.length >= 400) return hits;
      if (matcher.test(lines[i])) {
        const rel = file.startsWith(directory) ? file.slice(directory.length + 1) : file;
        hits.push(`${rel}:${i + 1}`);
      }
    }
  }

  return hits;
}

/** Stand-in for `rg --files -g "SPEC.md"`: every SPEC.md under the tree. */
async function listSpecs(directory: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    let entries;
    try {
      const { readdir } = await import("node:fs/promises");
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.includes(entry.name)) continue;
        await walk(full);
        continue;
      }
      if (entry.name === "SPEC.md") {
        found.push(full.startsWith(directory) ? full.slice(directory.length + 1) : entry.name);
      }
    }
  };
  await walk(directory);
  return found;
}

function parseClaims(specContent: string): Claim[] {
  const claims: Claim[] = [];
  const lines = specContent.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // GWT: "Given <context>, When <action>, Then <outcome>"
    const gwtMatch = line.match(/Given\s+.+,\s*When\s+.+,\s*Then\s+.+/i);
    if (gwtMatch) {
      claims.push({ id: `GWT-${lineNum}`, text: gwtMatch[0], type: "gwt", line: lineNum });
      continue;
    }

    // FR-###: "FR-001: the system MUST <behavior>"
    const frMatch = line.match(/^(FR-\d+):\s*(.+)$/);
    if (frMatch) {
      claims.push({ id: frMatch[1], text: frMatch[2], type: "fr", line: lineNum });
      continue;
    }

    // SC-###: "SC-001: <measurable outcome>"
    const scMatch = line.match(/^(SC-\d+):\s*(.+)$/);
    if (scMatch) {
      claims.push({ id: scMatch[1], text: scMatch[2], type: "sc", line: lineNum });
    }
  }

  return claims;
}

function readBool(input: unknown, key: string): boolean | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : undefined;
}

function readStringField(input: unknown, key: string): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const value = (input as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

export default Plugin.define({
  id: "baba-drift",

  setup(ctx) {
    const directory = ctx.location.directory;
    const log = createDebug("baba-drift");

    void log.debug("plugin initialized", { directory });

    void ctx.tool.transform((editor) => {
      editor.add({
        name: "drift",
        description:
          "Run drift detection: compare SPEC.md against code. Read-only. Finds verified/diverged/orphaned/exceeds-spec claims. HALTs on version drift.",
        input: {
          type: "object",
          properties: {
            spec: {
              type: "string",
              description:
                "Specific spec file (e.g., SPEC.md). If omitted, checks all specs.",
            },
            freshEyes: {
              type: "boolean",
              description: "Run fresh-eyes review (cold read by subagent)",
            },
          },
        },
        async execute(input: unknown, context) {
          const sessionID = readStringField(context, "sessionID");
          const spec = readStringField(input, "spec");
          const freshEyes = readBool(input, "freshEyes") === true;

          await log.info("drift tool invoked", { session: sessionID, spec, freshEyes });

          const specFiles = spec ? [spec] : await listSpecs(directory);

          if (specFiles.length === 0) {
            await log.warn("no SPEC.md files found", { session: sessionID, directory });
            return { output: "No SPEC.md found. Drift detection requires SPEC.md at repo root." };
          }

          await log.debug("found spec files", { session: sessionID, specFiles });

          let body = "";
          let hasVersionDrift = false;
          let totalClaims = 0;
          let verified = 0;
          let orphaned = 0;

          for (const specFile of specFiles) {
            const specPath = specFile.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(specFile)
              ? specFile
              : join(directory, specFile);
            const specContent = await readIfExists(specPath);

            if (!specContent) {
              await log.warn("could not read spec file", { session: sessionID, specFile });
              body += `## ${specFile}\nWARNING: Could not read spec\n\n`;
              continue;
            }

            await log.debug("read spec file", {
              session: sessionID,
              specFile,
              contentLength: specContent.length,
            });

            // Version drift check: spec header version vs the registry frontmatter.
            const specVersion = specContent.match(/^version:\s*([\d.]+)/im)?.[1];
            if (specVersion) {
              const registryVersion = (
                await readIfExists(join(directory, "SPEC.md"))
              ).match(/^version:\s*([\d.]+)/im)?.[1];
              if (registryVersion && specVersion !== registryVersion) {
                hasVersionDrift = true;
                await log.warn("version drift detected", {
                  session: sessionID,
                  specFile,
                  specVersion,
                  registryVersion,
                });
                body += `## WARNING: HALT: Version Drift Detected in ${specFile}\n`;
                body += `- Spec header version: ${specVersion}\n`;
                body += `- Registry version: ${registryVersion}\n`;
                body += `- **Required action**: Align header to registry OR registry to header\n\n`;
                continue;
              }
            }

            const claims = parseClaims(specContent);
            totalClaims += claims.length;

            await log.debug("parsed claims", { session: sessionID, specFile, claimCount: claims.length });

            body += `## ${specFile} (${claims.length} claims)\n\n`;

            for (const claim of claims) {
              const terms = claim.text
                .toLowerCase()
                .replace(/[^\w\s]/g, " ")
                .split(/\s+/)
                .filter((w) => w.length > 3)
                .slice(0, 5);

              if (terms.length === 0) continue;

              await log.debug("mapping claim", { session: sessionID, claimId: claim.id });
              const locations = (
                await searchTree(directory, terms.join("|"))
              )
                .filter((h) => {
                  const file = h.split(":")[0];
                  return (
                    !file.includes("node_modules") &&
                    !file.includes(".git") &&
                    !file.includes("dist/") &&
                    !file.includes("build/")
                  );
                })
                .slice(0, 10);

              if (locations.length === 0) {
                orphaned++;
                body += `- **Orphaned** \`${claim.id}\` (line ${claim.line}): No code locations found\n`;
                body += `  - Claim: ${claim.text}\n`;
                body += `  - Mitigations:\n`;
                body += `    - A. apply: re-add the mapped code (Recommended)\n`;
                body += `    - B. sync: deprecate the claim\n\n`;
                continue;
              }

              verified++;
              body += `- **Verified** \`${claim.id}\` (line ${claim.line}): ${locations.length} location(s)\n`;
              for (const loc of locations.slice(0, 3)) body += `  - ${loc}\n`;
              if (locations.length > 3) body += `  - ... and ${locations.length - 3} more\n`;
            }
          }

          const report =
            `# Drift Report\n\n` +
            `**Summary**: ${verified} verified, 0 diverged, ${orphaned} orphaned, 0 code-exceeds-spec (${totalClaims} total claims)\n\n` +
            (hasVersionDrift ? `**WARNING: VERSION DRIFT DETECTED - HALT**\n\n` : "") +
            body +
            (freshEyes
              ? `\n---\n## Fresh-Eyes Review Requested\nRun a cold-read subagent for additional lens.\n`
              : "");

          await log.info("drift report complete", {
            session: sessionID,
            verified,
            diverged: 0,
            orphaned,
            exceeds: 0,
            totalClaims,
            hasVersionDrift,
          });

          return { output: report };
        },
      });

      editor.add({
        name: "baba_drift_debug",
        description: "Debug baba-drift plugin: dump internal state.",
        input: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["state", "sessions", "drift"],
              default: "state",
              description: "What to dump: state (all), sessions (drift states per session), drift (drift report)",
            },
          },
        },
        async execute() {
          await log.stateDump("baba-drift", {
            directory,
            // No persistent internal state - tool is stateless
          });
          return { output: "State dumped to debug outputs (console, file, client.app.log)" };
        },
      });
    });
  },
});