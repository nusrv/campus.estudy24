import { z } from 'zod/v4';
import { id, slug, text, date, status } from './validation.ts';
import type { AdministratorAccess } from './administrator-access.ts';
import { universityScope } from './administrator-access.ts';
import { HttpError } from './security.ts';
import type { PrismaClient, Prisma } from '@prisma/client';
import { administratorSelect } from './administrator-service.ts';
import { pagination } from './validation.ts';

const fields = { search: text(200), university: slug, category: slug, status: z.enum([...status.options, 'active', 'paused', 'archived']), from: date, to: date, deleted: z.enum(['true', 'false']), type: z.enum(['platform_news', 'blog', 'guide', 'topic']), degree: text(200), college: text(300), department: text(300), kind: z.enum(['event', 'academic_date', 'registration', 'examination', 'general', 'official', 'academic_calendar', 'timetable', 'student_service', 'admission', 'learning_resource']), active: z.enum(['true', 'false']), enabled: z.enum(['true', 'false']), role: z.enum(['owner', 'editor', 'ambassador']), revoked: z.enum(['true', 'false']) };
const allowed: Record<string, string[]> = {
  articles: ['search', 'university', 'category', 'status', 'from', 'to', 'deleted'],
  'academic-programs': ['search', 'university', 'status', 'deleted', 'degree', 'college', 'department'],
  platform_posts: ['search', 'category', 'status', 'type', 'deleted', 'from', 'to'],
  events: ['search', 'university', 'status', 'kind', 'from', 'to'], programs: ['search', 'university', 'status', 'from', 'to'],
  links: ['search', 'university', 'status', 'category', 'kind', 'active'], ads: ['search', 'status'],
  universities: ['search', 'enabled'], sources: ['search', 'university', 'enabled'], categories: ['search'],
  administrators: ['search', 'role', 'active', 'university'], 'api-keys': ['university', 'revoked'],
};
export function managementQuery(resource: string, search: URLSearchParams, actor: AdministratorAccess) {
  const raw = Object.fromEntries(search);
  delete raw.page; delete raw.page_size;
  if (!allowed[resource] || Object.keys(raw).some(key => !allowed[resource].includes(key))) throw new HttpError(422, 'INVALID_FILTER', 'تحتوي التصفية على حقل غير مدعوم لهذا القسم.');
  const parsed = z.object(Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.optional()]))).strict().parse(raw) as Record<string, string | undefined>;
  if (actor.role === 'ambassador' && parsed.university && parsed.university !== actor.university?.slug) throw new HttpError(403, 'UNIVERSITY_SCOPE', 'الجامعة خارج النطاق المعيّن لحسابك.');
  if (parsed.from && parsed.to && new Date(parsed.from) > new Date(parsed.to)) throw new HttpError(422, 'INVALID_FILTER', 'تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.');
  if (parsed.status && !['ads'].includes(resource) && !status.safeParse(parsed.status).success) throw new HttpError(422, 'INVALID_FILTER', 'حالة التصفية غير صالحة لهذا القسم.');
  if (resource === 'ads' && parsed.status && !['active', 'paused', 'archived'].includes(parsed.status)) throw new HttpError(422, 'INVALID_FILTER', 'حالة الإعلان غير صالحة.');
  if (['administrators', 'api-keys'].includes(resource) && actor.role !== 'owner') throw new HttpError(403, 'FORBIDDEN', 'هذا القسم متاح لمدير المنصة فقط.');
  if (resource === 'api-keys' && !parsed.university) throw new HttpError(422, 'UNIVERSITY_REQUIRED', 'حدد جامعة المفاتيح.');
  const where: Record<string, unknown> = ['articles', 'academic-programs', 'events', 'programs', 'links'].includes(resource) ? { ...universityScope(actor) } : {};
  if (parsed.search) where[resource === 'universities' || ['sources', 'categories'].includes(resource) ? 'name' : 'title'] = { contains: parsed.search, mode: 'insensitive' };
  if (resource === 'administrators' && parsed.search) { delete where.title; where.OR = ['name', 'email'].map(key => ({ [key]: { contains: parsed.search, mode: 'insensitive' } })); }
  if (parsed.university) where.university = { slug: parsed.university };
  for (const key of ['status', 'kind', 'role', 'type']) if (parsed[key]) where[key] = parsed[key];
  for (const key of ['active', 'enabled']) if (parsed[key]) where[key] = parsed[key] === 'true';
  if (parsed.category) where.category = resource === 'links' ? parsed.category : { slug: parsed.category };
  for (const [key, field] of [['degree', 'degreeName'], ['college', 'college'], ['department', 'department']]) if (parsed[key]) where[field] = parsed[key];
  if (['articles', 'academic-programs', 'platform_posts'].includes(resource)) where.deletedAt = parsed.deleted === 'true' ? { not: null } : null;
  if (parsed.revoked) where.revokedAt = parsed.revoked === 'true' ? { not: null } : null;
  if (parsed.from || parsed.to) where[resource === 'articles' ? 'discoveredAt' : resource === 'platform_posts' ? 'createdAt' : 'startsAt'] = { ...(parsed.from && { gte: new Date(parsed.from) }), ...(parsed.to && { lte: new Date(parsed.to) }) };
  return { where, filters: Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => entry[1] !== undefined)) };
}
export const bulkId = id;
export async function administratorManagementList(db: PrismaClient, search: URLSearchParams, actor: AdministratorAccess) {
  const p = pagination(new URLSearchParams([...search].filter(([key]) => ['page', 'page_size'].includes(key))));
  const where = managementQuery('administrators', search, actor).where as Prisma.AdministratorWhereInput;
  const [items, total] = await Promise.all([db.administrator.findMany({ where, select: administratorSelect, skip: p.skip, take: p.take, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }), db.administrator.count({ where })]);
  return { items, total, page: p.page, pages: Math.ceil(total / p.take), page_size: p.take };
}
