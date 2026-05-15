import { GoalInput } from '@/features/workspace/goal-input';
import { Card } from '@/components/ui/card';
import { Sparkles, Search, Wand2, Bot, Activity, Users, Lightbulb } from 'lucide-react';
import Link from 'next/link';

const QUICK_ACTIONS = [
  { href: '/audit', icon: Sparkles, title: 'Run a GEO Audit', desc: 'Score AI readability, citation probability and semantic structure.' },
  { href: '/simulate', icon: Search, title: 'Simulate AI Search', desc: 'See how ChatGPT, Gemini, Claude, Perplexity cite (or skip) you.' },
  { href: '/competitors', icon: Users, title: 'Compare Competitors', desc: 'Diff entity coverage, schema usage and AI visibility.' },
  { href: '/optimize', icon: Wand2, title: 'Generate Fixes', desc: 'Auto-generate FAQ schema, llms.txt, AI summaries, answer-first rewrites.' },
  { href: '/geo-content', icon: Lightbulb, title: 'GEO content ideas', desc: 'Keywords from your audit plus Q&A, how-tos, comparisons, and more — with history.' },
  { href: '/monitor', icon: Activity, title: 'Monitor Continuously', desc: 'Track AI visibility drift, citation regressions, schema loss.' },
  { href: '/agent', icon: Bot, title: 'Autonomous Agent', desc: 'Describe a goal; the planner orchestrates the entire pipeline.' },
];

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-slow" />
        <span className="text-[10px] uppercase tracking-wider text-fg-subtle">AI Search Infrastructure · v0.1</span>
      </div>

      <h1 className="text-4xl md:text-5xl font-semibold leading-tight">
        <span className="gradient-text">Make your site easier</span>
        <br />
        <span className="text-fg">for AI systems to cite.</span>
      </h1>

      <p className="mt-4 text-fg-muted max-w-2xl leading-relaxed">
        Describe what you want. The system will crawl, render, extract entities, simulate AI search engines,
        compare competitors, and produce GEO-optimized fixes — automatically.
      </p>

      <div className="mt-8">
        <GoalInput />
      </div>

      <div className="mt-12">
        <div className="mb-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border-subtle" />
          <span className="text-[11px] uppercase tracking-wider text-fg-subtle">or jump in</span>
          <div className="h-px flex-1 bg-border-subtle" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {QUICK_ACTIONS.map(({ href, icon: Icon, title, desc }) => (
            <Link key={href} href={href} className="group">
              <Card className="p-4 h-full hover:border-accent/40 hover:bg-bg-subtle transition-all cursor-pointer">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                    <Icon className="w-4 h-4 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-fg">{title}</div>
                    <p className="mt-1 text-xs text-fg-muted leading-relaxed">{desc}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
