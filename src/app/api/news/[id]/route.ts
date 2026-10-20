import { db } from "@/server/db";
import { articlePublicSelect, publishedArticleWhere } from "@/server/public-data";
import { failure, json } from "@/server/http";
import { HttpError } from "@/server/security";
import { id as idSchema, pageSchema } from "@/server/validation";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    const filters = pageSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    if (filters.scope === "homepage") throw new HttpError(422, "INVALID_SCOPE", "University articles are not homepage content.");
    if (filters.scope === "university" && !filters.university) throw new HttpError(422, "UNIVERSITY_REQUIRED", "A university slug is required.");
    const article = await db.article.findFirst({ where: { ...publishedArticleWhere, id, ...(filters.university && { university: { slug: filters.university, enabled: true } }) }, select: articlePublicSelect });
    if (!article) throw new HttpError(404, "NOT_FOUND", "Article not found.");
    return json(article);
  } catch (error) { return failure(error); }
}
