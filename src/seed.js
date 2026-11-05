import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { articleSchema } from "./article.js";
import { openStore } from "./store.js";

export function seed(store) {
  const articles = JSON.parse(
    readFileSync(new URL("../content/sngpc.json", import.meta.url), "utf8"),
  );
  let added = 0;
  for (const { id, ...raw } of articles) {
    const document = articleSchema.parse(raw);
    // Never overwrite edits or resurrect a deleted article when rerunning the seed.
    if (
      store.db
        .prepare("SELECT id FROM articles WHERE id=? OR slug=?")
        .get(id, document.slug)
    )
      continue;
    store.create(document, "seed-vsm-2026-11-05", id);
    added++;
  }
  return added;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const store = openStore(
    process.env.DATABASE_PATH || "./data/knowledge.sqlite",
  );
  try {
    console.log(
      `${seed(store)} artigos adicionados. 5 publicados e 1 rascunho no catálogo inicial.`,
    );
  } finally {
    store.close();
  }
}
