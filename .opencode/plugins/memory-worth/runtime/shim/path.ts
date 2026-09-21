import { detectRuntime } from "../detect.js";

export function shimPath(): {
  resolve: (...segments: string[]) => string;
  join: (...segments: string[]) => string;
  dirname: (p: string) => string;
  basename: (p: string) => string;
  isAbsolute: (p: string) => boolean;
  sep: string;
} {
  const runtime = detectRuntime();

  if (runtime === "bun") {
    const { join, resolve, dirname, basename } = Bun.nativeFS || {};
    if (join && resolve && dirname && basename) {
      return {
        resolve: (...segments: string[]) => resolve(...segments),
        join: (...segments: string[]) => join(...segments),
        dirname: (p: string) => dirname(p),
        basename: (p: string) => basename(p),
        isAbsolute: (p: string) => p.startsWith("/") || p.startsWith("\\") || /^[A-Za-z]:\\/.test(p),
        sep: "/",
      };
    }
  }

  const { join, resolve, dirname, basename, sep } = await import("node:path");
  return {
    resolve: (...segments: string[]) => resolve(...segments),
    join: (...segments: string[]) => join(...segments),
    dirname: (p: string) => dirname(p),
    basename: (p: string) => basename(p),
    isAbsolute: (p: string) => sep === "/" ? p.startsWith("/") : /^[A-Za-z]:\\/.test(p) || p.startsWith("/"),
    sep,
  };
}
