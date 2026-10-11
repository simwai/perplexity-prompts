#!/usr/bin/env bun
/**
 * Test script to verify baba-debug library works across all 4 output destinations:
 * 1. console.error (stderr)
 * 2. File (JSONL)
 * 3. client.app.log (mocked)
 * 4. stateDump structured output
 */

import { createDebug, flushDebugBuffers, getDebugConfig } from "./lib/baba-debug.ts";

// Mock client with app.log
const mockClient = {
  app: {
    log: async (opts: any) => {
      console.log(`[MOCK client.app.log] ${opts.body.service} ${opts.body.level}: ${opts.body.message}`, opts.body.extra ?? "");
    }
  }
};

async function testDebugLibrary() {
  console.log("=== Testing baba-debug library ===\n");

  // Test 1: Basic logging at different levels
  console.log("Test 1: Basic logging at different levels");
  const log1 = createDebug("test-plugin", mockClient);
  
  await log1.debug("debug message", { foo: "bar", count: 42 });
  await log1.info("info message", { session: "abc123" });
  await log1.warn("warn message", { retry: 2 });
  await log1.error("error message", { code: "E_FAILED" });
  
  console.log("");

  // Test 2: stateDump (at debug level - won't show with default info level)
  console.log("Test 2: stateDump (debug level - filtered by default info level)");
  await log1.stateDump("test-state", {
    sessions: new Map([["sess1", { phase: "PLAN", files: ["a.ts", "b.ts"] }]]),
    config: { maxDepth: 3, enabled: true },
    timestamp: new Date().toISOString(),
  });
  
  // But we can call it at info level to see it
  await log1.info("STATE DUMP: test-state (info level)", {
    label: "test-state",
    stateType: "object",
    stateKeys: ["sessions", "config", "timestamp"],
    stateValue: {
      sessions: { "sess1": { phase: "PLAN", files: ["a.ts", "b.ts"] } },
      config: { maxDepth: 3, enabled: true },
      timestamp: new Date().toISOString(),
    },
  });
  
  console.log("");

  // Test 3: Child logger with default meta
  console.log("Test 3: Child logger with default meta");
  const childLog = log1.child({ sessionId: "test-session", requestId: "req-456" });
  await childLog.debug("child debug message", { extra: "data" });
  await childLog.info("child info message");
  
  console.log("");

  // Test 4: Level filtering
  console.log("Test 4: Level filtering (BABA_DEBUG_LEVEL=warn)");
  process.env.BABA_DEBUG_LEVEL = "warn";
  const log2 = createDebug("test-filter", mockClient);
  await log2.debug("this should NOT appear (debug < warn)");
  await log2.info("this should NOT appear (info < warn)");
  await log2.warn("this SHOULD appear (warn >= warn)");
  await log2.error("this SHOULD appear (error >= warn)");
  delete process.env.BABA_DEBUG_LEVEL;
  
  console.log("");

  // Test 5: Plugin filtering
  console.log("Test 5: Plugin filtering (BABA_DEBUG=test-filter)");
  process.env.BABA_DEBUG = "test-filter";
  const log3 = createDebug("other-plugin", mockClient);
  await log3.debug("this should NOT appear (plugin not in filter)");
  const log4 = createDebug("test-filter", mockClient);
  await log4.debug("this SHOULD appear (plugin in filter)");
  delete process.env.BABA_DEBUG;
  
  console.log("");

  // Test 6: File output
  console.log("Test 6: File output (BABA_DEBUG_FILE)");
  const testFile = process.env.TEMP ? `${process.env.TEMP}\\baba-debug-test.jsonl` : "C:\\baba-debug-test.jsonl";
  process.env.BABA_DEBUG_FILE = testFile;
  process.env.BABA_DEBUG = "*";
  const log5 = createDebug("file-test", mockClient);
  await log5.info("file output test", { writtenTo: testFile });
  await flushDebugBuffers();
  delete process.env.BABA_DEBUG_FILE;
  delete process.env.BABA_DEBUG;
  
  // Read back file
  const fs = await import("node:fs/promises");
  try {
    const fileContent = await fs.readFile(testFile, "utf-8");
    console.log("File content:");
    console.log(fileContent);
  } catch (e) {
    console.log("File read failed (expected on Windows without /tmp):", e.message);
  }
  
  console.log("");

  // Test 7: getDebugConfig
  console.log("Test 7: getDebugConfig");
  process.env.BABA_DEBUG = "plugin1,plugin2";
  process.env.BABA_DEBUG_LEVEL = "debug";
  process.env.BABA_DEBUG_FILE = "/tmp/test.jsonl";
  const config = getDebugConfig();
  console.log("Config:", JSON.stringify(config, null, 2));
  delete process.env.BABA_DEBUG;
  delete process.env.BABA_DEBUG_LEVEL;
  delete process.env.BABA_DEBUG_FILE;
  
  console.log("");

  console.log("=== All tests completed ===");
}

testDebugLibrary().catch(console.error);