'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import {
  type SimulationPromptEntry,
  type SimulationQuestionType,
} from '@modules/geo-audit';

export interface SimulationPromptItem {
  id: string;
  text: string;
  enabled: boolean;
  type?: SimulationQuestionType;
}

interface SimulationPromptListProps {
  items: SimulationPromptItem[];
  onChange: (items: SimulationPromptItem[]) => void;
  disabled?: boolean;
  maxItems?: number;
}

function newId(): string {
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function SimulationPromptList({
  items,
  onChange,
  disabled,
  maxItems = 20,
}: SimulationPromptListProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const enabledCount = items.filter((i) => i.enabled && i.text.trim().length >= 3).length;

  const updateItem = (id: string, patch: Partial<SimulationPromptItem>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= items.length) return;
    const copy = [...items];
    [copy[index], copy[next]] = [copy[next], copy[index]];
    onChange(copy);
  };

  const setAllEnabled = (enabled: boolean) => {
    onChange(items.map((item) => ({ ...item, enabled })));
  };

  const addItem = () => {
    if (items.length >= maxItems) return;
    const id = newId();
    onChange([...items, { id, text: '', enabled: true }]);
    setExpandedIds((prev) => new Set(prev).add(id));
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <p className="text-[11px] text-fg-muted">
          {enabledCount}/{items.length} selected · max {maxItems}
        </p>
        <div className="flex flex-wrap gap-0.5">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" disabled={disabled} onClick={() => setAllEnabled(true)}>
            All
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" disabled={disabled} onClick={() => setAllEnabled(false)}>
            None
          </Button>
          <Button type="button" variant="secondary" size="sm" className="h-7 text-xs px-2" disabled={disabled || items.length >= maxItems} onClick={addItem}>
            <Plus className="w-3 h-3" />
            Add
          </Button>
        </div>
      </div>

      <ul className="space-y-1">
        {items.map((item, index) => {
          const expanded = expandedIds.has(item.id);
          return (
            <li
              key={item.id}
              className={`rounded-md border border-border-subtle bg-bg/50 ${
                !item.enabled ? 'opacity-55' : ''
              }`}
            >
              <div className="flex items-center gap-1.5 py-1 px-1.5 min-h-[2rem]">
                <input
                  type="checkbox"
                  checked={item.enabled}
                  disabled={disabled}
                  onChange={(e) => updateItem(item.id, { enabled: e.target.checked })}
                  className="rounded border-border shrink-0"
                  aria-label={`Include question ${index + 1}`}
                />
                <span className="text-[10px] text-fg-subtle tabular-nums w-5 shrink-0">{index + 1}</span>
                {item.type && (
                  <Badge
                    variant={item.type === 'brand' ? 'accent' : 'outline'}
                    className="text-[9px] px-1 py-0 h-4 shrink-0 hidden sm:inline-flex"
                  >
                    {item.type === 'brand' ? 'Brand' : 'Discovery'}
                  </Badge>
                )}
                {expanded ? (
                  <div className="flex-1 min-w-0 py-1">
                    <Textarea
                      value={item.text}
                      onChange={(e) => updateItem(item.id, { text: e.target.value })}
                      disabled={disabled}
                      rows={2}
                      autoFocus
                      placeholder="Question…"
                      className="text-xs min-h-[2.5rem] py-1"
                    />
                  </div>
                ) : (
                  <Input
                    value={item.text}
                    onChange={(e) => updateItem(item.id, { text: e.target.value })}
                    disabled={disabled}
                    placeholder="Question…"
                    className="flex-1 min-w-0 h-7 text-xs py-0"
                    onFocus={() => toggleExpanded(item.id)}
                  />
                )}
                <div className="flex items-center shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    disabled={disabled}
                    onClick={() => toggleExpanded(item.id)}
                    aria-label={expanded ? 'Collapse' : 'Expand to edit'}
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hidden sm:inline-flex"
                    disabled={disabled || index === 0}
                    onClick={() => moveItem(index, -1)}
                    aria-label="Move up"
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hidden sm:inline-flex"
                    disabled={disabled || index === items.length - 1}
                    onClick={() => moveItem(index, 1)}
                    aria-label="Move down"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-danger hover:text-danger"
                    disabled={disabled || items.length <= 1}
                    onClick={() => removeItem(item.id)}
                    aria-label="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function promptsFromSuggestions(
  suggestions: (string | SimulationPromptEntry)[],
): SimulationPromptItem[] {
  return suggestions.map((entry, i) => {
    const text = typeof entry === 'string' ? entry : entry.prompt;
    const type = typeof entry === 'string' ? undefined : entry.type;
    return {
      id: `s-${i}-${text.slice(0, 12)}`,
      text,
      enabled: true,
      type,
    };
  });
}
