import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/config', () => ({
  config: {
    presenceProbe: {
      agentReachEnabled: false,
      agentReachXhs: false,
      agentReachRdt: false,
      agentReachJina: false,
      agentReachTimeoutMs: 5000,
      xhsCli: 'xhs',
      rdtCli: 'rdt',
    },
  },
}));

import { probeAgentReachHealth, resetAgentReachHealthCache } from './health';

describe('probeAgentReachHealth', () => {
  beforeEach(() => {
    resetAgentReachHealthCache();
  });

  it('returns skipped when agent reach disabled', async () => {
    const health = await probeAgentReachHealth(true);
    expect(health).toEqual({ xhs: 'skipped', rdt: 'skipped', jina: 'skipped' });
  });
});
