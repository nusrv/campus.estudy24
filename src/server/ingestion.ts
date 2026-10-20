import "server-only";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { failure, json } from "./http";
import { clientKey, rateLimit } from "./rate-limit";
import { HttpError, MAX_BATCH_SIZE, enforceApiKey, readJson } from "./security";
import { ingestArticleSchema, type IngestArticle } from "./validation";
import { fingerprint, incomingFields } from "./ingestion-policy";

export type IngestResult = { index: number; outcome: "created" | "updated" | "unchanged" | "rejected" | "failed"; article_id?: string; error?: { code: string; fields?: { path: string; message: string }[] } };

async function applyImport(input: IngestArticle, requestId: string, index: number): Promise<IngestResult> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await db.$transaction(async tx => {
        const source = await tx.ingestionSource.findUnique({ where: { key: input.source_key }, include: { university: true } });
        if (!source || !source.enabled || !source.university.enabled || source.university.slug !== input.university_slug) throw new HttpError(422, "UNKNOWN_SOURCE", "Source or university is not enabled.");
        if (new URL(source.url).hostname !== new URL(input.source_url).hostname) throw new HttpError(422, "SOURCE_HOST_MISMATCH", "Article URL must belong to the configured source host.");
        const digest = fingerprint(input);
        const existing = await tx.article.findUnique({ where: { sourceId_originalArticleId: { sourceId: source.id, originalArticleId: input.source_id } } });
        let articleId = existing?.id;
        let outcome: IngestResult["outcome"] = "unchanged";
        if (!existing || existing.fingerprint !== digest) {
          const category = await tx.articleCategory.upsert({ where: { slug: input.category }, create: { slug: input.category, name: input.category }, update: {} });
          const fields = incomingFields(input, category.id, existing?.editedFields || []);
          if (existing) {
            // Status, visibility, deletedAt, publishedAt and universityId are deliberately absent.
            await tx.article.update({ where: { id: existing.id }, data: { ...fields, fingerprint: digest, sourceSnapshot: input as Prisma.InputJsonValue, sourceUpdatedAt: new Date() } });
            outcome = "updated";
          } else {
            const created = await tx.article.create({ data: { universityId: source.universityId, sourceId: source.id, originalArticleId: input.source_id, sourceUrl: input.source_url, title: input.title, summary: input.summary, description: input.description, content: input.content_text, originalPublishedAt: input.published_at ? new Date(input.published_at) : null, categoryId: category.id, origin: "imported", status: "pending_review", fingerprint: digest, sourceSnapshot: input as Prisma.InputJsonValue } });
            articleId = created.id;
            outcome = "created";
          }
          if (!(existing?.editedFields || []).includes("media")) {
            await tx.articleMedia.deleteMany({ where: { articleId } });
            const media = [...input.image_urls.map(url => ({ url, kind: "image" as const })), ...input.pdf_urls.map(url => ({ url, kind: "pdf" as const }))];
            if (media.length) await tx.articleMedia.createMany({ data: media.map((item, sortOrder) => ({ ...item, sortOrder, articleId: articleId!, attribution: input.source_url, usage: "external_reference_only" })), skipDuplicates: true });
          }
          if (!(existing?.editedFields || []).includes("registrationLinks")) {
            await tx.articleRegistrationLink.deleteMany({ where: { articleId } });
            if (input.registration_links.length) await tx.articleRegistrationLink.createMany({ data: input.registration_links.map(url => ({ articleId: articleId!, url })), skipDuplicates: true });
          }
        }
        await tx.ingestionLog.create({ data: { requestId, sourceId: source.id, articleId, originalId: input.source_id, outcome } });
        return { index, outcome, article_id: articleId };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code) && attempt < 3) continue;
      throw error;
    }
  }
  throw new Error("Retry budget exhausted.");
}

export async function ingestRecord(raw: unknown, requestId: string, index: number): Promise<IngestResult> {
  const parsed = ingestArticleSchema.safeParse(raw);
  if (!parsed.success) {
    await db.ingestionLog.create({ data: { requestId, outcome: "rejected", errorCode: "VALIDATION_ERROR" } });
    return { index, outcome: "rejected", error: { code: "VALIDATION_ERROR", fields: parsed.error.issues.map(issue => ({ path: issue.path.join("."), message: issue.message })) } };
  }
  try { return await applyImport(parsed.data, requestId, index); }
  catch (error) {
    const rejected = error instanceof HttpError;
    const code = rejected ? error.code : "INGESTION_FAILED";
    await db.ingestionLog.create({ data: { requestId, originalId: parsed.data.source_id, outcome: rejected ? "rejected" : "failed", errorCode: code } });
    return { index, outcome: rejected ? "rejected" : "failed", error: { code } };
  }
}

export async function handleIngestion(request: Request, batch: boolean) {
  const requestId = randomUUID();
  let authenticated = false;
  try {
    enforceApiKey(request.headers, process.env.INGEST_API_KEY || "");
    authenticated = true;
    await rateLimit("ingest", clientKey(request.headers), 60, 60);
    const body = await readJson(request);
    let records: unknown[];
    if (batch) {
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "articles") || !("articles" in body) || !Array.isArray(body.articles) || body.articles.length < 1 || body.articles.length > MAX_BATCH_SIZE) throw new HttpError(422, "INVALID_BATCH", `Use {articles: [...]} with 1–${MAX_BATCH_SIZE} records.`);
      records = body.articles;
    } else records = [body];
    const results: IngestResult[] = [];
    for (const [index, record] of records.entries()) results.push(await ingestRecord(record, requestId, index));
    const counts = { created: 0, updated: 0, unchanged: 0, rejected: 0, failed: 0 };
    results.forEach(result => { counts[result.outcome]++; });
    const status = batch ? (counts.failed || counts.rejected ? 207 : 200) : counts.failed ? 503 : counts.rejected ? 422 : counts.created ? 201 : 200;
    return json({ request_id: requestId, counts, results }, status);
  } catch (error) {
    // Authentication failures are not written to the ingestion table to avoid unauthenticated DB amplification.
    if (!authenticated) console.warn(JSON.stringify({ event: "ingestion_rejected", requestId, code: error instanceof HttpError ? error.code : "INGESTION_FAILED" }));
    if (authenticated) {
      try { await db.ingestionLog.create({ data: { requestId, outcome: "failed", errorCode: error instanceof HttpError ? error.code : "INGESTION_FAILED" } }); } catch { /* DB availability is reported by failure(). */ }
    }
    return failure(error, requestId);
  }
}
