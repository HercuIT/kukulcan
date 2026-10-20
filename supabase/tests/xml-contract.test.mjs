// Prueba de contrato: lo que producen los dos compiladores para Ignition tiene que pasar el
// validador de /api/deploy-workflow (validarWorkflow). Cada caso corre por compile-xml
// (compileRequest con target "ignition") y por POST /api/compile (el router de Express montado en
// este proceso), y el XML de ambos se le pasa a validarWorkflow.
// Correr con: npm run test:node (necesita las dependencias de server/: `npm ci --prefix server`).
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { compileRequest, LIMITS } from "../functions/compile-xml/compiler.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRequire = createRequire(
  path.join(here, "..", "..", "server", "src", "index.js"),
);
const { validarWorkflow } = serverRequire("./validarWorkflow.js");
const deployRoutes = serverRequire("./routes/deployWorkflowRoutes.js");
const compileRoutes = serverRequire("./routes/compileRoutes.js");
const express = serverRequire("express");
const { XMLParser } = serverRequire("fast-xml-parser");

const fixture = (f) =>
  JSON.parse(readFileSync(path.join(here, "fixtures", f), "utf8"));

// --- POST /api/compile en proceso ---
let server;
let baseUrl;
before(async () => {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use("/api/compile", compileRoutes);
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

async function compileViaServer(body) {
  const res = await fetch(`${baseUrl}/api/compile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const isXml = (res.headers.get("content-type") || "").includes("xml");
  return isXml
    ? { status: res.status, xml: text, headers: res.headers }
    : { status: res.status, json: JSON.parse(text) };
}

const compileViaEdge = (body) =>
  compileRequest({ ...body, target: body.target ?? "ignition" });

// Compila por ambos caminos y devuelve [[nombre, resultado], …].
async function compileBoth(body) {
  return [
    ["compile-xml", compileViaEdge(body)],
    ["/api/compile", await compileViaServer(body)],
  ];
}

async function assertBothDeployable(body, expectedId) {
  for (const [via, result] of await compileBoth(body)) {
    assert.equal(result.status, 200, `${via}: ${JSON.stringify(result.json)}`);
    const verdict = validarWorkflow(result.xml);
    assert.equal(verdict.isValid, true, `${via}: ${verdict.message}`);
    assert.equal(verdict.workflowId, expectedId, via);
  }
}

const middle = (id, extra = {}) => ({ id, type: "Procedure Phase", ...extra });
const chain = (nodes) => ({
  id: "W-CHAIN",
  nodes: [{ id: "b", type: "start" }, ...nodes, { id: "e", type: "end" }],
  connections: ["b", ...nodes.map((n) => n.id), "e"]
    .slice(0, -1)
    .map((from, i, ids) => ({
      from,
      to: i + 1 < ids.length ? ids[i + 1] : "e",
    })),
});

describe("contract: positive", () => {
  test("a complete workflow with grouped parameters is deployable from both compilers", async () => {
    await assertBothDeployable(fixture("complete.json"), "W-COMPLETE");
  });

  test("a user-created definition with a flat parameter array is deployable; values come from defaultValue", async () => {
    await assertBothDeployable(fixture("flat-params.json"), "W-FLAT");
    const xml = compileViaEdge(fixture("flat-params.json")).xml;
    assert.match(xml, /<Parameter name="Setpoint" value="75.5"/);
    assert.match(xml, /<Parameter name="Enabled" value="false"/);
  });

  test("Begin → End alone needs no parameters", async () => {
    await assertBothDeployable(
      {
        id: "W-MIN",
        nodes: [
          { id: "b", type: "start" },
          { id: "e", type: "end" },
        ],
        connections: [{ from: "b", to: "e" }],
      },
      "W-MIN",
    );
  });

  test("the ignition document is a bare <Workflow> with the XML declaration", () => {
    const { xml } = compileViaEdge(fixture("complete.json"));
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<Workflow /);
    assert.doesNotMatch(xml, /<Controller/);
  });

  test("/api/compile keeps canvas ids and type names, and still tags its response", async () => {
    const result = await compileViaServer(fixture("complete.json"));
    assert.match(result.xml, /<Node id="phase" type="Procedure Phase"/);
    assert.equal(result.headers.get("x-compiler"), "local");
    assert.match(
      result.headers.get("content-disposition"),
      /filename="Linea_completa\.xml"/,
    );
  });
});

describe("contract: negative", () => {
  test("an empty parameter value fails at compile time, naming node and parameter, on both paths", async () => {
    // workflow.json: el parámetro Temp de 'Mix & Heat' tiene value "".
    for (const [via, result] of await compileBoth(fixture("workflow.json"))) {
      assert.equal(result.status, 400, via);
      assert.equal(result.xml, undefined, via);
      assert.equal(result.json.message, "Fallo de compilación", via);
      assert.deepEqual(
        result.json.errors,
        ["El nodo 'Mix & Heat' requiere un valor para el parámetro 'Temp'."],
        via,
      );
    }
  });

  test("a middle node without parameters fails for ignition but still compiles for controller", async () => {
    const wf = chain([middle("m", { name: "Dose" })]);
    for (const [via, result] of await compileBoth(wf)) {
      assert.equal(result.status, 400, via);
      assert.deepEqual(result.json.errors, [
        "El nodo 'Dose' debe tener al menos un parámetro.",
      ]);
    }
    const controller = compileRequest({ ...wf, target: "controller" });
    assert.equal(controller.status, 200);
    assert.match(controller.xml, /<Controller/);
  });

  test("a parameter with a value but no name is rejected", async () => {
    const wf = chain([
      middle("m", {
        name: "Dose",
        parameters: [
          { name: "Qty", value: "2" },
          { name: "", value: "5" },
        ],
      }),
    ]);
    for (const [via, result] of await compileBoth(wf)) {
      assert.equal(result.status, 400, via);
      assert.deepEqual(result.json.errors, [
        "El nodo 'Dose' tiene un parámetro sin nombre.",
      ]);
    }
    // Aunque ninguna fila tenga nombre, el nodo sí tiene parámetros: el error es el nombre.
    const onlyUnnamed = chain([
      middle("m", {
        name: "Dose",
        parameters: [
          { name: "", value: "5" },
          { name: " ", units: "kg" },
        ],
      }),
    ]);
    for (const [via, result] of await compileBoth(onlyUnnamed)) {
      assert.equal(result.status, 400, via);
      assert.deepEqual(result.json.errors, [
        "El nodo 'Dose' tiene un parámetro sin nombre.",
        "El nodo 'Dose' tiene un parámetro sin nombre.",
      ]);
    }
  });

  test("a whitespace-only workflow id fails at compile time, not at deploy", async () => {
    const wf = { ...fixture("complete.json"), id: "   " };
    for (const [via, result] of await compileBoth(wf)) {
      assert.equal(result.status, 400, via);
      assert.deepEqual(result.json.errors, [
        "El workflow necesita un id que no esté en blanco.",
      ]);
    }
    // Sin id (o vacío) se usa W-001 y pasa; el controller sigue aceptando el id tal cual.
    await assertBothDeployable(
      { ...fixture("complete.json"), id: "" },
      "W-001",
    );
    assert.equal(compileRequest({ ...wf, target: "controller" }).status, 200);
  });

  test("an unknown target is rejected on both paths", async () => {
    for (const [via, result] of await compileBoth({
      ...fixture("complete.json"),
      target: "plc",
    })) {
      assert.equal(result.status, 400, via);
      assert.equal(
        result.json.message,
        "Target desconocido: 'plc'. Usa 'controller' o 'ignition'.",
        via,
      );
    }
  });

  test("the controller document is not deployable (why the ignition target exists)", () => {
    const { xml } = compileRequest(fixture("complete.json"));
    assert.deepEqual(validarWorkflow(xml), {
      isValid: false,
      message: "The root element <Workflow> was not found.",
    });
  });

  test("/api/compile rejects a body without nodes like compile-xml does", async () => {
    const result = await compileViaServer({ name: "x" });
    assert.equal(result.status, 400);
    assert.deepEqual(result.json.errors, [
      'Se esperan "nodes[]" y "connections[]"',
    ]);
  });
});

describe("contract: edge", () => {
  test("names with &, <, quotes and accents are escaped and round-trip", async () => {
    const name = `Mezcla "Ácida" & <fría> 'n'`;
    const wf = {
      ...chain([
        middle("m", {
          name,
          parameters: { p: [{ name: "Año <1>", value: "a & b" }] },
        }),
      ]),
      workflowName: name,
    };
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });
    for (const [via, result] of await compileBoth(wf)) {
      assert.equal(result.status, 200, via);
      assert.equal(validarWorkflow(result.xml).isValid, true, via);
      const doc = parser.parse(result.xml).Workflow;
      assert.equal(doc["@_name"], name, via);
      const node = doc.Nodes.Node.find((n) => n["@_id"] === "m");
      assert.equal(node["@_name"], name, via);
      assert.equal(node.Parameters.Parameter["@_name"], "Año <1>", via);
      assert.equal(node.Parameters.Parameter["@_value"], "a & b", via);
    }
  });

  test(`${LIMITS.maxNodes} nodes (the limit) with one parameter each pass on both paths`, async () => {
    const middles = Array.from({ length: LIMITS.maxNodes - 2 }, (_, i) =>
      middle(`n${i}`, {
        name: `Step ${i}`,
        parameters: [{ name: "P", value: String(i) }],
      }),
    );
    await assertBothDeployable(chain(middles), "W-CHAIN");
  });

  test("entirely empty parameter rows next to valid ones are skipped", async () => {
    const wf = chain([
      middle("m", {
        name: "Dose",
        parameters: {
          a: [{ name: "", value: "" }, { name: "Qty", value: "2" }, {}],
          b: [null],
        },
      }),
    ]);
    await assertBothDeployable(wf, "W-CHAIN");
  });

  test("an explicit controller target to compile-xml is the same as no target", () => {
    const wf = fixture("workflow.json");
    assert.equal(
      compileRequest({ ...wf, target: "controller" }).xml,
      compileRequest(wf).xml,
    );
  });

  test("bodies over the size limit get 413 for the ignition target too", () => {
    const big = JSON.stringify({
      target: "ignition",
      pad: "x".repeat(LIMITS.maxBodyBytes),
    });
    assert.equal(compileRequest(big).status, 413);
  });

  test("an Ignition document over the XML limit fails at compile time with 413", () => {
    // "&" ocupa 1 byte en el JSON y 5 en el XML (&amp;): menos de 5 MB de entrada, más de 10 de salida.
    const name = "&".repeat(Math.ceil(LIMITS.maxXmlBytes / 5) + 1);
    const wf = chain([
      middle("m", { name, parameters: [{ name: "P", value: "1" }] }),
    ]);
    assert.ok(JSON.stringify(wf).length < LIMITS.maxBodyBytes);
    const result = compileRequest({ ...wf, target: "ignition" });
    assert.equal(result.status, 413);
    assert.equal(result.xml, undefined);
    assert.match(result.json.message, /tamaño máximo que acepta el despliegue/);
    // El documento del PLC no tiene ese límite (no se despliega).
    assert.equal(compileRequest(wf).status, 200);
  });
});

describe("deploy route", () => {
  test("still exports the validator it uses", () => {
    assert.equal(deployRoutes.validarWorkflow, validarWorkflow);
  });
});
