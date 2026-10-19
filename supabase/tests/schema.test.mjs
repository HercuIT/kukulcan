// Pruebas del esquema, RLS y RPC de supabase/migrations contra Postgres real (PGlite, en memoria).
// Correr con: npm run test:node
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, rejectsWith } from "./helpers.mjs";

let db;
let q;
let as;
let asServiceRole;
const users = {};

async function createUser(key, email, roles = {}) {
  users[key] = await db.createUser(email, roles);
  return users[key];
}

async function newWorkflow(owner, name = "WF") {
  const id = crypto.randomUUID();
  await as(owner, () =>
    q("insert into public.workflows (id, name, nodes) values ($1, $2, $3)", [
      id,
      name,
      JSON.stringify([{ id: "n1", type: "start" }]),
    ]),
  );
  return id;
}

const statusOf = async (wf) =>
  (await q("select status from public.workflows where id = $1", [wf])).rows[0]
    .status;

before(async () => {
  db = await createTestDb();
  ({ q, as, asServiceRole } = db);
  await createUser("designer", "designer@example.com", { designer: true });
  await createUser("designer2", "Designer2@Example.com", { designer: true });
  await createUser("reviewer", "reviewer@example.com", { reviewer: true });
  await createUser("deployer", "deployer@example.com", { deployer: true });
  await createUser("nobody", "nobody@example.com");
});

describe("positive", () => {
  test("sign-up creates a profile with every role off", async () => {
    const id = await createUser("fresh", "fresh@example.com");
    const { rows } = await q("select * from public.profiles where id = $1", [
      id,
    ]);
    assert.equal(rows[0].email, "fresh@example.com");
    assert.deepEqual(
      [rows[0].designer, rows[0].reviewer, rows[0].deployer],
      [false, false, false],
    );
  });

  test("a designer creates a workflow and becomes its first designer", async () => {
    const wf = await newWorkflow(users.designer);
    const { rows } = await as(users.designer, () =>
      q(
        "select w.created_by, w.status, w.version, d.user_id from public.workflows w join public.workflow_designers d on d.workflow_id = w.id where w.id = $1",
        [wf],
      ),
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].created_by, users.designer);
    assert.equal(rows[0].user_id, users.designer);
    assert.equal(rows[0].status, "draft");
    assert.equal(rows[0].version, 1);
  });

  test("saving nodes bumps the version and stamps the editor", async () => {
    const wf = await newWorkflow(users.designer);
    const { rows } = await as(users.designer, () =>
      q(
        "update public.workflows set nodes = '[]' where id = $1 returning version, last_modified_by",
        [wf],
      ),
    );
    assert.equal(rows[0].version, 2);
    assert.equal(rows[0].last_modified_by, users.designer);
  });

  test("full review lifecycle: submit, request changes, reassign, approve", async () => {
    const wf = await newWorkflow(users.designer);
    await as(users.designer, () =>
      q("select public.submit_for_review($1, $2)", [wf, users.reviewer]),
    );
    assert.equal(await statusOf(wf), "pending_review");

    await as(users.reviewer, () =>
      q("select public.request_changes($1, $2)", [wf, "Falta el nodo End"]),
    );
    assert.equal(await statusOf(wf), "changes_requested");
    const history = await q(
      "select kind, description, user_id from public.workflow_history where workflow_id = $1",
      [wf],
    );
    assert.deepEqual(history.rows, [
      {
        kind: "changes_requested",
        description: "Falta el nodo End",
        user_id: users.reviewer,
      },
    ]);

    await as(users.designer, () =>
      q("select public.assign_reviewer($1, $2)", [wf, users.reviewer]),
    );
    await as(users.reviewer, () =>
      q("select public.approve_workflow($1)", [wf]),
    );
    const { rows } = await q(
      "select status, approved_by from public.workflows where id = $1",
      [wf],
    );
    assert.equal(rows[0].status, "approved");
    assert.equal(rows[0].approved_by, users.reviewer);
  });

  test("the assigned reviewer and deployers (once approved) can read a workflow", async () => {
    const wf = await newWorkflow(users.designer);
    await as(users.designer, () =>
      q("select public.submit_for_review($1, $2)", [wf, users.reviewer]),
    );
    const read = (uid) =>
      as(uid, () => q("select id from public.workflows where id = $1", [wf]));
    assert.equal((await read(users.reviewer)).rows.length, 1);
    assert.equal((await read(users.deployer)).rows.length, 0);

    await as(users.reviewer, () =>
      q("select public.approve_workflow($1)", [wf]),
    );
    assert.equal((await read(users.deployer)).rows.length, 1);
  });

  test("designers add and remove collaborators", async () => {
    const wf = await newWorkflow(users.designer);
    await as(users.designer, () =>
      q("select public.add_designer($1, $2)", [wf, "designer2@example.com"]),
    );
    const team = () =>
      q(
        "select user_id from public.workflow_designers where workflow_id = $1 order by user_id",
        [wf],
      );
    assert.equal((await team()).rows.length, 2);

    await as(users.designer2, () =>
      q("select public.remove_designer($1, $2)", [wf, users.designer]),
    );
    assert.deepEqual(
      (await team()).rows.map((r) => r.user_id),
      [users.designer2],
    );
  });

  test("checkout writes a history row and the checkout description", async () => {
    const wf = await newWorkflow(users.designer);
    await as(users.designer, () =>
      q("select public.checkout_workflow($1, $2)", [wf, "Ajusto velocidades"]),
    );
    const { rows } = await q(
      "select w.checkout_description, h.kind, h.user_id from public.workflows w join public.workflow_history h on h.workflow_id = w.id where w.id = $1",
      [wf],
    );
    assert.deepEqual(rows, [
      {
        checkout_description: "Ajusto velocidades",
        kind: "checkout",
        user_id: users.designer,
      },
    ]);
  });

  test("my_workflows returns workflows where the user designs or reviews", async () => {
    const mine = await newWorkflow(users.designer2, "Mine");
    const toReview = await newWorkflow(users.designer, "ToReview");
    await as(users.designer, () =>
      q("select public.submit_for_review($1, $2)", [toReview, users.reviewer]),
    );
    const { rows } = await as(users.reviewer, () =>
      q("select id from public.my_workflows()"),
    );
    const ids = rows.map((r) => r.id);
    assert.ok(ids.includes(toReview));
    assert.ok(!ids.includes(mine));
  });
});

describe("negative", () => {
  test("a user without the designer role cannot create workflows", async () => {
    await rejectsWith(newWorkflow(users.nobody), "42501");
  });

  test("a designer cannot create a workflow on someone else's behalf", async () => {
    await rejectsWith(
      as(users.designer, () =>
        q("insert into public.workflows (name, created_by) values ('x', $1)", [
          users.designer2,
        ]),
      ),
      "42501",
    );
  });

  test("the client cannot change status, reviewer or approval directly", async () => {
    const wf = await newWorkflow(users.designer);
    for (const col of [
      "status = 'approved'",
      `assigned_reviewer_id = '${users.reviewer}'`,
      `approved_by = '${users.designer}'`,
      "version = 99",
    ]) {
      await rejectsWith(
        as(users.designer, () =>
          q(`update public.workflows set ${col} where id = $1`, [wf]),
        ),
        "42501",
      );
    }
  });

  test("users who are not on a workflow cannot read or edit it", async () => {
    const wf = await newWorkflow(users.designer);
    const read = await as(users.designer2, () =>
      q("select id from public.workflows where id = $1", [wf]),
    );
    assert.equal(read.rows.length, 0);
    const upd = await as(users.designer2, () =>
      q(
        "update public.workflows set name = 'hack' where id = $1 returning id",
        [wf],
      ),
    );
    assert.equal(upd.rows.length, 0);
  });

  test("a workflow in review cannot be edited", async () => {
    const wf = await newWorkflow(users.designer);
    await as(users.designer, () =>
      q("select public.submit_for_review($1, $2)", [wf, users.reviewer]),
    );
    const upd = await as(users.designer, () =>
      q("update public.workflows set nodes = '[]' where id = $1 returning id", [
        wf,
      ]),
    );
    assert.equal(upd.rows.length, 0);
  });

  test("only the assigned reviewer can approve or request changes", async () => {
    const wf = await newWorkflow(users.designer);
    await as(users.designer, () =>
      q("select public.submit_for_review($1, $2)", [wf, users.reviewer]),
    );
    await rejectsWith(
      as(users.designer, () => q("select public.approve_workflow($1)", [wf])),
      "42501",
    );
    await rejectsWith(
      as(users.deployer, () => q("select public.request_changes($1)", [wf])),
      "42501",
    );
  });

  test("status rules are enforced", async () => {
    const wf = await newWorkflow(users.designer);
    await rejectsWith(
      as(users.reviewer, () => q("select public.approve_workflow($1)", [wf])),
      "42501",
    );
    await as(users.designer, () =>
      q("select public.submit_for_review($1, $2)", [wf, users.reviewer]),
    );
    await rejectsWith(
      as(users.designer, () =>
        q("select public.submit_for_review($1, $2)", [wf, users.reviewer]),
      ),
      "P0001",
    );
    await rejectsWith(
      as(users.designer, () =>
        q("select public.assign_reviewer($1, $2)", [wf, users.reviewer]),
      ),
      "P0001",
    );
    await as(users.reviewer, () =>
      q("select public.approve_workflow($1)", [wf]),
    );
    await rejectsWith(
      as(users.reviewer, () => q("select public.approve_workflow($1)", [wf])),
      "P0001",
    );
  });

  test("the reviewer must have the reviewer role", async () => {
    const wf = await newWorkflow(users.designer);
    await rejectsWith(
      as(users.designer, () =>
        q("select public.submit_for_review($1, $2)", [wf, users.nobody]),
      ),
      "P0002",
    );
  });

  test("non-designers cannot manage collaborators or check out", async () => {
    const wf = await newWorkflow(users.designer);
    await rejectsWith(
      as(users.designer2, () =>
        q("select public.add_designer($1, $2)", [wf, "nobody@example.com"]),
      ),
      "42501",
    );
    await rejectsWith(
      as(users.designer2, () =>
        q("select public.remove_designer($1, $2)", [wf, users.designer]),
      ),
      "42501",
    );
    await rejectsWith(
      as(users.designer2, () =>
        q("select public.checkout_workflow($1, 'x')", [wf]),
      ),
      "42501",
    );
  });

  test("adding an unknown email fails with not-found", async () => {
    const wf = await newWorkflow(users.designer);
    await rejectsWith(
      as(users.designer, () =>
        q("select public.add_designer($1, 'ghost@example.com')", [wf]),
      ),
      "P0002",
    );
  });

  test("the last designer cannot be removed", async () => {
    const wf = await newWorkflow(users.designer);
    await rejectsWith(
      as(users.designer, () =>
        q("select public.remove_designer($1, $2)", [wf, users.designer]),
      ),
      "P0001",
    );
  });

  test("RPCs reject calls without a session and unknown workflows", async () => {
    const wf = await newWorkflow(users.designer);
    await rejectsWith(
      as(null, () => q("select public.approve_workflow($1)", [wf])),
      "42501", // anon has no EXECUTE at all
    );
    await rejectsWith(
      as(users.reviewer, () =>
        q("select public.approve_workflow($1)", [crypto.randomUUID()]),
      ),
      "P0002",
    );
  });

  test("anon reads nothing and nobody reads server_logs from the client", async () => {
    await rejectsWith(
      as(null, () => q("select * from public.workflows")),
      "42501",
    );
    await rejectsWith(
      as(users.designer, () => q("select * from public.server_logs")),
      "42501",
    );
    await rejectsWith(
      as(users.designer, () =>
        q("insert into public.server_logs (level) values ('info')"),
      ),
      "42501",
    );
  });

  test("clients cannot grant themselves roles", async () => {
    await rejectsWith(
      as(users.nobody, () =>
        q("update public.profiles set designer = true where id = $1", [
          users.nobody,
        ]),
      ),
      "42501",
    );
  });
});

describe("edge", () => {
  test("adding an existing designer is a no-op, and email matching ignores case and spaces", async () => {
    const wf = await newWorkflow(users.designer);
    await as(users.designer, () =>
      q("select public.add_designer($1, $2)", [wf, "  DESIGNER2@example.COM "]),
    );
    await as(users.designer, () =>
      q("select public.add_designer($1, $2)", [wf, "designer2@example.com"]),
    );
    const { rows } = await q(
      "select count(*)::int as n from public.workflow_designers where workflow_id = $1",
      [wf],
    );
    assert.equal(rows[0].n, 2);
  });

  test("a blank change-request comment adds no history row", async () => {
    const wf = await newWorkflow(users.designer);
    await as(users.designer, () =>
      q("select public.submit_for_review($1, $2)", [wf, users.reviewer]),
    );
    await as(users.reviewer, () =>
      q("select public.request_changes($1, '   ')", [wf]),
    );
    const { rows } = await q(
      "select count(*)::int as n from public.workflow_history where workflow_id = $1",
      [wf],
    );
    assert.equal(rows[0].n, 0);
  });

  test("a blank checkout description is rejected", async () => {
    const wf = await newWorkflow(users.designer);
    await rejectsWith(
      as(users.designer, () =>
        q("select public.checkout_workflow($1, ' ')", [wf]),
      ),
      "P0001",
    );
  });

  test("status changes and checkouts do not bump the version", async () => {
    const wf = await newWorkflow(users.designer);
    await as(users.designer, () =>
      q("select public.checkout_workflow($1, 'x')", [wf]),
    );
    await as(users.designer, () =>
      q("select public.submit_for_review($1, $2)", [wf, users.reviewer]),
    );
    const { rows } = await q(
      "select version from public.workflows where id = $1",
      [wf],
    );
    assert.equal(rows[0].version, 1);
  });

  test("service-role writes (data migration) keep their own timestamps", async () => {
    const wf = await newWorkflow(users.designer);
    await asServiceRole(() =>
      q(
        "update public.workflows set nodes = '[1]', last_modified_at = '2025-01-01T00:00:00Z', last_modified_by = $2 where id = $1",
        [wf, users.designer2],
      ),
    );
    const { rows } = await q(
      "select version, last_modified_at, last_modified_by from public.workflows where id = $1",
      [wf],
    );
    assert.equal(rows[0].version, 1);
    assert.equal(
      rows[0].last_modified_at.toISOString(),
      "2025-01-01T00:00:00.000Z",
    );
    assert.equal(rows[0].last_modified_by, users.designer2);
  });

  test("a large node graph round-trips through jsonb", async () => {
    const nodes = Array.from({ length: 5000 }, (_, i) => ({
      id: `n${i}`,
      type: "Procedure Phase",
      parameters: { process: [{ name: `p${i}`, value: String(i) }] },
    }));
    const wf = await newWorkflow(users.designer);
    await as(users.designer, () =>
      q("update public.workflows set nodes = $2 where id = $1", [
        wf,
        JSON.stringify(nodes),
      ]),
    );
    const { rows } = await q(
      "select nodes from public.workflows where id = $1",
      [wf],
    );
    assert.equal(rows[0].nodes.length, 5000);
    assert.deepEqual(rows[0].nodes[4999], nodes[4999]);
  });

  test("deleting an auth user cascades to the profile", async () => {
    const id = await createUser("temp", "temp@example.com");
    await q("delete from auth.users where id = $1", [id]);
    const { rows } = await q("select id from public.profiles where id = $1", [
      id,
    ]);
    assert.equal(rows.length, 0);
  });
});

describe("migrate_workflow (data migration RPC)", () => {
  const callMigrate = (workflow, designers = [], history = []) =>
    q("select public.migrate_workflow($1::jsonb, $2::jsonb, $3::jsonb) as id", [
      JSON.stringify(workflow),
      JSON.stringify(designers),
      JSON.stringify(history),
    ]);
  // Como en producción: migrate-data.js llama con la clave service role.
  const migrate = (...args) => asServiceRole(() => callMigrate(...args));
  const legacy = (legacyId, extra = {}) => ({
    legacy_id: legacyId,
    name: "Migrado",
    nodes: [{ id: "n1", type: "start" }],
    status: "approved",
    version: 7,
    created_by: users.designer,
    created_at: "2025-05-01T00:00:00Z",
    last_modified_by: users.designer2,
    last_modified_at: "2025-06-01T00:00:00Z",
    approved_by: users.reviewer,
    ...extra,
  });
  const teamOf = async (id) =>
    (
      await q(
        "select user_id from public.workflow_designers where workflow_id = $1 order by user_id",
        [id],
      )
    ).rows.map((r) => r.user_id);

  test("positive: writes the workflow, its team and history with Firestore's values", async () => {
    const {
      rows: [{ id }],
    } = await migrate(
      legacy("fs-pos"),
      [{ user_id: users.designer2 }],
      [
        {
          kind: "checkout",
          description: "nota",
          user_id: users.designer2,
          created_at: "2025-05-15T00:00:00Z",
        },
      ],
    );
    const { rows } = await q(
      "select status, version, approved_by, last_modified_by, last_modified_at from public.workflows where id = $1",
      [id],
    );
    assert.equal(rows[0].status, "approved");
    assert.equal(rows[0].version, 7);
    assert.equal(rows[0].approved_by, users.reviewer);
    assert.equal(rows[0].last_modified_by, users.designer2);
    assert.equal(
      rows[0].last_modified_at.toISOString(),
      "2025-06-01T00:00:00.000Z",
    );
    // El equipo es el de Firestore: el trigger no deja al creador si no estaba en designerIds.
    assert.deepEqual(await teamOf(id), [users.designer2]);
    const history = await q(
      "select kind, description from public.workflow_history where workflow_id = $1",
      [id],
    );
    assert.deepEqual(history.rows, [{ kind: "checkout", description: "nota" }]);
  });

  test("positive: rerunning updates in place and replaces team and history", async () => {
    const first = await migrate(
      legacy("fs-rerun"),
      [{ user_id: users.designer }],
      [{ kind: "checkout", description: "uno" }],
    );
    const second = await migrate(
      legacy("fs-rerun", { name: "Renombrado", version: 8 }),
      [{ user_id: users.designer }, { user_id: users.designer2 }],
      [{ kind: "checkout", description: "dos" }],
    );
    const id = first.rows[0].id;
    assert.equal(second.rows[0].id, id);
    const { rows } = await q(
      "select name, version from public.workflows where id = $1",
      [id],
    );
    assert.deepEqual(rows[0], { name: "Renombrado", version: 8 });
    assert.equal((await teamOf(id)).length, 2);
    const history = await q(
      "select description from public.workflow_history where workflow_id = $1",
      [id],
    );
    assert.deepEqual(history.rows, [{ description: "dos" }]);
  });

  test("negative: a failure rolls back the whole workflow write", async () => {
    const {
      rows: [{ id }],
    } = await migrate(legacy("fs-atomic"), [{ user_id: users.designer }]);
    await rejectsWith(
      migrate(legacy("fs-atomic", { name: "No debe quedar" }), [
        { user_id: users.designer2 },
        { user_id: crypto.randomUUID() },
      ]),
      "23503",
    );
    const { rows } = await q(
      "select name from public.workflows where id = $1",
      [id],
    );
    assert.equal(rows[0].name, "Migrado");
    assert.deepEqual(await teamOf(id), [users.designer]);
  });

  test("negative: clients cannot call it and legacy_id is required", async () => {
    await rejectsWith(
      as(users.designer, () => callMigrate(legacy("fs-client"))),
      "42501",
    );
    await rejectsWith(migrate(legacy(null)), "P0001");
  });

  test("edge: rerunning with empty team and history arrays clears both", async () => {
    const {
      rows: [{ id }],
    } = await migrate(
      legacy("fs-empty"),
      [{ user_id: users.designer }],
      [{ kind: "checkout", description: "antes" }],
    );
    await migrate(legacy("fs-empty"));
    assert.deepEqual(await teamOf(id), []);
    const { rows } = await q(
      "select count(*)::int as n from public.workflow_history where workflow_id = $1",
      [id],
    );
    assert.equal(rows[0].n, 0);
  });
});

describe("review fixes", () => {
  test("negative: clients cannot write checkout_description directly", async () => {
    const wf = await newWorkflow(users.designer);
    await rejectsWith(
      as(users.designer, () =>
        q(
          "update public.workflows set checkout_description = 'x' where id = $1",
          [wf],
        ),
      ),
      "42501",
    );
    await rejectsWith(
      as(users.designer, () =>
        q(
          "insert into public.workflows (name, checkout_description) values ('x', 'y')",
        ),
      ),
      "42501",
    );
  });

  test("positive: checkout_workflow still sets checkout_description", async () => {
    const wf = await newWorkflow(users.designer);
    await as(users.designer, () =>
      q("select public.checkout_workflow($1, 'por RPC')", [wf]),
    );
    const { rows } = await q(
      "select checkout_description from public.workflows where id = $1",
      [wf],
    );
    assert.equal(rows[0].checkout_description, "por RPC");
  });

  test("edge: assigning no reviewer clears it and keeps the editable status", async () => {
    const wf = await newWorkflow(users.designer);
    await as(users.designer, () =>
      q("select public.submit_for_review($1, $2)", [wf, users.reviewer]),
    );
    await as(users.reviewer, () =>
      q("select public.request_changes($1)", [wf]),
    );
    await as(users.designer, () =>
      q("select public.assign_reviewer($1, $2)", [wf, users.reviewer]),
    );
    // De vuelta a changes_requested para poder desasignar.
    await as(users.reviewer, () =>
      q("select public.request_changes($1)", [wf]),
    );
    await as(users.designer, () =>
      q("select public.assign_reviewer($1, null)", [wf]),
    );
    const { rows } = await q(
      "select status, assigned_reviewer_id from public.workflows where id = $1",
      [wf],
    );
    assert.deepEqual(rows[0], {
      status: "changes_requested",
      assigned_reviewer_id: null,
    });
  });

  test("negative: a reviewer whose role was revoked can no longer approve or request changes", async () => {
    const exReviewer = await createUser(
      "exReviewer",
      "ex-reviewer@example.com",
      {
        reviewer: true,
      },
    );
    const wf = await newWorkflow(users.designer);
    await as(users.designer, () =>
      q("select public.submit_for_review($1, $2)", [wf, exReviewer]),
    );
    await q("update public.profiles set reviewer = false where id = $1", [
      exReviewer,
    ]);
    await rejectsWith(
      as(exReviewer, () => q("select public.approve_workflow($1)", [wf])),
      "42501",
    );
    await rejectsWith(
      as(exReviewer, () => q("select public.request_changes($1)", [wf])),
      "42501",
    );
    assert.equal(await statusOf(wf), "pending_review");
  });
});
