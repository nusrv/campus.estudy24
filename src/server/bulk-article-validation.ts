import { z } from 'zod/v4';
import { id } from './validation.ts';
export const MAX_BULK_ARTICLES = 100;
export const bulkArticleDeleteSchema = z.object({
  ids: z.array(id).min(1, 'حدّد خبرًا واحدًا على الأقل.').max(MAX_BULK_ARTICLES, 'الحد الأقصى هو 100 خبر في العملية الواحدة.').refine(ids => new Set(ids).size === ids.length, 'لا يمكن تكرار معرّف الخبر في التحديد.'),
}).strict();
