import { assertSameOrigin, errorResponse, HttpError, json, readJson } from "../_lib/http.js";
import { requireSession } from "../_lib/auth.js";

function validateState(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, "Ungültiger Projektzustand.");
  }
  if (!Array.isArray(payload.projects) && !Array.isArray(payload.areas)) {
    throw new HttpError(400, "Der Projektzustand enthält keine Bereiche oder Projekte.");
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const session = await requireSession(request, env.DB);
    const row = await env.DB.prepare(
      "SELECT payload, revision, updated_at FROM user_state WHERE user_id = ?",
    ).bind(session.user_id).first();
    if (!row) return json({ data: null, revision: 0 });
    return json({ data: JSON.parse(row.payload), revision: row.revision, updatedAt: row.updated_at });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPut({ request, env }) {
  try {
    assertSameOrigin(request);
    const session = await requireSession(request, env.DB);
    const expectedRevision = Number(request.headers.get("if-match"));
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw new HttpError(428, "Für das Speichern fehlt die aktuelle Revision.");
    }
    const payload = await readJson(request, 800_000);
    validateState(payload);
    const serialized = JSON.stringify(payload);
    const result = await env.DB.prepare(`
      UPDATE user_state
      SET payload = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND revision = ?
    `).bind(serialized, session.user_id, expectedRevision).run();

    if (result.meta.changes === 0) {
      const current = await env.DB.prepare(
        "SELECT payload, revision, updated_at FROM user_state WHERE user_id = ?",
      ).bind(session.user_id).first();
      return json({
        error: "Die Daten wurden inzwischen auf einem anderen Gerät geändert.",
        data: current ? JSON.parse(current.payload) : null,
        revision: current?.revision || 0,
        updatedAt: current?.updated_at || null,
      }, 409);
    }

    const row = await env.DB.prepare(
      "SELECT revision, updated_at FROM user_state WHERE user_id = ?",
    ).bind(session.user_id).first();
    return json({ success: true, revision: row.revision, updatedAt: row.updated_at });
  } catch (error) {
    return errorResponse(error);
  }
}
