import { requireAdminPage } from '@/server/auth';
import { db } from '@/server/db';
import { catalogAdministration } from '@/server/course-catalog-service';
import { CourseCatalogAdministration } from '@/components/admin/course-catalog';
import { notFound } from 'next/navigation';
export default async function CourseCatalogAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await requireAdminPage();
  if (auth.administrator.role !== 'owner') notFound();
  const filters = Object.fromEntries(Object.entries(await searchParams).filter((e): e is [string,string] => typeof e[1] === 'string' && e[1] !== ''));
  const data = await catalogAdministration(db, { id: auth.administratorId, sessionId: auth.id }, new URLSearchParams(filters));
  return <CourseCatalogAdministration data={data} filters={filters} />;
}
