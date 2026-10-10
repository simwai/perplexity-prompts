/**
 * Plugin entry point for the memory-worth package.
 *
 * opencode resolves each entry in `plugin` through its own package cache
 * (~/.cache/opencode/packages). A bare directory or package name is treated
 * as an npm specifier: it tries to install it, and when no such package
 * exists the load is skipped silently, registering no tools and logging no
 * error. An explicit .ts file path is imported directly, which is how every
 * other local plugin in this repo resolves.
 *
 * This file exists so the config can point at a path. Do not add logic here.
 */
export { default } from "./memory-worth/index.js";