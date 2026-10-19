import {
  cleanNodes,
  profileToUser,
  rowToWorkflow,
  toAppError,
  toAppUser,
} from "./mappers";

const ROW = {
  id: "wf-1",
  name: "Linea 1",
  nodes: [{ id: "n1", type: "start" }],
  status: "changes_requested",
  version: 3,
  checkout_description: "Ajuste",
  assigned_reviewer_id: null,
  approved_by: null,
  deployed_by: null,
  created_by: "u-1",
  created_at: "2026-10-01T10:00:00Z",
  last_modified_by: "u-2",
  last_modified_at: "2026-10-02T10:00:00Z",
  workflow_designers: [{ user_id: "u-1" }, { user_id: "u-2" }],
  workflow_history: [
    {
      kind: "checkout",
      description: "segundo",
      user_id: "u-2",
      created_at: "2026-10-03T00:00:00Z",
    },
    {
      kind: "changes_requested",
      description: "Falta End",
      user_id: "u-3",
      created_at: "2026-10-02T12:00:00Z",
    },
    {
      kind: "checkout",
      description: "primero",
      user_id: "u-1",
      created_at: "2026-10-01T00:00:00Z",
    },
  ],
};

describe("mappers", () => {
  describe("positive", () => {
    test("rowToWorkflow returns the legacy Firestore shape", () => {
      const wf = rowToWorkflow(ROW);
      expect(wf).toMatchObject({
        id: "wf-1",
        name: "Linea 1",
        content: { nodes: [{ id: "n1", type: "start" }] },
        metadata: {
          status: "changes_requested",
          version: 3,
          createdBy: "u-1",
          lastModifiedAt: "2026-10-02T10:00:00Z",
          lastModifiedBy: "u-2",
          designerIds: ["u-1", "u-2"],
          assignedReviewerId: null,
          checkoutDescription: "Ajuste",
        },
      });
    });

    test("checkout history is oldest first and change requests are separate", () => {
      const { metadata } = rowToWorkflow(ROW);
      expect(metadata.history.map((h) => h.description)).toEqual([
        "primero",
        "segundo",
      ]);
      expect(metadata.history[0]).toEqual({
        kind: "checkout",
        description: "primero",
        userId: "u-1",
        created_at: "2026-10-01T00:00:00Z",
      });
      expect(metadata.changeRequests).toHaveLength(1);
    });

    test("toAppUser and profileToUser keep the shapes components use", () => {
      expect(toAppUser({ id: "u-1", email: "a@b.c", role: "x" })).toEqual({
        uid: "u-1",
        email: "a@b.c",
      });
      expect(
        profileToUser({ id: "u-1", email: "a@b.c", reviewer: true }),
      ).toEqual({ uid: "u-1", email: "a@b.c", isReviewer: true });
    });
  });

  describe("negative", () => {
    test.each([
      ["28000", "unauthenticated"],
      ["PGRST301", "unauthenticated"],
      ["42501", "permission-denied"],
      ["P0002", "not-found"],
      ["P0001", "failed-precondition"],
      ["invalid_credentials", "invalid-credentials"],
      ["user_already_exists", "email-in-use"],
      ["email_exists", "email-in-use"],
    ])("toAppError maps %s to %s and keeps the message", (code, appCode) => {
      const err = toAppError({ code, message: "No eres el revisor asignado." });
      expect(err).toBeInstanceOf(Error);
      expect(err.code).toBe(appCode);
      expect(err.message).toBe("No eres el revisor asignado.");
    });

    test("unknown codes pass through and a missing message uses the fallback", () => {
      const err = toAppError({ code: "XX000" }, "Algo falló");
      expect(err.code).toBe("XX000");
      expect(err.message).toBe("Algo falló");
    });
  });

  describe("edge", () => {
    test("null inputs give null", () => {
      expect(toAppError(null)).toBeNull();
      expect(toAppUser(null)).toBeNull();
      expect(rowToWorkflow(null)).toBeNull();
    });

    test("a row without embeds or nodes gets empty arrays", () => {
      const wf = rowToWorkflow({ id: "x", name: "x", nodes: null });
      expect(wf.content.nodes).toEqual([]);
      expect(wf.metadata.designerIds).toEqual([]);
      expect(wf.metadata.history).toEqual([]);
      expect(wf.metadata.assignedReviewerId).toBeNull();
    });

    test("cleanNodes drops undefined values but keeps null, 0 and empty strings", () => {
      expect(
        cleanNodes([{ id: "a", x: undefined, y: 0, label: "", parent: null }]),
      ).toEqual([{ id: "a", y: 0, label: "", parent: null }]);
      expect(cleanNodes()).toEqual([]);
    });
  });
});
