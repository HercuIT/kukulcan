const express = require("express");
const router = express.Router();

// --- Validador básico del flujo ---
function validateWorkflow(workflow) {
  const errors = [];
  if (
    !workflow ||
    !Array.isArray(workflow.nodes) ||
    !Array.isArray(workflow.connections)
  ) {
    return {
      ok: false,
      errors: ['Payload inválido: se esperan "nodes" y "connections".'],
    };
  }

  const nodesById = new Map(workflow.nodes.map((n) => [n.id, n]));
  const incoming = new Map(),
    outgoing = new Map();
  workflow.nodes.forEach((n) => {
    incoming.set(n.id, 0);
    outgoing.set(n.id, 0);
  });

  const begins = workflow.nodes.filter((n) =>
    ["begin", "start"].includes(String(n.type).toLowerCase()),
  );
  const ends = workflow.nodes.filter(
    (n) => String(n.type).toLowerCase() === "end",
  );

  if (begins.length !== 1) {
    errors.push(
      `Debe existir exactamente 1 nodo Begin/Start (hay ${begins.length}).`,
    );
  }
  if (ends.length !== 1) {
    errors.push(`Debe existir exactamente 1 nodo End (hay ${ends.length}).`);
  }

  for (const c of workflow.connections) {
    if (!nodesById.has(c.from))
      errors.push(`Connection.from '${c.from}' no existe.`);
    if (!nodesById.has(c.to)) errors.push(`Connection.to '${c.to}' no existe.`);
    if (nodesById.has(c.from) && nodesById.has(c.to)) {
      outgoing.set(c.from, (outgoing.get(c.from) || 0) + 1);
      incoming.set(c.to, (incoming.get(c.to) || 0) + 1);
    }
  }

  if (begins[0]) {
    const bId = begins[0].id;
    if ((incoming.get(bId) || 0) > 0)
      errors.push(`Begin (${bId}) no debe tener entradas.`);
    if ((outgoing.get(bId) || 0) === 0)
      errors.push(`Begin (${bId}) debe tener al menos una salida.`);
  }
  if (ends[0]) {
    const eId = ends[0].id;
    if ((outgoing.get(eId) || 0) > 0)
      errors.push(`End (${eId}) no debe tener salidas.`);
    if ((incoming.get(eId) || 0) === 0)
      errors.push(`End (${eId}) debe tener al menos una entrada.`);
  }

  return { ok: errors.length === 0, errors };
}

// --- Conversión JSON → XML ---
function toXml(workflow) {
  const escape = (s = "") =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");

  // Mapeo de tipos
  const TYPE_TO_XML = {
    begin: "BeginElement",
    start: "BeginElement",
    end: "EndElement",
    procedure: "NodeDefinitionName",
    "procedure phase": "NodeDefinitionName",
    "procedure operation": "NodeDefinitionName",
    "procedure unit procedure": "NodeDefinitionName",
    connection: "Connection",
    equipment: "Equipment",
    material: "Material",
    personnel: "Personnel",
  };

  const mapTypeToXml = (t) =>
    TYPE_TO_XML[String(t || "").toLowerCase()] || "NodeDefinitionName";

  // --- Generar IDs cortos ---
  const shortId = (prefix, idx) => `${prefix}_${idx + 1}`;

  const nodesXml = workflow.nodes
    .map((n, idx) => {
      const xmlId = shortId("node", idx);
      const xmlType = mapTypeToXml(n.type);
      return `    <Node id="${xmlId}" type="${escape(xmlType)}" name="${escape(n.name || n.type)}"/>`;
    })
    .join("\n");

  const connsXml = workflow.connections
    .map((c) => {
      const from = shortId(
        "node",
        workflow.nodes.findIndex((n) => n.id === c.from),
      );
      const to = shortId(
        "node",
        workflow.nodes.findIndex((n) => n.id === c.to),
      );
      return `    <Connection from="${from}" to="${to}"/>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Workflow id="${escape(workflow.id)}" name="${escape(workflow.name)}" version="${escape(workflow.version)}">
  <Nodes>
${nodesXml}
  </Nodes>
  <Connections>
${connsXml}
  </Connections>
</Workflow>`;
}

// --- Ruta POST /api/compile ---
router.post("/", express.json({ limit: "2mb" }), (req, res) => {
  const wf = req.body;
  const { ok, errors } = validateWorkflow(wf);

  if (!ok) {
    return res.status(400).json({ message: "Fallo de compilación", errors });
  }

  try {
    const xml = toXml(wf);
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${wf.id || "workflow"}.xml"`,
    );
    res.setHeader("X-Compiler", "local"); // <-- header para saber que vino del backend local

    return res.send(xml);
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Error al generar XML", error: String(e) });
  }
});

module.exports = router;
