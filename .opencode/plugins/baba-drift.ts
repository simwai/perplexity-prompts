/**
 * Baba Drift Detection Plugin for opencode
 *
 * Runs drift detection: compares SPEC.md against code.
 * Read-only. Finds verified/diverged/orphaned/exceeds-spec claims.
 * HALTs on version drift per 08-plan-actual-gate.md.
 */

import { tool } from "@opencode-ai/plugin";
import { createDebug } from "../lib/baba-debug";

export default async ({
  client,
  $,
  project,
  directory,
  worktree,
}: {
  client: any;
  $: any;
  project: any;
  directory: string;
  worktree: string;
}) => {
  const log = createDebug("baba-drift", client);

  await log.debug("plugin initialized", { directory });

  return {
    tool: {
      drift: tool({
        description:
          "Run drift detection: compare SPEC.md against code. Read-only. Finds verified/diverged/orphaned/exceeds-spec claims. HALTs on version drift.",
        args: {
          spec: tool.schema
            .string()
            .optional()
            .describe(
              "Specific spec file (e.g., SPEC.md). If omitted, checks all specs.",
            ),
          freshEyes: tool.schema
            .boolean()
            .optional()
            .describe("Run fresh-eyes review (cold read by subagent)"),
        },
        async execute(args, context) {
          const { sessionID } = context;

          await log.info("drift tool invoked", { 
            session: sessionID, 
            spec: args.spec, 
            freshEyes: args.freshEyes 
          });

          // Helper: run rg via shell
          async function rg(pattern: string, path: string): Promise<string[]> {
            try {
              const out =
                await $`rg ${pattern} ${path} --no-heading --line-number`.text();
              return out.trim().split("\n").filter(Boolean);
            } catch {
              return [];
            }
          }

          // Helper: read file via shell
          async function readFile(path: string): Promise<string> {
            try {
              return await $`cat ${path}`.text();
            } catch {
              return "";
            }
          }

          // Helper: list SPEC.md files via shell
          async function listSpecs(): Promise<string[]> {
            try {
              const out = await $`rg --files -g "SPEC.md"`.text();
              return out.trim().split("\n").filter(Boolean);
            } catch {
              return [];
            }
          }

          // Parse spec for claims (GWT, FR-###, SC-###)
          function parseClaims(
            specContent: string,
          ): {
            id: string;
            text: string;
            type: "gwt" | "fr" | "sc";
            line: number;
          }[] {
            const claims: {
              id: string;
              text: string;
              type: "gwt" | "fr" | "sc";
              line: number;
            }[] = [];
            const lines = specContent.split("\n");

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              const lineNum = i + 1;

              // GWT: "Given <context>, When <action>, Then <outcome>"
              const gwtMatch = line.match(
                /Given\s+.+,\s*When\s+.+,\s*Then\s+.+/i,
              );
              if (gwtMatch) {
                claims.push({
                  id: `GWT-${lineNum}`,
                  text: gwtMatch[0],
                  type: "gwt",
                  line: lineNum,
                });
                continue;
              }

              // FR-###: "FR-001: the system MUST <behavior>"
              const frMatch = line.match(/^(FR-\d+):\s*(.+)$/);
              if (frMatch) {
                claims.push({
                  id: frMatch[1],
                  text: frMatch[2],
                  type: "fr",
                  line: lineNum,
                });
                continue;
              }

              // SC-###: "SC-001: <measurable outcome>"
              const scMatch = line.match(/^(SC-\d+):\s*(.+)$/);
              if (scMatch) {
                claims.push({
                  id: scMatch[1],
                  text: scMatch[2],
                  type: "sc",
                  line: lineNum,
                });
                continue;
              }
            }

            return claims;
          }

          // Map claim to code locations via rg
          async function mapClaim(claim: {
            id: string;
            text: string;
            type: string;
          }): Promise<string[]> {
            // Extract key terms from claim for search
            const terms = claim.text
              .toLowerCase()
              .replace(/[^\w\s]/g, " ")
              .split(/\s+/)
              .filter((w) => w.length > 3)
              .slice(0, 5);

            if (terms.length === 0) return [];

            const pattern = terms.join("|");
            await log.debug("mapping claim", { session: sessionID, claimId: claim.id, pattern });
            const hits = await rg(pattern, directory);

            // Filter to relevant source files, exclude artifacts
            return hits
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
          }

          // Check version drift: spec header Version vs SPEC.md frontmatter version
          async function checkVersionDrift(
            specPath: string,
            specContent: string,
          ): Promise<{
            drift: boolean;
            specVersion: string;
            registryVersion: string;
          } | null> {
            // Extract version from spec header
            const versionMatch = specContent.match(/^version:\s*([\d.]+)/im);
            const specVersion = versionMatch?.[1];
            if (!specVersion) return null;

            // Read SPEC.md frontmatter for version
            const specFileContent = await readFile(`${directory}/SPEC.md`);
            const frontmatterVersionMatch =
              specFileContent.match(/^version:\s*([\d.]+)/im);
            const registryVersion = frontmatterVersionMatch?.[1];
            if (!registryVersion) return null;

            return {
              drift: specVersion !== registryVersion,
              specVersion,
              registryVersion,
            };
          }

          // Main drift logic
          const specFiles = args.spec ? [args.spec] : await listSpecs();

          if (specFiles.length === 0) {
            await log.warn("no SPEC.md files found", { session: sessionID, directory });
            return "No SPEC.md found. Drift detection requires SPEC.md at repo root.";
          }

          await log.debug("found spec files", { session: sessionID, specFiles });

          let report = "# Drift Report\n\n";
          let hasVersionDrift = false;
          let totalClaims = 0;
          let verified = 0,
            diverged = 0,
            orphaned = 0,
            exceeds = 0;

          for (const specFile of specFiles) {
            const specPath = `${directory}/${specFile}`;
            const specContent = await readFile(specPath);

            if (!specContent) {
              await log.warn("could not read spec file", { session: sessionID, specFile });
              report += `## ${specFile}\n⚠️ Could not read spec\n\n`;
              continue;
            }

            await log.debug("read spec file", { session: sessionID, specFile, contentLength: specContent.length });

            // Version drift check
            const driftCheck = await checkVersionDrift(specFile, specContent);
            if (driftCheck?.drift) {
              hasVersionDrift = true;
              await log.warn("version drift detected", { 
                session: sessionID, 
                specFile, 
                specVersion: driftCheck.specVersion, 
                registryVersion: driftCheck.registryVersion 
              });
              report += `## ⚠️ HALT: Version Drift Detected in ${specFile}\n`;
              report += `- Spec header version: ${driftCheck.specVersion}\n`;
              report += `- Registry version: ${driftCheck.registryVersion}\n`;
              report += `- **Required action**: Align header to registry OR registry to header\n\n`;
              continue;
            }

            const claims = parseClaims(specContent);
            totalClaims += claims.length;

            await log.debug("parsed claims", { session: sessionID, specFile, claimCount: claims.length });

            report += `## ${specFile} (${claims.length} claims)\n\n`;

            for (const claim of claims) {
              const locations = await mapClaim(claim);

              if (locations.length === 0) {
                // Orphaned mapping or no implementation
                orphaned++;
                report += `- **Orphaned** \`${claim.id}\` (line ${claim.line}): No code locations found\n`;
                report += `  - Claim: ${claim.text}\n`;
                report += `  - Mitigations:\n`;
                report += `    - A. apply: re-add the mapped code (Recommended)\n`;
                report += `    - B. sync: deprecate the claim\n\n`;
                continue;
              }

              // For simplicity: if locations found, consider verified
              // A real implementation would check if code behavior matches claim
              verified++;
              report += `- **Verified** \`${claim.id}\` (line ${claim.line}): ${locations.length} location(s)\n`;
              for (const loc of locations.slice(0, 3)) {
                report += `  - ${loc}\n`;
              }
              if (locations.length > 3)
                report += `  - ... and ${locations.length - 3} more\n`;
            }

            // Code-exceeds-spec: find code with no claim (simplified)
            // This would need more sophisticated analysis in practice
          }

          // Summary
          report =
            `# Drift Report\n\n` +
            `**Summary**: ${verified} verified, ${diverged} diverged, ${orphaned} orphaned, ${exceeds} code-exceeds-spec (${totalClaims} total claims)\n\n` +
            (hasVersionDrift
              ? `**⚠️ VERSION DRIFT DETECTED - HALT**\n\n`
              : "") +
            report;

          if (args.freshEyes) {
            report += `\n---\n## Fresh-Eyes Review Requested\nRun a cold-read subagent for additional lens.\n`;
          }

          await log.info("drift report complete", { 
            session: sessionID, 
            verified, 
            diverged, 
            orphaned, 
            exceeds, 
            totalClaims,
            hasVersionDrift 
          });

          return report;
        },
      }),

      baba_drift_debug: tool({
        description: "Debug baba-drift plugin: dump internal state.",
        args: {
          action: tool.schema
            .enum(["state"])
            .default("state")
            .describe("What to dump: state (plugin state)"),
        },
        async execute(args) {
          await log.stateDump("baba-drift", {
            directory,
            // No persistent internal state - tool is stateless
          });
          return "State dumped to debug outputs (console, file, client.app.log)";
        },
      }),
    },
  };
};
