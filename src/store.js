import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { httpError, searchBody, searchExpression } from "./article.js";

export function openStore(filename) {
  if (filename !== ":memory:")
    mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, status TEXT NOT NULL,
      product TEXT NOT NULL, category TEXT NOT NULL, section TEXT NOT NULL,
      document TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, published_at TEXT, deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS articles_visibility ON articles(status, deleted_at, updated_at);
    CREATE VIRTUAL TABLE IF NOT EXISTS article_search USING fts5(
      id UNINDEXED, title, summary, body, tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, expires_at INTEGER NOT NULL, credential_fingerprint TEXT);
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, article_id TEXT NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL);
    PRAGMA user_version = 1;
  `);
  if (
    !db
      .prepare("PRAGMA table_info(sessions)")
      .all()
      .some((column) => column.name === "credential_fingerprint")
  ) {
    db.exec("ALTER TABLE sessions ADD COLUMN credential_fingerprint TEXT");
  }
  const transaction = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      db.exec("COMMIT");
      return value;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  const map = (row) =>
    row
      ? {
          ...JSON.parse(row.document),
          id: row.id,
          version: row.version,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          publishedAt: row.published_at,
          deletedAt: row.deleted_at,
        }
      : undefined;
  const find = (id) =>
    map(db.prepare("SELECT * FROM articles WHERE id = ?").get(id));
  const index = (article) => {
    db.prepare("DELETE FROM article_search WHERE id = ?").run(article.id);
    if (!article.deletedAt)
      db.prepare(
        "INSERT INTO article_search(id,title,summary,body) VALUES(?,?,?,?)",
      ).run(article.id, article.title, article.summary, searchBody(article));
  };
  const record = (id, action, actor) =>
    db
      .prepare("INSERT INTO audit(article_id,action,actor,at) VALUES(?,?,?,?)")
      .run(id, action, actor, new Date().toISOString());
  const persist = (article, actor, action) => {
    const {
      id,
      version,
      createdAt,
      updatedAt,
      publishedAt,
      deletedAt,
      ...document
    } = article;
    db.prepare(
      `INSERT INTO articles VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,status=excluded.status,product=excluded.product,
      category=excluded.category,section=excluded.section,document=excluded.document,version=excluded.version,
      updated_at=excluded.updated_at,published_at=excluded.published_at,deleted_at=excluded.deleted_at`,
    ).run(
      id,
      article.slug,
      article.status,
      article.product,
      article.category,
      article.section,
      JSON.stringify(document),
      version,
      createdAt,
      updatedAt,
      publishedAt,
      deletedAt,
    );
    index(article);
    record(id, action, actor);
    return article;
  };
  return {
    db,
    close: () => db.close(),
    get(id) {
      const article = find(id);
      if (!article) throw httpError(404, "Artigo não encontrado.");
      return article;
    },
    publicBySlug(slug) {
      const article = map(
        db
          .prepare(
            "SELECT * FROM articles WHERE slug=? AND status='published' AND deleted_at IS NULL",
          )
          .get(slug),
      );
      if (!article) throw httpError(404, "Artigo não encontrado.");
      return article;
    },
    create(document, actor = "suporte", id = randomUUID()) {
      const now = new Date().toISOString();
      return transaction(() =>
        persist(
          {
            ...document,
            id,
            version: 1,
            createdAt: now,
            updatedAt: now,
            publishedAt: document.status === "published" ? now : null,
            deletedAt: null,
          },
          actor,
          "create",
        ),
      );
    },
    update(id, document, version, actor) {
      return transaction(() => {
        const old = this.get(id);
        if (old.deletedAt)
          throw httpError(404, "Artigo na lixeira. Restaure antes de editar.");
        if (old.version !== version)
          throw httpError(409, "O artigo mudou. Recarregue antes de salvar.");
        if (old.slug !== document.slug)
          throw httpError(422, "O endereço do artigo não pode ser alterado.");
        return persist(
          {
            ...old,
            ...document,
            version: version + 1,
            updatedAt: new Date().toISOString(),
            publishedAt:
              document.status === "published"
                ? (old.publishedAt ?? new Date().toISOString())
                : old.publishedAt,
          },
          actor,
          "update",
        );
      });
    },
    trash(id, version, actor, restore = false) {
      return transaction(() => {
        const old = this.get(id);
        if (old.version !== version)
          throw httpError(
            409,
            "O artigo mudou. Recarregue antes de continuar.",
          );
        if (restore !== Boolean(old.deletedAt))
          throw httpError(409, "A situação do artigo já mudou.");
        return persist(
          {
            ...old,
            status: restore ? "draft" : old.status,
            deletedAt: restore ? null : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: version + 1,
          },
          actor,
          restore ? "restore" : "trash",
        );
      });
    },
    list(filters, support = false) {
      const where = [
        filters.deleted === "true" && support
          ? "a.deleted_at IS NOT NULL"
          : "a.deleted_at IS NULL",
      ];
      const args = [];
      const expression = searchExpression(filters.q);
      if (filters.q && !expression)
        return {
          items: [],
          total: 0,
          page: filters.page,
          limit: filters.limit,
        };
      if (!support) where.push("a.status='published'");
      else if (filters.status) {
        where.push("a.status=?");
        args.push(filters.status);
      }
      for (const key of ["product", "category", "section"])
        if (filters[key]) {
          where.push(`a.${key}=?`);
          args.push(filters[key]);
        }
      if (filters.tag) {
        where.push(
          "EXISTS (SELECT 1 FROM json_each(a.document,'$.tags') WHERE value=?)",
        );
        args.push(filters.tag);
      }
      if (expression) {
        where.push("article_search MATCH ?");
        args.push(expression);
      }
      const from = `articles a ${expression ? "JOIN article_search ON article_search.id=a.id" : ""} WHERE ${where.join(" AND ")}`;
      const total = db
        .prepare(`SELECT COUNT(*) AS count FROM ${from}`)
        .get(...args).count;
      const order =
        expression && filters.sort === "relevance"
          ? "bm25(article_search,0,8,4,1), a.updated_at DESC, a.id"
          : "a.updated_at DESC, a.id";
      const items = db
        .prepare(`SELECT a.* FROM ${from} ORDER BY ${order} LIMIT ? OFFSET ?`)
        .all(...args, filters.limit, (filters.page - 1) * filters.limit)
        .map(map);
      return { items, total, page: filters.page, limit: filters.limit };
    },
    facets() {
      const rows = db
        .prepare(
          "SELECT product,category,section,document FROM articles WHERE status='published' AND deleted_at IS NULL",
        )
        .all();
      const count = (values) =>
        [...new Set(values)]
          .sort((a, b) => a.localeCompare(b, "pt-BR"))
          .map((value) => ({
            value,
            count: values.filter((item) => item === value).length,
          }));
      return {
        products: count(rows.map((r) => r.product)),
        categories: count(rows.map((r) => r.category)),
        sections: count(rows.map((r) => r.section)),
        tags: count(rows.flatMap((r) => JSON.parse(r.document).tags)),
      };
    },
  };
}
