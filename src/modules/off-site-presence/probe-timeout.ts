/** Race a probe (or fetch) against a hard ceiling so one platform cannot block the run. */
export async function withProbeTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => {
            controller.abort(new Error(`${label} timed out after ${timeoutMs}ms`));
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
          },
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}
