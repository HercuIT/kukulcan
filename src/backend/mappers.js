// Conversión entre filas de Postgres y la forma que la UI usaba con Firestore
// ({ id, name, content: { nodes }, metadata: { … } }), y de errores de Supabase a códigos de la app.

// Códigos que la UI ya conocía de Firebase (HttpsError) para los errores de las RPC.
export const ERROR_CODES = {
  28000: "unauthenticated",
  PGRST301: "unauthenticated",
  PGRST303: "unauthenticated",
  42501: "permission-denied",
  P0002: "not-found",
  P0001: "failed-precondition",
};

export const AUTH_ERROR_CODES = {
  invalid_credentials: "invalid-credentials",
  user_already_exists: "email-in-use",
  email_exists: "email-in-use",
  weak_password: "weak-password",
  same_password: "same-password",
};

// Convierte un error de Supabase (PostgREST, Auth o Functions) en un Error con un `code` de la app.
// El mensaje se conserva: las RPC lanzan los mismos mensajes que las Cloud Functions.
export function toAppError(error, fallbackMessage = "Unexpected error") {
  if (!error) return null;
  const appError = new Error(error.message || fallbackMessage);
  appError.code =
    ERROR_CODES[error.code] || AUTH_ERROR_CODES[error.code] || error.code;
  appError.cause = error;
  return appError;
}

// Supabase Auth user → el objeto `user` que reciben los componentes ({ uid, email }).
export function toAppUser(authUser) {
  if (!authUser) return null;
  return { uid: authUser.id, email: authUser.email };
}

function historyEntry(row) {
  return {
    kind: row.kind,
    description: row.description,
    userId: row.user_id,
    created_at: row.created_at,
  };
}

const byCreatedAt = (a, b) => new Date(a.created_at) - new Date(b.created_at);

// Fila de workflows (con workflow_designers y workflow_history embebidos) → forma legada.
export function rowToWorkflow(row) {
  if (!row) return null;
  const history = [...(row.workflow_history || [])].sort(byCreatedAt);
  return {
    id: row.id,
    name: row.name,
    content: { nodes: row.nodes || [] },
    metadata: {
      status: row.status,
      version: row.version,
      createdAt: row.created_at,
      createdBy: row.created_by,
      lastModifiedAt: row.last_modified_at,
      lastModifiedBy: row.last_modified_by,
      designerIds: (row.workflow_designers || []).map((d) => d.user_id),
      assignedReviewerId: row.assigned_reviewer_id ?? null,
      approvedBy: row.approved_by ?? null,
      deployedBy: row.deployed_by ?? null,
      checkoutDescription: row.checkout_description ?? null,
      history: history.filter((h) => h.kind === "checkout").map(historyEntry),
      changeRequests: history
        .filter((h) => h.kind === "changes_requested")
        .map(historyEntry),
    },
  };
}

// Fila de profiles → la forma que usaban los selectores de usuarios y revisores.
export function profileToUser(row) {
  return {
    uid: row.id,
    email: row.email,
    isReviewer: row.reviewer === true,
  };
}

// Quita los valores undefined de cada nodo antes de guardarlo como jsonb.
export function cleanNodes(nodes = []) {
  return nodes.map((node) =>
    Object.fromEntries(
      Object.entries(node).filter(([, value]) => value !== undefined),
    ),
  );
}
