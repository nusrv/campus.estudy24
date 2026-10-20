import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { adSchema, eventSchema, platformPostSchema, settingsSchema } from "../src/server/validation.ts";
import { adAudience, platformVisibility, universityContentScope } from "../src/server/content-policy.ts";
import { obviousBot, publicBaseline, readVisitorCookie, visitorCookie, VISIT_WINDOW_SECONDS } from "../src/server/visitor-policy.ts";
import { dateRange } from "../src/lib/portal.ts";

const secret = "test-only-visitor-secret-".repeat(3);
test("platform publishing is separate from university/source ingestion and defaults to review", () => {
  const post = platformPostSchema.parse({ slug: "study-guide", title: "دليل دراسي", type: "guide" });
  assert.equal(post.status, "pending_review");
  assert.equal(post.featured, false);
  for (const extra of [{ universityId: "uqu" }, { source_id: "179777" }, { origin: "imported" }]) assert.equal(platformPostSchema.safeParse({ ...post, ...extra }).success, false);
  assert.deepEqual(platformVisibility, { status: "published", visible: true, deletedAt: null });
  assert.deepEqual(universityContentScope("uqu"), { university: { slug: "uqu", enabled: true } });
});
test("advertisements support multiple placements while preserving legacy single-placement requests", () => {
  const base = { title: "إعلان تعليمي", destinationUrl: "https://estudy24.com", global: true };
  const legacy = adSchema.parse({ ...base, placementId: "sidebar" });
  assert.deepEqual(legacy.placementIds, ["sidebar"]);
  const multi = adSchema.parse({ ...base, placementIds: ["homepage_banner", "sidebar", "sidebar"] });
  assert.deepEqual(multi.placementIds, ["homepage_banner", "sidebar"]);
  assert.equal(adSchema.safeParse(base).success, false);
  assert.equal(adSchema.safeParse({ ...base, global: false, universityIds: ["uni"], placementIds: ["homepage_banner"] }).success, false);
  assert.equal(adSchema.safeParse({ ...base, placementId: "footer", placementIds: ["sidebar"] }).success, false);
  assert.deepEqual(adAudience(), { global: true });
  assert.ok(JSON.stringify(adAudience("uqu")).includes('"slug":"uqu"'));
});
test("historical baseline is zero unless verified with evidence and a non-overlapping cutoff", () => {
  const base = { visitorCounterEnabled: true, visitorCounterLabel: "زيارات البوابة", visitorBaseline: 0, visitorBaselineVerified: false, visitorBaselineEvidence: null, visitorBaselineAsOf: null };
  assert.ok(settingsSchema.safeParse(base).success);
  assert.equal(settingsSchema.safeParse({ ...base, visitorBaseline: 1200 }).success, false);
  const evidence = { ...base, visitorBaseline: 1200, visitorBaselineVerified: true, visitorBaselineEvidence: "تقرير زيارات موثّق من نظام الإحصاءات السابق", visitorBaselineAsOf: "2026-10-01T00:00:00Z" };
  assert.ok(settingsSchema.safeParse(evidence).success);
  const stored = { ...evidence, visitorBaselineAsOf: new Date(evidence.visitorBaselineAsOf), trackingStartedAt: new Date("2026-10-20T00:00:00Z") };
  assert.equal(publicBaseline(stored), 1200);
  assert.equal(publicBaseline({ ...stored, visitorBaselineVerified: false }), 0);
  assert.equal(publicBaseline({ ...stored, visitorBaselineEvidence: null }), 0);
  assert.equal(publicBaseline({ ...stored, visitorBaselineAsOf: new Date("2026-11-01T00:00:00Z") }), 0);
});
test("visitor cookies are authenticated, expire, and reject tampering and future issue dates", () => {
  const nonce = randomUUID();
  const now = Date.now();
  const cookie = visitorCookie(nonce, secret, now);
  assert.equal(readVisitorCookie(cookie, secret, now + 100)?.nonce, nonce);
  assert.equal(readVisitorCookie(cookie, secret, now + VISIT_WINDOW_SECONDS * 1000), null);
  assert.equal(readVisitorCookie(cookie, secret + "wrong", now), null);
  assert.equal(readVisitorCookie(cookie.replace(nonce, randomUUID()), secret, now), null);
  assert.equal(readVisitorCookie(cookie, secret, now - 1000), null);
});
test("obvious bots and prefetches do not count as visits", () => {
  for (const ua of ["Googlebot/2.1", "bingbot/2.0", "HeadlessChrome", "curl/8", "node", ""]) assert.ok(obviousBot(new Headers({ "user-agent": ua })));
  assert.equal(obviousBot(new Headers({ "user-agent": "Mozilla/5.0 Chrome/130.0 Safari/537.36" })), false);
  assert.equal(obviousBot(new Headers({ "user-agent": "Mozilla/5.0", purpose: "prefetch" })), true);
});
test("calendar dates are independent, examination dates are structured, and Riyadh filters are valid", () => {
  assert.ok(eventSchema.safeParse({ title: "بداية الاختبارات", universityId: "uqu-id", kind: "examination", startsAt: "2026-12-01T06:00:00Z" }).success);
  assert.equal(eventSchema.safeParse({ title: "موعد دون جامعة", kind: "examination", startsAt: "2026-12-01T06:00:00Z" }).success, false);
  assert.deepEqual(dateRange("2026-10-20", "2026-10-20"), { from: "2026-10-19T21:00:00.000Z", to: "2026-10-20T20:59:59.999Z" });
  assert.deepEqual(dateRange("2026-02-31", "2026-99-99"), {});
  assert.equal(dateRange("2028-02-29").from, "2028-02-28T21:00:00.000Z");
});
