#!/usr/bin/env node
/**
 * Paso 3: compara Firestore con Postgres. Sale con código 1 si algo no coincide.
 *
 *   node verify.js
 *
 * Revisa conteos (workflows, diseñadores, historial, logs) y, por workflow, el checksum de
 * los nodos, el estado, la versión y el equipo.
 */
const {
  getFirestore,
  getSupabase,
  workflowsCollection,
  readUidMap,
  unwrap,
} = require("./lib/clients");
const { transformWorkflow, checksum } = require("./lib/transform");

async function count(supabase, table, filter) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) query = filter(query);
  const { count: n, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return n;
}

async function main() {
  const uidMap = readUidMap();
  const firestore = getFirestore();
  const supabase = getSupabase();
  const problems = [];

  const snapshot = await workflowsCollection(firestore).get();
  const expected = new Map();
  let designerTotal = 0;
  let historyTotal = 0;
  for (const doc of snapshot.docs) {
    const history = await doc.ref.collection("history").get();
    const t = transformWorkflow(
      doc.id,
      doc.data(),
      history.docs.map((h) => h.data()),
      uidMap,
    );
    expected.set(doc.id, t);
    designerTotal += t.designers.length;
    historyTotal += t.history.length;
  }

  const rows = unwrap(
    await supabase
      .from("workflows")
      .select("legacy_id, nodes, status, version, workflow_designers(user_id)")
      .not("legacy_id", "is", null),
    "workflows",
  );
  const actual = new Map(rows.map((r) => [r.legacy_id, r]));

  for (const [legacyId, t] of expected) {
    const row = actual.get(legacyId);
    if (!row) {
      problems.push(`${legacyId}: falta en Postgres`);
      continue;
    }
    if (checksum(row.nodes) !== checksum(t.workflow.nodes))
      problems.push(`${legacyId}: los nodos no coinciden`);
    if (row.status !== t.workflow.status)
      problems.push(`${legacyId}: estado ${row.status} ≠ ${t.workflow.status}`);
    if (row.version !== t.workflow.version)
      problems.push(`${legacyId}: versión ${row.version} ≠ ${t.workflow.version}`);
    const team = row.workflow_designers.map((d) => d.user_id).sort();
    const expectedTeam = t.designers.map((d) => d.user_id).sort();
    if (team.join() !== expectedTeam.join())
      problems.push(`${legacyId}: el equipo de diseño no coincide`);
  }
  for (const legacyId of actual.keys()) {
    if (!expected.has(legacyId))
      problems.push(`${legacyId}: está en Postgres pero no en Firestore`);
  }

  const migratedIds = rows.length;
  const counts = [
    ["workflows", snapshot.size, migratedIds],
    ["workflow_designers", designerTotal, await count(supabase, "workflow_designers")],
    ["workflow_history", historyTotal, await count(supabase, "workflow_history")],
    [
      "server_logs",
      (await firestore.collection("server_logs").count().get()).data().count,
      await count(supabase, "server_logs", (q) =>
        q.not("details->>firestore_id", "is", null),
      ),
    ],
  ];
  console.table(
    counts.map(([table, firestoreCount, postgresCount]) => ({
      table,
      firestore: firestoreCount,
      postgres: postgresCount,
    })),
  );
  counts
    .filter(([, a, b]) => a !== b)
    .forEach(([table, a, b]) => problems.push(`${table}: ${a} en Firestore, ${b} en Postgres`));

  if (problems.length) {
    problems.forEach((p) => console.error(p));
    process.exit(1);
  }
  console.log("Todo coincide.");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
