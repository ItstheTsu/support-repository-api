import { openStore } from "./store.js";
import { createApp } from "./app.js";

const production = process.env.NODE_ENV === "production";
const secureCookies = process.env.COOKIE_SECURE === "true";
const port = Number(process.env.PORT || 1992);
const publicOrigin = process.env.PUBLIC_ORIGIN || `http://localhost:${port}`;
const origin = new URL(publicOrigin);
if (
  publicOrigin !== origin.origin ||
  !["http:", "https:"].includes(origin.protocol) ||
  (secureCookies && origin.protocol !== "https:")
) {
  throw new Error(
    "Configure PUBLIC_ORIGIN com a origem exata e use COOKIE_SECURE=true apenas com HTTPS.",
  );
}
const store = openStore(process.env.DATABASE_PATH || "./data/knowledge.sqlite");
const app = createApp({
  store,
  config: {
    production,
    secureCookies,
    publicOrigin,
    username: process.env.SUPPORT_USERNAME || "suporte",
    passwordHash: process.env.SUPPORT_PASSWORD_HASH || "",
    frontendDist: process.env.FRONTEND_DIST || "../support-repository/dist",
  },
});
const server = app.listen(port, process.env.HOST || "0.0.0.0", () =>
  console.log(`Base do Suporte disponível na porta ${port}.`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
