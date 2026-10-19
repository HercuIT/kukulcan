// Correr con: npm run test:node (desde la raíz)
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const {
  toIso,
  transformWorkflow,
  transformLog,
  checksum,
} = require("../lib/transform");

const UID_MAP = {
  fbDesigner: "00000000-0000-0000-0000-000000000001",
  fbDesigner2: "00000000-0000-0000-0000-000000000002",
  fbReviewer: "00000000-0000-0000-0000-000000000003",
  fbReviewer2: "00000000-0000-0000-0000-000000000004",
  fbDeployer: "00000000-0000-0000-0000-000000000005",
};
const ts = (iso) => ({ toDate: () => new Date(iso) });

const DOC = {
  name: "Linea 1",
  content: { nodes: [{ id: "n1", type: "start" }] },
  metadata: {
    status: "approved",
    version: 4,
    createdAt: ts("2026-01-01T00:00:00Z"),
    createdBy: "fbDesigner",
    lastModifiedAt: ts("2026-02-01T00:00:00Z"),
    lastModifiedBy: "fbDesigner2",
    designerIds: ["fbDesigner", "fbDesigner2"],
    // Usuarios distintos en cada campo: un campo leído de otro origen también falla.
    assignedReviewerId: "fbReviewer",
    approvedBy: "fbReviewer2",
    deployedBy: "fbDeployer",
    checkoutDescription: "Ajuste",
    history: [
      {
        description: "Ajuste",
        userId: "fbDesigner2",
        timestamp: { seconds: 1767225600, nanoseconds: 500000000 },
      },
    ],
  },
};
const HISTORY_DOCS = [
  {
    action: "changes_requested",
    comments: "Falta End",
    userId: "fbReviewer",
    timestamp: ts("2026-01-15T00:00:00Z"),
  },
];

describe("transformWorkflow", () => {
  test("positive: maps metadata to columns and rewrites every UID", () => {
    const { workflow, designers, history, missing, errors } = transformWorkflow(
      "fs-1",
      DOC,
      HISTORY_DOCS,
      UID_MAP,
    );
    assert.deepEqual(errors, []);
    assert.equal(missing.size, 0);
    assert.deepEqual(workflow, {
      legacy_id: "fs-1",
      name: "Linea 1",
      nodes: [{ id: "n1", type: "start" }],
      status: "approved",
      version: 4,
      checkout_description: "Ajuste",
      assigned_reviewer_id: UID_MAP.fbReviewer,
      approved_by: UID_MAP.fbReviewer2,
      deployed_by: UID_MAP.fbDeployer,
      created_by: UID_MAP.fbDesigner,
      created_at: "2026-01-01T00:00:00.000Z",
      last_modified_by: UID_MAP.fbDesigner2,
      last_modified_at: "2026-02-01T00:00:00.000Z",
    });
    assert.deepEqual(designers, [
      { user_id: UID_MAP.fbDesigner },
      { user_id: UID_MAP.fbDesigner2 },
    ]);
    assert.deepEqual(history, [
      {
        kind: "checkout",
        description: "Ajuste",
        user_id: UID_MAP.fbDesigner2,
        created_at: "2026-01-01T00:00:00.500Z",
      },
      {
        kind: "changes_requested",
        description: "Falta End",
        user_id: UID_MAP.fbReviewer,
        created_at: "2026-01-15T00:00:00.000Z",
      },
    ]);
  });

  test("negative: unmapped UIDs, unknown statuses and a missing creator are reported", () => {
    const { missing, errors } = transformWorkflow(
      "fs-2",
      {
        metadata: {
          status: "deployed",
          designerIds: ["ghost"],
          assignedReviewerId: "ghost2",
        },
      },
      [],
      UID_MAP,
    );
    assert.deepEqual([...missing].sort(), ["ghost", "ghost2"]);
    assert.deepEqual(errors, [
      'fs-2: unknown status "deployed"',
      "fs-2: metadata.createdBy is missing",
    ]);
  });

  test("edge: missing fields get safe defaults and duplicate designers collapse", () => {
    const { workflow, designers, history } = transformWorkflow(
      "fs-3",
      {
        metadata: {
          createdBy: "fbDesigner",
          designerIds: ["fbDesigner", "fbDesigner"],
          history: [{ description: "sin fecha", userId: "fbDesigner" }],
        },
      },
      undefined,
      UID_MAP,
    );
    assert.equal(workflow.name, "fs-3");
    assert.deepEqual(workflow.nodes, []);
    assert.equal(workflow.status, "draft");
    assert.equal(workflow.version, 1);
    assert.equal(designers.length, 1);
    assert.equal(history[0].created_at, workflow.last_modified_at);
  });
});

describe("transformLog", () => {
  test("positive: keeps event fields as columns and the rest in details", () => {
    const row = transformLog(
      "11111111-2222-3333-4444-555555555555",
      {
        level: "warn",
        timestamp: "2026-03-01T10:00:00.000Z",
        event: "BAD_REQUEST",
        workflowId: "W-1",
        userId: "fbDesigner",
        status: 400,
      },
      UID_MAP,
    );
    assert.deepEqual(row, {
      level: "warn",
      event: "BAD_REQUEST",
      request_id: "11111111-2222-3333-4444-555555555555",
      workflow_id: "W-1",
      user_id: UID_MAP.fbDesigner,
      details: {
        status: 400,
        firestore_id: "11111111-2222-3333-4444-555555555555",
      },
      created_at: "2026-03-01T10:00:00.000Z",
    });
  });

  test("positive: an explicit requestId becomes request_id, not the document id", () => {
    const row = transformLog(
      "autoGeneratedDocId",
      {
        level: "info",
        requestId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        event: "API_REQUEST",
      },
      UID_MAP,
    );
    assert.equal(row.request_id, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    assert.equal(row.details.firestore_id, "autoGeneratedDocId");
  });

  test("negative: unmapped Firebase UIDs are reported, not written as-is", () => {
    const missing = new Set();
    const row = transformLog("x", { userId: "fbGhost" }, UID_MAP, missing);
    assert.deepEqual([...missing], ["fbGhost"]);
    assert.equal(row.user_id, null);
  });

  test("negative: an unknown level becomes info and a non-UUID id is not a request_id", () => {
    const row = transformLog("autoId123", { level: "debug" }, UID_MAP);
    assert.equal(row.level, "info");
    assert.equal(row.request_id, null);
    assert.equal(row.details.firestore_id, "autoId123");
  });

  test("edge: the server's 'unknown' placeholder is kept as text and not reported", () => {
    const missing = new Set();
    assert.equal(
      transformLog("x", { userId: "unknown" }, UID_MAP, missing).user_id,
      "unknown",
    );
    assert.equal(missing.size, 0);
    assert.equal(transformLog("x", {}, UID_MAP).user_id, null);
  });
});

describe("toIso and checksum", () => {
  test("toIso accepts every timestamp shape and rejects garbage", () => {
    assert.equal(toIso(ts("2026-01-01T00:00:00Z")), "2026-01-01T00:00:00.000Z");
    assert.equal(
      toIso({ _seconds: 0, _nanoseconds: 0 }),
      "1970-01-01T00:00:00.000Z",
    );
    assert.equal(toIso("2026-01-01"), "2026-01-01T00:00:00.000Z");
    assert.equal(toIso(null), null);
    assert.equal(toIso("not a date"), null);
  });

  test("checksum ignores key order (jsonb reorders keys) but not values", () => {
    assert.equal(
      checksum([{ a: 1, b: { c: 2, d: [3] } }]),
      checksum([{ b: { d: [3], c: 2 }, a: 1 }]),
    );
    assert.notEqual(checksum([{ a: 1 }]), checksum([{ a: 2 }]));
    assert.notEqual(checksum([1, 2]), checksum([2, 1]));
  });
});
