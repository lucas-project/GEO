import { spawn } from 'child_process';

export interface CliRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  error?: string;
}

export async function runCli(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<CliRunResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(command, args, {
      windowsHide: true,
      env: process.env,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: null,
        timedOut,
        error: err.message,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: code,
        timedOut,
      });
    });
  });
}

/** Quick existence check — does not validate auth. */
export async function cliExists(command: string, timeoutMs = 5000): Promise<boolean> {
  const isWin = process.platform === 'win32';
  const probe = isWin
    ? await runCli('where', [command], timeoutMs)
    : await runCli('which', [command], timeoutMs);
  if (probe.timedOut || probe.error) return false;
  return probe.exitCode === 0 && probe.stdout.trim().length > 0;
}
