import { describe, expect, it, vi } from 'vitest';
import { createBudgetedFetchPage } from './fetch-budget';

describe('presence fetch budget', () => {
  it('opens a host circuit after a block without making a second request', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ html: '', statusCode: 403, finalUrl: 'https://forum.test/a', observationStatus: 'blocked' });
    const budgeted = createBudgetedFetchPage(fetchPage, { maxRequests: 5, maxRequestsPerHost: 3 });
    await budgeted('https://forum.test/a');
    const skipped = await budgeted('https://forum.test/b');
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(skipped).toMatchObject({ observationStatus: 'blocked', blockReason: 'host_circuit_open' });
  });

  it('enforces both run and host request limits as typed evidence gaps', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ html: '<main>ok</main>', statusCode: 200, finalUrl: 'https://one.test/a', observationStatus: 'observed' });
    const budgeted = createBudgetedFetchPage(fetchPage, { maxRequests: 2, maxRequestsPerHost: 1 });
    await budgeted('https://one.test/a');
    expect((await budgeted('https://one.test/b')).blockReason).toBe('host_request_budget_exhausted');
    await budgeted('https://two.test/a');
    expect((await budgeted('https://three.test/a')).blockReason).toBe('run_request_budget_exhausted');
  });
});
