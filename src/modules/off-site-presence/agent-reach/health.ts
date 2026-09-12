import { config } from '@shared/config';
import { cliExists, runCli } from './cli-runner';
import type { AgentReachHealth } from '../schemas';

type AgentReachChannelStatus = AgentReachHealth['xhs'];

let cachedHealth: AgentReachHealth | null = null;

function isAuthFailure(stderr: string, stdout: string): boolean {
  const text = `${stderr}\n${stdout}`.toLowerCase();
  return (
    /login|cookie|auth|unauthorized|not logged|请登录|需要登录/i.test(text) ||
    /code:\s*-1|api error/i.test(text)
  );
}

async function probeXhs(command: string, timeoutMs: number): Promise<AgentReachChannelStatus> {
  const exists = await cliExists(command, 4000);
  if (!exists) return 'missing';

  const probe = await runCli(command, ['search', '__geo_health__', '--json'], timeoutMs);
  if (probe.timedOut || probe.error) return 'missing';
  if (probe.exitCode !== 0 && isAuthFailure(probe.stderr, probe.stdout)) return 'auth';
  if (probe.exitCode !== 0 && /not found|command/i.test(probe.stderr)) return 'missing';
  return 'ok';
}

async function probeRdt(command: string, timeoutMs: number): Promise<AgentReachChannelStatus> {
  const exists = await cliExists(command, 4000);
  if (!exists) return 'missing';

  const probe = await runCli(command, ['search', '__geo_health__', '--limit', '1'], timeoutMs);
  if (probe.timedOut || probe.error) return 'missing';
  if (probe.exitCode !== 0 && isAuthFailure(probe.stderr, probe.stdout)) return 'auth';
  return 'ok';
}

export async function probeAgentReachHealth(force = false): Promise<AgentReachHealth> {
  if (cachedHealth && !force) return cachedHealth;

  const pp = config.presenceProbe;
  if (!pp.agentReachEnabled) {
    cachedHealth = { xhs: 'skipped', rdt: 'skipped', jina: 'skipped' };
    return cachedHealth;
  }

  const timeoutMs = Math.min(pp.agentReachTimeoutMs, 12_000);
  const [xhs, rdt] = await Promise.all([
    pp.agentReachXhs ? probeXhs(pp.xhsCli, timeoutMs) : Promise.resolve('skipped' as const),
    pp.agentReachRdt ? probeRdt(pp.rdtCli, timeoutMs) : Promise.resolve('skipped' as const),
  ]);

  cachedHealth = {
    xhs,
    rdt,
    jina: pp.agentReachJina ? 'ok' : 'skipped',
  };
  return cachedHealth;
}

export function resetAgentReachHealthCache(): void {
  cachedHealth = null;
}
