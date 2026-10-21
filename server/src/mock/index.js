const { createOpennessMockApp } = require("./opennessMockApp");

// Standalone runner for the TIA Portal Openness mock (see opennessMockApp.js). Separate port
// and process from the real server (server/src/index.js) — this never ships, it only exists so
// the Siemens XML contract can be tested before a real Openness server exists (HTE-110).
const PORT = Number(process.env.MOCK_SIEMENS_PORT) || 4100;
const app = createOpennessMockApp();

app.listen(PORT, "127.0.0.1", () => {
  console.log(
    `Siemens Openness mock server running on http://127.0.0.1:${PORT}`,
  );
});
