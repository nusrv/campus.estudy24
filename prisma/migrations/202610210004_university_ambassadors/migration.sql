-- Additive: existing accounts and uploaded media retain NULL scope.
ALTER TYPE "AdminRole" ADD VALUE 'ambassador';
ALTER TABLE "Administrator" ADD COLUMN "universityId" TEXT;
ALTER TABLE "Administrator" ADD CONSTRAINT "Administrator_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Administrator" ADD CONSTRAINT "Administrator_role_university_check" CHECK (("role"::text = 'ambassador' AND "universityId" IS NOT NULL) OR ("role"::text <> 'ambassador' AND "universityId" IS NULL));
CREATE INDEX "Administrator_universityId_idx" ON "Administrator"("universityId");
ALTER TABLE "UploadedMedia" ADD COLUMN "universityId" TEXT;
ALTER TABLE "UploadedMedia" ADD CONSTRAINT "UploadedMedia_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "UploadedMedia_universityId_idx" ON "UploadedMedia"("universityId");
