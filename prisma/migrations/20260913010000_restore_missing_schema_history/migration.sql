-- Add fields previously present only in db-push databases to clean installs.
ALTER TABLE "Job" ADD COLUMN "statusMessage" TEXT;
ALTER TABLE "AuditRollup" ADD COLUMN "signals" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "ExtractionResult" ADD COLUMN "checklist" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "GeoAudit" ADD COLUMN "scoringMeta" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "GeoAudit" ADD COLUMN "pageInventory" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "PatternEmbedding" ADD COLUMN "signalTags" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "PatternEmbedding" ADD COLUMN "dimensionHint" TEXT;
ALTER TABLE "PatternEmbedding" ADD COLUMN "industry" TEXT;
ALTER TABLE "Site" ADD COLUMN "monitorSchedulePreset" TEXT NOT NULL DEFAULT 'daily';
ALTER TABLE "Site" ADD COLUMN "monitorHealthCheck" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Site" ADD COLUMN "monitorSimulationPrompts" TEXT;
CREATE TABLE "CitationSnapshot" (
  "id" TEXT NOT NULL PRIMARY KEY, "siteId" TEXT NOT NULL, "auditId" TEXT,
  "platformBreakdown" TEXT NOT NULL DEFAULT '{}', "citedDomains" TEXT NOT NULL DEFAULT '[]',
  "targetVisibilityScore" REAL NOT NULL DEFAULT 0, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CitationSnapshot_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CitationSnapshot_siteId_idx" ON "CitationSnapshot"("siteId");
CREATE INDEX "CitationSnapshot_auditId_idx" ON "CitationSnapshot"("auditId");
