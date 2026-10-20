// WFPR-003: definiciones de usuario anidadas y conexiones guardadas con el workflow.
// Correr con: npm run test:node
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, rejectsWith } from "./helpers.mjs";

let db;
let q;
let as;
const users = {};

before(async () => {
  db = await createTestDb();
  ({ q, as } = db);
  users.designer = await db.createUser("designer@example.com", {
    designer: true,
  });
  users.designer2 = await db.createUser("designer2@example.com", {
    designer: true,
  });
  users.nobody = await db.createUser("nobody@example.com");
});

// --- helpers ---
const create = (parent, fields, uid = users.designer) =>
  as(uid, async () => {
    const { rows } = await q("select public.create_definition($1, $2) as id", [
      parent,
      JSON.stringify(fields),
    ]);
    return rows[0].id;
  });

const addPredefined = (parent, predefined, uid = users.designer) =>
  as(uid, async () => {
    const { rows } = await q(
      "select public.add_predefined_child($1, $2) as id",
      [parent, JSON.stringify(predefined)],
    );
    return rows[0].id;
  });

const move = (def, newParent, index = null, uid = users.designer) =>
  as(uid, () =>
    q("select public.move_definition($1, $2, $3)", [def, newParent, index]),
  );

const remove = (def, keepChildren = false, uid = users.designer) =>
  as(uid, () =>
    q("select public.delete_definition($1, $2)", [def, keepChildren]),
  );

const children = async (parent) =>
  (
    await q(
      "select name from public.user_definitions where parent_id is not distinct from $1 order by position",
      [parent],
    )
  ).rows.map((r) => r.name);

const row = async (id) =>
  (await q("select * from public.user_definitions where id = $1", [id]))
    .rows[0];

let counter = 0;
const unique = (prefix) => `${prefix} ${++counter}`;

describe("user definitions: positive", () => {
  test("creates top-level and nested definitions with their fields", async () => {
    const line = await create(null, {
      name: "Line 1",
      version: "2.0",
      description: "Main line",
      implementation: {
        program: "MainProgram",
        routine: "SFC_Control_Routine",
      },
      parameters: [{ name: "Speed", dataType: "REAL", defaultValue: "10" }],
    });
    const mixer = await create(line, { name: "Mixer A" });
    const r = await row(mixer);
    assert.equal(r.parent_id, line);
    assert.equal(r.version, "1.0");
    assert.equal(r.kind, "user");
    assert.equal(r.created_by, users.designer);
    const l = await row(line);
    assert.deepEqual(l.parameters, [
      { name: "Speed", dataType: "REAL", defaultValue: "10" },
    ]);
    assert.equal(l.implementation.program, "MainProgram");
  });

  test("new siblings are appended in order", async () => {
    const parent = await create(null, { name: unique("Order") });
    await create(parent, { name: "Zeta" });
    await create(parent, { name: "Alpha" });
    await create(parent, { name: "Mid" });
    assert.deepEqual(await children(parent), ["Zeta", "Alpha", "Mid"]);
  });

  test("a definition can contain pre-defined references", async () => {
    const parent = await create(null, { name: unique("WithPredef") });
    const ref = await addPredefined(parent, {
      key: "pair:Mixing|Add Ingredient",
      label: "Mixing - Add Ingredient",
      procedurePhase: "Mixing",
      operation: "Add Ingredient",
    });
    const r = await row(ref);
    assert.equal(r.kind, "predefined");
    assert.equal(r.name, "Mixing - Add Ingredient");
    assert.equal(r.predefined.procedurePhase, "Mixing");
  });

  test("edits a definition in place", async () => {
    const id = await create(null, { name: unique("Edit"), description: "a" });
    await as(users.designer2, () =>
      q("select public.update_definition($1, $2)", [
        id,
        JSON.stringify({ name: "Renamed", version: "3.0", description: null }),
      ]),
    );
    const r = await row(id);
    assert.equal(r.name, "Renamed");
    assert.equal(r.version, "3.0");
    assert.equal(r.description, null);
    assert.equal(r.updated_by, users.designer2);
  });

  test("moves a definition with its subtree, to another parent and to the top level", async () => {
    const a = await create(null, { name: unique("A") });
    const b = await create(null, { name: unique("B") });
    const child = await create(a, { name: "Child" });
    const grandchild = await create(child, { name: "Grandchild" });

    await move(child, b);
    assert.equal((await row(child)).parent_id, b);
    assert.equal((await row(grandchild)).parent_id, child);

    await move(child, null);
    assert.equal((await row(child)).parent_id, null);
  });

  test("reorders siblings manually", async () => {
    const parent = await create(null, { name: unique("Reorder") });
    const one = await create(parent, { name: "One" });
    await create(parent, { name: "Two" });
    const three = await create(parent, { name: "Three" });

    await move(three, parent, 0);
    assert.deepEqual(await children(parent), ["Three", "One", "Two"]);
    await move(one, parent, 2);
    assert.deepEqual(await children(parent), ["Three", "Two", "One"]);
    const positions = (
      await q(
        "select position from public.user_definitions where parent_id = $1 order by position",
        [parent],
      )
    ).rows.map((r) => r.position);
    assert.deepEqual(positions, [0, 1, 2]);
  });

  test("deletes a leaf and a whole subtree", async () => {
    const parent = await create(null, { name: unique("Del") });
    const leaf = await create(parent, { name: "Leaf" });
    const branch = await create(parent, { name: "Branch" });
    const inner = await create(branch, { name: "Inner" });

    await remove(leaf);
    await remove(branch);
    assert.equal(await row(leaf), undefined);
    assert.equal(await row(inner), undefined);
    assert.deepEqual(await children(parent), []);
  });

  test("deleting with keep_children moves the children up, after the existing siblings", async () => {
    const top = await create(null, { name: unique("Keep") });
    await create(top, { name: "Sibling" });
    const middle = await create(top, { name: "Middle" });
    await create(middle, { name: "C1" });
    await create(middle, { name: "C2" });

    await remove(middle, true);
    assert.deepEqual(await children(top), ["Sibling", "C1", "C2"]);
  });

  test("connections are saved with a workflow and bump its version", async () => {
    const id = crypto.randomUUID();
    const conns = [{ id: "c1", from: "begin", to: "end" }];
    await as(users.designer, () =>
      q(
        "insert into public.workflows (id, name, nodes, connections) values ($1, 'WF', '[]', $2)",
        [id, JSON.stringify(conns)],
      ),
    );
    await as(users.designer, () =>
      q("update public.workflows set connections = $2 where id = $1", [
        id,
        JSON.stringify([...conns, { id: "c2", from: "a", to: "b" }]),
      ]),
    );
    const { rows } = await q(
      "select version, connections from public.workflows where id = $1",
      [id],
    );
    assert.equal(rows[0].version, 2);
    assert.equal(rows[0].connections.length, 2);
  });
});

describe("user definitions: negative", () => {
  test("users without the designer role can't change the tree", async () => {
    await rejectsWith(create(null, { name: "X" }, users.nobody), "42501");
    const id = await create(null, { name: unique("Owned") });
    await rejectsWith(remove(id, false, users.nobody), "42501");
    await rejectsWith(move(id, null, 0, users.nobody), "42501");
  });

  test("anon can't call the RPCs or read the table", async () => {
    await rejectsWith(
      as(null, () =>
        q('select public.create_definition(null, \'{"name":"x"}\')'),
      ),
      "42501",
    );
    await rejectsWith(
      as(null, () => q("select * from public.user_definitions")),
      "42501",
    );
  });

  test("clients can't write the table directly", async () => {
    const id = await create(null, { name: unique("Direct") });
    for (const sql of [
      "insert into public.user_definitions (name) values ('hack')",
      `update public.user_definitions set name = 'hack' where id = '${id}'`,
      `delete from public.user_definitions where id = '${id}'`,
    ]) {
      await rejectsWith(
        as(users.designer, () => q(sql)),
        "42501",
      );
    }
  });

  test("unknown parent, missing name", async () => {
    await rejectsWith(create(crypto.randomUUID(), { name: "Orphan" }), "P0002");
    await rejectsWith(create(null, { name: "   " }), "P0001", "name_required");
  });

  test("non-array parameters or non-object implementation are rejected on create and update", async () => {
    for (const bad of [
      { parameters: { name: "p" } },
      { parameters: "p" },
      { parameters: null },
      { implementation: [] },
    ]) {
      await rejectsWith(
        create(null, { name: unique("Bad"), ...bad }),
        "P0001",
        "invalid_fields",
      );
    }
    const id = await create(null, { name: unique("Good"), parameters: [] });
    await rejectsWith(
      as(users.designer, () =>
        q("select public.update_definition($1, $2)", [
          id,
          JSON.stringify({ parameters: 42 }),
        ]),
      ),
      "P0001",
      "invalid_fields",
    );
    const { rows } = await q(
      "select parameters from public.user_definitions where id = $1",
      [id],
    );
    assert.deepEqual(rows[0].parameters, []);
  });

  test("the table itself refuses malformed parameters (service role bypasses the RPCs)", async () => {
    await rejectsWith(
      db.asServiceRole(() =>
        q(
          "insert into public.user_definitions (name, parameters) values ('Raw', '{}')",
        ),
      ),
      "23514",
    );
  });

  test("workflows.connections must be an array when set", async () => {
    await rejectsWith(
      as(users.designer, () =>
        q(
          "insert into public.workflows (id, name, nodes, connections) values ($1, 'WF', '[]', '{}')",
          [crypto.randomUUID()],
        ),
      ),
      "23514",
    );
  });

  test("duplicate name and version among siblings is rejected, ignoring case and spaces", async () => {
    const parent = await create(null, { name: unique("Dup") });
    await create(parent, { name: "Mixer", version: "1.0" });
    await rejectsWith(
      create(parent, { name: "  mixer ", version: "1.0" }),
      "P0001",
      "duplicate_sibling",
    );
  });

  test("a definition can't move inside itself or a descendant", async () => {
    const a = await create(null, { name: unique("Cycle") });
    const b = await create(a, { name: "B" });
    const c = await create(b, { name: "C" });
    await rejectsWith(move(a, a), "P0001", "cycle");
    await rejectsWith(move(a, c), "P0001", "cycle");
    assert.equal((await row(a)).parent_id, null);
  });

  test("pre-defined references can't have children or sit at the top level", async () => {
    const parent = await create(null, { name: unique("PredefRules") });
    const ref = await addPredefined(parent, {
      key: "level:Procedure Phase",
      label: "Procedure Phase",
    });
    await rejectsWith(
      create(ref, { name: "Inside" }),
      "P0001",
      "invalid_parent",
    );
    await rejectsWith(move(ref, null), "P0001", "predefined_needs_parent");
    await rejectsWith(
      addPredefined(null, { key: "k", label: "L" }),
      "P0001",
      "predefined_needs_parent",
    );
    await rejectsWith(
      addPredefined(parent, {
        key: "level:Procedure Phase",
        label: "Procedure Phase",
      }),
      "P0001",
      "duplicate_sibling",
    );
  });

  test("keep_children that would clash with existing siblings rolls back completely", async () => {
    const top = await create(null, { name: unique("Clash") });
    await create(top, { name: "Same" });
    const middle = await create(top, { name: "Middle" });
    await create(middle, { name: "Same" });

    await rejectsWith(remove(middle, true), "P0001", "duplicate_sibling");
    assert.ok(await row(middle));
    assert.deepEqual(await children(middle), ["Same"]);
  });

  test("keep_children on a top-level definition with pre-defined children is rejected", async () => {
    const top = await create(null, { name: unique("TopPredef") });
    await addPredefined(top, { key: "level:Procedure", label: "Procedure" });
    await rejectsWith(remove(top, true), "P0001", "predefined_needs_parent");
  });
});

describe("user definitions: edge", () => {
  test("the same name is allowed under different parents", async () => {
    const p1 = await create(null, { name: unique("P") });
    const p2 = await create(null, { name: unique("P") });
    await create(p1, { name: "Dosing" });
    await create(p2, { name: "Dosing" });
    assert.deepEqual(await children(p2), ["Dosing"]);
  });

  test("a 1,000-level chain: creates, rejects a deep cycle, and moves the deepest node out", async () => {
    let parent = await create(null, { name: unique("Deep") });
    const root = parent;
    for (let i = 1; i < 1000; i++) {
      parent = await create(parent, { name: `Level ${i + 1}` });
    }
    const deepest = parent;
    const { rows } = await q(
      `with recursive chain(id, depth) as (
         select id, 1 from public.user_definitions where id = $1
         union all
         select d.id, c.depth + 1 from public.user_definitions d join chain c on d.parent_id = c.id)
       select max(depth) as depth from chain`,
      [root],
    );
    assert.equal(rows[0].depth, 1000);

    await rejectsWith(move(root, deepest), "P0001", "cycle");
    await move(deepest, null);
    assert.equal((await row(deepest)).parent_id, null);
  });

  test("an index past the end appends; moving within the same parent keeps everyone", async () => {
    const parent = await create(null, { name: unique("Edge") });
    const first = await create(parent, { name: "First" });
    await create(parent, { name: "Second" });
    await move(first, parent, 99);
    assert.deepEqual(await children(parent), ["Second", "First"]);
  });

  test("deleting a top-level definition with keep_children makes its children top level", async () => {
    const top = await create(null, { name: unique("Promote") });
    const child = await create(top, { name: unique("Promoted") });
    await remove(top, true);
    assert.equal((await row(child)).parent_id, null);
  });

  test("workflows saved before WFPR-003 keep null connections; a saved empty list stays empty", async () => {
    const legacy = crypto.randomUUID();
    const empty = crypto.randomUUID();
    await as(users.designer, async () => {
      await q(
        "insert into public.workflows (id, name, nodes) values ($1, 'Legacy', '[]')",
        [legacy],
      );
      await q(
        "insert into public.workflows (id, name, nodes, connections) values ($1, 'Empty', '[]', '[]')",
        [empty],
      );
    });
    const { rows } = await q(
      "select id, connections from public.workflows where id = any($1::uuid[]) order by name",
      [[empty, legacy]],
    );
    assert.deepEqual(
      rows.map((r) => [r.id, r.connections]),
      [
        [empty, []],
        [legacy, null],
      ],
    );
  });

  test("nested as()/asServiceRole() calls restore the outer identity", async () => {
    const whoami = async () =>
      (await q("select current_user as role, auth.uid() as uid")).rows[0];
    await as(users.designer, async () => {
      await as(users.designer2, async () => {
        assert.equal((await whoami()).uid, users.designer2);
      });
      assert.deepEqual(await whoami(), {
        role: "authenticated",
        uid: users.designer,
      });
      await db.asServiceRole(async () => {
        assert.equal((await whoami()).role, "service_role");
      });
      assert.deepEqual(await whoami(), {
        role: "authenticated",
        uid: users.designer,
      });
    });
    assert.equal((await whoami()).uid, null);
  });

  test("the table is published to Realtime", async () => {
    const { rows } = await q(
      "select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'user_definitions'",
    );
    assert.equal(rows.length, 1);
  });
});
