import { notFound } from "next/navigation";
import { requireAdminPage } from '@/server/auth';
import { authorizeRole } from '@/server/security';
import { db } from '@/server/db';
import { VisitorSettings } from '@/components/admin/visitor-settings';
import { PlatformSettings } from '@/components/admin/platform-settings';
export default async function Page() {
  const auth = await requireAdminPage(); if (auth.administrator.role === "ambassador") notFound(); authorizeRole(auth.administrator.role, ['owner']);
  const settings = await db.siteSettings.findUnique({ where: { id: 'main' }, select: { telegramSupportUrl: true } });
  const [counter, aggregate] = await Promise.all([db.siteSettings.findUnique({ where: { id: 'main' }, select: { visitorStartingValue: true } }), db.visitorDaily.aggregate({ _sum: { visits: true } })]);
  return <div className="space-y-5"><PlatformSettings initialUrl={settings?.telegramSupportUrl || null} /><VisitorSettings initial={counter || { visitorStartingValue: 0 }} tracked={aggregate._sum.visits || 0} /></div>;
}
