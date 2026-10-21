import type { IngestArticle } from './validation.ts';
export function newsPublicationDecision(enabled: boolean, input: IngestArticle, existing?: { status: string; publicationLocked: boolean; visible: boolean; deletedAt: Date | null } | null, now = new Date()) {
  let reason = '';
  const prose = [input.title, input.summary, input.description, input.content_text].join('\n');
  if (input.title.trim().length < 8 || Math.max(input.summary.trim().length, input.content_text.trim().length) < 40) reason = 'missing_content';
  else if (!input.published_at) reason = 'missing_publication_date';
  else if (new Date(input.published_at).getTime() > now.getTime() + 5 * 60000 || new Date(input.published_at).getTime() < now.getTime() - 366 * 86400000) reason = 'publication_date_requires_review';
  else if (new URL(input.source_url).protocol !== 'https:' || /<\/?[a-z!]|javascript:|data:text\/html|integration-example|replace-with/i.test(prose)) reason = 'suspicious_content';
  if (existing && (existing.publicationLocked || !existing.visible || existing.deletedAt || ['unpublished', 'hidden', 'approved'].includes(existing.status))) return { publish: false, review: reason === 'suspicious_content', reason: reason === 'suspicious_content' && existing.status === 'published' ? 'held_update_preserved_editorial_decision' : 'preserved_editorial_decision' };
  if (reason) return { publish: false, review: true, reason: `pending_${reason}` };
  if (existing?.status === 'published') return { publish: false, review: false, reason: 'preserved_published' };
  return enabled ? { publish: true, review: false, reason: 'published_automatically' } : { publish: false, review: false, reason: 'pending_policy_disabled' };
}
