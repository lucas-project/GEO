'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Sparkles, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { useWorkspaceTarget } from '@/features/workspace/workspace-target-context';

const SUGGESTIONS = [
  'Analyze my website example.com for AI visibility',
  'Why is my competitor cited more than me in ChatGPT?',
  'Compare mysite.com vs competitor.com for AI search',
  'Best VRF air conditioning Australia — am I being cited?',
];

export function GoalInput() {
  const router = useRouter();
  const { targetUrl } = useWorkspaceTarget();
  const [goal, setGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!goal.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<{ planId: string }>('/api/agent/plan', { goal: goal.trim() });
      router.push(`/agent/${res.planId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to plan');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="relative group">
        <div className="absolute -inset-px bg-gradient-to-br from-accent/40 via-sky-400/20 to-accent/40 rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
        <div className="relative bg-bg-elevated border border-border rounded-2xl p-1.5 shadow-[0_2px_24px_-12px_rgba(0,0,0,0.7)]">
          <div className="flex items-start gap-3 px-3 py-2">
            <Sparkles className="w-4 h-4 text-accent shrink-0 mt-2.5" />
            <Textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Describe what you want to do… (e.g. Analyze my website GEO performance for example.com)"
              className="border-0 bg-transparent focus:ring-0 focus:border-0 text-base min-h-[60px] resize-none px-0 py-2"
            />
          </div>
          <div className="flex items-center justify-between px-3 pb-1.5 pt-0">
            <div className="text-[12px] text-fg-subtle flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                <kbd className="font-mono bg-bg-muted px-1.5 py-0.5 rounded text-[12px] border border-border-subtle">⌘ Enter</kbd>
                <span className="ml-2">to dispatch agent</span>
              </span>
              {targetUrl.trim() && (
                <button
                  type="button"
                  onClick={() =>
                    setGoal((g) => {
                      const u = targetUrl.trim();
                      const base = g.trim();
                      return base ? `${base} ${u}` : `Analyze GEO visibility for ${u}`;
                    })
                  }
                  className="text-accent hover:underline"
                >
                  Insert workspace URL
                </button>
              )}
            </div>
            <Button onClick={submit} disabled={!goal.trim() || submitting} size="md">
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Planning…
                </>
              ) : (
                <>
                  Dispatch <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setGoal(s)}
            className="text-[13px] px-2.5 py-1 rounded-full border border-border-subtle bg-bg-elevated/40 text-fg-muted hover:text-fg hover:border-border-strong hover:bg-bg-muted transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
