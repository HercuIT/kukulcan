#!/usr/bin/env node
/**
 * Paso 1: importa los usuarios de Firebase Auth a Supabase Auth y copia sus roles.
 *
 *   firebase auth:export users.json --format=json --project xicotencatl
 *   node import-users.js users.json [--dry-run]
 *
 * Crea cada usuario con email_confirm (sin contraseña: cada uno la restablece por correo),
 * copia roles/{firebase_uid} a profiles y escribe out/uid_map.json (firebase_uid → uuid).
 * Se puede repetir: los usuarios que ya existen se reutilizan por email.
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

    // El trigger on_auth_user_created ya creó el perfil; aquí se copian los roles.
    const roles = (await firestore.doc(`roles/${fbUser.localId}`).get()).data();
    unwrap(
      await supabase
        .from("profiles")
        .update({
          designer: roles?.designer === true,
          reviewer: roles?.reviewer === true,
          deployer: roles?.deployer === true,
        })
        .eq("id", id),
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
