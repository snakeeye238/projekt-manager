export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

export async function readJson(request, maxBytes = 800_000) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBytes) throw new HttpError(413, "Die Anfrage ist zu groß.");

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new HttpError(413, "Die Anfrage ist zu groß.");
  }

  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new HttpError(400, "Ungültige JSON-Daten.");
  }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function errorResponse(error) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error(error);
  return json({ error: "Interner Serverfehler." }, 500);
}

export function assertSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expected = new URL(request.url).origin;
  if (origin !== expected) throw new HttpError(403, "Ungültiger Ursprung.");
}
