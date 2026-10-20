// Correr con: npm run test:node (desde la raíz)
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { createLogger, summarizeBody, toRow } = require("../src/logger");
const { getRequestUserId } = require("../src/requestUser");

// Cliente falso de Supabase que guarda las filas insertadas.
function fakeClient({ insertError, throws } = {}) {
  const rows = [];
  return {
    rows,
    get: () => {
      if (throws) throw new Error(throws);
      return {
        from: (table) => ({
          insert: async (row) => {
            rows.push({ table, row });
            return { error: insertError || null };
          },
        }),
      };
    },
  };
}

function silenceConsoleError(fn) {
  const original = console.error;
  const calls = [];
  console.error = (...args) => calls.push(args);
  return Promise.resolve(fn())
    .finally(() => {
      console.error = original;
    })
    .then(() => calls);
}

describe("logger", () => {
  describe("positive", () => {
    test("writes one server_logs row per event with known fields as columns", async () => {
      const client = fakeClient();
      const logger = createLogger(client.get);
      await logger.info({
        requestId: "11111111-1111-1111-1111-111111111111",
        event: "API_REQUEST",
        workflowId: "W-1",
        userId: "u-1",
        method: "POST",
      });
      await logger.warn({
        requestId: "11111111-1111-1111-1111-111111111111",
        event: "BAD_REQUEST",
      });
      assert.equal(client.rows.length, 2);
      assert.deepEqual(client.rows[0], {
        table: "server_logs",
        row: {
          level: "info",
          event: "API_REQUEST",
          request_id: "11111111-1111-1111-1111-111111111111",
          workflow_id: "W-1",
          user_id: "u-1",
          details: { method: "POST" },
        },
      });
      assert.equal(client.rows[1].row.level, "warn");
    });
  });

  describe("negative", () => {
    test("an insert error is logged to the console, not thrown", async () => {
      const client = fakeClient({ insertError: { message: "db down" } });
      const calls = await silenceConsoleError(() =>
        createLogger(client.get).error({ event: "X" }),
      );
      assert.equal(calls.length, 1);
      assert.match(calls[0][1], /db down/);
    });

    test("missing Supabase config is logged to the console, not thrown", async () => {
      const client = fakeClient({ throws: "Faltan SUPABASE_URL" });
      const calls = await silenceConsoleError(() =>
        createLogger(client.get).info({ event: "X" }),
      );
      assert.match(calls[0][1], /Faltan SUPABASE_URL/);
    });
  });

  describe("edge", () => {
    test("undefined fields are dropped and an empty event gives null columns", () => {
      assert.deepEqual(toRow("info", { event: "E", body: undefined }), {
        level: "info",
        event: "E",
        request_id: null,
        workflow_id: null,
        user_id: null,
        details: null,
      });
      assert.equal(toRow("info", undefined).event, null);
    });
  });
});

describe("getRequestUserId", () => {
  // El cliente falso exige recibir exactamente el token del encabezado.
  const client = (result, expectedToken) => () => ({
    auth: {
      getUser: async (token) => {
        assert.equal(token, expectedToken);
        return result;
      },
    },
  });

  test("positive: returns the Supabase user id for a valid bearer token", async () => {
    const req = { headers: { authorization: "Bearer abc" } };
    assert.equal(
      await getRequestUserId(
        req,
        client({ data: { user: { id: "u-9" } }, error: null }, "abc"),
      ),
      "u-9",
    );
  });

  test("negative: an invalid token gives unknown", async () => {
    const req = { headers: { authorization: "Bearer bad" } };
    assert.equal(
      await getRequestUserId(
        req,
        client(
          { data: { user: null }, error: { message: "invalid JWT" } },
          "bad",
        ),
      ),
      "unknown",
    );
  });

  test("edge: no header, a non-bearer header or a failing client gives unknown", async () => {
    const throwing = () => {
      throw new Error("no config");
    };
    assert.equal(await getRequestUserId({ headers: {} }, throwing), "unknown");
    assert.equal(
      await getRequestUserId(
        { headers: { authorization: "Basic xyz" } },
        throwing,
      ),
      "unknown",
    );
    assert.equal(
      await getRequestUserId(
        { headers: { authorization: "Bearer t" } },
        throwing,
      ),
      "unknown",
    );
  });
});

describe("summarizeBody (request bodies in server_logs)", () => {
  test("positive: a small body is kept whole with its size", () => {
    assert.deepEqual(summarizeBody("<Workflow/>"), {
      bodyBytes: 11,
      bodyPreview: "<Workflow/>",
    });
  });

  test("negative: a large body is cut to a preview and flagged, size still exact", () => {
    const big = "ñ".repeat(3000);
    const s = summarizeBody(big);
    assert.equal(s.bodyBytes, 6000);
    assert.equal(s.bodyPreview.length, 2000);
    assert.equal(s.bodyTruncated, true);
  });

  test("edge: missing bodies and objects", () => {
    assert.deepEqual(summarizeBody(undefined), { bodyBytes: 0 });
    assert.deepEqual(summarizeBody(null), { bodyBytes: 0 });
    assert.deepEqual(summarizeBody({ a: 1 }), {
      bodyBytes: 7,
      bodyPreview: '{"a":1}',
    });
    assert.deepEqual(summarizeBody("abc", 3), {
      bodyBytes: 3,
      bodyPreview: "abc",
    });
  });
});
