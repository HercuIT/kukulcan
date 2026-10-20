/* ===========================
 * compile-xml: validación y generación del XML
 * Portado desde la Cloud Function compileXML (functions/index.js). Para un workflow válido con
 * parámetros agrupados el XML es idéntico (ver supabase/tests/fixtures).
 *
 * Dos destinos (`target` en el cuerpo):
 * - "controller" (por defecto): el documento <Controller> del PLC, el que descarga el botón Compile.
 * - "ignition": solo el <Workflow>, el documento que acepta /api/deploy-workflow (validarWorkflow)
 *   y recibe recibirXML. Ambos salen de buildWorkflowXml, así que describen nodos y parámetros
 *   igual. POST /api/compile del servidor local usa este mismo módulo.
 * =========================== */

export const TARGETS = ["controller", "ignition"];

// Límites para que una petición autenticada no pueda agotar memoria o CPU.
export const LIMITS = {
  maxBodyBytes: 5 * 1024 * 1024,
  maxNodes: 5000,
  maxConnections: 10000,
};

const isPlainObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const hasId = (id) =>
  (typeof id === "string" && id.trim() !== "") ||
  (typeof id === "number" && Number.isFinite(id));

// Estructura mínima antes de leer id/type/from/to: objetos, ids presentes y sin repetir, tamaños.
function validateStructure(wf) {
  if (wf.nodes.length > LIMITS.maxNodes)
    return [
      `Demasiados nodos (${wf.nodes.length}); el máximo es ${LIMITS.maxNodes}.`,
    ];
  if (wf.connections.length > LIMITS.maxConnections)
    return [
      `Demasiadas conexiones (${wf.connections.length}); el máximo es ${LIMITS.maxConnections}.`,
    ];

  const errors = [];
  const seen = new Set();
  wf.nodes.forEach((n, i) => {
    if (!isPlainObject(n)) {
      errors.push(`El nodo #${i + 1} no es un objeto.`);
      return;
    }
    if (!hasId(n.id)) {
      errors.push(`El nodo #${i + 1} no tiene id.`);
      return;
    }
    const key = String(n.id);
    if (seen.has(key)) errors.push(`El id de nodo '${key}' está repetido.`);
    seen.add(key);
  });
  wf.connections.forEach((c, i) => {
    if (!isPlainObject(c))
      errors.push(`La conexión #${i + 1} no es un objeto.`);
  });
  return errors;
}

/* --- Validador --- */
export function validateWorkflow(wf) {
  const errors = [];
  if (!wf || !Array.isArray(wf.nodes) || !Array.isArray(wf.connections)) {
    return { ok: false, errors: ['Se esperan "nodes[]" y "connections[]"'] };
  }
  const structural = validateStructure(wf);
  if (structural.length) return { ok: false, errors: structural };
  const nodesById = new Map(wf.nodes.map((n) => [n.id, n]));
  const inDeg = {},
    outDeg = {};
  wf.nodes.forEach((n) => {
    inDeg[n.id] = 0;
    outDeg[n.id] = 0;
  });

  const begins = wf.nodes.filter((n) =>
    /^(begin|start)$/i.test(String(n.type)),
  );
  const ends = wf.nodes.filter((n) => /^end$/i.test(String(n.type)));

  if (begins.length !== 1)
    errors.push(
      `Debe existir exactamente 1 nodo Begin/Start (hay ${begins.length}).`,
    );
  if (ends.length !== 1)
    errors.push(`Debe existir exactamente 1 nodo End (hay ${ends.length}).`);

  for (const c of wf.connections) {
    if (!nodesById.has(c.from))
      errors.push(`Connection.from '${c.from}' no existe.`);
    if (!nodesById.has(c.to)) errors.push(`Connection.to '${c.to}' no existe.`);
    if (nodesById.has(c.from) && nodesById.has(c.to)) {
      outDeg[c.from] = (outDeg[c.from] || 0) + 1;
      inDeg[c.to] = (inDeg[c.to] || 0) + 1;
    }
  }

  if (begins[0]) {
    const b = begins[0].id;
    if (inDeg[b] > 0) errors.push(`Begin (${b}) no debe tener entradas.`);
    if (outDeg[b] === 0)
      errors.push(`Begin (${b}) debe tener al menos una salida.`);
  }
  if (ends[0]) {
    const e = ends[0].id;
    if (outDeg[e] > 0) errors.push(`End (${e}) no debe tener salidas.`);
    if (inDeg[e] === 0)
      errors.push(`End (${e}) debe tener al menos una entrada.`);
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Solo para el destino "ignition": las mismas reglas de nodo que validarWorkflow aplica al XML,
 * comprobadas sobre el JSON para fallar al compilar (nombrando nodo y parámetro) y no al desplegar.
 * Cada nodo que no es Begin/Start/End necesita al menos un parámetro con nombre, y cada parámetro
 * que se escribe necesita nombre y valor (tras caer en defaultValue).
 */
export function validateDeployable(wf) {
  const errors = [];
  // Sin id se usa "W-001"; un id de solo espacios llegaría vacío a validarWorkflow (que recorta).
  if (typeof wf.id === "string" && wf.id !== "" && wf.id.trim() === "") {
    errors.push("El workflow necesita un id que no esté en blanco.");
  }
  for (const n of wf.nodes) {
    if (/^(begin|start|end)$/i.test(String(n.type))) continue;
    const name = nodeName(n);
    const params = flattenParams(n);
    if (params.length === 0) {
      errors.push(`El nodo '${name}' debe tener al menos un parámetro.`);
      continue;
    }
    for (const p of params) {
      if (String(p.name).trim() === "") {
        errors.push(`El nodo '${name}' tiene un parámetro sin nombre.`);
      } else if (String(p.value).trim() === "") {
        errors.push(
          `El nodo '${name}' requiere un valor para el parámetro '${p.name}'.`,
        );
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/* --- Helpers XML --- */
const TYPE_TO_XML = {
  begin: "BeginElement",
  start: "BeginElement",
  end: "EndElement",
};
// parameters llega como { grupo: [...] } (NodeParametersModal) o como arreglo plano de
// { name, dataType, defaultValue } (nodos creados con CreateNodeModal).
const paramGroups = (p) => (Array.isArray(p) ? [p] : Object.values(p));

const mapTypeToXml = (t) =>
  TYPE_TO_XML[String(t || "").toLowerCase()] || t || "NodeDefinitionName";
const nodeName = (n) => n.name || n.type || "Node";

// Parámetros de un nodo en una lista plana, como se escriben en <Parameter>. Las filas sin nombre,
// valor ni unidades se saltan; el valor cae en defaultValue solo si falta (no si es "").
function flattenParams(n) {
  const p = n.parameters;
  if (!p || typeof p !== "object") return [];
  const out = [];
  for (const group of paramGroups(p)) {
    if (Array.isArray(group)) {
      for (const x of group) {
        if (x && (x.name || x.value || x.units)) {
          out.push({
            name: x.name ?? "",
            value: x.value ?? x.defaultValue ?? "",
            unit: x.units ?? x.unit ?? "",
            dataType: x.type ?? x.dataType ?? "",
            defaultValue: x.defaultValue ?? "",
          });
        }
      }
    }
  }
  return out;
}
const esc = (s = "") =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

/* --- Generación del XML --- */

/**
 * El elemento <Workflow> con sus <Nodes> (y <Parameters>) y <Connections>. Es el documento de
 * Ignition (buildIgnitionXml) y el <Workflow> que va dentro del documento del PLC (buildXml).
 * `indent` es la sangría de la línea <Workflow>; el resto se escribe relativo a ella, como siempre,
 * para que el documento del PLC siga saliendo byte a byte igual.
 */
export function buildWorkflowXml(wf, { indent = "" } = {}) {
  const i2 = `${indent}  `;
  const i4 = `${indent}    `;
  const i6 = `${indent}      `;

  // --- Nodos (con Parameters por nodo) ---
  const nodesXml = (wf.nodes || [])
    .map((n) => {
      const typeXml = mapTypeToXml(n.type);
      const name = nodeName(n);

      // Begin/End self-closing
      if (typeXml === "BeginElement") {
        return `${i2}<Node id="${esc(n.id)}" type="BeginElement" name="Begin"/>`;
      }
      if (typeXml === "EndElement") {
        return `${i2}<Node id="${esc(n.id)}" type="EndElement" name="End"/>`;
      }

      const flatParams = flattenParams(n);
      const paramsXml = flatParams.length
        ? `${i4}<Parameters>
${flatParams
  .map((p) => {
    const dt = p.dataType ? ` dataType="${esc(p.dataType)}"` : "";
    const dv = p.defaultValue ? ` defaultValue="${esc(p.defaultValue)}"` : "";
    return `${i6}<Parameter name="${esc(p.name)}" value="${esc(p.value)}" unit="${esc(p.unit)}"${dt}${dv}/>`;
  })
  .join("\n")}
${i4}</Parameters>
`
        : "";

      // Asignaciones opcionales
      let assigns = "";
      if (n.equipmentId)
        assigns += `${i4}<Equipment assignedId="${esc(n.equipmentId)}"/>\n`;
      if (n.materialId)
        assigns += `${i4}<Material assignedId="${esc(n.materialId)}"/>\n`;
      if (n.personnelId)
        assigns += `${i4}<Personnel assignedId="${esc(n.personnelId)}"/>\n`;
      if (n.workInstructionId)
        assigns += `${i4}<WorkInstruction assignedId="${esc(n.workInstructionId)}"/>\n`;
      if (n.elementName)
        assigns += `${i4}<Element name="${esc(n.elementName)}"/>\n`;
      if (n.procedurePhase)
        assigns += `${i4}<ProcedurePhase name="${esc(n.procedurePhase)}"/>\n`;
      if (n.operation)
        assigns += `${i4}<Operation name="${esc(n.operation)}"/>\n`;

      if (!paramsXml && !assigns) {
        return `${i2}<Node id="${esc(n.id)}" type="${esc(typeXml)}" name="${esc(name)}"/>`;
      }
      return `${i2}<Node id="${esc(n.id)}" type="${esc(typeXml)}" name="${esc(name)}">
${paramsXml}${assigns}${i2}</Node>`;
    })
    .join("\n");

  // --- Conexiones ---
  const connsXml = (wf.connections || [])
    .map((c) => `${i2}<Connection from="${esc(c.from)}" to="${esc(c.to)}"/>`)
    .join("\n");

  return `${indent}<Workflow id="${esc(wf.id || "W-001")}" name="${esc(wf.workflowName || wf.name || "Workflow")}" version="${esc(wf.version || "1.0")}">
${i2}<Nodes>
${nodesXml}
${i2}</Nodes>
${i2}<Connections>
${connsXml}
${i2}</Connections>
${indent}</Workflow>`;
}

// Documento de Ignition (destino "ignition"): solo el <Workflow>, la forma que valida
// validarWorkflow en server/src/routes/deployWorkflowRoutes.js.
export function buildIgnitionXml(wf) {
  return `<?xml version="1.0" encoding="UTF-8"?>
${buildWorkflowXml(wf)}
`;
}

// Documento del PLC (destino "controller", el que descarga el botón Compile).
export function buildXml(wf) {
  // --- Tags (a partir de TODOS los parámetros de TODOS los nodos) ---
  let allParams = [];
  try {
    const seen = new Set();
    (wf.nodes || []).forEach((node) => {
      const p = node.parameters;
      if (!p || typeof p !== "object") return;
      for (const group of paramGroups(p)) {
        if (Array.isArray(group)) {
          for (const par of group) {
            if (par && par.name && !seen.has(par.name)) {
              seen.add(par.name);
              allParams.push(par);
            }
          }
        }
      }
    });
  } catch (e) {
    console.error("Error recopilando parámetros:", e);
    allParams = [];
  }

  const tagsXml = allParams.length
    ? allParams
        .map(
          (p) =>
            `        <Tag Name="${esc(p.name)}" TagType="Base" DataType="REAL" Radix="Decimal" Constant="false" ExternalAccess="Read/Write"/>`,
        )
        .join("\n")
    : "";

  // --- Workflow embebido (jerarquía PLC) ---
  const workflowXml = `\n${buildWorkflowXml(wf, { indent: "  " })}`;

  // --- STContent dinámico ---
  const tagNames = allParams.map((p) => p.name).filter(Boolean);
  const toIdent = (name = "") => String(name).trim().replace(/[^\w]/g, "_");

  let stContent = "";
  if (tagNames.length >= 2) {
    stContent = `          <STContent>
            ${toIdent(tagNames[0])} > ${toIdent(tagNames[1])}
          </STContent>
`;
  } else if (tagNames.length === 1) {
    stContent = `          <STContent>
            ${toIdent(tagNames[0])} > 0
          </STContent>
`;
  }

  // --- SFC: generación de Step, Transition y DirectedLink con ID, X, Y ---
  // Ordenamos los nodos por Y para asignar IDs internos secuenciales (1,2,3,...)
  const orderedForSfc = [...(wf.nodes || [])].sort(
    (a, b) => (a.y ?? 0) - (b.y ?? 0),
  );

  const nodeIdToStepId = new Map();
  // Búsqueda por id en O(1) (antes era un find por conexión: O(nodos × conexiones)).
  const sfcNodeById = new Map(orderedForSfc.map((n) => [n.id, n]));
  const stepLines = [];

  orderedForSfc.forEach((n, idx) => {
    const stepId = String(idx + 1); // ID interna simulada
    nodeIdToStepId.set(n.id, stepId);

    const x = n.x ?? n.posX ?? 0;
    const y = n.y ?? n.posY ?? 0;

    stepLines.push(
      `        <Step ID="${esc(stepId)}" X="${esc(x)}" Y="${esc(y)}" />`,
    );
  });

  let nextTransitionId = orderedForSfc.length + 1;
  const transitionLines = [];
  const directedLines = [];

  (wf.connections || []).forEach((c, idx) => {
    const fromStepId = nodeIdToStepId.get(c.from);
    const toStepId = nodeIdToStepId.get(c.to);

    const fromNode = sfcNodeById.get(c.from);
    const toNode = sfcNodeById.get(c.to);

    const fromX = fromNode?.x ?? fromNode?.posX ?? 0;
    const fromY = fromNode?.y ?? fromNode?.posY ?? 0;
    const toX = toNode?.x ?? toNode?.posX ?? fromX;
    const toY = toNode?.y ?? toNode?.posY ?? fromY;

    const midX = (Number(fromX) + Number(toX)) / 2;
    const midY = (Number(fromY) + Number(toY)) / 2;

    const trId = String(nextTransitionId++);

    // Solo ponemos STContent en la primera transición, si existe
    const maybeSt = idx === 0 && stContent ? `\n${stContent}        ` : "";

    transitionLines.push(
      `        <Transition ID="${esc(trId)}" X="${esc(midX)}" Y="${esc(midY)}">${maybeSt}</Transition>`,
    );

    if (fromStepId && trId) {
      directedLines.push(
        `        <DirectedLink Source="${esc(fromStepId)}" Target="${esc(trId)}" />`,
      );
    }
    if (trId && toStepId) {
      directedLines.push(
        `        <DirectedLink Source="${esc(trId)}" Target="${esc(toStepId)}" />`,
      );
    }
  });

  const stepsXml = stepLines.join("\n");
  const transitionsXml = transitionLines.join("\n");
  const directedLinksXml = directedLines.join("\n");

  const sfcContent = `
      <SFCContent>
${workflowXml}
${stepsXml ? stepsXml + "\n" : ""}${transitionsXml ? transitionsXml + "\n" : ""}${directedLinksXml ? directedLinksXml + "\n" : ""}      </SFCContent>
`;

  // --- XML final ---
  const programName = wf.program || wf.programName || "MainProgram";
  const routineName = wf.routine || wf.routineName || "SFC_Control_Routine";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Controller Use="Context">
  <DataTypes Use="Context" />
  <Programs Use="Context">
    <Program Use="Context" Name="${esc(programName)}">
      <Tags Use="Context">
${tagsXml}
      </Tags>
      <SFCContent Routine="${esc(routineName)}">
${sfcContent}
      </SFCContent>
    </Program>
  </Programs>
</Controller>`;
}

/* --- Nombre del archivo descargable --- */
export function xmlFileName(wf) {
  const rawName = wf.workflowName || wf.name || wf.id || "workflow";
  let safeName = String(rawName)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9_.-]+/g, "_");

  if (!safeName.toLowerCase().endsWith(".xml")) safeName += ".xml";
  return safeName;
}

/**
 * Lee el cuerpo de una Request como texto sin pasar de maxBytes. Devuelve null en cuanto se pasa
 * (por Content-Length o mientras llega), sin cargar el resto en memoria.
 */
export async function readTextLimited(req, maxBytes = LIMITS.maxBodyBytes) {
  const declared = Number(req.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!req.body) return "";

  const reader = req.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Compila el cuerpo de la petición. Devuelve el status HTTP y el cuerpo,
 * igual que el handler compileXML de Firebase. `target` en el cuerpo elige el documento:
 * "controller" (por defecto, sin cambios) o "ignition" (el que acepta /api/deploy-workflow).
 */
export function compileRequest(body) {
  let wf = body;
  if (
    typeof wf === "string" &&
    new TextEncoder().encode(wf).length > LIMITS.maxBodyBytes
  ) {
    return {
      status: 413,
      json: {
        message: `El workflow supera el tamaño máximo (${LIMITS.maxBodyBytes} bytes).`,
        errors: [],
      },
    };
  }
  if (typeof wf === "string") {
    try {
      wf = JSON.parse(wf);
    } catch {
      return {
        status: 400,
        json: { message: "Body debe ser JSON válido", errors: [] },
      };
    }
  }

  const target =
    isPlainObject(wf) && wf.target != null ? wf.target : "controller";
  if (!TARGETS.includes(target)) {
    return {
      status: 400,
      json: {
        message: `Target desconocido: '${target}'. Usa 'controller' o 'ignition'.`,
        errors: [],
      },
    };
  }

  const { ok, errors } = validateWorkflow(wf);
  if (!ok)
    return { status: 400, json: { message: "Fallo de compilación", errors } };

  if (target === "ignition") {
    const deployable = validateDeployable(wf);
    if (!deployable.ok)
      return {
        status: 400,
        json: { message: "Fallo de compilación", errors: deployable.errors },
      };
    return {
      status: 200,
      xml: buildIgnitionXml(wf),
      filename: xmlFileName(wf),
    };
  }

  return { status: 200, xml: buildXml(wf), filename: xmlFileName(wf) };
}
