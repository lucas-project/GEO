import type { SimulationQuestionTypesState } from './simulation-question-type-picker';
import type { SimulationPromptItem } from './simulation-prompt-list';

const KEY_PREFIX = 'geo:sim-batch-items:';

export interface StoredSimBatchState {
  items: SimulationPromptItem[];
  questionTypes: SimulationQuestionTypesState;
}

export function readStoredSimBatchState(auditId: string): StoredSimBatchState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${auditId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSimBatchState;
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredSimBatchState(auditId: string, state: StoredSimBatchState | null): void {
  if (typeof window === 'undefined') return;
  const key = `${KEY_PREFIX}${auditId}`;
  if (!state) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(state));
}
