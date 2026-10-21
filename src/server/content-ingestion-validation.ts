import { z } from 'zod/v4';
import { date, slug, text, url, linkKind } from './validation.ts';
const common = {
  university_slug: slug, source_key: slug.optional(),
  source_id: z.union([z.string().trim().min(1).max(200), z.number().int().nonnegative().transform(String)]),
  source_url: url, title: text(500).min(1), description: text(20000).default(''),
};
export const ingestedLinkSchema = z.object({ ...common, title: text(300).min(1), description: text(5000).default(''), destination_url: url, kind: linkKind, category: slug.default('general'), image_url: url.nullable().optional() }).strict();
const dated = { ...common, starts_at: date, ends_at: date.nullable().optional(), application_url: url.nullable().optional() };
const validRange = (value: { starts_at: string; ends_at?: string | null }) => !value.ends_at || new Date(value.ends_at) >= new Date(value.starts_at);
const rangeError = { message: 'تاريخ النهاية يجب أن يلي البداية. استخدم تواريخ المصدر الصريحة.', path: ['ends_at'] };
export const ingestedEventSchema = z.object({ ...dated, kind: z.literal('event').default('event') }).strict().refine(validRange, rangeError);
export const ingestedCalendarSchema = z.object({ ...dated, kind: z.enum(['academic_date', 'registration', 'examination']) }).strict().refine(validRange, rangeError);
export const ingestedProgramSchema = z.object(dated).strict().refine(validRange, rangeError);
export const contentIngestionSchemas = { links: ingestedLinkSchema, events: ingestedEventSchema, calendar: ingestedCalendarSchema, programs: ingestedProgramSchema };
export type ImportedContentType = keyof typeof contentIngestionSchemas;
