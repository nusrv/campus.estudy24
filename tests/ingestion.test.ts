import test from "node:test";
import assert from "node:assert/strict";
import { adSchema, articlePatchSchema, eventSchema, ingestArticleSchema, pagination, url } from "../src/server/validation.ts";
import { changedEditorialFields, fingerprint, incomingFields } from "../src/server/ingestion-policy.ts";

const fixture = { university_slug: "uqu", source_id: "179777", source_url: "https://uqu.edu.sa/App/News/179777", title: "برنامج تدريبي في جامعة أم القرى", summary: "تطوير مهارات الطلبة", content_text: "محتوى الخبر", published_at: "2026-10-18T14:06:32Z", image_urls: [], pdf_urls: [], registration_links: [], category: "training" };
test("normalizes tested UQU source ID and infers source key", () => {
  const value = ingestArticleSchema.parse({ ...fixture, source_id: 179777 });
  assert.equal(value.source_id, "179777");
  assert.equal(value.source_key, "uqu-rss");
  assert.equal(value.published_at, fixture.published_at);
});
test("malformed ingestion is rejected including HTML URL schemes and publication injection", () => {
  for (const bad of [{ ...fixture, title: "" }, { ...fixture, source_url: "javascript:alert(1)" }, { ...fixture, published_at: "yesterday" }, { ...fixture, status: "published" }, { ...fixture, image_urls: ["data:image/png;base64,x"] }, { ...fixture, image_urls: Array(21).fill("https://example.org/image.jpg") }, { ...fixture, university_slug: "../admin" }]) assert.equal(ingestArticleSchema.safeParse(bad).success, false);
});
test("fingerprints are repeatable, deduplicate media, and detect source changes", () => {
  const value = ingestArticleSchema.parse(fixture);
  assert.equal(fingerprint(value), fingerprint(ingestArticleSchema.parse({ ...fixture })));
  assert.notEqual(fingerprint(value), fingerprint(ingestArticleSchema.parse({ ...fixture, title: "عنوان محدّث" })));
  assert.equal(fingerprint(ingestArticleSchema.parse({ ...fixture, image_urls: ["https://example.org/b.jpg", "https://example.org/a.jpg", "https://example.org/a.jpg"] })), fingerprint(ingestArticleSchema.parse({ ...fixture, image_urls: ["https://example.org/a.jpg", "https://example.org/b.jpg"] })));
});
test("reimport preserves editorial fields and cannot change publication decisions", () => {
  const value = ingestArticleSchema.parse(fixture);
  const update = incomingFields(value, "category-id", ["title", "categoryId", "content"]);
  assert.equal("title" in update, false);
  assert.equal("categoryId" in update, false);
  assert.equal("content" in update, false);
  assert.equal(update.summary, fixture.summary);
  for (const protectedField of ["status", "visible", "deletedAt", "publishedAt", "universityId"]) assert.equal(protectedField in update, false);
  assert.deepEqual(changedEditorialFields({ title: "old", summary: "same" }, { title: "edited", summary: "same", status: "published" }, ["content"]), ["content", "title"]);
});
test("partial actions never inject defaults that reset status, content, media or visibility", () => {
  assert.deepEqual(articlePatchSchema.parse({ action: "soft_delete" }), { action: "soft_delete" });
  assert.deepEqual(articlePatchSchema.parse({ status: "published" }), { status: "published" });
});
test("ad targeting and calendar dates are validated", () => {
  assert.equal(adSchema.safeParse({ title: "إعلان", destinationUrl: "https://example.org", placementId: "sidebar", global: false }).success, false);
  assert.equal(adSchema.safeParse({ title: "إعلان", destinationUrl: "https://example.org", placementId: "sidebar", global: true }).success, true);
  assert.equal(adSchema.safeParse({ title: "إعلان", destinationUrl: "https://example.org", placementId: "sidebar", global: true, startsAt: "2026-10-20T12:00:00+03:00", endsAt: "2026-10-20T10:00:00+05:00" }).success, false);
  assert.equal(eventSchema.safeParse({ title: "فعالية", startsAt: "2026-10-20T12:00:00Z", endsAt: "2026-10-19T12:00:00Z" }).success, false);
  assert.equal(url.safeParse("https://username:password@example.org").success, false);
  assert.throws(() => pagination(new URLSearchParams("page_size=1000")));
});
