#!/usr/bin/env node
/**
 * Paso 2: copia workflows (con su equipo e historial) y server_logs de Firestore a Postgres.
 *
 *   node migrate-data.js [--dry-run] [--skip-logs]
 *
 * Reescribe todos los UID de Firebase con out/uid_map.json. Si algún UID no tiene mapeo o un
 * documento no es válido, no escribe nada y lista los problemas. Se puede repetir: los workflows
 * se identifican por legacy_id y su equipo e historial se reemplazan.
 */
const {
  getFirestore,
  getSupabase,
  workflowsCollection,
  readUidMap,
  unwrap,
} = require("./lib/clients");
const { transformWorkflow, transformLog } = require("./lib/transform");

const BATCH = 500;

async function readWorkflows(firestore, uidMap) {
  const snapshot = await workflowsCollection(firestore).get();
  const results = [];
  for (const doc of snapshot.docs) {
    const history = await doc.ref.collection("history").get();
    results.push(
      transformWorkflow(
        doc.id,
        doc.data(),
        history.docs.map((h) => h.data()),
        uidMap,
      ),
    );
  }
  return results;
}

async function writeWorkflow(supabase, { workflow, designers, history }) {
  const [{ id }] = unwrap(
    await supabase
      .from("workflows")
      .upsert(workflow, { onConflict: "legacy_id" })
      .select("id"),
    `workflow ${workflow.legacy_id}`,
  );
  // El trigger agrega al creador; el equipo real es el de Firestore.
  unwrap(
    await supabase.from("workflow_designers").delete().eq("workflow_id", id),
    "designers",
  );
  unwrap(
    await supabase.from("workflow_history").delete().eq("workflow_id", id),
    "history",
  );
  if (designers.length) {
    unwrap(
      await supabase
        .from("workflow_designers")
        .insert(designers.map((d) => ({ ...d, workflow_id: id }))),
      `designers ${workflow.legacy_id}`,
    );
  }
  if (history.length) {
    unwrap(
      await supabase
        .from("workflow_history")
        .insert(history.map((h) => ({ ...h, workflow_id: id }))),
      `history ${workflow.legacy_id}`,
    );
  }
}

async function migrateLogs(firestore, supabase, uidMap) {
  const snapshot = await firestore.collection("server_logs").get();
  const rows = snapshot.docs.map((d) => transformLog(d.id, d.data(), uidMap));
  unwrap(
    await supabase
      .from("server_logs")
      .delete()
      .not("details->>firestore_id", "is", null),
    "clear migrated logs",
  );
  for (let i = 0; i < rows.length; i += BATCH) {
    unwrap(
      await supabase.from("server_logs").insert(rows.slice(i, i + BATCH)),
      "server_logs",
    );
  }
  return rows.length;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const skipLogs = process.argv.includes("--skip-logs");
  const uidMap = readUidMap();
  const firestore = getFirestore();

  const results = await readWorkflows(firestore, uidMap);
  const missing = new Set(results.flatMap((r) => [...r.missing]));
  const errors = results.flatMap((r) => r.errors);
  if (missing.size || errors.length) {
    if (missing.size)
      console.error("UID sin mapeo en uid_map.json:", [...missing].join(", "));
    errors.forEach((e) => console.error(e));
    console.error("No se escribió nada.");
    process.exit(1);
  }
  console.log(`${results.length} workflows listos para migrar.`);
  if (dryRun) return;

  const supabase = getSupabase();
  for (const result of results) await writeWorkflow(supabase, result);
  console.log(`${results.length} workflows migrados.`);

  if (!skipLogs) {
    console.log(`${await migrateLogs(firestore, supabase, uidMap)} logs migrados.`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
