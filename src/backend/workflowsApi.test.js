import { supabase } from "./supabaseClient";
import {
  addDesigner,
  approveWorkflow,
  assignReviewer,
  checkoutWorkflow,
  compileWorkflow,
  createWorkflow,
  getWorkflow,
  listMyWorkflows,
  listUsers,
  removeDesigner,
  requestChanges,
  saveWorkflow,
  submitForReview,
  subscribeToWorkflow,
} from "./workflowsApi";

jest.mock("./supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    channel: jest.fn(),
    removeChannel: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

// Cadena de PostgREST falsa: cada método devuelve la cadena y al final resuelve `result`.
function query(result) {
  const chain = {};
  for (const m of ["select", "insert", "update", "eq", "maybeSingle"]) {
    chain[m] = jest.fn(() => chain);
  }
  chain.then = (resolve, reject) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

const ROW = {
  id: "wf-1",
  name: "Linea 1",
  nodes: [{ id: "n1" }],
  status: "draft",
  version: 1,
  workflow_designers: [{ user_id: "u-1" }],
  workflow_history: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  // jsdom no trae Web Crypto; el navegador sí.
  Object.defineProperty(global, "crypto", {
    value: { randomUUID: jest.fn(() => "new-id") },
    configurable: true,
  });
});

describe("workflowsApi", () => {
  describe("positive", () => {
    test("createWorkflow inserts with a client id and cleaned nodes", async () => {
      const chain = query({ data: null, error: null });
      supabase.from.mockReturnValue(chain);
      await expect(
        createWorkflow({ name: "WF", nodes: [{ id: "a", x: undefined }] }),
      ).resolves.toBe("new-id");
      expect(supabase.from).toHaveBeenCalledWith("workflows");
      expect(chain.insert).toHaveBeenCalledWith({
        id: "new-id",
        name: "WF",
        nodes: [{ id: "a" }],
      });
    });

    test("saveWorkflow updates only the content", async () => {
      const chain = query({ data: [{ id: "wf-1" }], error: null });
      supabase.from.mockReturnValue(chain);
      await saveWorkflow("wf-1", { nodes: [{ id: "a" }] });
      expect(chain.update).toHaveBeenCalledWith({ nodes: [{ id: "a" }] });
      expect(chain.eq).toHaveBeenCalledWith("id", "wf-1");
    });

    test("getWorkflow returns the legacy shape", async () => {
      supabase.from.mockReturnValue(query({ data: ROW, error: null }));
      const wf = await getWorkflow("wf-1");
      expect(wf.content.nodes).toEqual([{ id: "n1" }]);
      expect(wf.metadata.designerIds).toEqual(["u-1"]);
    });

    test("listMyWorkflows uses approved workflows for deployers and my_workflows otherwise", async () => {
      const deployerChain = query({ data: [ROW], error: null });
      supabase.from.mockReturnValue(deployerChain);
      await expect(listMyWorkflows("deployer")).resolves.toHaveLength(1);
      expect(deployerChain.eq).toHaveBeenCalledWith("status", "approved");

      const rpcChain = query({ data: [ROW, ROW], error: null });
      supabase.rpc.mockReturnValue(rpcChain);
      await expect(listMyWorkflows("designer")).resolves.toHaveLength(2);
      expect(supabase.rpc).toHaveBeenCalledWith("my_workflows");
    });

    test.each([
      [
        () => submitForReview("wf", "r"),
        "submit_for_review",
        { wf: "wf", reviewer: "r" },
      ],
      [
        () => assignReviewer("wf", "r"),
        "assign_reviewer",
        { wf: "wf", reviewer: "r" },
      ],
      [() => approveWorkflow("wf"), "approve_workflow", { wf: "wf" }],
      [
        () => requestChanges("wf", "c"),
        "request_changes",
        { wf: "wf", comment: "c" },
      ],
      [
        () => addDesigner("wf", "a@b.c"),
        "add_designer",
        { wf: "wf", email: "a@b.c" },
      ],
      [
        () => removeDesigner("wf", "u"),
        "remove_designer",
        { wf: "wf", member: "u" },
      ],
      [
        () => checkoutWorkflow("wf", "d"),
        "checkout_workflow",
        { wf: "wf", description: "d" },
      ],
    ])("RPC wrapper calls %#", async (call, fn, args) => {
      supabase.rpc.mockResolvedValue({ data: null, error: null });
      await call();
      expect(supabase.rpc).toHaveBeenCalledWith(fn, args);
    });

    test("listUsers maps profiles", async () => {
      supabase.from.mockReturnValue(
        query({
          data: [{ id: "u", email: "a@b.c", reviewer: true }],
          error: null,
        }),
      );
      await expect(listUsers()).resolves.toEqual([
        { uid: "u", email: "a@b.c", isReviewer: true },
      ]);
    });

    test("compileWorkflow returns the XML as a Blob", async () => {
      supabase.functions.invoke.mockResolvedValue({
        data: "<xml/>",
        error: null,
      });
      const blob = await compileWorkflow({ nodes: [] });
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("application/xml");
      expect(supabase.functions.invoke).toHaveBeenCalledWith("compile-xml", {
        body: { nodes: [] },
      });
    });
  });

  describe("negative", () => {
    test("RPC errors reject with the app code and the database message", async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: { code: "42501", message: "No eres el revisor asignado." },
      });
      await expect(approveWorkflow("wf")).rejects.toMatchObject({
        code: "permission-denied",
        message: "No eres el revisor asignado.",
      });
    });

    test("saveWorkflow treats zero updated rows as permission-denied", async () => {
      supabase.from.mockReturnValue(query({ data: [], error: null }));
      await expect(saveWorkflow("wf-1", { nodes: [] })).rejects.toMatchObject({
        code: "permission-denied",
      });
    });

    test("createWorkflow surfaces RLS rejections", async () => {
      supabase.from.mockReturnValue(
        query({ data: null, error: { code: "42501", message: "RLS" } }),
      );
      await expect(
        createWorkflow({ name: "x", nodes: [] }),
      ).rejects.toMatchObject({
        code: "permission-denied",
      });
    });

    test("compileWorkflow lists the compiler errors", async () => {
      supabase.functions.invoke.mockResolvedValue({
        data: null,
        error: {
          message: "Edge Function returned a non-2xx status code",
          context: {
            json: async () => ({
              message: "Fallo de compilación",
              errors: ["Falta End", "Begin sin salida"],
            }),
          },
        },
      });
      await expect(compileWorkflow({})).rejects.toThrow(
        "Fallo de compilación\n- Falta End\n- Begin sin salida",
      );
    });

    test("compileWorkflow falls back to the transport message without a JSON body", async () => {
      supabase.functions.invoke.mockResolvedValue({
        data: null,
        error: { message: "Failed to send a request", context: undefined },
      });
      await expect(compileWorkflow({})).rejects.toThrow(
        "Failed to send a request",
      );
    });
  });

  describe("edge", () => {
    test("getWorkflow returns null for a missing workflow", async () => {
      supabase.from.mockReturnValue(query({ data: null, error: null }));
      await expect(getWorkflow("nope")).resolves.toBeNull();
    });

    test("empty reviewer selections are sent as null", async () => {
      supabase.rpc.mockResolvedValue({ data: null, error: null });
      await assignReviewer("wf", "");
      expect(supabase.rpc).toHaveBeenCalledWith("assign_reviewer", {
        wf: "wf",
        reviewer: null,
      });
    });

    test("saveWorkflow sends the name only when given", async () => {
      const chain = query({ data: [{ id: "wf" }], error: null });
      supabase.from.mockReturnValue(chain);
      await saveWorkflow("wf", { nodes: [], name: "Nuevo" });
      expect(chain.update).toHaveBeenCalledWith({ nodes: [], name: "Nuevo" });
    });

    test("subscribeToWorkflow loads now, reloads on change and stops on unsubscribe", async () => {
      let onChange;
      const channel = {
        on: jest.fn((_type, filter, cb) => {
          onChange = cb;
          return channel;
        }),
        subscribe: jest.fn(() => channel),
      };
      supabase.channel.mockReturnValue(channel);
      supabase.from.mockImplementation(() => query({ data: ROW, error: null }));
      const cb = jest.fn();

      const stop = subscribeToWorkflow("wf-1", cb);
      await new Promise((r) => setTimeout(r, 0));
      expect(cb).toHaveBeenCalledTimes(1);
      expect(channel.on.mock.calls[0][1]).toMatchObject({
        table: "workflows",
        filter: "id=eq.wf-1",
      });

      onChange();
      await new Promise((r) => setTimeout(r, 0));
      expect(cb).toHaveBeenCalledTimes(2);

      stop();
      onChange();
      await new Promise((r) => setTimeout(r, 0));
      expect(cb).toHaveBeenCalledTimes(2);
      expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
    });

    test("subscribeToWorkflow reports load errors", async () => {
      const channel = { on: () => channel, subscribe: () => channel };
      supabase.channel.mockReturnValue(channel);
      supabase.from.mockReturnValue(
        query({
          data: null,
          error: { code: "PGRST301", message: "JWT expired" },
        }),
      );
      const onError = jest.fn();
      subscribeToWorkflow("wf-1", jest.fn(), onError);
      await new Promise((r) => setTimeout(r, 0));
      expect(onError.mock.calls[0][0]).toMatchObject({
        code: "unauthenticated",
      });
    });
  });
});
