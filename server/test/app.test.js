// La app real del servidor (server/src/app.js): límites de tamaño y manejador de errores.
// Correr con: npm run test:node (desde la raíz; necesita `npm ci --prefix server`).
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/app");

const { LIMITS } = app;
let server;
let baseUrl;
let restoreConsole;

before(async () => {
  // La ruta de deploy registra cada petición en server_logs; sin Supabase configurado el logger lo
  // reporta por consola, lo que aquí solo es ruido.
  const original = console.error;
  console.error = () => {};
  restoreConsole = () => (console.error = original);
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  restoreConsole();
  await new Promise((resolve) => server.close(resolve));
});

const post = (route, body, type) =>
  fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "Content-Type": type },
    body,
  });

const minimal = {
  id: "W-APP",
  nodes: [
    { id: "b", type: "start" },
    { id: "e", type: "end" },
  ],
  connections: [{ from: "b", to: "e" }],
};

describe("server app", () => {
  test("positive: /api/compile through the real app returns the Ignition document", async () => {
    const res = await post(
      "/api/compile",
      JSON.stringify(minimal),
      "application/json",
    );
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<Workflow id="W-APP"/);
  });

  test("negative: JSON over the limit gets a JSON 413, not a 500", async () => {
    const body = JSON.stringify({ pad: "x".repeat(LIMITS.jsonBytes) });
    const res = await post("/api/compile", body, "application/json");
    assert.equal(res.status, 413);
    assert.deepEqual(await res.json(), {
      status: "ERROR",
      message: "Payload Too Large. The maximum body size is 5 MB.",
    });
  });

  test("negative: XML over the deploy limit gets a JSON 413 naming 10 MB", async () => {
    const body = `<Workflow>${"x".repeat(LIMITS.xmlBytes)}</Workflow>`;
    const res = await post("/api/deploy-workflow", body, "application/xml");
    assert.equal(res.status, 413);
    assert.deepEqual(await res.json(), {
      status: "ERROR",
      message: "Payload Too Large. The maximum body size is 10 MB.",
    });
  });

  test("edge: XML bigger than the JSON limit but within the XML limit reaches the validator", async () => {
    const body = `<Other>${"x".repeat(LIMITS.jsonBytes + 1024)}</Other>`;
    const res = await post("/api/deploy-workflow", body, "application/xml");
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.cause, "The root element <Workflow> was not found.");
  });

  test("edge: the XML limit matches the compiler's Ignition output limit", async () => {
    const { LIMITS: compilerLimits } = await import(
      "../../supabase/functions/compile-xml/compiler.mjs"
    );
    assert.equal(LIMITS.xmlBytes, compilerLimits.maxXmlBytes);
    assert.equal(LIMITS.jsonBytes, compilerLimits.maxBodyBytes);
  });
});
