#!/usr/bin/env node
/**
 * Paso 2: copia workflows (con su equipo e historial) y server_logs de Firestore a Postgres.
 *
 *   node migrate-data.js [--dry-run] [--skip-logs]
 *
 * Reescribe todos los UID de Firebase con out/uid_map.json. Antes de escribir lee y valida todo
 * (workflows y logs): si algún UID no tiene mapeo o un documento no es válido, no escribe nada y
 * lista los problemas.
 *
 * Cada workflow se escribe en una sola transacción con la RPC migrate_workflow (upsert por
 * legacy_id + reemplazo de equipo e historial). Los logs se insertan marcados con un id de corrida
 * y los de corridas anteriores se borran solo cuando todas las inserciones terminaron. Si algo
 * falla a medias, nada queda incompleto y se puede volver a correr.
 */
const crypto = require("node:crypto");
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

async function readLogs(firestore, uidMap) {
  const missing = new Set();
  const snapshot = await firestore.collection("server_logs").get();
  const rows = snapshot.docs.map((d) =>
    transformLog(d.id, d.data(), uidMap, missing),
  );
  return { rows, missing };
}

async function writeWorkflow(supabase, { workflow, designers, history }) {
  unwrap(
    await supabase.rpc("migrate_workflow", { workflow, designers, history }),
    `workflow ${workflow.legacy_id}`,
  );
}

async function writeLogs(supabase, rows) {
  const runId = crypto.randomUUID();
  const staged = rows.map((row) => ({
    ...row,
    details: { ...row.details, migration_run: runId },
  }));
  for (let i = 0; i < staged.length; i += BATCH) {
    unwrap(
      await supabase.from("server_logs").insert(staged.slice(i, i + BATCH)),
      "server_logs",
    );
  }
  // Solo ahora, con la corrida completa, se borran los logs migrados en corridas anteriores.
  unwrap(
    await supabase
      .from("server_logs")
      .delete()
      .not("details->>firestore_id", "is", null)
      .or(
        `details->>migration_run.is.null,details->>migration_run.neq.${runId}`,
      ),
    "clear previous migrated logs",
  );
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const skipLogs = process.argv.includes("--skip-logs");
  const uidMap = readUidMap();
  const firestore = getFirestore();

  const results = await readWorkflows(firestore, uidMap);
  const logs = skipLogs
    ? { rows: [], missing: new Set() }
    : await readLogs(firestore, uidMap);

  const missing = new Set([
    ...results.flatMap((r) => [...r.missing]),
    ...logs.missing,
  ]);
  const errors = results.flatMap((r) => r.errors);
  if (missing.size || errors.length) {
    if (missing.size)
      console.error("UID sin mapeo en uid_map.json:", [...missing].join(", "));
    errors.forEach((e) => console.error(e));
    console.error("No se escribió nada.");
    process.exit(1);
  }
  console.log(
    `${results.length} workflows${skipLogs ? "" : ` y ${logs.rows.length} logs`} listos para migrar.`,
  );
  if (dryRun) return;

  const supabase = getSupabase();
  for (const result of results) await writeWorkflow(supabase, result);
  console.log(`${results.length} workflows migrados.`);

  if (!skipLogs) {
    await writeLogs(supabase, logs.rows);
    console.log(`${logs.rows.length} logs migrados.`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
