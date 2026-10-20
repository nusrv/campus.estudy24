import { linkKinds, platformTypes } from "@/lib/portal";
export const CONTROL_PATH = "/portal-control-x7k92";
export const adminSections = [
  { key: "", title: "نظرة عامة" }, { key: "universities", title: "إدارة الجامعات" },
  { key: "articles", title: "الأخبار والمحتوى" }, { key: "ads", title: "الإعلانات" },
  { key: "links", title: "الروابط والخدمات" }, { key: "events", title: "الفعاليات والمواعيد" },
  { key: "programs", title: "البرامج التدريبية" }, { key: "sources", title: "مصادر الاستيراد" },
  { key: "categories", title: "التصنيفات" }, { key: "logs", title: "سجل الاستيراد" },
  { key: "audit", title: "سجل الإدارة" },
  { key: "platform_posts", title: "محتوى eStudy24 والرئيسية" },
  { key: "settings", title: "إعدادات عدّاد الزيارات" },
];
export const statuses = [{ value: "pending_review", label: "بانتظار المراجعة" }, { value: "approved", label: "معتمد" }, { value: "published", label: "منشور" }, { value: "unpublished", label: "غير منشور" }, { value: "hidden", label: "مخفي" }];
export const placements = [{ value: "homepage_banner", label: "بانر الرئيسية" }, { value: "university_banner", label: "بانر الجامعة" }, { value: "sidebar", label: "الشريط الجانبي" }, { value: "between_news", label: "بين بطاقات الأخبار" }, { value: "article_page", label: "صفحة الخبر" }, { value: "footer", label: "تذييل الصفحة" }];
export type Field = { name: string; label: string; type?: "text" | "textarea" | "url" | "number" | "checkbox" | "date" | "select" | "multi" | "lines"; required?: boolean; options?: { value: string; label: string }[]; lookup?: "universities" | "categories"; media?: boolean };
const title: Field = { name: "title", label: "العنوان", required: true };
const description: Field = { name: "description", label: "الوصف", type: "textarea" };
const university: Field = { name: "universityId", label: "الجامعة (فارغ = عام)", type: "select", lookup: "universities" };
const publication: Field = { name: "status", label: "حالة النشر", type: "select", options: statuses };
const visible: Field = { name: "visible", label: "ظاهر في الموقع عند النشر", type: "checkbox" };
const calendar: Field[] = [title, description, university, { name: "startsAt", label: "تاريخ ووقت البداية", type: "date", required: true }, { name: "endsAt", label: "تاريخ ووقت النهاية", type: "date" }, { name: "applicationUrl", label: "رابط التقديم", type: "url" }, publication, visible];
export const fieldsByResource: Record<string, Field[]> = {
  universities: [{ name: "name", label: "اسم الجامعة", required: true }, { name: "slug", label: "المعرّف الفريد بالإنجليزية", required: true }, description, { name: "websiteUrl", label: "الموقع الرسمي", type: "url" }, { name: "logoUrl", label: "رابط الشعار أو رفعه", media: true }, { name: "enabled", label: "الجامعة مفعّلة", type: "checkbox" }],
  articles: [title, { ...university, label: "الجامعة", required: true }, { name: "summary", label: "الملخص", type: "textarea" }, { name: "description", label: "وصف الخبر", type: "textarea" }, { name: "content", label: "المحتوى النصّي", type: "textarea" }, { name: "categoryId", label: "التصنيف", type: "select", lookup: "categories" }, { name: "sourceUrl", label: "رابط المصدر الأصلي", type: "url" }, { name: "originalPublishedAt", label: "تاريخ النشر الأصلي (ليس موعد الفعالية)", type: "date" }, publication, visible, { name: "imageUrls", label: "روابط الصور — رابط في كل سطر", type: "lines", media: true }, { name: "pdfUrls", label: "روابط ملفات PDF — رابط في كل سطر", type: "lines", media: true }, { name: "registrationLinks", label: "روابط التسجيل — رابط في كل سطر", type: "lines" }],
  ads: [title, description, { name: "imageUrl", label: "صورة الإعلان", media: true }, { name: "destinationUrl", label: "رابط الوجهة", type: "url", required: true }, { name: "buttonText", label: "نص الزر", required: true }, { name: "global", label: "إعلان عام لكل الجامعات", type: "checkbox" }, { name: "universityIds", label: "الجامعات المستهدفة (عند إلغاء الخيار العام)", type: "multi", lookup: "universities" }, { name: "placementId", label: "موضع العرض", type: "select", options: placements, required: true }, { name: "priority", label: "الأولوية (الأعلى أولاً)", type: "number" }, { name: "startsAt", label: "بداية العرض", type: "date" }, { name: "endsAt", label: "نهاية العرض", type: "date" }, { name: "status", label: "الحالة", type: "select", options: [{ value: "active", label: "نشط" }, { value: "paused", label: "متوقف مؤقتًا" }, { value: "archived", label: "مؤرشف" }] }],
  links: [title, description, { name: "destinationUrl", label: "رابط الوجهة", type: "url", required: true }, { name: "imageUrl", label: "صورة اختيارية", media: true }, { name: "icon", label: "اسم أيقونة اختياري" }, university, { name: "category", label: "التصنيف بالإنجليزية", required: true }, { name: "displayOrder", label: "ترتيب العرض", type: "number" }, { name: "active", label: "الرابط مفعّل", type: "checkbox" }],
  events: [...calendar, { name: "kind", label: "النوع", type: "select", options: [{ value: "event", label: "فعالية" }, { value: "academic_date", label: "موعد أكاديمي" }, { value: "registration", label: "فرصة تسجيل" }] }],
  programs: calendar,
  sources: [{ name: "name", label: "اسم المصدر", required: true }, { name: "key", label: "معرّف المصدر (مثل uqu-rss)", required: true }, { name: "url", label: "رابط المصدر", type: "url", required: true }, { ...university, required: true }, { name: "enabled", label: "السماح بالاستيراد", type: "checkbox" }],
  categories: [{ name: "name", label: "اسم التصنيف", required: true }, { name: "slug", label: "المعرّف بالإنجليزية", required: true }],
};

fieldsByResource.platform_posts = [
  title, { name: "slug", label: "معرّف الرابط بالإنجليزية", required: true },
  { name: "type", label: "نوع محتوى eStudy24", type: "select", options: [...platformTypes], required: true },
  { name: "summary", label: "الملخص", type: "textarea" }, { name: "content", label: "المحتوى النصّي", type: "textarea" },
  { name: "coverImageUrl", label: "صورة الغلاف", media: true },
  { name: "categoryId", label: "التصنيف", type: "select", lookup: "categories" },
  { name: "featured", label: "إبراز المحتوى في الصفحة الرئيسية", type: "checkbox" },
  { name: "featurePriority", label: "أولوية الإبراز (الأعلى أولاً)", type: "number" },
  { name: "seoTitle", label: "عنوان محركات البحث (اختياري)" },
  { name: "seoDescription", label: "وصف محركات البحث (اختياري)", type: "textarea" }, publication, visible,
];
fieldsByResource.universities.splice(3, 0, { name: "city", label: "المدينة" }, { name: "region", label: "المنطقة" });
fieldsByResource.ads = fieldsByResource.ads.map(field => field.name === "placementId" ? { name: "placementIds", label: "مواضع العرض — يمكن اختيار أكثر من موضع", type: "multi", options: placements, required: true } : field);
fieldsByResource.links.push({ name: "kind", label: "نوع الخدمة أو المورد", type: "select", options: [...linkKinds], required: true });
fieldsByResource.events.find(field => field.name === "kind")?.options?.push({ value: "examination", label: "موعد اختبار" });
for (const resource of ["events", "programs"]) fieldsByResource[resource] = fieldsByResource[resource].map(field => field.name === "universityId" ? { ...field, label: "الجامعة", required: true } : field);
