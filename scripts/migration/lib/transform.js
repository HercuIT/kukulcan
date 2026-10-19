// Transformaciones puras Firestore → Postgres para la migración (sin E/S, para poder probarlas).
const crypto = require("node:crypto");

const STATUSES = new Set([
  "draft",
  "pending_review",
  "changes_requested",
  "approved",
]);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Firestore Timestamp, {seconds}/{_seconds}, Date o cadena → ISO 8601 (o null).
function toIso(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  const seconds = value.seconds ?? value._seconds;
  if (typeof seconds === "number") {
    const nanos = value.nanoseconds ?? value._nanoseconds ?? 0;
    return new Date(seconds * 1000 + Math.floor(nanos / 1e6)).toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Firebase UID → UUID de Supabase. Los UID sin mapeo se acumulan en `missing`.
function mapUid(uidMap, uid, missing) {
  if (uid === null || uid === undefined || uid === "") return null;
  const id = uidMap[uid];
  if (!id) missing.add(uid);
  return id || null;
}

/**
 * Un documento de artifacts/manufacturing-suite-v1/workflows/{id} (más su subcolección
 * history) → la fila de workflows, sus filas de workflow_designers y de workflow_history.
 */
function transformWorkflow(legacyId, data, historyDocs, uidMap) {
  const missing = new Set();
  const errors = [];
  const m = data.metadata || {};
  const uid = (value) => mapUid(uidMap, value, missing);

  const status = m.status || "draft";
  if (!STATUSES.has(status)) {
    errors.push(`${legacyId}: unknown status "${status}"`);
  }
  if (!m.createdBy) errors.push(`${legacyId}: metadata.createdBy is missing`);

  const workflow = {
    legacy_id: legacyId,
    name: data.name || legacyId,
    nodes: data.content?.nodes || [],
    status,
    version: Number.isInteger(m.version) ? m.version : 1,
    checkout_description: m.checkoutDescription ?? null,
    assigned_reviewer_id: uid(m.assignedReviewerId),
    approved_by: uid(m.approvedBy),
    deployed_by: uid(m.deployedBy),
    created_by: uid(m.createdBy),
    created_at: toIso(m.createdAt) || new Date(0).toISOString(),
    last_modified_by: uid(m.lastModifiedBy),
    last_modified_at:
      toIso(m.lastModifiedAt) ||
      toIso(m.createdAt) ||
      new Date(0).toISOString(),
  };

  const designerIds = [...new Set(m.designerIds || [])];
  const designers = designerIds
    .map((id) => uid(id))
    .filter(Boolean)
    .map((user_id) => ({ user_id }));

  const history = [
    ...(m.history || []).map((h) => ({
      kind: "checkout",
      description: h.description ?? null,
      user_id: uid(h.userId),
      created_at: toIso(h.timestamp),
    })),
    ...(historyDocs || []).map((h) => ({
      kind: "changes_requested",
      description: h.comments ?? null,
      user_id: uid(h.userId),
      created_at: toIso(h.timestamp),
    })),
  ].map((h) => ({
    ...h,
    created_at: h.created_at || workflow.last_modified_at,
  }));

  return { workflow, designers, history, missing, errors };
}

// userId que el servidor escribía cuando no había usuario; no es un UID de Firebase.
const NO_USER_IDS = new Set(["unknown"]);

/**
 * Un documento de server_logs/{id} → una fila de server_logs.
 * Los UID de Firebase sin mapeo se acumulan en `missing` (como en transformWorkflow)
 * para que la migración se detenga antes de escribir.
 */
function transformLog(docId, data, uidMap, missing = new Set()) {
  const { level, timestamp, event, requestId, workflowId, userId, ...rest } =
    data;
  const requestIdValue = requestId || docId;
  let userIdValue = null;
  if (userId) {
    if (NO_USER_IDS.has(userId)) userIdValue = userId;
    else userIdValue = mapUid(uidMap, userId, missing);
  }
  return {
    level: ["info", "warn", "error"].includes(level) ? level : "info",
    event: event ?? null,
    request_id: UUID_RE.test(requestIdValue) ? requestIdValue : null,
    workflow_id: workflowId ?? null,
    user_id: userIdValue,
    details: { ...rest, firestore_id: docId },
    created_at: toIso(timestamp) || new Date(0).toISOString(),
  };
}

// JSON con claves ordenadas: jsonb reordena claves, así que el checksum no debe depender del orden.
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

const checksum = (value) =>
  crypto.createHash("sha256").update(canonicalJson(value)).digest("hex");

module.exports = {
  toIso,
  mapUid,
  transformWorkflow,
  transformLog,
  canonicalJson,
  checksum,
};
