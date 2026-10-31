/**
 * VibeGuard V2 — Privacy/Redaction Plugin for opencode (V2)
 *
 * Replaces V1 hooks:
 *   - experimental.chat.messages.transform  -> ctx.session.hook("context") (redact before model request)
 *   - experimental.text.complete            -> not directly supported in V2
 *   - tool.execute.before                   -> ctx.tool.hook("execute.before") (restore before tool execution)
 *
 * V2 changes:
 *   - Session hook "context" receives { messages, system, sessionID, options, agent, tools }
 *   - Tool hook "execute.before" receives { tool, sessionID, agent, messageID, id, input }
 *   - Debug logging via baba-debug (console, file, client.app.log)
 *   - Config loaded from vibeguard.config.json (project root, .opencode/, or global ~/.config/opencode/)
 */

import { Plugin } from "@opencode/plugin";
import { createDebug } from "../lib/baba-debug";
import { subscribeToEvents } from "../lib/baba-session-id";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { createHmac, randomBytes } from "node:crypto";

/* ---------- Config ---------- */

interface VibeguardConfig {
  enabled: boolean;
  debug: boolean;
  prefix: string;
  ttlMs: number;
  maxMappings: number;
  patterns: {
    keywords?: Array<{ value: string; category?: string }>;
    regex?: Array<{ pattern: string; flags?: string; category?: string }>;
    builtin?: string[];
    exclude?: string[];
  };
  loadedFrom: string;
}

function parseDurationMs(input: unknown): number {
  const raw = String(input ?? "").trim();
  if (!raw) return 60 * 60 * 1000;
  const m = raw.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/);
  if (!m) return 60 * 60 * 1000;
  const value = Number(m[1]);
  const unit = m[2];
  if (!Number.isFinite(value) || value < 0) return 60 * 60 * 1000;
  if (unit === "ms") return value;
  if (unit === "s") return value * 1000;
  if (unit === "m") return value * 60 * 1000;
  if (unit === "h") return value * 60 * 60 * 1000;
  if (unit === "d") return value * 24 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
}

function sanitizeCategory(input: string): string {
  const raw = String(input ?? "").trim();
  if (!raw) return "TEXT";
  const upper = raw.toUpperCase();
  const safe = upper.replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_");
  return safe || "TEXT";
}

function getConfigCandidates(directory: string): string[] {
  const dir = String(directory ?? process.cwd());
  const home = homedir();
  const globalConfig = join(home, ".config", "opencode", "vibeguard.config.json");
  const projectRoot = join(dir, "vibeguard.config.json");
  const projectLocal = join(dir, ".opencode", "vibeguard.config.json");
  const env = process.env.OPENCODE_VIBEGUARD_CONFIG;
  if (env) return [resolve(dir, env), projectRoot, projectLocal, globalConfig];
  return [projectRoot, projectLocal, globalConfig];
}

function loadConfig(directory: string): VibeguardConfig {
  for (const file of getConfigCandidates(directory)) {
    if (!file || !existsSync(file)) continue;
    try {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      const cfg = raw && typeof raw === "object" ? raw : {};
      return {
        enabled: Boolean(cfg.enabled),
        debug: Boolean(cfg.debug),
        prefix: typeof cfg.placeholder_prefix === "string" && cfg.placeholder_prefix ? cfg.placeholder_prefix : "__VG_",
        ttlMs: parseDurationMs(cfg.session?.ttl ?? "1h"),
        maxMappings: Number.isFinite(cfg.session?.max_mappings) && Number(cfg.session.max_mappings) > 0 ? Number(cfg.session.max_mappings) : 100000,
        patterns: cfg.patterns && typeof cfg.patterns === "object" ? cfg.patterns : {},
        loadedFrom: file,
      };
    } catch {
      continue;
    }
  }
  return {
    enabled: false,
    debug: false,
    prefix: "__VG_",
    ttlMs: 60 * 60 * 1000,
    maxMappings: 100000,
    patterns: {},
    loadedFrom: "",
  };
}

/* ---------- Pattern Engine ---------- */

const BUILTIN = new Map<string, { pattern: string; flags: string; category: string }>([
  ["email", { pattern: "[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}", flags: "i", category: "EMAIL" }],
  ["china_phone", { pattern: "(?<!\\d)1[3-9]\\d{9}(?!\\d)", flags: "", category: "CHINA_PHONE" }],
  ["china_id", { pattern: "(?<!\\d)\\d{17}[\\dXx](?!\\d)", flags: "", category: "CHINA_ID" }],
  ["uuid", { pattern: "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}", flags: "", category: "UUID" }],
  ["ipv4", { pattern: "(?:\\d{1,3}\\.){3}\\d{1,3}", flags: "", category: "IPV4" }],
  ["mac", { pattern: "(?:[0-9a-f]{2}:){5}[0-9a-f]{2}", flags: "i", category: "MAC" }],
]);

function peelInlineFlags(pattern: string, flags: string): { pattern: string; flags: string } {
  let p = pattern;
  let f = flags;
  for (;;) {
    if (p.startsWith("(?i)")) { p = p.slice(4); if (!f.includes("i")) f += "i"; continue; }
    if (p.startsWith("(?m)")) { p = p.slice(4); if (!f.includes("m")) f += "m"; continue; }
    break;
  }
  return { pattern: p, flags: f };
}

interface PatternSet {
  keywords: Array<{ value: string; category: string }>;
  regex: Array<{ pattern: string; flags: string; category: string }>;
  exclude: Set<string>;
}

function buildPatternSet(patterns: VibeguardConfig["patterns"]): PatternSet {
  const raw = patterns ?? {};
  const keywords = Array.isArray(raw.keywords) ? raw.keywords : [];
  const regex = Array.isArray(raw.regex) ? raw.regex : [];
  const builtin = Array.isArray(raw.builtin) ? raw.builtin : [];
  const exclude = Array.isArray(raw.exclude) ? raw.exclude : [];

  const keywordRules = keywords
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const value = String(x.value ?? "").trim();
      if (!value) return null;
      return { value, category: sanitizeCategory(x.category ?? "") };
    })
    .filter(Boolean) as Array<{ value: string; category: string }>;

  const regexRules: Array<{ pattern: string; flags: string; category: string }> = [];
  for (const x of regex) {
    if (!x || typeof x !== "object") continue;
    const pattern = String(x.pattern ?? "").trim();
    if (!pattern) continue;
    const category = sanitizeCategory(x.category ?? "");
    const flags = typeof x.flags === "string" ? x.flags : "";
    const peeled = peelInlineFlags(pattern, flags);
    regexRules.push({ pattern: peeled.pattern, flags: peeled.flags, category });
  }
  for (const name of builtin) {
    const key = String(name ?? "").trim();
    if (!key) continue;
    const rule = BUILTIN.get(key);
    if (!rule) continue;
    regexRules.push({ pattern: rule.pattern, flags: rule.flags, category: rule.category });
  }

  return { keywords: keywordRules, regex: regexRules, exclude: new Set(exclude.map(String)) };
}

function subtractCovered(start: number, end: number, covered: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  if (start >= end) return [];
  const out: Array<{ start: number; end: number }> = [];
  let cur = start;
  for (const c of covered) {
    if (c.end <= cur) continue;
    if (c.start >= end) break;
    if (c.start > cur) out.push({ start: cur, end: Math.min(c.start, end) });
    if (c.end >= end) { cur = end; break; }
    cur = Math.max(cur, c.end);
  }
  if (cur < end) out.push({ start: cur, end });
  return out;
}

function insertCovered(covered: Array<{ start: number; end: number }>, span: { start: number; end: number }): Array<{ start: number; end: number }> {
  if (span.start >= span.end) return covered;
  let i = 0;
  for (; i < covered.length; i++) { if (covered[i].start > span.start) break; }
  covered.splice(i, 0, span);
  if (covered.length <= 1) return covered;
  const merged: Array<{ start: number; end: number }> = [];
  for (const c of covered) {
    const last = merged.at(-1);
    if (!last) { merged.push(c); continue; }
    if (c.start <= last.end) { if (c.end > last.end) last.end = c.end; continue; }
    merged.push(c);
  }
  return merged;
}

/* ---------- Placeholder Session ---------- */

class PlaceholderSession {
  prefix: string;
  ttlMs: number;
  maxMappings: number;
  secret: Uint8Array;
  forward = new Map<string, string>();
  reverse = new Map<string, string>();
  created = new Map<string, number>();

  constructor(options: { prefix: string; ttlMs: number; maxMappings: number; secret?: Uint8Array }) {
    this.prefix = options.prefix;
    this.ttlMs = options.ttlMs;
    this.maxMappings = options.maxMappings;
    this.secret = options.secret ?? randomBytes(32);
  }

  cleanup(now = Date.now()) {
    if (!Number.isFinite(this.ttlMs) || this.ttlMs <= 0) return;
    for (const [placeholder, createdAt] of this.created.entries()) {
      if (now - createdAt <= this.ttlMs) continue;
      const original = this.forward.get(placeholder);
      this.forward.delete(placeholder);
      this.created.delete(placeholder);
      if (original !== undefined) this.reverse.delete(original);
    }
  }

  evictOldest() {
    let oldestPlaceholder = "";
    let oldestTime = Infinity;
    for (const [placeholder, createdAt] of this.created.entries()) {
      if (createdAt >= oldestTime) continue;
      oldestTime = createdAt;
      oldestPlaceholder = placeholder;
    }
    if (!oldestPlaceholder) return;
    const original = this.forward.get(oldestPlaceholder);
    this.forward.delete(oldestPlaceholder);
    this.created.delete(oldestPlaceholder);
    if (original !== undefined) this.reverse.delete(original);
  }

  lookup(placeholder: string): string | undefined {
    return this.forward.get(placeholder);
  }

  lookupReverse(original: string): string | undefined {
    return this.reverse.get(original);
  }

  generatePlaceholder(original: string, category: string): string {
    const cat = sanitizeCategory(category);
    const h = createHmac("sha256", this.secret);
    h.update(String(original));
    const sum = h.digest();
    const hash12 = Buffer.from(sum).toString("hex").slice(0, 12);
    return `${this.prefix}${cat}_${hash12}__`;
  }

  getOrCreatePlaceholder(original: string, category: string): string {
    const existing = this.lookupReverse(original);
    if (existing) return existing;

    const now = Date.now();
    this.cleanup(now);

    if (Number.isFinite(this.maxMappings) && this.maxMappings > 0) {
      while (this.forward.size >= this.maxMappings) this.evictOldest();
    }

    const base = this.generatePlaceholder(original, category);
    const current = this.forward.get(base);
    if (current === undefined) {
      this.forward.set(base, original);
      this.reverse.set(original, base);
      this.created.set(base, now);
      return base;
    }
    if (current === original) {
      this.reverse.set(original, base);
      this.created.set(base, now);
      return base;
    }

    const withoutSuffix = base.slice(0, -2);
    for (let i = 2; ; i++) {
      const candidate = `${withoutSuffix}_${i}__`;
      const prev = this.forward.get(candidate);
      if (prev === undefined) {
        this.forward.set(candidate, original);
        this.reverse.set(original, candidate);
        this.created.set(candidate, now);
        return candidate;
      }
      if (prev === original) {
        this.reverse.set(original, candidate);
        this.created.set(candidate, now);
        return candidate;
      }
    }
  }

  getPlaceholderRegex(): RegExp {
    const escaped = this.prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`${escaped}[A-Za-z0-9_]+_[a-f0-9A-F]{12}(?:_\\d+)?__`, "g");
  }
}

/* ---------- Redaction Engine ---------- */

interface RedactResult { text: string; matches: Array<{ start: number; end: number; original: string; category: string; placeholder: string }>; }

function redactText(input: string, patterns: PatternSet, session: PlaceholderSession): RedactResult {
  const text = String(input ?? "");
  if (!text) return { text, matches: [] };

  const found: Array<{ start: number; end: number; original: string; category: string }> = [];

  for (const rule of patterns.keywords) {
    const needle = rule.value;
    if (!needle) continue;
    let idx = 0;
    for (;;) {
      const pos = text.indexOf(needle, idx);
      if (pos === -1) break;
      const start = pos;
      const end = pos + needle.length;
      const original = text.slice(start, end);
      idx = end;
      if (patterns.exclude.has(original)) continue;
      found.push({ start, end, original, category: rule.category });
    }
  }

  for (const rule of patterns.regex) {
    const baseFlags = String(rule.flags ?? "");
    const flags = baseFlags.includes("g") ? baseFlags : `${baseFlags}g`;
    const re = new RegExp(rule.pattern, flags);
    for (const m of text.matchAll(re)) {
      if (!m[0]) continue;
      const start = m.index ?? -1;
      if (start < 0) continue;
      const end = start + m[0].length;
      const original = text.slice(start, end);
      if (patterns.exclude.has(original)) continue;
      found.push({ start, end, original, category: rule.category });
    }
  }

  if (found.length === 0) return { text, matches: [] };

  found.sort((a, b) => {
    if (a.start !== b.start) return b.start - a.start;
    return b.end - a.end;
  });

  const planned: Array<{ start: number; end: number; original: string; category: string; placeholder: string }> = [];
  let covered: Array<{ start: number; end: number }> = [];
  for (const m of found) {
    const segments = subtractCovered(m.start, m.end, covered);
    for (const seg of segments) {
      if (seg.start < 0 || seg.end > text.length || seg.start >= seg.end) continue;
      const placeholder = session.getOrCreatePlaceholder(text.slice(seg.start, seg.end), m.category);
      planned.push({ ...seg, original: text.slice(seg.start, seg.end), category: m.category, placeholder });
      covered = insertCovered(covered, seg);
    }
  }

  planned.sort((a, b) => b.start - a.start);

  let out = text;
  for (const m of planned) {
    out = out.slice(0, m.start) + m.placeholder + out.slice(m.end);
  }

  return { text: out, matches: planned };
}

function restoreText(input: string, session: PlaceholderSession): string {
  const text = String(input ?? "");
  if (!text) return text;
  return text.replace(session.getPlaceholderRegex(), (ph) => session.lookup(ph) ?? ph);
}

function isPlainObject(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function restoreDeep(value: unknown, session: PlaceholderSession): void {
  const seen = new WeakSet<object>();
  const walk = (node: object) => {
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const v = node[i];
        if (typeof v === "string") node[i] = restoreText(v, session);
        if (v && typeof v === "object") walk(v as object);
      }
      return;
    }
    if (!isPlainObject(node)) return;
    for (const key of Object.keys(node)) {
      const v = (node as Record<string, unknown>)[key];
      if (typeof v === "string") (node as Record<string, unknown>)[key] = restoreText(v, session);
      if (v && typeof v === "object") walk(v as object);
    }
  };
  if (value && typeof value === "object") walk(value as object);
}

function redactDeep(value: unknown, patterns: PatternSet, session: PlaceholderSession): void {
  const seen = new WeakSet<object>();
  const walk = (node: object) => {
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const v = node[i];
        if (typeof v === "string") node[i] = redactText(v, patterns, session).text;
        if (v && typeof v === "object") walk(v as object);
      }
      return;
    }
    if (!isPlainObject(node)) return;
    for (const key of Object.keys(node)) {
      const v = (node as Record<string, unknown>)[key];
      if (typeof v === "string") (node as Record<string, unknown>)[key] = redactText(v, patterns, session).text;
      if (v && typeof v === "object") walk(v as object);
    }
  };
  if (value && typeof value === "object") walk(value as object);
}

/* ---------- V2 Plugin ---------- */

export default Plugin.define({
  id: "vibeguard-v2",

  async setup(ctx) {
    const config = loadConfig(ctx.location.directory);
    const log = createDebug("vibeguard-v2");

    await log.debug("plugin initialized", {
      directory: ctx.location.directory,
      enabled: config.enabled,
      loadedFrom: config.loadedFrom || "none (disabled)",
      prefix: config.prefix,
    });

    if (!config.enabled) return;

    const patterns = buildPatternSet(config.patterns);
    const sessions = new Map<string, PlaceholderSession>();

    const getSession = (sessionID: string | undefined): PlaceholderSession | null => {
      const key = String(sessionID ?? "");
      if (!key) return null;
      let existing = sessions.get(key);
      if (existing) return existing;
      const created = new PlaceholderSession({
        prefix: config.prefix,
        ttlMs: config.ttlMs,
        maxMappings: config.maxMappings,
      });
      sessions.set(key, created);
      return created;
    };

    /* ---- Session context hook: redact messages/system before model request ---- */
    void ctx.session.hook("context", async (event: any) => {
      const sessionID = event.sessionID as string | undefined;
      if (!sessionID) return;

      const session = getSession(sessionID);
      if (!session) return;

      session.cleanup();

      // Redact system prompt parts
      if (Array.isArray(event.system)) {
        let changedSystem = 0;
        for (const part of event.system) {
          if (part?.type === "text" && typeof part.text === "string") {
            const before = part.text;
            const after = redactText(before, patterns, session).text;
            if (after !== before) { part.text = after; changedSystem++; }
          }
        }
        if (config.debug && changedSystem > 0) {
          await log.debug("redacted system parts", { session: sessionID, count: changedSystem });
        }
      }

      // Redact message parts
      if (Array.isArray(event.messages)) {
        let changedMessages = 0;
        for (const msg of event.messages) {
          const parts = Array.isArray((msg as any)?.parts) ? (msg as any).parts : [];
          for (const part of parts) {
            if (!part) continue;
            if (part.type === "text" && typeof part.text === "string" && !part.ignored) {
              const before = part.text;
              const after = redactText(before, patterns, session).text;
              if (after !== before) { part.text = after; changedMessages++; }
            } else if (part.type === "reasoning" && typeof part.text === "string") {
              const before = part.text;
              const after = redactText(before, patterns, session).text;
              if (after !== before) { part.text = after; changedMessages++; }
            } else if (part.type === "tool" && part.state && typeof part.state === "object") {
              const state = part.state as Record<string, unknown>;
              if (state.input && typeof state.input === "object") {
                redactDeep(state.input, patterns, session);
              }
              if (state.status === "completed" && typeof state.output === "string") {
                const before = state.output;
                const after = redactText(before, patterns, session).text;
                if (after !== before) { state.output = after; changedMessages++; }
              } else if (state.status === "error" && typeof state.error === "string") {
                const before = state.error;
                const after = redactText(before, patterns, session).text;
                if (after !== before) { state.error = after; changedMessages++; }
              } else if (state.status === "pending" && typeof state.raw === "string") {
                const before = state.raw;
                const after = redactText(before, patterns, session).text;
                if (after !== before) { state.raw = after; changedMessages++; }
              }
            }
          }
        }
        if (config.debug && changedMessages > 0) {
          await log.debug("redacted message parts", { session: sessionID, count: changedMessages });
        }
      }
    });

    /* ---- Tool execute.before hook: restore placeholders in tool args before execution ---- */
    void ctx.tool.hook("execute.before", async (event) => {
      const sessionID = event.sessionID;
      if (!sessionID) return;

      const session = getSession(sessionID);
      if (!session) return;

      session.cleanup();

      const input = event.input;
      if (input && typeof input === "object") {
        restoreDeep(input, session);
      }
    });

    /* ---- Debug tool ---- */
    void ctx.tool.transform((editor) => {
      editor.add({
        name: "vibeguard_debug",
        description: "Debug vibeguard-v2 plugin: dump internal state.",
        input: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["state", "sessions", "config"], default: "state" },
          },
        },
        async execute(input: unknown) {
          const action = typeof input === "object" && input !== null && "action" in input ? String(input.action) : "state";
          if (action === "sessions") {
            const out: Record<string, unknown> = {};
            for (const [id, sess] of sessions) {
              out[id] = { forwardSize: sess.forward.size, reverseSize: sess.reverse.size };
            }
            return { output: JSON.stringify(out, null, 2) };
          }
          if (action === "config") {
            return { output: JSON.stringify({ ...config, patterns: "omitted" }, null, 2) };
          }
          await log.stateDump("vibeguard-v2", { sessionCount: sessions.size, config: { ...config, patterns: "omitted" } });
          return { output: "State dumped to debug outputs (console, file, client.app.log)" };
        },
      });
    });

    return () => { sessions.clear(); };
  },
});