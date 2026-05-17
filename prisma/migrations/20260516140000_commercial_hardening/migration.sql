-- Commercial hardening: monitor backoff/lock + geo content packs

ALTER TABLE "Site" ADD COLUMN "monitorFailureCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Site" ADD COLUMN "monitorLockedAt" DATETIME;

CREATE TABLE "GeoContentPack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auditId" TEXT NOT NULL,
    "siteId" TEXT,
    "url" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeoContentPack_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "GeoContentPack_auditId_idx" ON "GeoContentPack"("auditId");
CREATE INDEX "GeoContentPack_url_idx" ON "GeoContentPack"("url");
CREATE INDEX "GeoContentPack_createdAt_idx" ON "GeoContentPack"("createdAt");
