import test from "node:test";
import assert from "node:assert/strict";
import { allowedUpload, authorizeRole, constantEqual, csrfToken, enforceApiKey, enforceCsrf, enforceOrigin, hashPassword, HttpError, newToken, readJson, tokenDigest, verifyPassword } from "../src/server/security.ts";

const secret = "test-only-secret-".repeat(4);
test("passwords are salted with scrypt, verified safely, and reject invalid hashes", async () => {
  const password = "test-only long password 123";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  assert.ok(await verifyPassword(password, first));
  assert.equal(await verifyPassword("wrong", first), false);
  assert.equal(await verifyPassword(password, "invalid"), false);
  await assert.rejects(hashPassword("short"));
});
test("session tokens are random and persisted only through digests", () => {
  const first = newToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, newToken());
  assert.notEqual(first, tokenDigest(first, secret));
  assert.equal(tokenDigest(first, secret), tokenDigest(first, secret));
  assert.notEqual(tokenDigest(first, secret), tokenDigest(first, secret + "other"));
});
test("ingestion requires an independent correctly formatted API key", () => {
  assert.throws(() => enforceApiKey(new Headers(), secret), (e: unknown) => e instanceof HttpError && e.status === 401);
  assert.throws(() => enforceApiKey(new Headers({ cookie: "portal_admin_session=anything" }), secret));
  assert.throws(() => enforceApiKey(new Headers({ authorization: "Bearer wrong" }), secret));
  assert.throws(() => enforceApiKey(new Headers({ authorization: `Bearer ${secret}` }), ""), (e: unknown) => e instanceof HttpError && e.status === 503);
  assert.doesNotThrow(() => enforceApiKey(new Headers({ authorization: `Bearer ${secret}` }), secret));
  assert.equal(constantEqual("different length", "x"), false);
});
test("CSRF rejects missing, cross-origin, same-site subdomain, and forged headers", () => {
  assert.throws(() => enforceOrigin(new Headers(), "https://portal.example"));
  assert.throws(() => enforceOrigin(new Headers({ origin: "https://evil.example" }), "https://portal.example"));
  assert.throws(() => enforceOrigin(new Headers({ origin: "https://portal.example", "sec-fetch-site": "same-site" }), "https://portal.example"));
  assert.doesNotThrow(() => enforceOrigin(new Headers({ origin: "https://portal.example", "sec-fetch-site": "same-origin" }), "https://portal.example"));
  const digest = tokenDigest(newToken(), secret);
  assert.throws(() => enforceCsrf(new Headers(), digest, secret));
  assert.throws(() => enforceCsrf(new Headers({ "x-csrf-token": "wrong" }), digest, secret));
  assert.doesNotThrow(() => enforceCsrf(new Headers({ "x-csrf-token": csrfToken(digest, secret) }), digest, secret));
});
test("future editor role cannot perform owner operations", () => {
  assert.throws(() => authorizeRole("editor", ["owner"]), (e: unknown) => e instanceof HttpError && e.status === 403);
  assert.throws(() => authorizeRole("unknown", ["owner", "editor"]));
  assert.doesNotThrow(() => authorizeRole("owner", ["owner"]));
});
test("JSON reader validates media type, malformed JSON, and actual streamed size", async () => {
  await assert.rejects(readJson(new Request("http://localhost", { method: "POST", body: "{}" })), (e: unknown) => e instanceof HttpError && e.status === 415);
  await assert.rejects(readJson(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: "{" })));
  await assert.rejects(readJson(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json", "content-length": "1" }, body: '{"large":"xxxxxxxx"}' }), 10), (e: unknown) => e instanceof HttpError && e.status === 413);
  assert.deepEqual(await readJson(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: '{"title":"جامعة"}' })), { title: "جامعة" });
});
test("uploads require allowed extension, MIME, signature, and size", () => {
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  assert.equal(allowedUpload("../../unsafe.png", "image/png", png, 20), "png");
  assert.throws(() => allowedUpload("photo.svg", "image/svg+xml", Buffer.from("<svg/>"), 100));
  assert.throws(() => allowedUpload("file.png", "image/png", Buffer.from("not a png"), 100));
  assert.throws(() => allowedUpload("file.pdf", "image/png", png, 100));
  assert.throws(() => allowedUpload("file.png", "image/png", png, 2));
  assert.throws(() => allowedUpload("file.png", "image/png", new Uint8Array(), 20));
});
