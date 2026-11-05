import { randomBytes, scrypt, createHash, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt, 64);
  return `scrypt:${salt}:${hash.toString("hex")}`;
}
export function validHash(value) {
  return /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(value ?? "");
}
export async function verifyPassword(password, encoded) {
  if (!validHash(encoded)) return false;
  const [, salt, expected] = encoded.split(":");
  const actual = await derive(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
}
const digest = (value) => createHash("sha256").update(value).digest("hex");
export const cookieName = "support_session";
function tokenFrom(req) {
  const cookie = (req.headers.cookie ?? "")
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${cookieName}=`));
  return cookie?.slice(cookieName.length + 1) ?? "";
}
export function sessions(store, config) {
  const options = {
    httpOnly: true,
    sameSite: "strict",
    secure: Boolean(config.secureCookies),
    path: "/api",
  };
  return {
    user(req) {
      if (!validHash(config.passwordHash)) return null;
      const token = tokenFrom(req);
      if (!/^[a-f0-9]{64}$/.test(token)) return null;
      const row = store.db
        .prepare("SELECT * FROM sessions WHERE token_hash=? AND expires_at>?")
        .get(digest(token), Date.now());
      return row &&
        row.username === config.username &&
        row.credential_fingerprint === digest(config.passwordHash)
        ? { username: row.username, role: "support" }
        : null;
    },
    start(req, res) {
      const token = randomBytes(32).toString("hex");
      store.db
        .prepare("DELETE FROM sessions WHERE token_hash=? OR expires_at<=?")
        .run(digest(tokenFrom(req)), Date.now());
      store.db
        .prepare(
          "INSERT INTO sessions(token_hash,username,expires_at,credential_fingerprint) VALUES(?,?,?,?)",
        )
        .run(
          digest(token),
          config.username,
          Date.now() + 8 * 60 * 60 * 1000,
          digest(config.passwordHash),
        );
      res.cookie(cookieName, token, { ...options, maxAge: 8 * 60 * 60 * 1000 });
    },
    end(req, res) {
      store.db
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .run(digest(tokenFrom(req)));
      res.clearCookie(cookieName, options);
    },
  };
}
