import { expect, it } from 'vitest';
import { resolveJobProgressLabel } from './job-progress-state';

it('preserves terminal status when a cleared query is pending or unreachable', () => {
  for (const status of ['failed', 'cancelled', 'completed'] as const) {
    const expected = { failed: 'Failed', cancelled: 'Cancelled', completed: 'Complete' }[status];
    expect(resolveJobProgressLabel({ jobId: null, forceShow: true, status, isQueryPending: true, isQueryError: true, labels: {} })).toBe(expected);
  }
});
