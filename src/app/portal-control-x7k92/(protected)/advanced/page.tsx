import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdminPage } from '@/server/auth';
import { AdminPageHeader } from '@/components/admin/page-header';
import { CONTROL_PATH } from '@/components/admin/config';
export default async function AdvancedPage() {
  const auth = await requireAdminPage();
  if (auth.administrator.role === 'ambassador') notFound();
  const entries = [{ key: 'categories', title: 'تصنيفات المحتوى' }, { key: 'audit', title: 'سجل الإدارة' }, { key: 'api-docs', title: 'وثائق API والتكاملات' }, ...(auth.administrator.role === 'owner' ? [{ key: 'course-catalog?view=mappings', title: 'ربط تصنيفات الشروحات' }] : [])];
  return <div className="space-y-5"><AdminPageHeader title="إعدادات متقدمة" /><div className="grid gap-3 sm:grid-cols-2">{entries.map(item => <Link key={item.key} href={`${CONTROL_PATH}/${item.key}`} className="rounded-[18px] border border-border bg-white p-4 text-sm font-medium hover:text-primary">{item.title}</Link>)}</div></div>;
}
