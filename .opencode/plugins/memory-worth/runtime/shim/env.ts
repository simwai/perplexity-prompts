import { detectRuntime } from "../detect.js";

export function shimEnv(): {
  get: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
} {
  const runtime = detectRuntime();

  if (runtime === "bun") {
    const g = globalThis as unknown as { Bun?: { env: Record<string, string | undefined> } };
    return {
      get: (key: string) => g.Bun?.env[key],
      set: (key: string, value: string) => { if (g.Bun) g.Bun.env[key] = value; },
    };
  }

  const env = globalThis.process?.env ?? {};
  return {
    get: (key: string) => env[key],
    set: (key: string, value: string) => { env[key] = value; },
  };
}