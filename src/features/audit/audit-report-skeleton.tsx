import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function AuditReportSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-8 py-10 animate-pulse">
      <Skeleton className="h-4 w-28 mb-6" />
      <div className="flex items-start justify-between gap-6 mb-8">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-2/3 max-w-md" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-24 w-24 rounded-full shrink-0" />
      </div>
      <Skeleton className="h-20 w-full mb-6 rounded-xl" />
      <Card className="mb-6">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-48 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
