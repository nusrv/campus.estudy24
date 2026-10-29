import { requireAdminPage } from '@/server/auth';
import { db } from '@/server/db';
import { institutionPreflight } from '@/server/institution-reconciliation';
import { InstitutionReconciliation } from '@/components/admin/institution-reconciliation';
import { notFound } from 'next/navigation';
export default async function InstitutionReconciliationPage() {
  const auth = await requireAdminPage();
  if (auth.administrator.role !== 'owner') notFound();
  const data = await institutionPreflight(db, { id: auth.administratorId, sessionId: auth.id });
  return <InstitutionReconciliation initial={data} />;
}
