ALTER TABLE "GeoAudit" ADD COLUMN "scoreVersion" TEXT NOT NULL DEFAULT 'hierarchical-v2';
ALTER TABLE "GeoAudit" ADD COLUMN "coverage" REAL;
ALTER TABLE "GeoAudit" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "GeoAudit" ADD COLUMN "sampleManifest" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "GeoAudit" ADD COLUMN "recomputedAt" DATETIME;

ALTER TABLE "Site" ADD COLUMN "profile" TEXT;
ALTER TABLE "Site" ADD COLUMN "profileVersion" TEXT;
ALTER TABLE "Site" ADD COLUMN "profileConfirmedAt" DATETIME;
ALTER TABLE "Site" ADD COLUMN "profileConfirmedBy" TEXT;

ALTER TABLE "CrawlResult" ADD COLUMN "fetchStatus" TEXT;
ALTER TABLE "CrawlResult" ADD COLUMN "blockReason" TEXT;
ALTER TABLE "CrawlResult" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "CrawlResult" ADD COLUMN "htmlTruncated" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "CrawlResult" ADD COLUMN "rawHtmlAvailable" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "CrawlResult" ADD COLUMN "renderedHtmlAvailable" BOOLEAN NOT NULL DEFAULT 0;
ALTER TABLE "CrawlResult" ADD COLUMN "fetchProfile" TEXT;
ALTER TABLE "CrawlResult" ADD COLUMN "fetchChannel" TEXT;
