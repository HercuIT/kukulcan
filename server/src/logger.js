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
