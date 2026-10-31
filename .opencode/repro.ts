import { memoryWriteTool } from "./packages/memory-worth/tools/memory-write.js";
async function main() {
  const ctx = { sessionID: "s1", messageID: "m1", agent: "test", directory: "C:/Temp/mw-repro", worktree: "C:/Temp/mw-repro", abort: new AbortController().signal, metadata: () => undefined, ask: async () => undefined };
  try {
    const r = await memoryWriteTool.execute({ content: "repro test content", applies_when: "repro", tags: ["repro"] }, ctx);
    console.log("RESULT:", JSON.stringify(r));
  } catch (e) {
    console.error("ERROR:", e.message);
    console.error(e.stack);
  }
}
main();
