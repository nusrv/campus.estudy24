"use client";
import { useBulkSelection, BulkToolbar, SelectionCheckbox } from "./bulk-selection";
import { ManagementFilters } from "./management-filters";
import { AcademicRowInfo } from "./academic-row";
import { AcademicAdminFilters } from "./academic-filters";
import { formatDateTime, formatNumber } from "../../lib/format.ts";


import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Plus, Trash2, Upload, X, Check, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fieldsByResource, CONTROL_PATH, statuses, type Field } from "./config";
import { UniversityLogo } from "@/components/campus/university-logo";
import { useAdmin } from "./shell";
import { platformTypes } from "@/lib/portal";

type Row = Record<string, unknown> & { id: string };
type Lookup = { id: string; name: string; slug?: string };
type Data = { items: Row[]; total: number; page: number; page_size: number; pages: number; filters?: { degrees: string[]; colleges: string[]; departments: string[] } };
const selectClass = "h-11 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/20";
function string(value: unknown) { return value === null || value === undefined ? "" : String(value); }
function localDate(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function formattedDate(value: unknown) { return value ? formatDateTime(new Date(String(value)), { timeZone: "Asia/Riyadh" }) : "—"; }
const previewUrl = (url: string) => url.startsWith("/media/") ? `${CONTROL_PATH}/api/media/${url.split("/").pop()}` : url;

export function ResourceManager({ resource, title, data, lookups, filters }: { resource: string; title: string; data: Data; lookups: { universities: Lookup[]; categories: Lookup[] }; filters: Record<string, string> }) {
  const router = useRouter();
  const { csrf, role } = useAdmin();
  const dialog = useRef<HTMLDialogElement>(null);
  const preview = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const bulk = useBulkSelection(resource, filters, data.items.map(item => item.id));
  const selectable = bulk.actions.length > 0;
  const fields = (fieldsByResource[resource] || []).filter(field => role !== "ambassador" || field.name !== "universityId");
  const writable = fields.length > 0 && (!["universities", "sources"].includes(resource) || role === "owner");

  async function call(path: string, method = "GET", payload?: unknown) {
    const result = await fetch(`${CONTROL_PATH}/api/${path}`, { method, headers: { "Content-Type": "application/json", "x-csrf-token": csrf }, ...(payload !== undefined && { body: JSON.stringify(payload) }) });
    const body = await result.json();
    if (!result.ok) {
      if (result.status === 401) router.replace(`${CONTROL_PATH}/login`);
      const details = body.error?.fields?.map((f: { path: string; message: string }) => `${resource === 'academic-programs' ? fields.find(field => field.name === f.path)?.label || f.path : f.path}: ${f.message}`).join(" — ");
      throw new Error(details || body.error?.message || "تعذّر إكمال العملية.");
    }
    return body;
  }
  async function openEditor(item: Row | null) {
    setError(""); setMessage("");
    try {
      const full = item && resource === "articles" ? await call(`${resource}/${item.id}`) as Row : item;
      const initial: Record<string, unknown> = {};
      for (const field of fields) {
        const existing = full?.[field.name];
        if (field.type === "checkbox") initial[field.name] = existing ?? ["enabled", "active", "visible", "global", "showInDirectory"].includes(field.name);
        else if (field.type === "date") initial[field.name] = localDate(existing);
        else if (field.type === "multi") initial[field.name] = existing || [];
        else if (field.type === "lines") initial[field.name] = Array.isArray(existing) ? existing.join("\n") : "";
        else if (field.type === "number") initial[field.name] = existing ?? (resource === "academic-programs" ? "" : 0);
        else initial[field.name] = existing ?? (field.name === "institutionType" ? "UNIVERSITY" : field.name === "status" ? resource === "ads" ? "paused" : "pending_review" : field.name === "buttonText" ? "اكتشف المزيد" : field.name === "category" ? "general" : field.name === "kind" ? "event" : "");
      }
      setEditing(full); setValues(initial); dialog.current?.showModal();
    } catch (err) { setError(err instanceof Error ? err.message : "تعذّر تحميل البيانات."); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const payload: Record<string, unknown> = {};
      for (const field of fields) {
        const value = values[field.name];
        if (resource === "academic-programs" && value === "" && !["title", "status", "visible", "tuitionVerified"].includes(field.name)) { payload[field.name] = null; continue; }
        if (field.type === "date") payload[field.name] = value ? new Date(String(value)).toISOString() : null;
        else if (field.type === "number") payload[field.name] = Number(value);
        else if (field.type === "lines") payload[field.name] = [...new Set(String(value || "").split("\n").map(v => v.trim()).filter(Boolean))];
        else if (["universityId", "categoryId", "sourceUrl", "websiteUrl", "telegramCommunityUrl", "logoUrl", "imageUrl", "coverImageUrl", "seoTitle", "seoDescription", "icon", "applicationUrl"].includes(field.name)) payload[field.name] = value || null;
        else payload[field.name] = value;
      }
      await call(editing ? `${resource}/${editing.id}` : resource, editing ? "PATCH" : "POST", payload);
      dialog.current?.close(); setMessage("تم حفظ التغييرات بنجاح."); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "تعذّر الحفظ."); } finally { setBusy(false); }
  }
  async function action(item: Row, type: "delete" | "approve" | "publish" | "unpublish" | "hide" | "restore") {
    const confirmation = type === "delete" ? ["articles", "platform_posts", "academic-programs"].includes(resource) ? "نقل المحتوى إلى المحذوفات؟ يمكن استعادته لاحقًا." : ["universities", "sources"].includes(resource) ? "تعطيل هذا السجل تشغيليًا؟ للمؤسسات: سيوقف الصفحة ودخول السفراء والتكاملات. لإخفاء الدليل فقط استخدم إعداد الظهور." : "حذف هذا السجل نهائيًا؟" : resource === "academic-programs" ? "تأكيد تغيير حالة هذا البرنامج الأكاديمي؟" : "تأكيد تغيير حالة هذا الخبر؟";
    if (!window.confirm(confirmation)) return;
    setBusy(true); setError("");
    try {
      if (type === "delete") await call(`${resource}/${item.id}`, "DELETE");
      else await call(`${resource}/${item.id}`, "PATCH", type === "restore" ? { action: "restore" } : { status: { approve: "approved", publish: "published", unpublish: "unpublished", hide: "hidden" }[type] });
      setMessage("تم تحديث السجل."); router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "تعذّر التحديث."); } finally { setBusy(false); }
  }
  async function showPreview(item: Row) { setError(""); try { setDetail(await call(`articles/${item.id}`)); preview.current?.showModal(); } catch (err) { setError(err instanceof Error ? err.message : "تعذّرت المعاينة."); } }
  async function upload(field: Field, file?: File) {
    if (!file) return;
    setBusy(true); setError("");
    try { const form = new FormData(); form.append("file", file); const response = await fetch(`${CONTROL_PATH}/api/uploads`, { method: "POST", headers: { "x-csrf-token": csrf }, body: form }); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || "فشل رفع الملف."); setValues(old => ({ ...old, [field.name]: field.type === "lines" ? `${old[field.name] || ""}${old[field.name] ? "\n" : ""}${body.url}` : body.url })); } catch (err) { setError(err instanceof Error ? err.message : "فشل رفع الملف."); } finally { setBusy(false); }
  }
  function changePage(page: number) { const search = new URLSearchParams(filters); search.set("page", String(page)); router.push(`${CONTROL_PATH}/${resource}?${search}`); }
  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const search = new URLSearchParams();
    for (const [key, value] of form) { if (!value) continue; search.set(key, ["from", "to"].includes(key) ? new Date(`${value}T${key === "to" ? "23:59:59" : "00:00:00"}`).toISOString() : String(value)); }
    router.push(`${CONTROL_PATH}/${resource}?${search}`);
  }

  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-medium">{title}</h1><p className="mt-3 text-sm text-secondary-foreground">{formatNumber(data.total)} سجل · إدارة المحتوى من مكان واحد</p></div>{writable && <Button onClick={() => openEditor(null)}><Plus />إضافة جديد</Button>}</div>
    <form onSubmit={applyFilters} className="grid gap-3 rounded-[18px] border border-border bg-white p-5 sm:grid-cols-2 xl:grid-cols-4">{resource === "academic-programs" && <AcademicAdminFilters options={data.filters} filters={filters} universities={lookups.universities} ambassador={role === "ambassador"} />}<ManagementFilters resource={resource} filters={filters} universities={lookups.universities} ambassador={role === "ambassador"} /><Input name="search" aria-label="بحث بالعنوان أو الاسم" placeholder="بحث بالعنوان أو الاسم…" defaultValue={filters.search || ""} />{["articles", "platform_posts"].includes(resource) && <><select disabled={resource === "platform_posts"} name="university" aria-label="تصفية حسب الجامعة" defaultValue={filters.university || ""} className={selectClass}><option value="">كل الجامعات</option>{lookups.universities.map(u => <option key={u.id} value={u.slug}>{u.name}</option>)}</select><select name="category" aria-label="تصفية حسب التصنيف" defaultValue={filters.category || ""} className={selectClass}><option value="">كل التصنيفات</option>{lookups.categories.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select><select name="status" aria-label="تصفية حسب الحالة" defaultValue={filters.status || ""} className={selectClass}><option value="">كل الحالات</option>{statuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select><label className="space-y-1 text-xs text-secondary-foreground">من تاريخ الاستيراد<Input type="date" name="from" defaultValue={filters.from?.slice(0, 10) || ""} /></label><label className="space-y-1 text-xs text-secondary-foreground">إلى تاريخ الاستيراد<Input type="date" name="to" defaultValue={filters.to?.slice(0, 10) || ""} /></label><select name="deleted" aria-label="حالة الحذف" defaultValue={filters.deleted || "false"} className={selectClass}><option value="false">السجلات الحالية</option><option value="true">المحذوفات القابلة للاستعادة</option></select></>}{resource === "platform_posts" && <select name="type" aria-label="نوع محتوى المنصة" defaultValue={filters.type || ""} className={selectClass}><option value="">كل أنواع محتوى eStudy24</option>{platformTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>}<Button variant="outline" type="submit">تطبيق التصفية</Button></form>
    <BulkToolbar bulk={bulk} total={data.total} title={title} />
    {message && <p role="status" className="rounded-xl bg-accent p-4 text-sm text-primary">{message}</p>}{error && <p role="alert" className="rounded-xl bg-[#fff0ef] p-4 text-sm leading-7 text-red-700">{error}</p>}
    <Card className="overflow-hidden"><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-start text-sm"><thead className="border-b border-border bg-[#fcfcfd] text-xs text-secondary-foreground"><tr>{selectable && <th scope="col" className="w-20 p-5 text-start font-medium">اختيار</th>}<th scope="col" className="p-5 text-start font-medium">المحتوى</th><th scope="col" className="p-5 text-start font-medium">الحالة والتفاصيل</th><th scope="col" className="p-5 text-start font-medium">آخر تحديث</th><th scope="col" className="p-5 text-start font-medium">الإجراءات</th></tr></thead><tbody>{data.items.map(item => <tr key={item.id} className="border-b border-border last:border-0"><>{selectable && <td className="p-5"><SelectionCheckbox bulk={bulk} id={item.id} label={string(item.title || item.name || item.id)} /></td>}<td className="max-w-md p-5">{resource === "universities" && item.logoUrl ? <UniversityLogo url={previewUrl(string(item.logoUrl))} name={string(item.name)} className="mb-3 h-16 w-32" /> : null}<p className="font-medium leading-7">{string(item.title || item.name || item.action || item.outcome)}</p>{item.university ? <p className="mt-1 text-xs text-secondary-foreground">{string((item.university as Record<string, unknown>).name)}</p> : null}{resource === "academic-programs" && <AcademicRowInfo item={item} />}{resource === "articles" && <span className="mt-2 block text-xs text-secondary-foreground">{item.origin === "imported" ? item.autoPublishedAt ? "مستورد عبر n8n · نُشر تلقائيًا" : "مستورد عبر n8n" : "أُضيف يدويًا"}</span>}{resource === "logs" && <span className="mt-1 block break-all text-xs text-secondary-foreground">{string(item.resourceType || "articles")} · {string(item.publicationDecision || item.errorCode || item.originalId || item.requestId)}</span>}{resource === "audit" && <span className="mt-1 block text-xs text-secondary-foreground">{string(item.entity)} · {item.administrator ? string((item.administrator as Record<string, unknown>).name) : "النظام"}</span>}</td><td className="p-5"><Badge variant={item.status === "published" || item.status === "active" ? "default" : "neutral"}>{statuses.find(s => s.value === item.status)?.label || ({ active: "نشط", paused: "متوقف", archived: "مؤرشف" }[String(item.status)] || (item.enabled !== undefined ? item.enabled ? "مفعّل" : "معطّل" : item.active !== undefined ? item.active ? "مفعّل" : "معطّل" : string(item.outcome || item.slug || item.kind || "—")))}</Badge>{resource === "universities" && <p className="mt-2 text-xs leading-7">{item.institutionType === "COLLEGE" ? "كلية" : "جامعة"} · {item.showInDirectory ? "ظاهرة في الدليل" : "مخفية من الدليل فقط"}</p>}{resource === "ads" && <div className="mt-2 text-xs leading-6 text-secondary-foreground">آخر 30 يومًا: {formatNumber(((item.metrics || []) as { impressions: number; clicks: number }[]).reduce((s, m) => s + m.impressions, 0))} ظهور · {formatNumber(((item.metrics || []) as { impressions: number; clicks: number }[]).reduce((s, m) => s + m.clicks, 0))} نقر</div>}</td><td className="p-5 text-xs leading-7 text-secondary-foreground">{formattedDate(item.updatedAt || item.createdAt || item.discoveredAt)}</td><td className="p-5"><div className="flex flex-wrap gap-2">{resource === "universities" && <Link href={`${CONTROL_PATH}/universities/${item.id}/integration`} className="rounded-xl border border-border px-3 py-2 text-xs text-primary">تكامل n8n وAPI</Link>}{resource === "articles" && <Button variant="outline" size="icon" aria-label="معاينة الخبر" onClick={() => showPreview(item)} disabled={busy}><Eye /></Button>}{writable && <Button variant="outline" size="icon" aria-label="تعديل السجل" onClick={() => openEditor(item)} disabled={busy}><Pencil /></Button>}{["articles", "platform_posts", "academic-programs"].includes(resource) && item.deletedAt ? <Button variant="secondary" size="sm" onClick={() => action(item, "restore")} disabled={busy}><RotateCcw />استعادة</Button> : null}{resource === "articles" && (item.deletedAt ? null : <><Button variant="secondary" size="sm" onClick={() => action(item, "approve")} disabled={busy || item.status === "approved"}><Check />اعتماد</Button><Button variant="outline" size="sm" onClick={() => action(item, item.status === "published" ? "unpublish" : "publish")} disabled={busy}>{item.status === "published" ? "إلغاء النشر" : "نشر"}</Button><Button variant="ghost" size="sm" onClick={() => action(item, "hide")} disabled={busy || item.status === "hidden"}>إخفاء</Button></>)}{["owner", "ambassador"].includes(role) && writable && resource !== "categories" && !item.deletedAt && <Button variant="destructive" size="icon" aria-label={resource === "universities" || resource === "sources" ? "تعطيل السجل" : "حذف السجل"} onClick={() => action(item, "delete")} disabled={busy}><Trash2 /></Button>}</div></td></></tr>)}{!data.items.length && <tr><td colSpan={selectable ? 5 : 4} className="p-12 text-center text-secondary-foreground">لا توجد سجلات مطابقة. يمكنك إضافة محتوى أو تعديل عوامل التصفية.</td></tr>}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 text-xs text-secondary-foreground"><span>صفحة {formatNumber(data.page)} من {formatNumber(Math.max(data.pages, 1))}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={data.page <= 1} onClick={() => changePage(data.page - 1)}><ChevronRight />السابق</Button><Button size="sm" variant="outline" disabled={data.page >= data.pages} onClick={() => changePage(data.page + 1)}>التالي<ChevronLeft /></Button></div></div></Card>
    <dialog ref={dialog} aria-label={editing ? "تعديل السجل" : "إضافة سجل"} onCancel={() => { if (busy) return; setError(""); }} className="m-auto max-h-[90dvh] w-[calc(100%_-_32px)] max-w-3xl overflow-auto rounded-[18px] border border-border bg-white p-0 text-foreground backdrop:bg-[#182230]/35"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white p-5"><h2 className="text-lg font-medium">{editing ? "تعديل" : "إضافة"} — {title}</h2><Button variant="ghost" size="icon" onClick={() => dialog.current?.close()} aria-label="إغلاق" disabled={busy}><X /></Button></div><form onSubmit={submit} className="space-y-6 p-6"><div className="grid gap-5 sm:grid-cols-2">{fields.map(field => <div key={field.name} className={field.type === "textarea" || field.type === "lines" || field.type === "multi" ? "space-y-2 sm:col-span-2" : "space-y-2"}><label htmlFor={`field-${field.name}`} className="text-xs font-medium">{field.label}{field.required && <span className="ms-1 text-primary">*</span>}</label>{field.type === "checkbox" ? <input id={`field-${field.name}`} type="checkbox" className="ms-3 size-4 accent-primary" checked={Boolean(values[field.name])} onChange={e => setValues(v => ({ ...v, [field.name]: e.target.checked }))} /> : field.type === "textarea" || field.type === "lines" ? <textarea id={`field-${field.name}`} className="w-full rounded-xl border border-border bg-white p-3 text-sm leading-[1.9] outline-none focus-visible:ring-2 focus-visible:ring-primary/20" rows={field.name === "content" ? 8 : 3} maxLength={field.name === "content" ? 100000 : 20000} value={string(values[field.name])} onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))} required={field.required} dir={field.type === "lines" ? "ltr" : undefined} /> : field.type === "select" || field.type === "multi" ? <select id={`field-${field.name}`} className={selectClass + (field.type === "multi" ? " h-32" : "")} multiple={field.type === "multi"} disabled={resource === "academic-programs" && field.name === "universityId" && Boolean(editing)} required={field.required} value={field.type === "multi" ? (values[field.name] as string[]) || [] : string(values[field.name])} onChange={e => setValues(v => ({ ...v, [field.name]: field.type === "multi" ? [...e.target.selectedOptions].map(o => o.value) : e.target.value }))}>{field.type !== "multi" && <option value="">اختر…</option>}{(field.options || (field.lookup ? lookups[field.lookup].map(o => ({ value: o.id, label: o.name })) : [])).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : <Input id={`field-${field.name}`} type={field.type === "date" ? "datetime-local" : field.type === "number" ? "number" : field.type === "url" ? "url" : "text"} required={field.required} step={field.type === "number" && resource === "academic-programs" ? "any" : undefined} value={string(values[field.name])} onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))} dir={field.type === "url" || field.type === "date" || ["slug", "key"].includes(field.name) ? "ltr" : undefined} />}{field.help && <p className="text-xs leading-7 text-secondary-foreground">{field.help}</p>}{field.name === "logoUrl" && values.logoUrl ? <div className="flex items-center gap-3"><UniversityLogo url={previewUrl(string(values.logoUrl))} name={string(values.name)} /><Button type="button" variant="outline" size="sm" onClick={() => setValues(v => ({ ...v, logoUrl: "" }))}>إزالة الشعار</Button></div> : null}{field.type === "multi" && <p className="text-xs text-secondary-foreground">استخدم Ctrl / ⌘ لاختيار أكثر من جامعة.</p>}{field.media && <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-primary"><Upload className="size-3.5" />رفع ملف<input type="file" className="sr-only" accept={field.name === "pdfUrls" ? "application/pdf" : "image/png,image/jpeg,image/webp"} disabled={busy} onChange={e => { upload(field, e.target.files?.[0]); e.target.value = ""; }} /></label>}</div>)}</div>{error && <p role="alert" className="rounded-xl bg-[#fff0ef] p-4 text-sm leading-7 text-red-700">{error}</p>}<div className="flex items-center gap-3 border-t border-border pt-5"><Button type="submit" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ التغييرات"}</Button><Button variant="outline" type="button" disabled={busy} onClick={() => dialog.current?.close()}>إلغاء</Button><span className="ms-auto hidden text-[11px] text-secondary-foreground sm:block">التواريخ بتوقيت جهازك، وتُحفظ بتوقيت UTC.</span></div></form></dialog>
    <dialog ref={preview} aria-label="تفاصيل الخبر" className="m-auto max-h-[90dvh] w-[calc(100%_-_32px)] max-w-3xl overflow-auto rounded-[18px] border border-border bg-white p-6 text-foreground backdrop:bg-[#182230]/35">{detail && <div className="space-y-5"><div className="flex items-start justify-between gap-5"><h2 className="text-2xl font-medium leading-[1.8]">{string(detail.title)}</h2><Button variant="ghost" size="icon" aria-label="إغلاق المعاينة" onClick={() => preview.current?.close()}><X /></Button></div><div className="flex flex-wrap gap-3"><Badge>{detail.origin === "imported" ? "مستورد" : "يدوي"}</Badge><Badge variant="neutral">{statuses.find(s => s.value === detail.status)?.label}</Badge></div><p className="text-sm leading-[1.9] text-secondary-foreground">{string(detail.summary)}</p><p className="whitespace-pre-wrap text-sm leading-[1.9] text-secondary-foreground">{string(detail.description)}</p><p className="whitespace-pre-wrap text-sm leading-[1.9]">{string(detail.content)}</p>{detail.sourceUrl ? <a href={string(detail.sourceUrl)} target="_blank" rel="noopener noreferrer" className="block break-all text-sm text-primary underline">المصدر الأصلي: {string(detail.sourceUrl)}</a> : null}<div className="grid grid-cols-2 gap-3">{((detail.imageUrls || []) as string[]).map(url => <a key={url} href={previewUrl(url)} target="_blank" rel="noopener noreferrer"><img src={previewUrl(url)} referrerPolicy="no-referrer" alt="صورة مرفقة بالخبر" className="h-40 w-full rounded-xl border border-border object-contain" loading="lazy" /></a>)}</div>{((detail.pdfUrls || []) as string[]).map((url, i) => <a key={url} href={previewUrl(url)} target="_blank" rel="noopener noreferrer" className="block text-sm text-primary underline">ملف PDF {i + 1}</a>)}{((detail.registrationLinks || []) as string[]).map((url, i) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block text-sm text-primary underline">رابط التسجيل {i + 1}</a>)}<p className="text-xs leading-7 text-secondary-foreground">النشر الأصلي: {formattedDate(detail.originalPublishedAt)}<br />الاكتشاف: {formattedDate(detail.discoveredAt)}<br />آخر تغيير في المصدر: {formattedDate(detail.sourceUpdatedAt)}</p><details className="rounded-xl border border-border p-4"><summary className="cursor-pointer text-sm">سجل التحرير والحقول المحمية من الاستيراد</summary><p className="mt-3 text-xs leading-7 text-secondary-foreground">{((detail.editedFields || []) as string[]).join("، ") || "لا توجد تعديلات محمية بعد."}</p>{((detail.edits || []) as Row[]).map(edit => <details key={edit.id} className="mt-3 border-t border-border pt-3"><summary className="cursor-pointer text-xs">{formattedDate(edit.createdAt)}</summary><pre dir="ltr" className="mt-3 overflow-auto rounded-xl bg-muted p-4 text-xs">{JSON.stringify({ before: edit.before, after: edit.after }, null, 2)}</pre></details>)}</details></div>}</dialog>
  </div>;
}
