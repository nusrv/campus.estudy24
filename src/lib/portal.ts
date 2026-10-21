
import { formatDate } from "./format.ts";
export const platformTypes = [
  { value: "platform_news", label: "أخبار eStudy24" },
  { value: "blog", label: "المدوّنة" },
  { value: "guide", label: "أدلة تعليمية" },
  { value: "topic", label: "موضوعات تعليمية" },
] as const;
export const linkKinds = [
  { value: "general", label: "رابط عام" }, { value: "official", label: "الموقع الرسمي" },
  { value: "academic_calendar", label: "التقويم الأكاديمي" }, { value: "timetable", label: "الجداول الدراسية" },
  { value: "student_service", label: "خدمات الطلبة" }, { value: "admission", label: "القبول والتسجيل" },
  { value: "learning_resource", label: "مصادر تعليمية" },
] as const;
export function platformTypeLabel(type: string) { return platformTypes.find(t => t.value === type)?.label || "محتوى eStudy24"; }
export function arabicDate(value: Date | string | null) { return value ? formatDate(new Date(value), { calendar: "gregory", timeZone: "Asia/Riyadh", year: "numeric", month: "long", day: "numeric" }) : ""; }
export function dateRange(from?: string, to?: string) {
  const iso = (value: string, end: boolean) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00"}+03:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    // Reject impossible dates rather than letting JavaScript roll them into a different month.
    const actual = new Date(parsed.getTime() + 3 * 3600000).toISOString().slice(0, 10);
    return actual === value ? parsed.toISOString() : null;
  };
  return { ...(from && iso(from, false) && { from: iso(from, false)! }), ...(to && iso(to, true) && { to: iso(to, true)! }) };
}
