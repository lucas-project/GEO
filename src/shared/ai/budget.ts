import type { AsyncLocalStorage } from 'node:async_hooks';
import { config } from '@shared/config';

export type Resource = 'httpRequests' | 'searchRequests' | 'browserMs' | 'tokens';
export type ResourceLimits = Record<Resource, number>;
export class BudgetExceeded extends Error {
  constructor(public readonly resource: Resource | 'durationMs') {
    super(`Task budget exhausted: ${resource}`); this.name = 'BudgetExceeded';
  }
}
export class TaskBudget {
  readonly startedAt = Date.now();
  readonly used: ResourceLimits = { httpRequests: 0, searchRequests: 0, browserMs: 0, tokens: 0 };
  stopReason?: string;
  partialResult: unknown;
  constructor(readonly signal: AbortSignal, readonly limits: ResourceLimits = config.queue.budget) {}
  consume(resource: Resource, amount = 1): void {
    this.signal.throwIfAborted();
    if (!Number.isFinite(amount) || amount < 0) throw new Error('Invalid resource amount');
    if (Date.now() - this.startedAt >= config.queue.maxRuntimeMs) {
      this.stopReason = 'durationMs'; throw new BudgetExceeded('durationMs');
    }
    if (this.used[resource] + amount > this.limits[resource]) {
      this.stopReason = resource; throw new BudgetExceeded(resource);
    }
    this.used[resource] += amount;
  }
  snapshot() {
    return { ...this.used, limits: this.limits, durationMs: Date.now() - this.startedAt,
      completion: this.stopReason ? 'partial' : 'complete', stopReason: this.stopReason };
  }
}
let storage: AsyncLocalStorage<TaskBudget> | undefined;
let loading: Promise<void> | undefined;
export const currentTaskBudget = () => storage?.getStore();
export async function withTaskBudget<T>(budget: TaskBudget, work: () => Promise<T>): Promise<T> {
  loading ??= import(/* webpackIgnore: true */ 'node:async_hooks').then(({ AsyncLocalStorage }) => {
    storage = new AsyncLocalStorage<TaskBudget>();
  });
  await loading;
  return storage!.run(budget, work);
}
