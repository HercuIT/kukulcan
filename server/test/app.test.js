// La app real del servidor (server/src/app.js): límites de tamaño y manejador de errores.
// Correr con: npm run test:node (desde la raíz; necesita `npm ci --prefix server`).
const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");

// Nunca escribir en el proyecto real: la ruta de deploy registra cada petición en server_logs, y
// app.js carga server/.env. dotenv no pisa variables ya definidas, así que vaciarlas antes de
// cargar la app deja al logger sin cliente (lo reporta por consola y sigue).
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
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
    // Muchos elementos pequeños, como un XML real: un solo texto de megas tarda minutos en el
    // parser (ver CLAUDE.md → defectos conocidos) y no es lo que esta prueba mide.
    const unit = '<Item a="1"/>';
    const count = Math.ceil((LIMITS.jsonBytes + 1024) / unit.length);
    const body = `<Other>${unit.repeat(count)}</Other>`;
    const res = await post("/api/deploy-workflow", body, "application/xml");
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.cause, "The root element <Workflow> was not found.");
  });

  test("edge: the XML limit matches the compiler's Ignition output limit", async () => {
    const { LIMITS: compilerLimits } =
      await import("../../supabase/functions/compile-xml/compiler.mjs");
    assert.equal(LIMITS.xmlBytes, compilerLimits.maxXmlBytes);
    assert.equal(LIMITS.jsonBytes, compilerLimits.maxBodyBytes);
  });
});

describe("server app: /api/deploy-siemens (stub, HTE-110)", () => {
  // No TIA Portal Openness server exists yet (see HTE-110): this route never contacts
  // anything and always answers 501, so a caller can't mistake it for a working deploy.
  test("positive: well-formed XML gets a 501 NOT_CONFIGURED, not a fake success", async () => {
    const res = await post(
      "/api/deploy-siemens",
      '<Workflow id="W-SIEMENS"></Workflow>',
      "application/xml",
    );
    assert.equal(res.status, 501);
    const json = await res.json();
    assert.equal(json.status, "NOT_CONFIGURED");
    assert.match(json.message, /TIA Portal Openness/);
  });

  test("negative: missing body gets a 400, not a 501", async () => {
    const res = await post("/api/deploy-siemens", "", "application/xml");
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
      status: "ERROR",
      message: "Bad Request. Missing workflow data",
    });
  });

  test("negative: a JSON body (wrong content type) is rejected, not deployed", async () => {
    // app.js only parses a string body for application/xml or text/xml, so a JSON content
    // type never reaches the route as a string; it's rejected the same way as a missing body.
    const res = await post(
      "/api/deploy-siemens",
      JSON.stringify({ id: "W-SIEMENS" }),
      "application/json",
    );
    assert.equal(res.status, 400);
  });

  test("negative: a method other than POST gets a 405 naming the allowed method", async () => {
    const res = await fetch(`${baseUrl}/api/deploy-siemens`, {
      method: "GET",
    });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get("allow"), "POST");
  });

  test("edge: XML over the shared deploy limit gets a JSON 413 naming 10 MB", async () => {
    const body = `<Workflow>${"x".repeat(LIMITS.xmlBytes)}</Workflow>`;
    const res = await post("/api/deploy-siemens", body, "application/xml");
    assert.equal(res.status, 413);
    assert.deepEqual(await res.json(), {
      status: "ERROR",
      message: "Payload Too Large. The maximum body size is 10 MB.",
    });
  });
});
