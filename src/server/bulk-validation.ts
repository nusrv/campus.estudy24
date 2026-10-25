import { z } from 'zod/v4';
import { id } from './validation.ts';
import { BULK_LIMIT, actionLabels } from '../lib/bulk.ts';
const ids = z.array(id).min(1).max(BULK_LIMIT).refine(values => new Set(values).size === values.length, 'التحديد يحتوي على معرفات مكررة.');
const filters = z.record(z.string().max(50), z.string().max(500)).refine(value => Object.keys(value).length <= 20);
export const selectionSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('ids'), ids, filters }).strict(),
  z.object({ mode: z.literal('all'), token: id, excluded: z.array(id).max(BULK_LIMIT).refine(values => new Set(values).size === values.length) }).strict(),
]);
export const bulkRequestSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('snapshot'), filters }).strict(),
  z.object({ op: z.literal('membership'), token: id, ids: z.array(id).max(100).refine(values => new Set(values).size === values.length) }).strict(),
  z.object({ op: z.literal('preview'), action: z.enum(Object.keys(actionLabels) as [keyof typeof actionLabels, ...(keyof typeof actionLabels)[]]), selection: selectionSchema }).strict(),
  z.object({ op: z.literal('execute'), token: id, confirmation: z.string().max(200) }).strict(),
]);
