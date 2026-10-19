jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({ fake: true })),
}));

const ORIGINAL_ENV = process.env;

function loadClient(env) {
  process.env = { ...ORIGINAL_ENV, ...env };
  // isolateModules usa un registro nuevo: el mock de createClient se lee desde ahí mismo.
  const result = {};
  jest.isolateModules(() => {
    result.createClient = require("@supabase/supabase-js").createClient;
    try {
      result.supabase = require("./supabaseClient").supabase;
    } catch (error) {
      result.error = error;
    }
  });
  return result;
}

afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.clearAllMocks();
});

describe("supabaseClient", () => {
  test("positive: builds the client from the two environment variables", () => {
    const { supabase, createClient } = loadClient({
      REACT_APP_SUPABASE_URL: "https://abc.supabase.co",
      REACT_APP_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
    });
    expect(supabase).toEqual({ fake: true });
    expect(createClient).toHaveBeenCalledWith(
      "https://abc.supabase.co",
      "sb_publishable_x",
    );
  });

  test("negative: a missing variable fails with a message naming both and .env.example", () => {
    const { error, createClient } = loadClient({
      REACT_APP_SUPABASE_URL: "https://abc.supabase.co",
      REACT_APP_SUPABASE_PUBLISHABLE_KEY: "",
    });
    expect(error.message).toMatch(
      /REACT_APP_SUPABASE_PUBLISHABLE_KEY.*\.env\.example/,
    );
    expect(createClient).not.toHaveBeenCalled();
  });

  test("edge: both variables unset fails the same way", () => {
    const { error } = loadClient({
      REACT_APP_SUPABASE_URL: undefined,
      REACT_APP_SUPABASE_PUBLISHABLE_KEY: undefined,
    });
    expect(error.message).toMatch(/REACT_APP_SUPABASE_URL/);
  });
});
