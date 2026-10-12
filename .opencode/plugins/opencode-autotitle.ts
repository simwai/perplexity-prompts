// The bundle lives in a sibling directory because opencode's discovery glob is
// {plugin,plugins}/*.{ts,js} non-recursive: a file directly in plugins/ would be
// loaded twice. Only the V2 entrypoint is re-exported; the old build also
// exported test helpers and a non-callable constant, which aborted the loader.
export { default } from "../packages/opencode-autotitle-impl/index.ts";