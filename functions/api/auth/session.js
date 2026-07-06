import { errorResponse, json } from "../../_lib/http.js";
import { getSession } from "../../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  try {
    const session = await getSession(request, env.DB);
    if (!session) return json({ user: null }, 401);
    return json({
      user: { id: session.user_id, name: session.name, email: session.email },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
