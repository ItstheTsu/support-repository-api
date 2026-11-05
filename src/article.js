import { z } from "zod";

const text = (min, max) => z.string().trim().min(min).max(max);
const lines = (max = 30) => z.array(text(1, 2000)).max(max);
const source = z
  .object({
    title: text(3, 180),
    url: z
      .url()
      .max(1000)
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          ![...url.searchParams.keys()].some((key) =>
            /pass|token|secret|serie|key/i.test(key),
          )
        );
      }, "Use um link HTTPS público, sem credenciais."),
  })
  .strict();

export const articleSchema = z
  .object({
    title: text(5, 180),
    slug: text(3, 180)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .refine(
        (value) => value !== "novo",
        "Escolha outro endereço para o artigo.",
      ),
    summary: text(15, 500),
    product: text(2, 80),
    category: text(2, 80),
    section: text(2, 80),
    tags: z.array(text(1, 40)).max(12),
    symptoms: text(10, 5000),
    cause: text(10, 5000),
    steps: lines().min(1),
    validation: text(10, 5000),
    warnings: lines(10),
    sources: z.array(source).min(1).max(10),
    status: z.enum(["draft", "published"]),
    requiresDatabaseChange: z.boolean().default(false),
  })
  .strict();

export const updateSchema = articleSchema.extend({
  version: z.number().int().positive(),
});
export const versionSchema = z
  .object({ version: z.number().int().positive() })
  .strict();
export const listSchema = z
  .object({
    q: z.string().trim().max(200).default(""),
    product: text(1, 80).optional(),
    category: text(1, 80).optional(),
    section: text(1, 80).optional(),
    tag: text(1, 40).optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
    sort: z.enum(["relevance", "recent"]).default("relevance"),
    status: z.enum(["draft", "published"]).optional(),
    deleted: z.enum(["true", "false"]).default("false"),
  })
  .strict();

export function searchExpression(query) {
  const tokens =
    query
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(tokens)]
    .slice(0, 12)
    .map((token) => `"${token}"*`)
    .join(" AND ");
}

export function searchBody(article) {
  return [
    article.product,
    article.category,
    article.section,
    ...article.tags,
    article.symptoms,
    article.cause,
    ...article.steps,
    article.validation,
    ...article.warnings,
  ].join("\n");
}

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}
