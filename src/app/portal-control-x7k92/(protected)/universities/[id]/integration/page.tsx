import { authorizeRole } from '@/server/security';
import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/server/auth';
import { db } from '@/server/db';
import { appUrl } from '@/server/config';
import { apiKeySelect } from '@/server/university-keys';
import { UniversityIntegration } from '@/components/admin/integration';
export default async function IntegrationPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPage(); if (auth.administrator.role === "ambassador") notFound(); authorizeRole(auth.administrator.role, ["owner", "editor"]);
  const { id } = await params;
  const university = await db.university.findUnique({ where: { id }, select: { id: true, slug: true, name: true, websiteUrl: true, autoPublishNews: true } });
  if (!university) notFound();
  const keys = auth.administrator.role === 'owner' ? await db.universityApiKey.findMany({ where: { universityId: id }, select: apiKeySelect, orderBy: { createdAt: 'desc' }, take: 20 }) : [];
  return <UniversityIntegration university={university} initialKeys={JSON.parse(JSON.stringify(keys))} origin={appUrl()} />;
}
