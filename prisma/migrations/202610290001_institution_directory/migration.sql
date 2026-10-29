-- Additive defaults preserve every existing institution's operational/discovery state.
CREATE TYPE "InstitutionType" AS ENUM ('UNIVERSITY', 'COLLEGE');
ALTER TABLE "University"
  ADD COLUMN "showInDirectory" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "institutionType" "InstitutionType" NOT NULL DEFAULT 'UNIVERSITY';
CREATE INDEX "University_directory_idx" ON "University"("enabled", "showInDirectory", "institutionType");
