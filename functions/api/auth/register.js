import { assertSameOrigin, errorResponse, HttpError, json, readJson } from "../../_lib/http.js";
import {
  createPasswordRecord,
  createSession,
  enforceRateLimit,
  normalizeEmail,
  sessionCookie,
  validatePassword,
} from "../../_lib/auth.js";

const EMPTY_STATE = JSON.stringify({
  appSubtitle: "Standard",
  appTheme: "gray",
  activeAreaId: "area_default",
  areas: [{
    id: "area_default",
    name: "Standard",
    theme: "gray",
    dashboardProjectOrder: [],
    projects: [],
  }],
  dashboardProjectOrder: [],
  projects: [],
  history: { undo: [], redo: [] },
});

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(env.DB, request, "register", 5, 3600);
    const body = await readJson(request, 20_000);
    const name = String(body.name || "").trim();
    const email = normalizeEmail(body.email);
    validatePassword(body.password);
    if (name.length < 2 || name.length > 100) throw new HttpError(400, "Bitte einen Namen eingeben.");

    const exists = await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first();
    if (exists) throw new HttpError(409, "Für diese E-Mail-Adresse besteht bereits ein Konto.");

    const id = crypto.randomUUID();
    const password = await createPasswordRecord(body.password);
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO users (
          id, name, email, password_hash, password_salt, password_iterations, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(id, name, email, password.passwordHash, password.passwordSalt, password.passwordIterations),
      env.DB.prepare(`
        INSERT INTO user_state (user_id, payload, created_at, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(id, EMPTY_STATE),
    ]);

    const session = await createSession(env.DB, id);
    return json(
      { user: { id, name, email } },
      201,
      { "Set-Cookie": sessionCookie(session.token, session.expiresAt) },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
