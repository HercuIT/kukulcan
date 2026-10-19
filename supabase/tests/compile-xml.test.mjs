// Pruebas del compilador de la Edge Function compile-xml.
// workflow.expected.xml lo generó la Cloud Function compileXML original, así que la
// prueba positiva garantiza que el XML no cambió con la migración.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  compileRequest,
  LIMITS,
  readTextLimited,
  validateWorkflow,
  xmlFileName,
} from "../functions/compile-xml/compiler.mjs";

const fixtures = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);
const read = (f) =>
  readFileSync(path.join(fixtures, f), "utf8").replace(/\r\n/g, "\n");

const minimal = (extra = {}) => ({
  nodes: [
    { id: "s", type: "start" },
    { id: "e", type: "end" },
  ],
  connections: [{ from: "s", to: "e" }],
  ...extra,
});

describe("positive", () => {
  test("produces exactly the XML the Firebase function produced", () => {
    const result = compileRequest(read("workflow.json"));
    assert.equal(result.status, 200);
    assert.equal(result.xml, read("workflow.expected.xml"));
    assert.equal(result.filename, "Mezcla_Acida_1_.xml");
  });

  test("accepts an already-parsed object body", () => {
    const result = compileRequest(minimal({ name: "Linea 1" }));
    assert.equal(result.status, 200);
    assert.match(
      result.xml,
      /<Node id="s" type="BeginElement" name="Begin"\/>/,
    );
    assert.equal(result.filename, "Linea_1.xml");
  });
});

describe("negative", () => {
  test("rejects a body that is not JSON", () => {
    assert.deepEqual(compileRequest("{nope"), {
      status: 400,
      json: { message: "Body debe ser JSON válido", errors: [] },
    });
  });

  test("rejects a body without nodes or connections", () => {
    const result = compileRequest({ nodes: [] });
    assert.equal(result.status, 400);
    assert.deepEqual(result.json.errors, [
      'Se esperan "nodes[]" y "connections[]"',
    ]);
  });

  test("reports every graph rule that is broken", () => {
    const { ok, errors } = validateWorkflow({
      nodes: [
        { id: "a", type: "start" },
        { id: "b", type: "Begin" },
      ],
      connections: [{ from: "a", to: "ghost" }],
    });
    assert.equal(ok, false);
    assert.deepEqual(errors, [
      "Debe existir exactamente 1 nodo Begin/Start (hay 2).",
      "Debe existir exactamente 1 nodo End (hay 0).",
      "Connection.to 'ghost' no existe.",
      "Begin (a) debe tener al menos una salida.",
    ]);
  });

  test("rejects Begin with inputs and End with outputs", () => {
    const { errors } = validateWorkflow({
      nodes: [
        { id: "s", type: "start" },
        { id: "e", type: "end" },
      ],
      connections: [
        { from: "s", to: "e" },
        { from: "e", to: "s" },
      ],
    });
    assert.ok(errors.includes("Begin (s) no debe tener entradas."));
    assert.ok(errors.includes("End (e) no debe tener salidas."));
  });
});

describe("edge", () => {
  test("a graph with only Begin and End has no tags or ST content", () => {
    const { xml } = compileRequest(minimal());
    assert.match(xml, /<Tags Use="Context">\n\n {6}<\/Tags>/);
    assert.doesNotMatch(xml, /STContent/);
  });

  test("escapes XML special characters in names and values", () => {
    const { xml } = compileRequest(minimal({ name: `A&B <"x">'` }));
    assert.match(xml, /name="A&amp;B &lt;&quot;x&quot;&gt;&apos;"/);
  });

  test("file names drop accents and unsafe characters, and keep a single .xml", () => {
    assert.equal(xmlFileName({ workflowName: "Línea ñ/3" }), "Linea_n_3.xml");
    assert.equal(xmlFileName({ name: "plan.XML" }), "plan.XML");
    assert.equal(xmlFileName({}), "workflow.xml");
  });

  test("a large workflow compiles", () => {
    const nodes = [{ id: "s", type: "start", y: 0 }];
    const connections = [];
    for (let i = 0; i < 2000; i++) {
      nodes.push({
        id: `n${i}`,
        type: "Procedure Phase",
        y: i + 1,
        parameters: { p: [{ name: `t${i}`, value: "1" }] },
      });
      connections.push({ from: i === 0 ? "s" : `n${i - 1}`, to: `n${i}` });
    }
    nodes.push({ id: "e", type: "end", y: 5000 });
    connections.push({ from: "n1999", to: "e" });
    const result = compileRequest({ nodes, connections });
    assert.equal(result.status, 200);
    assert.equal((result.xml.match(/<Tag /g) || []).length, 2000);
  });
});

describe("review fixes", () => {
  const graph = (middle) => ({
    nodes: [
      { id: "s", type: "start", y: 0 },
      middle,
      { id: "e", type: "end", y: 99 },
    ],
    connections: [
      { from: "s", to: middle.id },
      { from: middle.id, to: "e" },
    ],
  });

  test("positive: flat parameters from CreateNodeModal compile into <Parameters> and tags", () => {
    const { status, xml } = compileRequest(
      graph({
        id: "n1",
        type: "Procedure Phase",
        y: 1,
        parameters: [
          { name: "Speed", dataType: "REAL", defaultValue: "12.5" },
          { name: "Count", dataType: "INT", defaultValue: "3" },
        ],
      }),
    );
    assert.equal(status, 200);
    assert.match(
      xml,
      /<Parameter name="Speed" value="12.5" unit="" dataType="REAL" defaultValue="12.5"\/>/,
    );
    assert.match(xml, /<Tag Name="Count" /);
  });

  test("negative: malformed nodes and connections give 400, not a crash", () => {
    for (const body of [
      { nodes: [null], connections: [] },
      { nodes: [42, "x"], connections: [] },
      { nodes: [{ id: "s", type: "start" }], connections: [null] },
      { nodes: [[]], connections: [] },
    ]) {
      const result = compileRequest(body);
      assert.equal(result.status, 400, JSON.stringify(body));
      assert.ok(result.json.errors.length > 0);
    }
  });

  test("negative: missing, empty and duplicate node ids are rejected", () => {
    const { errors } = validateWorkflow({
      nodes: [
        { id: "a", type: "start" },
        { id: "a", type: "end" },
        { type: "x" },
        { id: "  ", type: "y" },
      ],
      connections: [],
    });
    assert.deepEqual(errors, [
      "El id de nodo 'a' está repetido.",
      "El nodo #3 no tiene id.",
      "El nodo #4 no tiene id.",
    ]);
  });

  test("edge: node and connection counts over the limit are rejected", () => {
    const nodes = Array.from({ length: LIMITS.maxNodes + 1 }, (_, i) => ({
      id: `n${i}`,
    }));
    assert.match(
      validateWorkflow({ nodes, connections: [] }).errors[0],
      /Demasiados nodos/,
    );
    const connections = Array.from(
      { length: LIMITS.maxConnections + 1 },
      () => ({}),
    );
    assert.match(
      validateWorkflow({ nodes: [], connections }).errors[0],
      /Demasiadas conexiones/,
    );
  });

  test("edge: bodies over the size limit get 413", async () => {
    const big = "x".repeat(LIMITS.maxBodyBytes + 1);
    assert.equal(compileRequest(big).status, 413);

    const declared = new Request("http://x", {
      method: "POST",
      body: "{}",
      headers: { "Content-Length": String(LIMITS.maxBodyBytes + 1) },
    });
    assert.equal(await readTextLimited(declared), null);

    const streamed = new Request("http://x", {
      method: "POST",
      body: "a".repeat(11),
    });
    assert.equal(await readTextLimited(streamed, 10), null);
    const ok = new Request("http://x", { method: "POST", body: "ñandú" });
    assert.equal(await readTextLimited(ok, 10), "ñandú");
  });
});
