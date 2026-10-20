const path = require("path");
const { pathToFileURL } = require("url");
const express = require("express");
const router = express.Router();

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
// El tamaño máximo (5 MB, LIMITS.maxBodyBytes del compilador) lo aplica express.json en index.js.
router.post("/", express.json({ limit: "5mb" }), async (req, res) => {
  let compiler;
  try {
    compiler = await loadCompiler();
  } catch (e) {
    return res.status(500).json({
      message: "Compilador no disponible",
      error: String(e),
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
