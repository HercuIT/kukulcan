import { supabase } from "./supabaseClient";
import {
  addPredefinedChild,
  buildDefinitionTree,
  createDefinition,
  deleteDefinition,
  expandForCanvas,
  searchKeepIds,
  visibleRows,
  listDefinitions,
  moveDefinition,
  pathOf,
  predefinedKeyFor,
  subscribeToDefinitions,
  subtreeIds,
  updateDefinition,
} from "./definitionsApi";

jest.mock("./supabaseClient", () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    channel: jest.fn(),
    removeChannel: jest.fn(),
  },
}));

const def = (id, parentId, name, position = 0, extra = {}) => ({
  id,
  parentId,
  kind: "user",
  name,
  version: "1.0",
  parameters: [],
  implementation: {},
  predefined: null,
  position,
  ...extra,
});

function query(result) {
  const chain = {};
  for (const m of ["select", "order"]) chain[m] = jest.fn(() => chain);
  chain.then = (resolve, reject) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

// Cadena lineal de n definiciones: d0 → d1 → … → d(n-1).
const chain = (n) =>
  Array.from({ length: n }, (_, i) =>
    def(`d${i}`, i === 0 ? null : `d${i - 1}`, `Level ${i + 1}`),
  );

beforeEach(() => jest.clearAllMocks());

describe("definitionsApi", () => {
  describe("positive", () => {
    test("buildDefinitionTree nests rows and orders siblings by position", () => {
      const { roots, byId } = buildDefinitionTree([
        def("b", null, "B", 1),
        def("a", null, "A", 0),
        def("a2", "a", "A2", 1),
        def("a1", "a", "A1", 0),
      ]);
      expect(roots.map((n) => n.id)).toEqual(["a", "b"]);
      expect(byId.get("a").children.map((n) => n.id)).toEqual(["a1", "a2"]);
    });

    test("visibleRows enters only expanded nodes and puts groups after the children", () => {
      const { roots } = buildDefinitionTree([
        def("a", null, "A"),
        def("a1", "a", "A1"),
        def("a1x", "a1", "A1x"),
        def("b", null, "B", 1),
      ]);
      expect(
        visibleRows(roots, new Set(["a"])).map(
          ({ type, node, depth }) => `${type}:${node.id}:${depth}`,
        ),
      ).toEqual([
        "definition:a:0",
        "definition:a1:1",
        "groups:a:1",
        "definition:b:0",
      ]);
    });

    test("searchKeepIds keeps matches and their ancestors", () => {
      const { roots, byId } = buildDefinitionTree([
        def("l", null, "Line 1"),
        def("m", "l", "Mixer A"),
        def("d", "m", "Dosing"),
        def("o", null, "Other"),
      ]);
      const keep = searchKeepIds(byId, " dos ");
      expect([...keep].sort()).toEqual(["d", "l", "m"]);
      expect(
        visibleRows(roots, keep, keep)
          .filter((r) => r.type === "definition")
          .map((r) => r.node.id),
      ).toEqual(["l", "m", "d"]);
      expect(searchKeepIds(byId, "  ").size).toBe(0);
    });

    test("pathOf, subtreeIds and predefinedKeyFor", () => {
      const { byId } = buildDefinitionTree([
        def("l", null, "Line 1"),
        def("m", "l", "Mixer A"),
        def("d", "m", "Dosing"),
      ]);
      expect(pathOf(byId, "d")).toEqual(["Line 1", "Mixer A", "Dosing"]);
      expect([...subtreeIds(byId.get("m"))]).toEqual(["m", "d"]);
      expect(
        predefinedKeyFor({
          label: "x",
          procedurePhase: "Mixing",
          operation: "Add Ingredient",
        }),
      ).toBe("pair:Mixing|Add Ingredient");
      expect(predefinedKeyFor({ label: "Procedure Phase" })).toBe(
        "level:Procedure Phase",
      );
    });

    test("expandForCanvas places the subtree in pre-order, stacked and chained", () => {
      const { byId } = buildDefinitionTree([
        def("l", null, "Line 1", 0, {
          parameters: [{ name: "Speed", dataType: "REAL", defaultValue: "1" }],
          implementation: { program: "MainProgram" },
        }),
        def("m", "l", "Mixer A", 0),
        def("p", "l", "Mixing - Add Ingredient", 1, {
          kind: "predefined",
          predefined: {
            key: "pair:Mixing|Add Ingredient",
            label: "Mixing - Add Ingredient",
            procedurePhase: "Mixing",
            operation: "Add Ingredient",
          },
        }),
      ]);
      const { nodes, connections } = expandForCanvas(byId.get("l"), {
        x: 100,
        y: 50,
        basePath: ["Site"],
        makeId: (i) => `n${i}`,
      });
      expect(nodes.map((n) => [n.id, n.label, n.x, n.y])).toEqual([
        ["n0", "Line 1 v 1.0", 100, 50],
        ["n1", "Mixer A v 1.0", 140, 150],
        ["n2", "Mixing - Add Ingredient", 140, 250],
      ]);
      expect(nodes[0]).toMatchObject({
        type: "Line 1",
        definitionId: "l",
        definitionPath: ["Site", "Line 1"],
        implementation: { program: "MainProgram" },
      });
      expect(nodes[1].definitionPath).toEqual(["Site", "Line 1", "Mixer A"]);
      expect(nodes[2]).toMatchObject({
        procedurePhase: "Mixing",
        operation: "Add Ingredient",
      });
      expect(connections.map((c) => [c.from, c.to])).toEqual([
        ["n0", "n1"],
        ["n1", "n2"],
      ]);
    });

    test("expandForCanvas copies parameters instead of sharing them", () => {
      const params = [{ name: "Speed", value: "1" }];
      const { byId } = buildDefinitionTree([
        def("l", null, "L", 0, { parameters: params }),
      ]);
      const { nodes } = expandForCanvas(byId.get("l"), { makeId: (i) => i });
      nodes[0].parameters[0].value = "changed";
      expect(params[0].value).toBe("1");
    });

    test("RPC wrappers send the right arguments", async () => {
      supabase.rpc.mockResolvedValue({ data: "new-id", error: null });
      await expect(createDefinition(null, { name: "A" })).resolves.toBe(
        "new-id",
      );
      expect(supabase.rpc).toHaveBeenLastCalledWith("create_definition", {
        parent: null,
        fields: { name: "A" },
      });
      await addPredefinedChild("p", { key: "k", label: "L" });
      expect(supabase.rpc).toHaveBeenLastCalledWith("add_predefined_child", {
        parent: "p",
        predefined: { key: "k", label: "L" },
      });
      await updateDefinition("d", { name: "B" });
      expect(supabase.rpc).toHaveBeenLastCalledWith("update_definition", {
        def: "d",
        fields: { name: "B" },
      });
      await moveDefinition("d", undefined, 2);
      expect(supabase.rpc).toHaveBeenLastCalledWith("move_definition", {
        def: "d",
        new_parent: null,
        new_index: 2,
      });
      await deleteDefinition("d", true);
      expect(supabase.rpc).toHaveBeenLastCalledWith("delete_definition", {
        def: "d",
        keep_children: true,
      });
    });

    test("listDefinitions maps rows", async () => {
      supabase.from.mockReturnValue(
        query({
          data: [
            {
              id: "a",
              parent_id: null,
              kind: "user",
              name: "A",
              version: "1.0",
              position: 0,
            },
          ],
          error: null,
        }),
      );
      await expect(listDefinitions()).resolves.toEqual([
        expect.objectContaining({ id: "a", parentId: null, parameters: [] }),
      ]);
    });
  });

  describe("negative", () => {
    test("RPC errors keep the rule hint for the UI", async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: { code: "P0001", message: "ciclo", hint: "cycle" },
      });
      await expect(moveDefinition("a", "b")).rejects.toMatchObject({
        code: "failed-precondition",
        hint: "cycle",
      });
    });

    test("an orphan row is shown at the top level and logged", () => {
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
      const { roots } = buildDefinitionTree([def("o", "missing", "Orphan")]);
      expect(roots.map((n) => n.id)).toEqual(["o"]);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    test("pathOf stops on corrupted parent loops", () => {
      const byId = new Map([
        ["a", { id: "a", parentId: "b", name: "A" }],
        ["b", { id: "b", parentId: "a", name: "B" }],
      ]);
      expect(pathOf(byId, "a")).toEqual(["B", "A"]);
    });
  });

  describe("edge", () => {
    test("1,000-level chain: builds, flattens, paths and expands without recursion errors", () => {
      const rows = chain(1000);
      const { roots, byId } = buildDefinitionTree(rows);
      const all = new Set(rows.map((r) => r.id));
      expect(
        visibleRows(roots, all).filter((r) => r.type === "definition"),
      ).toHaveLength(1000);
      expect(pathOf(byId, "d999")).toHaveLength(1000);
      const { nodes, connections } = expandForCanvas(roots[0], {
        makeId: (i) => `n${i}`,
      });
      expect(nodes).toHaveLength(1000);
      expect(connections).toHaveLength(999);
      // La sangría deja de crecer después de 8 niveles.
      expect(nodes[999].x).toBe(8 * 40);
      expect(nodes[999].definitionPath).toHaveLength(1000);
    });

    test("empty input gives an empty tree", () => {
      expect(buildDefinitionTree([]).roots).toEqual([]);
      expect(visibleRows([], new Set())).toEqual([]);
    });

    test("subscribeToDefinitions loads, reloads on change and stops on unsubscribe", async () => {
      let onChange;
      const channel = {
        on: jest.fn((_t, _f, cb) => {
          onChange = cb;
          return channel;
        }),
        subscribe: jest.fn(() => channel),
      };
      supabase.channel.mockReturnValue(channel);
      supabase.from.mockImplementation(() => query({ data: [], error: null }));
      const cb = jest.fn();
      const stop = subscribeToDefinitions(cb);
      await new Promise((r) => setTimeout(r, 0));
      onChange();
      await new Promise((r) => setTimeout(r, 0));
      expect(cb).toHaveBeenCalledTimes(2);
      stop();
      onChange();
      await new Promise((r) => setTimeout(r, 0));
      expect(cb).toHaveBeenCalledTimes(2);
      expect(supabase.removeChannel).toHaveBeenCalledWith(channel);
    });
  });
});
