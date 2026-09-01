import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TIMEOUT_MS = 20_000;
const MAX_OUT = 24_000;

export async function runPython(code: string): Promise<{ stdout: string; stderr: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dr-py-"));
  const file = path.join(dir, "main.py");
  fs.writeFileSync(file, code, "utf8");

  return new Promise((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (stdout: string, stderr: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    };

    let stdout = "";
    let stderr = "";
    const child = spawn("python3", ["-I", "-B", file], {
      cwd: dir,
      env: { ...process.env, PATH: process.env.PATH || "/usr/bin:/bin", PYTHONIOENCODING: "utf-8" },
    });
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      stderr += "\n[timed out after 20s]";
      finish(stdout, stderr);
    }, TIMEOUT_MS);
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
      if (stdout.length > MAX_OUT) stdout = stdout.slice(0, MAX_OUT) + "\n…";
    });
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > MAX_OUT) stderr = stderr.slice(0, MAX_OUT) + "\n…";
    });
    child.on("error", (error) => {
      finish("", error instanceof Error ? error.message : "Python is not available on this server.");
    });
    child.on("close", () => {
      finish(stdout, stderr);
    });
  });
}
