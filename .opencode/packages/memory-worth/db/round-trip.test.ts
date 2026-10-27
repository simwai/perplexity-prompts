import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { runMigrations } from "./migrate.js";
import {
  ensureTaskType,
  getMemoryFull,
  getTuningParams,
  searchMemoriesFull,
  updateMemoryFull,
  writeMemoryFull,
} from "./queries.js";

const TASK = "rt-task";
const CONTENT = "roundtrip sentinel alpha memory for isolated database verification";

let dir: string;
let db: Client;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), "mw-roundtrip-"));
  db = createClient({ url: `file:${join(dir, "roundtrip.db")}`, intMode: "number" });
  await runMigrations(db);
  await ensureTaskType(db, TASK);
});

after(async () => {
  db.close();
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      if (attempt === 19) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
});

describe("round-trip", () => {
  it("writes and reads back a memory with its task type", async () => {
    const written = await writeMemoryFull(db, {
      content: CONTENT,
      applies_when: "roundtrip tests",
      tags: ["rt", "alpha"],
      taskType: TASK,
      project: "rt-test",
    });
    const fetched = await getMemoryFull(db, written.id);
    assert.ok(fetched !== null);
    assert.equal(fetched.content, CONTENT);
    assert.equal(fetched.tags.sort().join(","), "alpha,rt");
    assert.equal(fetched.task_type, TASK);
    assert.equal(fetched.s_plus + fetched.s_minus, 1);
  });

  it("search returns stored task types", async () => {
    const unfiltered = await searchMemoriesFull(db, "roundtrip sentinel", {
      limit: 10,
      projects: ["rt-test"],
    });
    const hit = unfiltered.find((row) => row.content === CONTENT);
    assert.ok(hit !== undefined);
    assert.equal(hit.task_type, TASK);
    const filtered = await searchMemoriesFull(db, "roundtrip sentinel", {
      limit: 10,
      projects: ["rt-test"],
    });
    assert.ok(filtered.some((row) => row.content === CONTENT));
  });

  it("updates content and preserves mw", async () => {
    const written = await writeMemoryFull(db, {
      content: "roundtrip update probe memory",
      applies_when: "roundtrip tests",
      taskType: TASK,
      project: "rt-test",
    });
    const before = await getMemoryFull(db, written.id);
    assert.ok(before !== null);
    const beforeMw = before.mw;
    const updated = await updateMemoryFull(db, written.id, "roundtrip update probe memory revised", ["rev"]);
    assert.equal(updated, true);
    const after = await getMemoryFull(db, written.id);
    assert.ok(after !== null);
    assert.equal(after.content, "roundtrip update probe memory revised");
    assert.equal(after.mw, beforeMw);
  });

  it("seeds governance tuning params through migrations", async () => {
    const params = await getTuningParams(db);
    assert.equal(params.decay_rate, 0.3);
    assert.equal(params.min_evidence, 5);
  });
});
