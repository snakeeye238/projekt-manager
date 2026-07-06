import { assertSameOrigin, errorResponse, json } from "../../_lib/http.js";
import { clearSessionCookie, deleteCurrentSession } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  try {
    assertSameOrigin(request);
    await deleteCurrentSession(request, env.DB);
    return json({ success: true }, 200, { "Set-Cookie": clearSessionCookie() });
  } catch (error) {
    return errorResponse(error);
  }
}
