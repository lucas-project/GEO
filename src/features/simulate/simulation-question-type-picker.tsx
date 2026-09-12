'use client';

import { cn } from '@/lib/utils';
import {
  SIMULATION_QUESTION_TYPES,
  SIMULATION_QUESTION_TYPE_DESCRIPTIONS,
  SIMULATION_QUESTION_TYPE_LABELS,
  SIMULATION_PROMPTS_PER_TYPE,
  type SimulationQuestionType,
} from '@modules/geo-audit';

export interface SimulationQuestionTypesState {
  brand: boolean;
  discovery: boolean;
}

export const DEFAULT_QUESTION_TYPES: SimulationQuestionTypesState = {
  brand: false,
  discovery: true,
};

interface SimulationQuestionTypePickerProps {
  value: SimulationQuestionTypesState;
  onChange: (value: SimulationQuestionTypesState) => void;
  disabled?: boolean;
  className?: string;
}

export function SimulationQuestionTypePicker({
  value,
  onChange,
  disabled,
  className,
}: SimulationQuestionTypePickerProps) {
  const toggle = (type: SimulationQuestionType) => {
    const next = { ...value, [type]: !value[type] };
    if (!next.brand && !next.discovery) return;
    onChange(next);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-[11px] text-fg-muted leading-snug">
        The list below shows only selected types. Each generate/regenerate adds up to{' '}
        {SIMULATION_PROMPTS_PER_TYPE} questions per selected type.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {SIMULATION_QUESTION_TYPES.map((type) => {
        const checked = value[type];
        return (
          <label
            key={type}
            className={cn(
              'flex items-start gap-2 rounded-md border p-2 cursor-pointer transition-colors',
              checked
                ? 'border-accent/40 bg-accent/5'
                : 'border-border-subtle bg-bg-elevated/50 opacity-70',
              disabled && 'pointer-events-none opacity-50',
            )}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(type)}
              className="mt-0.5 rounded border-border shrink-0"
            />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-fg">
                {SIMULATION_QUESTION_TYPE_LABELS[type]}
              </span>
              <span className="block text-[10px] text-fg-muted leading-snug line-clamp-2">
                {SIMULATION_QUESTION_TYPE_DESCRIPTIONS[type]}
              </span>
            </span>
          </label>
        );
      })}
      </div>
    </div>
  );
}

export function questionTypesToPayload(
  value: SimulationQuestionTypesState,
): { brand: boolean; discovery: boolean } {
  return { brand: value.brand, discovery: value.discovery };
}
