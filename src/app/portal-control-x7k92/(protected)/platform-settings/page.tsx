import { notFound } from "next/navigation";
import { requireAdminPage } from '@/server/auth';
import { authorizeRole } from '@/server/security';
import { db } from '@/server/db';
import { PlatformSettings } from '@/components/admin/platform-settings';
export default async function Page() {
  const auth = await requireAdminPage(); if (auth.administrator.role === "ambassador") notFound(); authorizeRole(auth.administrator.role, ['owner']);
  const settings = await db.siteSettings.findUnique({ where: { id: 'main' }, select: { telegramSupportUrl: true } });
  return <PlatformSettings initialUrl={settings?.telegramSupportUrl || null} />;
}
