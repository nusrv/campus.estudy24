import type { z } from 'zod/v4';
import type { academicIngestSchema } from './academic-validation.ts';
export function academicPublicationDecision(enabled: boolean, input: z.output<typeof academicIngestSchema>, existing = false) {
  if (existing) return { publish: false, reason: 'preserved_publication_decision' };
  if (!enabled) return { publish: false, reason: 'pending_academic_review' };
  if (input.name.trim().length < 3 || !input.degree_name || !input.college) return { publish: false, reason: 'pending_incomplete_academic_data' };
  const prose = [input.name, input.degree_name, input.college, input.department, input.description, input.tuition_info].filter(Boolean).join('\n');
  if (/<\/?[a-z!]|javascript:|data:text\/html|illustrative|مثال توضيحي|replace.with/i.test(prose)) return { publish: false, reason: 'pending_suspicious_academic_data' };
  const source = new URL(input.source_url);
  if (source.protocol !== 'https:' || !input.official_program_url || [input.official_program_url, input.study_plan_url, input.tuition_source_url].filter((value): value is string => !!value).some(value => new URL(value).protocol !== 'https:' || new URL(value).hostname !== source.hostname)) return { publish: false, reason: 'pending_academic_source_review' };
  return { publish: true, reason: 'published_academic_automatically' };
}
