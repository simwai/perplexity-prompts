import { detectRuntime } from "./detect.js";

export type ShellResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export async function createShell(): Promise<(cmd: string, args: string[]) => Promise<ShellResult>> {
  const runtime = detectRuntime();

  if (runtime === "bun") {
    const processModule = await import("bun:process" as string);
    const spawn = (processModule as unknown as { spawn: (opts: { cmd: string; args: string[]; stdout: string; stderr: string }) => { exited: Promise<number | undefined>; stdout?: { on: (event: string, cb: (chunk: Buffer) => void) => void }; stderr?: { on: (event: string, cb: (chunk: Buffer) => void) => void } } }).spawn;
    return async (cmd: string, args: string[]): Promise<ShellResult> => {
      const proc = spawn({ cmd, args, stdout: "pipe", stderr: "pipe" });
      let stdout = "";
      let stderr = "";
      proc.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      const exitCode = await proc.exited;
      return { exitCode: exitCode ?? 1, stdout, stderr };
    };
  }

  const { spawn } = await import("node:child_process");
  return async (cmd: string, args: string[]): Promise<ShellResult> => {
    return new Promise((resolve) => {
      const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
      proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on("close", (code) => {
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });
    });
  };
}
