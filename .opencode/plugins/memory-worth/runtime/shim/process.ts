import { detectRuntime } from "../detect.js";

export function shimProcess(): {
  cwd: () => string;
  platform: string;
  arch: string;
} {
  const runtime = detectRuntime();

  if (runtime === "bun") {
    return {
      cwd: () => Bun.cwd(),
      platform: Bun.platform,
      arch: Bun.arch,
    };
  }

  const proc = globalThis.process;
  return {
    cwd: () => proc.cwd(),
    platform: proc.platform,
    arch: proc.arch,
  };
}
