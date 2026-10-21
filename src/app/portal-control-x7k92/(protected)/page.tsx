
import { formatNumber, formatDateTime } from "../../../lib/format.ts";
import { requireAdminPage } from "@/server/auth";
import { db } from "@/server/db";
import { activeAdsWhere } from "@/server/public-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ADMIN_PATH } from "@/server/security";
import { statuses } from "@/components/admin/config";
export default async function OverviewPage() {
  await requireAdminPage();
  const [universities, imported, published, pending, ads, recent, logs] = await Promise.all([
    db.university.count(), db.article.count({ where: { origin: "imported", deletedAt: null } }), db.article.count({ where: { status: "published", visible: true, deletedAt: null } }), db.article.count({ where: { status: "pending_review", deletedAt: null } }), db.advertisement.count({ where: activeAdsWhere() }),
    db.article.findMany({ where: { origin: "imported", deletedAt: null }, take: 6, orderBy: { discoveredAt: "desc" }, include: { university: { select: { name: true } } } }),
    db.ingestionLog.findMany({ take: 10, orderBy: { createdAt: "desc" }, include: { source: { select: { name: true } } } }),
  ]);
  return <div className="space-y-7"><div><h1 className="text-3xl font-medium">نظرة عامة</h1><p className="mt-3 text-sm leading-7 text-secondary-foreground">نبض المحتوى، وآخر تحديثات مجتمع eStudy24.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[["الجامعات", universities], ["الأخبار المستوردة", imported], ["الأخبار المنشورة", published], ["بانتظار المراجعة", pending], ["الإعلانات النشطة", ads]].map(([label, value]) => <Card key={label}><CardContent><p className="text-xs text-secondary-foreground">{label}</p><p className="mt-4 text-3xl font-medium text-primary">{formatNumber(Number(value))}</p></CardContent></Card>)}</div><div className="grid gap-5 xl:grid-cols-2"><Card><CardHeader><CardTitle>المحتوى المستورد حديثًا</CardTitle></CardHeader><CardContent className="space-y-4">{recent.length ? recent.map(a => <Link href={`${ADMIN_PATH}/articles?search=${encodeURIComponent(a.title)}`} key={a.id} className="block border-b border-border pb-4 last:border-0"><span className="text-sm font-medium">{a.title}</span><span className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-secondary-foreground">{a.university.name}<Badge variant={a.status === "published" ? "default" : "neutral"}>{statuses.find(s => s.value === a.status)?.label}</Badge></span></Link>) : <p className="text-sm text-secondary-foreground">لا يوجد محتوى مستورد بعد.</p>}</CardContent></Card><Card><CardHeader><CardTitle>نشاط الاستيراد والأخطاء</CardTitle></CardHeader><CardContent className="space-y-3">{logs.length ? logs.map(l => <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 text-xs last:border-0"><span>{l.source?.name || "طلب استيراد"}<span className="mt-1 block text-secondary-foreground">{formatDateTime(l.createdAt, { timeZone: "Asia/Riyadh" })}</span></span><Badge variant={["failed", "rejected"].includes(l.outcome) ? "rose" : "default"}>{l.errorCode || l.outcome}</Badge></div>) : <p className="text-sm text-secondary-foreground">لم تُسجّل عمليات استيراد بعد.</p>}</CardContent></Card></div></div>;
}
