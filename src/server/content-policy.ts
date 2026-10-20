// Scope constraints are shared by public pages, APIs, media eligibility, and SEO.
export const platformVisibility = { status: "published" as const, visible: true, deletedAt: null };
export const universityVisibility = { status: "published" as const, visible: true, deletedAt: null, university: { enabled: true } };
export function universityContentScope(slug: string) { return { university: { slug, enabled: true } }; }
export function adAudience(university?: string) {
  return university ? { OR: [{ global: true }, { universities: { some: { university: { slug: university, enabled: true } } } }] } : { global: true };
}
