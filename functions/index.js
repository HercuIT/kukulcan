const { onCall, onRequest } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const functions = require("firebase-functions");

// INICIALIZACIÓN CORREGIDA para Firestore
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "xicotencatl", // Solo necesitas esto para Firestore
  });
}

const db = admin.firestore();

// Configuración opcional pero recomendada
db.settings({
  ignoreUndefinedProperties: true,
});

// Configuración global para todas las funciones v2
setGlobalOptions({
  region: "us-central1",
  maxInstances: 10,
  cors: true, // ✅ AÑADE ESTO
});

/**
 * Un diseñador envía un workflow para que sea revisado.
 */
exports.submitForReview = onCall(
  {
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Debes estar autenticado.",
      );
    }

    const { appId, workflowId, reviewerId } = request.data;
    const designerId = request.auth.uid;
    const workflowRef = db
      .collection("artifacts")
      .doc(appId)
      .collection("workflows")
      .doc(workflowId);

    return db
      .runTransaction(async (transaction) => {
        const workflowDoc = await transaction.get(workflowRef);
        if (!workflowDoc.exists) {
          throw new functions.https.HttpsError(
            "not-found",
            "El workflow no existe.",
          );
        }
        const metadata = workflowDoc.data().metadata;

        if (!metadata.designerIds.includes(designerId)) {
          throw new functions.https.HttpsError(
            "permission-denied",
            "No eres diseñador de este workflow.",
          );
        }
        if (metadata.status !== "draft") {
          throw new functions.https.HttpsError(
            "failed-precondition",
            "El workflow solo se puede enviar a revisión desde el estado 'draft'.",
          );
        }

        transaction.update(workflowRef, {
          "metadata.status": "pending_review",
          "metadata.assignedReviewerId": reviewerId,
          "metadata.lastModifiedBy": designerId,
          "metadata.lastModifiedAt":
            admin.firestore.FieldValue.serverTimestamp(),
        });
      })
      .then(() => {
        return { success: true, message: "Workflow enviado a revisión." };
      })
      .catch((error) => {
        console.error("Error en submitForReview:", error);
        throw new functions.https.HttpsError(
          "internal",
          error.message || "Ocurrió un error interno.",
        );
      });
  },
);

/**
 * Un reviewer aprueba un workflow.
 */
exports.approveWorkflow = onCall(
  {
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Debes estar autenticado.",
      );
    }

    const { appId, workflowId } = request.data;
    const reviewerId = request.auth.uid;
    const workflowRef = db
      .collection("artifacts")
      .doc(appId)
      .collection("workflows")
      .doc(workflowId);

    const workflowDoc = await workflowRef.get();
    if (!workflowDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "El workflow no existe.",
      );
    }
    const metadata = workflowDoc.data().metadata;

    if (metadata.assignedReviewerId !== reviewerId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "No eres el revisor asignado.",
      );
    }
    if (metadata.status !== "pending_review") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "El workflow no está pendiente de revisión.",
      );
    }

    await workflowRef.update({
      "metadata.status": "approved",
      "metadata.approvedBy": reviewerId,
      "metadata.lastModifiedBy": reviewerId,
      "metadata.lastModifiedAt": admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, message: "Workflow aprobado." };
  },
);

/**
 * Un revisor solicita cambios en un workflow.
 */
exports.requestChanges = onCall(
  {
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be authenticated.",
      );
    }

    const { appId, workflowId, comments } = request.data;
    const reviewerId = request.auth.uid;
    const workflowRef = db
      .collection("artifacts")
      .doc(appId)
      .collection("workflows")
      .doc(workflowId);

    const workflowDoc = await workflowRef.get();
    if (!workflowDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Workflow not found.");
    }

    const metadata = workflowDoc.data().metadata;

    if (metadata.assignedReviewerId !== reviewerId) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "You are not the assigned reviewer.",
      );
    }

    if (metadata.status !== "pending_review") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Workflow is not pending review.",
      );
    }

    await workflowRef.update({
      "metadata.status": "changes_requested",
      "metadata.assignedReviewerId": null,
      "metadata.lastModifiedBy": reviewerId,
      "metadata.lastModifiedAt": admin.firestore.FieldValue.serverTimestamp(),
    });

    // Save the comments in the history
    if (comments) {
      const historyRef = workflowRef.collection("history").doc();
      await historyRef.set({
        action: "changes_requested",
        comments: comments,
        userId: reviewerId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return {
      success: true,
      message:
        "Changes have been requested. The workflow has been reset to draft status.",
    };
  },
);

/**
 * Un diseñador añade a otro diseñador a un workflow.
 */
exports.addDesignerToWorkflow = onCall(
  {
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Debes estar autenticado.",
      );
    }

    const { appId, workflowId, newUserEmail } = request.data;
    const currentDesignerId = request.auth.uid;

    // 1. Busca el UID del usuario a partir de su email
    let newDesigner;
    try {
      newDesigner = await admin.auth().getUserByEmail(newUserEmail);
    } catch (error) {
      throw new functions.https.HttpsError(
        "not-found",
        `No se encontró un usuario con el email ${newUserEmail}.`,
      );
    }

    const workflowRef = db
      .collection("artifacts")
      .doc(appId)
      .collection("workflows")
      .doc(workflowId);
    const workflowDoc = await workflowRef.get();
    if (!workflowDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "El workflow no existe.",
      );
    }
    const metadata = workflowDoc.data().metadata;

    // 2. Valida que quien hace la invitación ya sea un diseñador
    if (!metadata.designerIds.includes(currentDesignerId)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "No tienes permisos para añadir colaboradores.",
      );
    }

    // 3. Añade el nuevo UID al arreglo usando 'arrayUnion' para evitar duplicados
    await workflowRef.update({
      "metadata.designerIds": admin.firestore.FieldValue.arrayUnion(
        newDesigner.uid,
      ),
    });

    return {
      success: true,
      message: `Usuario ${newUserEmail} añadido como diseñador.`,
    };
  },
);

/**
 * Un diseñador elimina a otro diseñador de un workflow.
 */
exports.removeDesignerFromWorkflow = onCall(
  {
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Debes estar autenticado.",
      );
    }
    const { appId, workflowId, designerIdToRemove } = request.data;
    const currentUserId = request.auth.uid;
    const workflowRef = db
      .collection("artifacts")
      .doc(appId)
      .collection("workflows")
      .doc(workflowId);

    const workflowDoc = await workflowRef.get();
    if (!workflowDoc.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "El workflow no existe.",
      );
    }
    const metadata = workflowDoc.data().metadata;

    if (!metadata.designerIds.includes(currentUserId)) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "No tienes permisos para eliminar colaboradores.",
      );
    }
    if (metadata.designerIds.length <= 1) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "No se puede eliminar al último diseñador del workflow.",
      );
    }

    await workflowRef.update({
      "metadata.designerIds":
        admin.firestore.FieldValue.arrayRemove(designerIdToRemove),
    });

    return { success: true, message: "Diseñador eliminado del workflow." };
  },
);

/**
 * Un diseñador asigna un revisor a un workflow y se cambia el estado a pending_review.
 */
exports.assignReviewerToWorkflow = onCall(
  {
    cors: true,
  },
  async (request) => {
    console.log("assignReviewerToWorkflow STARTED");
    console.log("Data received:", request.data);

    if (!request.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "You must be authenticated.",
      );
    }

    const { appId, workflowId, reviewerId } = request.data;
    const currentUserId = request.auth.uid;

    const workflowRef = db
      .collection("artifacts")
      .doc(appId)
      .collection("workflows")
      .doc(workflowId);

    try {
      const workflowDoc = await workflowRef.get();

      if (!workflowDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Workflow not found.",
        );
      }

      const data = workflowDoc.data();

      if (!data.metadata) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Workflow document does not have valid metadata structure.",
        );
      }

      const metadata = data.metadata;

      if (!metadata.designerIds.includes(currentUserId)) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "You don't have permissions to assign a reviewer.",
        );
      }

      const allowedStatuses = ["draft", "changes_requested"];
      if (!allowedStatuses.includes(metadata.status)) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `You can only assign a reviewer to a workflow in 'draft' or 'changes_requested' status. Current status: ${metadata.status}`,
        );
      }

      console.log(
        "Updating reviewer to:",
        reviewerId,
        "and status to 'pending_review'",
      );

      // Actualizar tanto el revisor como el estado
      await workflowRef.update({
        "metadata.assignedReviewerId": reviewerId,
        "metadata.status": "pending_review", // Cambiar a pending_review
        "metadata.lastModifiedBy": currentUserId,
        "metadata.lastModifiedAt": admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log("Reviewer assigned and status updated to 'pending_review'");
      return {
        success: true,
        message:
          "Reviewer assigned and workflow status changed to 'pending review'.",
      };
    } catch (error) {
      console.error("Error in assignReviewerToWorkflow:", error);
      throw new functions.https.HttpsError(
        "internal",
        error.message || "An internal error occurred.",
      );
    }
  },
);
/* ===========================
 * Firebase Function: compileXML
 * Genera workflows XML con parámetros por nodo y variables de PLC
 * =========================== */

setGlobalOptions({
  region: "us-central1",
  memory: "256MiB",
  timeoutSeconds: 60,
  concurrency: 10,
  minInstances: 0,
});

/* --- Validador --- */
function validateWorkflow(wf) {
  const errors = [];
  if (!wf || !Array.isArray(wf.nodes) || !Array.isArray(wf.connections)) {
    return { ok: false, errors: ['Se esperan "nodes[]" y "connections[]"'] };
  }
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

/* --- Helpers XML --- */
const TYPE_TO_XML = {
  begin: "BeginElement",
  start: "BeginElement",
  end: "EndElement",
};
const mapTypeToXml = (t) =>
  TYPE_TO_XML[String(t || "").toLowerCase()] || t || "NodeDefinitionName";
const esc = (s = "") =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

/* --- CORS --- */
function setCors(res, origin) {
  res.set("Access-Control-Allow-Origin", origin || "*");
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Credentials", "true");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
}

/* --- HTTP Function XML --- */
exports.compileXML = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "256MiB",
    concurrency: 10,
  },
  async (req, res) => {
    const origin = req.get("Origin") || "*";
    setCors(res, origin);

    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST")
      return res.status(405).send("Method Not Allowed");

    // --- Parseo del body ---
    let wf = req.body;
    if (typeof wf === "string") {
      try {
        wf = JSON.parse(wf);
      } catch {
        return res
          .status(400)
          .json({ message: "Body debe ser JSON válido", errors: [] });
      }
    }

    // --- Validación ---
    const { ok, errors } = validateWorkflow(wf);
    if (!ok)
      return res.status(400).json({ message: "Fallo de compilación", errors });

    /* ===============================
     * Generación del XML
     * =============================== */

    // --- Nodos (con Parameters por nodo) ---
    const nodesXml = (wf.nodes || [])
      .map((n) => {
        const typeXml = mapTypeToXml(n.type);
        const name = n.name || n.type || "Node";

        // Begin/End self-closing
        if (typeXml === "BeginElement") {
          return `    <Node id="${esc(n.id)}" type="BeginElement" name="Begin"/>`;
        }
        if (typeXml === "EndElement") {
          return `    <Node id="${esc(n.id)}" type="EndElement" name="End"/>`;
        }

        // Aplanar parámetros
        const flatParams = (() => {
          const p = n.parameters;
          if (!p || typeof p !== "object") return [];
          const out = [];
          for (const group of Object.values(p)) {
            if (Array.isArray(group)) {
              for (const x of group) {
                if (x && (x.name || x.value || x.units)) {
                  out.push({
                    name: x.name ?? "",
                    value: x.value ?? "",
                    unit: x.units ?? x.unit ?? "",
                    dataType: x.type ?? "",
                    defaultValue: x.defaultValue ?? "",
                  });
                }
              }
            }
          }
          return out;
        })();

        const paramsXml = flatParams.length
          ? `      <Parameters>
${flatParams
  .map((p) => {
    const dt = p.dataType ? ` dataType="${esc(p.dataType)}"` : "";
    const dv = p.defaultValue ? ` defaultValue="${esc(p.defaultValue)}"` : "";
    return `        <Parameter name="${esc(p.name)}" value="${esc(p.value)}" unit="${esc(p.unit)}"${dt}${dv}/>`;
  })
  .join("\n")}
      </Parameters>
`
          : "";

        // Asignaciones opcionales
        let assigns = "";
        if (n.equipmentId)
          assigns += `      <Equipment assignedId="${esc(n.equipmentId)}"/>\n`;
        if (n.materialId)
          assigns += `      <Material assignedId="${esc(n.materialId)}"/>\n`;
        if (n.personnelId)
          assigns += `      <Personnel assignedId="${esc(n.personnelId)}"/>\n`;
        if (n.workInstructionId)
          assigns += `      <WorkInstruction assignedId="${esc(n.workInstructionId)}"/>\n`;
        if (n.elementName)
          assigns += `      <Element name="${esc(n.elementName)}"/>\n`;
        if (n.procedurePhase)
          assigns += `      <ProcedurePhase name="${esc(n.procedurePhase)}"/>\n`;
        if (n.operation)
          assigns += `      <Operation name="${esc(n.operation)}"/>\n`;

        if (!paramsXml && !assigns) {
          return `    <Node id="${esc(n.id)}" type="${esc(typeXml)}" name="${esc(name)}"/>`;
        }
        return `    <Node id="${esc(n.id)}" type="${esc(typeXml)}" name="${esc(name)}">
${paramsXml}${assigns}    </Node>`;
      })
      .join("\n");

    // --- Conexiones ---
    const connsXml = (wf.connections || [])
      .map((c) => `    <Connection from="${esc(c.from)}" to="${esc(c.to)}"/>`)
      .join("\n");

    // --- Tags (a partir de TODOS los parámetros de TODOS los nodos) ---
    let allParams = [];
    try {
      const seen = new Set();
      (wf.nodes || []).forEach((node) => {
        const p = node.parameters;
        if (!p || typeof p !== "object") return;
        for (const group of Object.values(p)) {
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
    const workflowXml = `
  <Workflow id="${esc(wf.id || "W-001")}" name="${esc(wf.workflowName || wf.name || "Workflow")}" version="${esc(wf.version || "1.0")}">
    <Nodes>
${nodesXml}
    </Nodes>
    <Connections>
${connsXml}
    </Connections>
  </Workflow>`;

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

      const fromNode = orderedForSfc.find((n) => n.id === c.from);
      const toNode = orderedForSfc.find((n) => n.id === c.to);

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

    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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

    // --- Respuesta como archivo XML descargable ---
    res.setHeader("Content-Type", "application/xml; charset=utf-8");

    const rawName = wf.workflowName || wf.name || wf.id || "workflow";
    let safeName = String(rawName)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_.-]+/g, "_");

    if (!safeName.toLowerCase().endsWith(".xml")) safeName += ".xml";

    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    res.status(200).send(xml);
  },
);
