#!/usr/bin/env node
/**
 * Paso 4 (día del cutover): manda a cada usuario importado el correo para crear su contraseña.
 *
 *   SITE_URL=https://kukulcan.example.com node send-password-resets.js [--dry-run] [--delay-ms=1000]
 *
 * Los usuarios importados no tienen contraseña (Supabase no puede verificar las de Firebase).
 * El enlace del correo inicia sesión y abre <SITE_URL>/set-password, donde la app pide la
 * contraseña nueva. <SITE_URL>/set-password debe estar en las Redirect URLs de Supabase Auth, y el
 * proyecto debe usar SMTP propio (el correo integrado de Supabase tiene un límite muy bajo).
 *
 * Solo considera usuarios con app_metadata.firebase_uid (los que import-users.js creó o reutilizó).
 * Se puede repetir: un usuario que ya creó su contraseña simplemente recibe otro enlace.
 */
const { getSupabase, unwrap } = require("./lib/clients");

async function listImportedUsers(supabase) {
  const imported = [];
  for (let page = 1; ; page++) {
    const { users } = unwrap(
      await supabase.auth.admin.listUsers({ page, perPage: 1000 }),
      "listUsers",
    );
    imported.push(
      ...users.filter((u) => u.email && u.app_metadata?.firebase_uid),
    );
    if (users.length < 1000) return imported;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const delayArg = process.argv.find((a) => a.startsWith("--delay-ms="));
  const delayValue = delayArg ? delayArg.split("=")[1] : "1000";
  // Un valor inválido (p. ej. --delay-ms=abc → NaN, o vacío → 0) quitaría la pausa y chocaría
  // con los límites de Auth/SMTP: solo se aceptan enteros de milisegundos.
  const delayMs = Number(delayValue);
  if (!/^\d+$/.test(delayValue) || !Number.isSafeInteger(delayMs)) {
    console.error(
      "--delay-ms debe ser un número de milisegundos mayor o igual a 0.",
    );
    process.exit(1);
  }
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) {
    console.error("Falta la variable de entorno SITE_URL.");
    process.exit(1);
  }
  const redirectTo = `${siteUrl.replace(/\/+$/, "")}/set-password`;

  const supabase = getSupabase();
  const users = await listImportedUsers(supabase);
  console.log(`${users.length} usuarios importados. Enlace: ${redirectTo}`);
  if (dryRun) return;

  const failed = [];
  for (const user of users) {
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo,
    });
    if (error) failed.push(`${user.email}: ${error.message}`);
    await sleep(delayMs);
  }

  console.log(`${users.length - failed.length} correos enviados.`);
  if (failed.length) {
    failed.forEach((f) => console.error(f));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
