import { z } from "zod/v4";
import { administratorPassword } from "./administrator-validation.ts";
import { validTelegramUrl } from '../lib/external-links.ts';
export const telegramUrl = z.string().trim().max(300).refine(value => !!validTelegramUrl(value), 'أدخل رابط تيليجرام آمنًا بصيغة https://t.me/username أو رابط دعوة صالح.');

export const slug = z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const text = (max: number) => z.string().trim().max(max).refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value), "Control characters are not allowed.");
export const url = z.string().trim().max(2048).url().refine(value => { try { const u = new URL(value); return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password; } catch { return false; } }, "Only HTTP(S) URLs without credentials are allowed.");
export const mediaUrl = z.union([url, z.string().regex(/^\/media\/[a-zA-Z0-9_-]+$/), z.string().regex(/^\/university-logos\/[a-z0-9-]+\.png$/)]);
const optionalUrl = url.nullable().optional();
const optionalMedia = mediaUrl.nullable().optional();
export const date = z.iso.datetime({ offset: true });
const optionalDate = date.nullable().optional();
export const status = z.enum(["pending_review", "approved", "published", "unpublished", "hidden"]);
const ids = z.array(id).max(100);

export const ingestArticleSchema = z.object({
  university_slug: slug,
  source_key: slug.optional(),
  // Legacy UQU n8n payloads call the original news ID source_id.
  source_id: z.union([z.string().trim().min(1).max(200), z.number().int().nonnegative().transform(String)]),
  source_url: url,
  title: text(500).min(1),
  summary: text(5000).default(""),
  description: text(10000).default(""),
  content_text: text(100000).default(""),
  published_at: date.nullable().default(null),
  image_urls: z.array(url).max(20).default([]),
  pdf_urls: z.array(url).max(20).default([]),
  registration_links: z.array(url).max(20).default([]),
  category: slug.default("general"),
}).strict().transform(value => ({ ...value, source_key: value.source_key || `${value.university_slug}-rss`, image_urls: [...new Set(value.image_urls)].sort(), pdf_urls: [...new Set(value.pdf_urls)].sort(), registration_links: [...new Set(value.registration_links)].sort() }));
export type IngestArticle = z.output<typeof ingestArticleSchema>;

export const loginSchema = z.object({ email: z.email().max(254).transform(v => v.toLowerCase()), password: administratorPassword }).strict();
export const universitySchema = z.object({ name: text(200).min(1), slug, description: text(10000).default(""), city: text(100).default(""), region: text(100).default(""), websiteUrl: optionalUrl, logoUrl: optionalMedia, enabled: z.boolean().default(true), autoPublishNews: z.boolean().optional(), telegramCommunityUrl: telegramUrl.nullable().optional() }).strict();
export const articleSchema = z.object({ universityId: id, title: text(500).min(1), summary: text(5000).default(""), description: text(10000).default(""), content: text(100000).default(""), categoryId: id.nullable().optional(), sourceUrl: optionalUrl, originalPublishedAt: optionalDate, status: status.default("pending_review"), visible: z.boolean().default(true), imageUrls: z.array(mediaUrl).max(20).default([]), pdfUrls: z.array(mediaUrl).max(20).default([]), registrationLinks: z.array(url).max(20).default([]) }).strict();
// Do not derive this with .partial(): Zod defaults must never reset omitted editorial fields.
export const articlePatchSchema = z.object({ universityId: id.optional(), title: text(500).min(1).optional(), summary: text(5000).optional(), description: text(10000).optional(), content: text(100000).optional(), categoryId: id.nullable().optional(), sourceUrl: optionalUrl, originalPublishedAt: optionalDate, status: status.optional(), visible: z.boolean().optional(), imageUrls: z.array(mediaUrl).max(20).optional(), pdfUrls: z.array(mediaUrl).max(20).optional(), registrationLinks: z.array(url).max(20).optional(), action: z.enum(["restore", "soft_delete"]).optional() }).strict();
export const placement = z.enum(["homepage_banner", "university_banner", "sidebar", "between_news", "article_page", "footer"]);
export const adSchema = z.object({ title: text(300).min(1), description: text(5000).default(""), imageUrl: optionalMedia, destinationUrl: url, buttonText: text(100).min(1).default("اكتشف المزيد"), global: z.boolean().default(false), universityIds: ids.default([]), placementId: placement.optional(), placementIds: z.array(placement).min(1).max(6).optional(), priority: z.number().int().min(-1000).max(1000).default(0), startsAt: optionalDate, endsAt: optionalDate, status: z.enum(["active", "paused", "archived"]).default("paused") }).strict().superRefine((value, ctx) => {
  if (!value.global && !value.universityIds.length) ctx.addIssue({ code: "custom", path: ["universityIds"], message: "Choose at least one university or global visibility." });
  if (value.startsAt && value.endsAt && new Date(value.endsAt) < new Date(value.startsAt)) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End date must follow start date." });
  if (!value.placementId && !value.placementIds?.length) ctx.addIssue({ code: "custom", path: ["placementIds"], message: "Choose at least one placement." });
  if (!value.global && (value.placementIds?.includes("homepage_banner") || value.placementId === "homepage_banner")) ctx.addIssue({ code: "custom", path: ["global"], message: "Homepage banners require global visibility." });
  if (value.placementId && value.placementIds && !value.placementIds.includes(value.placementId)) ctx.addIssue({ code: "custom", path: ["placementIds"], message: "Primary placement must be included in the placement list." });
}).transform(value => { const placementIds = [...new Set(value.placementIds || [value.placementId!])]; return { ...value, placementIds, placementId: placementIds[0] }; });
export const linkKind = z.enum(["general", "official", "academic_calendar", "timetable", "student_service", "admission", "learning_resource"]);
export const linkSchema = z.object({ title: text(300).min(1), description: text(5000).default(""), sourceUrl: optionalUrl, status: status.optional(), destinationUrl: url, imageUrl: optionalMedia, icon: text(50).nullable().optional(), universityId: id.nullable().optional(), category: slug.default("general"), kind: linkKind.default("general"), displayOrder: z.number().int().min(0).max(100000).default(0), active: z.boolean().default(true) }).strict();
const calendarFields = { title: text(500).min(1), description: text(20000).default(""), sourceUrl: optionalUrl, startsAt: date, endsAt: optionalDate, applicationUrl: optionalUrl, universityId: id, status: status.default("pending_review"), visible: z.boolean().default(true) };
const validDates = (value: { startsAt: string; endsAt?: string | null }) => !value.endsAt || new Date(value.endsAt) >= new Date(value.startsAt);
export const eventKind = z.enum(["event", "academic_date", "registration", "examination"]);
export const eventSchema = z.object({ ...calendarFields, kind: eventKind.default("event") }).strict().refine(validDates, { path: ["endsAt"], message: "End date must follow start date." });
export const programSchema = z.object(calendarFields).strict().refine(validDates, { path: ["endsAt"], message: "End date must follow start date." });
export const sourceSchema = z.object({ key: slug, name: text(200).min(1), url, universityId: id, enabled: z.boolean().default(true) }).strict();
export const categorySchema = z.object({ name: text(100).min(1), slug }).strict();

export const platformType = z.enum(["platform_news", "blog", "guide", "topic"]);
export const platformPostActionSchema = z.object({ action: z.literal("restore") }).strict();
export const platformPostSchema = z.object({ slug, type: platformType.default("platform_news"), title: text(500).min(1), summary: text(5000).default(""), content: text(100000).default(""), coverImageUrl: optionalMedia, categoryId: id.nullable().optional(), featured: z.boolean().default(false), featurePriority: z.number().int().min(-1000).max(1000).default(0), seoTitle: text(150).nullable().optional(), seoDescription: text(320).nullable().optional(), status: status.default("pending_review"), visible: z.boolean().default(true) }).strict();
export const settingsSchema = z.object({
  visitorStartingValue: z.number({ error: 'أدخل قيمة ابتدائية رقمية صحيحة.' }).int('يجب إدخال عدد صحيح دون كسور.').min(0, 'القيمة الابتدائية لا يمكن أن تكون سالبة.').max(2147483647, 'الحد الأقصى للقيمة الابتدائية هو 2,147,483,647.').optional(),
  telegramSupportUrl: telegramUrl.nullable().optional(),
  visitorCounterEnabled: z.boolean().optional(), visitorCounterLabel: text(120).min(1).optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'أدخل إعدادًا واحدًا على الأقل.');

export const pageSchema = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), page_size: z.coerce.number().int().min(1).max(100).default(20), university: slug.optional(), category: slug.optional(), status: status.optional(), search: text(200).optional(), from: date.optional(), to: date.optional(), deleted: z.enum(["true", "false"]).optional(), placement: placement.optional(), type: platformType.optional(), kind: z.enum(["event", "academic_date", "registration", "examination", "general", "official", "academic_calendar", "timetable", "student_service", "admission", "learning_resource"]).optional(), scope: z.enum(["homepage", "university"]).optional(), region: text(100).optional(), featured: z.enum(["true", "false"]).optional() });
export function pagination(search: URLSearchParams) {
  const value = pageSchema.parse(Object.fromEntries(search));
  return { ...value, skip: (value.page - 1) * value.page_size, take: value.page_size };
}
