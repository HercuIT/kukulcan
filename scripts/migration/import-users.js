#!/usr/bin/env node
/**
 * Paso 1: importa los usuarios de Firebase Auth a Supabase Auth y copia sus roles.
 *
 *   firebase auth:export users.json --format=json --project xicotencatl
 *   node import-users.js users.json [--dry-run]
 *
 * Crea cada usuario con email_confirm y sin contraseña, copia roles/{firebase_uid} a profiles y
 * escribe out/uid_map.json (firebase_uid → uuid). Se puede repetir: los usuarios que ya existen
 * se reutilizan por email. El día del cutover, send-password-resets.js manda a cada uno el
 * correo para crear su contraseña.
 */
const fs = require("node:fs");
const {
  getFirestore,
  getSupabase,
  writeUidMap,
  unwrap,
  UID_MAP_PATH,
} = require("./lib/clients");

async function listExistingUsers(supabase) {
  const byEmail = new Map();
  for (let page = 1; ; page++) {
    const { users } = unwrap(
      await supabase.auth.admin.listUsers({ page, perPage: 1000 }),
      "listUsers",
    );
    users.forEach((u) => u.email && byEmail.set(u.email.toLowerCase(), u.id));
    if (users.length < 1000) return byEmail;
  }
}

async function main() {
  const [file] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const dryRun = process.argv.includes("--dry-run");
  if (!file) {
    console.error("Uso: node import-users.js users.json [--dry-run]");
    process.exit(1);
  }

  const { users = [] } = JSON.parse(fs.readFileSync(file, "utf8"));
  const withEmail = users.filter((u) => u.email);
  const skipped = users.filter((u) => !u.email).map((u) => u.localId);
  console.log(
    `${users.length} usuarios en el export; ${skipped.length} sin email se omiten.`,
  );
  if (dryRun) return;

  const firestore = getFirestore();
  const supabase = getSupabase();
  const existing = await listExistingUsers(supabase);
  const uidMap = {};
  let created = 0;

  for (const fbUser of withEmail) {
    const email = fbUser.email.toLowerCase();
    let id = existing.get(email);
    if (!id) {
      const { user } = unwrap(
        await supabase.auth.admin.createUser({
          email: fbUser.email,
          email_confirm: true,
          app_metadata: { firebase_uid: fbUser.localId },
        }),
        `createUser ${email}`,
      );
      id = user.id;
      created++;
    }
    uidMap[fbUser.localId] = id;

    // Normalmente el trigger on_auth_user_created ya creó el perfil. El upsert también lo crea
    // si falta (p. ej. usuarios creados antes de aplicar la migración), y .single() hace fallar
    // la importación si no quedó exactamente una fila, para no perder roles en silencio.
    const roles = (await firestore.doc(`roles/${fbUser.localId}`).get()).data();
    unwrap(
      await supabase
        .from("profiles")
        .upsert(
          {
            id,
            email,
            designer: roles?.designer === true,
            reviewer: roles?.reviewer === true,
            deployer: roles?.deployer === true,
          },
          { onConflict: "id" },
        )
        .select("id")
        .single(),
      `profile ${email}`,
    );
  }

  writeUidMap(uidMap);
  console.log(
    `Listo: ${created} creados, ${withEmail.length - created} ya existían. Mapa en ${UID_MAP_PATH}.`,
  );
  if (skipped.length) console.log("Sin email:", skipped.join(", "));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
