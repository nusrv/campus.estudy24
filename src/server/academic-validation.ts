import { z } from 'zod/v4';
import { id, slug, text, url, status } from './validation.ts';
const academicText = (max: number) => z.string({ error: 'أدخل قيمة نصية صحيحة.' }).trim().max(max, `الحد الأقصى ${max} حرف.`).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value), 'النص يحتوي على محارف غير مسموحة.');
const optionalText = (max: number) => academicText(max).min(1, 'اترك الحقل فارغًا عند عدم توفر المعلومة.').nullable().optional();
const academicUrl = academicText(2048).refine(value => url.safeParse(value).success, 'أدخل رابط HTTP أو HTTPS صحيحًا دون بيانات دخول.');
const optionalUrl = academicUrl.nullable().optional();
export const academicFields = {
  title: academicText(500).min(1, 'أدخل اسم البرنامج الأكاديمي.'),
  degreeName: optionalText(200), college: optionalText(300), department: optionalText(300), campus: optionalText(200),
  creditHours: z.number({ error: 'أدخل عدد ساعات صحيحًا، أو اتركه فارغًا عند عدم توفره.' }).finite('أدخل عددًا محدودًا من الساعات.').min(0, 'الساعات لا يمكن أن تكون سالبة.').max(5000, 'الحد الأقصى للساعات 5000.').nullable().optional(), studyMode: optionalText(200),
  tuitionInfo: optionalText(3000), tuitionVerified: z.boolean().optional(), tuitionSourceUrl: optionalUrl,
  description: optionalText(20000), sourceUrl: optionalUrl, officialProgramUrl: optionalUrl, studyPlanUrl: optionalUrl,
};
export function verifiedTuition(value: { tuitionInfo?: string | null; tuitionVerified?: boolean; tuitionSourceUrl?: string | null }) {
  return value.tuitionInfo ? value.tuitionVerified === true && !!value.tuitionSourceUrl : !value.tuitionVerified && !value.tuitionSourceUrl;
}
export const academicCreateSchema = z.object({ ...academicFields, universityId: id, status: status.optional(), visible: z.boolean().optional() }).strict();
export const academicPatchSchema = academicCreateSchema.partial().extend({ action: z.literal('restore').optional() }).strict().refine(v => Object.keys(v).length > 0, 'أدخل تعديلًا واحدًا على الأقل.');
export const academicIngestSchema = z.object({
  university_slug: slug.optional(), source_key: slug, source_id: text(300).min(1),
  name: academicFields.title, degree_name: academicFields.degreeName, college: academicFields.college,
  department: academicFields.department, campus: academicFields.campus, credit_hours: academicFields.creditHours,
  study_mode: academicFields.studyMode, tuition_info: academicFields.tuitionInfo, tuition_verified: academicFields.tuitionVerified,
  tuition_source_url: optionalUrl, description: academicFields.description, source_url: academicUrl,
  official_program_url: optionalUrl, study_plan_url: optionalUrl,
}).strict().refine(v => verifiedTuition({ tuitionInfo: v.tuition_info, tuitionVerified: v.tuition_verified, tuitionSourceUrl: v.tuition_source_url }), { path: ['tuition_info'], message: 'معلومات الرسوم تتطلب تحققًا صريحًا ورابط مصدر، ولا تُستنتج عند غيابها.' });
export function academicIncoming(input: z.output<typeof academicIngestSchema>) {
  return { title: input.name, degreeName: input.degree_name ?? null, college: input.college ?? null, department: input.department ?? null, campus: input.campus ?? null, creditHours: input.credit_hours ?? null, studyMode: input.study_mode ?? null, tuitionInfo: input.tuition_info ?? null, tuitionVerified: input.tuition_verified ?? false, tuitionSourceUrl: input.tuition_source_url ?? null, description: input.description ?? null, sourceUrl: input.source_url, officialProgramUrl: input.official_program_url ?? null, studyPlanUrl: input.study_plan_url ?? null };
}
export const academicQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1), page_size: z.coerce.number().int().min(1).max(100).default(12),
  search: text(200).optional(), degree: text(200).optional(), college: text(300).optional(), department: text(300).optional(),
  university: slug.optional(), status: status.optional(), deleted: z.enum(['true', 'false']).optional(), scope: z.enum(['university']).optional(),
});
