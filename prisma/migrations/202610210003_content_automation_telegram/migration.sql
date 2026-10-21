-- Additive: never changes existing accounts, API credentials, news status or visits.
ALTER TABLE "University" ADD COLUMN "autoPublishNews" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "telegramCommunityUrl" TEXT;
ALTER TABLE "SiteSettings" ADD COLUMN "telegramSupportUrl" TEXT;
ALTER TABLE "Article" ADD COLUMN "publicationLocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "autoPublishedAt" TIMESTAMP(3);
-- Preserve all existing editorial decisions and past administrator edits.
UPDATE "Article" SET "publicationLocked" = true
WHERE "status" <> 'pending_review' OR NOT "visible" OR "deletedAt" IS NOT NULL
  OR EXISTS (SELECT 1 FROM "ArticleEdit" WHERE "ArticleEdit"."articleId" = "Article"."id");
ALTER TABLE "Event" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "Program" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "ManagedLink" ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "status" "PublicationStatus" NOT NULL DEFAULT 'published';
ALTER TABLE "IngestionLog" ADD COLUMN "resourceType" TEXT,
  ADD COLUMN "resourceId" TEXT, ADD COLUMN "publicationDecision" TEXT;
CREATE TABLE "ContentSync" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sourceId" TEXT NOT NULL REFERENCES "IngestionSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "contentType" TEXT NOT NULL CHECK ("contentType" IN ('links','events','calendar','programs')),
  "originalId" TEXT NOT NULL, "recordId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL, "sourceSnapshot" JSONB NOT NULL,
  "editedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "deletedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ContentSync_sourceId_contentType_originalId_key" ON "ContentSync"("sourceId", "contentType", "originalId");
CREATE UNIQUE INDEX "ContentSync_contentType_recordId_key" ON "ContentSync"("contentType", "recordId");
