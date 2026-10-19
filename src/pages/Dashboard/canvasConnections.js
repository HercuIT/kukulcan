// Conexiones de un workflow abierto. Los guardados antes de WFPR-003 no tienen (connections
// null), así que se regeneran las aristas por defecto Begin → Connection 1 → End, como hace el
// lienzo al montarse. Un arreglo guardado se respeta aunque esté vacío: el usuario borró las aristas.
export function connectionsForLoadedWorkflow(content) {
  if (Array.isArray(content?.connections)) return content.connections;
  const nodes = content?.nodes || [];
  const begin = nodes.find((n) => n.type === "start" || n.id === "begin");
  const conn = nodes.find(
    (n) => n.type === "connection" || n.id === "connection1",
  );
  const end = nodes.find((n) => n.type === "end" || n.id === "end");
  if (!begin || !conn || !end) return [];
  return [
    {
      id: "conn-init-1",
      from: begin.id,
      to: conn.id,
      fromPort: "bottom",
      toPort: "top",
    },
    {
      id: "conn-init-2",
      from: conn.id,
      to: end.id,
      fromPort: "bottom",
      toPort: "top",
    },
  ];
}
