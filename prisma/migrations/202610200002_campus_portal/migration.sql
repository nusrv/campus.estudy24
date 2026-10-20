-- Additive phase-three migration. Existing content, decisions, and source identities are retained.
ALTER TYPE "EventKind" ADD VALUE IF NOT EXISTS 'examination';
CREATE TYPE "PlatformContentType" AS ENUM ('platform_news', 'blog', 'guide', 'topic');
CREATE TYPE "ManagedLinkKind" AS ENUM ('general', 'official', 'academic_calendar', 'timetable', 'student_service', 'admission', 'learning_resource');
ALTER TABLE "University" ADD COLUMN "city" TEXT NOT NULL DEFAULT '', ADD COLUMN "region" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ManagedLink" ADD COLUMN "kind" "ManagedLinkKind" NOT NULL DEFAULT 'general';

CREATE TABLE "AdvertisementPlacementAssignment" (
  "advertisementId" TEXT NOT NULL,
  "placementId" TEXT NOT NULL,
  CONSTRAINT "AdvertisementPlacementAssignment_pkey" PRIMARY KEY ("advertisementId", "placementId"),
  CONSTRAINT "AdvertisementPlacementAssignment_advertisementId_fkey" FOREIGN KEY ("advertisementId") REFERENCES "Advertisement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AdvertisementPlacementAssignment_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "AdvertisementPlacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AdvertisementPlacementAssignment_placementId_idx" ON "AdvertisementPlacementAssignment"("placementId");
INSERT INTO "AdvertisementPlacementAssignment" ("advertisementId", "placementId") SELECT "id", "placementId" FROM "Advertisement" ON CONFLICT DO NOTHING;

CREATE TABLE "PlatformPost" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "type" "PlatformContentType" NOT NULL DEFAULT 'platform_news',
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "content" TEXT NOT NULL DEFAULT '',
  "coverImageUrl" TEXT,
  "categoryId" TEXT,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "featurePriority" INTEGER NOT NULL DEFAULT 0,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "status" "PublicationStatus" NOT NULL DEFAULT 'pending_review',
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "publishedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformPost_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformPost_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ArticleCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PlatformPost_slug_key" ON "PlatformPost"("slug");
CREATE INDEX "PlatformPost_status_visible_deletedAt_type_publishedAt_idx" ON "PlatformPost"("status", "visible", "deletedAt", "type", "publishedAt");
CREATE INDEX "PlatformPost_featured_featurePriority_idx" ON "PlatformPost"("featured", "featurePriority");

CREATE TABLE "SiteSettings" (
  "id" TEXT NOT NULL DEFAULT 'main',
  "visitorCounterEnabled" BOOLEAN NOT NULL DEFAULT true,
  "visitorCounterLabel" TEXT NOT NULL DEFAULT 'زيارات مجتمعنا الجامعي',
  "visitorBaseline" INTEGER NOT NULL DEFAULT 0,
  "visitorBaselineVerified" BOOLEAN NOT NULL DEFAULT false,
  "visitorBaselineEvidence" TEXT,
  "visitorBaselineAsOf" TIMESTAMP(3),
  "trackingStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SiteSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SiteSettings_singleton_check" CHECK ("id" = 'main'),
  CONSTRAINT "SiteSettings_baseline_check" CHECK ("visitorBaseline" >= 0 AND ("visitorBaseline" = 0 OR ("visitorBaselineVerified" AND "visitorBaselineEvidence" IS NOT NULL AND length(trim("visitorBaselineEvidence")) >= 10 AND "visitorBaselineAsOf" IS NOT NULL AND "visitorBaselineAsOf" <= "trackingStartedAt")))
);
CREATE TABLE "VisitorDaily" (
  "day" DATE NOT NULL,
  "visits" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "VisitorDaily_pkey" PRIMARY KEY ("day"),
  CONSTRAINT "VisitorDaily_nonnegative_check" CHECK ("visits" >= 0)
);
CREATE TABLE "VisitDedup" (
  "key" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VisitDedup_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "VisitDedup_expiresAt_idx" ON "VisitDedup"("expiresAt");
