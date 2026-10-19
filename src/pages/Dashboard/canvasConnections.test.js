import { connectionsForLoadedWorkflow } from "./canvasConnections";

const DEFAULT_NODES = [
  { id: "begin", type: "start" },
  { id: "connection1", type: "connection" },
  { id: "end", type: "end" },
];

describe("connectionsForLoadedWorkflow", () => {
  test("positive: returns the saved connections", () => {
    const saved = [{ id: "c1", from: "a", to: "b" }];
    expect(
      connectionsForLoadedWorkflow({
        nodes: DEFAULT_NODES,
        connections: saved,
      }),
    ).toBe(saved);
  });

  test("negative: a workflow without the default nodes and without saved connections gets none", () => {
    expect(
      connectionsForLoadedWorkflow({ nodes: [{ id: "x" }], connections: [] }),
    ).toEqual([]);
    expect(connectionsForLoadedWorkflow(undefined)).toEqual([]);
  });

  test("edge: an older workflow (no saved connections) gets the default Begin → Connection 1 → End edges", () => {
    expect(
      connectionsForLoadedWorkflow({ nodes: DEFAULT_NODES }).map((c) => [
        c.from,
        c.to,
      ]),
    ).toEqual([
      ["begin", "connection1"],
      ["connection1", "end"],
    ]);
  });
});
