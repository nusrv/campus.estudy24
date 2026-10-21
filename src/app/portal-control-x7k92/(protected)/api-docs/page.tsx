import { notFound } from "next/navigation";
import { authorizeRole } from '@/server/security';
import { requireAdminPage } from '@/server/auth';
import { db } from '@/server/db';
import { appUrl } from '@/server/config';
import { ApiReference } from '@/components/admin/api-reference';
export default async function ApiDocsPage() {
  const auth = await requireAdminPage(); if (auth.administrator.role === "ambassador") notFound(); authorizeRole(auth.administrator.role, ["owner", "editor"]);
  const universities = await db.university.findMany({ where: { enabled: true }, select: { slug: true, name: true, websiteUrl: true }, orderBy: { name: 'asc' } });
  return <ApiReference origin={appUrl()} universities={universities} />;
}
