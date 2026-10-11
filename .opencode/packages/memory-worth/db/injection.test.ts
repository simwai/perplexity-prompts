import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { runMigrations } from "./migrate.js";
import { writeMemoryFull } from "./queries.js";
import {
  buildInjectionTexts,
  detectAndCaptureMemory,
  forgetInjectionState,
} from "../hooks/chat-message.js";

let dir: string;
let db: Client;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "mw-inject-"));
  db = createClient({ url: `file:${join(dir, "inject.db")}`, intMode: "number" });
  await runMigrations(db);
});

after(async () => {
  db.close();
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (e: unknown) {
      if (attempt === 19) throw e;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
});

describe("user-facing memory feedback", () => {
  it("emits a tagged session-start line on the first message", async () => {
    forgetInjectionState("s-start");
    const lines = await buildInjectionTexts(db, "s-start", true, "hello world", "m1");
    assert.ok(lines.length > 0);
    assert.ok(lines.every((l) => l.startsWith("[MEMORY]")));
    assert.match(lines[0] as string, /Session start/);
  });

  it("does not re-emit for the same messageID", async () => {
    forgetInjectionState("s-idem");
    const first = await buildInjectionTexts(db, "s-idem", true, "parse the parser", "m1");
    const second = await buildInjectionTexts(db, "s-idem", true, "parse the parser", "m1");
    assert.ok(first.length > 0, "first call emits");
    assert.deepEqual(second, [], "duplicate messageID emits nothing");
  });

  it("emits again for a new messageID when hits change", async () => {
    forgetInjectionState("s-next");
    const first = await buildInjectionTexts(db, "s-next", true, "alpha beta gamma", "m1");
    assert.ok(first.length > 0);
    // Same hit set on the next turn: suppressed by the lastHits guard.
    const repeat = await buildInjectionTexts(db, "s-next", false, "alpha beta gamma", "m2");
    assert.deepEqual(repeat, []);
  });

  it("tags capture confirmations with the memory id", async () => {
    const out = await detectAndCaptureMemory(
      db,
      "s-capture",
      "from now on always use kebab-case for filenames",
    );
    assert.ok(out, "capture produced feedback");
    assert.match(out as string, /^\[MEMORY\] Captured as memory #\d+/);
    assert.match(out as string, /applies when:/);
  });

  it("reports duplicates instead of storing a second copy", async () => {
    const clause = "from now on always use kebab-case for filenames";
    const out = await detectAndCaptureMemory(db, "s-capture", clause);
    assert.match(out as string, /already says this/);
  });

  it("returns the stored memory for a grounded convention", async () => {
    const id = await writeMemoryFull(db, {
      content: "always prefer rg over grep in this repository",
      applies_when: "always in this project",
      tier: "L1",
      source: "user",
    });
    assert.ok(id.id > 0);
    const hits = await buildInjectionTexts(db, "s-search", false, "rg grep repository", "m9");
    const joined = hits.join("\n");
    assert.match(joined, /Retrieved \d+ memor/);
    assert.match(joined, /always prefer rg over grep in this repository/);
  });
});