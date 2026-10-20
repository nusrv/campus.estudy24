import { notFound } from "next/navigation";
import { requireAdminPage } from "@/server/auth";
import { adminList, RESOURCES, resourceName } from "@/server/admin-data";
import { db } from "@/server/db";
import { adminSections } from "@/components/admin/config";
import { ResourceManager } from "@/components/admin/resource-manager";
import { VisitorSettings } from "@/components/admin/visitor-settings";
import { authorizeRole } from "@/server/security";
import { DEFAULT_COUNTER_LABEL } from "@/server/visitor-policy";
export default async function ResourcePage({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const auth = await requireAdminPage();
  const { section } = await params;
  if (section === "settings") {
    authorizeRole(auth.administrator.role, ["owner"]);
    const [settings, aggregate] = await Promise.all([db.siteSettings.findUnique({ where: { id: "main" } }), db.visitorDaily.aggregate({ _sum: { visits: true } })]);
    return <VisitorSettings initial={JSON.parse(JSON.stringify(settings || { visitorCounterEnabled: true, visitorCounterLabel: DEFAULT_COUNTER_LABEL, visitorBaseline: 0, visitorBaselineVerified: false, visitorBaselineEvidence: null, visitorBaselineAsOf: null }))} tracked={aggregate._sum.visits || 0} />;
  }
  if (!(RESOURCES as readonly string[]).includes(section)) notFound();
  const filters = Object.fromEntries(Object.entries(await searchParams).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const [data, universities, categories] = await Promise.all([adminList(resourceName(section), new URLSearchParams(filters)), db.university.findMany({ take: 1000, select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }), db.articleCategory.findMany({ take: 1000, select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } })]);
  return <ResourceManager key={`${section}:${JSON.stringify(filters)}`} resource={section} title={adminSections.find(s => s.key === section)?.title || "الإدارة"} data={JSON.parse(JSON.stringify(data))} lookups={{ universities, categories }} filters={filters} />;
}
