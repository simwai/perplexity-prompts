import { shimPath } from "../runtime/shim/path.js";
import { hashString } from "../core/prng.js";

/**
 * Resolves a stable, machine-unique project id from the current working
 * directory. Resolution order:
 *
 *  1. MEMORY_WORTH_PROJECT env var (explicit escape hatch, e.g. monorepo pins)
 *  2. Git remote origin: normalized host/owner/repo (scheme, userinfo, tokens,
 *     `.git` suffix stripped; ssh:// and https://oauth2:token@ handled)
 *  3. basename(toplevel)@<sha256(absPath)[0..8]] — stable for local-only repos,
 *     collision-resistant between two repos with the same basename
 *  4. basename(cwd)@<hash> — last resort, walks up when basename is `.opencode`
 *     or `.git` so cwd-drift forks cannot recur
 *
 * `global` is reserved; if a repo resolves to it, it is suffixed with its hash.
 * `default` is treated as a legacy alias, never a real project id.
 */
export async function resolveProjectId(cwd: string): Promise<string> {
  const env = process.env.MEMORY_WORTH_PROJECT;
  if (env && env.trim()) {
    return normalizeProjectId(env.trim());
  }

  const toplevel = await findToplevel(cwd);
  if (toplevel) {
    const remote = await readOriginUrl(toplevel);
    if (remote) {
      const normalized = normalizeGitUrl(remote);
      if (normalized) {
        return normalized;
      }
    }
    const base = shimPath().basename(toplevel);
    const suffix = hashString(toplevel).toString(16).slice(0, 8);
    return `${base}@${suffix}`;
  }

  const base = shimPath().basename(cwd);
  const suffix = hashString(cwd).toString(16).slice(0, 8);
  return `${base}@${suffix}`;
}

function normalizeProjectId(raw: string): string {
  const id = raw.toLowerCase().replace(/[^a-z0-9\-@]/g, "-");
  if (id === "global") {
    return `global@${hashString(raw).toString(16).slice(0, 8)}`;
  }
  if (id === "default") {
    return "default";
  }
  return id;
}

async function findToplevel(cwd: string): Promise<string | null> {
  const path = shimPath();
  const fs = await import("node:fs");
  let dir = cwd;
  for (let i = 0; i < 10; i++) {
    const gitDir = path.join(dir, ".git");
    try {
      if (fs.existsSync(gitDir)) {
        return dir;
      }
    } catch {
      // not a directory, keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function readOriginUrl(toplevel: string): Promise<string | null> {
  try {
    const { execSync } = await import("node:child_process");
    const url = execSync("git config --get remote.origin.url", {
      cwd: toplevel,
      encoding: "utf8",
      maxBuffer: 1024,
    });
    return String(url).trim() || null;
  } catch {
    return null;
  }
}

function normalizeGitUrl(url: string): string | null {
  // Strip scheme and userinfo (tokens, oauth2, etc.) — never leak credentials
  let cleaned = url
    .replace(/^.*:\/\/(?:[^@]+@)?/, "") // strip scheme://userinfo@
    .replace(/\.git$/, "") // strip .git suffix
    .replace(/\/+$/, ""); // strip trailing slashes

  // Handle Azure DevOps _git/ paths
  cleaned = cleaned.replace(/_git\//, "/");

  // Split host/owner/repo
  const parts = cleaned.split("/");
  if (parts.length < 2) return null;

  const host = parts[0];
  const owner = parts[1];
  const repo = parts.slice(2).join("/") || owner;

  const id = `${host}/${owner}/${repo}`.toLowerCase();
  return id === "global" ? null : id;
}

/**
 * Returns the reserved global project id. Used for cross-project memories
 * that apply to every repository on the machine.
 */
export function globalProjectId(): string {
  return "global";
}

/**
 * Returns true if a project id is the reserved global id.
 */
export function isGlobalProjectId(id: string): boolean {
  return id === "global";
}
