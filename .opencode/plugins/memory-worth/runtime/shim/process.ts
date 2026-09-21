import { detectRuntime } from "../detect.js";

export function shimProcess(): {
  cwd: () => string;
  platform: string;
  arch: string;
} {
  const runtime = detectRuntime();

  if (runtime === "bun") {
    const g = globalThis as unknown as { Bun?: { cwd: () => string; platform: string; arch: string } };
    return {
      cwd: () => g.Bun?.cwd() ?? process.cwd(),
      platform: g.Bun?.platform ?? process.platform,
      arch: g.Bun?.arch ?? process.arch,
    };
  }

  const proc = globalThis.process;
  return {
    cwd: () => proc.cwd(),
    platform: proc.platform,
    arch: proc.arch,
  };
}