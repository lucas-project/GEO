'use client';

import { use } from 'react';
import { AuditReportView } from '@/features/audit/audit-report-view';

export default function AuditReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <AuditReportView auditId={id} />;
}
