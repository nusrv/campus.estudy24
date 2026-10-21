import { requireAdminPage } from '@/server/auth';
import { db } from '@/server/db';
import { appUrl } from '@/server/config';
import { ApiReference } from '@/components/admin/api-reference';
export default async function ApiDocsPage() {
  await requireAdminPage();
  const universities = await db.university.findMany({ where: { enabled: true }, select: { slug: true, name: true, websiteUrl: true }, orderBy: { name: 'asc' } });
  return <ApiReference origin={appUrl()} universities={universities} />;
}
