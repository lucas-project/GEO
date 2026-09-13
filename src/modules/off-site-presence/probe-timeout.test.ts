import { describe, expect, it } from 'vitest';
import { withProbeTimeout } from './probe-timeout';

describe('withProbeTimeout', () => {
  it('aborts the underlying operation when its deadline expires', async () => {
    let aborted = false;
    await expect(
      withProbeTimeout(
        (signal) =>
          new Promise<void>((_, reject) => {
            signal.addEventListener('abort', () => {
              aborted = true;
              reject(signal.reason);
            });
          }),
        5,
        'fixture',
      ),
    ).rejects.toThrow('fixture timed out');
    expect(aborted).toBe(true);
  });
});
