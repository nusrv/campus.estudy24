import { createHash } from "node:crypto";
import type { IngestArticle } from "./validation.ts";

export const EDITABLE_SOURCE_FIELDS = ["title", "summary", "description", "content", "categoryId", "sourceUrl", "originalPublishedAt", "media", "registrationLinks"] as const;

export function fingerprint(input: IngestArticle) {
  // Explicit property order excludes discovery/import times and publication decisions.
  return createHash("sha256").update(JSON.stringify({ source_url: input.source_url, title: input.title, summary: input.summary, description: input.description, content: input.content_text, published_at: input.published_at, category: input.category, images: [...input.image_urls].sort(), pdfs: [...input.pdf_urls].sort(), registration: [...input.registration_links].sort() })).digest("hex");
}
export function incomingFields(input: IngestArticle, categoryId: string, editedFields: readonly string[]) {
  const incoming = { title: input.title, summary: input.summary, description: input.description, content: input.content_text, categoryId, sourceUrl: input.source_url, originalPublishedAt: input.published_at ? new Date(input.published_at) : null };
  return Object.fromEntries(Object.entries(incoming).filter(([field]) => !editedFields.includes(field))) as Partial<typeof incoming>;
}
export function changedEditorialFields(before: Record<string, unknown>, after: Record<string, unknown>, previous: readonly string[]) {
  return [...new Set([...previous, ...EDITABLE_SOURCE_FIELDS.filter(key => key in after && JSON.stringify(before[key]) !== JSON.stringify(after[key]))])];
}
