const express = require("express");
require("dotenv").config();
const cors = require("cors");

const app = express();
const PORT = 3001;
app.use(cors());

// 5 MB, el límite del compilador (LIMITS.maxBodyBytes); antes era el de Express (100 kB).
app.use(express.json({ limit: "5mb" }));
app.use(express.text({ type: ["application/xml", "text/xml"], limit: "5mb" }));

// --- Uso de las Rutas ---
app.use("/api/health", require("./routes/healthRoutes"));
app.use("/api/ignition-health", require("./routes/ignitionHealthRoutes"));
app.use("/api/compile", require("./routes/compileRoutes"));
app.use("/api/deploy-workflow", require("./routes/deployWorkflowRoutes"));

// Express reconoce el manejador de errores por sus 4 argumentos.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large" || err.status === 413) {
    return res.status(413).json({
      status: "ERROR",
      message: "Payload Too Large. The maximum body size is 5 MB.",
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

// --- Iniciar el Servidor ---
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Servidor corriendo SOLO en http://localhost:${PORT}`);
});
