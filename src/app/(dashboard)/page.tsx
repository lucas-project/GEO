import { GoalInput } from '@/features/workspace/goal-input';
import { HomeJourney } from '@/features/workspace/home-journey';

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-8 py-10">
      <div className="mb-3 flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-slow" />
        <span className="text-[12px] uppercase tracking-wider text-fg-subtle">AI Search Infrastructure · v0.1</span>
      </div>

      <h1 className="text-4xl md:text-5xl font-semibold leading-tight">
        <span className="gradient-text">Make your site easier</span>
        <br />
        <span className="text-fg">for AI systems to cite.</span>
      </h1>

      <p className="mt-4 text-fg-muted max-w-2xl leading-relaxed">
        Audit your site, follow your improvement plan, then check whether AI search engines actually cite you.
      </p>

      <div className="mt-8">
        <GoalInput />
      </div>

      <HomeJourney />
    </div>
  );
}
