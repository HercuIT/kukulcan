// HTE-107: el perfil se crea al confirmar el correo, no al registrarse.
// Correr con: npm run test:node
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createTestDb, rejectsWith } from "./helpers.mjs";

const migrationsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

let db;
let q;
let as;
let designer;

before(async () => {
  db = await createTestDb();
  ({ q, as } = db);
  designer = await db.createUser("designer@example.com", { designer: true });
});

const profileOf = async (id) =>
  (await q("select * from public.profiles where id = $1", [id])).rows;
const confirm = (id) =>
  q("update auth.users set email_confirmed_at = now() where id = $1", [id]);

async function newWorkflow() {
  const id = crypto.randomUUID();
  await as(designer, () =>
    q("insert into public.workflows (id, name, nodes) values ($1, 'WF', '[]')", [
      id,
    ]),
  );
  return id;
}

describe("HTE-107 profiles: positive", () => {
  test("an unconfirmed sign-up gets no profile until it confirms; then one, without roles", async () => {
    const id = await db.createUser("ana@example.com", {}, { confirmed: false });
    assert.deepEqual(await profileOf(id), []);
    await confirm(id);
    const rows = await profileOf(id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, "ana@example.com");
    assert.equal(rows[0].designer, false);
    assert.equal(rows[0].reviewer, false);
    assert.equal(rows[0].deployer, false);
  });

  test("an account inserted already confirmed (service role, import) gets its profile on insert", async () => {
    const id = await db.createUser("import@example.com");
    assert.equal((await profileOf(id)).length, 1);
  });

  test("once confirmed, the user can be added as a designer", async () => {
    const id = await db.createUser("late@example.com", {}, { confirmed: false });
    await confirm(id);
    const wf = await newWorkflow();
    await as(designer, () =>
      q("select public.add_designer($1, $2)", [wf, "late@example.com"]),
    );
    const { rows } = await q(
      "select 1 from public.workflow_designers where workflow_id = $1 and user_id = $2",
      [wf, id],
    );
    assert.equal(rows.length, 1);
  });
});

describe("HTE-107 profiles: negative", () => {
  test("authenticated and anon can't call the trigger functions directly", async () => {
    for (const uid of [designer, null]) {
      await rejectsWith(
        as(uid, () => q("select public.handle_user_confirmed()")),
        "42501",
      );
      await rejectsWith(
        as(uid, () => q("select public.handle_new_user()")),
        "42501",
      );
    }
  });

  test("an unconfirmed user can't be added as a designer (not found)", async () => {
    await db.createUser("pending@example.com", {}, { confirmed: false });
    const wf = await newWorkflow();
    await rejectsWith(
      as(designer, () =>
        q("select public.add_designer($1, $2)", [wf, "pending@example.com"]),
      ),
      "P0002",
    );
  });

  test("an unconfirmed user isn't listed to other users", async () => {
    await db.createUser("hidden@example.com", {}, { confirmed: false });
    const { rows } = await as(designer, () =>
      q("select email from public.profiles where email = 'hidden@example.com'"),
    );
    assert.deepEqual(rows, []);
  });

  test("the migration refuses to run if a user is unconfirmed and has no profile", async () => {
    // Recrea la situación que vigila el bloque inicial de la migración y lo vuelve a correr.
    const fresh = await createTestDb();
    await fresh.q(
      "insert into auth.users (email, email_confirmed_at) values ('orphan@example.com', null)",
    );
    const file = readdirSync(migrationsDir).find((f) =>
      f.endsWith("_hte_107_profile_on_confirm.sql"),
    );
    const guard = readFileSync(path.join(migrationsDir, file), "utf8").match(
      /do \$\$[\s\S]*?end \$\$;/,
    )[0];
    await assert.rejects(
      fresh.db.exec(guard),
      /HTE-107: hay usuarios sin confirmar y sin perfil/,
    );
  });
});

describe("HTE-107 profiles: edge", () => {
  test("confirming again keeps one profile and leaves its roles alone", async () => {
    const id = await db.createUser("again@example.com", {}, { confirmed: false });
    await confirm(id);
    await q("update public.profiles set reviewer = true where id = $1", [id]);
    await q(
      "update auth.users set email_confirmed_at = now() + interval '1 hour' where id = $1",
      [id],
    );
    const rows = await profileOf(id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].reviewer, true);
  });

  test("a profile that already exists when the confirmation lands causes no error or duplicate", async () => {
    const id = await db.createUser("pre@example.com", {}, { confirmed: false });
    await q("insert into public.profiles (id, email) values ($1, 'pre@example.com')", [id]);
    await confirm(id);
    assert.equal((await profileOf(id)).length, 1);
  });

  test("updating other columns of an unconfirmed user doesn't create a profile", async () => {
    const id = await db.createUser("other@example.com", {}, { confirmed: false });
    await q("update auth.users set email = 'other2@example.com' where id = $1", [id]);
    assert.deepEqual(await profileOf(id), []);
  });
});
