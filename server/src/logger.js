const { getSupabaseAdmin } = require("./supabaseAdmin");

function cleanUndefined(obj) {
  return Object.fromEntries(
    Object.entries(obj || {}).filter(([, v]) => v !== undefined),
  );
}

// Un evento → una fila de server_logs. Los campos sin columna propia van en details.
function toRow(level, logObj) {
  const { requestId, event, workflowId, userId, ...rest } =
    cleanUndefined(logObj);
  return {
    level,
    event: event ?? null,
    request_id: requestId ?? null,
    workflow_id: workflowId ?? null,
    user_id: userId ?? null,
    details: Object.keys(rest).length ? rest : null,
  };
}

// Resumen de un cuerpo de petición para el log: tamaño y los primeros caracteres. Un cuerpo puede
// pesar megas (hasta el límite de la app), y guardarlo entero en server_logs llenaría la base.
const BODY_PREVIEW_CHARS = 2000;
function summarizeBody(body, maxChars = BODY_PREVIEW_CHARS) {
  if (body === undefined || body === null) return { bodyBytes: 0 };
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const summary = {
    bodyBytes: Buffer.byteLength(text, "utf8"),
    bodyPreview: text.slice(0, maxChars),
  };
  if (text.length > maxChars) summary.bodyTruncated = true;
  return summary;
}

// Un fallo al guardar el log se reporta en consola y nunca se propaga a la ruta.
function createLogger(getClient = getSupabaseAdmin) {
  const write = async (level, logObj) => {
    try {
      const { error } = await getClient()
        .from("server_logs")
        .insert(toRow(level, logObj));
      if (error) throw error;
    } catch (err) {
      console.error("No se pudo guardar el log en server_logs:", err.message);
    }
  };

  return {
    info: (logObj) => write("info", logObj),
    warn: (logObj) => write("warn", logObj),
    error: (logObj) => write("error", logObj),
  };
}

module.exports = createLogger();
module.exports.createLogger = createLogger;
module.exports.toRow = toRow;
module.exports.summarizeBody = summarizeBody;
