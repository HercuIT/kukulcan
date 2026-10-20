import { supabase } from "./supabaseClient";
import {
  cleanNodes,
  dropDanglingConnections,
  profileToUser,
  rowToWorkflow,
  toAppError,
} from "./mappers";

// Cada workflow viene con su equipo de diseño y su historial, para devolver la forma legada.
const WORKFLOW_SELECT =
  "*, workflow_designers(user_id), workflow_history(kind, description, user_id, created_at)";

const throwIfError = ({ data, error }) => {
  if (error) throw toAppError(error);
  return data;
};

/**
 * Crea un workflow en draft y devuelve su id. El id se genera aquí para no necesitar
 * RETURNING: la política de lectura depende de workflow_designers, que el trigger
 * llena después del insert.
 */
export async function createWorkflow({ name, nodes, connections = [] }) {
  const id = crypto.randomUUID();
  throwIfError(
    await supabase.from("workflows").insert({
      id,
      name,
      nodes: cleanNodes(nodes),
      connections: cleanNodes(dropDanglingConnections(connections, nodes)),
    }),
  );
  return id;
}

// Guarda el contenido. El trigger sube la versión y sella fecha y autor.
export async function saveWorkflow(id, { nodes, connections, name }) {
  const fields = { nodes: cleanNodes(nodes) };
  // Nunca se guarda una conexión hacia un nodo borrado.
  if (connections !== undefined)
    fields.connections = cleanNodes(
      dropDanglingConnections(connections, nodes),
    );
  if (name !== undefined) fields.name = name;
  const rows = throwIfError(
    await supabase.from("workflows").update(fields).eq("id", id).select("id"),
  );
  // RLS filtra sin error: cero filas significa sin permiso o estado no editable.
  if (!rows || rows.length === 0) {
    throw toAppError({
      code: "42501",
      message: "No tienes permisos para actualizar este workflow.",
    });
  }
}

export async function getWorkflow(id) {
  const row = throwIfError(
    await supabase
      .from("workflows")
      .select(WORKFLOW_SELECT)
      .eq("id", id)
      .maybeSingle(),
  );
  return rowToWorkflow(row);
}

// Deployers: workflows aprobados. Resto: donde el usuario es diseñador o revisor asignado.
export async function listMyWorkflows(role) {
  const request =
    role === "deployer"
      ? supabase
          .from("workflows")
          .select(WORKFLOW_SELECT)
          .eq("status", "approved")
      : supabase.rpc("my_workflows").select(WORKFLOW_SELECT);
  const rows = throwIfError(await request);
  return (rows || []).map(rowToWorkflow);
}

/**
 * Llama a callback(workflow | null) con el estado actual y en cada cambio de la fila.
 * Las RPC de colaboradores también tocan la fila, así que el equipo se refresca igual.
 * Devuelve la función para cancelar la suscripción.
 */
export function subscribeToWorkflow(id, callback, onError = console.error) {
  let active = true;
  const load = () =>
    getWorkflow(id)
      .then((workflow) => active && callback(workflow))
      .catch((err) => active && onError(err));

  const channel = supabase
    .channel(`workflow-${id}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "workflows",
        filter: `id=eq.${id}`,
      },
      load,
    )
    .subscribe();
  load();

  return () => {
    active = false;
    supabase.removeChannel(channel);
  };
}

// Todos los perfiles (para mostrar correos) con la marca de revisor.
export async function listUsers() {
  const rows = throwIfError(
    await supabase.from("profiles").select("id, email, reviewer"),
  );
  return (rows || []).map(profileToUser);
}

// --- RPC: reemplazan a las Cloud Functions ---

const rpc = async (fn, args) => throwIfError(await supabase.rpc(fn, args));

export const submitForReview = (wf, reviewer) =>
  rpc("submit_for_review", { wf, reviewer: reviewer || null });

export const assignReviewer = (wf, reviewer) =>
  rpc("assign_reviewer", { wf, reviewer: reviewer || null });

export const approveWorkflow = (wf) => rpc("approve_workflow", { wf });

export const requestChanges = (wf, comment = null) =>
  rpc("request_changes", { wf, comment });

export const addDesigner = (wf, email) => rpc("add_designer", { wf, email });

export const removeDesigner = (wf, member) =>
  rpc("remove_designer", { wf, member });

export const checkoutWorkflow = (wf, description) =>
  rpc("checkout_workflow", { wf, description });

/**
 * Compila el workflow con la Edge Function compile-xml y devuelve el XML como Blob.
 * Si la compilación falla, lanza un Error con el mensaje y una línea "- error" por cada error.
 */
export async function compileWorkflow(workflow) {
  const { data, error } = await supabase.functions.invoke("compile-xml", {
    body: workflow,
  });
  if (error) {
    let details = {};
    try {
      details = await error.context.json();
    } catch {
      details = {};
    }
    const errs = Array.isArray(details.errors) ? details.errors : [];
    const list = errs.length ? "\n- " + errs.join("\n- ") : "";
    throw new Error(`${details.message || error.message}${list}`);
  }
  return data instanceof Blob
    ? data
    : new Blob([data], { type: "application/xml" });
}
