import { detectRuntime } from "../detect.js";

export function shimEnv(): {
  get: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
} {
  const runtime = detectRuntime();

  if (runtime === "bun") {
    return {
      get: (key: string) => Bun.env[key],
      set: (key: string, value: string) => { Bun.env[key] = value; },
    };
  }

  const env = globalThis.process?.env ?? {};
  return {
    get: (key: string) => env[key],
    set: (key: string, value: string) => { env[key] = value; },
  };
}
