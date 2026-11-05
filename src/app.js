import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z, ZodError } from "zod";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  articleSchema,
  updateSchema,
  versionSchema,
  listSchema,
  httpError,
} from "./article.js";
import { sessions, validHash, verifyPassword } from "./auth.js";

export function createApp({ store, config }) {
  const app = express();
  const auth = sessions(store, config);
  app.disable("x-powered-by");
  app.use(
    helmet({
      strictTransportSecurity: config.secureCookies ? undefined : false,
      contentSecurityPolicy: {
        directives: {
          upgradeInsecureRequests: config.secureCookies ? [] : null,
        },
      },
    }),
  );
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", (req, _res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const allowed = [
        config.publicOrigin,
        ...(config.production
          ? []
          : ["http://localhost:5173", "http://127.0.0.1:5173"]),
      ];
      if (req.get("origin") && !allowed.includes(req.get("origin")))
        return next(httpError(403, "Origem não permitida."));
      if (!req.is("application/json"))
        return next(httpError(415, "Envie JSON."));
    }
    next();
  });
  app.use(express.json({ limit: "128kb" }));
  const supportOnly = (req, _res, next) => {
    const user = auth.user(req);
    if (!user)
      return next(httpError(401, "Entre como suporte para continuar."));
    req.supportUser = user;
    next();
  };
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", service: "base-do-suporte" }),
  );
  app.get("/api/session", (req, res) =>
    res.json({
      user: auth.user(req),
      loginEnabled: validHash(config.passwordHash),
    }),
  );
  app.post(
    "/api/session",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { message: "Muitas tentativas. Aguarde 15 minutos." },
    }),
    async (req, res) => {
      if (!validHash(config.passwordHash))
        throw httpError(503, "Acesso do suporte ainda não configurado.");
      const credentials = z
        .object({
          username: z.string().max(80),
          password: z.string().min(1).max(1024),
        })
        .strict()
        .parse(req.body);
      const valid = await verifyPassword(
        credentials.password,
        config.passwordHash,
      );
      if (!valid || credentials.username !== config.username)
        throw httpError(401, "Usuário ou senha incorretos.");
      auth.start(req, res);
      res.json({ user: { username: config.username, role: "support" } });
    },
  );
  app.delete("/api/session", (req, res) => {
    auth.end(req, res);
    res.status(204).end();
  });
  app.get("/api/articles", (req, res) =>
    res.json(store.list(listSchema.parse(req.query))),
  );
  app.get("/api/facets", (_req, res) => res.json(store.facets()));
  app.get("/api/articles/:slug", (req, res) =>
    res.json(store.publicBySlug(req.params.slug)),
  );
  // Collaborative knowledge base: creation and editing require no general login.
  // Drafts, unpublishing, deletion and restoration stay behind /api/support.
  const publicWriteLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      message: "Muitas alterações em pouco tempo. Aguarde alguns minutos.",
    },
  });
  const publishedOnly = (document) => {
    if (document.status !== "published")
      throw httpError(403, "A gestão de rascunhos é restrita ao suporte.");
    return document;
  };
  app.post("/api/articles", publicWriteLimit, (req, res) => {
    const document = publishedOnly(articleSchema.parse(req.body));
    res
      .status(201)
      .json(
        store.create(document, auth.user(req)?.username || "equipe-sem-login"),
      );
  });
  app.patch("/api/articles/:id", publicWriteLimit, (req, res) => {
    const old = store.get(req.params.id);
    if (old.status !== "published" || old.deletedAt)
      throw httpError(404, "Artigo não encontrado.");
    const { version, ...document } = updateSchema.parse(req.body);
    res.json(
      store.update(
        req.params.id,
        publishedOnly(document),
        version,
        auth.user(req)?.username || "equipe-sem-login",
      ),
    );
  });
  app.use("/api/support", supportOnly);
  app.get("/api/support/articles", (req, res) =>
    res.json(store.list(listSchema.parse(req.query), true)),
  );
  app.get("/api/support/articles/:id", (req, res) =>
    res.json(store.get(req.params.id)),
  );
  app.post("/api/support/articles", (req, res) =>
    res
      .status(201)
      .json(
        store.create(articleSchema.parse(req.body), req.supportUser.username),
      ),
  );
  app.patch("/api/support/articles/:id", (req, res) => {
    const { version, ...document } = updateSchema.parse(req.body);
    res.json(
      store.update(req.params.id, document, version, req.supportUser.username),
    );
  });
  app.delete("/api/support/articles/:id", (req, res) => {
    store.trash(
      req.params.id,
      versionSchema.parse(req.body).version,
      req.supportUser.username,
    );
    res.status(204).end();
  });
  app.post("/api/support/articles/:id/restore", (req, res) =>
    res.json(
      store.trash(
        req.params.id,
        versionSchema.parse(req.body).version,
        req.supportUser.username,
        true,
      ),
    ),
  );
  app.use("/api", (_req, _res, next) =>
    next(httpError(404, "Rota não encontrada.")),
  );
  const dist = config.frontendDist ? resolve(config.frontendDist) : null;
  if (dist && existsSync(resolve(dist, "index.html"))) {
    app.use(express.static(dist));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve(dist, "index.html")),
    );
  }
  app.use((error, _req, res, _next) => {
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ message: "JSON inválido." });
    if (error.type === "entity.too.large")
      return res
        .status(413)
        .json({ message: "O conteúdo excede o tamanho permitido." });
    if (error instanceof ZodError)
      return res.status(422).json({
        message: "Revise os campos informados.",
        fields: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    if (
      String(error.message).includes("UNIQUE constraint failed: articles.slug")
    )
      return res
        .status(409)
        .json({ message: "Já existe um artigo com esse endereço." });
    const status =
      error.status >= 400 && error.status < 600 ? error.status : 500;
    res.status(status).json({
      message:
        status === 500
          ? "Não foi possível concluir a operação."
          : error.message,
    });
  });
  return app;
}
