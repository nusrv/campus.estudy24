-- Initial portal schema. Prisma generates CUIDs and manages updatedAt in application writes.

CREATE TYPE "PublicationStatus" AS ENUM ('pending_review', 'approved', 'published', 'unpublished', 'hidden');

CREATE TYPE "OriginType" AS ENUM ('manual', 'imported');

CREATE TYPE "AdminRole" AS ENUM ('owner', 'editor');

CREATE TYPE "AdvertisementStatus" AS ENUM ('active', 'paused', 'archived');

CREATE TYPE "MediaKind" AS ENUM ('image', 'pdf');

CREATE TYPE "EventKind" AS ENUM ('event', 'academic_date', 'registration');

CREATE TABLE "University" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "websiteUrl" TEXT,
  "logoUrl" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "University_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArticleCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  CONSTRAINT "ArticleCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Article" (
  "id" TEXT NOT NULL,
  "universityId" TEXT NOT NULL,
  "sourceId" TEXT,
  "originalArticleId" TEXT,
  "sourceUrl" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "content" TEXT NOT NULL DEFAULT '',
  "categoryId" TEXT,
  "originalPublishedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "status" "PublicationStatus" NOT NULL DEFAULT 'pending_review',
  "origin" "OriginType" NOT NULL DEFAULT 'manual',
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "deletedAt" TIMESTAMP(3),
  "fingerprint" TEXT,
  "sourceSnapshot" JSONB,
  "editedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArticleMedia" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "kind" "MediaKind" NOT NULL,
  "url" TEXT NOT NULL,
  "attribution" TEXT NOT NULL,
  "usage" TEXT NOT NULL DEFAULT 'external_reference_only',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ArticleMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArticleRegistrationLink" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  CONSTRAINT "ArticleRegistrationLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Event" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "kind" "EventKind" NOT NULL DEFAULT 'event',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "applicationUrl" TEXT,
  "universityId" TEXT,
  "status" "PublicationStatus" NOT NULL DEFAULT 'pending_review',
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Program" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "applicationUrl" TEXT,
  "universityId" TEXT,
  "status" "PublicationStatus" NOT NULL DEFAULT 'pending_review',
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdvertisementPlacement" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "AdvertisementPlacement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Advertisement" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "imageUrl" TEXT,
  "destinationUrl" TEXT NOT NULL,
  "buttonText" TEXT NOT NULL DEFAULT 'اكتشف المزيد',
  "global" BOOLEAN NOT NULL DEFAULT false,
  "placementId" TEXT NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "status" "AdvertisementStatus" NOT NULL DEFAULT 'paused',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Advertisement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdvertisementUniversity" (
  "advertisementId" TEXT NOT NULL,
  "universityId" TEXT NOT NULL,
  CONSTRAINT "AdvertisementUniversity_pkey" PRIMARY KEY ("advertisementId", "universityId")
);

CREATE TABLE "AdvertisementDailyMetric" (
  "advertisementId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "impressions" INTEGER NOT NULL DEFAULT 0,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "AdvertisementDailyMetric_pkey" PRIMARY KEY ("advertisementId", "day")
);

CREATE TABLE "ManagedLink" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "destinationUrl" TEXT NOT NULL,
  "imageUrl" TEXT,
  "icon" TEXT,
  "universityId" TEXT,
  "category" TEXT NOT NULL DEFAULT 'general',
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManagedLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Administrator" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "AdminRole" NOT NULL DEFAULT 'owner',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Administrator_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "administratorId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IngestionSource" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "universityId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "IngestionSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IngestionLog" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "sourceId" TEXT,
  "articleId" TEXT,
  "originalId" TEXT,
  "outcome" TEXT NOT NULL,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IngestionLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArticleEdit" (
  "id" TEXT NOT NULL,
  "articleId" TEXT NOT NULL,
  "administratorId" TEXT,
  "before" JSONB NOT NULL,
  "after" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ArticleEdit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "administratorId" TEXT,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RateLimitBucket" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "UploadedMedia" (
  "id" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UploadedMedia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "University_slug_key" ON "University" ("slug");

CREATE UNIQUE INDEX "ArticleCategory_slug_key" ON "ArticleCategory" ("slug");

CREATE UNIQUE INDEX "Article_sourceId_originalArticleId_key" ON "Article" ("sourceId", "originalArticleId");

CREATE INDEX "Article_status_visible_deletedAt_publishedAt_idx" ON "Article" ("status", "visible", "deletedAt", "publishedAt");

CREATE INDEX "Article_universityId_categoryId_idx" ON "Article" ("universityId", "categoryId");

CREATE UNIQUE INDEX "ArticleMedia_articleId_url_key" ON "ArticleMedia" ("articleId", "url");

CREATE UNIQUE INDEX "ArticleRegistrationLink_articleId_url_key" ON "ArticleRegistrationLink" ("articleId", "url");

CREATE INDEX "Event_status_visible_startsAt_idx" ON "Event" ("status", "visible", "startsAt");

CREATE INDEX "Program_status_visible_startsAt_idx" ON "Program" ("status", "visible", "startsAt");

CREATE INDEX "Advertisement_status_placementId_priority_idx" ON "Advertisement" ("status", "placementId", "priority");

CREATE INDEX "ManagedLink_active_universityId_category_idx" ON "ManagedLink" ("active", "universityId", "category");

CREATE UNIQUE INDEX "Administrator_email_key" ON "Administrator" ("email");

CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession" ("tokenHash");

CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession" ("expiresAt");

CREATE UNIQUE INDEX "IngestionSource_key_key" ON "IngestionSource" ("key");

CREATE INDEX "IngestionLog_createdAt_outcome_idx" ON "IngestionLog" ("createdAt", "outcome");

CREATE INDEX "IngestionLog_requestId_idx" ON "IngestionLog" ("requestId");

CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog" ("createdAt");

CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket" ("expiresAt");

CREATE UNIQUE INDEX "UploadedMedia_filename_key" ON "UploadedMedia" ("filename");

ALTER TABLE "Article" ADD CONSTRAINT "Article_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Article" ADD CONSTRAINT "Article_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IngestionSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Article" ADD CONSTRAINT "Article_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ArticleCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ArticleMedia" ADD CONSTRAINT "ArticleMedia_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArticleRegistrationLink" ADD CONSTRAINT "ArticleRegistrationLink_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Event" ADD CONSTRAINT "Event_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Program" ADD CONSTRAINT "Program_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Advertisement" ADD CONSTRAINT "Advertisement_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "AdvertisementPlacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AdvertisementUniversity" ADD CONSTRAINT "AdvertisementUniversity_advertisementId_fkey" FOREIGN KEY ("advertisementId") REFERENCES "Advertisement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdvertisementUniversity" ADD CONSTRAINT "AdvertisementUniversity_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdvertisementDailyMetric" ADD CONSTRAINT "AdvertisementDailyMetric_advertisementId_fkey" FOREIGN KEY ("advertisementId") REFERENCES "Advertisement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ManagedLink" ADD CONSTRAINT "ManagedLink_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IngestionSource" ADD CONSTRAINT "IngestionSource_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IngestionLog" ADD CONSTRAINT "IngestionLog_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "IngestionSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IngestionLog" ADD CONSTRAINT "IngestionLog_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ArticleEdit" ADD CONSTRAINT "ArticleEdit_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ArticleEdit" ADD CONSTRAINT "ArticleEdit_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_administratorId_fkey" FOREIGN KEY ("administratorId") REFERENCES "Administrator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Article" ADD CONSTRAINT "Article_imported_identity_check" CHECK ("origin" <> 'imported' OR ("sourceId" IS NOT NULL AND "originalArticleId" IS NOT NULL AND "sourceUrl" IS NOT NULL AND "fingerprint" IS NOT NULL AND length("fingerprint") = 64));

ALTER TABLE "Event" ADD CONSTRAINT "Event_dates_check" CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt");

ALTER TABLE "Program" ADD CONSTRAINT "Program_dates_check" CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt");

ALTER TABLE "Advertisement" ADD CONSTRAINT "Advertisement_dates_check" CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" >= "startsAt");

ALTER TABLE "AdvertisementDailyMetric" ADD CONSTRAINT "AdvertisementDailyMetric_counts_check" CHECK ("impressions" >= 0 AND "clicks" >= 0);
