import { Bot, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { GoalInput } from '@/features/workspace/goal-input';

export default function AgentPage() {
  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <div className="mb-8 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent to-sky-500 flex items-center justify-center shadow-[0_0_30px_-8px_rgba(56,189,248,0.6)]">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold">Autonomous GEO Agent</h1>
          <p className="text-sm text-fg-muted">
            Describe a goal. The planner decomposes it into module calls and orchestrates execution.
          </p>
        </div>
      </div>

      <GoalInput />

      <Card className="mt-8 p-5">
        <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wider text-fg-muted">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          How the agent works
        </div>
        <div className="text-sm text-fg-muted space-y-1.5">
          <p>1. Planner converts your goal into 1-6 typed steps (audit, simulate, compare, fix, monitor).</p>
          <p>2. Each step is a strongly-typed module operation — the LLM cannot invent untrusted actions.</p>
          <p>3. Executor runs steps sequentially, threading outputs forward (e.g. auditId → fix generation).</p>
          <p>4. You watch progress live; final results aggregate into a single workspace.</p>
        </div>
      </Card>
    </div>
  );
}
