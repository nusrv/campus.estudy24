import { ZodError } from 'zod/v4';
import { requireAdmin } from '@/server/auth';
import { bulkDeleteArticles } from '@/server/admin-data';
import { bulkArticleDeleteSchema } from '@/server/bulk-article-validation';
import { HttpError, readJson } from '@/server/security';
import { failure, json } from '@/server/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const auth = await requireAdmin(request, ['owner', 'ambassador']);
    const input = bulkArticleDeleteSchema.parse(await readJson(request, 32768));
    return json(await bulkDeleteArticles(input, auth.administratorId, auth.id));
  } catch (error) {
    if (error instanceof ZodError) return failure(new HttpError(422, 'INVALID_SELECTION', 'التحديد غير صالح. أرسل من 1 إلى 100 معرّف خبر صحيح دون تكرار.'));
    if (error instanceof HttpError) {
      const messages: Record<string, string> = { UNAUTHORIZED: 'انتهت الجلسة أو لم تسجّل الدخول. سجّل الدخول مجددًا.', FORBIDDEN: 'حذف الأخبار متاح للمالك فقط.', CSRF_REJECTED: 'تعذّر التحقق من أمان الطلب. حدّث الصفحة وحاول مجددًا.', JSON_REQUIRED: 'يجب إرسال التحديد بصيغة JSON.', INVALID_JSON: 'بيانات الطلب غير صالحة.', PAYLOAD_TOO_LARGE: 'حجم طلب الحذف أكبر من الحد المسموح.' };
      return failure(new HttpError(error.status, error.code, messages[error.code] || error.message));
    }
    const response = failure(error);
    const body = await response.json();
    return json({ ...body, error: { code: body.error.code, message: 'تعذّر إتمام عملية الحذف. حدّث القائمة وحاول مجددًا.' } }, response.status);
  }
}
