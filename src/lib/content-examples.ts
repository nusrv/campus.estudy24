import { ingestionExample } from './ingestion-example.ts';
export function contentExample(type: string, slug: string, sourceUrl: string) {
  if (type === 'articles' || type === 'batch') return ingestionExample(slug, sourceUrl);
  const common = { university_slug: slug, source_key: `${slug}-rss`, source_id: 'REPLACE_WITH_ORIGINAL_RESOURCE_ID', source_url: sourceUrl, title: 'REPLACE_WITH_VERIFIED_SOURCE_TITLE', description: '' };
  if (type === 'links') return { ...common, destination_url: 'https://example.edu.sa/REPLACE_WITH_VERIFIED_SERVICE', kind: 'student_service', category: 'general' };
  return { ...common, starts_at: 'REPLACE_WITH_VERIFIED_ISO_DATE', ends_at: null, application_url: null, ...(type === 'events' ? { kind: 'event' } : type === 'calendar' ? { kind: 'academic_date' } : {}) };
}
