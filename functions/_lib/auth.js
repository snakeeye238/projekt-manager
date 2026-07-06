import { HttpError } from "./http.js";

const encoder = new TextEncoder();
const PASSWORD_ITERATIONS = 100_000;
const SESSION_DAYS = 30;

function toBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function derivePassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function safeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createPasswordRecord(password) {
  const salt = randomBytes(16);
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return {
    passwordHash: toBase64(hash),
    passwordSalt: toBase64(salt),
    passwordIterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(password, user) {
  if (user.password_salt && user.password_iterations) {
    const actual = await derivePassword(password, fromBase64(user.password_salt), user.password_iterations);
    return safeEqual(actual, fromBase64(user.password_hash));
  }

  const [algorithm, iterations, salt, hash] = String(user.password_hash || "").split(":");
  if (algorithm !== "pbkdf2-sha256" || !iterations || !salt || !hash) return false;
  const actual = await derivePassword(password, fromBase64(salt), Number(iterations));
  return safeEqual(actual, fromBase64(hash));
}

export function validatePassword(password) {
  if (typeof password !== "string" || password.length < 10 || password.length > 200) {
    throw new HttpError(400, "Das Passwort muss mindestens 10 Zeichen lang sein.");
  }
}

export function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpError(400, "Bitte eine gültige E-Mail-Adresse eingeben.");
  }
  return email;
}

export async function createSession(db, userId) {
  const token = toBase64(randomBytes(32)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await db.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
  ).bind(tokenHash, userId, expiresAt).run();
  return { token, expiresAt };
}

export function sessionCookie(token, expiresAt) {
  return `__Host-pm_session=${token}; Path=/; Expires=${new Date(expiresAt).toUTCString()}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie() {
  return "__Host-pm_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
}

function readCookie(request, name) {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export async function getSession(request, db) {
  const token = readCookie(request, "__Host-pm_session");
  if (!token) return null;
  const tokenHash = await sha256(token);
  return db.prepare(`
    SELECT s.token_hash, s.expires_at, u.id AS user_id, u.name, u.email
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).bind(tokenHash, new Date().toISOString()).first();
}

export async function requireSession(request, db) {
  const session = await getSession(request, db);
  if (!session) throw new HttpError(401, "Nicht angemeldet.");
  return session;
}

export async function deleteCurrentSession(request, db) {
  const token = readCookie(request, "__Host-pm_session");
  if (!token) return;
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export async function enforceRateLimit(db, request, action, maximum, windowSeconds) {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const key = `${action}:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  const current = await db.prepare(
    "SELECT attempts, window_started_at FROM auth_rate_limits WHERE key = ?",
  ).bind(key).first();

  if (!current || now - current.window_started_at >= windowSeconds) {
    await db.prepare(`
      INSERT INTO auth_rate_limits (key, attempts, window_started_at)
      VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET attempts = 1, window_started_at = excluded.window_started_at
    `).bind(key, now).run();
    return;
  }

  if (current.attempts >= maximum) {
    throw new HttpError(429, "Zu viele Versuche. Bitte später erneut versuchen.");
  }
  await db.prepare("UPDATE auth_rate_limits SET attempts = attempts + 1 WHERE key = ?").bind(key).run();
}
