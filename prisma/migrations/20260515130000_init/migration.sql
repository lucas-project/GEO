-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "payload" TEXT NOT NULL,
    "result" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "startedAt" DATETIME,
    "finishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "name" TEXT,
    "ownerId" TEXT NOT NULL DEFAULT 'local',
    "monitored" BOOLEAN NOT NULL DEFAULT false,
    "webhookUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GeoAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT,
    "url" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "dimensions" TEXT NOT NULL,
    "narrative" TEXT,
    "topIssues" TEXT NOT NULL,
    "topFixes" TEXT NOT NULL,
    "screenshotUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeoAudit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChunkEmbedding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "textPreview" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL DEFAULT 256,
    "vector" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChunkEmbedding_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "GeoAudit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrawlResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 0,
    "html" TEXT,
    "renderedHtml" TEXT,
    "screenshotPath" TEXT,
    "contentType" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    CONSTRAINT "CrawlResult_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "GeoAudit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExtractionResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "metadata" TEXT NOT NULL,
    "headings" TEXT NOT NULL,
    "schemas" TEXT NOT NULL,
    "faqs" TEXT NOT NULL,
    "entities" TEXT NOT NULL,
    "chunks" TEXT NOT NULL,
    "links" TEXT NOT NULL,
    "tables" TEXT NOT NULL,
    "authors" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtractionResult_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "GeoAudit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiSimulation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prompt" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "runId" TEXT,
    "targetBrand" TEXT,
    "responseText" TEXT NOT NULL,
    "citations" TEXT NOT NULL,
    "brandMentions" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CompetitorReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT,
    "targetUrl" TEXT NOT NULL,
    "competitorUrl" TEXT NOT NULL,
    "diff" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorReport_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OptimizationSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetUrl" TEXT,
    "generatedContent" TEXT NOT NULL,
    "rationale" TEXT,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OptimizationSuggestion_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "GeoAudit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonitoringRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "auditId" TEXT,
    "diff" TEXT,
    "alerts" TEXT NOT NULL,
    "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonitoringRun_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MonitoringRun_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "GeoAudit" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL DEFAULT 'local',
    "provider" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AgentPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goal" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "result" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_type_idx" ON "Job"("type");

-- CreateIndex
CREATE INDEX "Job_createdAt_idx" ON "Job"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Site_url_key" ON "Site"("url");

-- CreateIndex
CREATE INDEX "GeoAudit_siteId_idx" ON "GeoAudit"("siteId");

-- CreateIndex
CREATE INDEX "GeoAudit_url_idx" ON "GeoAudit"("url");

-- CreateIndex
CREATE INDEX "GeoAudit_createdAt_idx" ON "GeoAudit"("createdAt");

-- CreateIndex
CREATE INDEX "ChunkEmbedding_auditId_idx" ON "ChunkEmbedding"("auditId");

-- CreateIndex
CREATE INDEX "CrawlResult_auditId_idx" ON "CrawlResult"("auditId");

-- CreateIndex
CREATE INDEX "ExtractionResult_auditId_idx" ON "ExtractionResult"("auditId");

-- CreateIndex
CREATE INDEX "AiSimulation_runId_idx" ON "AiSimulation"("runId");

-- CreateIndex
CREATE INDEX "AiSimulation_prompt_idx" ON "AiSimulation"("prompt");

-- CreateIndex
CREATE INDEX "CompetitorReport_siteId_idx" ON "CompetitorReport"("siteId");

-- CreateIndex
CREATE INDEX "CompetitorReport_targetUrl_idx" ON "CompetitorReport"("targetUrl");

-- CreateIndex
CREATE INDEX "OptimizationSuggestion_auditId_idx" ON "OptimizationSuggestion"("auditId");

-- CreateIndex
CREATE INDEX "MonitoringRun_siteId_idx" ON "MonitoringRun"("siteId");

-- CreateIndex
CREATE INDEX "MonitoringRun_runAt_idx" ON "MonitoringRun"("runAt");

-- CreateIndex
CREATE INDEX "ApiKey_ownerId_idx" ON "ApiKey"("ownerId");

-- CreateIndex
CREATE INDEX "AgentPlan_status_idx" ON "AgentPlan"("status");

