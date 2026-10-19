const { getSupabaseAdmin } = require("./supabaseAdmin");

/**
 * Devuelve el id del usuario de Supabase dueño del token "Authorization: Bearer …",
 * o "unknown" si no hay token o no es válido. Solo se usa para registrar quién despliega.
 */
async function getRequestUserId(req, getClient = getSupabaseAdmin) {
  const header = req.headers?.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return "unknown";
  try {
    const { data, error } = await getClient().auth.getUser(match[1]);
    if (error || !data?.user) return "unknown";
    return data.user.id;
  } catch {
    return "unknown";
  }
}

module.exports = { getRequestUserId };
