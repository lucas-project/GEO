import { Badge } from '@/components/ui/badge';

/** Discovery ranking only — not the post-audit GEO score. */
export const GEO_PRIORITY_HINT =
  'How strongly we recommend auditing this page first. This is not your site GEO audit score.';

export function GeoPriorityBadge({
  score,
  probed,
  className,
}: {
  score: number;
  probed?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <Badge variant="accent" className="text-[10px] px-1.5" title={GEO_PRIORITY_HINT}>
        GEO priority {score}
      </Badge>
      {probed && <span className="text-[10px] text-fg-subtle mt-0.5 block text-right">Probed</span>}
    </div>
  );
}
