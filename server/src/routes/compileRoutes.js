const path = require("path");
const { pathToFileURL } = require("url");
const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const logger = require("../logger");

// POST /api/compile usa el mismo compilador que la Edge Function compile-xml (un solo compilador;
// ver README → "Ignition XML contract"). Por defecto compila para Ignition: el <Workflow> que acepta
// /api/deploy-workflow. Requiere correr desde un checkout que incluya supabase/.
const COMPILER_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "supabase",
  "functions",
  "compile-xml",
  "compiler.mjs",
);

// Es un módulo ES: se carga una vez y se reutiliza; si falla, el siguiente intento lo reintenta.
let compilerPromise = null;
function loadCompiler() {
  compilerPromise ??= import(pathToFileURL(COMPILER_PATH).href).catch((err) => {
    compilerPromise = null;
    throw err;
  });
  return compilerPromise;
}

const isPlainObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);

// --- Ruta POST /api/compile ---
// El tamaño máximo (5 MB, LIMITS.maxBodyBytes del compilador) lo aplica express.json en app.js.
router.post("/", express.json({ limit: "5mb" }), async (req, res) => {
  const requestId = uuidv4();
  let compiler;
  try {
    compiler = await loadCompiler();
  } catch (e) {
    // The raw error can contain a local filesystem path (COMPILER_PATH); keep it in the
    // server log only, never in the response sent to the client.
    logger.error({
      requestId,
      event: "COMPILER_LOAD_FAILED",
      route: req.originalUrl,
      message: `Failed to load compiler.mjs: ${e.message}`,
    });
    return res.status(500).json({
      message: "Compilador no disponible. Verifica el checkout del servidor.",
    });
  }

  const body = isPlainObject(req.body) ? req.body : {};
  const result = compiler.compileRequest({
    ...body,
    target: body.target ?? "ignition",
  });

  if (result.status !== 200) {
    return res.status(result.status).json(result.json);
  }

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${result.filename}"`,
  );
  res.setHeader("X-Compiler", "local"); // <-- header para saber que vino del backend local
  return res.send(result.xml);
});

module.exports = router;
