const base = process.env.BASE_URL || "http://127.0.0.1:8788";
const suffix = crypto.randomUUID().replaceAll("-", "");
const password = "CodexTest12345!";

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(data)}`);
  return { response, data };
}

async function register(name, email) {
  const result = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
  const cookie = result.response.headers.get("set-cookie")?.split(";")[0];
  if (!cookie) throw new Error("Registrierung hat kein Session-Cookie geliefert.");
  return cookie;
}

const cookie1 = await register("Test Eins", `eins-${suffix}@example.com`);
const initialUser1 = await request("/api/state", { headers: { cookie: cookie1 } });
const state = {
  appSubtitle: "API Test",
  appTheme: "gray",
  activeAreaId: "area_default",
  areas: [{
    id: "area_default",
    name: "Standard",
    theme: "gray",
    dashboardProjectOrder: ["p1"],
    projects: [{ id: "p1", name: "Privates Projekt", tasks: [], journal: [] }],
  }],
  dashboardProjectOrder: ["p1"],
  projects: [{ id: "p1", name: "Privates Projekt", tasks: [], journal: [] }],
  history: { undo: [], redo: [] },
};

await request("/api/state", {
  method: "PUT",
  headers: {
    cookie: cookie1,
    "if-match": String(initialUser1.data.revision),
  },
  body: JSON.stringify(state),
});
const user1 = await request("/api/state", { headers: { cookie: cookie1 } });

const staleWrite = await fetch(`${base}/api/state`, {
  method: "PUT",
  headers: {
    "content-type": "application/json",
    cookie: cookie1,
    "if-match": String(initialUser1.data.revision),
  },
  body: JSON.stringify({ ...state, appSubtitle: "Veraltete Änderung" }),
});

const cookie2 = await register("Test Zwei", `zwei-${suffix}@example.com`);
const user2 = await request("/api/state", { headers: { cookie: cookie2 } });

const result = {
  user1Project: user1.data.data.projects[0]?.name,
  user2Projects: user2.data.data.projects.length,
  isolated: user2.data.data.projects.length === 0,
  conflictProtected: staleWrite.status === 409,
};
console.log(JSON.stringify(result, null, 2));
if (!result.isolated || !result.conflictProtected || result.user1Project !== "Privates Projekt") {
  process.exitCode = 1;
}
