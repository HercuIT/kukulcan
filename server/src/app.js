const express = require("express");
require("dotenv").config();
const cors = require("cors");

// La app de Express sin arrancar: index.js la pone a escuchar y las pruebas
// (server/test/app.test.js) la montan en un puerto libre con estos mismos límites y manejador.

// JSON: 5 MB, LIMITS.maxBodyBytes del compilador. XML: 10 MB, LIMITS.maxXmlBytes, el tamaño máximo
// del documento que compile-xml y /api/compile generan para Ignition (el XML ocupa más que su JSON).
const LIMITS = {
  jsonBytes: 5 * 1024 * 1024,
  xmlBytes: 10 * 1024 * 1024,
};

const app = express();
app.use(cors());

app.use(express.json({ limit: LIMITS.jsonBytes }));
app.use(
  express.text({
    type: ["application/xml", "text/xml"],
    limit: LIMITS.xmlBytes,
  }),
);

// --- Uso de las Rutas ---
app.use("/api/health", require("./routes/healthRoutes"));
app.use("/api/ignition-health", require("./routes/ignitionHealthRoutes"));
app.use("/api/compile", require("./routes/compileRoutes"));
app.use("/api/deploy-workflow", require("./routes/deployWorkflowRoutes"));

const toMb = (bytes) => Math.round(bytes / (1024 * 1024));

// Express reconoce el manejador de errores por sus 4 argumentos.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large" || err.status === 413) {
    return res.status(413).json({
      status: "ERROR",
      message: `Payload Too Large. The maximum body size is ${toMb(err.limit ?? LIMITS.jsonBytes)} MB.`,
    });
  }
  if (err instanceof SyntaxError || err.status === 400) {
    return res.status(400).json({
      status: "ERROR",
      message: "Bad Request. The XML has a syntax error.",
      cause: err.message,
    });
  }

  return res.status(500).json({
    status: "ERROR",
    message: "Internal Server Error",
    cause: "An unexpected error occurred on the server.",
  });
});

module.exports = app;
module.exports.LIMITS = LIMITS;
