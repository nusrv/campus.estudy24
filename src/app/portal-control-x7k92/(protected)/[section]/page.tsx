import { administratorAccess, contentPermission, ambassadorResources } from "@/server/administrator-access";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/server/auth";
import { adminList, RESOURCES, resourceName } from "@/server/admin-data";
import { db } from "@/server/db";
import { adminSections } from "@/components/admin/config";
import { ResourceManager } from "@/components/admin/resource-manager";
import { VisitorSettings } from "@/components/admin/visitor-settings";
import { authorizeRole } from "@/server/security";
import { Administrators } from "@/components/admin/administrators";
import { administratorSelect } from "@/server/administrator-service";
export default async function ResourcePage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await requireAdminPage();
  const { section } = await params;
  if (auth.administrator.role === "ambassador" && !(ambassadorResources as readonly string[]).includes(section)) notFound();
  const actor = await administratorAccess(db, auth.administratorId, false, auth.id);
  if (section === "administrators") {
    authorizeRole(auth.administrator.role, ["owner"]);
    const administrators = await db.administrator.findMany({ select: administratorSelect, orderBy: { createdAt: "asc" } });
    const universities = await db.university.findMany({ where: { enabled: true }, select: { id: true, name: true } });
    return <Administrators initial={administrators} actorId={auth.administratorId} universities={universities} />;
  }
  if (section === "settings") {
    authorizeRole(auth.administrator.role, ["owner"]);
    const [settings, aggregate] = await Promise.all([db.siteSettings.findUnique({ where: { id: "main" }, select: { visitorStartingValue: true } }), db.visitorDaily.aggregate({ _sum: { visits: true } })]);
    return <VisitorSettings initial={settings || { visitorStartingValue: 0 }} tracked={aggregate._sum.visits || 0} />;
  }
  if (!(RESOURCES as readonly string[]).includes(section)) notFound();
  contentPermission(actor, section);
  const filters = Object.fromEntries(Object.entries(await searchParams).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const [data, universities, categories] = await Promise.all([adminList(resourceName(section), new URLSearchParams(filters), auth.administratorId, auth.id), db.university.findMany({ where: actor.role === "ambassador" ? { id: actor.universityId! } : {}, take: 1000, select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }), db.articleCategory.findMany({ take: 1000, select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } })]);
  return <ResourceManager key={`${section}:${JSON.stringify(filters)}`} resource={section} title={adminSections.find(s => s.key === section)?.title || "الإدارة"} data={JSON.parse(JSON.stringify(data))} lookups={{ universities, categories }} filters={filters} />;
}
