-- GEO Intelligence + continuous monitoring schema

-- AlterTable Site
ALTER TABLE "Site" ADD COLUMN "monitorEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Site" ADD COLUMN "monitorIntervalHours" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "Site" ADD COLUMN "nextRunAt" DATETIME;
ALTER TABLE "Site" ADD COLUMN "lastMonitorStatus" TEXT;
ALTER TABLE "Site" ADD COLUMN "lastMonitorError" TEXT;
ALTER TABLE "Site" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE "Site" ADD COLUMN "vertical" TEXT;
ALTER TABLE "Site" ADD COLUMN "cohortTags" TEXT;
ALTER TABLE "Site" ADD COLUMN "monitorSimulation" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable AiSimulation
ALTER TABLE "AiSimulation" ADD COLUMN "siteId" TEXT;

-- CreateTable AuditRollup
CREATE TABLE "AuditRollup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "dimensionScores" TEXT NOT NULL,
    "schemaTypes" TEXT NOT NULL,
    "faqCount" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "answerFirstRatio" REAL,
    "vertical" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditRollup_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable IssueOccurrence
CREATE TABLE "IssueOccurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditId" TEXT NOT NULL,
    "siteId" TEXT,
    "issueKey" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable PatternStat
CREATE TABLE "PatternStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cohortKey" TEXT NOT NULL,
    "patternType" TEXT NOT NULL,
    "patternKey" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "avgOverallScore" REAL NOT NULL,
    "p50Score" REAL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable FixOutcome
CREATE TABLE "FixOutcome" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "optimizationId" TEXT,
    "issueKey" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL,
    "scoreBefore" INTEGER NOT NULL,
    "scoreAfter" INTEGER,
    "dimensionBefore" TEXT NOT NULL,
    "dimensionAfter" TEXT,
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" DATETIME,
    CONSTRAINT "FixOutcome_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable PatternEmbedding
CREATE TABLE "PatternEmbedding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT,
    "cohortKey" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "textPreview" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "dimensions" INTEGER NOT NULL DEFAULT 256,
    "vector" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatternEmbedding_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditRollup_auditId_key" ON "AuditRollup"("auditId");
CREATE INDEX "AuditRollup_siteId_createdAt_idx" ON "AuditRollup"("siteId", "createdAt");
CREATE INDEX "IssueOccurrence_issueKey_idx" ON "IssueOccurrence"("issueKey");
CREATE INDEX "IssueOccurrence_siteId_idx" ON "IssueOccurrence"("siteId");
CREATE INDEX "IssueOccurrence_auditId_idx" ON "IssueOccurrence"("auditId");
CREATE UNIQUE INDEX "PatternStat_cohortKey_patternType_patternKey_key" ON "PatternStat"("cohortKey", "patternType", "patternKey");
CREATE INDEX "PatternStat_cohortKey_idx" ON "PatternStat"("cohortKey");
CREATE INDEX "FixOutcome_siteId_idx" ON "FixOutcome"("siteId");
CREATE INDEX "FixOutcome_optimizationId_idx" ON "FixOutcome"("optimizationId");
CREATE INDEX "PatternEmbedding_cohortKey_idx" ON "PatternEmbedding"("cohortKey");
CREATE INDEX "PatternEmbedding_auditId_idx" ON "PatternEmbedding"("auditId");
CREATE INDEX "AiSimulation_siteId_idx" ON "AiSimulation"("siteId");
