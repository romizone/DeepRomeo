import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TIMEOUT_MS = 20_000;
const MAX_OUT = 24_000;
const BINS = ["python3", "python"];

export async function runPython(code: string): Promise<{ stdout: string; stderr: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dr-py-"));
  const file = path.join(dir, "main.py");
  fs.writeFileSync(file, code, "utf8");

  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    let active: ChildProcess | null = null;

    const finish = (out: string, err: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      resolve({ stdout: out.trim(), stderr: err.trim() });
    };

    const timer = setTimeout(() => {
      active?.kill("SIGKILL");
      finish(stdout, `${stderr}\n[timed out after 20s]`);
    }, TIMEOUT_MS);

    const run = (binIndex: number) => {
      // turbopackIgnore keeps the dynamic binary name from tracing the whole project
      // into the serverless bundle.
      const proc = spawn(/* turbopackIgnore: true */ BINS[binIndex], ["-I", "-B", file], {
        cwd: dir,
        env: {
          ...process.env,
          PATH: process.env.PATH || "/usr/bin:/bin",
          PYTHONIOENCODING: "utf-8",
        },
      });
      active = proc;

      proc.stdout?.on("data", (d: Buffer) => {
        stdout += d.toString();
        if (stdout.length > MAX_OUT) stdout = stdout.slice(0, MAX_OUT) + "\n…";
      });
      proc.stderr?.on("data", (d: Buffer) => {
        stderr += d.toString();
        if (stderr.length > MAX_OUT) stderr = stderr.slice(0, MAX_OUT) + "\n…";
      });
      proc.on("error", (error) => {
        if (binIndex + 1 < BINS.length) {
          run(binIndex + 1);
          return;
        }
        finish("", error instanceof Error ? error.message : "Python is not available on this server.");
      });
      proc.on("close", () => {
        if (active !== proc) return;
        finish(stdout, stderr);
      });
    };

    run(0);
  });
}
