import { supabase } from "./supabaseClient";
import { rowToDefinition, toAppError } from "./mappers";

// Biblioteca de User Created Node Definitions (WFPR-003): un árbol sin límite de profundidad.
// Todos los recorridos son iterativos para que un árbol de miles de niveles no agote la pila.

const throwIfError = ({ data, error }) => {
  if (error) throw toAppError(error);
  return data;
};

export async function listDefinitions() {
  const rows = throwIfError(
    await supabase
      .from("user_definitions")
      .select("*")
      .order("position", { ascending: true }),
  );
  return (rows || []).map(rowToDefinition);
}

const byPosition = (a, b) =>
  a.position - b.position ||
  a.name.localeCompare(b.name) ||
  String(a.id).localeCompare(String(b.id));

/**
 * Filas planas → { roots, byId }. Cada nodo es la definición con `children` ordenados por
 * `position`. Una fila cuyo padre no existe se muestra en la raíz (y se avisa en consola).
 */
export function buildDefinitionTree(definitions = []) {
  const byId = new Map();
  for (const d of definitions) byId.set(d.id, { ...d, children: [] });
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent) {
      parent.children.push(node);
    } else {
      if (node.parentId) {
        console.warn("Definición huérfana (su padre no existe):", node.id);
      }
      roots.push(node);
    }
  }
  roots.sort(byPosition);
  for (const node of byId.values()) node.children.sort(byPosition);
  return { roots, byId };
}

/**
 * Filas visibles del panel en orden (pre-orden), entrando solo en los nodos expandidos.
 * Devuelve [{ type, node, depth }] con depth 0 para los de nivel superior:
 * - type "definition": la fila de una definición;
 * - type "groups": después de los hijos de una definición de usuario expandida, el lugar de
 *   sus grupos (Parameters, Equipment, …).
 * keepIds (opcional): solo esas definiciones (p. ej. coincidencias de búsqueda y sus ancestros).
 */
export function visibleRows(
  roots = [],
  expandedIds = new Set(),
  keepIds = null,
) {
  const out = [];
  const stack = [...roots]
    .reverse()
    .map((node) => ({ type: "definition", node, depth: 0 }));
  while (stack.length) {
    const entry = stack.pop();
    if (entry.type === "groups") {
      out.push(entry);
      continue;
    }
    const { node, depth } = entry;
    if (keepIds && !keepIds.has(node.id)) continue;
    out.push(entry);
    if (!expandedIds.has(node.id)) continue;
    if (node.kind === "user") {
      stack.push({ type: "groups", node, depth: depth + 1 });
    }
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push({
        type: "definition",
        node: node.children[i],
        depth: depth + 1,
      });
    }
  }
  return out;
}

// Ids de las definiciones cuyo nombre contiene `text` y de todos sus ancestros (para la búsqueda).
export function searchKeepIds(byId, text) {
  const needle = text.trim().toLowerCase();
  const keep = new Set();
  if (!needle) return keep;
  for (const node of byId.values()) {
    if (!node.name.toLowerCase().includes(needle)) continue;
    let current = node;
    while (current && !keep.has(current.id)) {
      keep.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : null;
    }
  }
  return keep;
}

// Todos los nodos de un subárbol en pre-orden, con su profundidad relativa (0 = la raíz dada).
export function subtreeInOrder(root) {
  const out = [];
  const stack = [{ node: root, depth: 0 }];
  while (stack.length) {
    const { node, depth } = stack.pop();
    out.push({ node, depth });
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push({ node: node.children[i], depth: depth + 1 });
    }
  }
  return out;
}

export function subtreeIds(root) {
  return new Set(subtreeInOrder(root).map(({ node }) => node.id));
}

// Nombres desde la raíz hasta la definición ("Line 1", "Mixer A", "Dosing").
export function pathOf(byId, id) {
  const names = [];
  const seen = new Set();
  let node = byId.get(id);
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    names.unshift(node.name);
    node = node.parentId ? byId.get(node.parentId) : null;
  }
  return names;
}

// Clave estable de un elemento predefinido del panel (categoría ISA-88 o par Phase/Operation).
export function predefinedKeyFor(item) {
  if (item.procedurePhase && item.operation) {
    return `pair:${item.procedurePhase}|${item.operation}`;
  }
  return `level:${item.label}`;
}

const CANVAS_STEP_Y = 100;
const CANVAS_INDENT_X = 40;
const CANVAS_MAX_INDENT = 8;

/**
 * "Expandir al soltar" (WFPR-003, opción B): la definición y todos sus descendientes como nodos
 * del lienzo, en pre-orden, uno debajo del otro y conectados en cadena.
 * - origin: { x, y } donde se soltó; basePath: nombres de los ancestros de `root`.
 * - makeId(i): id único para el nodo i.
 * Devuelve { nodes, connections } listos para agregar al lienzo.
 */
export function expandForCanvas(root, { x = 0, y = 0, basePath = [], makeId }) {
  const nodes = [];
  const stack = [{ node: root, depth: 0, path: basePath }];
  while (stack.length) {
    const { node, depth, path } = stack.pop();
    const ownPath = [...path, node.name];
    const position = {
      id: makeId(nodes.length),
      x: x + Math.min(depth, CANVAS_MAX_INDENT) * CANVAS_INDENT_X,
      y: y + nodes.length * CANVAS_STEP_Y,
    };
    if (node.kind === "predefined") {
      const p = node.predefined || {};
      nodes.push({
        ...position,
        label: p.label || node.name,
        type: p.type || p.label || node.name,
        ...(p.procedurePhase ? { procedurePhase: p.procedurePhase } : {}),
        ...(p.operation ? { operation: p.operation } : {}),
      });
    } else {
      nodes.push({
        ...position,
        label: `${node.name} v ${node.version}`,
        type: node.name,
        parameters: JSON.parse(JSON.stringify(node.parameters || [])),
        implementation: { ...(node.implementation || {}) },
        definitionId: node.id,
        definitionPath: ownPath,
      });
    }
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push({ node: node.children[i], depth: depth + 1, path: ownPath });
    }
  }
  const connections = [];
  for (let i = 0; i + 1 < nodes.length; i++) {
    connections.push({
      id: `${nodes[i].id}-to-${nodes[i + 1].id}`,
      from: nodes[i].id,
      to: nodes[i + 1].id,
      fromPort: "bottom",
      toPort: "top",
    });
  }
  return { nodes, connections };
}

// --- RPC ---

const rpc = async (fn, args) => throwIfError(await supabase.rpc(fn, args));

export const createDefinition = (parentId, fields) =>
  rpc("create_definition", { parent: parentId ?? null, fields });

export const addPredefinedChild = (parentId, predefined) =>
  rpc("add_predefined_child", { parent: parentId ?? null, predefined });

export const updateDefinition = (id, fields) =>
  rpc("update_definition", { def: id, fields });

export const moveDefinition = (id, newParentId, newIndex = null) =>
  rpc("move_definition", {
    def: id,
    new_parent: newParentId ?? null,
    new_index: newIndex,
  });

export const deleteDefinition = (id, keepChildren = false) =>
  rpc("delete_definition", { def: id, keep_children: keepChildren });

/**
 * Llama a callback(definitions) ahora y cada vez que alguien cambia la biblioteca (Realtime).
 * Devuelve la función para cancelar la suscripción.
 */
export function subscribeToDefinitions(callback, onError = console.error) {
  let active = true;
  // Varias recargas pueden estar en vuelo y responder desordenadas: solo cuenta la última pedida,
  // para que una respuesta vieja no pise una más nueva.
  let latest = 0;
  const load = () => {
    const seq = ++latest;
    const current = () => active && seq === latest;
    return listDefinitions()
      .then((defs) => current() && callback(defs))
      .catch((err) => current() && onError(err));
  };

  const channel = supabase
    .channel("user-definitions")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_definitions" },
      load,
    )
    .subscribe();
  load();

  return () => {
    active = false;
    supabase.removeChannel(channel);
  };
}
