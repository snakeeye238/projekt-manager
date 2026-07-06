import { assertSameOrigin, errorResponse, HttpError, json, readJson } from "../../_lib/http.js";
import {
  createSession,
  enforceRateLimit,
  normalizeEmail,
  sessionCookie,
  verifyPassword,
} from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(env.DB, request, "login", 10, 900);
    const body = await readJson(request, 20_000);
    const email = normalizeEmail(body.email);
    const user = await env.DB.prepare(`
      SELECT id, name, email, password_hash, password_salt, password_iterations
      FROM users WHERE email = ?
    `).bind(email).first();

    if (!user || !(await verifyPassword(String(body.password || ""), user))) {
      throw new HttpError(401, "E-Mail-Adresse oder Passwort ist falsch.");
    }

    const session = await createSession(env.DB, user.id);
    return json(
      { user: { id: user.id, name: user.name, email: user.email } },
      200,
      { "Set-Cookie": sessionCookie(session.token, session.expiresAt) },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
