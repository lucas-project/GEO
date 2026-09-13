import { describe, it, expect } from 'vitest';
import { TaskBudget, BudgetExceeded, currentTaskBudget, withTaskBudget } from './budget';
describe('task budgets', () => {
  it('reserves before work and does not charge a rejected reservation', () => {
    const budget = new TaskBudget(new AbortController().signal, { httpRequests: 1, searchRequests: 0, browserMs: 1000, tokens: 10 });
    budget.consume('httpRequests');
    expect(() => budget.consume('httpRequests')).toThrow(BudgetExceeded);
    expect(budget.used.httpRequests).toBe(1);
    expect(budget.snapshot().completion).toBe('partial');
  });
  it('keeps concurrent job accounting isolated and propagates cancellation', async () => {
    const ac = new AbortController();
    const first = new TaskBudget(ac.signal), second = new TaskBudget(new AbortController().signal);
    await Promise.all([withTaskBudget(first, async () => { await Promise.resolve(); currentTaskBudget()?.consume('tokens', 3); }),
      withTaskBudget(second, async () => { currentTaskBudget()?.consume('tokens', 7); })]);
    expect(first.used.tokens).toBe(3); expect(second.used.tokens).toBe(7);
    ac.abort(); expect(() => first.consume('httpRequests')).toThrow();
  });
});
