// Clientes de Firestore (lectura) y Supabase (service role) para los scripts de migración.
// Credenciales solo por variables de entorno; nunca en archivos del repo.
const fs = require("node:fs");
const path = require("node:path");

const OUT_DIR = path.join(__dirname, "..", "out");
const UID_MAP_PATH = path.join(OUT_DIR, "uid_map.json");
const WORKFLOWS_PATH = ["artifacts", "manufacturing-suite-v1", "workflows"];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta la variable de entorno ${name}.`);
    process.exit(1);
  }
  return value;
}

function getFirestore() {
  requireEnv("GOOGLE_APPLICATION_CREDENTIALS");
  const admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID || "xicotencatl",
    });
  }
  return admin.firestore();
}

function getSupabase() {
  const { createClient } = require("@supabase/supabase-js");
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function workflowsCollection(firestore) {
  const [c1, d1, c2] = WORKFLOWS_PATH;
  return firestore.collection(c1).doc(d1).collection(c2);
}

function readUidMap() {
  if (!fs.existsSync(UID_MAP_PATH)) {
    console.error(`No existe ${UID_MAP_PATH}. Corre primero import-users.js.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(UID_MAP_PATH, "utf8"));
}

function writeUidMap(map) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(UID_MAP_PATH, JSON.stringify(map, null, 2) + "\n");
}

// Lanza el error de una respuesta de supabase-js y devuelve sus datos.
function unwrap({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

module.exports = {
  getFirestore,
  getSupabase,
  workflowsCollection,
  readUidMap,
  writeUidMap,
  unwrap,
  UID_MAP_PATH,
};
