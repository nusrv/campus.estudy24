import { redirect } from 'next/navigation';
import { requireAdminPage } from '@/server/auth';
import { notFound } from 'next/navigation';
export default async function Page() {
  const auth = await requireAdminPage();
  if (auth.administrator.role !== 'owner') notFound();
  redirect('/portal-control-x7k92/universities');
}
