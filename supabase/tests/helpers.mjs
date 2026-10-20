// Utilidades compartidas por las pruebas de base de datos: un Postgres en memoria (PGlite) con lo
// mínimo de Supabase y todas las migraciones aplicadas, y helpers para actuar como cada rol.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "..", "migrations");

// Lo mínimo de Supabase que la migración espera: roles, esquema auth, auth.uid(),
// privilegios por defecto y la publicación de Realtime.
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    email_confirmed_at timestamptz
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  create publication supabase_realtime;
`;

export async function createTestDb() {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of readdirSync(migrationsDir).sort()) {
    await db.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
  }

  const q = (sql, params) => db.query(sql, params);

  // Crea un usuario de auth (el trigger crea su perfil) y le pone los roles dados. Por defecto la
  // cuenta llega confirmada, como las de hoy; { confirmed: false } la deja sin confirmar (HTE-107).
  async function createUser(email, roles = {}, { confirmed = true } = {}) {
    const {
      rows: [{ id }],
    } = await q(
      "insert into auth.users (email, email_confirmed_at) values ($1, $2) returning id",
      [email, confirmed ? new Date().toISOString() : null],
    );
    const sets = Object.keys(roles);
    if (sets.length) {
      await q(
        `update public.profiles set ${sets.map((r, i) => `${r} = $${i + 2}`).join(", ")} where id = $1`,
        [id, ...sets.map((r) => roles[r])],
      );
    }
    return id;
  }

  // Rol y usuario actuales, para restaurarlos al salir: con un `reset role` a secas, una llamada
  // anidada devolvería el resto de la llamada externa al superusuario y se saltaría el RLS.
  async function currentIdentity() {
    const { rows } = await q(
      "select current_user as role, coalesce(current_setting('request.jwt.claim.sub', true), '') as sub",
    );
    return rows[0];
  }

  async function restoreIdentity({ role, sub }) {
    await db.exec(`set role "${role.replace(/"/g, '""')}"`);
    await q("select set_config('request.jwt.claim.sub', $1, false)", [sub]);
  }

  // Ejecuta fn como el usuario dado (rol authenticated) o como anon (uid null).
  async function as(uid, fn) {
    const previous = await currentIdentity();
    await db.exec(`set role ${uid ? "authenticated" : "anon"}`);
    await q("select set_config('request.jwt.claim.sub', $1, false)", [
      uid || "",
    ]);
    try {
      return await fn();
    } finally {
      await restoreIdentity(previous);
    }
  }

  // Ejecuta fn como service_role (lo que usan el servidor y los scripts de migración): sin auth.uid().
  async function asServiceRole(fn) {
    const previous = await currentIdentity();
    await db.exec("set role service_role");
    await q("select set_config('request.jwt.claim.sub', '', false)");
    try {
      return await fn();
    } finally {
      await restoreIdentity(previous);
    }
  }

  return { db, q, createUser, as, asServiceRole };
}

export async function rejectsWith(promise, code, hint) {
  await assert.rejects(promise, (err) => {
    assert.equal(
      err.code,
      code,
      `esperaba ${code}, llegó ${err.code}: ${err.message}`,
    );
    if (hint !== undefined) assert.equal(err.hint, hint);
    return true;
  });
}
