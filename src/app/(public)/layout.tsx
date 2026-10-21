import { db } from "@/server/db";
import { available } from "@/server/platform-data";
import { CampusFooter, CampusHeader } from "@/components/campus/public-shell";
export default async function PublicLayout({ children }: { children: React.ReactNode }) { const settings = await available(() => db.siteSettings.findUnique({ where: { id: "main" }, select: { telegramSupportUrl: true } })); return <><a href="#public-content" className="skip-link">انتقل إلى المحتوى</a><CampusHeader /><main id="public-content" className="mx-auto min-h-[60dvh] max-w-7xl px-5 pt-9 sm:px-8 sm:pt-12">{children}</main><CampusFooter supportUrl={settings?.telegramSupportUrl} /></>; }
